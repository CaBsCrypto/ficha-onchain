import { rehearsalCompletionWindow, rehearsalMaintenanceDescriptor, assertRehearsalMaintenanceBudget, rehearsalResumeWindow, rehearsalMaintenanceThreeDescriptor, rehearsalResumeManifest, assertRehearsalResumeBudget, assertRehearsalCompletionMaintenance } from './clinical-rehearsal-policy.mjs';
import { completionContinuationManifest } from '../prepare-clinical-continuation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Account, Address, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { syntheticClinicalPdf } from './clinical-fixtures.mjs';
import { rehearsalConfigured, loadRehearsalPolicy, rehearsalContinuationUntil, assertRehearsalActor, rehearsalStep, assertRehearsalFee, assertRehearsalAggregateBudget, canonicalJSON, payloadHash } from './clinical-rehearsal-policy.mjs';

const clinical = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const registry = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const admin = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const key = number => Keypair.fromRawEd25519Seed(Buffer.alloc(32, number));
const patient = { userId: 'did:privy:rehearsal_patient', walletId: 'patient_wallet', address: key(108).publicKey(), email: 'patient@example.test' };
const doctor = { userId: 'did:privy:rehearsal_doctor', walletId: 'doctor_wallet', address: key(109).publicKey(), email: 'doctor@example.test' };
const relayer = key(110).publicKey();
const now = 1_800_000_000;
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const sha = value => createHash('sha256').update(value).digest();
const historyId = sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('hist_id'), nativeToScVal(sha(Networks.TESTNET)), new Address(clinical).toScVal(), new Address(patient.address).toScVal()]).toXDR()).toString('hex');
const operation = index => (index + 1).toString(16).repeat(64);
const entryId = sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(sha(Networks.TESTNET)), new Address(clinical).toScVal(), nativeToScVal(Buffer.from(historyId, 'hex')), new Address(doctor.address).toScVal(), nativeToScVal(Buffer.from(operation(3), 'hex'))]).toXDR()).toString('hex');
function fixture() {
  const keys = ['renew', 'grant_read', 'grant_append', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
  const steps = keys.map((name, index) => ({ key: name, requestId: id(index + 1), actor: index === 0 ? 'admin' : [1, 2, 4, 7].includes(index) ? 'patient' : 'doctor',
    action: index === 0 ? 'renew' : [1, 2, 4, 7].includes(index) ? 'set_permissions' : 'append_version', maxFeeStroops: '10000000', ...(index ? { operationId: operation(index) } : {}) }));
  for (const [index, flags, revision] of [[1, [true, false], 3], [2, [false, true], 4], [4, [true, true], 5], [7, [false, false], 6]]) {
    steps[index].input = { requestId: steps[index].requestId, action: 'set_permissions', doctorId: 10, canRead: flags[0], canAppend: flags[1], expectedRevision: revision };
  }
  const note = { title: 'Synthetic note', text: 'Invented technical fixture only.', eventDate: '2026-10-23', prescriptionId: id(20) };
  steps[3].input = { requestId: steps[3].requestId, action: 'append_version', historyId, note };
  steps[5].input = { requestId: steps[5].requestId, action: 'append_version', historyId, file: { fileName: 'synthetic-clinical.pdf', mediaType: 'application/pdf', base64: syntheticClinicalPdf(1).toString('base64') } };
  steps[6].input = { requestId: steps[6].requestId, action: 'append_version', historyId, entryId, expectedVersion: 1, note: { ...note, text: 'Corrected invented technical fixture only.' } };
  return { schemaVersion: 1, runId: id(30), createdAt: now, until: now + 6 * 3600, doctorValidUntil: now + 86400, network: 'testnet', contractId: clinical, registryId: registry,
    relayer, admin, patient: structuredClone(patient), doctor: structuredClone(doctor), historyId, doctorId: 10, startingGrantRevision: 3, startingDoctorVersion: 3,
    totalMaxFeeStroops: '80000000', reviewer: { userId: 'did:privy:rehearsal_admin', email: 'reviewer@example.test' }, steps,
    authorization: { requestId: steps[0].requestId, dossierId: id(40), validUntil: now + 86400, expectedVersion: 3, targetVersion: 4, method: 'reauthorize_doctor' } };
}
function environment() {
  return { TRUSTLEAF_ENV: 'local', TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
    DATABASE_URL: 'postgresql://unit:synthetic@ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech/test',
    TRUSTLEAF_DB_HOST: 'ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech', CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: clinical,
    RELAYER_SECRET: key(110).secret(), DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: registry, DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: admin, BOOKING_AUTHORITY_PUBLIC_KEY: admin };
}
function withFile(work, mutate = plan => plan) {
  const directory = mkdtempSync(join(tmpdir(), 'trustleaf-policy-unit-'));
  try {
    const plan = mutate(fixture()), file = join(directory, 'plan.json'), bytes = Buffer.from(JSON.stringify(plan));
    writeFileSync(file, bytes, { mode: 0o600 });
    const digest = sha(bytes).toString('hex'), env = { ...environment(), TRUSTLEAF_CLINICAL_REHEARSAL_FILE: file, TRUSTLEAF_CLINICAL_REHEARSAL_HASH: digest, TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH: digest };
    return work({ plan, file, env, directory, bytes });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const loaded = (env, options = {}) => loadRehearsalPolicy({ env, now, ...options });
const rejects = mutate => withFile(({ env }) => assert.throws(() => loaded(env), /clinical_rehearsal_/), plan => { mutate(plan); return plan; });

test('no variables leaves the existing environment untouched; any partial configuration fails closed', () => {
  assert.equal(rehearsalConfigured({}), false); assert.equal(loadRehearsalPolicy({ env: {} }), null);
  for (const name of ['FILE', 'HASH', 'APPROVED_HASH']) {
    const env = { ...environment(), [`TRUSTLEAF_CLINICAL_REHEARSAL_${name}`]: '' };
    assert.equal(rehearsalConfigured(env), true); assert.throws(() => loaded(env), /clinical_rehearsal_/);
  }
});
test('loads exact approved bytes into a deeply immutable eight-step scope', () => withFile(({ env }) => {
  const policy = loaded(env); assert.equal(policy.policyHash, env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH);
  assert.equal(policy.steps.length, 8); assert(Object.isFrozen(policy.steps[3].input.note));
  assert.throws(() => { policy.steps[3].input.note.text = 'changed'; });
  assert.equal(Object.keys(policy).includes('policyHash'), false);
}));
test('preview is explicit and cannot accept a mismatched approval or changed bytes', () => withFile(({ env, file }) => {
  delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
  assert.throws(() => loaded(env), /approval_required/); assert(loaded(env, { requireApproval: false }));
  env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH = 'a'.repeat(64); assert.throws(() => loaded(env, { requireApproval: false }), /approval_required/);
  env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH = env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH;
  writeFileSync(file, JSON.stringify({ ...fixture(), until: now + 10 })); assert.throws(() => loaded(env), /clinical_rehearsal_/);
}));
test('private manifest must be an absolute regular file outside the checkout and synced folders', () => withFile(({ env, directory }) => {
  assert.throws(() => loaded({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: 'relative-plan.json' }));
  assert.throws(() => loaded({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: resolve('package.json') }));
  assert.throws(() => loaded({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: directory }));
  const folder = join(directory, 'OneDrive'); mkdirSync(folder); const file = join(folder, 'plan.json'); writeFileSync(file, JSON.stringify(fixture()));
  assert.throws(() => loaded({ ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: file }));
}));
test('global writes, hosted environments, mainnet, wrong contracts and conflicting exceptions fail closed', () => withFile(({ env }) => {
  for (const patch of [{ TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true' }, { TRUSTLEAF_ENV: 'test' }, { VERCEL_ENV: '' }, { VERCEL: '1' }, { NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet' },
    { CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: registry }, { DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: clinical }, { DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: relayer },
    { TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET: '' }, { TRUSTLEAF_CLINICAL_PATIENT_DEMO_ENABLED: 'false' }, { TRUSTLEAF_CLINICAL_MIGRATION: 'false' }]) assert.throws(() => loaded({ ...env, ...patch }), /clinical_rehearsal_/);
}));
test("uses the application exact dedicated/database/postgres precedence and dev-host guard", () => withFile(({ env }) => {
  assert(loaded({ ...env, DATABASE_URL: 'bad', TRUSTLEAF_DATABASE_URL: env.DATABASE_URL }));
  assert.throws(() => loaded({ ...env, TRUSTLEAF_DATABASE_URL: '' }));
  assert.throws(() => loaded({ ...env, DATABASE_URL: undefined, POSTGRES_URL: env.DATABASE_URL }));
  assert.throws(() => loaded({ ...env, DATABASE_URL: 'postgresql://unit:synthetic@ep-rapid-shadow-ahq94785.c-3.us-east-1.aws.neon.tech/test' }));
  assert.throws(() => loaded({ ...env, TRUSTLEAF_DB_HOST: 'other.neon.tech' }));
}));
test('time window is bounded and cannot silently extend the 24-hour authorization', () => {
  rejects(p => { p.until = now + 6 * 3600 + 1; }); rejects(p => { p.createdAt = now + 1; }); rejects(p => { p.until = now; });
  rejects(p => { p.doctorValidUntil++; }); rejects(p => { p.authorization.validUntil++; });
  withFile(({ env }) => { assert.throws(() => loaded(env, { now: now + 6 * 3600 }), /expired/); assert(loaded(env, { now: now + 6 * 3600 - 1 })); });
});
test('reviewer, authority, target identity, history and current starting revisions are exact', () => {
  for (const mutate of [p => { p.reviewer.email = 'Reviewer@example.test'; }, p => { p.admin = relayer; }, p => { p.doctor = { ...p.patient }; },
    p => { p.historyId = 'f'.repeat(64); }, p => { p.doctorId = 11; }, p => { p.startingGrantRevision = 4; }, p => { p.startingDoctorVersion = 4; },
    p => { p.authorization.method = 'renew_authorization'; }, p => { p.authorization.targetVersion = 5; }, p => { p.authorization.requestId = id(99); },
    p => { p.unknown = 'field'; }, p => { p.steps[3].actor = 'patient'; }]) rejects(mutate);
});
test('slots, operation nonces, order and total offered fee caps cannot expand', () => {
  for (const mutate of [p => { p.steps.push({ ...p.steps[0], requestId: id(99) }); }, p => { p.steps[2].requestId = p.steps[1].requestId; },
    p => { p.steps[2].operationId = p.steps[1].operationId; }, p => { delete p.steps[3].operationId; }, p => { p.steps[1].operationId = '0'.repeat(64); },
    p => { [p.steps[1], p.steps[2]] = [p.steps[2], p.steps[1]]; }, p => { p.steps[0].maxFeeStroops = '10000001'; },
    p => { p.totalMaxFeeStroops = '79999999'; }, p => { p.totalMaxFeeStroops = '80000001'; }, p => { p.steps[2].maxFeeStroops = '1e7'; }]) rejects(mutate);
});
test('only the four reviewed patient permission states and exact doctor are accepted', () => {
  for (const mutate of [p => { p.steps[1].input.canAppend = true; }, p => { p.steps[2].input.canRead = true; }, p => { p.steps[4].input.expectedRevision = 6; },
    p => { p.steps[7].input.expectedRevision = 4; }, p => { p.steps[7].input.canRead = true; }, p => { p.steps[1].input.doctorId = 11; }, p => { p.steps[1].input.historyId = historyId; }]) rejects(mutate);
});
test('reviewed notes, historical recipe and derived correction entry cannot be replaced', () => {
  for (const mutate of [p => { p.steps[3].input.note.prescriptionId = 'forged'; }, p => { p.steps[3].input.entryId = entryId; }, p => { p.steps[3].input.expectedVersion = 1; },
    p => { p.steps[6].input.note.prescriptionId = id(21); }, p => { p.steps[6].input.entryId = 'f'.repeat(64); }, p => { p.steps[6].input.expectedVersion = 2; },
    p => { p.steps[6].input.note = { ...p.steps[3].input.note }; }, p => { p.steps[5].input.file.mediaType = 'image/png'; }, p => { p.steps[5].input.file.base64 = Buffer.from('not PDF').toString('base64'); }]) rejects(mutate);
});
test('actor role requires the complete user/wallet binding and never identifies the authority as a clinical actor', () => withFile(({ env }) => {
  const policy = loaded(env); assert.equal(assertRehearsalActor(policy, patient), 'patient'); assert.equal(assertRehearsalActor(policy, doctor), 'doctor');
  for (const patch of [{ userId: doctor.userId }, { walletId: doctor.walletId }, { address: doctor.address }]) assert.throws(() => assertRehearsalActor(policy, { ...patient, ...patch }));
  assert.throws(() => assertRehearsalActor(policy, { userId: policy.reviewer.userId, address: admin, walletId: 'authority' }));
}));
test('matches exact canonical payloads while retaining the fixed UUID on retries', () => withFile(({ env }) => {
  const policy = loaded(env), step = policy.steps[3];
  assert.equal(rehearsalStep(policy, doctor, structuredClone(step.input)), step);
  assert.equal(rehearsalStep(policy, doctor, { note: step.input.note, historyId, action: step.action, requestId: step.requestId }), step);
  for (const patch of [{ requestId: id(99) }, { historyId: 'f'.repeat(64) }, { expectedVersion: 0 }, { action: 'create_history' }, { note: { ...step.input.note, text: 'other' } }]) assert.throws(() => rehearsalStep(policy, doctor, { ...step.input, ...patch }));
  assert.throws(() => rehearsalStep(policy, patient, step.input));
}));
test('emergency withdrawal accepts only revision4/5/6, same UUID, same doctor and both flags false', () => withFile(({ env }) => {
  const policy = loaded(env), step = policy.steps[7];
  for (const expectedRevision of [4, 5, 6]) assert.equal(rehearsalStep(policy, patient, { ...step.input, expectedRevision }), step);
  for (const expectedRevision of [0, 3, 7, '4', null]) assert.throws(() => rehearsalStep(policy, patient, { ...step.input, expectedRevision }));
  assert.throws(() => rehearsalStep(policy, patient, { ...step.input, expectedRevision: 4, canAppend: true }));
}));
test('fee checks include the full offered envelope, approved source, fixed slot and bounded maxTime', () => withFile(({ env }) => {
  const policy = loaded(env), step = policy.steps[3], quote = { feeStroops: '10000000', maxTime: now + 180, source: doctor.address, now };
  assert.equal(assertRehearsalFee(policy, step, quote), 10000000n);
  assert.equal(assertRehearsalFee(policy, policy.steps[0], { ...quote, source: admin }), 10000000n);
  for (const patch of [{ feeStroops: '10000001' }, { feeStroops: '0' }, { feeStroops: '-1' }, { feeStroops: '1e7' }, { feeStroops: 100 },
    { source: patient.address }, { maxTime: policy.until + 1 }, { maxTime: now }, { now: policy.until }]) assert.throws(() => assertRehearsalFee(policy, step, { ...quote, ...patch }));
  assert.throws(() => assertRehearsalFee(policy, { ...step, maxFeeStroops: '9999999' }, quote));
  assert.throws(() => assertRehearsalFee(policy, { ...step, requestId: id(99) }, quote));
}));
test('canonical hashing rejects non-JSON inputs and preserves exact data independently of object key order', () => {
  assert.equal(payloadHash({ b: 2, a: 1 }), payloadHash({ a: 1, b: 2 })); assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: '1' }));
  assert.equal(canonicalJSON([1, null, 'text']), '[1,null,"text"]');
  const cycle = {}; cycle.next = cycle;
  for (const input of [undefined, NaN, Infinity, 1n, () => {}, new Date(), { bad: undefined }, cycle, new Array(2)]) assert.throws(() => canonicalJSON(input));
});

test('activation pins the real payer public key; preview may omit a key but never accepts a different payer', () => withFile(({ env }) => {
  assert.throws(() => loaded({ ...env, RELAYER_SECRET: undefined }));
  assert.throws(() => loaded({ ...env, RELAYER_SECRET: key(111).secret() }));
  assert.throws(() => loaded({ ...env, RELAYER_SECRET: 'invalid-local-synthetic-secret' }));
  assert(loaded({ ...env, RELAYER_SECRET: undefined }, { requireApproval: false }));
  assert.throws(() => loaded({ ...env, RELAYER_SECRET: key(111).secret() }, { requireApproval: false }));
}));


test('an expired prepared attempt is distinct from an expired approved rehearsal window', () => withFile(({ env }) => {
  const policy = loaded(env), step = policy.steps[3];
  const quote = { feeStroops: '10000000', maxTime: now, source: doctor.address, now };
  assert.throws(() => assertRehearsalFee(policy, step, quote), { message: 'signature_request_expired' });
  assert.throws(() => assertRehearsalFee(policy, step, { ...quote, maxTime: now - 1 }), { message: 'signature_request_expired' });
  assert.throws(() => assertRehearsalFee(policy, step, { ...quote, now: policy.until }), { message: 'clinical_rehearsal_expired' });
  assert.equal(assertRehearsalFee(policy, step, { ...quote, maxTime: now + 1 }), 10000000n);
}));


const continuationReceipts = ['3cf5ccedbbcc8aa796662b1af869996e0a474934e7b5b62eaa78c805b318e4bb','0e9798dd745f544ee70b818fb860abb78de4663fbca0e0c4c2d3454070931215','43e1f8d254c4d6deba5c5c2e35f324806cfd2ea4498ddc84e52feb6e450c9f0f'];
function deriveTest(kind, ...values) { return sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind), nativeToScVal(sha(Networks.TESTNET)), new Address(clinical).toScVal(), ...values]).toXDR()).toString('hex'); }
function withContinuationFile(work, mutate = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'trustleaf-continuation-policy-unit-'));
  try {
    const original = fixture();
    original.patient.address = 'GDUIUM2OR4LCV4Y6R3ZQRWMC3FZR4QRYWHQ4MKZISQ56K3ZNSGVWBMO5'; original.patient.email = 'patient@example.test';
    original.doctor.address = 'GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX'; original.doctor.email = 'doctor@example.test';
    original.createdAt = now - 86400; original.until = original.createdAt + 21600; original.doctorValidUntil = now; original.authorization.validUntil = now;
    original.historyId = deriveTest('hist_id', new Address(original.patient.address).toScVal());
    for (const index of [3,5,6]) original.steps[index].input.historyId = original.historyId;
    original.steps[6].input.entryId = deriveTest('entry_id',nativeToScVal(Buffer.from(original.historyId,'hex')),new Address(original.doctor.address).toScVal(),nativeToScVal(Buffer.from(original.steps[3].operationId,'hex')));
    const originalFile = join(directory,'original.json'), originalBytes = Buffer.from(JSON.stringify(original)); writeFileSync(originalFile,originalBytes);
    const steps = [0,3,4,5,6,7].map((oldIndex,index) => {
      const step = structuredClone(original.steps[oldIndex]); step.requestId = id(101+index);
      if (index) { step.operationId = operation(9+index); step.input.requestId = step.requestId; } return step;
    });
    steps[4].input.entryId = deriveTest('entry_id',nativeToScVal(Buffer.from(original.historyId,'hex')),new Address(original.doctor.address).toScVal(),nativeToScVal(Buffer.from(steps[1].operationId,'hex')));
    const raw = { schemaVersion:2,runId:id(130),preparedAt:now-60,notBefore:now,executionWindowSeconds:21600,doctorWindowSeconds:86400,
      network:original.network,contractId:clinical,registryId:registry,relayer,admin,patient:structuredClone(original.patient),doctor:structuredClone(original.doctor),historyId:original.historyId,doctorId:10,startingGrantRevision:5,startingDoctorVersion:4,totalMaxFeeStroops:'60000000',reviewer:structuredClone(original.reviewer),steps,
      authorization:{requestId:steps[0].requestId,dossierId:id(140),expectedVersion:4,targetVersion:5,method:'reauthorize_doctor'},
      lineage:{originalPlanFile:originalFile,originalPlanHash:sha(originalBytes).toString('hex'),originalRunId:original.runId,priorDoctorValidUntil:now,
        confirmed:[0,1,2].map(index=>({key:original.steps[index].key,requestId:original.steps[index].requestId,transactionHash:continuationReceipts[index]})),
        cancelledNote:{requestId:original.steps[3].requestId,operationId:original.steps[3].operationId,expiresAt:original.createdAt+180}} };
    const approval = {schemaVersion:1,planHash:'pending',approvedAt:now-30,statement:'Autorización humana sintética para pruebas aisladas.'};
    mutate(raw,approval,original);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex'); writeFileSync(file,bytes);
    approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval)); writeFileSync(approvalFile,approvalBytes);
    const env={...environment(),TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,original,file,env,directory,approval,approvalFile,approvalBytes});
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
const rejectContinuation = mutate => withContinuationFile(({env})=>assert.throws(()=>loaded(env),/clinical_rehearsal_/),mutate);
test('continuation derives fixed six-hour and 24-hour dates only from its separately pinned human approval',()=>withContinuationFile(({raw,approval,env})=>{
  assert.equal(raw.createdAt,undefined); assert.equal(raw.until,undefined); assert.equal(raw.authorization.validUntil,undefined);
  const policy=loaded(env); assert.equal(policy.schemaVersion,2); assert.equal(policy.steps.length,6);
  assert.equal(policy.createdAt,approval.approvedAt); assert.equal(policy.until,approval.approvedAt+21600); assert.equal(policy.doctorValidUntil,approval.approvedAt+86400); assert.equal(policy.authorization.validUntil,policy.doctorValidUntil);
  assert.equal(policy.authorization.expectedVersion,4); assert.equal(policy.authorization.targetVersion,5);
  assert.equal(loaded(env,{now:now+10}).until,policy.until); assert(Object.isFrozen(policy.previousSteps));
  assert.equal(Object.keys(policy).includes('previousAuthorization'),false); assert.equal(Object.keys(policy).includes('approvalHash'),false);
}));
test('continuation cannot inherit v1 approval or change its approval date on reload',()=>withContinuationFile(({approval,env,approvalFile})=>{
  assert.throws(()=>loaded({...env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH}),/approval_required/);
  writeFileSync(approvalFile,JSON.stringify({...approval,approvedAt:approval.approvedAt+1})); assert.throws(()=>loaded(env),/approval_required/);
}));
test('unapproved continuation needs explicit in-memory preview and cannot activate from that preview',()=>withContinuationFile(({approval,env,approvalFile})=>{
  delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH; unlinkSync(approvalFile);
  assert.throws(()=>loaded(env),/approval_required/); assert.throws(()=>loaded(env,{requireApproval:false}),/approval_required/);
  assert(loaded(env,{requireApproval:false,previewApproval:approval}));
  assert.throws(()=>loaded(env,{previewApproval:approval}),/approval_required/);
  assert.throws(()=>loaded({...env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:'a'.repeat(64)},{requireApproval:false,previewApproval:approval}),/approval_required/);
}));
test('early approval may wait for fixed notBefore but cannot shift either deadline',()=>withContinuationFile(({approval,env})=>{
  assert(approval.approvedAt<now);
  assert.throws(()=>loaded(env,{now:now-1}),{message:'clinical_rehearsal_not_started'});
  const policy=loaded(env); assert.equal(policy.until,approval.approvedAt+21600);
  assert.throws(()=>loaded(env,{now:policy.until}),{message:'clinical_rehearsal_expired'});
  assert(loaded(env,{now:policy.until-1}));
}));
test('continuation rejects fake approval timestamps, configurable durations and substituted old authority',()=>{
  for(const mutate of [(_p,a)=>{a.approvedAt=now+1;},(p,a)=>{a.approvedAt=p.preparedAt-1;},(_p,a)=>{a.approvedAt=String(now);},(_p,a)=>{a.statement='';},(_p,a)=>{a.unrecognized=true;},
    p=>{p.executionWindowSeconds++;},p=>{p.doctorWindowSeconds++;},p=>{p.notBefore--;},p=>{p.authorization.validUntil=now+86400;},p=>{p.authorization.expectedVersion=3;},p=>{p.authorization.targetVersion=6;},
    p=>{p.startingGrantRevision=3;},p=>{p.lineage.confirmed[1].transactionHash='a'.repeat(64);},p=>{p.lineage.cancelledNote.requestId=id(999);},p=>{p.lineage.originalPlanHash='f'.repeat(64);},p=>{p.lineage.priorDoctorValidUntil--;},p=>{p.lineage.originalRunId=id(999);}]) rejectContinuation(mutate);
});
test('continuation only permits six new fixed slots and exact original payloads for the existing pair',()=>{
  for(const mutate of [p=>{p.steps.push({...p.steps[0],requestId:id(999)});},p=>{p.steps[1].requestId=p.lineage.cancelledNote.requestId;p.steps[1].input.requestId=p.steps[1].requestId;},
    p=>{p.steps[2].operationId=p.steps[1].operationId;},p=>{p.steps[1].operationId=p.lineage.cancelledNote.operationId;},p=>{p.totalMaxFeeStroops='60000001';},p=>{p.steps[0].maxFeeStroops='10000001';},
    p=>{p.steps[1].input.note.text='other';},p=>{p.steps[1].input.note.prescriptionId=id(999);},p=>{p.steps[3].input.file.fileName='changed.pdf';},p=>{p.steps[4].input.entryId='a'.repeat(64);},
    p=>{p.steps[2].input.expectedRevision=4;},p=>{p.steps[5].input.canAppend=true;},p=>{p.patient.address=patient.address;},p=>{p.doctor.email='other@example.test';},p=>{p.reviewer.email='other@example.test';}]) rejectContinuation(mutate);
});
test('continuation withdrawal reuses its one fixed UUID only for revision5/6',()=>withContinuationFile(({env})=>{
  const policy=loaded(env),step=policy.steps[5];
  for(const expectedRevision of [5,6]) assert.equal(rehearsalStep(policy,policy.patient,{...step.input,expectedRevision}),step);
  for(const expectedRevision of [3,4,7,'5']) assert.throws(()=>rehearsalStep(policy,policy.patient,{...step.input,expectedRevision}));
  assert.throws(()=>rehearsalStep(policy,policy.patient,{...step.input,expectedRevision:5,canRead:true}));
}));
test('continuation approval file remains private and pinned even if a readable sibling is substituted',()=>withContinuationFile(({env,approvalFile,directory})=>{
  const replacement=join(directory,'OneDrive - Company'); mkdirSync(replacement); const privateFile=join(replacement,'plan.json');
  // The manifest itself cannot move into a synced directory even with identical bytes.
  const bytes=Buffer.from(JSON.stringify({})); writeFileSync(privateFile,bytes);
  assert.throws(()=>loaded({...env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:privateFile}),/clinical_rehearsal_/);
  unlinkSync(approvalFile); assert.throws(()=>loaded(env),/clinical_rehearsal_/);
}));

