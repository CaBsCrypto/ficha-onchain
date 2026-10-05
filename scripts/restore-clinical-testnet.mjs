/** Explicit maintenance for known synthetic Week 1 entries. --inspect never
 * signs or writes. --restore requires the isolated write flag and preserves
 * the selected footprint before signing, so restart never selects a new intent. */
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { Address, BASE_FEE, Keypair, Networks, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { buildClinicalRestoration } from './lib/clinical-restoration-plan.mjs';
import { createClinicalTransactionRunner } from './lib/clinical-chain-write.mjs';
import { clinicalAttemptStore } from './lib/clinical-attempt-store.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { clinicalLocalSecrets } from './lib/clinical-local-secrets.mjs';
import { createClinicalChainReader } from './lib/clinical-chain-read.mjs';

const local = '.trustleaf-local/sow2-clinical';
const evidence = 'docs/evidence/sow2-week1-2026-10-05';
const journalFile = local + '/restoration.json';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const fail = () => new Error('clinical_restoration_unavailable');
function save(file, value) {
  const fd = fs.openSync(file + '.tmp', 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(file + '.tmp', file);
}
function knownKeys(deployment, state) {
  const address = new Address(deployment.contractId).toScAddress();
  const bytes = v => { if (!/^[a-f0-9]{64}$/.test(v)) throw fail(); return nativeToScVal(Buffer.from(v, 'hex')); };
  const wallet = v => new Address(v).toScVal();
  const key = value => xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: address, key: value, durability: xdr.ContractDataDurability.persistent(),
  }));
  const variant = (name, ...values) => key(xdr.ScVal.scvVec([nativeToScVal(name, { type: 'symbol' }), ...values]));
  const keys = [key(xdr.ScVal.scvLedgerKeyContractInstance()),
    xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(deployment.wasmHash, 'hex') })),
    variant('History', bytes(state.historyId)), variant('Patient', wallet(state.patient)),
    variant('Grant', bytes(state.historyId), wallet(state.doctor))];
  for (const record of Object.values(state.records)) {
    const c = record.context;
    if (c.contractId !== deployment.contractId || c.historyId !== state.historyId || c.patient !== state.patient) throw fail();
    keys.push(variant('Entry', bytes(c.historyId), bytes(c.entryId)),
      variant('Version', bytes(c.historyId), bytes(c.entryId), nativeToScVal(c.version, { type: 'u32' })));
  }
  for (const [name, id] of Object.entries(state.operations)) {
    const actor = name.startsWith('append_') || name === 'correct_pdf' ? state.doctor : state.patient;
    keys.push(variant('Operation', wallet(actor), bytes(id)));
  }
  return [...new Map(keys.map(k => [k.toXDR('base64'), k])).values()];
}
async function main() {
  const mode = process.argv[2];
  if (!['--inspect', '--restore'].includes(mode) || process.argv.length !== 3 ||
      process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet') throw fail();
  const writes = mode === '--restore';
  if (writes && process.env.TRUSTLEAF_CLINICAL_TESTNET_WRITES !== 'true') throw fail();
  const deployment = JSON.parse(fs.readFileSync(evidence + '/deployment.json', 'utf8'));
  const state = JSON.parse(fs.readFileSync(local + '/demonstration.json', 'utf8'));
  if (deployment.network !== 'testnet' || state.network !== 'testnet' || !state.completed ||
      state.contractId !== deployment.contractId || (await server.getNetwork()).passphrase !== Networks.TESTNET) throw fail();
  const keys = knownKeys(deployment, state);
  const observed = await server.getLedgerEntries(...keys);
  const actual = new Map(observed.entries.map(row => [row.key.toXDR('base64'), row]));
  if ([...actual.keys()].some(k => !keys.some(key => key.toXDR('base64') === k))) throw fail();
  const missing = keys.filter(k => !actual.has(k.toXDR('base64')));
  const summary = { observedAt: new Date().toISOString(), network: 'testnet', contractId: deployment.contractId,
    readOnly: !writes, knownKeys: keys.length, missingKeys: missing.length, latestLedger: observed.latestLedger };
  if (!writes) { console.log(JSON.stringify(summary)); return; }
  const existing = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) : null;
  // Reconcile an existing attempt even when a lost response was followed by
  // restoration, so absence of missing keys never hides an uncertain receipt.
  if (!existing && !missing.length) { console.log(JSON.stringify({ ...summary, result: 'not_required', transactionsCreated: 0 })); return; }
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname)) throw fail();
  url.hostname = url.hostname.replace('-pooler.', '.');
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  let client, locks, stopped = false;
  const stop = () => { stopped = true; }; process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    const signer = Keypair.fromSecret(clinicalLocalSecrets(local).deployer);
    if (signer.publicKey() !== deployment.deployer) throw fail();
    client = await pool.connect(); locks = await acquireClinicalSourceLocks(client, [signer.publicKey()]);
    const account = await server.getAccount(signer.publicKey());
    let journal = existing;
    if (!journal) {
      const placeholder = new SorobanDataBuilder().setReadWrite(missing).build();
      const unsigned = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .setSorobanData(placeholder).addOperation(Operation.restoreFootprint({})).setTimeout(180).build();
      const sim = await server.simulateTransaction(unsigned);
      if (!rpc.Api.isSimulationSuccess(sim) || rpc.Api.isSimulationRestore(sim)) throw fail();
      const plan = buildClinicalRestoration({ deployment, sourceAccount: await server.getAccount(signer.publicKey()),
        preamble: { minResourceFee: sim.minResourceFee, transactionData: sim.transactionData } });
      if (!plan.transaction.toEnvelope().v1().tx().ext().sorobanData().resources().footprint().toXDR().equals(placeholder.resources().footprint().toXDR())) throw fail();
      journal = { network: 'testnet', contractId: deployment.contractId, source: signer.publicKey(), runId: randomUUID(),
        data: plan.transaction.toEnvelope().v1().tx().ext().sorobanData().toXDR('base64') };
      await locks.assertHeld(); if (stopped) throw fail(); save(journalFile, journal);
    }
    if (journal.network !== 'testnet' || journal.contractId !== deployment.contractId || journal.source !== signer.publicKey()) throw fail();
    const data = xdr.SorobanTransactionData.fromXDR(journal.data, 'base64');
    if (data.resources().footprint().readWrite().some(key => !keys.some(known => known.toXDR().equals(key.toXDR())))) throw fail();
    buildClinicalRestoration({ deployment, sourceAccount: await server.getAccount(signer.publicKey()),
      preamble: { minResourceFee: data.resourceFee().toString(), transactionData: data } });
    const store = clinicalAttemptStore(client, { runId: journal.runId, source: signer.publicKey() });
    const operation = Operation.restoreFootprint({});
    const runner = createClinicalTransactionRunner({ network: 'testnet', source: signer.publicKey(), server, store, writesEnabled: true,
      assertExclusive: async () => { if (stopped) throw fail(); await locks.assertHeld(); },
      verifyOperation: async (op, footprint) => { if (!op.toXDR().equals(operation.toXDR()) || !footprint.toXDR().equals(data.toXDR())) throw fail(); },
      sign: async value => { const tx = TransactionBuilder.fromXDR(value, Networks.TESTNET); tx.sign(signer); return tx.toXDR(); } });
    const result = await runner.run({ id: 'restore', operation, restorationData: data });
    if (result.status === 'SUCCESS' || result.status === 'FAILED') await store.complete('restore', result);
    if (result.status === 'SUCCESS') {
      const reader = createClinicalChainReader({ ...deployment, readerAddress: signer.publicKey() });
      await reader.verifyDeployment();
      const permission = await reader.readAccess({ deployment, historyId: state.historyId, reader: state.doctor });
      if (permission.canRead || permission.grantRevision !== 2) throw fail();
      for (const record of Object.values(state.records)) {
        const c = record.context;
        const version = await reader.readVersion({ deployment, historyId: c.historyId, entryId: c.entryId, version: c.version });
        if (version.commitment !== record.commitment) throw fail();
      }
    }
    save(evidence + '/restoration.json', { ...summary, result: result.status, transactionHash: result.transactionHash,
      ledger: result.ledger, revocationAndCommitmentsVerified: result.status === 'SUCCESS' });
    console.log(JSON.stringify({ ...summary, result: result.status, transactionHash: result.transactionHash }));
    if (result.status !== 'SUCCESS') process.exitCode = 1;
  } finally {
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (locks) await locks.release(); if (client) client.release(); await pool.end();
  }
}
main().catch(() => { console.error('clinical_restoration_unavailable'); process.exitCode = 1; });
