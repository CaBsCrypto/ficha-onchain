import { beforeEach, expect, it, vi } from 'vitest';
import { PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
const m = vi.hoisted(() => ({ query: vi.fn(), wallet: vi.fn(), view: vi.fn(), doctor: vi.fn(), rx: {} as any, clinical: {} as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: m.query }) }));
vi.mock('@/lib/private-prescriptions', () => ({ privateActorWallet: m.wallet, prescriptionView: m.view }));
vi.mock('@/lib/stellar/private-chain', () => ({ createPrivateChain: () => m.rx }));
vi.mock('@/lib/clinical/chain', () => ({ createClinicalWebChain: () => m.clinical }));
vi.mock('@/lib/clinical/doctor-context', () => ({ clinicalDoctorContext: m.doctor }));
import { clinicalPrescriptionOptions, clinicalPrescriptionReference } from '@/lib/clinical/prescriptions';

const patient = 'verified-patient', doctor = 'verified-doctor';
const actor = { userId: 'did:privy:patient', walletId: 'patient-wallet-id', address: patient };
const user = { userId: actor.userId, email: 'patient@example.test' };
const doctorActor = { userId: 'did:privy:doctor', walletId: 'doctor-wallet-id', address: doctor };
const doctorUser = { userId: doctorActor.userId, email: 'doctor@example.test' };
const historyId = 'ab'.repeat(32), id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let row: Record<string, any>;
function fixtureRow() { return { id, rx_id: '17', appointment_id: 24, issuance_id: 'issuance-id',
  patient_wallet: patient, patient_requested_by: actor.userId, patient_wallet_id: actor.walletId,
  doctor_wallet: doctor, doctor_user_id: doctorActor.userId, doctor_wallet_id: doctorActor.walletId,
  contract_id: RX_PRIVATE, network: 'testnet', state: 'confirmed', commitment: 'cd'.repeat(32), expires_at: 1_900_000_000,
  transaction_hash: 'ef'.repeat(32), patient_name: 'Synthetic patient', doctor_name: 'Synthetic doctor' }; }
beforeEach(() => {
  vi.resetAllMocks(); row = fixtureRow();
  m.wallet.mockImplementation(async (value: any) => value.userId === actor.userId ? { address: patient, walletId: actor.walletId }
    : { address: doctor, walletId: doctorActor.walletId });
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? [structuredClone(row)]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  m.rx = { verifyDeployment: vi.fn(async () => undefined) };
  m.clinical = { history: vi.fn(async () => ({ id: historyId, patient })) };
  m.doctor.mockResolvedValue({ historyId, canRead: true, canAppend: false, grantRevision: 3 });
  m.view.mockImplementation(async (value: any) => ({ id: value.id, rxId: value.rx_id, appointmentId: value.appointment_id,
    status: 'Active', expired: false, expiresAt: Number(value.expires_at), transactionHash: value.transaction_hash,
    doctorName: value.doctor_name, patientName: value.patient_name, operation: { signingHash: 'not-for-clinical-summary' } }));
});

it.each([['patient', actor, user], ['issuing doctor', doctorActor, doctorUser]] as const)('links an existing confirmed RX for its independently bound %s', async (_, a, u) => {
  const reference = await clinicalPrescriptionReference(u, a, patient, id);
  expect(reference).toEqual({ id, rxId: '17', appointmentId: 24, status: 'Active', expired: false,
    expiresAt: 1_900_000_000, transactionHash: row.transaction_hash, doctorName: row.doctor_name, patientName: row.patient_name });
  expect(reference).not.toHaveProperty('operation'); expect(reference).not.toHaveProperty('document');
  expect(m.wallet).toHaveBeenCalledTimes(2); expect(m.view).toHaveBeenCalledExactlyOnceWith(row, row, m.rx);
  expect(m.rx.verifyDeployment).toHaveBeenCalledOnce();
  for (const [sql, values] of m.query.mock.calls) {
    expect(sql).toContain('p.patient_wallet=$2'); expect(sql).toContain("p.state='confirmed'");
    expect(sql).toContain('b.patient_wallet_id=$5'); expect(sql).toContain('b.doctor_wallet_id=$5');
    expect(values).toEqual([RX_PRIVATE, patient, a.address, a.userId, a.walletId, id]);
  }
});

it.each(['Revoked', 'Blocked', 'Active'])('preserves independently verified RX status %s without reissuing', async status => {
  m.view.mockResolvedValue({ id, rxId: '17', appointmentId: 24, status, expired: true, expiresAt: 1,
    transactionHash: row.transaction_hash, doctorName: row.doctor_name, patientName: row.patient_name });
  expect(await clinicalPrescriptionReference(user, actor, patient, id)).toMatchObject({ status, expired: true });
  expect(m.rx).not.toHaveProperty('submit');
});