test('a fee above the fixed one-XLM maximum reports budget exceeded rather than rejected scope',()=>withFile(({env})=>{
 const policy=loaded(env),step=policy.steps[3],quote={maxTime:now+180,source:doctor.address,now};
 assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:'10000000'}),10000000n);
 for(const feeStroops of ['10000001',10000001n,'34416380'])assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops}),{message:'clinical_rehearsal_fee_exceeded'});
 for(const feeStroops of ['0','-1','1e7'])assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops}),{message:'clinical_rehearsal_scope_rejected'});
}));


const confirmedContinuationRenewal = '683f4082e8c4563434760ef008b83c94f959a27ef7dcee05e8c3ab77923ae424';
function withFeeAmendment(work, { version = 3, mutate = () => {} } = {}) {
  return withContinuationFile(base => {
    const directory = join(base.directory, 'amendment'); mkdirSync(directory);
    const raw = { schemaVersion:version, amendmentId:id(230), preparedAt:version === 3 ? now-20 : base.approval.approvedAt+21610,
      basePlanFile:base.file, basePlanHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH,
      baseApprovalFile:base.approvalFile, baseApprovalHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH,
      doctorMaxFeeStroops:'50000000', permissionMaxFeeStroops:'10000000', remainingMaxFeeStroops:'170000000',
      ...(version === 4 ? {executionWindowSeconds:21600,confirmedRenewalTransactionHash:confirmedContinuationRenewal} : {}) };
    const approval = {schemaVersion:1,planHash:'pending',approvedAt:raw.preparedAt+10,statement:'Explicit synthetic budget and, when applicable, continuation approval.'};
    mutate(raw,approval,base);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex'); writeFileSync(file,bytes);
    approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval)); writeFileSync(approvalFile,approvalBytes);
    const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,approval,env,file,approvalFile,base,effectiveNow:Math.max(now,approval.approvedAt)});
  });
}
const amended = context => loaded(context.env,{now:context.effectiveNow});
const rejectAmendment = (mutate,version=3) => withFeeAmendment(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),{mutate,version});

for (const version of [3,4]) test('schema'+version+' amendment changes only authorized fees, scoped metadata and its explicit execution window',()=>withFeeAmendment(context=>{
  const policy=amended(context),base=loaded(context.base.env);
  const expected=structuredClone(base); expected.steps.forEach(step=>{if(step.actor==='doctor')step.maxFeeStroops='50000000';}); expected.totalMaxFeeStroops='180000000';
  if(version===4)expected.until=Math.min(context.approval.approvedAt+21600,base.doctorValidUntil);
  assert.deepEqual({...policy},expected);
  assert.equal(policy.schemaVersion,2); assert.equal(policy.runId,base.runId); assert.equal(policy.createdAt,base.createdAt);
  assert.equal(policy.doctorValidUntil,base.doctorValidUntil); assert.deepEqual(policy.authorization,base.authorization);
  assert.deepEqual(policy.previousSteps,base.previousSteps); assert.deepEqual(policy.previousAuthorization,base.previousAuthorization);
  assert.equal(Object.keys(policy).includes('feeAmendment'),false); assert(Object.isFrozen(policy.feeAmendment));
  assert(Object.isFrozen(policy.steps)); assert(Object.isFrozen(policy.steps[1].input.note));
  assert.equal(policy.feeAmendment.baseApprovedAt,base.createdAt); assert.equal(policy.feeAmendment.baseUntil,base.until);
  assert.equal(policy.feeAmendment.approvedAt,context.approval.approvedAt);
  if(version===4){
    assert.equal(policy.feeAmendment.executionApprovedAt,context.approval.approvedAt);
    assert.equal(policy.feeAmendment.confirmedRenewalTransactionHash,confirmedContinuationRenewal);
    assert.equal(policy.feeAmendment.originalUntil,base.until); assert.equal(policy.feeAmendment.executionUntil,policy.until);
  }else{assert.equal(policy.until,base.until);assert.equal(policy.feeAmendment.executionApprovedAt,undefined);}
},{version}));

for (const version of [3,4]) test('schema'+version+' enforces three five-XLM medical caps, one-XLM permission caps and no clone-based increase',()=>withFeeAmendment(context=>{
  const policy=amended(context);
  for(const step of policy.steps){
    const quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:context.effectiveNow,maxTime:context.effectiveNow+180};
    const cap=step.actor==='doctor'?50000000n:10000000n;
    assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:cap}),cap);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:cap+1n}),{message:'clinical_rehearsal_fee_exceeded'});
  }
  const step=policy.steps[1],quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+180,feeStroops:'34416380'};
  assert.equal(assertRehearsalFee(policy,step,quote),34416380n);
  for(const clone of [{...policy,feeAmendment:policy.feeAmendment},structuredClone(policy)]){
    assert.throws(()=>assertRehearsalFee(clone,clone.steps[1],quote),{message:'clinical_rehearsal_fee_exceeded'});
  }
  const base=loaded(context.base.env),baseStep=base.steps[1];
  assert.throws(()=>assertRehearsalFee(base,baseStep,{...quote,now,maxTime:now+180}),{message:'clinical_rehearsal_fee_exceeded'});
},{version}));

test('a forged fee amendment on an ordinary v1 policy never raises its absolute cap',()=>withFile(({env})=>{
  const policy=loaded(env),clone={...policy,feeAmendment:{doctorMaxFeeStroops:'50000000'}};
  clone.steps=clone.steps.map(step=>({...step,maxFeeStroops:'50000000'}));
  assert.throws(()=>assertRehearsalFee(clone,clone.steps[3],{feeStroops:'34416380',source:doctor.address,now,maxTime:now+180}),{message:'clinical_rehearsal_fee_exceeded'});
}));

test('schema3 late budget approval never revives the original execution window',()=>{
  rejectAmendment((_raw,approval,base)=>{approval.approvedAt=base.approval.approvedAt+21600;});
  withFeeAmendment(context=>{
    const policy=amended(context);
    assert.throws(()=>loaded(context.env,{now:policy.until}),{message:'clinical_rehearsal_expired'});
    assert.throws(()=>loaded(context.env,{now:policy.until+9*3600}),{message:'clinical_rehearsal_expired'});
    assert.equal(loaded(context.env,{now:policy.until-1}).until,policy.until);
  });
});

test('each amendment needs its own freshly pinned approval and cannot inherit the base approval',()=>{
  for(const version of [3,4])withFeeAmendment(context=>{
    assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash},{now:context.effectiveNow}),/approval_required/);
    writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));
    assert.throws(()=>amended(context),/approval_required/);
  },{version});
});

test('amendment preview is read-only and cannot itself confer five-XLM signing authority',()=>withFeeAmendment(context=>{
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH; unlinkSync(context.approvalFile);
  assert.throws(()=>amended(context),/approval_required/);
  const policy=loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval});
  assert.equal(policy.steps[1].maxFeeStroops,'50000000');
  assert.throws(()=>assertRehearsalFee(policy,policy.steps[1],{feeStroops:'34416380',source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+180}),{message:'clinical_rehearsal_fee_exceeded'});
}));

test('amendments reject extra fields, cap expansion, wrong bases and malformed fresh approvals',()=>{
  const mutations=[raw=>{raw.unknown=true;},raw=>{raw.doctorMaxFeeStroops='50000001';},raw=>{raw.permissionMaxFeeStroops='10000001';},raw=>{raw.remainingMaxFeeStroops='170000001';},
    raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},raw=>{raw.basePlanFile='relative.json';},raw=>{raw.baseApprovalFile=raw.basePlanFile;},
    raw=>{raw.amendmentId='bad';},(_raw,approval)=>{approval.statement='';},(_raw,approval)=>{approval.extra='field';},(raw,approval)=>{approval.approvedAt=raw.preparedAt-1;}];
  for(const version of [3,4])for(const mutate of mutations)rejectAmendment(mutate,version);
  rejectAmendment(raw=>{raw.preparedAt=now+1;});
  rejectAmendment(raw=>{raw.executionWindowSeconds=21600;});
  for(const mutate of [raw=>{raw.executionWindowSeconds++;},raw=>{raw.confirmedRenewalTransactionHash='f'.repeat(64);},raw=>{raw.preparedAt=now;},raw=>{delete raw.confirmedRenewalTransactionHash;}])rejectAmendment(mutate,4);
});

test('amendments reject tampered pinned base manifest or approval bytes without changing their own pins',()=>{
  for(const version of [3,4])for(const target of ['file','approvalFile'])withFeeAmendment(context=>{
    writeFileSync(context.base[target],JSON.stringify({tampered:true}));assert.throws(()=>amended(context),/clinical_rehearsal_/);
  },{version});
});

test('schema4 has a single new six-hour window and never extends the existing doctor authorization',()=>withFeeAmendment(context=>{
  const policy=amended(context),approvalAt=context.approval.approvedAt;
  assert.equal(policy.until,approvalAt+21600);
  assert.equal(loaded(context.env,{now:approvalAt+1}).until,policy.until);
  assert.throws(()=>loaded(context.env,{now:approvalAt-1}),{message:'clinical_rehearsal_expired'});
  assert.throws(()=>loaded(context.env,{now:policy.until}),{message:'clinical_rehearsal_expired'});
  assert.throws(()=>assertRehearsalFee(policy,policy.steps[1],{feeStroops:'1',source:policy.doctor.address,now:approvalAt-1,maxTime:approvalAt+1}),{message:'clinical_rehearsal_expired'});
},{version:4}));

test('schema4 caps the new execution window at the fixed already-confirmed doctor expiry',()=>withFeeAmendment(context=>{
  const policy=amended(context),base=loaded(context.base.env);
  assert.equal(policy.until,base.doctorValidUntil);assert.equal(policy.doctorValidUntil,base.doctorValidUntil);
  assert.equal(policy.authorization.validUntil,base.authorization.validUntil);
  assert(policy.until<context.approval.approvedAt+21600);
  assert.throws(()=>loaded(context.env,{now:policy.doctorValidUntil}),{message:'clinical_rehearsal_expired'});
},{version:4,mutate:(_raw,approval,base)=>{approval.approvedAt=base.approval.approvedAt+86400-60;}}));


function withNoteReplacement(work, mutate = () => {}) {
  return withFeeAmendment(base => {
    const directory=join(base.base.directory,'replacement');mkdirSync(directory);
    const oldStep=base.base.raw.steps[1],expiresAt=base.approval.approvedAt+300;
    const raw={schemaVersion:5,amendmentId:id(330),preparedAt:expiresAt+10,basePlanFile:base.file,basePlanHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH,
      baseApprovalFile:base.approvalFile,baseApprovalHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH,replacementNoteRequestId:id(331),replacementNoteOperationId:'f0'.repeat(32),
      supersededNote:{requestId:oldStep.requestId,operationId:oldStep.operationId,expiresAt,unsignedEnvelopeHash:'d'.repeat(64)}};
    const approval={schemaVersion:1,planHash:'pending',approvedAt:raw.preparedAt+5,statement:'Synthetic explicit consent for this single replacement note only.'};
    mutate(raw,approval,base);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
    const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
  },{version:4});
}
const rejectReplacement = mutate => withNoteReplacement(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);

test('schema5 replaces only one expired note identity and its derived correction target, preserving the approved plan',()=>withNoteReplacement(context=>{
  const policy=amended(context),base=amended(context.base),expected=structuredClone(base);
  expected.steps[1].requestId=context.raw.replacementNoteRequestId;expected.steps[1].input.requestId=context.raw.replacementNoteRequestId;expected.steps[1].operationId=context.raw.replacementNoteOperationId;
  expected.steps[4].input.entryId=deriveTest('entry_id',nativeToScVal(Buffer.from(base.historyId,'hex')),new Address(base.doctor.address).toScVal(),nativeToScVal(Buffer.from(context.raw.replacementNoteOperationId,'hex')));
  assert.deepEqual({...policy},expected);assert.deepEqual(policy.feeAmendment,base.feeAmendment);
  assert.equal(policy.createdAt,base.createdAt);assert.equal(policy.until,base.until);assert.equal(policy.doctorValidUntil,base.doctorValidUntil);assert.deepEqual(policy.authorization,base.authorization);
  assert.deepEqual(policy.previousSteps,base.previousSteps);assert.deepEqual(policy.previousAuthorization,base.previousAuthorization);
  assert.equal(Object.keys(policy).includes('noteReplacement'),false);assert(Object.isFrozen(policy.noteReplacement));assert(Object.isFrozen(policy.noteReplacement.supersededNote));assert(Object.isFrozen(policy.noteReplacement.supersededStep.input.note));
  assert.deepEqual(policy.noteReplacement.supersededStep,base.steps[1]);assert.deepEqual(policy.noteReplacement.supersededNote,context.raw.supersededNote);
  assert.equal(policy.noteReplacement.replacementNoteEntryId,policy.steps[4].input.entryId);
  assert.equal(policy.noteReplacement.approvedAt,context.approval.approvedAt);assert.equal(policy.approvalHash,context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH);
  assert.equal(rehearsalStep(policy,policy.doctor,policy.steps[1].input),policy.steps[1]);
  assert.throws(()=>rehearsalStep(policy,policy.doctor,base.steps[1].input),/scope_rejected/);
}));

test('schema5 keeps seventeen XLM across the five remaining slots and rejects forged or preview signing authority',()=>withNoteReplacement(context=>{
  const policy=amended(context);
  assert.equal(policy.steps.slice(1).reduce((sum,step)=>sum+BigInt(step.maxFeeStroops),0n),170000000n);
  for(const step of policy.steps){
    const cap=step.actor==='doctor'?50000000n:10000000n,quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:context.effectiveNow,maxTime:context.effectiveNow+60};
    assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:cap}),cap);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:cap+1n}),/fee_exceeded/);
  }
  const step=policy.steps[1],quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'34416380'};
  assert.throws(()=>assertRehearsalFee({...policy,feeAmendment:policy.feeAmendment,noteReplacement:policy.noteReplacement},step,quote),/fee_exceeded/);
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
  assert.throws(()=>amended(context),/approval_required/);
  const preview=loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval});
  assert.equal(preview.steps[1].requestId,context.raw.replacementNoteRequestId);
  assert.throws(()=>assertRehearsalFee(preview,preview.steps[1],quote),/fee_exceeded/);
}));

test('schema5 requires its own approval and both exact base4 pins',()=>{
  withNoteReplacement(context=>{
    assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash},{now:context.effectiveNow}),/approval_required/);
    writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);
  });
  for(const target of ['file','approvalFile'])withNoteReplacement(context=>{
    writeFileSync(context.base[target],JSON.stringify({tampered:true}));assert.throws(()=>amended(context),/clinical_rehearsal_/);
  });
});

test('schema5 rejects changed collateral fields, duplicate identities and a substituted terminal proof',()=>{
  for(const mutate of [raw=>{raw.unknown='value';},raw=>{raw.until=now+999999;},raw=>{raw.replacementNoteRequestId='bad';},raw=>{raw.replacementNoteOperationId='0'.repeat(64);},
    raw=>{raw.replacementNoteRequestId=raw.supersededNote.requestId;},raw=>{raw.replacementNoteOperationId=raw.supersededNote.operationId;},raw=>{raw.replacementNoteRequestId=raw.amendmentId;},
    (raw,_approval,base)=>{raw.replacementNoteRequestId=base.base.raw.steps[2].requestId;},(raw,_approval,base)=>{raw.replacementNoteOperationId=base.base.raw.steps[3].operationId;},
    (raw,_approval,base)=>{raw.replacementNoteRequestId=base.base.original.steps[3].requestId;},(raw,_approval,base)=>{raw.replacementNoteOperationId=base.base.original.steps[3].operationId;},
    (raw,_approval,base)=>{raw.replacementNoteRequestId=base.base.raw.runId;},(raw,_approval,base)=>{raw.replacementNoteRequestId=base.base.raw.authorization.dossierId;},
    raw=>{raw.supersededNote.requestId=id(999);},raw=>{raw.supersededNote.operationId='f'.repeat(64);},raw=>{raw.supersededNote.unsignedEnvelopeHash='0'.repeat(64);},raw=>{raw.supersededNote.extra=true;},
    raw=>{raw.basePlanHash='f'.repeat(64);},raw=>{raw.baseApprovalHash='e'.repeat(64);},raw=>{raw.baseApprovalFile=raw.basePlanFile;},(_raw,approval)=>{approval.statement='';}])rejectReplacement(mutate);
});

test('schema5 cannot change the live base4 deadline, sign before approval or replace a still-live note',()=>{
  for(const mutate of [raw=>{raw.preparedAt=raw.supersededNote.expiresAt-1;},(raw,_approval,base)=>{raw.supersededNote.expiresAt=base.approval.approvedAt;},
    (raw,_approval,base)=>{raw.supersededNote.expiresAt=base.approval.approvedAt+21601;},(raw,approval,base)=>{approval.approvedAt=base.approval.approvedAt+21600;}]){
    rejectReplacement(mutate);
  }
  rejectReplacement((raw,approval)=>{approval.approvedAt=raw.preparedAt-1;});
  withNoteReplacement(context=>{
    const policy=amended(context);
    assert.throws(()=>loaded(context.env,{now:context.approval.approvedAt-1}),/expired/);
    assert.throws(()=>loaded(context.env,{now:policy.until}),/expired/);
    assert.equal(loaded(context.env,{now:context.effectiveNow+1}).until,policy.until);
    for(const feeStroops of ['1','50000000']) assert.throws(()=>assertRehearsalFee(policy,policy.steps[1],{feeStroops,source:policy.doctor.address,now:context.approval.approvedAt-1,maxTime:context.approval.approvedAt+10}),/expired/);
    assert.equal(assertRehearsalFee(policy,policy.steps[1],{feeStroops:'50000000',source:policy.doctor.address,now:context.approval.approvedAt,maxTime:context.approval.approvedAt+10}),50000000n);
  });
});

test('schema5 accepts only a pinned raw4 base and never chains replacements',()=>{
  for(const version of [3,5])rejectReplacement((raw,_approval,base)=>{
    const changed={...base.raw,schemaVersion:version};
    const bytes=Buffer.from(JSON.stringify(changed));writeFileSync(base.file,bytes);raw.basePlanHash=sha(bytes).toString('hex');
    const approval={...base.approval,planHash:raw.basePlanHash},approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(base.approvalFile,approvalBytes);raw.baseApprovalHash=sha(approvalBytes).toString('hex');
  });
});


function withExpandedBudget(work, mutate = () => {}) {
  return withNoteReplacement(base => {
    const directory=join(base.base.base.directory,'expanded-budget');mkdirSync(directory);
    const raw={schemaVersion:6,amendmentId:id(430),preparedAt:base.approval.approvedAt+10,basePlanFile:base.file,basePlanHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH,
      baseApprovalFile:base.approvalFile,baseApprovalHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH,
      doctorMaxFeeStroops:'100000000',permissionMaxFeeStroops:'10000000',remainingMaxFeeStroops:'320000000'};
    const approval={schemaVersion:1,planHash:'pending',approvedAt:raw.preparedAt+10,statement:'Synthetic explicit approval of thirty-two XLM without changing the five identities or deadline.'};
    mutate(raw,approval,base);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
    const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
  });
}
const rejectExpandedBudget = mutate => withExpandedBudget(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);

test('schema6 changes only three medical caps and nominal total, preserving every approved identity, date and prerequisite',()=>withExpandedBudget(context=>{
  const policy=amended(context),base=amended(context.base),expected=structuredClone(base);
  expected.steps.forEach(step=>{if(step.actor==='doctor')step.maxFeeStroops='100000000';});expected.totalMaxFeeStroops='330000000';
  assert.deepEqual({...policy},expected);assert.equal(policy.schemaVersion,2);
  assert.deepEqual(policy.feeAmendment,base.feeAmendment);assert.deepEqual(policy.noteReplacement,base.noteReplacement);
  assert.deepEqual(policy.authorization,base.authorization);assert.deepEqual(policy.previousAuthorization,base.previousAuthorization);assert.deepEqual(policy.previousSteps,base.previousSteps);
  assert.equal(policy.until,base.until);assert.equal(policy.createdAt,base.createdAt);assert.equal(policy.doctorValidUntil,base.doctorValidUntil);assert.equal(policy.runId,base.runId);
  assert.equal(policy.steps.slice(1).reduce((sum,step)=>sum+BigInt(step.maxFeeStroops),0n),320000000n);
  for(let index=0;index<policy.steps.length;index++){
    assert.equal(policy.steps[index].requestId,base.steps[index].requestId);assert.equal(policy.steps[index].operationId,base.steps[index].operationId);
    assert.deepEqual(policy.steps[index].input,base.steps[index].input);
  }
  assert.equal(Object.keys(policy).includes('budgetAmendment'),false);assert(Object.isFrozen(policy.budgetAmendment));assert(Object.isFrozen(policy.steps[1].input.note));
  assert.equal(policy.budgetAmendment.approvedAt,context.approval.approvedAt);assert.equal(policy.budgetAmendment.basePlanHash,context.raw.basePlanHash);
  assert.equal(policy.policyHash,context.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH);assert.equal(policy.approvalHash,context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH);
}));

test('schema6 alone permits exactly ten XLM for doctors while keeping both permissions and historical renewal at one XLM',()=>withExpandedBudget(context=>{
  const policy=amended(context);
  for(const step of policy.steps){
    const quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:context.effectiveNow,maxTime:context.effectiveNow+60},cap=step.actor==='doctor'?100000000n:10000000n;
    assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:cap}),cap);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:cap+1n}),{message:'clinical_rehearsal_fee_exceeded'});
  }
  const base=amended(context.base),quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'65359530'};
  assert.throws(()=>assertRehearsalFee(base,base.steps[1],quote),/fee_exceeded/);
  assert.equal(assertRehearsalFee(policy,policy.steps[1],quote),65359530n);
  assert.equal(assertRehearsalFee(base,base.steps[1],{...quote,feeStroops:'50000000'}),50000000n);
  assert.throws(()=>assertRehearsalFee(base,base.steps[1],{...quote,feeStroops:'100000000'}),/fee_exceeded/);
}));

test('schema6 metadata cannot give a clone, forged object or in-memory preview any amplified signing authority',()=>withExpandedBudget(context=>{
  const policy=amended(context),quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'65359530'};
  for(const clone of [{...policy,feeAmendment:policy.feeAmendment,noteReplacement:policy.noteReplacement,budgetAmendment:policy.budgetAmendment},structuredClone(policy)]){
    assert.throws(()=>assertRehearsalFee(clone,clone.steps[1],quote),/fee_exceeded/);
    assert.equal(assertRehearsalFee(clone,clone.steps[1],{...quote,feeStroops:'10000000'}),10000000n);
  }
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
  assert.throws(()=>amended(context),/approval_required/);
  const preview=loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval});
  assert.equal(preview.steps[1].maxFeeStroops,'100000000');
  assert.throws(()=>assertRehearsalFee(preview,preview.steps[1],quote),/fee_exceeded/);
}));

test('schema6 requires its own fresh approval rather than the five-XLM base approval or financial answer',()=>{
  withExpandedBudget(context=>{
    assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash},{now:context.effectiveNow}),/approval_required/);
    writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);
  });
  for(const target of ['file','approvalFile'])withExpandedBudget(context=>{
    writeFileSync(context.base[target],JSON.stringify({tampered:true}));assert.throws(()=>amended(context),/clinical_rehearsal_/);
  });
});

