import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticClinicalPdf } from '../../scripts/lib/clinical-fixtures.mjs';
import { Account, BASE_FEE, Contract, Keypair, Networks, SorobanDataBuilder, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
const m = vi.hoisted(() => ({ environment: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/clinical/config', () => ({ CLINICAL_ID: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', assertClinicalEnvironment: m.environment }));
import { assertClinicalRehearsalOrder, assertClinicalRehearsalExpected, assertClinicalRehearsalAuthorization, assertClinicalRehearsalFee, clinicalRehearsalView, currentClinicalRehearsal, rehearsalConfigured, type RehearsalPolicy } from '@/lib/clinical/rehearsal';
import { assertClinicalWriteScope, clinicalCreateOnceConfigured, assertClinicalCreateOnceFee, assertClinicalCreateOnceSavedFee } from '@/lib/clinical/create-once';
import { clinicalInvocation, deriveClinicalEntryId, deriveClinicalHistoryId } from '@/lib/clinical/chain';
import * as rehearsalFunctions from '@/lib/clinical/rehearsal';
const clinical = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const registry = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const patient = { userId: 'did:privy:scope_patient', walletId: 'scope-patient-wallet', address: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 115)).publicKey() };
const doctor = { userId: 'did:privy:scope_doctor', walletId: 'scope-doctor-wallet', address: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 116)).publicKey() };
const historyId = deriveClinicalHistoryId(patient.address), txHash = 'b'.repeat(64);
const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function fixture() {
  const keys = ['renew', 'grant_read', 'grant_append', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
  const steps = keys.map((key, index) => ({ key, requestId: uuid(index + 1), actor: index === 0 ? 'admin' : [1, 2, 4, 7].includes(index) ? 'patient' : 'doctor',
    action: index === 0 ? 'renew' : [1, 2, 4, 7].includes(index) ? 'set_permissions' : 'append_version', operationId: String(index + 1).repeat(64), maxFeeStroops: '10000000',
    ...(index ? { input: { requestId: uuid(index + 1), action: [1, 2, 4, 7].includes(index) ? 'set_permissions' : 'append_version',
      ...(index === 1 ? { doctorId: 10, canRead: true, canAppend: false, expectedRevision: 3 } : index === 7 ? { doctorId: 10, canRead: false, canAppend: false, expectedRevision: 6 } : {}) } } : {}) }));
  const note = { title: 'Synthetic note', text: 'Invented fixture only.', eventDate: '2026-10-23', prescriptionId: uuid(90) };
  for (const [index, canRead, canAppend, expectedRevision] of [[1, true, false, 3], [2, false, true, 4], [4, true, true, 5], [7, false, false, 6]] as const) {
    steps[index].input = { requestId: steps[index].requestId, action: 'set_permissions', doctorId: 10, canRead, canAppend, expectedRevision };
  }
  steps[3].input = { requestId: steps[3].requestId, action: 'append_version', historyId, note } as any;
  steps[5].input = { requestId: steps[5].requestId, action: 'append_version', historyId,
    file: { fileName: 'synthetic.pdf', mediaType: 'application/pdf', base64: syntheticClinicalPdf(1).toString('base64') } } as any;
  steps[6].input = { requestId: steps[6].requestId, action: 'append_version', historyId,
    entryId: deriveClinicalEntryId(historyId, doctor.address, steps[3].operationId), expectedVersion: 1, note: { ...note, text: 'Corrected invented fixture only.' } } as any;
  delete (steps[0] as any).operationId;
  const start = Math.floor(Date.now() / 1000) - 10;
  const plan = { schemaVersion: 1, runId: uuid(30), createdAt: start, until: start + 6 * 3600, doctorValidUntil: start + 86400,
    network: 'testnet', contractId: clinical, registryId: registry, patient, doctor, historyId, doctorId: 10, startingDoctorVersion: 3, startingGrantRevision: 3,
    admin: 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO', relayer: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 117)).publicKey(),
    reviewer: { userId: 'did:privy:scope_reviewer', email: 'reviewer@example.test' }, totalMaxFeeStroops: '80000000',
    authorization: { requestId: steps[0].requestId, dossierId: uuid(40), validUntil: start + 86400, expectedVersion: 3, targetVersion: 4, method: 'reauthorize_doctor' }, steps } as unknown as RehearsalPolicy;
  const admin = { id: plan.authorization.requestId, state: 'confirmed', action: 'renew', requested_by: plan.reviewer.userId, requested_email: plan.reviewer.email, doctor_id: 10, doctor_user_id: doctor.userId, wallet_id: doctor.walletId, wallet: doctor.address,
    contract_id: registry, network: 'testnet', method: plan.authorization.method, expected_version: 3, target_version: 4, valid_until: plan.authorization.validUntil,
    dossier_id: plan.authorization.dossierId, transaction_hash: txHash } as Record<string, any>;
  const rows = [] as Record<string, any>[];
  const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('FROM clinical_web_operations') ? rows : admin ? [admin] : [] })) };
  function add(index: number, state = 'confirmed') {
    const step = steps[index], actor = step.actor === 'patient' ? patient : doctor;
    const row = { id: step.requestId, state, action: step.action, source_wallet: actor.address, actor_user_id: actor.userId, wallet_id: actor.walletId,
      contract_id: clinical, network: 'testnet', transaction_hash: state === 'confirmed' ? txHash : null };
    rows.push(row); return row;
  }
  return { plan, admin, rows, client: client as any, add };
}
beforeEach(() => { vi.resetAllMocks(); for (const suffix of ['FILE', 'HASH', 'APPROVED_HASH']) vi.stubEnv(`TRUSTLEAF_CLINICAL_REHEARSAL_${suffix}`, undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it('inactive rehearsal leaves the preexisting write guard and mode unchanged', () => {
  expect(rehearsalConfigured()).toBe(false); expect(currentClinicalRehearsal(patient)).toBeNull(); expect(clinicalCreateOnceConfigured()).toBe(false);
  expect(assertClinicalWriteScope('append_version', doctor.address)).toBeNull(); expect(m.environment).toHaveBeenCalledExactlyOnceWith(true);
});
it('the first permission step requires only the exact confirmed administrative renewal', async () => {
  const f = fixture(); await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[1])).resolves.toBeUndefined();
  expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('id=ANY($1::uuid[])'), [f.plan.steps.slice(1).map(step => step.requestId)]);
  expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('doctor_authorization_requests WHERE id=$1'), [f.plan.authorization.requestId]);
});
it.each(['pending', 'submitted', 'failed'])('does not accept a %s renewal as authority to proceed', async state => {
  const f = fixture(); f.admin.state = state;
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[1])).rejects.toMatchObject({ message: 'clinical_rehearsal_order_conflict', status: 409 });
});
it.each(['action', 'requested_by', 'requested_email', 'doctor_id', 'doctor_user_id', 'wallet_id', 'wallet', 'contract_id', 'network', 'method', 'expected_version', 'target_version', 'valid_until', 'dossier_id', 'transaction_hash'])('rejects mismatched administrative %s evidence', async field => {
  const f = fixture(); f.admin[field] = field === 'transaction_hash' ? null : 'changed';
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[1])).rejects.toMatchObject({ status: 409 });
});
it.each([2, 3, 4, 5, 6])('requires every earlier clinical slot confirmed before step %s', async index => {
  const f = fixture(); for (let previous = 1; previous < index; previous++) f.add(previous);
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[index])).resolves.toBeUndefined();
  f.rows[0].state = 'submitted'; await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[index])).rejects.toMatchObject({ status: 409 });
});
it('missing prerequisites and unsigned/cancelled/failed attempts cannot be skipped', async () => {
  const f = fixture(); await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[2])).rejects.toMatchObject({ status: 409 });
  const row = f.add(1);
  for (const state of ['awaiting_signature', 'submitted', 'cancelled', 'failed']) { row.state = state; await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[2])).rejects.toMatchObject({ status: 409 }); }
});
it('emergency withdrawal needs the first grant confirmed but no intervening successful doctor steps', async () => {
  const f = fixture(); await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[7])).rejects.toMatchObject({ status: 409 });
  f.add(1); f.add(2, 'awaiting_signature'); f.add(3, 'submitted');
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[7])).resolves.toBeUndefined();
});
it.each(['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled'])('once withdrawal is %s no non-withdrawal step may proceed', async state => {
  const f = fixture(); f.add(1); f.add(7, state);
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[2])).rejects.toMatchObject({ status: 409 });
});
it.each(['action', 'source_wallet', 'actor_user_id', 'wallet_id', 'contract_id', 'network'])('rejects a planned UUID with altered clinical %s binding', async field => {
  const f = fixture(); const row = f.add(1); row[field] = 'changed';
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[2])).rejects.toMatchObject({ status: 403 });
});
it('a fixed slot must already exist during signature or retransmission checks', async () => {
  const f = fixture(); await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[1], true)).rejects.toMatchObject({ status: 403 });
  f.add(1, 'awaiting_signature'); await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[1], true)).resolves.toBeUndefined();
});
it('does not adopt an unknown operation returned instead of a planned UUID', async () => {
  const f = fixture(); const row = f.add(1); row.id = uuid(99);
  await expect(assertClinicalRehearsalOrder(f.client, f.plan, f.plan.steps[2])).rejects.toMatchObject({ status: 403 });
});
it('binds expected doctor payload to this patient, operation nonce and exact grant revision', () => {
  const f = fixture(), step = f.plan.steps[3];
  const expected = { historyId, patient: patient.address, operationId: step.operationId!, author: doctor.address,
    entryId: deriveClinicalEntryId(historyId, doctor.address, step.operationId!), expectedVersion: 0, expectedGrantRevision: 5 };
  expect(() => assertClinicalRehearsalExpected(f.plan, step, doctor, expected)).not.toThrow();
  for (const patch of [{ historyId: 'f'.repeat(64) }, { patient: doctor.address }, { operationId: 'f'.repeat(64) }, { author: patient.address }, { expectedVersion: 1 }, { expectedGrantRevision: 6 }]) {
    expect(() => assertClinicalRehearsalExpected(f.plan, step, doctor, { ...expected, ...patch })).toThrow();
  }
});
it('permits only removal of both capabilities at emergency revision4/5/6', () => {
  const f = fixture(), step = f.plan.steps[7];
  const expected = { historyId, patient: patient.address, operationId: step.operationId!, doctorId: 10, doctor: doctor.address, canRead: false, canAppend: false, expectedRevision: 6 };
  for (const expectedRevision of [4, 5, 6]) expect(() => assertClinicalRehearsalExpected(f.plan, step, patient, { ...expected, expectedRevision })).not.toThrow();
  for (const patch of [{ expectedRevision: 3 }, { expectedRevision: 7 }, { canRead: true }, { canAppend: true }, { doctorId: 11 }, { doctor: patient.address }]) {
    expect(() => assertClinicalRehearsalExpected(f.plan, step, patient, { ...expected, ...patch })).toThrow();
  }
});

