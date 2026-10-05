/** Synthetic technical demonstration only: real Neon, Ed25519 and Testnet.
 * Does not claim Privy/browser validation. --readback is strictly read-only.
 * --run requires explicit writes flag and preserves every signed attempt. */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { clinicalLocalSecrets } from './lib/clinical-local-secrets.mjs';
import { createClinicalTransactionRunner } from './lib/clinical-chain-write.mjs';
import { createClinicalChainReader } from './lib/clinical-chain-read.mjs';
import { clinicalAttemptStore } from './lib/clinical-attempt-store.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { clinicalNeonStore } from './lib/clinical-neon-store.mjs';
import { sealClinicalVersion, openClinicalVersion } from './lib/clinical-crypto.mjs';
import { readClinicalVersion } from './lib/clinical-read.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';
import { secureStoreSigner, acquireSignerLock } from './lib/private-worker-runtime.mjs';

const local = '.trustleaf-local/sow2-clinical';
const file = local + '/demonstration.json';
const output = 'docs/evidence/sow2-week1-2026-10-05';
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const doctorAlias = 'trustleaf-testnet-doctor-1-20260907';
const configDir = 'C:/Users/MGC/.config/stellar';
const hex = bytes => Buffer.from(bytes).toString('hex');
const bytes = value => nativeToScVal(Buffer.from(value, 'hex'));
const address = value => new Address(value).toScVal();
const u32 = value => nativeToScVal(value, { type: 'u32' });
const u64 = value => nativeToScVal(BigInt(value), { type: 'u64' });
const struct = value => xdr.ScVal.scvMap(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1)
  .map(([key, val]) => new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val })));