test('schema6 cannot shift the old window, activate before its approval or exceed the existing execution deadline',()=>{
  for(const mutate of [(raw,approval)=>{approval.approvedAt=raw.preparedAt-1;},(raw,_approval,base)=>{raw.preparedAt=base.approval.approvedAt-1;},
    (_raw,approval,base)=>{approval.approvedAt=base.base.approval.approvedAt+21600;},raw=>{raw.until=now+999999;}])rejectExpandedBudget(mutate);
  withExpandedBudget(context=>{
    const policy=amended(context),step=policy.steps[1],quote={source:policy.doctor.address,maxTime:context.effectiveNow+10,feeStroops:'100000000'};
    assert.throws(()=>loaded(context.env,{now:context.effectiveNow-1}),/expired/);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,now:context.effectiveNow-1}),/expired/);
    assert.equal(assertRehearsalFee(policy,step,{...quote,now:context.effectiveNow}),100000000n);
    assert.equal(loaded(context.env,{now:context.effectiveNow+1}).until,policy.until);
    assert.throws(()=>loaded(context.env,{now:policy.until}),/expired/);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,now:context.effectiveNow,maxTime:policy.until+1}),/expired/);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,now:policy.until,maxTime:policy.until}),/expired/);
  });
});

test('schema6 rejects expanded caps, extra inputs, altered base pins and amendment UUID collisions',()=>{
  for(const mutate of [raw=>{raw.doctorMaxFeeStroops='100000001';},raw=>{raw.permissionMaxFeeStroops='10000001';},raw=>{raw.remainingMaxFeeStroops='320000001';},
    raw=>{raw.unknown=true;},raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},raw=>{raw.baseApprovalFile=raw.basePlanFile;},raw=>{raw.basePlanFile='relative.json';},
    (raw,_approval,base)=>{raw.amendmentId=base.raw.amendmentId;},(raw,_approval,base)=>{raw.amendmentId=base.raw.replacementNoteRequestId;},
    (raw,_approval,base)=>{raw.amendmentId=base.base.base.raw.authorization.dossierId;},(_raw,approval)=>{approval.extra='field';},(_raw,approval)=>{approval.statement='';}])rejectExpandedBudget(mutate);
});

test('schema6 accepts only a pinned raw5 base and cannot chain another budget amendment',()=>{
  for(const version of [1,2,3,4,6])rejectExpandedBudget((raw,_approval,base)=>{
    const changed={...base.raw,schemaVersion:version},bytes=Buffer.from(JSON.stringify(changed));writeFileSync(base.file,bytes);raw.basePlanHash=sha(bytes).toString('hex');
    const approval={...base.approval,planHash:raw.basePlanHash},approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(base.approvalFile,approvalBytes);raw.baseApprovalHash=sha(approvalBytes).toString('hex');
  });
});


const fortyXlmTuple = raw => {raw.permissionMaxFeeStroops='50000000';raw.remainingMaxFeeStroops='400000000';};

test('the exact forty-XLM schema6 tuple raises only the two patient caps beyond the existing thirty-two-XLM tuple',()=>withExpandedBudget(context=>{
  const policy=amended(context),base=amended(context.base),expected=structuredClone(base);
  expected.steps.forEach(step=>{step.maxFeeStroops=step.actor==='doctor'?'100000000':step.actor==='patient'?'50000000':'10000000';});expected.totalMaxFeeStroops='410000000';
  assert.deepEqual({...policy},expected);
  assert.equal(policy.steps.slice(1).reduce((sum,step)=>sum+BigInt(step.maxFeeStroops),0n),400000000n);
  assert.equal(policy.steps.slice(2).reduce((sum,step)=>sum+BigInt(step.maxFeeStroops),0n),300000000n);
  for(let index=0;index<policy.steps.length;index++){
    assert.equal(policy.steps[index].requestId,base.steps[index].requestId);assert.equal(policy.steps[index].operationId,base.steps[index].operationId);assert.deepEqual(policy.steps[index].input,base.steps[index].input);
  }
  assert.deepEqual(policy.feeAmendment,base.feeAmendment);assert.deepEqual(policy.noteReplacement,base.noteReplacement);assert.deepEqual(policy.authorization,base.authorization);
  assert.equal(policy.until,base.until);assert.equal(policy.createdAt,base.createdAt);assert.equal(policy.doctorValidUntil,base.doctorValidUntil);
  assert.equal(policy.budgetAmendment.permissionMaxFeeStroops,'50000000');assert.equal(policy.budgetAmendment.remainingMaxFeeStroops,'400000000');assert(Object.isFrozen(policy.budgetAmendment));
},fortyXlmTuple));

test('the approved forty-XLM tuple enforces patient five-XLM, doctor ten-XLM and administrator one-XLM boundaries',()=>withExpandedBudget(context=>{
  const policy=amended(context),base=amended(context.base);
  for(const step of policy.steps){
    const cap=step.actor==='doctor'?100000000n:step.actor==='patient'?50000000n:10000000n,quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:context.effectiveNow,maxTime:context.effectiveNow+60};
    assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:cap}),cap);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:cap+1n}),{message:'clinical_rehearsal_fee_exceeded'});
  }
  const step=policy.steps[2],quote={source:policy.patient.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'29254540'};
  assert.equal(assertRehearsalFee(policy,step,quote),29254540n);
  assert.throws(()=>assertRehearsalFee(base,base.steps[2],quote),/fee_exceeded/);
  assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:'50000000',now:context.effectiveNow-1}),/expired/);
  assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:'50000000'}),50000000n);
},fortyXlmTuple));

test('thirty-two-XLM approval and metadata cannot authorize the forty-XLM permission tuple',()=>withExpandedBudget(context=>{
  const directory=join(context.base.base.base.directory,'separate-tuple32');mkdirSync(directory);
  const raw32={...context.raw,amendmentId:id(431),permissionMaxFeeStroops:'10000000',remainingMaxFeeStroops:'320000000'},bytes32=Buffer.from(JSON.stringify(raw32)),hash32=sha(bytes32).toString('hex'),file32=join(directory,'plan.json');writeFileSync(file32,bytes32);
  const approval32={...context.approval,planHash:hash32,statement:'Synthetic explicit thirty-two-XLM approval only.'},approvalBytes32=Buffer.from(JSON.stringify(approval32)),approvalHash32=sha(approvalBytes32).toString('hex');writeFileSync(join(directory,'approval.private.json'),approvalBytes32);
  const env32={...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file32,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:hash32,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:approvalHash32};
  const thirtyTwo=loaded(env32,{now:context.effectiveNow}),forty=amended(context);
  const expected=structuredClone(thirtyTwo);expected.steps.forEach(step=>{if(step.actor==='patient')step.maxFeeStroops='50000000';});expected.totalMaxFeeStroops='410000000';
  assert.deepEqual({...forty},expected);
  const patientQuote={source:thirtyTwo.patient.address,now:context.effectiveNow,maxTime:context.effectiveNow+60};
  assert.equal(assertRehearsalFee(thirtyTwo,thirtyTwo.steps[2],{...patientQuote,feeStroops:'10000000'}),10000000n);
  assert.throws(()=>assertRehearsalFee(thirtyTwo,thirtyTwo.steps[2],{...patientQuote,feeStroops:'10000001'}),/fee_exceeded/);
  assert.throws(()=>Object.defineProperty(thirtyTwo,'budgetAmendment',{value:forty.budgetAmendment}));
  const forged={...thirtyTwo,budgetAmendment:forty.budgetAmendment,steps:forty.steps};
  assert.throws(()=>assertRehearsalFee(forged,forged.steps[2],{...patientQuote,feeStroops:'10000001'}),/fee_exceeded/);
  writeFileSync(context.approvalFile,approvalBytes32);
  assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:approvalHash32},{now:context.effectiveNow}),/approval_required/);
},fortyXlmTuple));

test('forty-XLM clones and previews retain the unverified one-XLM maximum and never acquire a patient five-XLM cap',()=>withExpandedBudget(context=>{
  const policy=amended(context),quote={source:policy.patient.address,now:context.effectiveNow,maxTime:context.effectiveNow+60};
  for(const clone of [{...policy,budgetAmendment:policy.budgetAmendment},structuredClone(policy)]){
    assert.equal(assertRehearsalFee(clone,clone.steps[2],{...quote,feeStroops:'10000000'}),10000000n);
    assert.throws(()=>assertRehearsalFee(clone,clone.steps[2],{...quote,feeStroops:'10000001'}),/fee_exceeded/);
  }
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
  assert.throws(()=>amended(context),/approval_required/);
  const preview=loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval});
  assert.equal(preview.steps[2].maxFeeStroops,'50000000');
  assert.throws(()=>assertRehearsalFee(preview,preview.steps[2],{...quote,feeStroops:'29254540'}),/fee_exceeded/);
},fortyXlmTuple));

test('schema6 accepts only the two correlated budget tuples and rejects other permissions even when arithmetic sums match',()=>{
  for(const [doctor,permission,total]of [
    ['100000000','50000000','320000000'],['100000000','10000000','400000000'],['100000000','50000000','400000001'],
    ['100000001','50000000','400000003'],['100000000','100000000','500000000'],['50000000','50000000','250000000'],
    ['100000000','49999999','399999998'],['100000000','20000000','340000000']
  ])rejectExpandedBudget(raw=>{raw.doctorMaxFeeStroops=doctor;raw.permissionMaxFeeStroops=permission;raw.remainingMaxFeeStroops=total;});
});


function withAggregateBudget(work, mutate = () => {}) {
  return withExpandedBudget(base => {
    const directory=join(dirname(base.file),'aggregate');mkdirSync(directory);
    const normalized=amended(base),raw={schemaVersion:7,amendmentId:id(530),preparedAt:base.approval.approvedAt+10,
      basePlanFile:base.file,basePlanHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH,baseApprovalFile:base.approvalFile,baseApprovalHash:base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH,
      aggregateMaxFeeStroops:'400000000',pdfMaxFeeStroops:'150000000',correctionMaxFeeStroops:'150000000',withdrawalMaxFeeStroops:'60000000',
      confirmedSteps:['append_note','grant_both'].map((key,index)=>{const step=normalized.steps.find(step=>step.key===key);return{key,requestId:step.requestId,operationId:step.operationId,transactionHash:(index?'cd':'ab').repeat(32),feeChargedStroops:index?'29467146':'64151056',ledger:5381518+index};})};
    const approval={schemaVersion:1,planHash:'pending',approvedAt:raw.preparedAt+10,statement:'Synthetic explicit redistribution within forty XLM with six reserved for withdrawal.'};
    mutate(raw,approval,base);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
    const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
  },fortyXlmTuple);
}
const rejectAggregateBudget = mutate => withAggregateBudget(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);

test('schema7 changes only three future caps and nominal sum while keeping a separate forty-XLM real aggregate and all prior bindings',()=>withAggregateBudget(context=>{
  const policy=amended(context),base=amended(context.base),expected=structuredClone(base);
  expected.steps.forEach(step=>{if(['append_pdf','correct_note'].includes(step.key))step.maxFeeStroops='150000000';else if(step.key==='revoke')step.maxFeeStroops='60000000';});expected.totalMaxFeeStroops='520000000';
  assert.deepEqual({...policy},expected);
  for(const field of ['feeAmendment','noteReplacement','budgetAmendment','previousAuthorization','previousSteps'])assert.deepEqual(policy[field],base[field]);
  assert.deepEqual(policy.authorization,base.authorization);assert.equal(policy.runId,base.runId);assert.equal(policy.until,base.until);assert.equal(policy.createdAt,base.createdAt);assert.equal(policy.doctorValidUntil,base.doctorValidUntil);
  for(let index=0;index<policy.steps.length;index++){assert.equal(policy.steps[index].requestId,base.steps[index].requestId);assert.equal(policy.steps[index].operationId,base.steps[index].operationId);assert.deepEqual(policy.steps[index].input,base.steps[index].input);}
  const budget=assertRehearsalAggregateBudget(policy,{now:context.effectiveNow});assert.equal(budget,policy.aggregateBudget);
  assert.equal(budget.aggregateMaxFeeStroops,'400000000');assert.equal(budget.withdrawalReserveStroops,'60000000');assert.equal(policy.totalMaxFeeStroops,'520000000');
  assert.deepEqual(budget.confirmedSteps,context.raw.confirmedSteps);assert.equal(budget.confirmedSteps.reduce((sum,receipt)=>sum+BigInt(receipt.feeChargedStroops),0n),93618202n);
  assert.equal(Object.keys(policy).includes('aggregateBudget'),false);assert(Object.isFrozen(budget));assert(Object.isFrozen(budget.confirmedSteps));assert(Object.isFrozen(budget.confirmedSteps[0]));
  assert.equal(policy.steps[1].maxFeeStroops,'100000000');assert.equal(policy.steps[2].maxFeeStroops,'50000000');assert.equal(policy.steps[0].maxFeeStroops,'10000000');
}));

test('schema7 grants exact fifteen/fifteen/six maxima only to their fixed future slots and preserves the historical caps',()=>withAggregateBudget(context=>{
  const policy=amended(context),base=amended(context.base),caps={renew:10000000n,append_note:100000000n,grant_both:50000000n,append_pdf:150000000n,correct_note:150000000n,revoke:60000000n};
  for(const step of policy.steps){
    const quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:context.effectiveNow,maxTime:context.effectiveNow+60},cap=caps[step.key];
    assert.equal(assertRehearsalFee(policy,step,{...quote,feeStroops:cap}),cap);
    assert.throws(()=>assertRehearsalFee(policy,step,{...quote,feeStroops:cap+1n}),{message:'clinical_rehearsal_fee_exceeded'});
    if(['append_pdf','correct_note','revoke'].includes(step.key))assert.equal(assertRehearsalAggregateBudget(policy,{now:context.effectiveNow,step}),policy.aggregateBudget);
    else assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:context.effectiveNow,step}),/scope_rejected/);
  }
  const pdf=policy.steps[3],quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'107433575'};
  assert.equal(assertRehearsalFee(policy,pdf,quote),107433575n);assert.throws(()=>assertRehearsalFee(base,base.steps[3],quote),/fee_exceeded/);
  assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:context.effectiveNow,step:{...pdf,maxFeeStroops:'150000001'}}),/scope_rejected/);
  assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:context.effectiveNow,step:{...pdf,requestId:id(999)}}),/scope_rejected/);
}));

test('aggregate authority is private, cannot be borrowed by base6 or clones, and cannot be obtained by an in-memory preview',()=>withAggregateBudget(context=>{
  const policy=amended(context),base=amended(context.base),quote={source:policy.doctor.address,now:context.effectiveNow,maxTime:context.effectiveNow+60,feeStroops:'107433575'};
  for(const clone of [{...policy,aggregateBudget:policy.aggregateBudget},structuredClone(policy),{...base,aggregateBudget:policy.aggregateBudget,steps:policy.steps}]){
    assert.throws(()=>assertRehearsalAggregateBudget(clone,{now:context.effectiveNow}),/scope_rejected/);
    assert.throws(()=>assertRehearsalFee(clone,clone.steps[3],quote),/fee_exceeded/);
  }
  assert.throws(()=>assertRehearsalAggregateBudget(base,{now:context.effectiveNow}),/scope_rejected/);
  assert.throws(()=>assertRehearsalAggregateBudget(null,{now:context.effectiveNow}),/scope_rejected/);
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
  assert.throws(()=>amended(context),/approval_required/);
  const preview=loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval});
  assert.equal(preview.steps[3].maxFeeStroops,'150000000');assert.throws(()=>assertRehearsalAggregateBudget(preview,{now:context.effectiveNow}),/scope_rejected/);
  assert.throws(()=>assertRehearsalFee(preview,preview.steps[3],quote),/fee_exceeded/);
}));

test('schema7 requires its own pinned approval and intact base40 bytes',()=>{
  withAggregateBudget(context=>{
    assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash},{now:context.effectiveNow}),/approval_required/);
    writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);
  });
  for(const target of ['file','approvalFile'])withAggregateBudget(context=>{writeFileSync(context.base[target],JSON.stringify({tampered:true}));assert.throws(()=>amended(context),/clinical_rehearsal_/);});
});

test('schema7 cannot activate early or extend any execution or medical date',()=>{
  for(const mutate of [(raw,approval)=>{approval.approvedAt=raw.preparedAt-1;},(raw,_approval,base)=>{raw.preparedAt=base.approval.approvedAt-1;},raw=>{raw.until=now+999999;},raw=>{raw.doctorValidUntil=now+999999;}])rejectAggregateBudget(mutate);
  withAggregateBudget(context=>{
    const policy=amended(context),pdf=policy.steps[3],quote={source:policy.doctor.address,feeStroops:'150000000',maxTime:context.effectiveNow+60};
    assert.throws(()=>loaded(context.env,{now:context.effectiveNow-1}),/expired/);
    assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:context.effectiveNow-1}),/expired/);
    assert.throws(()=>assertRehearsalFee(policy,pdf,{...quote,now:context.effectiveNow-1}),/expired/);
    assert.equal(assertRehearsalFee(policy,pdf,{...quote,now:context.effectiveNow}),150000000n);
    assert.equal(loaded(context.env,{now:context.effectiveNow+1}).until,policy.until);
    assert.throws(()=>loaded(context.env,{now:policy.until}),/expired/);
    assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:policy.until}),/expired/);
    assert.throws(()=>assertRehearsalFee(policy,pdf,{...quote,now:policy.until,maxTime:policy.until}),/expired/);
  });
});

test('schema7 rejects substituted proof identities, duplicate receipt hashes, malformed charged fees and altered caps',()=>{
  for(const mutate of [raw=>{raw.confirmedSteps.reverse();},raw=>{raw.confirmedSteps.pop();},raw=>{raw.confirmedSteps.push({...raw.confirmedSteps[0]});},
    raw=>{raw.confirmedSteps[0].requestId=id(999);},raw=>{raw.confirmedSteps[1].operationId='f'.repeat(64);},raw=>{raw.confirmedSteps[0].transactionHash='0'.repeat(64);},
    raw=>{raw.confirmedSteps[1].transactionHash=raw.confirmedSteps[0].transactionHash;},raw=>{raw.confirmedSteps[0].feeChargedStroops='100000001';},raw=>{raw.confirmedSteps[1].feeChargedStroops='50000001';},
    raw=>{raw.confirmedSteps[0].feeChargedStroops='0';},raw=>{raw.confirmedSteps[0].feeChargedStroops='-1';},raw=>{raw.confirmedSteps[0].ledger=0;},raw=>{raw.confirmedSteps[0].ledger='5381518';},
    raw=>{raw.confirmedSteps[0].unknown=true;},raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.correctionMaxFeeStroops='150000001';},raw=>{raw.withdrawalMaxFeeStroops='60000001';},
    raw=>{raw.unknown=true;},raw=>{raw.basePlanHash='f'.repeat(64);},raw=>{raw.baseApprovalHash='e'.repeat(64);},(raw,_approval,base)=>{raw.amendmentId=base.raw.amendmentId;}])rejectAggregateBudget(mutate);
});

test('schema7 permits only a raw6 forty-XLM base and does not chain other reallocation scopes',()=>{
  for(const version of [1,2,3,4,5,7])rejectAggregateBudget((raw,_approval,base)=>{
    const changed={...base.raw,schemaVersion:version},bytes=Buffer.from(JSON.stringify(changed));writeFileSync(base.file,bytes);raw.basePlanHash=sha(bytes).toString('hex');
    const approval={...base.approval,planHash:raw.basePlanHash},approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(base.approvalFile,approvalBytes);raw.baseApprovalHash=sha(approvalBytes).toString('hex');
  });
  rejectAggregateBudget((raw,_approval,base)=>{
    const changed={...base.raw,permissionMaxFeeStroops:'10000000',remainingMaxFeeStroops:'320000000'},bytes=Buffer.from(JSON.stringify(changed));writeFileSync(base.file,bytes);raw.basePlanHash=sha(bytes).toString('hex');
    const approval={...base.approval,planHash:raw.basePlanHash},approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(base.approvalFile,approvalBytes);raw.baseApprovalHash=sha(approvalBytes).toString('hex');
  });
});


const timeOnlyBaseHash='43e477dc4695c42a477fb91455d010bb632f52b1bd9f991a41e2f7c25491ceec';
const timeOnlyApprovalHash='0b4c41c78725b10471171522a47fbfd3569e74b8948127a55c6ec0f51b17e079';
const timeOnlyNotAfter=1792974600;
function timeOnlyWindow(patch={}) {
  const approvedAt=Date.parse('2026-10-25T19:50:00Z')/1000;
  return {preparedAt:approvedAt-60,approvedAt,now:approvedAt,previousUntil:1792945080,doctorValidUntil:1792975922,executionWindowSeconds:14400,executionNotAfter:timeOnlyNotAfter,...patch};
}
function withTimeOnlyFile(work,mutate=()=>{}) {
  return withAggregateBudget(base=>{
    const directory=join(dirname(base.file),'time-only');mkdirSync(directory);
    const raw={schemaVersion:8,amendmentId:id(630),preparedAt:1792957740,basePlanFile:base.file,basePlanHash:timeOnlyBaseHash,baseApprovalFile:base.approvalFile,baseApprovalHash:timeOnlyApprovalHash,executionWindowSeconds:14400,executionNotAfter:timeOnlyNotAfter};
    const approval={schemaVersion:1,planHash:'pending',approvedAt:1792957800,statement:'Synthetic time-only continuation; no financial or clinical identity changes.'};
    mutate(raw,approval,base);
    const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
    const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
    const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
    return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
  });
}

test('schema8 pure window is four fixed hours or the absolute Chile hard stop, never load-time relative',()=>{
  const window=timeOnlyWindow(),until=rehearsalContinuationUntil(window);
  assert.equal(until,window.approvedAt+14400);
  assert.equal(rehearsalContinuationUntil({...window,now:window.now+600}),until);
  const late=Date.parse('2026-10-25T22:00:00Z')/1000;
  assert.equal(rehearsalContinuationUntil(timeOnlyWindow({preparedAt:late-1,approvedAt:late,now:late})),timeOnlyNotAfter);
  assert.equal(rehearsalContinuationUntil({...window,preparedAt:window.previousUntil}),until);
  assert.equal(typeof until,'number');assert.equal(Object.hasOwn(until,'policyHash'),false);
});

test('schema8 temporal boundaries require fresh approval after preparation and original expiration',()=>{
  const window=timeOnlyWindow();
  for(const patch of [
    {preparedAt:window.previousUntil-1},{approvedAt:window.preparedAt-1},{now:window.approvedAt-1},
    {now:window.approvedAt+14400},{now:timeOnlyNotAfter},{approvedAt:timeOnlyNotAfter,now:timeOnlyNotAfter,preparedAt:timeOnlyNotAfter-1},
    {previousUntil:window.approvedAt+14400},{doctorValidUntil:window.approvedAt+14400+899}
  ])assert.throws(()=>rehearsalContinuationUntil({...window,...patch}),/expired/);
  const until=window.approvedAt+14400;
  assert.equal(rehearsalContinuationUntil({...window,now:until-1,doctorValidUntil:until+900}),until);
});

test('schema8 cannot configure a larger or smaller window, absolute cutoff or renewal through its pure arithmetic',()=>{
  for(const field of ['executionWindowSeconds','executionNotAfter'])for(const value of [0,-1,undefined,'14400',NaN,Infinity,Number.MAX_SAFE_INTEGER,field==='executionWindowSeconds'?14399:timeOnlyNotAfter-1,field==='executionWindowSeconds'?14401:timeOnlyNotAfter+1]){
    assert.throws(()=>rehearsalContinuationUntil(timeOnlyWindow({[field]:value})),/scope_rejected/);
  }
  for(const field of ['preparedAt','approvedAt','now','previousUntil','doctorValidUntil'])for(const value of [0,-1,undefined,'1792957800',NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>rehearsalContinuationUntil(timeOnlyWindow({[field]:value})),/expired/);
  for(const patch of [{until:timeOnlyNotAfter+1},{createdAt:1792957800},{doctorWindowSeconds:86400},{aggregateMaxFeeStroops:'1500000000'},{unknown:true}])assert.throws(()=>rehearsalContinuationUntil({...timeOnlyWindow(),...patch}),/scope_rejected/);
  const missing=timeOnlyWindow();delete missing.executionWindowSeconds;assert.throws(()=>rehearsalContinuationUntil(missing),/scope_rejected/);
});

test('schema8 numeric result and fabricated continuation metadata cannot grant any fee or actor authority',()=>withAggregateBudget(context=>{
  const policy=amended(context),until=rehearsalContinuationUntil(timeOnlyWindow());
  assert.throws(()=>assertRehearsalAggregateBudget(until,{now:1792957800}),/scope_rejected/);
  assert.throws(()=>assertRehearsalFee(until,policy.steps[3],{feeStroops:'1',maxTime:1792957860,source:policy.doctor.address,now:1792957800}),/scope_rejected/);
  const fake={...policy,until,aggregateBudget:policy.aggregateBudget,executionContinuation:{approvedAt:1792957800}};
  for(const step of policy.steps.slice(1)){
    assert.throws(()=>rehearsalStep(fake,policy[step.actor],step.input),/scope_rejected/);
    assert.throws(()=>assertRehearsalFee(fake,step,{feeStroops:'1',maxTime:1792957860,source:policy[step.actor].address,now:1792957800}),/scope_rejected/);
  }
  assert.throws(()=>assertRehearsalAggregateBudget(fake,{now:1792957800}),/scope_rejected/);
}));

test('schema8 always needs its own approval; neither its base approval nor an explicit preview can borrow base financial authority',()=>withTimeOnlyFile(context=>{
  assert.throws(()=>loaded({...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash},{now:context.effectiveNow}),/approval_required/);
  delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
  assert.throws(()=>loaded(context.env,{now:context.effectiveNow}),/approval_required/);
  assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false}),/approval_required/);
  // These fully synthetic base bytes intentionally do not match the production-only pins.
  assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval}),/approval_required/);
}));