function withPolicyFile(work: (plan: RehearsalPolicy) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'trustleaf-rehearsal-order-unit-'));
  try {
    const plan = fixture().plan, bytes = Buffer.from(JSON.stringify(plan)), file = join(directory, 'scope.json');
    writeFileSync(file, bytes, { mode: 0o600 });
    const hash = createHash('sha256').update(bytes).digest('hex');
    const env = { TRUSTLEAF_CLINICAL_REHEARSAL_FILE: file, TRUSTLEAF_CLINICAL_REHEARSAL_HASH: hash, TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH: hash,
      TRUSTLEAF_ENV: 'local', TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
      DATABASE_URL: 'postgresql://unit:synthetic@ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech/test', TRUSTLEAF_DB_HOST: 'ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech',
      CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: clinical, DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: registry, DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: plan.admin,
      BOOKING_AUTHORITY_PUBLIC_KEY: plan.admin, RELAYER_SECRET: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 117)).secret() };
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined); vi.stubEnv('VERCEL', undefined); vi.stubEnv('TRUSTLEAF_DATABASE_URL', undefined);
    work(currentClinicalRehearsal()!);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
it('views expose only the selected role slots, never reviewed text, file bytes, private RX ID or dossier', () => withPolicyFile(plan => {
  const patientView = clinicalRehearsalView(patient, historyId), doctorView = clinicalRehearsalView(doctor, historyId);
  expect(patientView?.steps).toHaveLength(4); expect(doctorView?.steps).toHaveLength(3);
  expect(doctorView?.steps.map(step => step.kind)).toEqual(['note', 'file', 'note']);
  expect(patientView?.runId).toBe(plan.runId);
  const serialized = JSON.stringify({ patientView, doctorView });
  expect(serialized).not.toContain('Invented fixture'); expect(serialized).not.toContain(plan.steps[3].input!.note!.prescriptionId);
  expect(serialized).not.toContain(plan.steps[5].input!.file!.base64); expect(serialized).not.toContain(plan.authorization.dossierId);
}));
it('view rejects a different history, user or wallet without exposing another actor instructions', () => withPolicyFile(() => {
  expect(clinicalRehearsalView(patient, 'f'.repeat(64))).toBeUndefined();
  for (const patch of [{ userId: doctor.userId }, { walletId: doctor.walletId }, { address: doctor.address }]) {
    expect(clinicalRehearsalView({ ...patient, ...patch }, historyId)).toBeUndefined();
  }
}));
it('expiry blocks new writes but removes only the optional rehearsal overlay from historical reads', () => withPolicyFile(plan => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(plan.until * 1000));
  expect(() => currentClinicalRehearsal(patient)).toThrow('clinical_rehearsal_expired');
  expect(clinicalRehearsalView(patient, historyId)).toBeUndefined();
  expect(() => assertClinicalWriteScope('set_permissions', patient.address)).toThrow('clinical_rehearsal_expired');
}));
it('modified approval cannot expose signing instructions or write capabilities', () => withPolicyFile(() => {
  vi.stubEnv('TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH', 'f'.repeat(64));
  expect(clinicalRehearsalView(patient, historyId)).toBeUndefined();
  expect(() => assertClinicalWriteScope('append_version', doctor.address)).toThrow('clinical_rehearsal_scope_rejected');
}));
function feeTransaction(source = doctor.address, maxTime = Math.floor(Date.now() / 1000) + 180, archived: number[] = [], soroban = true, resourceFee = '6000000') {
  const builder = new TransactionBuilder(new Account(source, '10'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(new Contract(clinical).call('interface_version'));
  if (soroban) {
    const data = new SorobanDataBuilder().setResourceFee(resourceFee).build();
    data.ext(new xdr.SorobanTransactionDataExt(1, new xdr.SorobanResourcesExtV0({ archivedSorobanEntries: archived })));
    builder.setSorobanData(data);
  }
  return builder.setTimebounds(0, maxTime).build();
}
it('specific slot caps and source cannot be replaced in a real unsigned transaction quote', () => withPolicyFile(plan => {
  const step = plan.steps[3], transaction = feeTransaction();
  expect(() => assertClinicalRehearsalFee(plan, step, transaction, 10000000n)).not.toThrow();
  expect(transaction.signatures).toHaveLength(0);
  expect(() => assertClinicalRehearsalFee(plan, step, transaction, 10000001n)).toThrow();
  expect(() => assertClinicalRehearsalFee(plan, { ...step, maxFeeStroops: '9999999' }, transaction, 10000000n)).toThrow();
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(patient.address), 10000000n)).toThrow();
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(doctor.address, plan.until + 1), 10000000n)).toThrow();
}));
it('refuses an otherwise successful simulation footprint that would restore archived entries', () => withPolicyFile(plan => {
  expect(() => assertClinicalRehearsalFee(plan, plan.steps[3], feeTransaction(doctor.address, undefined, [0]), 10000000n)).toThrow();
}));
it('requires a real Testnet Soroban transaction and a truthful full-envelope quote', () => withPolicyFile(plan => {
  const step = plan.steps[3];
  expect(() => assertClinicalRehearsalFee(plan, step, { source: doctor.address, timeBounds: { maxTime: String(plan.until) } } as any, 1n)).toThrow();
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(doctor.address, undefined, [], false), 1n)).toThrow();
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(), 1n)).toThrow();
}));