it.each([null, 'other-patient'])('rejects an RX outside the selected clinical patient context %s', async replacement => {
  if (replacement === null) m.query.mockResolvedValue([]); else row.patient_wallet = replacement;
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toBeInstanceOf(PrivateFlowError);
  expect(m.view).not.toHaveBeenCalled();
});

it('does not treat a clinical grant as RX access for a different doctor', async () => {
  row.doctor_user_id = 'did:privy:another-doctor'; row.doctor_wallet = 'another-doctor';
  await expect(clinicalPrescriptionReference(doctorUser, doctorActor, patient, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled(); expect(m.doctor).not.toHaveBeenCalled();
});

it.each(['prepared', 'submitted', 'failed'])('rejects nonconfirmed RX state %s', async state => {
  row.state = state;
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});

it.each(['patient_wallet_id', 'patient_requested_by'])('rejects changed original RX participant %s', async field => {
  row[field] = 'changed';
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});

it('rejects changed provider wallet before looking up a prescription', async () => {
  m.wallet.mockResolvedValue({ address: patient, walletId: 'changed' });
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ message: 'clinical_prescription_unavailable', status: 404 });
  expect(m.query).not.toHaveBeenCalled();
});

it('discards a verified reference if wallet identity changes during RPC work', async () => {
  m.wallet.mockResolvedValueOnce({ address: patient, walletId: actor.walletId }).mockResolvedValueOnce({ address: patient, walletId: 'changed' });
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ status: 404 });
});

it('discards a verified reference if participant binding or row contents change during RPC work', async () => {
  m.query.mockResolvedValueOnce([structuredClone(row)]).mockResolvedValueOnce([]);
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ status: 404 });
});

it.each(['deployment', 'record', 'provider'])('fails closed on %s failure without provider detail', async stage => {
  const error = new Error('credential sentinel');
  if (stage === 'deployment') m.rx.verifyDeployment.mockRejectedValue(error);
  if (stage === 'record') m.view.mockRejectedValue(error);
  if (stage === 'provider') m.wallet.mockRejectedValue(error);
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ message: 'clinical_prescription_verification_unavailable', status: 503 });
});

it('rejects an invalid private reference before any providers', async () => {
  await expect(clinicalPrescriptionReference(user, actor, patient, 'not-uuid')).rejects.toMatchObject({ status: 404 });
  expect(m.wallet).not.toHaveBeenCalled();
});

it('lists only the owner context, without exposing extra RX metadata', async () => {
  const result = await clinicalPrescriptionOptions(user, actor);
  expect(result.prescriptions).toHaveLength(1); expect(result.verifiedAt).toEqual(expect.any(String));
  expect(m.doctor).not.toHaveBeenCalled(); expect(m.clinical.history).toHaveBeenCalledTimes(2);
  const rxCalls = m.query.mock.calls.filter(([sql]) => sql.includes('FROM private_prescriptions'));
  expect(rxCalls).toHaveLength(2); expect(rxCalls[0][0]).toContain('LIMIT 51');
  expect(rxCalls[0][1]).toEqual([RX_PRIVATE, patient, patient, actor.userId, actor.walletId]);
});

it.each([[true, false], [false, true], [true, true]])('allows RX options with independent clinical read=%s append=%s', async (canRead, canAppend) => {
  m.doctor.mockResolvedValue({ historyId, canRead, canAppend, grantRevision: 3 });
  const result = await clinicalPrescriptionOptions(doctorUser, doctorActor, historyId);
  expect(result.prescriptions).toHaveLength(1);
  expect(m.doctor).toHaveBeenCalledTimes(2);
  expect(m.doctor).toHaveBeenCalledWith(doctorUser, doctorActor, historyId);
});

it('rejects a withdrawn clinical grant before RX lookup', async () => {
  m.doctor.mockRejectedValue(new PrivateFlowError('clinical_context_unavailable', 404));
  await expect(clinicalPrescriptionOptions(doctorUser, doctorActor, historyId)).rejects.toMatchObject({ status: 404 });
  expect(m.view).not.toHaveBeenCalled();
});