test('schema8 rejects every alternative base manifest or approval pin, even a separately approved synthetic raw7',()=>{
  for(const mutate of [raw=>{raw.basePlanHash='f'.repeat(64);},raw=>{raw.baseApprovalHash='e'.repeat(64);},
    (raw,_approval,base)=>{raw.basePlanHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH;raw.baseApprovalHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;}]){
    withTimeOnlyFile(context=>assert.throws(()=>amended(context),/approval_required/),mutate);
  }
  withTimeOnlyFile(context=>assert.throws(()=>amended(context),/approval_required/));
});

test('schema8 rejects extra financial, clinical or expiry fields and immutable duration tampering before reading its fixed base',()=>{
  for(const mutate of [raw=>{raw.aggregateMaxFeeStroops='1500000000';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.withdrawalMaxFeeStroops='60000001';},
    raw=>{raw.steps=[];},raw=>{raw.confirmedSteps=[];},raw=>{raw.createdAt=raw.preparedAt;},raw=>{raw.until=timeOnlyNotAfter;},raw=>{raw.doctorValidUntil=timeOnlyNotAfter+99999;},
    raw=>{raw.executionWindowSeconds=14401;},raw=>{raw.executionNotAfter++;},raw=>{raw.schemaVersion=9;},raw=>{raw.amendmentId='not-a-uuid';}]){
    withTimeOnlyFile(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);
  }
});

test('schema8 exact fixed base bytes and own approval bytes must stay pinned',()=>{
  withTimeOnlyFile(context=>{
    writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));
    assert.throws(()=>amended(context),/approval_required/);
  });
  for(const target of ['file','approvalFile'])withTimeOnlyFile(context=>{
    writeFileSync(context.base[target],JSON.stringify({tampered:true}));
    assert.throws(()=>amended(context),/approval_required/);
  });
});

const pdfReplacementBaseHash='b9d27665aaaa883cc08ec5c74ecb92f5468aa2888966f3593dddd93d06319bda';
const pdfReplacementApprovalHash='2c29f6c5a82c9dc169e623c5ea356df438921165a68aae79751a834630a7272b';
function withPdfReplacementFile(work,mutate=()=>{}){
 return withTimeOnlyFile(base=>{
  const directory=join(dirname(base.file),'pdf-replacement');mkdirSync(directory);
  const raw={schemaVersion:9,amendmentId:id(730),preparedAt:1792961506,basePlanFile:base.file,basePlanHash:pdfReplacementBaseHash,
   baseApprovalFile:base.approvalFile,baseApprovalHash:pdfReplacementApprovalHash,replacementPdfRequestId:id(731),replacementPdfOperationId:'ee'.repeat(32),
   supersededPdf:{requestId:'540693c8-170e-422b-949a-27d17a38c1c9',operationId:'cc0c5e601460878d55c252ffe64aecb3d209c28484c28cf049bb6037f71e6ad7',
    expiresAt:1792961226,unsignedEnvelopeHash:'2c67edbc6474e7cda7c5a1487115dfc985ee3487b31e9d74a35209360348b122',signingHash:'07cab2a02ffe8279e732863876315684b70a7b6aae8af3596498b2c688cee9c9'}};
  const approval={schemaVersion:1,planHash:'pending',approvedAt:1792961566,statement:'Synthetic PDF replacement only; unchanged execution window and budget.'};
  mutate(raw,approval,base);
  const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
  const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
  const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
  return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
 });
}
test('schema9 requires a separate approval pinned to its own bytes; old approval or preview cannot activate it',()=>withPdfReplacementFile(context=>{
 assert.throws(()=>amended({...context,env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:context.raw.baseApprovalHash}}),/approval_required/);
 delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow}),/approval_required/);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false}),/approval_required/);
 // Synthetic predecessor bytes cannot match the exact production-only raw8 pins, even in preview.
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval}),/approval_required/);
}));
test('schema9 refuses any other base plan or approval, including an otherwise valid separately approved raw8',()=>{
 for(const mutate of [raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},
  (raw,_approval,base)=>{raw.basePlanHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH;raw.baseApprovalHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;}])
  withPdfReplacementFile(context=>assert.throws(()=>amended(context),/approval_required/),mutate);
});
test('schema9 refuses time, budget, other clinical step edits and malformed replacement identifiers before using its base',()=>{
 for(const mutate of [raw=>{raw.until=1792973206;},raw=>{raw.executionWindowSeconds=14400;},raw=>{raw.doctorValidUntil=1792979999;},
  raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.steps=[];},raw=>{raw.confirmedSteps=[];},
  raw=>{raw.replacementPdfRequestId='invalid';},raw=>{raw.replacementPdfOperationId='0'.repeat(64);},raw=>{raw.schemaVersion=10;},raw=>{raw.unknown=true;}])
  withPdfReplacementFile(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);
});
test('schema9 cannot gain fee, actor-step or aggregate authority through serialized replacement metadata',()=>withAggregateBudget(context=>{
 const base=amended(context),fake={...base,pdfReplacement:{approvedAt:1792961566},executionContinuation:{approvedAt:1792958805},
  aggregateBudget:base.aggregateBudget,until:1792973205};
 for(const step of fake.steps.filter(s=>s.actor!=='admin')){
  assert.throws(()=>rehearsalStep(fake,fake[step.actor],step.input),/scope_rejected/);
  assert.throws(()=>assertRehearsalFee(fake,step,{source:fake[step.actor].address,feeStroops:'1',maxTime:1792961600,now:1792961566}),/scope_rejected/);
 }
 assert.throws(()=>assertRehearsalAggregateBudget(fake,{now:1792961566}),/scope_rejected/);
}));
test('schema9 keeps own approval and terminal-proof bytes immutable',()=>{
 withPdfReplacementFile(context=>{writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);});
 for(const target of ['file','approvalFile'])withPdfReplacementFile(context=>{writeFileSync(context.base[target],JSON.stringify({tampered:true}));assert.throws(()=>amended(context),/approval_required/);});
});

const secondPdfReplacementBaseHash='83a46ca163f9a7dd2ced3a99ee6bf187e4f184d7978ea84904118513ac22b1b3';
const secondPdfReplacementApprovalHash='c08ef3165e2f60ad6ed096f1d52840321e8d8533fff5c3e29bc81399118e41df';
function withSecondPdfReplacementFile(work,mutate=()=>{}){
 return withPdfReplacementFile(base=>{
  const directory=join(dirname(base.file),'second-pdf-replacement');mkdirSync(directory);
  const raw={schemaVersion:10,amendmentId:id(830),preparedAt:1792964312,basePlanFile:base.file,basePlanHash:secondPdfReplacementBaseHash,
   baseApprovalFile:base.approvalFile,baseApprovalHash:secondPdfReplacementApprovalHash,replacementPdfRequestId:id(831),replacementPdfOperationId:'dd'.repeat(32),
   supersededPdf:{requestId:'433ae780-920e-4987-8a2e-8b96d5110545',operationId:'55badf20c0d41903b55f04e8b4a319923a3f0cac525d2f8d06d4ed0fbe947a7a',
    expiresAt:1792964311,unsignedEnvelopeHash:'6690f0168c7b201d9a3fa9e8b9c1e57aae5f4944916b0c098111889d99c2535b',signingHash:'26c99cf87a8a46667cab0ec6f7843c9032cf1579642efdf2177695f4124c9447'}};
  const approval={schemaVersion:1,planHash:'pending',approvedAt:1792964313,statement:'Synthetic explicit approval for a second PDF replacement only, without new money or time.'};
  mutate(raw,approval,base);
  const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
  const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
  const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
  return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
 });
}
test('schema10 requires its own approval and cannot inherit raw9 approval or activate a preview',()=>withSecondPdfReplacementFile(context=>{
 assert.throws(()=>amended({...context,env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:secondPdfReplacementApprovalHash}}),/approval_required/);
 delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow}),/approval_required/);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false}),/approval_required/);
 // Synthetic raw9 bytes cannot match the reviewed production-only predecessor, even in explicit preview.
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval}),/approval_required/);
}));
test('schema10 fixes all five terminal proof fields before consulting its predecessor',()=>{
 for(const mutate of [raw=>{raw.supersededPdf.requestId=id(999);},raw=>{raw.supersededPdf.operationId='ab'.repeat(32);},raw=>{raw.supersededPdf.expiresAt++;},
  raw=>{raw.supersededPdf.unsignedEnvelopeHash='ab'.repeat(32);},raw=>{raw.supersededPdf.signingHash='ab'.repeat(32);},raw=>{raw.supersededPdf.extra=true;}])
  withSecondPdfReplacementFile(context=>assert.throws(()=>amended(context),/scope_rejected/),mutate);
});
test('schema10 refuses new time, fees, contents, other steps or malformed replacement delimiters',()=>{
 for(const mutate of [raw=>{raw.until=1792979999;},raw=>{raw.executionWindowSeconds=14400;},raw=>{raw.doctorValidUntil=1792979999;},
  raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.steps=[];},raw=>{raw.file={};},
  raw=>{raw.replacementPdfRequestId='invalid';},raw=>{raw.replacementPdfRequestId='ABCDEF00-0000-4000-8000-000000000831';},raw=>{raw.replacementPdfOperationId='0'.repeat(64);},
  raw=>{raw.unknown=true;}])
  withSecondPdfReplacementFile(context=>assert.throws(()=>amended(context),/scope_rejected/),mutate);
});
test('schema10 rejects another predecessor and approval pin without recursive replacements',()=>{
 for(const mutate of [raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},
  (raw,_approval,base)=>{raw.basePlanHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH;raw.baseApprovalHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;}])
  withSecondPdfReplacementFile(context=>assert.throws(()=>amended(context),/approval_required/),mutate);
});
test('schema10 cannot prepare before the expired envelope or move its own approval backwards',()=>{
 for(const mutate of [raw=>{raw.preparedAt=1792964310;},(_raw,approval)=>{approval.approvedAt=1792964311;}])
  withSecondPdfReplacementFile(context=>assert.throws(()=>amended(context),/expired/),mutate);
});
test('schema10 clones and serialized predecessor metadata confer no fee, actor or aggregate authority',()=>withAggregateBudget(context=>{
 const base=amended(context),fake={...base,pdfReplacement:{approvedAt:1792964313},priorPdfReplacement:{approvedAt:1792961566},
  executionContinuation:{approvedAt:1792958805},aggregateBudget:base.aggregateBudget,until:1792973205};
 for(const step of fake.steps.filter(s=>s.actor!=='admin')){
  assert.throws(()=>rehearsalStep(fake,fake[step.actor],step.input),/scope_rejected/);
  assert.throws(()=>assertRehearsalFee(fake,step,{source:fake[step.actor].address,feeStroops:'1',maxTime:1792964400,now:1792964313}),/scope_rejected/);
 }
 assert.throws(()=>assertRehearsalAggregateBudget(fake,{now:1792964313}),/scope_rejected/);
}));
test('schema10 keeps the new approval bytes immutable',()=>withSecondPdfReplacementFile(context=>{
 writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);
}));

test('an unsupported replacement schema cannot reuse its separate approval',()=>withSecondPdfReplacementFile(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),raw=>{raw.schemaVersion=12;}));

const thirdPdfReplacementBaseHash='6ad1f0558da616fe37e6eea46161597d0d3adf8635df68dbd3840bc0c0478956';
const thirdPdfReplacementApprovalHash='330b65b8b635077c928e8be83f050433dfc56c0283e8772f14225e254e0acf26';
function withThirdPdfReplacementFile(work,mutate=()=>{}){
 return withSecondPdfReplacementFile(base=>{
  const directory=join(dirname(base.file),'third-pdf-replacement');mkdirSync(directory);
  const raw={schemaVersion:11,amendmentId:id(930),preparedAt:1792967798,basePlanFile:base.file,basePlanHash:thirdPdfReplacementBaseHash,
   baseApprovalFile:base.approvalFile,baseApprovalHash:thirdPdfReplacementApprovalHash,replacementPdfRequestId:id(931),replacementPdfOperationId:'da'.repeat(32),
   supersededPdf:{requestId:'ac5d06bb-c2c7-4af0-9c91-7feb2a5a1d65',operationId:'22a3ed39a40d6aa28d721e42c886a3d76f5de45d5ef59731beba2d4b215ac355',
    expiresAt:1792967797,unsignedEnvelopeHash:'8ec5b5e47c4fbf19c14d0254f4c55077cc0cefda3db435fa85653296f6cc9190',signingHash:'bb66bb48b433ba43e8d3c8262efdc5ee5e0f2194c5319cda15d77a0d74862b50'}};
  const approval={schemaVersion:1,planHash:'pending',approvedAt:1792967799,statement:'Synthetic explicit third PDF replacement only; no new money, time, actors or content.'};
  mutate(raw,approval,base);
  const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
  const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
  const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
  return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
 });
}
test('schema11 requires a separately pinned approval and never inherits raw10 approval',()=>withThirdPdfReplacementFile(context=>{
 assert.throws(()=>amended({...context,env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:thirdPdfReplacementApprovalHash}}),/approval_required/);
 delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow}),/approval_required/);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false}),/approval_required/);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval}),/clinical_rehearsal_/);
}));
test('schema11 fixes its complete immediate terminal proof before consulting a predecessor',()=>{
 for(const mutate of [raw=>{raw.supersededPdf.requestId=id(999);},raw=>{raw.supersededPdf.operationId='ab'.repeat(32);},raw=>{raw.supersededPdf.expiresAt++;},
  raw=>{raw.supersededPdf.unsignedEnvelopeHash='ab'.repeat(32);},raw=>{raw.supersededPdf.signingHash='ab'.repeat(32);},raw=>{raw.supersededPdf.extra=true;}])
  withThirdPdfReplacementFile(context=>assert.throws(()=>amended(context),/scope_rejected/),mutate);
});
test('schema11 raw whitelist excludes every budget, time, actor, content and predecessor-array override',()=>{
 for(const mutate of [raw=>{raw.until=1792979999;},raw=>{raw.executionWindowSeconds=14400;},raw=>{raw.doctorValidUntil=1792979999;},
  raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.steps=[];},raw=>{raw.file={};},raw=>{raw.doctor={};},
  raw=>{raw.priorPdfReplacements=[];},raw=>{raw.replacementPdfRequestId='invalid';},raw=>{raw.replacementPdfOperationId='0'.repeat(64);},raw=>{raw.unknown=true;}])
  withThirdPdfReplacementFile(context=>assert.throws(()=>amended(context),/scope_rejected/),mutate);
});
test('schema11 own approval bytes stay immutable',()=>withThirdPdfReplacementFile(context=>{
 writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));assert.throws(()=>amended(context),/approval_required/);
}));
test('schema11 predecessor arrays and cloned metadata cannot grant scope, fee or aggregate authority',()=>withAggregateBudget(context=>{
 const base=amended(context),fake={...base,pdfReplacement:{approvedAt:1792967799},priorPdfReplacements:[{approvedAt:1792961566},{approvedAt:1792964313}],
  executionContinuation:{approvedAt:1792958805},aggregateBudget:base.aggregateBudget,until:1792973205};
 for(const step of fake.steps.filter(s=>s.actor!=='admin')){
  assert.throws(()=>rehearsalStep(fake,fake[step.actor],step.input),/scope_rejected/);
  assert.throws(()=>assertRehearsalFee(fake,step,{source:fake[step.actor].address,feeStroops:'1',maxTime:1792967900,now:1792967799}),/scope_rejected/);
 }
 assert.throws(()=>assertRehearsalAggregateBudget(fake,{now:1792967799}),/scope_rejected/);
}));

test('schema11 rejects a foreign base manifest or base approval and cannot chain raw11',()=>{
 for(const mutate of [raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},
  (raw,_approval,base)=>{raw.basePlanHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH;raw.baseApprovalHash=base.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;}])
  withThirdPdfReplacementFile(context=>assert.throws(()=>amended(context),/approval_required/),mutate);
});
test('schema11 cannot start before its expired envelope or before its own preparation',()=>{
 for(const mutate of [raw=>{raw.preparedAt=1792967796;},(_raw,approval)=>{approval.approvedAt=1792967797;}])
  withThirdPdfReplacementFile(context=>assert.throws(()=>amended(context),/expired/),mutate);
});


function completionWindow(patch={}) {
 const approvedAt=Date.parse('2026-10-31T18:00:00Z')/1000;
 return {preparedAt:approvedAt-60,approvedAt,now:approvedAt,previousUntil:1792973205,previousDoctorValidUntil:1792975922,executionWindowSeconds:14400,doctorWindowSeconds:604800,...patch};
}
function withCompletionFile(work,mutate=()=>{}) {
 return withSecondPdfReplacementFile(base=>{
  const directory=join(dirname(base.file),'completion');mkdirSync(directory);
  const raw=completionContinuationManifest({basePlanFile:base.file,baseApprovalFile:base.approvalFile,preparedAt:completionWindow().preparedAt,
    amendmentId:id(1030),renewalRequestId:id(1031),renewalDossierId:id(1032)});
  const approval={schemaVersion:1,planHash:'pending',approvedAt:completionWindow().approvedAt,statement:'Synthetic separately approved seven-day completion; total forty includes renewal.'};
  mutate(raw,approval,base);
  const file=join(directory,'plan.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);approval.planHash=digest;
  const approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
  const env={...base.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
  return work({raw,approval,env,file,approvalFile,base,effectiveNow:approval.approvedAt});
 });
}

test('schema12 calculates four fixed hours and seven days from one approval, never from reload',()=>{
 const window=completionWindow(),result=rehearsalCompletionWindow(window);
 assert.deepEqual(result,{createdAt:window.approvedAt,until:window.approvedAt+14400,doctorValidUntil:window.approvedAt+604800});
 assert.deepEqual(rehearsalCompletionWindow({...window,now:window.approvedAt+14399}),result);
 assert(Object.isFrozen(result));assert.equal(Object.hasOwn(result,'approvalHash'),false);
});

test('schema12 timing rejects starts before preparation/prior expiry, expired windows and altered seven-day duration',()=>{
 const window=completionWindow();
 for(const patch of [{preparedAt:window.previousUntil-1},{preparedAt:window.previousDoctorValidUntil-1},
  {approvedAt:window.preparedAt-1},{now:window.approvedAt-1},{now:window.approvedAt+14400},
  {preparedAt:0},{approvedAt:Number.MAX_SAFE_INTEGER},{previousUntil:undefined},{now:'1793469600'}])
  assert.throws(()=>rehearsalCompletionWindow({...window,...patch}),/expired/);
 for(const patch of [{executionWindowSeconds:14399},{executionWindowSeconds:14401},{doctorWindowSeconds:86400},{doctorWindowSeconds:604801},
  {until:window.approvedAt+14400},{doctorValidUntil:window.approvedAt+604800},{approvalHash:'a'.repeat(64)}])
  assert.throws(()=>rehearsalCompletionWindow({...window,...patch}),/scope_rejected/);
});

test('schema12 requires its own pinned approval; a preview cannot inherit base10 or stopped11 authority',()=>withCompletionFile(context=>{
 assert.throws(()=>amended({...context,env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:thirdPdfReplacementApprovalHash}}),/approval_required/);
 delete context.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;unlinkSync(context.approvalFile);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow}),/approval_required/);
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false}),/approval_required/);
 // These synthetic ancestors cannot match the pinned historical raw10, even in preview.
 assert.throws(()=>loaded(context.env,{now:context.effectiveNow,requireApproval:false,previewApproval:context.approval}),/approval_required/);
}));

test('schema12 accepts no other base authority, budget, steps, patient or prescription override',()=>{
 for(const mutate of [raw=>{raw.basePlanHash='a'.repeat(64);},raw=>{raw.baseApprovalHash='b'.repeat(64);},
  raw=>{raw.steps=[];},raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.confirmedSteps=[];},raw=>{raw.doctor={};},
  raw=>{raw.replacementPdfRequestId=id(1099);},raw=>{raw.replacementPdfOperationId='f'.repeat(64);},raw=>{raw.startingDoctorVersion=4;},
  raw=>{raw.executionWindowSeconds=14401;},raw=>{raw.doctorWindowSeconds=86400;},raw=>{raw.renewalMaxFeeStroops='10000001';},
  raw=>{raw.renewalRequestId='invalid';},raw=>{raw.renewalDossierId='invalid';},raw=>{raw.supersededPdf.signingHash='a'.repeat(64);},
  raw=>{raw.until=1793569600;},raw=>{raw.approvedAt=raw.preparedAt;},raw=>{raw.unknown=true;}])
  withCompletionFile(context=>assert.throws(()=>amended(context),/clinical_rehearsal_/),mutate);
});

test('schema12 own approval bytes cannot be re-timed or replaced after pinning',()=>withCompletionFile(context=>{
 writeFileSync(context.approvalFile,JSON.stringify({...context.approval,approvedAt:context.approval.approvedAt+1}));
 assert.throws(()=>amended(context),/approval_required/);
}));

test('schema12 numeric timing or stripped/cloned completion metadata never grants financial authority',()=>withAggregateBudget(context=>{
 const base=amended(context),window=completionWindow(),times=rehearsalCompletionWindow(window);
 const fake={...base,...times,startingDoctorVersion:5,aggregateBudget:base.aggregateBudget};
 for(const completion of [undefined,{approvedAt:window.approvedAt,doctorWindowSeconds:604800}]){
  const clone={...fake,...(completion?{completionContinuation:completion}:{})};
  for(const step of clone.steps){
   assert.throws(()=>assertRehearsalFee(clone,step,{source:step.actor==='admin'?clone.admin:clone[step.actor].address,feeStroops:'1',maxTime:window.now+60,now:window.now}),/scope_rejected/);
   if(step.actor!=='admin')assert.throws(()=>rehearsalStep(clone,clone[step.actor],step.input),/scope_rejected/);
  }
  assert.throws(()=>assertRehearsalAggregateBudget(clone,{now:window.now}),/scope_rejected/);
 }
}));


/** Hermetic positive loader test. Only literal deployment/test-data pins and
 * module-resolution paths change in a temporary copy; every validation,
 * hash check, approval check and WeakSet registration remains the exact source.
 * No production/private manifest, database, signer or network is accessed. */