it('requires the exact confirmed live version4 authorization for the approved 24-hour window', () => {
  const { plan } = fixture();
  const authorization = { version: 4, validUntil: plan.authorization.validUntil, commitment: 'c'.repeat(64), revoked: false, schemaVersion: 1 };
  expect(() => assertClinicalRehearsalAuthorization(plan, authorization, authorization.commitment)).not.toThrow();
  for (const patch of [{ version: 3 }, { version: 5 }, { validUntil: plan.authorization.validUntil - 1 }, { validUntil: plan.authorization.validUntil + 1 },
    { revoked: true }, { commitment: 'd'.repeat(64) }, { schemaVersion: 2 }]) {
    expect(() => assertClinicalRehearsalAuthorization(plan, { ...authorization, ...patch }, authorization.commitment)).toThrow('clinical_rehearsal_order_conflict');
  }
  for (const commitment of ['', '0'.repeat(64), 'c'.repeat(63), 'C'.repeat(64), 'not-a-commitment']) {
    expect(() => assertClinicalRehearsalAuthorization(plan, { ...authorization, commitment }, commitment)).toThrow('clinical_rehearsal_order_conflict');
  }
});


it('reports expiry of the unsigned attempt without claiming its still-active rehearsal expired', () => withPolicyFile(plan => {
  const now = Math.floor(Date.now() / 1000), step = plan.steps[3];
  expect(plan.until).toBeGreaterThan(now);
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(doctor.address, now), 10000000n))
    .toThrowError(expect.objectContaining({ message: 'signature_request_expired', status: 409 }));
  expect(() => assertClinicalRehearsalFee(plan, step, feeTransaction(doctor.address, now + 60), 10000000n)).not.toThrow();
}));


function continuationFixture() {
  const original = fixture(), previousSteps = original.plan.steps;
  const steps = [0,3,4,5,6,7].map((index,newIndex) => {
    const step = structuredClone(previousSteps[index]); step.requestId = uuid(101+newIndex);
    if (newIndex) { step.operationId = (newIndex+10).toString(16).repeat(64); step.input!.requestId = step.requestId; } return step;
  });
  steps[4].input!.entryId = deriveClinicalEntryId(historyId,doctor.address,steps[1].operationId!);
  const receipts = ['3cf5ccedbbcc8aa796662b1af869996e0a474934e7b5b62eaa78c805b318e4bb','0e9798dd745f544ee70b818fb860abb78de4663fbca0e0c4c2d3454070931215','43e1f8d254c4d6deba5c5c2e35f324806cfd2ea4498ddc84e52feb6e450c9f0f'];
  const expiresAt = Math.floor(Date.now()/1000)-1000;
  const plan = { ...original.plan, schemaVersion:2,startingGrantRevision:5,startingDoctorVersion:4,totalMaxFeeStroops:'60000000',steps,
    previousAuthorization:original.plan.authorization,previousSteps,
    authorization:{...original.plan.authorization,requestId:steps[0].requestId,dossierId:uuid(140),expectedVersion:4,targetVersion:5},
    lineage:{originalPlanFile:'C:/synthetic-original.json',originalPlanHash:'a'.repeat(64),originalRunId:original.plan.runId,priorDoctorValidUntil:original.plan.doctorValidUntil,
      confirmed:[0,1,2].map(index=>({key:previousSteps[index].key,requestId:previousSteps[index].requestId,transactionHash:receipts[index]})),
      cancelledNote:{requestId:previousSteps[3].requestId,operationId:previousSteps[3].operationId!,expiresAt}} } as RehearsalPolicy;
  const priorAdmin={...original.admin,transaction_hash:receipts[0]};
  const priorRows:Record<string,any>[] = [1,2].map(index=>{
    const step=previousSteps[index]; return {id:step.requestId,state:'confirmed',action:'set_permissions',source_wallet:patient.address,actor_user_id:patient.userId,wallet_id:patient.walletId,contract_id:clinical,network:'testnet',transaction_hash:receipts[index],
      expected:{historyId,patient:patient.address,operationId:step.operationId,doctorId:10,doctor:doctor.address,canRead:step.input!.canRead,canAppend:step.input!.canAppend,expectedRevision:step.input!.expectedRevision}};
  });
  priorRows.push({id:previousSteps[3].requestId,state:'cancelled',action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',error_code:'signature_request_expired',signed_xdr:null,transaction_hash:null,expires_at:expiresAt,
    expected:{historyId,patient:patient.address,operationId:previousSteps[3].operationId,author:doctor.address,expectedVersion:0,expectedGrantRevision:5}});
  const admin={...original.admin,id:plan.authorization.requestId,dossier_id:plan.authorization.dossierId,expected_version:4,target_version:5,transaction_hash:'c'.repeat(64)} as Record<string,any>;
  const rows:Record<string,any>[]=[];
  const client={query:vi.fn(async(sql:string,values:any[])=>({rows:sql.includes('FROM doctor_authorization_requests')?(values[0]===priorAdmin.id?[priorAdmin]:admin.state==='missing'?[]:[admin]):values[0].includes(plan.lineage!.cancelledNote.requestId)?priorRows:rows}))};
  function add(index:number,state='confirmed'){
    const step=steps[index],actor=step.actor==='patient'?patient:doctor;
    const row={id:step.requestId,state,action:step.action,source_wallet:actor.address,actor_user_id:actor.userId,wallet_id:actor.walletId,contract_id:clinical,network:'testnet',transaction_hash:state==='confirmed'?'d'.repeat(64):null};rows.push(row);return row;
  }
  return {plan,priorAdmin,priorRows,admin,rows,client:client as any,add};
}
it('continuation reuses three historical receipts as proof without reexecuting those slots',async()=>{
  const f=continuationFixture();
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).resolves.toBeUndefined();
  expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
  expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('id=ANY($1::uuid[])'),[f.plan.steps.slice(1).map(step=>step.requestId)]);
  expect(f.plan.steps.map(step=>step.key)).toEqual(['renew','append_note','grant_both','append_pdf','correct_note','revoke']);
});
it('continuation withdrawal can remove the existing grant even before its new renewal confirms',async()=>{
  const f=continuationFixture();f.admin.state='missing';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[5])).resolves.toBeUndefined();
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it.each(['state','transaction_hash','source_wallet','actor_user_id','wallet_id','contract_id','network'])('continuation rejects changed historical clinical %s proof',async field=>{
  const f=continuationFixture();f.priorRows[0][field]='changed';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it.each(['historyId','patient','operationId','doctorId','doctor','canRead','canAppend','expectedRevision'])('continuation rejects changed historical expected %s',async field=>{
  const f=continuationFixture();f.priorRows[1].expected[field]='changed';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it.each(['state','error_code','signed_xdr','transaction_hash','expires_at','actor_user_id'])('continuation rejects original expired note with changed %s',async field=>{
  const f=continuationFixture();f.priorRows[2][field]='changed';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it.each(['transaction_hash','expected_version','target_version','valid_until','dossier_id','requested_by','wallet'])('continuation rejects altered previous renewal %s',async field=>{
  const f=continuationFixture();f.priorAdmin[field]='changed';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it('continuation does not skip an unsigned, cancelled or failed new note',async()=>{
  const f=continuationFixture();
  for(const state of ['awaiting_signature','submitted','cancelled','failed']){
    f.rows.length=0;f.add(1,state);
    await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[2])).rejects.toMatchObject({status:409});
  }
  f.rows.length=0;f.add(1);await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[2])).resolves.toBeUndefined();
});
it('continuation terminal withdrawal closes later writes and cannot be spoofed by a changed key',async()=>{
  const f=continuationFixture();f.add(5,'awaiting_signature');
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,{...f.plan.steps[1],key:'revoke'})).rejects.toMatchObject({status:403});
});
it('continuation binds author grant revisions5 and6 while emergency removal permits only5 or6',()=>{
  const f=continuationFixture(),note=f.plan.steps[1],pdf=f.plan.steps[3],revoke=f.plan.steps[5];
  for(const [step,revision] of [[note,5],[pdf,6]] as const){
    const e={historyId,patient:patient.address,author:doctor.address,entryId:deriveClinicalEntryId(historyId,doctor.address,step.operationId!),operationId:step.operationId!,expectedVersion:0,expectedGrantRevision:revision};
    expect(()=>assertClinicalRehearsalExpected(f.plan,step,doctor,e)).not.toThrow();
    expect(()=>assertClinicalRehearsalExpected(f.plan,step,doctor,{...e,expectedGrantRevision:revision-1})).toThrow();
  }
  const e={historyId,patient:patient.address,operationId:revoke.operationId!,doctorId:10,doctor:doctor.address,canRead:false,canAppend:false,expectedRevision:6};
  for(const expectedRevision of [5,6])expect(()=>assertClinicalRehearsalExpected(f.plan,revoke,patient,{...e,expectedRevision})).not.toThrow();
  for(const expectedRevision of [4,7])expect(()=>assertClinicalRehearsalExpected(f.plan,revoke,patient,{...e,expectedRevision})).toThrow();
});

it('continuation acquires its transaction run lock before inspecting any clinical or administrative row',async()=>{
  const f=continuationFixture();await assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1]);
  expect(f.client.query.mock.calls[0]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))',['clinical-rehearsal:'+f.plan.runId]]);
  expect(f.client.query.mock.calls.slice(1).every(([sql])=>sql.includes('FROM '))).toBe(true);
});

