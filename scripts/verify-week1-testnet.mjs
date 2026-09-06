// --run writes ONLY synthetic records to the newly deployed Testnet contract.
// No HTTP application routes, databases, emails, or clinical data are used.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, nativeToScVal, rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

const dir = 'docs/evidence/week1-2026-09-06';
const deployment = JSON.parse(readFileSync(`${dir}/deployment.json`, 'utf8'));
if (deployment.network !== 'testnet' || !deployment.prescriptionId) throw new Error('Confirmed Testnet deployment required');
const config = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(RELAYER_SECRET|DEMO_DOCTOR_SECRET)=(.*)$/);
  if (m) config[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
}
const doctor = Keypair.fromSecret(config.DEMO_DOCTOR_SECRET);
const relayer = Keypair.fromSecret(config.RELAYER_SECRET);
const server = new rpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract(deployment.prescriptionId);
const file = `${dir}/verification.json`;
const evidence = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
  network: 'testnet', contractId: deployment.prescriptionId,
  patient: Keypair.random().publicKey(), syntheticDocumentHash: randomBytes(32).toString('hex'),
  secondDocumentHash: randomBytes(32).toString('hex'), expiry: Math.floor(Date.now() / 1000) + 86400,
  transactions: {}, checks: {},
};
if (evidence.contractId !== deployment.prescriptionId) throw new Error('Verification manifest belongs to a different contract');
const save = () => writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
const addr = a => new Address(a).toScVal();
const num = n => nativeToScVal(BigInt(n), { type: 'u64' });
const mintArgs = hash => [addr(doctor.publicKey()), addr(evidence.patient), xdr.ScVal.scvBytes(Buffer.from(hash, 'hex')),
  nativeToScVal('SOW_TEST_ONLY', { type: 'string' }), nativeToScVal('NOT_FOR_CLINICAL_USE', { type: 'string' }),
  nativeToScVal(1, { type: 'u32' }), num(evidence.expiry)];

async function simulate(method, args = [], source = doctor.publicKey()) {
  const tx = new TransactionBuilder(new Account(source, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(contract.call(method, ...args)).setTimeout(30).build();
  return server.simulateTransaction(tx);
}
async function read(method, args = []) {
  const sim = await simulate(method, args);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`Read failed: ${method}`);
  return scValToNative(sim.result.retval);
}
function check(name, value) {
  if (!value) throw new Error(`FAIL: ${name}`);
  evidence.checks[name] = { passed: true, at: new Date().toISOString() };
  save();
  console.log(`PASS: ${name}`);
}
async function send(name, method, args) {
  let hash = evidence.transactions[name]?.hash;
  if (!hash) {
    const source = await server.getAccount(doctor.publicKey());
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(contract.call(method, ...args)).setTimeout(120).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(doctor);
    const bumped = TransactionBuilder.buildFeeBumpTransaction(relayer, '2000000', prepared, Networks.TESTNET);
    bumped.sign(relayer);
    hash = bumped.hash().toString('hex');
    evidence.transactions[name] = { hash, method, feeSource: relayer.publicKey(), status: 'SUBMITTING' };
    save();
    const result = await server.sendTransaction(bumped);
    if (result.status === 'ERROR') throw new Error(`${name} rejected; reconcile saved hash`);
  }
  for (let i = 0; i < 30; i++) {
    const result = await server.getTransaction(hash);
    if (result.status === 'SUCCESS') {
      const envelope = TransactionBuilder.fromXDR(result.envelopeXdr, Networks.TESTNET);
      if (envelope.feeSource !== relayer.publicKey()) throw new Error('Fee source mismatch');
      evidence.transactions[name].status = 'SUCCESS';
      evidence.transactions[name].confirmedAt = new Date().toISOString();
      save();
      return scValToNative(result.returnValue);
    }
    if (result.status === 'FAILED') throw new Error(`${name} failed`);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`${name} uncertain; saved hash retained`);
}
async function codeHash(id) {
  const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: new Address(id).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: xdr.ContractDataDurability.persistent(),
  }));
  const result = await server.getLedgerEntries(key);
  return result.entries[0]?.val.contractData().val().instance().executable().wasmHash().toString('hex');
}
check('deployed_wasm_matches_local', await codeHash(deployment.prescriptionId) === deployment.wasmHash);
evidence.registryCodeHash = await codeHash(deployment.registryId);
check('existing_registry_is_deployed', Boolean(evidence.registryCodeHash));
if (!process.argv.includes('--run')) process.exit(0);
evidence.rxId ??= String(await send('mint', 'mint_prescription', mintArgs(evidence.syntheticDocumentHash)));
save();
if (!evidence.checks.registered) check('registered', Number((await read('get_prescription', [num(evidence.rxId)])).status) === 0);
check('patient_receives_record', (await read('get_prescriptions_by_patient', [addr(evidence.patient)])).some(rx => String(rx.id) === evidence.rxId));
const duplicate = await simulate('mint_prescription', mintArgs(evidence.syntheticDocumentHash));
check('duplicate_rejected_in_simulation', rpc.Api.isSimulationError(duplicate) && /Error\(Contract, #8\)/.test(duplicate.error));
const unauthorized = await simulate('mint_prescription', [addr(evidence.patient), ...mintArgs(evidence.secondDocumentHash).slice(1)], evidence.patient);
check('unauthorized_issuer_rejected_in_simulation', rpc.Api.isSimulationError(unauthorized) && /Error\(Contract, #2\)/.test(unauthorized.error));
await send('activate', 'activate', [addr(doctor.publicKey()), num(evidence.rxId)]);
if (!evidence.checks.active) check('active', Number((await read('get_prescription', [num(evidence.rxId)])).status) === 1);
await send('revoke', 'revoke', [addr(doctor.publicKey()), num(evidence.rxId)]);
check('revoked', Number((await read('get_prescription', [num(evidence.rxId)])).status) === 5);
const revokedDuplicate = await simulate('mint_prescription', mintArgs(evidence.syntheticDocumentHash));
check('revoked_document_cannot_be_reissued', rpc.Api.isSimulationError(revokedDuplicate) && /Error\(Contract, #8\)/.test(revokedDuplicate.error));
evidence.secondRxId ??= String(await send('distinct_mint', 'mint_prescription', mintArgs(evidence.secondDocumentHash)));
save();
check('distinct_document_can_be_issued', BigInt(evidence.secondRxId) === BigInt(evidence.rxId) + 1n);
await send('distinct_revoke', 'revoke', [addr(doctor.publicKey()), num(evidence.secondRxId)]);
check('relayer_paid_confirmed_transactions', Object.values(evidence.transactions).every(t => t.status === 'SUCCESS' && t.feeSource === relayer.publicKey()));
evidence.completedAt = new Date().toISOString();
evidence.note = 'Synthetic records only. Activation was signed by the issuer (supported by the contract). Rejection checks are RPC simulations, not submitted failed transactions. No browser walkthrough performed.';
save();