const pdf = version => Buffer.from('%PDF-1.7\n% SYNTHETIC CLINICAL FIXTURE ' + version + '\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPqkAAAAASUVORK5CYII=', 'base64');
function saveJson(target, value) {
  fs.mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  const handle = fs.openSync(target + '.tmp', 'w', 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  fs.renameSync(target + '.tmp', target);
}

async function main() {
  const mode = process.argv[2];
  if (!['--run', '--readback'].includes(mode) || process.argv.length !== 3 || process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet') throw Error('clinical_demo_configuration_invalid');
  if (mode === '--run' && process.env.TRUSTLEAF_CLINICAL_TESTNET_WRITES !== 'true') throw Error('clinical_writes_paused');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode') !== 'require' ||
      !/^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname)) throw Error('clinical_demo_configuration_invalid');
  url.hostname = url.hostname.replace('-pooler.', '.'); // session locks require direct Neon
  const deployment = JSON.parse(fs.readFileSync(output + '/deployment.json', 'utf8'));
  if (deployment.network !== 'testnet' || deployment.registryId !== PRIVATE_REGISTRY_ID ||
      deployment.wasmHash !== createHash('sha256').update(fs.readFileSync('contracts/target/wasm32v1-none/release/clinical_history_private.wasm')).digest('hex')) throw Error('clinical_demo_configuration_invalid');
  const secrets = clinicalLocalSecrets(local, { backup: mode === '--run' });
  const patient = Keypair.fromSecret(secrets.patient), deployer = Keypair.fromSecret(secrets.deployer);
  const found = spawnSync('stellar', ['keys', 'address', doctorAlias, '--config-dir', configDir], { encoding: 'utf8', windowsHide: true });
  const doctor = found.stdout.trim();
  if (found.status !== 0 || !StrKey.isValidEd25519PublicKey(doctor)) throw Error('clinical_demo_signer_unavailable');
  const doctorSign = secureStoreSigner({ alias: doctorAlias, configDir });
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
    schemaVersion: 1, runId: randomUUID(), network: 'testnet', contractId: deployment.contractId,
    patient: patient.publicKey(), doctor, operations: {}, records: {}, transactions: {}, checks: {},
  };
  if (state.network !== 'testnet' || state.contractId !== deployment.contractId || state.patient !== patient.publicKey() || state.doctor !== doctor) throw Error('clinical_demo_configuration_invalid');
  if (mode === '--readback' && (!fs.existsSync(file) || !state.completed)) throw Error('clinical_demo_incomplete');
  if (mode === '--run' && state.completed) throw Error('clinical_demo_use_readback');
  const save = () => saveJson(file, state);
  const reader = createClinicalChainReader({ network: 'testnet', contractId: deployment.contractId,
    registryId: deployment.registryId, wasmHash: deployment.wasmHash, readerAddress: deployer.publicKey() });
  await reader.verifyDeployment();
  async function read(method, args = [], id = deployment.contractId) {
    const tx = new TransactionBuilder(new Account(deployer.publicKey(), '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(id).call(method, ...args)).setTimeout(60).build();
    const result = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(result) || rpc.Api.isSimulationRestore(result) || !result.result) throw Error('clinical_demo_read_failed');
    return scValToNative(result.result.retval);
  }
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: url.href, connectionTimeoutMillis: 15_000 });
  let client, locks, signerRelease, stopped = false;
  const stop = () => { stopped = true; }; process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    client = await pool.connect();
    const store = clinicalNeonStore(client);
    if (mode === '--readback') await client.query('BEGIN READ ONLY');
    else {
      const schemas = await client.query("SELECT to_regclass('public.clinical_private_versions') AS versions,to_regclass('public.clinical_transaction_attempts') AS attempts");
      if (!schemas.rows[0].versions || !schemas.rows[0].attempts) throw Error('clinical_demo_schema_missing');
      locks = await acquireClinicalSourceLocks(client, [patient.publicKey(), doctor]);
      signerRelease = await acquireSignerLock(configDir, doctor);
      if (!signerRelease) throw Error('clinical_source_busy');
      await locks.assertHeld(); save();
      let funded = false; try { await server.getAccount(patient.publicKey()); funded = true; } catch { /* only explicit --run may fund */ }
      if (!funded) {
        const funding = await fetch('https://friendbot.stellar.org/?addr=' + patient.publicKey(), { signal: AbortSignal.timeout(20_000) });
        if (!funding.ok) throw Error('clinical_testnet_funding_failed');
        await server.getAccount(patient.publicKey());
      }
    }
    const operationId = name => {
      if (!state.operations[name]) { state.operations[name] = randomBytes(32).toString('hex'); save(); }
      return state.operations[name];
    };
    async function confirmed(name, operation, actor) {
      const attempts = clinicalAttemptStore(client, { runId: state.runId, source: actor });
      const runner = createClinicalTransactionRunner({ network: 'testnet', source: actor, server, store: attempts, writesEnabled: true,
        assertExclusive: async () => { if (stopped) throw Error('clinical_stopped'); await locks.assertHeld(); },
        verifyOperation: async candidate => { await reader.verifyDeployment(); if (!candidate.body().toXDR().equals(operation.body().toXDR())) throw Error('clinical_operation_invalid'); },
        sign: async envelope => {
          if (actor === doctor) return doctorSign(envelope);
          if (actor !== patient.publicKey()) throw Error('clinical_actor_invalid');
          const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET); tx.sign(patient); return tx.toXDR();
        },
      });
      for (let index = 0; index < 30; index++) {
        const result = await runner.run({ id: name, operation });
        if (['SUCCESS', 'FAILED'].includes(result.status)) {
          await attempts.complete(name, result);
          state.transactions[name] = { transactionHash: result.transactionHash, source: actor, status: result.status, ledger: result.ledger,
            explorer: 'https://stellar.expert/explorer/testnet/tx/' + result.transactionHash }; save();
          if (result.status !== 'SUCCESS') throw Error('clinical_transaction_failed');
          return result;
        }
        if (result.status !== 'pending') throw Error('clinical_transaction_failed');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw Error('clinical_transaction_pending');
    }
    const call = (method, args) => new Contract(deployment.contractId).call(method, ...args);
    function grant(readAllowed, appendAllowed, revision, id) {
      return call('set_permissions', [struct({ history_id: bytes(state.historyId), doctor: address(doctor),
        can_read: nativeToScVal(readAllowed), can_append: nativeToScVal(appendAllowed), expected_revision: u64(revision), operation_id: bytes(id) })]);
    }
    async function record(name, entryId, version, previousCommitment, content, metadata) {
      const context = { schemaVersion: 1, network: 'testnet', contractId: deployment.contractId, historyId: state.historyId,
        entryId, author: doctor, patient: patient.publicKey(), version, previousCommitment };
      const existing = (await client.query("SELECT 1 FROM clinical_private_versions WHERE network='testnet' AND contract_id=$1 AND history_id=$2 AND entry_id=$3 AND version=$4",
        [context.contractId, context.historyId, entryId, version])).rows.length;
      let saved;
      if (existing) saved = await store.preparedVersion({ context });
      else {
        const sealed = sealClinicalVersion({ context, content, metadata, keyring: secrets.keyring, activeKeyId: 'clinical.dev.1' });
        await store.stageVersion({ context, ...sealed, operationId: operationId(name) }); saved = await store.preparedVersion({ context });
      }
      if (saved.operationId !== operationId(name)) throw Error('clinical_demo_record_conflict');
      const operation = call('append_version', [struct({ history_id: bytes(context.historyId), entry_id: bytes(entryId), author: address(doctor),
        commitment: bytes(saved.commitment), expected_version: u32(version - 1), expected_grant_revision: u64(1), operation_id: bytes(saved.operationId) })]);
      const receipt = await confirmed(name, operation, doctor);
      if (receipt.value.author !== doctor || receipt.value.version !== version || hex(receipt.value.commitment) !== saved.commitment ||
          (receipt.value.previous_commitment == null ? null : hex(receipt.value.previous_commitment)) !== previousCommitment) throw Error('clinical_receipt_mismatch');
      const current = await reader.readVersion({ deployment: reader.deployment, historyId: context.historyId, entryId, version });
      if (JSON.stringify(current.context) !== JSON.stringify(context) || current.commitment !== saved.commitment) throw Error('clinical_receipt_mismatch');
      await store.confirmVersion({ context, commitment: saved.commitment, operationId: saved.operationId,
        receipt: { ...receipt, network: 'testnet', contractId: context.contractId, context, commitment: saved.commitment, operationId: saved.operationId } });
      state.records[name] = { context, commitment: saved.commitment }; save();
      return saved.commitment;
    }
    async function privateRead(name, role) {
      // Signed, short-lived technical challenge: this proves wallet control in
      // the harness. It is not a Privy login or a production authentication API.
      const wallet = role === 'patient' ? patient.publicKey() : doctor;
      const unsigned = new TransactionBuilder(new Account(wallet, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.manageData({ name: 'trustleaf:clinical:technical-session', value: randomBytes(32) })).setTimeout(300).build();
      let credential;
      if (role === 'patient') { unsigned.sign(patient); credential = unsigned.toXDR(); }
      else credential = await doctorSign(unsigned.toXDR());
      const actor = { userId: 'synthetic-tech:' + state.runId + ':' + role, sessionId: unsigned.hash().toString('hex') };
      const authenticate = async value => {
        try {
          const signed = TransactionBuilder.fromXDR(value, Networks.TESTNET);
          return signed.hash().equals(unsigned.hash()) && Number(signed.timeBounds.maxTime) > Date.now() / 1000 &&
            signed.signatures.some(signature => Keypair.fromPublicKey(wallet).verify(signed.hash(), signature.signature())) ? actor : null;
        } catch { return null; }
      };
      const record = state.records[name];
      return readClinicalVersion({ credential, historyId: record.context.historyId, entryId: record.context.entryId, version: record.context.version }, {
        deployment: reader.deployment, authenticate,
        findBinding: async checked => checked.userId === actor.userId ? { userId: actor.userId, bindingId: actor.sessionId,
          wallet, role, revokedAt: null, verifiedAt: new Date(Date.now() - 1000).toISOString() } : null,
        readAccess: reader.readAccess, readVersion: reader.readVersion,
        loadEnvelope: selector => store.loadEnvelope(selector), getKeyring: async () => secrets.keyring,
      });
    }
    if (mode === '--run') {
      assert.equal(await read('is_authorized', [address(doctor)], PRIVATE_REGISTRY_ID), true, 'synthetic doctor must remain authorized');
      state.historyId = hex(await read('derive_history_id', [address(patient.publicKey())])); save();
      const created = await confirmed('create_history', call('create_history', [address(patient.publicKey()), bytes(state.historyId), bytes(operationId('create_history'))]), patient.publicKey());
      assert.equal(created.value.patient, patient.publicKey()); assert.equal(hex(created.value.history_id), state.historyId);
      const permitted = await confirmed('grant', grant(true, true, 0, operationId('grant')), patient.publicKey());
      assert.deepEqual(permitted.value, { can_append: true, can_read: true, revision: 1n });
      const pdfId = hex(await read('derive_entry_id', [bytes(state.historyId), address(doctor), bytes(operationId('append_pdf'))]));
      const original = await record('append_pdf', pdfId, 1, null, pdf(1), { mediaType: 'application/pdf', fileName: 'synthetic.pdf' });
      await record('correct_pdf', pdfId, 2, original, pdf(2), { mediaType: 'application/pdf', fileName: 'synthetic-correction.pdf' });
      const imageId = hex(await read('derive_entry_id', [bytes(state.historyId), address(doctor), bytes(operationId('append_image'))]));
      await record('append_image', imageId, 1, null, image, { mediaType: 'image/png', fileName: 'synthetic.png' });
      assert.deepEqual((await privateRead('append_pdf', 'patient')).content, pdf(1));
      assert.deepEqual((await privateRead('correct_pdf', 'patient')).content, pdf(2));
      assert.deepEqual((await privateRead('append_image', 'patient')).content, image);
      state.checks.patientIntegrityAndPreviousVersion = true;
      const currentGrant = await read('get_grant', [bytes(state.historyId), address(doctor)]);
      if (currentGrant.revision === 1n) {
        assert.deepEqual((await privateRead('append_pdf', 'doctor')).content, pdf(1)); state.checks.authorizedDoctorRead = true;
      }
      const revoked = await confirmed('revoke', grant(false, false, 1, operationId('revoke')), patient.publicKey());
      assert.deepEqual(revoked.value, { can_append: false, can_read: false, revision: 2n });
      await assert.rejects(() => privateRead('append_pdf', 'doctor'), { message: 'clinical_version_unavailable' });
      assert.equal(await read('can_append', [bytes(state.historyId), address(doctor)]), false);
      state.checks.revocationDeniesSubsequentReadAndAppend = true;
      const stored = await store.loadEnvelope(state.records.append_pdf);
      const altered = { ...stored, payload: stored.payload.slice(0, -2) + 'AA' };
      assert.throws(() => openClinicalVersion({ envelope: altered, expectedContext: state.records.append_pdf.context,
        expectedCommitment: state.records.append_pdf.commitment, keyring: secrets.keyring }));
      state.checks.alteredCiphertextRejected = true;
      state.completed = true; save();
    }
    assert.deepEqual((await privateRead('append_pdf', 'patient')).content, pdf(1));
    assert.deepEqual((await privateRead('correct_pdf', 'patient')).content, pdf(2));
    assert.deepEqual((await privateRead('append_image', 'patient')).content, image);
    const grantNow = await reader.readAccess({ deployment: reader.deployment, historyId: state.historyId, reader: doctor });
    assert.equal(grantNow.canRead, false); assert.equal(grantNow.grantRevision, 2);
    const rows = await client.query('SELECT state,transaction_hash,signed_xdr FROM clinical_transaction_attempts WHERE run_id=$1', [state.runId]);
    assert.equal(rows.rows.length, 6); assert.equal(rows.rows.every(row => row.state === 'confirmed'), true);
    for (const row of rows.rows) {
      const receipt = await server.getTransaction(row.transaction_hash);
      assert.equal(receipt.status, 'SUCCESS');
      assert.equal(receipt.envelopeXdr.toXDR().equals(TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET).toEnvelope().toXDR()), true);
    }
    const duplicates = await client.query('SELECT count(*) AS count FROM clinical_private_versions WHERE contract_id=$1 AND history_id=$2', [deployment.contractId, state.historyId]);
    assert.equal(Number(duplicates.rows[0].count), 3);
    if (mode === '--readback') await client.query('ROLLBACK');
    const report = { schemaVersion: 1, network: 'testnet', syntheticOnly: true, runId: state.runId,
      contractId: deployment.contractId, wasmHash: deployment.wasmHash, registryId: deployment.registryId,
      identityEvidence: 'real Ed25519 technical challenges; no Privy/browser login', database: 'isolated Neon dev, direct connection',
      files: { pdfVersions: 2, pngVersions: 1, maximumOriginalBytes: 3000000 }, checks: state.checks,
      transactions: state.transactions, confirmedAttemptCount: 6, pendingAttemptCount: 0,
      readbackAfterProcessRestart: mode === '--readback', observedAt: new Date().toISOString() };
    saveJson(output + (mode === '--readback' ? '/readback.json' : '/demonstration.json'), report);
    console.log(JSON.stringify({ mode, syntheticOnly: true, actualTestnetReceipts: 6,
      realNeonEncryptedVersions: 3, patientReadPassed: true, doctorReadAfterRevokeRejected: true, pendingAttempts: 0 }));
  } finally {
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    if (locks) await locks.release(); if (signerRelease) await signerRelease();
    if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    await pool.end();
  }
}
main().catch(error => {
  const allowed = ['clinical_writes_paused','clinical_source_busy','clinical_transaction_pending','clinical_transaction_unavailable',
    'clinical_demo_configuration_invalid','clinical_demo_schema_missing','clinical_demo_use_readback','clinical_attempt_unavailable',
    'clinical_receipt_mismatch','clinical_demo_record_conflict'];
  console.error(JSON.stringify({ error: allowed.includes(error?.message) ? error.message : 'clinical_demonstration_unavailable',
    phase: ['configuration','load_attempt','prepare','sign','persist','submit','reconcile'].includes(error?.phase) ? error.phase : 'setup' }));
  process.exitCode = 1;
});