it('reports the observed unsigned C2 resource quote as above budget without relaxing the one-XLM cap',()=>withPolicyFile(plan=>{
 const transaction=feeTransaction(doctor.address,undefined,[],true,'30416380');
 expect(transaction.signatures).toHaveLength(0);
 expect(()=>assertClinicalRehearsalFee(plan,plan.steps[3],transaction,34416380n)).toThrowError(expect.objectContaining({message:'clinical_rehearsal_fee_exceeded',status:409}));
 expect(plan.steps[3].maxFeeStroops).toBe('10000000');
}));


it.each([1,5])('reopened step %s requires the exact already-confirmed C1 receipt including early withdrawal',async index=>{
 const f=continuationFixture();
 Object.defineProperty(f.plan,'feeAmendment',{value:Object.freeze({confirmedRenewalTransactionHash:f.admin.transaction_hash}),enumerable:false});
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 f.admin.transaction_hash='e'.repeat(64);
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});
 f.admin.state='missing';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).rejects.toMatchObject({status:409});
});


function noteReplacementFixture() {
 const f=continuationFixture(),old=structuredClone(f.plan.steps[1]);
 const expiresAt=Math.floor(Date.now()/1000)-10,unsigned='Synthetic unsigned envelope retained for hash matching only.';
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned,'utf8').digest('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected:{historyId,patient:patient.address,author:doctor.address,operationId:old.operationId,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),expectedVersion:0,expectedGrantRevision:5}};
 const note={...old,requestId:uuid(201),operationId:'0a'.repeat(32),input:{...old.input!,requestId:uuid(201)}};
 (f.plan.steps as any[])[1]=note;
 Object.defineProperty(f.plan,'noteReplacement',{value:{amendmentId:uuid(230),preparedAt:expiresAt+1,approvedAt:expiresAt+2,basePlanHash:'a'.repeat(64),baseApprovalHash:'b'.repeat(64),supersededNote:proof,supersededStep:old,replacementNoteRequestId:note.requestId,replacementNoteOperationId:note.operationId,replacementNoteEntryId:deriveClinicalEntryId(historyId,doctor.address,note.operationId)},enumerable:false});
 Object.defineProperty(f.plan,'feeAmendment',{value:{confirmedRenewalTransactionHash:f.admin.transaction_hash},enumerable:false});
 const query=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>sql.includes('unsigned_xdr')?{rows:row.missing?[]:[row]}:query(sql,values));
 return {...f,superseded:row};
}
it.each([1,5])('replacement step %s requires its original cancelled unsigned note as immutable proof',async index=>{
 const f=noteReplacementFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('unsigned_xdr'),[f.plan.noteReplacement!.supersededNote.requestId]);
 expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['state','error_code','expires_at','unsigned_xdr','signed_xdr','transaction_hash','action','source_wallet','actor_user_id','wallet_id','contract_id','network'])('replacement refuses changed superseded %s before new clinical work',async field=>{
 const f=noteReplacementFixture();f.superseded[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});
});
it.each(['historyId','patient','author','operationId','entryId','expectedVersion','expectedGrantRevision'])('replacement refuses changed superseded expected %s',async field=>{
 const f=noteReplacementFixture();f.superseded.expected[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
});
it('replacement refuses a missing superseded row and never recreates it',async()=>{
 const f=noteReplacementFixture();f.superseded.missing=true;
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[1])).rejects.toMatchObject({status:409});
 expect(f.client.query.mock.calls.some(([sql])=>/INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
});


it('dispatches fees by exact request rather than the first actor slot with a lower historical cap',()=>withPolicyFile(base=>{
 const plan={...base,policyHash:base.policyHash,steps:base.steps.map(step=>({...step,maxFeeStroops:step.key==='append_pdf'?'150000000':step.actor==='doctor'?'100000000':step.maxFeeStroops}))} as RehearsalPolicy;
 const current=vi.spyOn(rehearsalFunctions,'currentClinicalRehearsal').mockReturnValue(plan);
 const check=vi.spyOn(rehearsalFunctions,'assertClinicalRehearsalFee').mockImplementation(()=>{});
 try {
  const policy={mode:'rehearsal' as const,wallet:doctor.address,relayer:plan.relayer,until:plan.until,plan};
  const pdf=plan.steps.find(step=>step.key==='append_pdf')!,tx=feeTransaction(doctor.address,undefined,[],true,'116000000');
  expect(()=>assertClinicalCreateOnceFee(policy,tx,pdf.requestId)).not.toThrow();
  expect(check).toHaveBeenLastCalledWith(plan,pdf,tx,120000000n);
  expect(()=>assertClinicalCreateOnceSavedFee(policy,tx.toXDR(),pdf.requestId)).not.toThrow();
  expect(check.mock.calls.at(-1)?.[1]).toBe(pdf);
  expect(()=>assertClinicalCreateOnceFee(policy,tx)).toThrow();
  expect(()=>assertClinicalCreateOnceFee(policy,tx,plan.steps.find(step=>step.actor==='patient')!.requestId)).toThrow();
 } finally {check.mockRestore();current.mockRestore();}
}));

it.each([3,5])('aggregate future step %s preserves both fixed confirmed note and permission receipts',async index=>{
 const f=noteReplacementFixture(),note=f.add(1),grant=f.add(2);
 Object.defineProperty(f.plan,'aggregateBudget',{value:{confirmedSteps:[{requestId:note.id,transactionHash:note.transaction_hash},{requestId:grant.id,transactionHash:grant.transaction_hash}]},enumerable:false});
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 note.transaction_hash='e'.repeat(64);
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});
 note.transaction_hash='d'.repeat(64);grant.state='cancelled';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).rejects.toMatchObject({status:409});
});