async function withHermeticCompletionAuthority(work,{maintenance=false}={}) {
 const directory=mkdtempSync(join(tmpdir(),'trustleaf-completion-authority-unit-'));
 try {
  const save=(label,raw,approvedAt,fileName='plan.private.json')=>{
   const folder=join(directory,label);mkdirSync(folder);
   const file=join(folder,fileName),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
   const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT TEST ONLY: synthetic completion authority, never a user approval.'};
   const approvalFile=join(folder,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
   return {raw,file,digest,approval,approvalFile,approvalBytes,approvalHash:sha(approvalBytes).toString('hex')};
  };
  const authority=key(111).publicKey(),original=fixture();
  Object.assign(original,{createdAt:1792802809,until:1792824409,doctorValidUntil:1792889209,admin:authority});
  original.authorization.validUntil=original.doctorValidUntil;
  const one=save('one',original,original.createdAt),steps=[0,3,4,5,6,7].map((oldIndex,index)=>{
   const step=structuredClone(original.steps[oldIndex]);step.requestId=id(101+index);
   if(index){step.operationId=operation(9+index);step.input.requestId=step.requestId;}return step;
  });
  steps[4].input.entryId=deriveTest('entry_id',nativeToScVal(Buffer.from(original.historyId,'hex')),new Address(doctor.address).toScVal(),nativeToScVal(Buffer.from(steps[1].operationId,'hex')));
  const priorReceipts=['11','22','33'].map(value=>value.repeat(32)),confirmedRenewal='bc'.repeat(32);
  const two=save('two',{schemaVersion:2,runId:id(130),preparedAt:1792888200,notBefore:original.doctorValidUntil,executionWindowSeconds:21600,doctorWindowSeconds:86400,
   ...Object.fromEntries(['network','contractId','registryId','relayer','patient','doctor','historyId','doctorId','reviewer'].map(name=>[name,structuredClone(original[name])])),admin:authority,
   startingGrantRevision:5,startingDoctorVersion:4,totalMaxFeeStroops:'60000000',steps,
   authorization:{requestId:steps[0].requestId,dossierId:id(140),expectedVersion:4,targetVersion:5,method:'reauthorize_doctor'},
   lineage:{originalPlanFile:one.file,originalPlanHash:one.digest,originalRunId:original.runId,priorDoctorValidUntil:original.doctorValidUntil,
    confirmed:[0,1,2].map(index=>({key:original.steps[index].key,requestId:original.steps[index].requestId,transactionHash:priorReceipts[index]})),
    cancelledNote:{requestId:original.steps[3].requestId,operationId:original.steps[3].operationId,expiresAt:original.createdAt+180}}},1792889522);
  const base=record=>({basePlanFile:record.file,basePlanHash:record.digest,baseApprovalFile:record.approvalFile,baseApprovalHash:record.approvalHash});
  const four=save('four',{schemaVersion:4,amendmentId:id(230),preparedAt:1792911132,...base(two),doctorMaxFeeStroops:'50000000',permissionMaxFeeStroops:'10000000',remainingMaxFeeStroops:'170000000',executionWindowSeconds:21600,confirmedRenewalTransactionHash:confirmedRenewal},1792911142);
  const five=save('five',{schemaVersion:5,amendmentId:id(330),preparedAt:1792911452,...base(four),replacementNoteRequestId:id(331),replacementNoteOperationId:'f0'.repeat(32),
   supersededNote:{requestId:steps[1].requestId,operationId:steps[1].operationId,expiresAt:1792911442,unsignedEnvelopeHash:'d0'.repeat(32)}},1792911457);
  const six=save('six',{schemaVersion:6,amendmentId:id(430),preparedAt:1792911467,...base(five),doctorMaxFeeStroops:'100000000',permissionMaxFeeStroops:'50000000',remainingMaxFeeStroops:'400000000'},1792911477);
  const seven=save('seven',{schemaVersion:7,amendmentId:id(530),preparedAt:1792911487,...base(six),aggregateMaxFeeStroops:'400000000',pdfMaxFeeStroops:'150000000',correctionMaxFeeStroops:'150000000',withdrawalMaxFeeStroops:'60000000',
   confirmedSteps:[{key:'append_note',requestId:id(331),operationId:'f0'.repeat(32),transactionHash:'ab'.repeat(32),feeChargedStroops:'64151056',ledger:5381518},
    {key:'grant_both',requestId:steps[2].requestId,operationId:steps[2].operationId,transactionHash:'cd'.repeat(32),feeChargedStroops:'29467146',ledger:5381977}]},1792911497);
  const eight=save('eight',{schemaVersion:8,amendmentId:id(630),preparedAt:1792957740,...base(seven),executionWindowSeconds:14400,executionNotAfter:1792974600},1792957800);
  const firstProof={requestId:steps[3].requestId,operationId:steps[3].operationId,expiresAt:1792961226,unsignedEnvelopeHash:'d1'.repeat(32),signingHash:'c1'.repeat(32)};
  const nine=save('nine',{schemaVersion:9,amendmentId:id(730),preparedAt:1792961506,...base(eight),replacementPdfRequestId:id(731),replacementPdfOperationId:'a1'.repeat(32),supersededPdf:firstProof},1792961566);
  const secondProof={requestId:nine.raw.replacementPdfRequestId,operationId:nine.raw.replacementPdfOperationId,expiresAt:1792964311,unsignedEnvelopeHash:'d2'.repeat(32),signingHash:'c2'.repeat(32)};
  const ten=save('ten',{schemaVersion:10,amendmentId:id(830),preparedAt:1792964312,...base(nine),replacementPdfRequestId:id(831),replacementPdfOperationId:'a2'.repeat(32),supersededPdf:secondProof},1792964313);
  const thirdProof={requestId:ten.raw.replacementPdfRequestId,operationId:ten.raw.replacementPdfOperationId,expiresAt:1792967797,unsignedEnvelopeHash:'d3'.repeat(32),signingHash:'c3'.repeat(32)};
  const approvedAt=Date.parse('2026-10-31T18:00:00Z')/1000;
  const twelve=save('twelve',{schemaVersion:12,amendmentId:id(1030),preparedAt:approvedAt-60,...base(ten),executionWindowSeconds:14400,doctorWindowSeconds:604800,renewalMaxFeeStroops:'10000000',renewalRequestId:id(1031),renewalDossierId:id(1032),startingDoctorVersion:5,replacementPdfRequestId:id(1033),replacementPdfOperationId:'da'.repeat(32),supersededPdf:thirdProof},approvedAt);
  const thirteen=save(id(1130),{...twelve.raw,schemaVersion:13,amendmentId:id(1130),maintenance:{...rehearsalMaintenanceDescriptor(),
    source:relayer,keys:[...rehearsalMaintenanceDescriptor().keys],attemptFile:join(dirname(ten.file),'maintenance-14-attempt.private.json')}},approvedAt,'plan.private.json');
  const sourceFile=fileURLToPath(new URL('./clinical-rehearsal-policy.mjs',import.meta.url)),require=createRequire(import.meta.url);
  let source=readFileSync(sourceFile,'utf8');
  // Only exact literal pins are adapted to independently generated synthetic records.
  const pins=[
   ['e3dcee6b274631db745401639a44a6290319fc04317e45a7437189ed2442a083',thirteen.digest],['b5567ed7746be4cc5aa0da4d637977fa188af8633c2184d89ffb225eb2741a1b',thirteen.approvalHash],
   ['de46469b-3f8a-4af8-b409-9744d85c4527',twelve.raw.renewalRequestId],['f2d738c1-977d-40b3-9b72-126d04b5f4c7',twelve.raw.renewalDossierId],
   [admin,authority],['GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB',relayer],['GDUIUM2OR4LCV4Y6R3ZQRWMC3FZR4QRYWHQ4MKZISQ56K3ZNSGVWBMO5',patient.address],['GAK5N7RPGZMHGFOJ7ZJCC5YCD6WUHGMMJMFBMGM5JGMKTV3KPVROS4DX',doctor.address],
   ...continuationReceipts.map((value,index)=>[value,priorReceipts[index]]),[confirmedContinuationRenewal,confirmedRenewal],
   [timeOnlyBaseHash,seven.digest],[timeOnlyApprovalHash,seven.approvalHash],[pdfReplacementBaseHash,eight.digest],[pdfReplacementApprovalHash,eight.approvalHash],
   [secondPdfReplacementBaseHash,nine.digest],[secondPdfReplacementApprovalHash,nine.approvalHash],[thirdPdfReplacementBaseHash,ten.digest],[thirdPdfReplacementApprovalHash,ten.approvalHash],
   ['7b704051-d090-4251-ad57-82d45067f4e8',twelve.raw.replacementPdfRequestId],['52ea85d09aa5a14d008395fe82cec664e09cadb57aad1c55748038ca1774fbf8',twelve.raw.replacementPdfOperationId],
   ['2c67edbc6474e7cda7c5a1487115dfc985ee3487b31e9d74a35209360348b122',firstProof.unsignedEnvelopeHash],['07cab2a02ffe8279e732863876315684b70a7b6aae8af3596498b2c688cee9c9',firstProof.signingHash],
   ['433ae780-920e-4987-8a2e-8b96d5110545',secondProof.requestId],['55badf20c0d41903b55f04e8b4a319923a3f0cac525d2f8d06d4ed0fbe947a7a',secondProof.operationId],
   ['6690f0168c7b201d9a3fa9e8b9c1e57aae5f4944916b0c098111889d99c2535b',secondProof.unsignedEnvelopeHash],['26c99cf87a8a46667cab0ec6f7843c9032cf1579642efdf2177695f4124c9447',secondProof.signingHash],
   ['ac5d06bb-c2c7-4af0-9c91-7feb2a5a1d65',thirdProof.requestId],['22a3ed39a40d6aa28d721e42c886a3d76f5de45d5ef59731beba2d4b215ac355',thirdProof.operationId],
   ['8ec5b5e47c4fbf19c14d0254f4c55077cc0cefda3db435fa85653296f6cc9190',thirdProof.unsignedEnvelopeHash],['bb66bb48b433ba43e8d3c8262efdc5ee5e0f2194c5319cda15d77a0d74862b50',thirdProof.signingHash],
  ];
  source=source.replace("const RESUME_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', '79d18d6d-7521-465c-999c-393bbb2212f9');",`const RESUME_BASE_DIRECTORY = ${JSON.stringify(dirname(thirteen.file))};`);
  for(const [productionPin,syntheticPin]of pins){assert(source.includes(productionPin),'Expected literal test pin is missing');source=source.replaceAll(productionPin,syntheticPin);}
  source=source.replace("from '@stellar/stellar-sdk'",`from '${pathToFileURL(require.resolve('@stellar/stellar-sdk')).href}'`)
   .replace("from './database-connection.mjs'",`from '${new URL('./database-connection.mjs',import.meta.url).href}'`)
   .replace("from './clinical-web-fee-policy.mjs'",`from '${new URL('./clinical-web-fee-policy.mjs',import.meta.url).href}'`)
   .replace("const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));",`const ROOT = ${JSON.stringify(resolve(dirname(sourceFile),'../..'))};`);
  source=source.replace("const MAINTENANCE_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'c5d94d9b-0457-4402-8b6d-bc488f820d67');",`const MAINTENANCE_BASE_DIRECTORY = ${JSON.stringify(dirname(ten.file))};`);
  const isolatedFile=join(directory,'isolated-policy-unit.mjs');writeFileSync(isolatedFile,source);
  const isolated=await import(pathToFileURL(isolatedFile).href),env={...environment(),DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:authority,BOOKING_AUTHORITY_PUBLIC_KEY:authority,
   TRUSTLEAF_CLINICAL_REHEARSAL_FILE:(maintenance?thirteen:twelve).file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:(maintenance?thirteen:twelve).digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:(maintenance?thirteen:twelve).approvalHash};
  return await work({isolated,isolatedFile,env,twelve,thirteen,ten,approvedAt,directory});
 } finally {
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  assert(directory.startsWith(join(tmpdir(),'trustleaf-completion-authority-unit-')));
  rmSync(directory,{recursive:true,force:true});
 }
}

test('schema12 hermetic positive loader registers only its approved object, with fixed dates, caps, historical cost and unchanged clinical steps',async()=>withHermeticCompletionAuthority(async({isolated,env,twelve,ten,approvedAt})=>{
 const policy=isolated.loadRehearsalPolicy({env,now:approvedAt});
 assert.equal(policy.policyHash,twelve.digest);assert.equal(policy.approvalHash,twelve.approvalHash);
 assert.equal(policy.createdAt,approvedAt);assert.equal(policy.until,approvedAt+14400);assert.equal(policy.doctorValidUntil,approvedAt+604800);
 assert.equal(policy.authorization.expectedVersion,5);assert.equal(policy.authorization.targetVersion,6);assert.equal(policy.authorization.requestId,twelve.raw.renewalRequestId);
 assert.equal(policy.completionContinuation.previousAuthorization.targetVersion,5);assert.equal(policy.completionContinuation.basePlanHash,ten.digest);
 assert(Object.isFrozen(policy.completionContinuation));assert(Object.isFrozen(policy.aggregateBudget));
 assert.equal(policy.aggregateBudget.aggregateMaxFeeStroops,'400000000');assert.equal(policy.aggregateBudget.withdrawalReserveStroops,'60000000');
 assert.equal(policy.aggregateBudget.confirmedSteps.reduce((sum,item)=>sum+BigInt(item.feeChargedStroops),0n),93618202n);
 assert.equal(policy.priorPdfReplacements.length,2);assert.equal(policy.pdfReplacement.supersededPdf.requestId,ten.raw.replacementPdfRequestId);
 const caps={renew:10000000n,append_pdf:150000000n,correct_note:150000000n,revoke:60000000n};
 for(const step of policy.steps){
  if(!Object.hasOwn(caps,step.key)){
   assert.throws(()=>isolated.assertRehearsalAggregateBudget(policy,{now:approvedAt,step}),/scope_rejected/);
   assert.throws(()=>isolated.assertRehearsalFee(policy,step,{source:policy[step.actor].address,now:approvedAt,maxTime:approvedAt+60,feeStroops:'1'}),/scope_rejected/);
   assert.throws(()=>isolated.rehearsalStep(policy,policy[step.actor],step.input),/scope_rejected/);continue;
  }
  assert.equal(isolated.assertRehearsalAggregateBudget(policy,{now:approvedAt,step}),policy.aggregateBudget);
  const quote={source:step.actor==='admin'?policy.admin:policy[step.actor].address,now:approvedAt,maxTime:approvedAt+60,feeStroops:caps[step.key]};
  assert.equal(isolated.assertRehearsalFee(policy,step,quote),caps[step.key]);
  assert.throws(()=>isolated.assertRehearsalFee(policy,step,{...quote,feeStroops:caps[step.key]+1n}),/fee_exceeded/);
  if(step.actor!=='admin')assert.equal(isolated.rehearsalStep(policy,policy[step.actor],structuredClone(step.input)),step);
  const clones=[{...policy},{...policy,completionContinuation:policy.completionContinuation,aggregateBudget:policy.aggregateBudget,pdfReplacement:policy.pdfReplacement,executionContinuation:policy.executionContinuation}];
  for(const clone of clones){
   assert.throws(()=>isolated.assertRehearsalFee(clone,step,quote),/scope_rejected/);
   assert.throws(()=>isolated.assertRehearsalAggregateBudget(clone,{now:approvedAt,step}),/scope_rejected/);
  }
 }
 // Isolated test authority cannot cross into the production module's WeakSets.
 assert.throws(()=>assertRehearsalAggregateBudget(policy,{now:approvedAt}),/scope_rejected/);
 const previewEnv={...env};delete previewEnv.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=isolated.loadRehearsalPolicy({env:previewEnv,now:approvedAt,requireApproval:false,previewApproval:twelve.approval});
 const renewal=preview.steps[0];assert.throws(()=>isolated.assertRehearsalAggregateBudget(preview,{now:approvedAt,step:renewal}),/scope_rejected/);
 assert.throws(()=>isolated.assertRehearsalFee(preview,renewal,{source:preview.admin,now:approvedAt,maxTime:approvedAt+60,feeStroops:'1'}),/scope_rejected/);
 assert.equal(isolated.loadRehearsalPolicy({env,now:approvedAt+14399}).until,policy.until);
 assert.throws(()=>isolated.loadRehearsalPolicy({env,now:policy.until}),/expired/);
 writeFileSync(twelve.approvalFile,JSON.stringify({...twelve.approval,approvedAt:approvedAt+1}));
 assert.throws(()=>isolated.loadRehearsalPolicy({env,now:approvedAt+1}),/approval_required/);
 writeFileSync(twelve.approvalFile,twelve.approvalBytes);
 assert.equal(isolated.loadRehearsalPolicy({env,now:approvedAt+1}).until,policy.until);
}));


test('schema13 descriptor is exact, immutable and non-authoritative',()=>{
 const d=rehearsalMaintenanceDescriptor();assert.equal(d.requestId,'b6329a70-5b43-4193-8708-86be4280a7ef');
 assert.equal(d.maxFeeStroops,'20000000');assert.equal(d.keys.length,14);assert.equal(new Set(d.keys).size,14);
 assert.equal(sha(d.keys.join('\n')).toString('hex'),d.keysSha256);assert(Object.isFrozen(d));assert(Object.isFrozen(d.keys));
 assert.throws(()=>assertRehearsalMaintenanceBudget(d,{now}),/scope_rejected/);
});

test('schema13 hermetic positive loader binds a single maintenance journal and reserves its full cap inside forty',async()=>withHermeticCompletionAuthority(async({isolated,env,thirteen,twelve,ten,approvedAt})=>{
 const policy=isolated.loadRehearsalPolicy({env,now:approvedAt}),m=isolated.assertRehearsalMaintenanceBudget(policy,{now:approvedAt});
 assert.equal(policy.policyHash,thirteen.digest);assert.equal(policy.approvalHash,thirteen.approvalHash);
 assert.equal(m.requestId,rehearsalMaintenanceDescriptor().requestId);assert.equal(m.source,policy.relayer);
 assert.equal(m.attemptFile,join(dirname(ten.file),'maintenance-14-attempt.private.json'));
 assert.equal(m.approvedAt,policy.createdAt);assert.equal(m.until,policy.until);assert.equal(m.maxFeeStroops,'20000000');
 assert.equal(m.keys.length,14);assert.equal(policy.aggregateBudget.maintenanceMaxFeeStroops,'20000000');
 assert.equal(policy.aggregateBudget.aggregateMaxFeeStroops,'400000000');assert.equal(policy.aggregateBudget.withdrawalReserveStroops,'60000000');
 assert.equal(policy.aggregateBudget.confirmedSteps.reduce((sum,item)=>sum+BigInt(item.feeChargedStroops),0n),93618202n);
 assert(Object.isFrozen(m));assert(Object.isFrozen(m.keys));assert(Object.isFrozen(policy.aggregateBudget));
 for(const step of policy.steps.filter(s=>['renew','append_pdf','correct_note','revoke'].includes(s.key))){
  assert.equal(isolated.assertRehearsalAggregateBudget(policy,{now:approvedAt,step}),policy.aggregateBudget);
  isolated.assertRehearsalFee(policy,step,{source:step.actor==='admin'?policy.admin:policy[step.actor].address,feeStroops:step.maxFeeStroops,now:approvedAt,maxTime:approvedAt+60});
 }
 for(const clone of [{...policy},{...policy,maintenanceContinuation:m,aggregateBudget:policy.aggregateBudget,completionContinuation:policy.completionContinuation}]){
  assert.throws(()=>isolated.assertRehearsalMaintenanceBudget(clone,{now:approvedAt}),/scope_rejected/);
  assert.throws(()=>isolated.assertRehearsalAggregateBudget(clone,{now:approvedAt}),/scope_rejected/);
 }
 assert.throws(()=>assertRehearsalMaintenanceBudget(policy,{now:approvedAt}),/scope_rejected/);
 const old=isolated.loadRehearsalPolicy({env:{...env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:twelve.file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:twelve.digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:twelve.approvalHash},now:approvedAt});
 assert.throws(()=>isolated.assertRehearsalMaintenanceBudget(old,{now:approvedAt}),/scope_rejected/);
 const previewEnv={...env};delete previewEnv.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=isolated.loadRehearsalPolicy({env:previewEnv,now:approvedAt,requireApproval:false,previewApproval:thirteen.approval});
 assert.throws(()=>isolated.assertRehearsalMaintenanceBudget(preview,{now:approvedAt}),/scope_rejected/);
 assert.equal(isolated.loadRehearsalPolicy({env,now:approvedAt+14399}).maintenanceContinuation.attemptFile,m.attemptFile);
 assert.throws(()=>isolated.assertRehearsalMaintenanceBudget(policy,{now:policy.until}),/expired/);
}, {maintenance:true}));

function rewriteSyntheticMaintenance(context,mutate) {
 const raw=structuredClone(context.thirteen.raw);mutate(raw);
 const bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex'),approval={...context.thirteen.approval,planHash:digest};
 const approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(context.thirteen.file,bytes);writeFileSync(context.thirteen.approvalFile,approvalBytes);
 return {...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
}

test('schema13 rejects altered scope, cap, source, journal or maintenance nonce despite its own synthetic approval',async()=>withHermeticCompletionAuthority(async context=>{
 const mutations=[raw=>{raw.maintenance.maxFeeStroops='20000001';},raw=>{raw.maintenance.source=key(99).publicKey();},
  raw=>{raw.maintenance.requestId=id(1199);},raw=>{raw.maintenance.keys.pop();},raw=>{raw.maintenance.keys[0]=raw.maintenance.keys[1];},
  raw=>{raw.maintenance.keys.reverse();},raw=>{raw.maintenance.keysSha256='ab'.repeat(32);},raw=>{raw.maintenance.footprintSha256='ab'.repeat(32);},
  raw=>{raw.maintenance.attemptFile=join(dirname(context.thirteen.file),'maintenance-14-attempt.private.json');},raw=>{raw.maintenance.extra=true;},
  raw=>{raw.maintenanceMaxFeeStroops='1';},raw=>{raw.maintenance.requestId=raw.renewalRequestId;}];
 for(const mutate of mutations){const env=rewriteSyntheticMaintenance(context,mutate);assert.throws(()=>context.isolated.loadRehearsalPolicy({env,now:context.approvedAt}),/clinical_rehearsal_/);}
}, {maintenance:true}));

test('schema13 copied approved scope or copied base10 cannot create a fresh maintenance journal',async()=>withHermeticCompletionAuthority(async context=>{
 const folder=join(context.directory,'copied-scope');mkdirSync(folder);
 const file=join(folder,'plan.private.json'),approvalFile=join(folder,'approval.private.json');
 writeFileSync(file,readFileSync(context.thirteen.file));writeFileSync(approvalFile,context.thirteen.approvalBytes);
 assert.throws(()=>context.isolated.loadRehearsalPolicy({env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file},now:context.approvedAt}),/scope_rejected/);
 const baseFolder=join(context.directory,'copied-base');mkdirSync(baseFolder);
 const baseFile=join(baseFolder,'plan.json'),baseApproval=join(baseFolder,'approval.private.json');
 writeFileSync(baseFile,readFileSync(context.ten.file));writeFileSync(baseApproval,context.ten.approvalBytes);
 const env=rewriteSyntheticMaintenance(context,raw=>{raw.basePlanFile=baseFile;raw.baseApprovalFile=baseApproval;});
 assert.throws(()=>context.isolated.loadRehearsalPolicy({env,now:context.approvedAt}),/scope_rejected/);
}, {maintenance:true}));

test('schema13 later separately approved proposals retain the same maintenance request and journal',async()=>withHermeticCompletionAuthority(async context=>{
 const original=context.isolated.loadRehearsalPolicy({env:context.env,now:context.approvedAt}),next=structuredClone(context.thirteen.raw);
 next.amendmentId=id(1230);next.preparedAt=context.approvedAt+10;
 const folder=join(context.directory,next.amendmentId);mkdirSync(folder);
 const file=join(folder,'plan.private.json'),bytes=Buffer.from(JSON.stringify(next)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt:context.approvedAt+20,statement:'UNIT TEST ONLY: later proposal does not reset maintenance.'};
 const approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(join(folder,'approval.private.json'),approvalBytes);
 const policy=context.isolated.loadRehearsalPolicy({env:{...context.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')},now:approval.approvedAt});
 assert.notEqual(policy.policyHash,original.policyHash);assert.equal(policy.maintenanceContinuation.requestId,original.maintenanceContinuation.requestId);
 assert.equal(policy.maintenanceContinuation.attemptFile,original.maintenanceContinuation.attemptFile);
 assert.equal(policy.aggregateBudget.maintenanceMaxFeeStroops,'20000000');
}, {maintenance:true}));


test('schema13 cannot substitute a new renewal slot to hide a previous failed or uncertain fee',async()=>withHermeticCompletionAuthority(async context=>{
 for(const mutate of [raw=>{raw.renewalRequestId=id(1198);},raw=>{raw.renewalDossierId=id(1199);}]){
  const env=rewriteSyntheticMaintenance(context,mutate);
  assert.throws(()=>context.isolated.loadRehearsalPolicy({env,now:context.approvedAt}),/scope_rejected/);
 }
}, {maintenance:true}));

const resumeAt=Date.parse('2026-11-01T18:00:00Z')/1000;
test('schema14 window is one exact four hours capped by existing medical expiry without renewal',()=>{
 const w={preparedAt:resumeAt-60,approvedAt:resumeAt,now:resumeAt,previousUntil:resumeAt-3600,doctorValidUntil:resumeAt+604800,executionWindowSeconds:14400};
 assert.equal(rehearsalResumeWindow(w),resumeAt+14400);assert.equal(rehearsalResumeWindow({...w,now:resumeAt+14399}),resumeAt+14400);assert.equal(rehearsalResumeWindow({...w,doctorValidUntil:resumeAt+120}),resumeAt+120);
 for(const change of [{now:resumeAt+14400},{now:resumeAt-1},{preparedAt:resumeAt-3601},{approvedAt:resumeAt-61},{doctorValidUntil:resumeAt},{executionWindowSeconds:14401},{executionWindowSeconds:14399},{doctorWindowSeconds:604800}])assert.throws(()=>rehearsalResumeWindow({...w,...change}),/clinical_rehearsal_/);
});
test('schema14 descriptor and incomplete factory are immutable data without implicit time or authority',()=>{
 const d=rehearsalMaintenanceThreeDescriptor();assert.equal(d.requestId,'5aea0ca6-80ff-40d0-a34a-2e98a7363bb9');assert.equal(d.maxFeeStroops,'6237456');assert.equal(d.keys.length,3);assert.equal(sha(d.keys.join('\n')).toString('hex'),d.keysSha256);assert(Object.isFrozen(d.keys));
 const raw=rehearsalResumeManifest({amendmentId:id(1430),preparedAt:resumeAt,receiptEvidenceFile:join(tmpdir(),'unit-receipts.json')});assert.equal(raw.receiptEvidenceSha256,null);assert(Object.isFrozen(raw));assert.equal(raw.maintenanceThree.requestId,d.requestId);
 assert.throws(()=>assertRehearsalResumeBudget(raw,{now:resumeAt}),/scope_rejected/);assert.throws(()=>assertRehearsalCompletionMaintenance(raw,{now:resumeAt}),/scope_rejected/);assert.throws(()=>rehearsalResumeManifest({amendmentId:id(1430),receiptEvidenceFile:join(tmpdir(),'unit-receipts.json')}),/scope_rejected/);
});
async function withHermeticResumeAuthority(work){return withHermeticCompletionAuthority(async c=>{
 const receiptFile=join(dirname(c.thirteen.file),'retained-receipts.private.json'),receiptBytes=Buffer.from('UNIT SCOPE ONLY: no canonical receipt or fee claimed');writeFileSync(receiptFile,receiptBytes);
 const raw=structuredClone(c.isolated.rehearsalResumeManifest({amendmentId:id(1430),preparedAt:resumeAt-60,receiptEvidenceFile:receiptFile,receiptEvidenceSha256:sha(receiptBytes).toString('hex')})),folder=join(c.directory,raw.amendmentId);mkdirSync(folder);
 const file=join(folder,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt:resumeAt,statement:'UNIT TEST ONLY: time4h and M3; not real approval'},approvalFile=join(folder,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
 const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
 const closureFile=join(c.directory,'isolated-closure-unit.mjs'),closureSource=readFileSync(new URL('./clinical-rehearsal-closure.mjs',import.meta.url),'utf8').replace("from './clinical-rehearsal-policy.mjs'",'from '+JSON.stringify(pathToFileURL(c.isolatedFile).href));writeFileSync(closureFile,closureSource);const closure=await import(pathToFileURL(closureFile).href);
 return work({...c,env,closure,raw,file,approval,approvalFile,approvalBytes,receiptFile,receiptBytes,digest});},{maintenance:true});}
function rewriteSyntheticResume(c,mutate,changeApproval=()=>{}){
 const raw=structuredClone(c.raw);mutate(raw);const bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(c.file,bytes);const approval={...c.approval,planHash:digest};changeApproval(approval);const approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(c.approvalFile,approvalBytes);return {...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
}
test('schema14 hermetic positive preserves all13 data and admits only C4/C5/C6 plus residual M3',async()=>withHermeticResumeAuthority(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt}),base=c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:c.thirteen.file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:c.thirteen.digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:c.thirteen.approvalHash},now:c.approvedAt});
 assert.deepEqual({...p},{...base,until:resumeAt+14400});assert.equal(p.createdAt,c.approvedAt);assert.equal(p.doctorValidUntil,base.doctorValidUntil);
 for(const n of Object.getOwnPropertyNames(base).filter(n=>!Object.prototype.propertyIsEnumerable.call(base,n)&&!['policyHash','approvalHash'].includes(n)))assert.deepEqual(p[n],base[n]);
 assert.equal(p.resumeContinuation.previousUntil,base.until);assert.equal(p.resumeContinuation.approvedAt,resumeAt);assert.equal(p.maintenanceContinuation.until,base.until);assert.equal(p.completionContinuation.executionUntil,base.until);assert.equal(p.aggregateBudget.maintenanceMaxFeeStroops,'20000000');assert.equal(p.resumeContinuation.maintenanceActualPaidStroops,'13762544');assert.equal(c.isolated.assertRehearsalCompletionMaintenance(p,{now:resumeAt}).maxFeeStroops,'6237456');assert(Object.isFrozen(p.resumeContinuation));assert(Object.isFrozen(p.maintenanceThree.keys));
 for(const step of p.steps){const q={source:step.actor==='admin'?p.admin:p[step.actor].address,feeStroops:step.maxFeeStroops,now:resumeAt,maxTime:resumeAt+60};if(['append_pdf','correct_note','revoke'].includes(step.key)){assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:resumeAt,step}),p.aggregateBudget);assert.equal(c.isolated.assertRehearsalFee(p,step,q),BigInt(step.maxFeeStroops));assert.equal(c.isolated.rehearsalStep(p,p[step.actor],step.input),step);}else{assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(p,{now:resumeAt,step}),/scope_rejected/);assert.throws(()=>c.isolated.assertRehearsalFee(p,step,q),/scope_rejected/);}}
 assert.throws(()=>c.isolated.assertRehearsalMaintenanceBudget(p,{now:resumeAt}),/scope_rejected/);assert.throws(()=>assertRehearsalResumeBudget(p,{now:resumeAt}),/scope_rejected/);
 for(const clone of [{...p},{...p,resumeContinuation:p.resumeContinuation,maintenanceThree:p.maintenanceThree,aggregateBudget:p.aggregateBudget,completionContinuation:p.completionContinuation,maintenanceContinuation:p.maintenanceContinuation}]){assert.throws(()=>c.isolated.assertRehearsalResumeBudget(clone,{now:resumeAt}),/scope_rejected/);assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(clone,{now:resumeAt}),/scope_rejected/);}
 const previewEnv={...c.env};delete previewEnv.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;const preview=c.isolated.loadRehearsalPolicy({env:previewEnv,now:resumeAt,requireApproval:false,previewApproval:c.approval});assert.throws(()=>c.isolated.assertRehearsalResumeBudget(preview,{now:resumeAt}),/scope_rejected/);assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(preview,{now:resumeAt}),/scope_rejected/);
 assert.equal(c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt+14399}).until,p.until);assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:p.until}),/expired/);
}));
test('schema14 requires own approval and intact receipt, old plan and approval bytes',async()=>withHermeticResumeAuthority(async c=>{
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:c.thirteen.approvalHash},now:resumeAt}),/approval_required/);
 writeFileSync(c.receiptFile,'tampered');assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt}),/approval_required/);writeFileSync(c.receiptFile,c.receiptBytes);
 writeFileSync(c.approvalFile,JSON.stringify({...c.approval,approvedAt:resumeAt+1}));assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt+1}),/approval_required/);writeFileSync(c.approvalFile,c.approvalBytes);
 writeFileSync(c.thirteen.file,JSON.stringify({...c.thirteen.raw,preparedAt:c.thirteen.raw.preparedAt+1}));assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt}),/approval_required/);
}));
test('schema14 whitelist forbids renewal, clinical, budget, duration, footprint or stable M3 changes',async()=>withHermeticResumeAuthority(async c=>{
 const changes=[r=>{r.until=resumeAt+28800;},r=>{r.doctorWindowSeconds=604800;},r=>{r.renewalRequestId=id(999);},r=>{r.steps=[];},r=>{r.aggregateMaxFeeStroops='400000001';},r=>{r.executionWindowSeconds=14401;},r=>{r.receiptEvidenceSha256=null;},r=>{r.maintenanceThree.requestId=id(999);},r=>{r.maintenanceThree.maxFeeStroops='6237457';},r=>{r.maintenanceThree.source=key(99).publicKey();},r=>{r.maintenanceThree.keys.reverse();},r=>{r.maintenanceThree.keys.pop();},r=>{r.maintenanceThree.keysSha256='ab'.repeat(32);},r=>{r.maintenanceThree.footprintSha256='ab'.repeat(32);},r=>{r.maintenanceThree.attemptFile=join(dirname(c.file),'newjournal.json');},r=>{r.maintenanceThree.attemptRunId=r.amendmentId;},r=>{r.maintenanceThree.attemptOperation='restore';},r=>{r.maintenanceThree.unknown=true;},r=>{r.basePlanHash='ab'.repeat(32);},r=>{r.baseApprovalHash='ab'.repeat(32);}];
 for(const change of changes){const env=rewriteSyntheticResume(c,change);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:resumeAt}),/clinical_rehearsal_/);}
}));
test('schema14 cannot load before preparation or approval and never rolls its window',async()=>withHermeticResumeAuthority(async c=>{
 for(const change of [a=>{a.approvedAt=resumeAt-61;},a=>{a.approvedAt=resumeAt+1;},a=>{a.approvedAt=NaN;}]){const env=rewriteSyntheticResume(c,()=>{},change);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:resumeAt}),/clinical_rehearsal_/);}
}));
test('schema14 closure checks its branded scope before admin SQL and preserves the same final withdrawal seal',async()=>withHermeticResumeAuthority(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt}),priorNow=Date.now;Date.now=()=>resumeAt*1000;try{
 for(const step of p.steps.filter(s=>!['append_pdf','correct_note','revoke'].includes(s.key))){let signed=false,calls=0;await assert.rejects(async()=>{await c.closure.assertRehearsalOpen({query:async()=>{calls++;return{rows:[]};}},p,{step});signed=true;},/scope_rejected/);assert.equal(signed,false);assert.equal(calls,0);}
 for(const step of p.steps.filter(s=>['append_pdf','correct_note','revoke'].includes(s.key))){const calls=[];await c.closure.assertRehearsalOpen({query:async(sql,values)=>{calls.push({sql,values});return{rows:[]};}},p,{step});assert.equal(calls[0].sql,'SELECT pg_advisory_xact_lock(hashtext($1))');assert.equal(calls[0].values[0],'clinical-rehearsal:'+p.runId);}
 const final=p.steps.find(s=>s.key==='revoke'),closed={query:async(sql)=>({rows:sql.includes('FROM clinical_web_operations')?[{id:final.requestId}]:[]})};await assert.rejects(c.closure.assertRehearsalOpen(closed,p,{step:p.steps.find(s=>s.key==='append_pdf')}),/order_conflict/);await c.closure.assertRehearsalOpen(closed,p,{step:final});
 }finally{Date.now=priorNow;}
}));


