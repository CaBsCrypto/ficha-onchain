// Explicitly authorized Testnet-only deployment. Never loads DATABASE_URL.
// Default: read-only preflight. --deploy uploads/deploys the local Rx WASM.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Operation, rpc, scValToNative, TransactionBuilder } from '@stellar/stellar-sdk';

const allowed = new Set(['RELAYER_SECRET', 'DEMO_DOCTOR_SECRET', 'NEXT_PUBLIC_DOCTOR_REGISTRY_ID', 'NEXT_PUBLIC_PRESCRIPTION_ID', 'NEXT_PUBLIC_STELLAR_NETWORK']);
const config = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && allowed.has(m[1])) config[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
}
if (config.NEXT_PUBLIC_STELLAR_NETWORK && config.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet') throw new Error('Refusing non-Testnet configuration');
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const relayer = Keypair.fromSecret(config.RELAYER_SECRET);
const doctor = Keypair.fromSecret(config.DEMO_DOCTOR_SECRET);
const registryId = config.NEXT_PUBLIC_DOCTOR_REGISTRY_ID;
const dir = 'docs/evidence/week1-2026-09-06';
mkdirSync(dir, { recursive: true });
const manifestPath = `${dir}/deployment.json`;
const wasmPath = 'contracts/target/sow-week1/prescription_soulbound.wasm';
const wasm = readFileSync(wasmPath);
const wasmHash = createHash('sha256').update(wasm).digest('hex');
const state = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {
  network: 'testnet', registryId, previousPrescriptionId: config.NEXT_PUBLIC_PRESCRIPTION_ID,
  wasmHash, admin: relayer.publicKey(), dispensaryPlaceholder: relayer.publicKey(),
  salt: randomBytes(32).toString('hex'), transactions: {},
};
if (state.wasmHash !== wasmHash || state.registryId !== registryId) throw new Error('Manifest mismatch; inspect before another deployment');
const save = () => writeFileSync(manifestPath, JSON.stringify(state, null, 2) + '\n');

async function read(id, method, args = []) {
  const tx = new TransactionBuilder(new Account(relayer.publicKey(), '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(id).call(method, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`Read-only preflight failed for ${method}: ${sim.error}`);
  return scValToNative(sim.result.retval);
}

async function submit(name, operation) {
  let hash = state.transactions[name];
  if (!hash) {
    const account = await server.getAccount(relayer.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(operation).setTimeout(120).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(relayer);
    // Save deterministic hash BEFORE submission, so an uncertain response is not retried blindly.
    hash = prepared.hash().toString('hex');
    state.transactions[name] = hash;
    save();
    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') throw new Error(`${name} rejected; inspect saved transaction before retry`);
  }
  for (let i = 0; i < 30; i++) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') return scValToNative(result.returnValue);
    if (result.status === 'FAILED') throw new Error(`${name} failed; saved transaction retained`);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`${name} not confirmed; saved hash must be reconciled before retry`);
}

const authorized = await read(registryId, 'is_authorized', [new Address(doctor.publicKey()).toScVal()]);
if (authorized !== true) throw new Error('Demo doctor is not authorized in existing Testnet registry');
await server.getAccount(relayer.publicKey());
console.log('Preflight PASS: Testnet reachable, relayer account exists, existing registry authorizes demo doctor.');
if (process.argv.includes('--deploy')) {
  save();
  const uploaded = await submit('upload', Operation.uploadContractWasm({ wasm }));
  if (Buffer.from(uploaded).toString('hex') !== wasmHash) throw new Error('Uploaded WASM hash mismatch');
  const id = await submit('deploy', Operation.createCustomContract({
    address: new Address(relayer.publicKey()), wasmHash: Buffer.from(wasmHash, 'hex'), salt: Buffer.from(state.salt, 'hex'),
    constructorArgs: [state.admin, registryId, state.dispensaryPlaceholder].map(a => new Address(a).toScVal()),
  }));
  state.prescriptionId = id;
  state.confirmedAt = new Date().toISOString();
  save();
  console.log(`Deployment confirmed: ${id}; WASM verified. Manifest: ${manifestPath}`);
}