function pdfReplacementFixture(){
 const f=noteReplacementFixture(),old=structuredClone(f.plan.steps[3]),expiresAt=Math.floor(Date.now()/1000)-10;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),
  commitment:'ab'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'101'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build();
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned.toXDR(),'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned.toXDR(),
  signing_hash:proof.signingHash,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(501),operationId:'bc'.repeat(32),input:{...old.input!,requestId:uuid(501)}};
 (f.plan.steps as any[])[3]=pdf;
 Object.defineProperty(f.plan,'pdfReplacement',{value:{amendmentId:uuid(530),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),supersededPdf:proof,supersededStep:old,
  replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false,configurable:true});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('synthetic_operation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,
  payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:f.plan.relayer,
    actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,
    operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},
   quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const extras:Record<string,unknown>[]=[];
 const prior=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations'))return {rows:reservation.missing?[]:[reservation]};
  if(sql.startsWith('SELECT request_id FROM sponsorship_reservations'))return {rows:extras};
  if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};
  return prior(sql,values);
 });
 f.add(1);f.add(2);
 return {...f,oldPdf:row,reservation,extras};
}
it.each([3,5])('PDF replacement guards old cancelled proof and released budget before future step%s under runlock',async index=>{
 const f=pdfReplacementFixture();
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const calls=f.client.query.mock.calls;
 expect(calls.findIndex(([sql])=>sql.includes('pg_advisory_xact_lock'))).toBeLessThan(calls.findIndex(([sql])=>sql.includes('signing_hash')));
 expect(calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 const query=calls.find(([sql])=>sql.startsWith('SELECT request_id FROM sponsorship_reservations'));
 expect(query?.[1][2]).toEqual(f.plan.steps.filter(s=>['append_pdf','correct_note','revoke'].includes(s.key)).map(s=>s.requestId));
});
it.each(['state','error_code','expires_at','unsigned_xdr','signing_hash','signed_xdr','transaction_hash','action','source_wallet','actor_user_id','wallet_id','contract_id','network'])('PDF replacement refuses altered terminal%s',async field=>{
 const f=pdfReplacementFixture();f.oldPdf[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['historyId','patient','author','operationId','entryId','expectedVersion','expectedGrantRevision','previousCommitment'])('PDF replacement refuses altered expected%s',async field=>{
 const f=pdfReplacementFixture();f.oldPdf.expected[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['state','transactionHash','signedInnerDigest','signedAt','chargedStroops','outcome','ledger'])('PDF replacement refuses nonempty or un-released reservation payload%s',async field=>{
 const f=pdfReplacementFixture();f.reservation.payload[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['requestId','network','sourceAddress','patientAddress','sponsorAddress','actorId','walletId','contractId','action','encounterId','operationFingerprint'])('PDF replacement requires exact old reservation binding%s',async field=>{
 const f=pdfReplacementFixture();f.reservation.payload.binding[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['unsignedHash','signingHash','maxTime','offeredFeeStroops'])('PDF replacement refuses altered old reservation quote%s',async field=>{
 const f=pdfReplacementFixture();f.reservation.payload.quote[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it('PDF replacement refuses missing proof/reservation or another live/paid sibling reservation, without resetting any slot',async()=>{
 for(const kind of ['proof','reservation','extra']){
  const f=pdfReplacementFixture();if(kind==='proof')f.oldPdf.missing=true;else if(kind==='reservation')f.reservation.missing=true;else f.extras.push({request_id:uuid(999)});
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
  expect(f.client.query.mock.calls.some(([sql])=>/INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
 }
});

function secondPdfReplacementFixture(){
 const f=pdfReplacementFixture(),priorReplacement=f.plan.pdfReplacement!,old=structuredClone(f.plan.steps[3]),expiresAt=Math.floor(Date.now()/1000)-5;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),
  commitment:'cd'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'102'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build();
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned.toXDR(),'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned.toXDR(),
  signing_hash:proof.signingHash,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(601),operationId:'de'.repeat(32),input:{...old.input!,requestId:uuid(601)}};
 (f.plan.steps as any[])[3]=pdf;
 Object.defineProperty(f.plan,'priorPdfReplacement',{value:priorReplacement,enumerable:false});
 Object.defineProperty(f.plan,'pdfReplacement',{value:{amendmentId:uuid(630),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'e'.repeat(64),baseApprovalHash:'f'.repeat(64),supersededPdf:proof,supersededStep:old,
  replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('synthetic_operation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,
  payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:f.plan.relayer,
    actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,
    operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},
   quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const prior=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations')&&values?.[0]===proof.requestId)return {rows:reservation.missing?[]:[reservation]};
  if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};
  return prior(sql,values);
 });
 return {...f,replacedPdf:row,replacedReservation:reservation};
}
it.each([3,5])('second PDF replacement rechecks both prior unsigned terminal slots and released reservations before step%s',async index=>{
 const f=secondPdfReplacementFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const proofs=f.client.query.mock.calls.filter(([sql])=>sql.includes('signing_hash'));
 expect(proofs.map(([,values])=>values[0])).toEqual([f.plan.priorPdfReplacement!.supersededPdf.requestId,f.plan.pdfReplacement!.supersededPdf.requestId]);
 expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 expect(f.plan.steps[3].input!.file).toEqual(f.plan.priorPdfReplacement!.supersededStep.input!.file);
 expect(f.plan.steps[3].input!.file).toEqual(f.plan.pdfReplacement!.supersededStep.input!.file);
});
it.each(['first','second'])('second replacement cannot hide a signed, live, charged or missing %s predecessor',async which=>{
 for(const change of ['signed','hash','active','missing','charged','unreleased']){
  const f=secondPdfReplacementFixture(),row=which==='first'?f.oldPdf:f.replacedPdf,reservation=which==='first'?f.reservation:f.replacedReservation;
  if(change==='signed')row.signed_xdr='signed';else if(change==='hash')row.transaction_hash='ab'.repeat(32);else if(change==='active')row.state='awaiting_signature';
  else if(change==='missing')row.missing=true;else if(change==='charged')reservation.payload.chargedStroops='1';else reservation.state='reserved';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});
 }
});
it.each(['state','error_code','expires_at','unsigned_xdr','signing_hash','signed_xdr','transaction_hash','action','source_wallet','actor_user_id','wallet_id','contract_id','network'])('second replacement rejects changed immediate predecessor %s',async field=>{
 const f=secondPdfReplacementFixture();f.replacedPdf[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['state','transactionHash','signedInnerDigest','signedAt','chargedStroops','outcome','ledger'])('second replacement rejects changed immediate reservation %s',async field=>{
 const f=secondPdfReplacementFixture();f.replacedReservation.payload[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it('second replacement preserves confirmed C2/C3 hashes, C5/C6 identifiers and blocks sibling uncertain/paid reservations',async()=>{
 const f=secondPdfReplacementFixture(),note=f.rows.find((row:Record<string,any>)=>row.id===f.plan.steps[1].requestId)!,grant=f.rows.find((row:Record<string,any>)=>row.id===f.plan.steps[2].requestId)!;
 Object.defineProperty(f.plan,'aggregateBudget',{value:{confirmedSteps:[{requestId:note.id,transactionHash:note.transaction_hash},{requestId:grant.id,transactionHash:grant.transaction_hash}]},enumerable:false});
 const tail=f.plan.steps.slice(4).map(step=>({...step,input:structuredClone(step.input)}));
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).resolves.toBeUndefined();
 expect(f.plan.steps.slice(4)).toEqual(tail);
 note.transaction_hash='ef'.repeat(32);await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
 note.transaction_hash=txHash;f.extras.push({request_id:uuid(999)});await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it('second replacement does not allow C5 before the new C4 confirms or reopen a persisted final withdrawal',async()=>{
 const f=secondPdfReplacementFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[4])).rejects.toMatchObject({status:409});
 f.add(3);await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[4])).resolves.toBeUndefined();
 f.add(5,'awaiting_signature');await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});

it('reviewed PDF payload accepts only valid off-chain draft delimiters without changing the approved step',()=>withPolicyFile(plan=>{
 const pdf=plan.steps.find(step=>step.key==='append_pdf')!,input=pdf.input!;
 expect(rehearsalFunctions.clinicalRehearsalStep(plan,doctor,input as any)).toBe(pdf);
 expect(rehearsalFunctions.clinicalRehearsalStep(plan,doctor,{...input,draftId:uuid(801),draftRevision:2} as any)).toBe(pdf);
 expect(input).not.toHaveProperty('draftId');expect(input).not.toHaveProperty('draftRevision');
}));
it.each([
 {draftId:uuid(801)}, {draftRevision:2}, {draftId:'ABCDEF00-0000-4000-8000-000000000801',draftRevision:2},
 {draftId:uuid(801)+'\n',draftRevision:2}, {draftId:uuid(801),draftRevision:0}, {draftId:uuid(801),draftRevision:1.5},
 {draftId:uuid(801),draftRevision:'2'}, {draftId:uuid(801),draftRevision:2147483647}, {draftId:uuid(801),draftRevision:null}
])('reviewed PDF rejects malformed draft delimiters%j',delimiters=>withPolicyFile(plan=>{
 const pdf=plan.steps.find(step=>step.key==='append_pdf')!;
 expect(()=>rehearsalFunctions.clinicalRehearsalStep(plan,doctor,{...pdf.input,...delimiters} as any)).toThrowError(expect.objectContaining({message:'clinical_rehearsal_scope_rejected',status:403}));
}));
it.each(['patient','author','operationId','entryId','maxFeeStroops','until','unknown'])('reviewed PDF never strips clinical or unknown payload field%s',field=>withPolicyFile(plan=>{
 const pdf=plan.steps.find(step=>step.key==='append_pdf')!;
 expect(()=>rehearsalFunctions.clinicalRehearsalStep(plan,doctor,{...pdf.input,draftId:uuid(801),draftRevision:2,[field]:'changed'} as any)).toThrowError(expect.objectContaining({status:403}));
}));
it('draft delimiters cannot substitute the PDF bytes or filename',()=>withPolicyFile(plan=>{
 const pdf=plan.steps.find(step=>step.key==='append_pdf')!;
 for(const file of [{...pdf.input!.file!,fileName:'different.pdf'},{...pdf.input!.file!,base64:syntheticClinicalPdf(2).toString('base64')}])
  expect(()=>rehearsalFunctions.clinicalRehearsalStep(plan,doctor,{...pdf.input,draftId:uuid(801),draftRevision:2,file} as any)).toThrowError(expect.objectContaining({status:403}));
}));

function thirdPdfReplacementFixture(){
 const f=secondPdfReplacementFixture(),previous=f.plan.pdfReplacement!,old=structuredClone(f.plan.steps[3]),expiresAt=Math.floor(Date.now()/1000)-3;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),
  commitment:'ef'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'103'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build();
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned.toXDR(),'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned.toXDR(),
  signing_hash:proof.signingHash,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(701),operationId:'ea'.repeat(32),input:{...old.input!,requestId:uuid(701)}};
 (f.plan.steps as any[])[3]=pdf;
 Object.defineProperty(f.plan,'priorPdfReplacements',{value:[f.plan.priorPdfReplacement!,previous],enumerable:false});
 Object.defineProperty(f.plan,'pdfReplacement',{value:{amendmentId:uuid(730),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),supersededPdf:proof,supersededStep:old,
  replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('synthetic_operation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,
  payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:f.plan.relayer,
    actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,
    operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},
   quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const prior=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations')&&values?.[0]===proof.requestId)return {rows:reservation.missing?[]:[reservation]};
  if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};
  return prior(sql,values);
 });
 return {...f,latestReplacedPdf:row,latestReplacedReservation:reservation};
}
it.each([3,5])('third PDF replacement requires all three unsigned terminal proofs and released reservations before step%s',async index=>{
 const f=thirdPdfReplacementFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const proofs=f.client.query.mock.calls.filter(([sql])=>sql.includes('signing_hash'));
 expect(proofs.map(([,values])=>values[0])).toEqual([...f.plan.priorPdfReplacements!.map(p=>p.supersededPdf.requestId),f.plan.pdfReplacement!.supersededPdf.requestId]);
 expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['first','second','third'])('third PDF replacement cannot conceal a signed, pending, charged, missing or unreleased %s predecessor',async which=>{
 for(const change of ['signed','hash','active','missing','charged','unreleased']){
  const f=thirdPdfReplacementFixture(),row=which==='first'?f.oldPdf:which==='second'?f.replacedPdf:f.latestReplacedPdf,
   reservation=which==='first'?f.reservation:which==='second'?f.replacedReservation:f.latestReplacedReservation;
  if(change==='signed')row.signed_xdr='signed';else if(change==='hash')row.transaction_hash='ab'.repeat(32);else if(change==='active')row.state='awaiting_signature';
  else if(change==='missing')row.missing=true;else if(change==='charged')reservation.payload.chargedStroops='1';else reservation.state='reserved';
  await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({message:'clinical_rehearsal_order_conflict',status:409});
 }
});
it.each(['historyId','patient','author','operationId','entryId','expectedVersion','expectedGrantRevision','previousCommitment'])('third PDF replacement requires immediate expected binding%s',async field=>{
 const f=thirdPdfReplacementFixture();f.latestReplacedPdf.expected[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['requestId','network','sourceAddress','patientAddress','sponsorAddress','actorId','walletId','contractId','action','encounterId','operationFingerprint'])('third PDF replacement requires immediate reservation binding%s',async field=>{
 const f=thirdPdfReplacementFixture();f.latestReplacedReservation.payload.binding[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['unsignedHash','signingHash','maxTime','offeredFeeStroops'])('third PDF replacement requires immediate reservation quote%s',async field=>{
 const f=thirdPdfReplacementFixture();f.latestReplacedReservation.payload.quote[field]='changed';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it('third replacement keeps C2/C3 paid and C5/C6 unchanged; sibling uncertain or paid reservations still block',async()=>{
 const f=thirdPdfReplacementFixture(),note=f.rows.find((row:Record<string,any>)=>row.id===f.plan.steps[1].requestId)!,grant=f.rows.find((row:Record<string,any>)=>row.id===f.plan.steps[2].requestId)!;
 Object.defineProperty(f.plan,'aggregateBudget',{value:{confirmedSteps:[{requestId:note.id,transactionHash:note.transaction_hash},{requestId:grant.id,transactionHash:grant.transaction_hash}]},enumerable:false});
 const tail=structuredClone(f.plan.steps.slice(4));await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).resolves.toBeUndefined();expect(f.plan.steps.slice(4)).toEqual(tail);
 grant.transaction_hash='ef'.repeat(32);await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
 grant.transaction_hash=txHash;f.extras.push({request_id:uuid(999)});await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it('third replacement cannot skip the current C4 before C5 or reopen a persisted C6',async()=>{
 const f=thirdPdfReplacementFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[4])).rejects.toMatchObject({status:409});
 f.add(3);await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[4])).resolves.toBeUndefined();
 f.add(5,'awaiting_signature');await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});

function completionFixture(){
 const f=thirdPdfReplacementFixture(),approvedAt=Math.floor(Date.now()/1000)-2;
 Object.defineProperty(f.plan,'completionContinuation',{value:{approvedAt,executionUntil:approvedAt+14400,doctorWindowSeconds:604800},enumerable:false});
 (f.plan as any).createdAt=approvedAt;(f.plan as any).until=approvedAt+14400;(f.plan as any).doctorValidUntil=approvedAt+604800;
 const old=f.plan.authorization;
 (f.plan as any).authorization={...old,requestId:uuid(801),dossierId:uuid(840),expectedVersion:5,targetVersion:6,validUntil:f.plan.doctorValidUntil};
 (f.plan.steps as any[])[0]={...f.plan.steps[0],requestId:uuid(801)};
 Object.assign(f.admin,{id:uuid(801),dossier_id:uuid(840),expected_version:5,target_version:6,valid_until:f.plan.doctorValidUntil,transaction_hash:'f1'.repeat(32)});
 return f;
}
it('schema12 requires its new exact seven-day renewal while preserving C2/C3 and all three terminal PDFs',async()=>{
 const f=completionFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).resolves.toBeUndefined();
 expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('doctor_authorization_requests WHERE id=$1'),[uuid(801)]);
 const scans=f.client.query.mock.calls.filter(([sql])=>sql.includes('state<>\'released\''));
 expect(scans.length).toBe(3);expect(scans.every(([,values])=>values[2].includes(uuid(801)))).toBe(true);
 f.admin.target_version=5;await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['missing','pending','submitted','failed'])('schema12 permits withdrawal with a %s renewal and no PDF or correction',async state=>{
 const f=completionFixture();f.admin.state=state;
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[5])).resolves.toBeUndefined();
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});
it.each(['awaiting_signature','submitted','confirmed','failed','cancelled'])('schema12 withdrawal persisted as %s permanently seals future doctor publications',async state=>{
 const f=completionFixture();f.add(5,state);
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[5],true)).resolves.toBeUndefined();
});

it('schema12 withdrawal binds the already-confirmed revision6 without reopening revision5',()=>{
 const f=completionFixture(),step=f.plan.steps[5],e={historyId,patient:patient.address,operationId:step.operationId!,doctorId:10,doctor:doctor.address,canRead:false,canAppend:false,expectedRevision:6};
 expect(()=>assertClinicalRehearsalExpected(f.plan,step,patient,e)).not.toThrow();
 expect(()=>assertClinicalRehearsalExpected(f.plan,step,patient,{...e,expectedRevision:5})).toThrow();
});


/** Fourth predecessor is synthetic; no approval, reservation or chain is real. */
function expiredUnsignedPdfRecoveryFixture(){
 const f=thirdPdfReplacementFixture(),parent=f.plan,old=structuredClone(parent.steps[3]),expiresAt=Math.floor(Date.now()/1000)-3;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),
  commitment:'f1'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'104'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build();
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned.toXDR(),'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned.toXDR(),
  signing_hash:proof.signingHash,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(1501),operationId:'fb'.repeat(32),input:{...old.input!,requestId:uuid(1501)}};
 const plan={...parent,steps:parent.steps.map((s,i)=>i===3?pdf:s)} as RehearsalPolicy;
 for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(parent)))
  if(!descriptor.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(name))Object.defineProperty(plan,name,descriptor);
 Object.defineProperty(plan,'priorPdfReplacements',{value:[...parent.priorPdfReplacements!,parent.pdfReplacement!],enumerable:false});
 Object.defineProperty(plan,'pdfReplacement',{value:{amendmentId:uuid(1530),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),supersededPdf:proof,supersededStep:old,
  replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false});
 Object.defineProperty(plan,'expiredPdfRecovery',{value:{amendmentId:uuid(1530),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),baseFinancialUntil:parent.until,priorPdfProofCount:3,
  evidenceFile:'UNIT ONLY',evidenceSha256:'ee'.repeat(32)},enumerable:false});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('synthetic_operation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,
  payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:plan.relayer,
    actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,
    operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},
   quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const prior=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations')&&values?.[0]===proof.requestId)return {rows:reservation.missing?[]:[reservation]};
  if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};
  return prior(sql,values);
 });
 return {...f,plan,latestExpiredPdf:row,latestExpiredReservation:reservation};
}
it.each([3,5])('raw15 web recovery checks all four terminal predecessors before step%s using SELECT only',async index=>{
 const f=expiredUnsignedPdfRecoveryFixture();
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const reads=f.client.query.mock.calls.filter(([sql])=>sql.includes('signing_hash'));
 expect(reads.map(([,values])=>values[0])).toEqual([...f.plan.priorPdfReplacements!.map(p=>p.supersededPdf.requestId),f.plan.pdfReplacement!.supersededPdf.requestId]);
 expect(reads).toHaveLength(4);expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['signed','hash','active','missing','charged','unreleased','binding','quote'])('raw15 web recovery rejects %s fourth predecessor and preserves its record',async change=>{
 const f=expiredUnsignedPdfRecoveryFixture(),row=f.latestExpiredPdf,res=f.latestExpiredReservation;
 if(change==='signed')row.signed_xdr='UNIT SIGNED';
 if(change==='hash')row.transaction_hash='cc'.repeat(32);
 if(change==='active')row.state='awaiting_signature';
 if(change==='missing')row.missing=true;
 if(change==='charged')res.payload.chargedStroops='1';
 if(change==='unreleased')res.state='reserved';
 if(change==='binding')res.payload.binding.patientAddress=doctor.address;
 if(change==='quote')res.payload.quote.maxTime++;
 const before=JSON.stringify({row,res});
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
 expect(JSON.stringify({row,res})).toBe(before);
});
it('raw15 preserves C5/C6, rejects incomplete predecessor lists and cannot conceal sibling uncertain reservations',async()=>{
 const f=expiredUnsignedPdfRecoveryFixture(),tail=structuredClone(f.plan.steps.slice(4));
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[4])).rejects.toMatchObject({status:409});
 expect(f.plan.steps.slice(4)).toEqual(tail);
 f.extras.push({request_id:uuid(1599)});
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
 f.extras.length=0;(f.plan.priorPdfReplacements as any[]).pop();
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});