/** Synthetic raw15 fixtures only. Never reads real approvals, SQL or RPC. */
async function withHermeticExpiredPdfRecoveryAuthority(work,{mutateEvidence=()=>{}}={}) {
 return withHermeticResumeAuthority(async c=>{
  const parent=c.isolated.loadRehearsalPolicy({env:c.env,now:resumeAt});
  const old=parent.steps.find(s=>s.key==='append_pdf'),expiry=resumeAt+300;
  const unitUnsigned='UNIT UNSIGNED ENVELOPE ONLY',unitSigning='c4'.repeat(32);
  const evidence={schemaVersion:1,kind:'expired-unsigned-clinical-attempt',manifestHash:c.digest,approvalHash:sha(c.approvalBytes).toString('hex'),
   row:{id:old.requestId,state:'cancelled',error_code:'signature_request_expired',signed_xdr:null,transaction_hash:null,expires_at:expiry,
    unsigned_xdr:unitUnsigned,signing_hash:unitSigning,source_wallet:parent.doctor.address,expected:{historyId:parent.historyId,operationId:old.operationId}},
   reservationRow:{request_id:old.requestId,state:'released',transaction_hash:null,payload:{state:'released',signedInnerDigest:null,signedAt:null,
    transactionHash:null,chargedStroops:null,binding:{requestId:old.requestId,sourceAddress:parent.doctor.address,patientAddress:parent.patient.address}}},
   chain:{getterError:'Error(Contract,#1)',getterObservedLedger:5000,pinnedDeployment:{status:'verified',contractId:parent.contractId}}};
  mutateEvidence(evidence);
  const evidenceFile=join(dirname(c.file),'C4-expired-unsigned-evidence.private.json'),evidenceBytes=Buffer.from(JSON.stringify(evidence));
  writeFileSync(evidenceFile,evidenceBytes);
  let source=readFileSync(c.isolatedFile,'utf8');
  const directoryLine="const EXPIRED_PDF_RECOVERY_BASE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'bf5db55a-0d30-4e5c-9ecd-6af1c97e36de');";
  assert(source.includes(directoryLine));source=source.replace(directoryLine,'const EXPIRED_PDF_RECOVERY_BASE_DIRECTORY = '+JSON.stringify(dirname(c.file))+';');
  const replacements=[
   ['149fd42dbfb86eacac0bd079e5af97af6111cd9bf2c4b087d6502495d8ba4b22',c.digest],
   ['0acd6cde17a2996df405d6507390e0b27039d45757db77b60422bdae0ad300de',sha(c.approvalBytes).toString('hex')],
   ['3703e6b575876a21965b3f9a4ee31868d473b853a819adcd5d0cad2f044541fc',sha(evidenceBytes).toString('hex')],
   ['fca588c043a5c0e62ceb58614e0291091bdb1bdcf2029d6c0ae36d471152f7d4',sha(unitUnsigned).toString('hex')],
   ['72263e5bb8a0bec42fbe84f8825738d34752ce2ddd01e681977f7383bb5ae22a',unitSigning]
  ];
  for(const [oldPin,newPin]of replacements){assert(source.includes(oldPin));source=source.replaceAll(oldPin,newPin);}
  source=source.replace("const EXPIRED_PDF_RECOVERY_EXPIRY = Math.floor(Date.parse('2026-11-02T18:41:39Z')/1000);",'const EXPIRED_PDF_RECOVERY_EXPIRY = '+expiry+';');
  const isolatedFile=join(c.directory,'isolated-expired-pdf-recovery-unit.mjs');writeFileSync(isolatedFile,source);
  const isolated=await import(pathToFileURL(isolatedFile).href);
  const preparedAt=expiry+10,approvedAt=expiry+20;
  const raw=structuredClone(isolated.rehearsalExpiredPdfRecoveryManifest({amendmentId:id(1530),preparedAt,replacementPdfRequestId:id(1531),replacementPdfOperationId:'9f'.repeat(32)}));
  const folder=join(c.directory,raw.amendmentId);mkdirSync(folder);const file=join(folder,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
  const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT TEST ONLY: one expired unsigned PDF; no new financial window or real authority.'};
  const approvalFile=join(folder,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
  const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
  return work({parent,isolated,isolatedFile,raw,file,digest,approval,approvalFile,approvalBytes,evidenceFile,evidenceBytes,env,approvedAt,preparedAt,expiry,sourceContext:c});
 });
}
function rewriteSyntheticExpiredPdfRecovery(c,mutate,changeApproval=()=>{}) {
 const raw=structuredClone(c.raw);mutate(raw);const bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(c.file,bytes);
 const approval={...c.approval,planHash:digest};changeApproval(approval);const approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(c.approvalFile,approvalBytes);
 return {...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
}
test('schema15 substitutes only the unsigned PDF and preserves raw14 deadline, doctor, history, C5/C6 and forty-XLM accounting',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 assert.equal(p.until,c.parent.until);assert.equal(p.createdAt,c.parent.createdAt);assert.equal(p.doctorValidUntil,c.parent.doctorValidUntil);
 for(const key of ['doctor','patient','authorization','aggregateBudget','maintenanceContinuation','maintenanceThree','resumeContinuation'])assert.deepEqual(p[key],c.parent[key]);
 for(const before of c.parent.steps){const after=p.steps.find(s=>s.key===before.key);if(before.key!=='append_pdf')assert.deepEqual(after,before);else{
  assert.equal(after.requestId,c.raw.replacementPdfRequestId);assert.equal(after.operationId,c.raw.replacementPdfOperationId);
  assert.deepEqual(after.input,{...before.input,requestId:c.raw.replacementPdfRequestId});
 }}
 assert.equal(p.priorPdfReplacements.length,3);assert.equal(p.priorPdfReplacements[0],p.priorPdfReplacement);
 assert.equal(p.pdfReplacement.supersededStep.requestId,c.parent.steps.find(s=>s.key==='append_pdf').requestId);
 assert.equal(p.expiredPdfRecovery.baseFinancialUntil,c.parent.until);assert.equal(p.expiredPdfRecovery.priorPdfProofCount,3);assert(Object.isFrozen(p.expiredPdfRecovery));
 assert.equal(p.aggregateBudget.aggregateMaxFeeStroops,'400000000');assert.equal(p.aggregateBudget.withdrawalReserveStroops,'60000000');assert.equal(p.aggregateBudget.maintenanceMaxFeeStroops,'20000000');
 for(const step of p.steps){const q={source:step.actor==='admin'?p.admin:p[step.actor].address,now:c.approvedAt,maxTime:c.approvedAt+60,feeStroops:step.maxFeeStroops};
  if(['append_pdf','correct_note','revoke'].includes(step.key)){
   assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt,step}),p.aggregateBudget);
   assert.equal(c.isolated.assertRehearsalFee(p,step,q),BigInt(step.maxFeeStroops));
   assert.throws(()=>c.isolated.assertRehearsalFee(p,step,{...q,feeStroops:BigInt(step.maxFeeStroops)+1n}),/fee_exceeded/);
  }else assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt,step}),/scope_rejected/);
 }
 assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(p,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.assertRehearsalMaintenanceBudget(p,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>assertRehearsalAggregateBudget(p,{now:c.approvedAt}),/scope_rejected/);
}));
test('schema15 preview, copied metadata and descriptors never grant financial or maintenance authority',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 const env={...c.env};delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=c.isolated.loadRehearsalPolicy({env,now:c.approvedAt,requireApproval:false,previewApproval:c.approval});
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),step=p.steps.find(s=>s.key==='append_pdf');
 for(const fake of [preview,{...p},{...p,resumeContinuation:p.resumeContinuation,expiredPdfRecovery:p.expiredPdfRecovery,aggregateBudget:p.aggregateBudget,pdfReplacement:p.pdfReplacement}]){
  assert.throws(()=>c.isolated.assertRehearsalResumeBudget(fake,{now:c.approvedAt,step}),/scope_rejected/);
  assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(fake,{now:c.approvedAt,step}),/scope_rejected/);
  assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(fake,{now:c.approvedAt}),/scope_rejected/);
 }
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/approval_required/);
}));
test('schema15 requires its own approval and immutable source14, source approval and expiry evidence bytes',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 for(const target of [c.sourceContext.file,c.sourceContext.approvalFile,c.evidenceFile,c.approvalFile]){
  const original=readFileSync(target);writeFileSync(target,Buffer.concat([original,Buffer.from(' ')]));
  assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/clinical_rehearsal_/);writeFileSync(target,original);
 }
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(c.sourceContext.approvalBytes).toString('hex')},now:c.approvedAt}),/approval_required/);
}));
test('schema15 forbids extra scope, new time, budget or clinical payload, recursive bases and reused identifiers',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 const mutations=[
  raw=>{raw.until=c.parent.until+1;},raw=>{raw.executionWindowSeconds=14400;},raw=>{raw.doctorWindowSeconds=604800;},
  raw=>{raw.aggregateMaxFeeStroops='400000001';},raw=>{raw.pdfMaxFeeStroops='150000001';},raw=>{raw.patient={};},raw=>{raw.steps=[];},raw=>{raw.file={};},
  raw=>{raw.basePlanHash='e7'.repeat(32);},raw=>{raw.baseApprovalHash='d7'.repeat(32);},raw=>{raw.basePlanFile=c.file;},
  raw=>{raw.expiredPdfEvidenceSha256='b7'.repeat(32);},raw=>{raw.expiredPdfEvidenceFile=c.file;},
  raw=>{raw.supersededPdf.expiresAt++;},raw=>{raw.supersededPdf.signingHash='a7'.repeat(32);},
  raw=>{raw.replacementPdfRequestId=c.parent.steps.find(s=>s.key==='correct_note').requestId;},
  raw=>{raw.replacementPdfOperationId=c.parent.steps.find(s=>s.key==='correct_note').operationId;},
  raw=>{raw.replacementPdfRequestId='invalid';},raw=>{raw.replacementPdfOperationId='0'.repeat(64);}
 ];
 for(const mutate of mutations){const env=rewriteSyntheticExpiredPdfRecovery(c,mutate);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/clinical_rehearsal_/);}
}));
test('schema15 does not restart four hours and rejects premature, late or re-timed approval',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 for(const [mutate,adjust,at]of [
  [raw=>{raw.preparedAt=c.expiry-1;},()=>{},c.approvedAt],
  [()=>{},a=>{a.approvedAt=c.preparedAt-1;},c.approvedAt],
  [()=>{},()=>{},c.approvedAt-1],
  [()=>{},()=>{},c.parent.until]
 ]){const env=rewriteSyntheticExpiredPdfRecovery(c,mutate,adjust);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:at}),/expired/);}
 const env=rewriteSyntheticExpiredPdfRecovery(c,()=>{},a=>{a.approvedAt=c.parent.until-30;});
 const p=c.isolated.loadRehearsalPolicy({env,now:c.parent.until-1});assert.equal(p.until,c.parent.until);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.parent.until}),/expired/);
}));
for(const [name,mutateEvidence]of [
 ['signed envelope',e=>{e.row.signed_xdr='UNIT SIGNED';}],
 ['transaction hash',e=>{e.row.transaction_hash='aa'.repeat(32);}],
 ['submitted row',e=>{e.row.state='submitted';}],
 ['unreleased reservation',e=>{e.reservationRow.state='reserved';}],
 ['signature digest',e=>{e.reservationRow.payload.signedInnerDigest='bb'.repeat(32);}],
 ['reservation signature time',e=>{e.reservationRow.payload.signedAt=1;}],
 ['charged reservation',e=>{e.reservationRow.payload.chargedStroops='1';}],
 ['wrong patient',e=>{e.reservationRow.payload.binding.patientAddress=e.row.source_wallet;}],
 ['missing chain proof',e=>{e.chain.getterError='UNKNOWN';}]
])test('schema15 rejects '+name+' even when a test-only evidence hash is pinned',async()=>withHermeticExpiredPdfRecoveryAuthority(async c=>{
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/scope_rejected/);
},{mutateEvidence}));


/** Synthetic source15 without an approval: only own16 can confer authority. */
async function withHermeticReopenedRecovery16(work){return withHermeticExpiredPdfRecoveryAuthority(async c=>{
 unlinkSync(c.approvalFile); // only this helper's disposable synthetic fixture
 let code=readFileSync(c.isolatedFile,'utf8');
 const line="const REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'cb5a0040-3850-4350-8978-4c7ba51cac4b');";
 assert(code.includes(line));code=code.replace(line,'const REOPENED_PDF_RECOVERY_SOURCE_DIRECTORY = '+JSON.stringify(dirname(c.file))+';');
 code=code.replaceAll('46133ccc474d26ad8714a60ca3ff88ea0dfb2e163bc0d2918cdf618096aff6e3',c.digest);
 const isolatedFile=join(c.sourceContext.directory,'isolated-reopened16-unit.mjs');writeFileSync(isolatedFile,code);const isolated=await import(pathToFileURL(isolatedFile).href);
 const preparedAt=c.parent.until+10,approvedAt=preparedAt+20;
 const raw=structuredClone(isolated.rehearsalReopenedPdfRecoveryManifest({amendmentId:id(1630),preparedAt,doctorValidUntil:c.parent.doctorValidUntil}));
 const folder=join(c.sourceContext.directory,raw.amendmentId);mkdirSync(folder);const file=join(folder,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT TEST ONLY: own16 approval for same recovered PDF/C5/C6; max40, no renewal or maintenance.'};
 const approvalFile=join(folder,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
 const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
 return work({...c,source15:c,isolated,isolatedFile,raw,file,digest,approval,approvalFile,approvalBytes,env,preparedAt,approvedAt});
});}
function rewriteSynthetic16(c,mutate,adjust=()=>{}){const raw=structuredClone(c.raw);mutate(raw);const bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(c.file,bytes);const a={...c.approval,planHash:digest};adjust(a);const b=Buffer.from(JSON.stringify(a));writeFileSync(c.approvalFile,b);return{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(b).toString('hex')};}
test('schema16 own approval opens one four-hour window preserving exact PDF, C5/C6 and all canonical budget history',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 assert.equal(p.until,c.approvedAt+14400);assert.equal(p.createdAt,c.parent.createdAt);assert.equal(p.doctorValidUntil,c.parent.doctorValidUntil);
 assert.equal(p.steps.find(s=>s.key==='append_pdf').requestId,c.source15.raw.replacementPdfRequestId);
 assert.equal(p.steps.find(s=>s.key==='append_pdf').operationId,c.source15.raw.replacementPdfOperationId);
 for(const old of c.parent.steps){const s=p.steps.find(s=>s.key===old.key);if(old.key!=='append_pdf')assert.deepEqual(s,old);else assert.deepEqual(s.input,{...old.input,requestId:c.source15.raw.replacementPdfRequestId});}
 for(const key of ['patient','doctor','authorization','aggregateBudget','maintenanceThree','maintenanceContinuation'])assert.deepEqual(p[key],c.parent[key]);
 assert.equal(p.priorPdfReplacements.length,3);assert.equal(p.expiredPdfRecovery.baseFinancialUntil,c.parent.until);assert.equal(p.reopenedPdfRecovery.originalFinancialUntil,c.parent.until);
 assert.equal(p.resumeContinuation.approvedAt,c.approvedAt);assert.equal(p.resumeContinuation.executionUntil,p.until);
 assert.equal(p.aggregateBudget.aggregateMaxFeeStroops,'400000000');assert.equal(p.aggregateBudget.withdrawalReserveStroops,'60000000');assert.equal(p.aggregateBudget.maintenanceMaxFeeStroops,'20000000');
 for(const s of p.steps){if(['append_pdf','correct_note','revoke'].includes(s.key)){
  assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt,step:s}),p.aggregateBudget);
  assert.equal(c.isolated.rehearsalStep(p,p[s.actor],s.input),s);
  assert.equal(c.isolated.assertRehearsalFee(p,s,{source:p[s.actor].address,now:c.approvedAt,maxTime:c.approvedAt+60,feeStroops:s.maxFeeStroops}),BigInt(s.maxFeeStroops));
 }else assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt,step:s}),/scope_rejected/);}
 assert(Object.isFrozen(p.reopenedPdfRecovery));assert(Object.isFrozen(p.steps));
}));
test('schema16 preserves original maintenance provenance separately from the expired financial window',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 assert.equal(p.resumeContinuation.previousUntil,p.maintenanceContinuation.until);
 assert.equal(p.resumeContinuation.previousUntil,c.parent.resumeContinuation.previousUntil);
 assert.equal(p.reopenedPdfRecovery.originalFinancialUntil,c.parent.until);
 assert.notEqual(p.resumeContinuation.previousUntil,p.reopenedPdfRecovery.originalFinancialUntil);
 assert.deepEqual(p.maintenanceContinuation,c.parent.maintenanceContinuation);
 assert.equal(p.aggregateBudget.maintenanceMaxFeeStroops,'20000000');
 assert.equal(p.until,c.approvedAt+14400);
}));