it('discards options after grant revision changes during RX verification', async () => {
  m.doctor.mockResolvedValueOnce({ historyId, canRead: true, canAppend: true, grantRevision: 3 })
    .mockResolvedValueOnce({ historyId, canRead: true, canAppend: true, grantRevision: 4 });
  await expect(clinicalPrescriptionOptions(doctorUser, doctorActor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('does not silently truncate candidate options into a partially verified list', async () => {
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? Array.from({ length: 51 }, () => structuredClone(row))
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  await expect(clinicalPrescriptionOptions(user, actor)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});

it('rejects a mismatched owner history and ambiguous own histories', async () => {
  m.query.mockResolvedValue([{ history_id: historyId, patient_wallet: 'other', wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  await expect(clinicalPrescriptionOptions(user, actor)).rejects.toMatchObject({ status: 409 });
  expect(m.view).not.toHaveBeenCalled();
});
it('normalizes a UUID before the scoped lookup', async () => {
  expect(await clinicalPrescriptionReference(user, actor, patient, id.toUpperCase())).toMatchObject({ id });
  expect(m.query.mock.calls[0][1].at(-1)).toBe(id);
});

it('rejects duplicate scoped RX rows instead of presenting an ambiguous link', async () => {
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? [structuredClone(row), structuredClone(row)]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  await expect(clinicalPrescriptionOptions(user, actor)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});

it.each([{ historyId, canRead: false, canAppend: false, grantRevision: 3 },
  { historyId: 'cd'.repeat(32), canRead: true, canAppend: true, grantRevision: 3 }])('rejects a context with no permission or another history', async context => {
  m.doctor.mockResolvedValue(context);
  await expect(clinicalPrescriptionOptions(doctorUser, doctorActor, historyId)).rejects.toMatchObject({ status: 404 });
  expect(m.view).not.toHaveBeenCalled();
});

it('does not return a partial list when one RX verification fails', async () => {
  const second = { ...row, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', rx_id: '18' };
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? [structuredClone(row), second]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  m.view.mockImplementation(async (value: any) => {
    if (value.id === second.id) throw new Error('integrity sentinel');
    return { id, rxId: '17', appointmentId: 24, status: 'Active', expired: false, expiresAt: 1_900_000_000,
      transactionHash: row.transaction_hash, doctorName: row.doctor_name, patientName: row.patient_name };
  });
  await expect(clinicalPrescriptionOptions(user, actor)).rejects.toMatchObject({ message: 'clinical_prescription_verification_unavailable', status: 503 });
});
it.each([null, 'not-a-transaction-hash'])('rejects a confirmed RX with no valid issuance receipt hash: %s', async hash => {
  row.transaction_hash = hash;
  await expect(clinicalPrescriptionReference(user, actor, patient, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});


it('checks only the selected existing RX while keeping its actor, patient and context checks', async () => {
  const unrelated = { ...row, id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', rx_id: '18' };
  m.query.mockImplementation(async (sql: string, values: unknown[]) => sql.includes('FROM private_prescriptions')
    ? values.length === 6 ? [structuredClone(row)] : [structuredClone(row), unrelated]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  m.view.mockImplementation(async (value: any) => {
    if (value.id !== id) throw new Error('unrelated archived RX');
    return { id, rxId: '17', appointmentId: 24, status: 'Active', expired: true, expiresAt: 1,
      transactionHash: row.transaction_hash, doctorName: row.doctor_name, patientName: row.patient_name };
  });
  const result = await clinicalPrescriptionOptions(doctorUser, doctorActor, historyId, id.toUpperCase());
  expect(result.prescriptions).toHaveLength(1); expect(result.prescriptions[0]).toMatchObject({ id, expired: true });
  expect(m.view).toHaveBeenCalledOnce(); expect(m.doctor).toHaveBeenCalledTimes(2);
  const calls = m.query.mock.calls.filter(([sql]) => sql.includes('FROM private_prescriptions'));
  expect(calls).toHaveLength(2);
  for (const [sql, values] of calls) { expect(sql).toContain('AND p.id=$6'); expect(sql).toContain('LIMIT 2');
    expect(values).toEqual([RX_PRIVATE, patient, doctor, doctorActor.userId, doctorActor.walletId, id]); }
});
it('rejects an invalid selected RX filter before contacting any provider', async () => {
  await expect(clinicalPrescriptionOptions(user, actor, undefined, 'bad')).rejects.toMatchObject({ status: 400 });
  expect(m.wallet).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
});
it('does not expose a selected RX belonging to another clinical patient', async () => {
  row.patient_wallet = 'other-patient';
  await expect(clinicalPrescriptionOptions(doctorUser, doctorActor, historyId, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});
it('rejects duplicate selected RX rows instead of accepting an ambiguous lookup', async () => {
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? [structuredClone(row), structuredClone(row)]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  await expect(clinicalPrescriptionOptions(user, actor, undefined, id)).rejects.toMatchObject({ status: 503 });
  expect(m.view).not.toHaveBeenCalled();
});
it('rechecks the selected RX row after chain work and drops a changed binding', async () => {
  let reads = 0;
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions')
    ? [reads++ ? { ...row, commitment: 'ff'.repeat(32) } : structuredClone(row)]
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  await expect(clinicalPrescriptionOptions(user, actor, undefined, id)).rejects.toMatchObject({ status: 404 });
});
it('returns no selected reference when the independently entitled RX is absent', async () => {
  m.query.mockImplementation(async (sql: string) => sql.includes('FROM private_prescriptions') ? []
    : [{ history_id: historyId, patient_wallet: patient, wallet_id: actor.walletId, owner_user_id: actor.userId }]);
  expect((await clinicalPrescriptionOptions(user, actor, undefined, id)).prescriptions).toEqual([]);
  expect(m.view).not.toHaveBeenCalled();
});