function recoveredReopenedPdfFixture(){
 const f=expiredUnsignedPdfRecoveryFixture(),parent=f.plan,old=structuredClone(parent.steps[3]),expiresAt=Math.floor(Date.now()/1000)-3;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),
  commitment:'f1'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'104'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
  .addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build();
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsigned.toXDR(),'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'cancelled',error_code:'signature_request_expired',expires_at:expiresAt,unsigned_xdr:unsigned.toXDR(),
  signing_hash:proof.signingHash,signed_xdr:null,transaction_hash:null,action:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(1701),operationId:'fa'.repeat(32),input:{...old.input!,requestId:uuid(1701)}};
 const plan={...parent,steps:parent.steps.map((s,i)=>i===3?pdf:s)} as RehearsalPolicy;
 for(const [name,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(parent)))
  if(!descriptor.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(name))Object.defineProperty(plan,name,descriptor);
 Object.defineProperty(plan,'priorPdfReplacements',{value:[...parent.priorPdfReplacements!,parent.pdfReplacement!],enumerable:false});
 Object.defineProperty(plan,'pdfReplacement',{value:{amendmentId:uuid(1530),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),supersededPdf:proof,supersededStep:old,
  replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false});
 Object.defineProperty(plan,'recoveredReopenedPdf',{value:{amendmentId:uuid(1530),preparedAt:expiresAt+1,approvedAt:expiresAt+2,
  basePlanHash:'c'.repeat(64),baseApprovalHash:'d'.repeat(64),baseFinancialUntil:parent.until,priorPdfProofCount:4,
  evidenceFile:'UNIT ONLY',evidenceSha256:'ee'.repeat(32)},enumerable:false});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('synthetic_operation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,
  payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,
   binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:plan.relayer,
    actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,
    operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},
   quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const prior=f.client.query.getMockImplementation()!;
 f.client.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations')&&values?.[0]===proof.requestId)return {rows:reservation.missing?[]:[reservation]};
  if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};
  return prior(sql,values);
 });
 return {...f,plan,latestExpiredPdf:row,latestExpiredReservation:reservation};
}