test('schema16 rejects source14 approval, preview and copied policy as financial authority',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),env={...c.env};delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=c.isolated.loadRehearsalPolicy({env,now:c.approvedAt,requireApproval:false,previewApproval:c.approval});
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/approval_required/);
 for(const fake of [preview,{...p},Object.defineProperties({...p},Object.fromEntries(['resumeContinuation','expiredPdfRecovery','reopenedPdfRecovery','aggregateBudget'].map(n=>[n,{value:p[n]}])) )])assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(fake,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:c.source15.sourceContext.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH},now:c.approvedAt}),/approval_required/);
 assert.throws(()=>assertRehearsalAggregateBudget(p,{now:c.approvedAt}),/scope_rejected/);
}));
test('schema16 cannot grant renewal, restoration or maintenance authority',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 for(const f of [c.isolated.assertRehearsalMaintenanceBudget,c.isolated.assertRehearsalCompletionMaintenance,c.isolated.assertRehearsalMaintenanceThreeBudget])assert.throws(()=>f(p,{now:c.approvedAt}),/scope_rejected/);
 const s=p.steps.find(s=>s.key==='renew');assert.throws(()=>c.isolated.assertRehearsalFee(p,s,{source:p.admin,now:c.approvedAt,maxTime:c.approvedAt+60,feeStroops:s.maxFeeStroops}),/scope_rejected/);
}));
test('schema16 never rolls its deadline on reload, and rejects expiry or a late signing time',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 assert.equal(c.isolated.loadRehearsalPolicy({env:c.env,now:p.until-1}).until,p.until);
 for(const now of [c.approvedAt-1,p.until,p.until+1])assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now}),/expired/);
 const s=p.steps.find(s=>s.key==='append_pdf');assert.throws(()=>c.isolated.assertRehearsalFee(p,s,{source:p.doctor.address,now:p.until-30,maxTime:p.until+1,feeStroops:s.maxFeeStroops}),/expired/);
}));
test('schema16 caps its new window at the existing doctor expiry and refuses approval after preparation freshness',async()=>withHermeticReopenedRecovery16(async c=>{
 let env=rewriteSynthetic16(c,()=>{},a=>{a.approvedAt=c.parent.doctorValidUntil-120;});
 // Approval freshness is earlier than doctor expiry for this fixture.
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.parent.doctorValidUntil-120}),/expired/);
 env=rewriteSynthetic16(c,()=>{},a=>{a.approvedAt=c.raw.approvalNotAfter;});assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.raw.approvalNotAfter}),/expired/);
 env=rewriteSynthetic16(c,()=>{},a=>{a.approvedAt=c.preparedAt-1;});assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.preparedAt}),/expired/);
}));
test('schema16 exact scope rejects changed IDs, content, budget, source pins, extra actions and longer windows',async()=>withHermeticReopenedRecovery16(async c=>{
 for(const mutate of [r=>{r.until=c.approvedAt+28800;},r=>{r.executionWindowSeconds=14401;},r=>{r.approvalNotAfter++;},r=>{r.doctorValidUntil++;},r=>{r.renew=true;},r=>{r.maintenanceThree={};},r=>{r.steps=[];},r=>{r.replacementPdfRequestId=id(1699);},r=>{r.maxFeeStroops='400000001';},r=>{r.sourceRecoveryHash='cc'.repeat(32);},r=>{r.sourceRecoveryFile=c.file;},r=>{r.amendmentId=c.source15.raw.amendmentId;},r=>{r.preparedAt=c.parent.until-1;}]){
  const env=rewriteSynthetic16(c,mutate);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/clinical_rehearsal_/);
 }
}));
test('schema16 refuses any separately activated source15 and preserves its exact unsigned proof chain',async()=>withHermeticReopenedRecovery16(async c=>{
 writeFileSync(c.source15.approvalFile,c.source15.approvalBytes);assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/scope_rejected/);unlinkSync(c.source15.approvalFile);
 for(const file of [c.source15.file,c.source15.evidenceFile,c.source15.sourceContext.file,c.source15.sourceContext.approvalFile,c.approvalFile]){
  const bytes=readFileSync(file);writeFileSync(file,Buffer.concat([bytes,Buffer.from(' ')]));assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/clinical_rehearsal_/);writeFileSync(file,bytes);
 }
}));
test('schema16 withdrawal seals later publications under the same original run even if PDF/correction fail',async()=>withHermeticReopenedRecovery16(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});const path=join(c.source15.sourceContext.directory,'isolated16-closure-unit.mjs');
 const source=readFileSync(new URL('./clinical-rehearsal-closure.mjs',import.meta.url),'utf8').replace("from './clinical-rehearsal-policy.mjs'",'from '+JSON.stringify(pathToFileURL(c.isolatedFile).href));writeFileSync(path,source);const closure=await import(pathToFileURL(path).href),before=Date.now;Date.now=()=>c.approvedAt*1000;
 try{const revoke=p.steps.find(s=>s.key==='revoke'),db={query:async sql=>({rows:sql.includes('FROM clinical_web_operations')?[{id:revoke.requestId}]:[]})};
  await closure.assertRehearsalOpen(db,p,{step:revoke});
  for(const key of ['append_pdf','correct_note'])await assert.rejects(closure.assertRehearsalOpen(db,p,{step:p.steps.find(s=>s.key===key)}),/order_conflict/);
  assert.equal(p.runId,c.parent.runId);
 }finally{Date.now=before;}
}));

/** Synthetic raw17 only: no user data, SQL, RPC or genuine approval. */
async function withHermeticRecovery17(work,{mutateEvidence=()=>{}}={}){return withHermeticReopenedRecovery16(async c=>{
 const parent=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),old=parent.steps.find(s=>s.key==='append_pdf');
 const expiry=c.approvedAt+300,unitUnsigned='UNIT17 UNSIGNED',unitSigning='b7'.repeat(32);
 const p={requestId:old.requestId,operationId:old.operationId,expiresAt:expiry,unsignedEnvelopeHash:sha(unitUnsigned).toString('hex'),signingHash:unitSigning};
 const evidence={schemaVersion:1,kind:'expired-unsigned-clinical-attempt',manifestHash:c.digest,approvalHash:sha(c.approvalBytes).toString('hex'),
  row:{id:p.requestId,state:'cancelled',error_code:'signature_request_expired',signed_xdr:null,transaction_hash:null,expires_at:expiry,unsigned_xdr:unitUnsigned,signing_hash:unitSigning,source_wallet:parent.doctor.address,expected:{historyId:parent.historyId,operationId:p.operationId}},
  reservationRow:{request_id:p.requestId,state:'released',transaction_hash:null,payload:{state:'released',signedInnerDigest:null,signedAt:null,transactionHash:null,chargedStroops:null,binding:{requestId:p.requestId,sourceAddress:parent.doctor.address,patientAddress:parent.patient.address}}},
  chain:{getterError:'Error(Contract,#1)',getterObservedLedger:7000,pinnedDeployment:{status:'verified',contractId:parent.contractId}}};
 mutateEvidence(evidence);const evidenceFile=join(dirname(c.file),'C4-expired-unsigned-evidence.private.json'),evidenceBytes=Buffer.from(JSON.stringify(evidence));writeFileSync(evidenceFile,evidenceBytes);
 let code=readFileSync(c.isolatedFile,'utf8');
 const line="const RECOVERED_REOPENED_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', 'eb04fb2a-163a-4960-b8d7-af1c3c903409');";assert(code.includes(line));code=code.replace(line,'const RECOVERED_REOPENED_SOURCE_DIRECTORY = '+JSON.stringify(dirname(c.file))+';');
 for(const [oldPin,newPin]of [['d91debde2e82980dbb816cd5d32e107bfdbe94e2640f175ef28cdf91a1241de1',c.digest],['006cd6ea83de4cfa4a6fca275852997f7b873cd9c657d8e7894ea1be78404ef4',sha(c.approvalBytes).toString('hex')],['c283e600a074a1648872f43da6763b92be8972710df2a22bf79628b60322ad2b',sha(evidenceBytes).toString('hex')]]){assert(code.includes(oldPin));code=code.replaceAll(oldPin,newPin);}
 const proofLine=/const RECOVERED_REOPENED_PROOF = Object.freeze\([^\n]+\);/;assert(proofLine.test(code));code=code.replace(proofLine,'const RECOVERED_REOPENED_PROOF = Object.freeze('+JSON.stringify(p)+');');
 const root=dirname(dirname(c.file)),isolatedFile=join(root,'isolated17-unit.mjs');writeFileSync(isolatedFile,code);const isolated=await import(pathToFileURL(isolatedFile).href);
 const preparedAt=expiry+10,approvedAt=expiry+20,raw=structuredClone(isolated.rehearsalRecoveredReopenedPdfManifest({amendmentId:id(1730),preparedAt,replacementPdfRequestId:id(1731),replacementPdfOperationId:'d6'.repeat(32)}));
 const directory=join(root,raw.amendmentId);mkdirSync(directory);const file=join(directory,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT17 ONLY; replacement PDF and original fixed deadline, never extra budget.'},approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
 const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
 return work({parent,source16:c,isolated,isolatedFile,raw,file,digest,approval,approvalFile,approvalBytes,env,preparedAt,approvedAt,evidenceFile,evidenceBytes});
});}
test('schema17 replaces only cancelled PDF and preserves the original raw16 deadline, maintenance, C5/C6 and full budget',async()=>withHermeticRecovery17(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});assert.equal(p.until,c.parent.until);assert.notEqual(p.until,c.approvedAt+14400);
 for(const key of ['createdAt','doctorValidUntil','patient','doctor','authorization','aggregateBudget','maintenanceContinuation','maintenanceThree','resumeContinuation','expiredPdfRecovery','reopenedPdfRecovery'])assert.deepEqual(p[key],c.parent[key]);
 for(const old of c.parent.steps){const after=p.steps.find(s=>s.key===old.key);if(old.key!=='append_pdf')assert.deepEqual(after,old);else assert.deepEqual(after.input,{...old.input,requestId:c.raw.replacementPdfRequestId});}
 assert.equal(p.priorPdfReplacements.length,4);assert.equal(p.priorPdfReplacements[0],p.priorPdfReplacement);assert.equal(p.pdfReplacement.supersededStep.requestId,c.parent.steps.find(s=>s.key==='append_pdf').requestId);
 for(const key of ['append_pdf','correct_note','revoke'])c.isolated.assertRehearsalResumeBudget(p,{now:c.approvedAt,step:p.steps.find(s=>s.key===key)});
 assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt}).aggregateMaxFeeStroops,'400000000');
 assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(p,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt,step:p.steps.find(s=>s.key==='renew')}),/scope_rejected/);
}));
test('schema17 preview, parent approval and copied metadata cannot confer financial authority',async()=>withHermeticRecovery17(async c=>{
 const env={...c.env};delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=c.isolated.loadRehearsalPolicy({env,now:c.approvedAt,requireApproval:false,previewApproval:c.approval});
 assert.throws(()=>c.isolated.assertRehearsalResumeBudget(preview,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/approval_required/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(c.source16.approvalBytes).toString('hex')},now:c.approvedAt}),/approval_required/);
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});assert.throws(()=>c.isolated.assertRehearsalAggregateBudget({...p},{now:c.approvedAt}),/scope_rejected/);
}));
test('schema17 never resets or extends the existing window and requires its own approval time',async()=>withHermeticRecovery17(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});assert.equal(c.isolated.loadRehearsalPolicy({env:c.env,now:p.until-1}).until,p.until);
 for(const now of [c.approvedAt-1,p.until,p.until+1])assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now}),/expired/);
 assert.throws(()=>c.isolated.assertRehearsalResumeBudget(p,{now:c.approvedAt-1}),/expired/);
}));
test('schema17 rejects changed source16 and terminal evidence without touching either approval',async()=>withHermeticRecovery17(async c=>{
 for(const file of [c.source16.file,c.source16.approvalFile,c.evidenceFile]){const before=readFileSync(file);writeFileSync(file,Buffer.concat([before,Buffer.from(' ')]));assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/clinical_rehearsal_/);writeFileSync(file,before);}
}));
test('schema17 rejects extra scope, budget, times and reused UUIDs or operation nonces',async()=>withHermeticRecovery17(async c=>{
 for(const mutate of [r=>{r.until=c.parent.until+1;},r=>{r.executionWindowSeconds=14400;},r=>{r.renew=true;},r=>{r.maxFeeStroops='400000001';},r=>{r.steps=[];},r=>{r.replacementPdfRequestId=c.parent.steps.find(s=>s.key==='correct_note').requestId;},r=>{r.replacementPdfOperationId=c.parent.steps.find(s=>s.key==='append_pdf').operationId;}]){
  const raw=structuredClone(c.raw);mutate(raw);const bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(c.file,bytes);const a=Buffer.from(JSON.stringify({...c.approval,planHash:digest}));writeFileSync(c.approvalFile,a);
  assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(a).toString('hex')},now:c.approvedAt}),/clinical_rehearsal_/);
 }
}));
for(const [name,mutateEvidence]of [['signed',e=>{e.row.signed_xdr='UNIT SIGNED';}],['hash',e=>{e.row.transaction_hash='ff'.repeat(32);}],['active',e=>{e.row.state='awaiting_signature';}],['unreleased',e=>{e.reservationRow.state='reserved';}],['charged',e=>{e.reservationRow.payload.chargedStroops='1';}],['wrong operation',e=>{e.row.expected.operationId='cc'.repeat(32);}],['not absent',e=>{e.chain.getterError='OTHER';}]])test('schema17 rejects '+name+' predecessor even with a test-only pinned evidence digest',async()=>withHermeticRecovery17(async c=>{
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),/clinical_rehearsal_/);
},{mutateEvidence}));


async function withHermeticSignedRecovery18(work,{mutateEvidence=()=>{}}={}) {return withHermeticRecovery17(async c=>{
 const parent=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),old=parent.steps.find(s=>s.key==='append_pdf'),expiry=c.approvedAt+60;
 const unsigned=new TransactionBuilder(new Account(key(109).publicKey(),'100'),{fee:'100',networkPassphrase:Networks.TESTNET}).addOperation(new Contract(clinical).call('append_version',nativeToScVal('UNIT18 ONLY'))).setTimebounds(0,expiry).build(),unsignedXdr=unsigned.toXDR();
 unsigned.sign(key(109));const outer=TransactionBuilder.buildFeeBumpTransaction(key(110),'2000000',unsigned,Networks.TESTNET);outer.sign(key(110));
 const signedHash=outer.hash().toString('hex'),signingHash=unsigned.hash().toString('hex'),derived=sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'),nativeToScVal(sha(Networks.TESTNET)),new Address(clinical).toScVal(),nativeToScVal(Buffer.from(parent.historyId,'hex')),new Address(parent.doctor.address).toScVal(),nativeToScVal(Buffer.from(old.operationId,'hex'))]).toXDR()).toString('hex');
 const e={schemaVersion:1,kind:'expired-never-submitted-clinical-attempt',checkedAtUtc:new Date((expiry+65)*1000+123).toISOString(),manifestHash:c.digest,approvalHash:sha(c.approvalBytes).toString('hex'),
 row:{id:old.requestId,state:'failed',error_code:'signed_expired_before_submission',expires_at:expiry,unsigned_xdr:unsignedXdr,signing_hash:signingHash,signed_xdr:outer.toXDR(),transaction_hash:signedHash,action:'append_version',method:'append_version',network:'testnet',contract_id:clinical,actor_user_id:parent.doctor.userId,wallet_id:parent.doctor.walletId,source_wallet:parent.doctor.address,expected:{historyId:parent.historyId,patient:parent.patient.address,author:parent.doctor.address,operationId:old.operationId,entryId:derived,expectedVersion:0,expectedGrantRevision:6,previousCommitment:null}},
 reservationRow:{request_id:old.requestId,network:'testnet',state:'released',transaction_hash:null,payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,binding:{requestId:old.requestId,sourceAddress:parent.doctor.address,patientAddress:parent.patient.address,sponsorAddress:parent.relayer,actorId:parent.doctor.userId,walletId:parent.doctor.walletId,contractId:clinical,action:'append_version',encounterId:derived},quote:{unsignedHash:sha(unsignedXdr).toString('hex'),signingHash,maxTime:expiry,offeredFeeStroops:'4000000'}}},
 receipt:{status:'NOT_FOUND',hash:signedHash,latestLedger:9000,latestLedgerCloseTime:expiry+60},chain:{getterError:'Error(Contract,#1)',getterObservedLedger:9001,pinnedDeployment:{status:'verified',contractId:clinical,observedWasmHash:'29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0'}},inventory:{entries:5,versions:6}};
 mutateEvidence(e);const evidenceBytes=Buffer.from(JSON.stringify(e)),evidenceSha=sha(evidenceBytes).toString('hex'),evidenceFile=join(dirname(c.file),'C4-expired-never-submitted-evidence.private.json');writeFileSync(evidenceFile,evidenceBytes);
 let code=readFileSync(c.isolatedFile,'utf8');const directoryLine="const NEVER_SUBMITTED_SOURCE_DIRECTORY = resolve(ROOT, '..', 'rehearsals', '0d3891cd-2a8d-4b06-bdfc-96751cc79117');";assert(code.includes(directoryLine));code=code.replace(directoryLine,'const NEVER_SUBMITTED_SOURCE_DIRECTORY = '+JSON.stringify(dirname(c.file))+';');
 for(const[a,b]of [['6f0c968f54ce83f422e25fe7ce9add83e6d081f47e825cb28b2e3fb36e1c51ed',c.digest],['e3b5886dc8f0b085db39d813311cfa3f63cb9d20a04aa546b0015f80c8cd0300',sha(c.approvalBytes).toString('hex')],['418dcca6-2ee8-4570-9d8d-637fa4a4bc1c',old.requestId],['d865a23db28ce24774cbace0b6605da40e9a7556c29992b3449014e34aaaa0d3',signedHash]]){assert(code.includes(a));code=code.replaceAll(a,b);}
 const root=dirname(dirname(c.file)),isolatedFile=join(root,'isolated18-unit.mjs');writeFileSync(isolatedFile,code);const isolated=await import(pathToFileURL(isolatedFile).href),preparedAt=expiry+70,approvedAt=expiry+80;
 const raw=structuredClone(isolated.rehearsalNeverSubmittedPdfManifest({amendmentId:id(1830),preparedAt,replacementPdfRequestId:id(1831),replacementPdfOperationId:'d7'.repeat(32),expiredSignedEvidenceSha256:evidenceSha}));
 const directory=join(root,raw.amendmentId);mkdirSync(directory);const file=join(directory,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT18 ONLY: never submitted signed envelope, fixed previous deadline and 40 total.'},approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
 const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
 return work({source17:c,parent,isolated,isolatedFile,raw,file,digest,approval,approvalFile,approvalBytes,env,evidenceFile,evidenceBytes,preparedAt,approvedAt});
});}
test('schema18 accepts only proven never-submitted signed raw17 PDF, keeps all six predecessors and original deadline/budget',async()=>withHermeticSignedRecovery18(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});assert.equal(p.until,c.parent.until);assert.notEqual(p.until,c.approvedAt+14400);assert.equal(p.priorPdfReplacements.length,5);assert.equal(p.expiredSignedPdfRecovery.priorPdfProofCount,5);
 for(const name of ['createdAt','patient','doctor','authorization','aggregateBudget','maintenanceContinuation','maintenanceThree','resumeContinuation','expiredPdfRecovery','reopenedPdfRecovery','recoveredReopenedPdf'])assert.deepEqual(p[name],c.parent[name]);
 for(const s of c.parent.steps)if(s.key!=='append_pdf')assert.deepEqual(p.steps.find(n=>n.key===s.key),s);
 for(const key of ['append_pdf','correct_note','revoke'])c.isolated.assertRehearsalResumeBudget(p,{now:c.approvedAt,step:p.steps.find(s=>s.key===key)});
 assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt}).aggregateMaxFeeStroops,'400000000');assert.throws(()=>c.isolated.assertRehearsalCompletionMaintenance(p,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.assertRehearsalResumeBudget({...p},{now:c.approvedAt}),/scope_rejected/);
}));
test('schema18 requires its own exact approval and cannot open or extend the fixed raw16 window',async()=>withHermeticSignedRecovery18(async c=>{
 const env={...c.env};delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/approval_required/);
 const preview=c.isolated.loadRehearsalPolicy({env,now:c.approvedAt,requireApproval:false,previewApproval:c.approval});assert.throws(()=>c.isolated.assertRehearsalResumeBudget(preview,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(c.source17.approvalBytes).toString('hex')},now:c.approvedAt}),/clinical_rehearsal_/);
 for(const now of [c.approvedAt-1,c.parent.until,c.parent.until+1])assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now}),/expired/);
}));
test('schema18 rejects scope expansion and reused nonces even with an internally consistent isolated approval',async()=>withHermeticSignedRecovery18(async c=>{
 for(const mutate of [r=>{r.until=c.parent.until+1;},r=>{r.executionWindowSeconds=14400;},r=>{r.renew=true;},r=>{r.maxFeeStroops='400000001';},r=>{r.replacementPdfRequestId=c.parent.steps.find(s=>s.key==='correct_note').requestId;},r=>{r.replacementPdfOperationId=c.parent.steps.find(s=>s.key==='append_pdf').operationId;}]){
  const raw=structuredClone(c.raw);mutate(raw);const b=Buffer.from(JSON.stringify(raw)),h=sha(b).toString('hex'),a=Buffer.from(JSON.stringify({...c.approval,planHash:h}));writeFileSync(c.file,b);writeFileSync(c.approvalFile,a);assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:h,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(a).toString('hex')},now:c.approvedAt}),/clinical_rehearsal_/);
 }
}));
for(const[name,mutateEvidence]of [['active',e=>{e.row.state='submitted';}],['wrong-terminal',e=>{e.row.error_code='signature_request_expired';}],['signed-bytes',e=>{e.row.signed_xdr='UNIT CORRUPT';}],['wrong-hash',e=>{e.row.transaction_hash='f1'.repeat(32);}],['bound-transport',e=>{e.reservationRow.payload.transactionHash=e.row.transaction_hash;}],['unreleased',e=>{e.reservationRow.state='reserved';}],['charged',e=>{e.reservationRow.payload.chargedStroops='1';}],['signed-journal',e=>{e.reservationRow.payload.signedAt=1;}],['found-receipt',e=>{e.receipt.status='SUCCESS';}],['stale-clock',e=>{e.receipt.latestLedgerCloseTime=Number(e.row.expires_at)+59;}],['stale-ledger',e=>{e.chain.getterObservedLedger=e.receipt.latestLedger-1;}],['present-nonce',e=>{e.chain.getterError='OTHER';}],['wrong-wasm',e=>{e.chain.pinnedDeployment.observedWasmHash='ff'.repeat(32);}],['wrong-grant',e=>{e.row.expected.expectedGrantRevision=7;}]])test('schema18 rejects '+name+' signed predecessor even under a test-only evidence digest',async()=>withHermeticSignedRecovery18(async c=>{assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}));},{mutateEvidence}));


