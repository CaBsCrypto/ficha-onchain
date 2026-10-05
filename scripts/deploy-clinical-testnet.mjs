/** Explicit Testnet-only clinical deployment. Default --preflight is read-only.
 * Uses a dedicated synthetic deployer, protected locally with Windows DPAPI.
 * Does not connect to Neon, alter SOW 1 contracts or deploy application settings. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, StrKey,
  TransactionBuilder, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { clinicalLocalSecrets } from './lib/clinical-local-secrets.mjs';
import { createClinicalTransactionRunner } from './lib/clinical-chain-write.mjs';
import { createClinicalChainReader } from './lib/clinical-chain-read.mjs';
import { acquireSignerLock } from './lib/private-worker-runtime.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';

const local = '.trustleaf-local/sow2-clinical';
const evidence = 'docs/evidence/sow2-week1-2026-10-05';
const wasmFile = 'contracts/target/wasm32v1-none/release/clinical_history_private.wasm';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const server = new rpc.Server('https://soroban-testnet.stellar.org');

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  const handle = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(handle); }
  finally { fs.closeSync(handle); }
  fs.renameSync(temporary, file);
}
async function readContract(id, method) {
  const source = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
  const tx = new TransactionBuilder(new Account(source, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(id).call(method)).setTimeout(60).build();
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation) || !simulation.result) throw Error('clinical_preflight_failed');
  return scValToNative(simulation.result.retval);
}
async function verifyRegistry() {
  const registry = JSON.parse(fs.readFileSync('docs/evidence/testnet-generation-2026-09-07/private-registry.json', 'utf8'));
  if (registry.network !== 'testnet' || registry.contractId !== PRIVATE_REGISTRY_ID ||
      (await server.getNetwork()).passphrase !== Networks.TESTNET) throw Error('clinical_preflight_failed');
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(PRIVATE_REGISTRY_ID).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
  const state = await server.getLedgerEntries(key);
  if (state.entries.length !== 1 || state.entries[0].val.contractData().val().instance().executable().wasmHash().toString('hex') !== registry.wasmSha256 ||
      await readContract(PRIVATE_REGISTRY_ID, 'interface_version') !== 1 || await readContract(PRIVATE_REGISTRY_ID, 'get_admin') !== registry.admin) throw Error('clinical_preflight_failed');
  return registry;
}
async function main() {
  const mode = process.argv[2] ?? '--preflight';
  if (!['--preflight', '--deploy', '--audit'].includes(mode) || process.argv.length > 3 ||
      (process.env.NEXT_PUBLIC_STELLAR_NETWORK && process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet')) throw Error('clinical_mode_invalid');
  const registry = await verifyRegistry();
  const wasm = fs.readFileSync(wasmFile), wasmHash = hash(wasm);
  if (mode === '--preflight') {
    console.log(JSON.stringify({ mode: 'read-only', network: 'testnet', existingRegistryVerified: true, wasmHash,
      wasmBytes: wasm.length, contractDeployed: fs.existsSync(evidence + '/deployment.json') })); return;
  }
  if (mode === '--deploy' && process.env.TRUSTLEAF_CLINICAL_TESTNET_WRITES !== 'true') throw Error('clinical_writes_paused');
  const secrets = clinicalLocalSecrets(local, { create: mode === '--deploy', backup: mode === '--deploy' });
  const deployer = Keypair.fromSecret(secrets.deployer);
  const file = local + '/deployment-journal.json';
  let journal = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {
    network: 'testnet', registryId: PRIVATE_REGISTRY_ID, registryWasmHash: registry.wasmSha256,
    wasmHash, source: deployer.publicKey(), salt: randomBytes(32).toString('hex'), transactions: {},
  };
  if (journal.network !== 'testnet' || journal.registryId !== PRIVATE_REGISTRY_ID || journal.registryWasmHash !== registry.wasmSha256 ||
      journal.wasmHash !== wasmHash || journal.source !== deployer.publicKey()) throw Error('clinical_deployment_manifest_mismatch');
  const save = () => atomicJson(file, journal);
  if (mode === '--audit') {
    if (!journal.contractId) throw Error('clinical_not_deployed');
    const reader = createClinicalChainReader({ network: 'testnet', contractId: journal.contractId, registryId: PRIVATE_REGISTRY_ID,
      wasmHash, readerAddress: deployer.publicKey() });
    await reader.verifyDeployment();
    for (const transaction of Object.values(journal.transactions)) {
      const actual = await server.getTransaction(transaction.hash);
      if (actual.status !== 'SUCCESS' || !actual.envelopeXdr.toXDR().equals(TransactionBuilder.fromXDR(transaction.xdr, Networks.TESTNET).toEnvelope().toXDR())) throw Error('clinical_receipt_unverified');
    }
    console.log(JSON.stringify({ readOnly: true, deployedWasmVerified: true, contractId: journal.contractId,
      receiptsVerified: Object.keys(journal.transactions).length })); return;
  }
  const release = await acquireSignerLock(local, deployer.publicKey());
  if (!release) throw Error('clinical_deployer_busy');
  let exclusive = true;
  const stop = () => { exclusive = false; }; process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    save();
    let funded = false;
    try { await server.getAccount(deployer.publicKey()); funded = true; } catch { /* funding is allowed only in explicit deploy mode */ }
    if (!funded) {
      const response = await fetch('https://friendbot.stellar.org/?addr=' + deployer.publicKey(), { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw Error('clinical_testnet_funding_failed');
      await server.getAccount(deployer.publicKey());
    }
    async function confirmed(id, operation) {
      const runner = createClinicalTransactionRunner({ network: 'testnet', source: deployer.publicKey(), server, writesEnabled: true,
        assertExclusive: async () => { if (!exclusive) throw Error('clinical_lock_lost'); },
        verifyOperation: async candidate => { if (!candidate.body().toXDR().equals(operation.body().toXDR())) throw Error('clinical_operation_invalid'); },
        sign: async envelope => { const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET); tx.sign(deployer); return tx.toXDR(); },
        store: { load: async name => journal.transactions[name], save: async (name, value) => { journal.transactions[name] = value; save(); } },
      });
      for (let index = 0; index < 30; index++) {
        const result = await runner.run({ id, operation });
        if (result.status === 'SUCCESS') {
          Object.assign(journal.transactions[id], { status: result.status, ledger: result.ledger }); save(); return result.value;
        }
        if (result.status !== 'pending') throw Error('clinical_transaction_failed');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw Error('clinical_transaction_pending');
    }
    const uploaded = await confirmed('upload', Operation.uploadContractWasm({ wasm }));
    if (Buffer.from(uploaded).toString('hex') !== wasmHash) throw Error('clinical_wasm_mismatch');
    const contractId = await confirmed('deploy', Operation.createCustomContract({ address: new Address(deployer.publicKey()),
      wasmHash: Buffer.from(wasmHash, 'hex'), salt: Buffer.from(journal.salt, 'hex'), constructorArgs: [new Address(PRIVATE_REGISTRY_ID).toScVal()] }));
    if (!StrKey.isValidContract(contractId)) throw Error('clinical_contract_invalid');
    journal.contractId = contractId; save();
    await createClinicalChainReader({ network: 'testnet', contractId, registryId: PRIVATE_REGISTRY_ID, wasmHash,
      readerAddress: deployer.publicKey() }).verifyDeployment();
    atomicJson(evidence + '/deployment.json', { schemaVersion: 1, network: 'testnet', contractId,
      registryId: PRIVATE_REGISTRY_ID, registryWasmHash: registry.wasmSha256, wasmHash, wasmBytes: wasm.length,
      sourceSha256: hash(fs.readFileSync('contracts/clinical-history-private/src/lib.rs')),
      testSha256: hash(fs.readFileSync('contracts/clinical-history-private/src/test.rs')),
      deployer: deployer.publicKey(), confirmedAt: new Date().toISOString(), upgradeMethod: false,
      transactions: Object.fromEntries(Object.entries(journal.transactions).map(([id, value]) => [id,
        { transactionHash: value.hash, source: value.source, status: value.status, ledger: value.ledger,
          explorer: 'https://stellar.expert/explorer/testnet/tx/' + value.hash }])) });
    console.log(JSON.stringify({ deployedAndVerified: true, contractId, wasmHash, receipts: 2 }));
  } finally { exclusive = false; process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); await release(); }
}
main().catch(error => {
  const allowed = ['clinical_writes_paused','clinical_transaction_pending','clinical_deployer_busy','clinical_transaction_unavailable',
    'clinical_preflight_failed','clinical_deployment_manifest_mismatch','clinical_contract_invalid','clinical_wasm_mismatch'];
  console.error(JSON.stringify({ error: allowed.includes(error?.message) ? error.message : 'clinical_deployment_unavailable',
    phase: ['configuration','load_attempt','prepare','sign','persist','submit','reconcile'].includes(error?.phase) ? error.phase : 'setup' }));
  process.exitCode = 1;
});