it.each([3,5])('raw17 checks all five unsigned terminal predecessors before step%s',async index=>{
 const f=recoveredReopenedPdfFixture();await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const reads=f.client.query.mock.calls.filter(([sql])=>sql.includes('signing_hash'));expect(reads).toHaveLength(5);
 expect(reads.map(([,v])=>v[0])).toEqual([...f.plan.priorPdfReplacements!.map(p=>p.supersededPdf.requestId),f.plan.pdfReplacement!.supersededPdf.requestId]);
 expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['signed','active','unreleased','charged'])('raw17 refuses a %s latest predecessor before publication',async change=>{
 const f=recoveredReopenedPdfFixture();if(change==='signed')f.latestExpiredPdf.signed_xdr='UNIT SIGNED';if(change==='active')f.latestExpiredPdf.state='awaiting_signature';if(change==='unreleased')f.latestExpiredReservation.state='reserved';if(change==='charged')f.latestExpiredReservation.payload.chargedStroops='1';
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});
});


function expiredSignedPdfRecoveryFixture(){
 const f=recoveredReopenedPdfFixture(),parent=f.plan,old=structuredClone(parent.steps[3]),expiresAt=Math.floor(Date.now()/1000)-90;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId:old.operationId!,entryId:deriveClinicalEntryId(historyId,doctor.address,old.operationId!),commitment:'f2'.repeat(32),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'105'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(clinicalInvocation('append_version',expected)).setTimebounds(0,expiresAt).build(),unsignedXdr=unsigned.toXDR();
 unsigned.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32,116)));const outer=TransactionBuilder.buildFeeBumpTransaction(Keypair.fromRawEd25519Seed(Buffer.alloc(32,117)),'2000000',unsigned,Networks.TESTNET);outer.sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32,117)));
 const proof={requestId:old.requestId,operationId:old.operationId!,expiresAt,unsignedEnvelopeHash:createHash('sha256').update(unsignedXdr,'utf8').digest('hex'),signingHash:unsigned.hash().toString('hex')};
 const row:Record<string,any>={id:old.requestId,state:'failed',error_code:'signed_expired_before_submission',expires_at:expiresAt,unsigned_xdr:unsignedXdr,signing_hash:proof.signingHash,signed_xdr:outer.toXDR(),transaction_hash:outer.hash().toString('hex'),action:'append_version',method:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:clinical,network:'testnet',expected};
 const pdf={...old,requestId:uuid(1801),operationId:'fb'.repeat(32),input:{...old.input!,requestId:uuid(1801)}};
 const plan={...parent,steps:parent.steps.map((step,i)=>i===3?pdf:step)} as RehearsalPolicy;
 for(const[name,d]of Object.entries(Object.getOwnPropertyDescriptors(parent)))if(!d.enumerable&&!['pdfReplacement','priorPdfReplacements'].includes(name))Object.defineProperty(plan,name,d);
 Object.defineProperty(plan,'priorPdfReplacements',{value:[...parent.priorPdfReplacements!,parent.pdfReplacement!],enumerable:false});
 Object.defineProperty(plan,'pdfReplacement',{value:{amendmentId:uuid(1830),preparedAt:expiresAt+65,approvedAt:expiresAt+70,basePlanHash:'ab'.repeat(32),baseApprovalHash:'cd'.repeat(32),supersededPdf:proof,supersededStep:old,replacementPdfRequestId:pdf.requestId,replacementPdfOperationId:pdf.operationId,replacementPdfEntryId:deriveClinicalEntryId(historyId,doctor.address,pdf.operationId)},enumerable:false});
 Object.defineProperty(plan,'expiredSignedPdfRecovery',{value:{amendmentId:uuid(1830),preparedAt:expiresAt+65,approvedAt:expiresAt+70,sourceApprovedAt:expiresAt-30,executionUntil:parent.until,priorPdfProofCount:5,evidenceFile:'UNIT18 ONLY',evidenceSha256:'ee'.repeat(32),requestId:old.requestId,transactionHash:row.transaction_hash,signedEnvelopeSha256:createHash('sha256').update(row.signed_xdr,'utf8').digest('hex')},enumerable:false});
 const op=unsigned.operations[0];if(op.type!=='invokeHostFunction')throw Error('unit18_invocation');
 const reservation:Record<string,any>={request_id:proof.requestId,network:'testnet',state:'released',transaction_hash:null,payload:{state:'released',transactionHash:null,signedInnerDigest:null,signedAt:null,chargedStroops:null,outcome:null,ledger:null,binding:{requestId:proof.requestId,network:'testnet',sourceAddress:doctor.address,patientAddress:patient.address,sponsorAddress:plan.relayer,actorId:doctor.userId,walletId:doctor.walletId,contractId:clinical,action:'append_version',encounterId:expected.entryId,operationFingerprint:createHash('sha256').update(op.func.toXDR('base64')).digest('hex')},quote:{unsignedHash:proof.unsignedEnvelopeHash,signingHash:proof.signingHash,maxTime:proof.expiresAt,offeredFeeStroops:'4000000'}}};
 const prior=f.client.query.getMockImplementation()!;f.client.query.mockImplementation(async(sql:string,values:any[])=>{if(sql.startsWith('SELECT request_id,network,state,transaction_hash,payload FROM sponsorship_reservations')&&values?.[0]===proof.requestId)return {rows:reservation.missing?[]:[reservation]};if(sql.includes('unsigned_xdr')&&values?.[0]===proof.requestId)return {rows:row.missing?[]:[row]};return prior(sql,values);});
 return {...f,plan,signedExpiredPdf:row,signedExpiredReservation:reservation};
}
it.each([3,5])('raw18 audits the exact never-submitted signed PDF and all five earlier unsigned predecessors before step%s',async index=>{
 const f=expiredSignedPdfRecoveryFixture(),signed=f.signedExpiredPdf.signed_xdr,hash=f.signedExpiredPdf.transaction_hash;await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[index])).resolves.toBeUndefined();
 const reads=f.client.query.mock.calls.filter(([sql])=>sql.includes('signing_hash'));expect(reads).toHaveLength(6);expect(f.signedExpiredPdf.signed_xdr).toBe(signed);expect(f.signedExpiredPdf.transaction_hash).toBe(hash);expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it.each(['bytes','hash','terminal','reserved','journal-hash','charged','prior-signed','grant','author'])('raw18 rejects %s ambiguity without changing any envelope or reserve',async change=>{
 const f=expiredSignedPdfRecoveryFixture();if(change==='bytes')f.signedExpiredPdf.signed_xdr='UNIT CORRUPT';if(change==='hash')f.signedExpiredPdf.transaction_hash='aa'.repeat(32);if(change==='terminal')f.signedExpiredPdf.error_code='signature_request_expired';if(change==='reserved')f.signedExpiredReservation.state='reserved';if(change==='journal-hash')f.signedExpiredReservation.payload.transactionHash=f.signedExpiredPdf.transaction_hash;if(change==='charged')f.signedExpiredReservation.payload.chargedStroops='1';if(change==='prior-signed')f.latestExpiredPdf.signed_xdr='UNIT CORRUPT';if(change==='grant')f.signedExpiredPdf.expected.expectedGrantRevision=7;if(change==='author')f.signedExpiredPdf.source_wallet=patient.address;
 await expect(assertClinicalRehearsalOrder(f.client,f.plan,f.plan.steps[3])).rejects.toMatchObject({status:409});expect(f.client.query.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