// All schema19 approvals, identities and signatures below are disposable unit fixtures.
async function withHermeticRestoredCompletion19(work) {return withHermeticSignedRecovery18(async c=>{
 const parent=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),root=dirname(dirname(c.file));
 const keys=Array.from({length:27},(_,i)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(clinical).toScAddress(),key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Unit19'),nativeToScVal(i,{type:'u32'})]),durability:xdr.ContractDataDurability.persistent()})));
 const encoded=keys.map(k=>k.toXDR('base64')),keysSha256=sha([...encoded].sort().join('\n')).toString('hex'),footprintSha256=sha(new SorobanDataBuilder().setReadWrite([...keys].sort((a,b)=>Buffer.compare(a.toXDR(),b.toXDR()))).build().resources().footprint().toXDR()).toString('hex');
 const preparedAt=parent.doctorValidUntil+10,approvedAt=preparedAt+20,directory=join(root,id(1930));mkdirSync(directory);
 const raw={schemaVersion:19,amendmentId:id(1930),preparedAt,approvalNotAfter:preparedAt+86400,executionWindowSeconds:14400,doctorWindowSeconds:604800,renewalRequestId:id(1931),renewalDossierId:id(1932),restoration:{requestId:id(1933),source:parent.relayer,maxFeeStroops:'20000000',keysSha256,footprintSha256,keys:encoded,attemptFile:join(directory,'maintenance27-attempt.private.json')}};
 let code=readFileSync(c.isolatedFile,'utf8');
 for(const[name,value]of Object.entries({RESTORED_COMPLETION_SOURCE_DIRECTORY:dirname(c.file),RESTORED_COMPLETION_SOURCE_HASH:c.digest,RESTORED_COMPLETION_APPROVAL_HASH:sha(c.approvalBytes).toString('hex'),RESTORED_COMPLETION_KEYS_SHA256:keysSha256,RESTORED_COMPLETION_FOOTPRINT_SHA256:footprintSha256})){
  const expression=new RegExp('const '+name+' = [^;]+;');assert(expression.test(code),'Schema19 support missing: '+name);code=code.replace(expression,'const '+name+' = '+JSON.stringify(value)+';');
 }
 const idExpression=/const RESTORED_COMPLETION_IDENTIFIERS = Object\.freeze\([\s\S]*?\);/;assert(idExpression.test(code));code=code.replace(idExpression,'const RESTORED_COMPLETION_IDENTIFIERS = Object.freeze('+JSON.stringify({amendmentId:raw.amendmentId,renewalRequestId:raw.renewalRequestId,renewalDossierId:raw.renewalDossierId,restorationRequestId:raw.restoration.requestId})+');');
 const isolatedFile=join(root,'isolated19-unit.mjs');writeFileSync(isolatedFile,code);const isolated=await import(pathToFileURL(isolatedFile).href);
 const file=join(directory,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),digest=sha(bytes).toString('hex');writeFileSync(file,bytes);
 const approval={schemaVersion:1,planHash:digest,approvedAt,statement:'UNIT19 ONLY: new own four-hour scope, seven days, exact keys, original clinical IDs, no real services.'},approvalFile=join(directory,'approval.private.json'),approvalBytes=Buffer.from(JSON.stringify(approval));writeFileSync(approvalFile,approvalBytes);
 const env={...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:digest,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approvalBytes).toString('hex')};
 const rewrite=mutate=>{const value=structuredClone(raw);mutate(value);const b=Buffer.from(JSON.stringify(value)),h=sha(b).toString('hex');writeFileSync(file,b);const a=Buffer.from(JSON.stringify({...approval,planHash:h}));writeFileSync(approvalFile,a);return{...env,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:h,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(a).toString('hex')};};
 return work({source18:c,parent,isolated,isolatedFile,raw,file,approval,approvalFile,approvalBytes,approvedAt,env,rewrite});
});}

test('schema19 opens only its own four-hour window and seven-day v7 renewal while preserving all clinical identifiers and signed predecessors',async()=>withHermeticRestoredCompletion19(async c=>{
 const before=readFileSync(c.source18.file),priorApproval=readFileSync(c.source18.approvalFile),p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt});
 assert.equal(p.createdAt,c.approvedAt);assert.equal(p.until,c.approvedAt+14400);assert.equal(p.doctorValidUntil,c.approvedAt+604800);assert.equal(p.authorization.expectedVersion,6);assert.equal(p.authorization.targetVersion,7);
 for(const step of c.parent.steps.filter(s=>s.key!=='renew'))assert.deepEqual(p.steps.find(s=>s.key===step.key),step);
 for(const field of ['patient','doctor','historyId','runId','previousAuthorization','previousSteps','priorPdfReplacements','pdfReplacement','expiredSignedPdfRecovery','maintenanceContinuation'])assert.deepEqual(p[field],c.parent[field]);
 assert.deepEqual(readFileSync(c.source18.file),before);assert.deepEqual(readFileSync(c.source18.approvalFile),priorApproval);
 for(const key of ['renew','append_pdf','correct_note','revoke'])c.isolated.assertRehearsalResumeBudget(p,{now:c.approvedAt,step:p.steps.find(s=>s.key===key)});
 assert.equal(c.isolated.assertRehearsalMaintenanceBudget(p,{now:c.approvedAt}).keys.length,27);
 assert.equal(c.isolated.assertRehearsalAggregateBudget(p,{now:c.approvedAt}).withdrawalReserveStroops,'60000000');
}));
test('schema19 preview, clone and historical source18 approval cannot grant new financial authority',async()=>withHermeticRestoredCompletion19(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),env={...c.env};delete env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
 const preview=c.isolated.loadRehearsalPolicy({env,now:c.approvedAt,requireApproval:false,previewApproval:c.approval});
 for(const value of [preview,{...p}])for(const method of ['assertRehearsalResumeBudget','assertRehearsalAggregateBudget','assertRehearsalMaintenanceBudget'])assert.throws(()=>c.isolated[method](value,{now:c.approvedAt}),/scope_rejected/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/approval_required/);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:c.source18.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH},now:c.approvedAt}),/clinical_rehearsal_/);
}));
test('schema19 rejects before-approval, expired execution and stale approval times without resetting the clock',async()=>withHermeticRestoredCompletion19(async c=>{
 for(const now of [c.approvedAt-1,c.approvedAt+14400,c.approvedAt+14401])assert.throws(()=>c.isolated.loadRehearsalPolicy({env:c.env,now}),/expired/);
 const a=Buffer.from(JSON.stringify({...c.approval,approvedAt:c.raw.approvalNotAfter}));writeFileSync(c.approvalFile,a);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(a).toString('hex')},now:c.raw.approvalNotAfter}),/expired/);
}));
test('schema19 rejects scope, identity, budget, restoration or clinical identifier expansion even with an internally consistent test approval',async()=>withHermeticRestoredCompletion19(async c=>{
 for(const mutate of [r=>{r.executionWindowSeconds++;},r=>{r.doctorWindowSeconds=86400;},r=>{r.approvalNotAfter++;},r=>{r.patient={};},r=>{r.steps=[];},r=>{r.replacementPdfRequestId=id(1999);},r=>{r.aggregateMaxFeeStroops='400000001';},r=>{r.renewalRequestId=c.parent.steps[3].requestId;},r=>{r.renewalRequestId=id(1997);},r=>{r.renewalDossierId=id(1998);},r=>{r.restoration.requestId=id(1999);},r=>{r.restoration.keys.reverse();},r=>{r.restoration.source=key(99).publicKey();},r=>{r.restoration.maxFeeStroops='20000001';},r=>{r.restoration.keys.pop();},r=>{r.restoration.keys[0]=r.restoration.keys[1];},r=>{r.restoration.keysSha256='ab'.repeat(32);},r=>{r.restoration.footprintSha256='ab'.repeat(32);},r=>{r.restoration.attemptFile=join(dirname(c.file),'other-journal.private.json');}]){
  const env=c.rewrite(mutate);assert.throws(()=>c.isolated.loadRehearsalPolicy({env,now:c.approvedAt}),/clinical_rehearsal_/);
 }
}));
test('schema19 cannot clone the approved file to reset its renewal or restoration journal',async()=>withHermeticRestoredCompletion19(async c=>{
 const directory=join(dirname(c.file),'copied');mkdirSync(directory);const file=join(directory,'plan.private.json');writeFileSync(file,readFileSync(c.file));writeFileSync(join(directory,'approval.private.json'),c.approvalBytes);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file},now:c.approvedAt}),/scope_rejected/);
}));
test('schema19 allows its new renewal but preparing withdrawal seals every later publication and renewal',async()=>withHermeticRestoredCompletion19(async c=>{
 const p=c.isolated.loadRehearsalPolicy({env:c.env,now:c.approvedAt}),file=join(dirname(c.isolatedFile),'closure19-unit.mjs');
 const original=readFileSync(new URL('./clinical-rehearsal-closure.mjs',import.meta.url),'utf8');writeFileSync(file,original.replace("from './clinical-rehearsal-policy.mjs'",'from '+JSON.stringify(pathToFileURL(c.isolatedFile).href)));
 const closure=await import(pathToFileURL(file).href);let sealed=false;const client={query:async sql=>({rows:sql.startsWith('SELECT id FROM clinical_web_operations')&&sealed?[{id:p.steps.at(-1).requestId}]:[]})},before=Date.now;Date.now=()=>c.approvedAt*1000;
 try{await closure.assertRehearsalOpen(client,p,{step:p.steps[0]});sealed=true;for(const key of ['renew','append_pdf','correct_note'])await assert.rejects(closure.assertRehearsalOpen(client,p,{step:p.steps.find(s=>s.key===key)}),/order_conflict/);await closure.assertRehearsalOpen(client,p,{step:p.steps.at(-1)});}finally{Date.now=before;}
}));

test('schema19 rewrapping the same source18 with fresh attempt IDs cannot reset the maintenance or renewal budget',async()=>withHermeticRestoredCompletion19(async c=>{
 const raw=structuredClone(c.raw);Object.assign(raw,{amendmentId:id(1950),renewalRequestId:id(1951),renewalDossierId:id(1952)});raw.restoration.requestId=id(1953);
 const dir=join(dirname(dirname(c.file)),raw.amendmentId);mkdirSync(dir);raw.restoration.attemptFile=join(dir,'maintenance27-attempt.private.json');
 const file=join(dir,'plan.private.json'),bytes=Buffer.from(JSON.stringify(raw)),hash=sha(bytes).toString('hex'),approval=Buffer.from(JSON.stringify({...c.approval,planHash:hash}));writeFileSync(file,bytes);writeFileSync(join(dir,'approval.private.json'),approval);
 assert.throws(()=>c.isolated.loadRehearsalPolicy({env:{...c.env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:file,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:hash,TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:sha(approval).toString('hex')},now:c.approvedAt}),/scope_rejected/);
}));


// Schema20 uses the same disposable approval/identity tree as schema19.
// Constants are redirected only in the hermetic module under the unit-test root.
async function withHermeticClosingContinuation20(work, { nearDoctorExpiry = false } = {}) {
  return withHermeticRestoredCompletion19(async source => {
    const original = source.isolated.loadRehearsalPolicy({ env: source.env, now: source.approvedAt });
    const testRoot = dirname(dirname(source.file));
    const amendmentId = id(2030);
    const directory = join(testRoot, amendmentId);
    mkdirSync(directory);
    const preparedAt = nearDoctorExpiry ? original.doctorValidUntil - 90 : original.until + 5;
    const approvedAt = preparedAt + 10;
    const raw = {
      schemaVersion: 20,
      amendmentId,
      preparedAt,
      approvalNotAfter: preparedAt + 86400,
      executionWindowSeconds: 14400,
    };
    let code = readFileSync(source.isolatedFile, 'utf8');
    const pins = {
      CLOSING_SOURCE_DIRECTORY: dirname(source.file),
      CLOSING_SOURCE_HASH: sha(readFileSync(source.file)).toString('hex'),
      CLOSING_SOURCE_APPROVAL_HASH: sha(source.approvalBytes).toString('hex'),
      CLOSING_AMENDMENT_ID: amendmentId,
      CLOSING_PDF_HASH: 'b4'.repeat(32),
      CLOSING_RENEWAL_HASH: 'b7'.repeat(32),
    };
    for (const [name, value] of Object.entries(pins)) {
      const declaration = new RegExp('const ' + name + ' = [^;]+;');
      if (name === 'CLOSING_PDF_HASH' || name === 'CLOSING_RENEWAL_HASH') {
        if (!declaration.test(code)) continue;
      }
      assert(declaration.test(code), 'Schema20 support missing: ' + name);
      code = code.replace(declaration, 'const ' + name + ' = ' + JSON.stringify(value) + ';');
    }
    const isolatedFile = join(testRoot, 'isolated20-unit.mjs');
    writeFileSync(isolatedFile, code);
    const isolated = await import(pathToFileURL(isolatedFile).href);
    const file = join(directory, 'plan.private.json');
    const approvalFile = join(directory, 'approval.private.json');
    function rewrite(mutatePlan = () => {}, mutateApproval = () => {}) {
      const candidate = structuredClone(raw);
      mutatePlan(candidate);
      const bytes = Buffer.from(JSON.stringify(candidate));
      const digest = sha(bytes).toString('hex');
      const approval = {
        schemaVersion: 1,
        planHash: digest,
        approvedAt,
        statement: 'UNIT20 ONLY: C5/C6, four hours, 40 XLM and 6 protected, no real services.',
      };
      mutateApproval(approval);
      const approvalBytes = Buffer.from(JSON.stringify(approval));
      writeFileSync(file, bytes);
      writeFileSync(approvalFile, approvalBytes);
      return {
        approval,
        approvalBytes,
        env: {
          ...source.env,
          TRUSTLEAF_CLINICAL_REHEARSAL_FILE: file,
          TRUSTLEAF_CLINICAL_REHEARSAL_HASH: digest,
          TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH: sha(approvalBytes).toString('hex'),
        },
      };
    }
    return work({
      ...rewrite(), source, original, isolated, isolatedFile, file, approvalFile,
      raw, approvedAt, rewrite, testRoot,
    });
  });
}

test('schema20 preserves the expired rehearsal lineage and creates a distinct window for the same C5/C6', async () => {
  await withHermeticClosingContinuation20(async context => {
    const { isolated, original, env, approvedAt } = context;
    const before = readFileSync(context.source.file);
    const previousApproval = readFileSync(context.source.approvalFile);
    const plan = isolated.loadRehearsalPolicy({ env, now: approvedAt });

    assert.equal(plan.schemaVersion, 2);
    assert.equal(plan.createdAt, original.createdAt);
    assert.equal(plan.until, approvedAt + 14400);
    assert.equal(plan.doctorValidUntil, original.doctorValidUntil);
    assert(plan.closingContinuation);
    assert.equal(plan.closingContinuation.approvedAt, approvedAt);
    assert.equal(plan.closingContinuation.previousUntil, original.until);
    assert.equal(plan.closingContinuation.executionUntil, plan.until);
    const pdf = original.steps.find(step => step.key === 'append_pdf');
    assert.equal(plan.closingContinuation.confirmedPdf.requestId, pdf.requestId);
    assert.equal(plan.closingContinuation.confirmedPdf.transactionHash, 'b4'.repeat(32));
    assert.equal(plan.closingContinuation.confirmedPdf.ledger, 5646333);
    assert.equal(plan.closingContinuation.confirmedPdf.feeChargedStroops, '48748461');
    assert.equal(plan.closingContinuation.confirmedRenewal.requestId, original.authorization.requestId);
    assert.equal(plan.closingContinuation.confirmedRenewal.transactionHash, 'b7'.repeat(32));
    assert.equal(plan.closingContinuation.confirmedRenewal.ledger, 5645990);
    assert.equal(plan.closingContinuation.confirmedRenewal.feeChargedStroops, '4726');
    for (const field of ['runId', 'historyId', 'patient', 'doctor', 'authorization', 'steps', 'restoredCompletion']) {
      assert.deepEqual(plan[field], original[field]);
    }
    const budget = isolated.assertRehearsalAggregateBudget(plan, { now: approvedAt });
    assert.equal(budget.aggregateMaxFeeStroops, '400000000');
    assert.equal(budget.withdrawalReserveStroops, '60000000');
    assert.deepEqual(budget.confirmedSteps, original.aggregateBudget.confirmedSteps);
    for (const hold of ['maintenanceMaxFeeStroops', 'recoveryMaintenanceMaxFeeStroops', 'priorRenewalReserveStroops', 'renewalMaxFeeStroops']) {
      assert.equal(budget[hold], original.aggregateBudget[hold]);
    }
    assert.deepEqual(readFileSync(context.source.file), before);
    assert.deepEqual(readFileSync(context.source.approvalFile), previousApproval);
    assert.throws(() => isolated.loadRehearsalPolicy({ env: context.source.env, now: approvedAt }), /expired/);
  });
});

test('schema20 enforces the approval deadline, fresh approval time and existing medical expiry', async () => {
  await withHermeticClosingContinuation20(async context => {
    const { isolated, original, env, raw, approvedAt } = context;
    for (const now of [approvedAt - 1, approvedAt + 14400, approvedAt + 14401]) {
      assert.throws(() => isolated.loadRehearsalPolicy({ env, now }), /clinical_rehearsal_/);
    }
    for (const invalidApprovalTime of [original.until - 1, raw.preparedAt - 1, raw.approvalNotAfter]) {
      const { env: altered } = context.rewrite(undefined, a => { a.approvedAt = invalidApprovalTime; });
      assert.throws(() => isolated.loadRehearsalPolicy({ env: altered, now: invalidApprovalTime }), /clinical_rehearsal_/);
    }
  });
  await withHermeticClosingContinuation20(async context => {
    const { isolated, original, env, approvedAt } = context;
    const plan = isolated.loadRehearsalPolicy({ env, now: approvedAt });
    assert.equal(plan.until, original.doctorValidUntil);
    assert.equal(plan.authorization.validUntil, original.doctorValidUntil);
    assert.throws(() => isolated.loadRehearsalPolicy({ env, now: original.doctorValidUntil }), /expired/);
  }, { nearDoctorExpiry: true });
});

test('schema20 rejects broader raw scope, historical approval, altered lineage and copied manifests', async () => {
  await withHermeticClosingContinuation20(async context => {
    const { isolated, approvedAt, env } = context;
    for (const mutate of [
      p => { p.amendmentId = id(2031); },
      p => { p.executionWindowSeconds++; },
      p => { p.approvalNotAfter++; },
      p => { p.steps = []; },
      p => { p.renewalRequestId = id(2032); },
      p => { p.restoration = {}; },
      p => { p.patient = {}; },
      p => { p.aggregateMaxFeeStroops = '400000001'; },
      p => { p.withdrawalReserveStroops = '59999999'; },
    ]) {
      const { env: altered } = context.rewrite(mutate);
      assert.throws(() => isolated.loadRehearsalPolicy({ env: altered, now: approvedAt }), /clinical_rehearsal_/);
    }
    context.rewrite();
    const withoutApproval = { ...env };
    delete withoutApproval.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
    assert.throws(() => isolated.loadRehearsalPolicy({ env: withoutApproval, now: approvedAt }), /approval_required/);
    const oldHash = context.source.env.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
    assert.throws(() => isolated.loadRehearsalPolicy({
      env: { ...env, TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH: oldHash }, now: approvedAt,
    }), /clinical_rehearsal_/);
    for (const file of [context.source.file, context.source.approvalFile]) {
      const before = readFileSync(file);
      writeFileSync(file, Buffer.concat([before, Buffer.from('\n')]));
      try {
        assert.throws(() => isolated.loadRehearsalPolicy({ env, now: approvedAt }), /clinical_rehearsal_/);
      } finally {
        writeFileSync(file, before);
      }
    }
    const copiedDirectory = join(context.testRoot, id(2033));
    mkdirSync(copiedDirectory);
    const copiedFile = join(copiedDirectory, 'plan.private.json');
    writeFileSync(copiedFile, readFileSync(context.file));
    writeFileSync(join(copiedDirectory, 'approval.private.json'), context.approvalBytes);
    assert.throws(() => isolated.loadRehearsalPolicy({
      env: { ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: copiedFile }, now: approvedAt,
    }), /clinical_rehearsal_/);
  });
});

test('schema20 permits only exact C5/C6 at every financial guard and seals C5 on withdrawal', async () => {
  await withHermeticClosingContinuation20(async context => {
    const { isolated, approvedAt, env } = context;
    const plan = isolated.loadRehearsalPolicy({ env, now: approvedAt });
    const correction = plan.steps.find(step => step.key === 'correct_note');
    const withdrawal = plan.steps.find(step => step.key === 'revoke');
    const before = Date.now;
    Date.now = () => approvedAt * 1000;
    try {
      for (const step of [correction, withdrawal]) {
        const actor = plan[step.actor];
        assert.deepEqual(isolated.rehearsalStep(plan, actor, step.input), step);
        isolated.assertRehearsalResumeBudget(plan, { now: approvedAt, step });
        isolated.assertRehearsalAggregateBudget(plan, { now: approvedAt, step });
        assert.equal(isolated.assertRehearsalFee(plan, step, {
          feeStroops: '10000000', maxTime: approvedAt + 180, source: actor.address, now: approvedAt,
        }), 10000000n);
      }
      for (const step of plan.steps.filter(step => ![correction, withdrawal].includes(step))) {
        for (const method of ['assertRehearsalResumeBudget', 'assertRehearsalAggregateBudget']) {
          assert.throws(() => isolated[method](plan, { now: approvedAt, step }), /clinical_rehearsal_/);
        }
        assert.throws(() => isolated.assertRehearsalFee(plan, step, {
          feeStroops: '10000000', maxTime: approvedAt + 180,
          source: step.actor === 'admin' ? plan.admin : plan[step.actor].address, now: approvedAt,
        }), /clinical_rehearsal_/);
        if (step.input) {
          assert.throws(() => isolated.rehearsalStep(plan, plan[step.actor], step.input), /clinical_rehearsal_/);
        }
      }
      for (const method of ['assertRehearsalMaintenanceBudget', 'assertRehearsalCompletionMaintenance', 'assertRehearsalMaintenanceThreeBudget']) {
        assert.throws(() => isolated[method](plan, { now: approvedAt }), /clinical_rehearsal_/);
      }
      assert.throws(() => isolated.rehearsalStep(plan, plan.patient, correction.input), /clinical_rehearsal_/);
      assert.throws(() => isolated.rehearsalStep(plan, plan.doctor, {
        ...correction.input, note: { ...correction.input.note, text: 'UNIT MODIFIED' },
      }), /clinical_rehearsal_/);
      assert.throws(() => isolated.rehearsalStep(plan, plan.patient, {
        ...withdrawal.input, canRead: true,
      }), /clinical_rehearsal_/);
      assert.throws(() => isolated.rehearsalStep(plan, plan.patient, {
        ...withdrawal.input, expectedRevision: 5,
      }), /clinical_rehearsal_/);
      assert.throws(() => isolated.assertRehearsalFee(plan, withdrawal, {
        feeStroops: '60000001', maxTime: approvedAt + 180, source: plan.patient.address, now: approvedAt,
      }), /clinical_rehearsal_fee_exceeded/);
      assert.throws(() => isolated.assertRehearsalFee(plan, correction, {
        feeStroops: '10000000', maxTime: plan.until + 1, source: plan.doctor.address, now: approvedAt,
      }), /expired/);

      const moduleFile = join(context.testRoot, 'closure20-unit.mjs');
      const originalCode = readFileSync(new URL('./clinical-rehearsal-closure.mjs', import.meta.url), 'utf8');
      writeFileSync(moduleFile, originalCode.replace(
        "from './clinical-rehearsal-policy.mjs'", 'from ' + JSON.stringify(pathToFileURL(context.isolatedFile).href),
      ));
      const closure = await import(pathToFileURL(moduleFile).href);
      assert.equal(closure.rehearsalRunLockKey(plan), closure.rehearsalRunLockKey(context.original));
      let sealed = false;
      const client = { query: async sql => ({
        rows: sealed && sql.startsWith('SELECT id FROM clinical_web_operations') ? [{ id: withdrawal.requestId }] : [],
      }) };
      for (const key of ['renew', 'append_pdf']) {
        await assert.rejects(closure.assertRehearsalOpen(client, plan, {
          step: plan.steps.find(step => step.key === key),
        }), /clinical_rehearsal_/);
      }
      await closure.assertRehearsalOpen(client, plan, { step: correction });
      sealed = true;
      await assert.rejects(closure.assertRehearsalOpen(client, plan, { step: correction }), /order_conflict/);
      await closure.assertRehearsalOpen(client, plan, { step: withdrawal });
    } finally {
      Date.now = before;
    }
  });
});

test('schema20 preview and copies cannot exercise the closing authority', async () => {
  await withHermeticClosingContinuation20(async context => {
    const { isolated, approvedAt, env, approval } = context;
    const plan = isolated.loadRehearsalPolicy({ env, now: approvedAt });
    const correction = plan.steps.find(step => step.key === 'correct_note');
    const withoutApproval = { ...env };
    delete withoutApproval.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
    assert.throws(() => {
      const preview = isolated.loadRehearsalPolicy({
        env: withoutApproval, now: approvedAt, requireApproval: false, previewApproval: approval,
      });
      isolated.assertRehearsalAggregateBudget(preview, { now: approvedAt, step: correction });
    }, /clinical_rehearsal_/);
    assert.throws(() => isolated.assertRehearsalResumeBudget({ ...plan }, {
      now: approvedAt, step: correction,
    }), /clinical_rehearsal_/);
    const before = Date.now;
    Date.now = () => approvedAt * 1000;
    try {
      assert.throws(() => isolated.rehearsalStep({ ...plan }, plan.doctor, correction.input), /clinical_rehearsal_/);
    } finally {
      Date.now = before;
    }
  });
});
