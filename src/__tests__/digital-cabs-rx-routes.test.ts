import { beforeEach, expect, it, vi } from 'vitest';
import { POST as create, PATCH as change } from '@/app/api/appointments/route';
import { POST as book, DELETE as cancelBooking } from '@/app/api/prescription-bookings/route';
import { POST as prepareDocument } from '@/app/api/private-prescriptions/route';
import { POST as prepareOperation } from '@/app/api/private-operations/route';
import { POST as confirmOperation } from '@/app/api/private-operations/[id]/confirm/route';
import { GET as slots } from '@/app/api/doctor/slots/route';
import { assertPrivateRxContext } from '@/lib/digital-cabs-rx';
import { DIGITAL_CABS_RX_DOCUMENT, PRIVATE_RX_CONTRACT_ID } from '../../scripts/lib/digital-cabs-rx-scope.mjs';

const DIGITAL_CABS_RX_SLOT = { date: '2026-11-13', timeSlot: '09:00', type: 'Presencial' } as const;
const m = vi.hoisted(() => ({ scope: null as any, failure: '', user: vi.fn(), sql: vi.fn(), query: vi.fn(), connect: vi.fn(),
  connectionQuery: vi.fn(), release: vi.fn(), wallet: vi.fn(), doctor: vi.fn(), registry: vi.fn(),
  document: vi.fn(), operation: vi.fn(), confirm: vi.fn(), legacyGate: vi.fn() }));
vi.mock('../../scripts/lib/digital-cabs-rx-scope.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../../scripts/lib/digital-cabs-rx-scope.mjs')>(),
  privateRxScopeConfigured: () => !!m.scope || !!m.failure,
  loadPrivateRxScope: () => { if (m.failure) throw Error(m.failure); return m.scope; },
  assertPrivateRxScopeOpen: (scope: any) => { if (m.failure) throw Error(m.failure); if (!m.scope || scope !== m.scope) throw Error('private_rx_scope_rejected'); return scope; },
}));
vi.mock('@/lib/private-config', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/private-config')>(),
  assertPrivateEnvironment: () => {}, assertPrivateWrites: () => m.legacyGate() }));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.user, unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }) }));
vi.mock('@/lib/db', () => ({ getDb: () => Object.assign(m.sql, { query: m.query }), getDbConnection: m.connect,
  sqlForConnection: () => Object.assign(m.sql, { query: m.query }) }));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: m.wallet, resolveDoctor: m.doctor, readPrivateDoctor: m.registry,
  DoctorAuthorizationError: class extends Error {} }));
vi.mock('@/lib/doctor-onboarding', () => ({ isDoctorLocallyApproved: async () => true }));
vi.mock('@/lib/private-prescriptions', () => ({ listPrivatePrescriptions: vi.fn(), preparePrescription: m.document }));
vi.mock('@/lib/private-operations', () => ({ preparePrivateOperation: m.operation, confirmPrivateOperation: m.confirm }));

const patient = { userId: 'did:privy:syntheticpatient', email: 'patient@example.test', walletId: 'test-patient', address: 'G' + 'A'.repeat(55) };
const doctor = { userId: 'did:privy:syntheticdoctor', email: 'doctor@example.test', walletId: 'test-doctor', address: 'G' + 'B'.repeat(55) };
const consentId = '7ac9e780-1d44-4abc-a144-8b699431a1c0', mintId = 'b1339eaa-e6dc-4a16-b22a-6936eebbad07';
const prescriptionId = '807b985b-6f0a-4820-8488-f872e1ecfa83';
const appointmentScope = () => ({ phase: 'appointment', doctorId: 9, slot: DIGITAL_CABS_RX_SLOT, patient, doctor });
const issuanceScope = () => ({ ...appointmentScope(), phase: 'issuance', contractId: PRIVATE_RX_CONTRACT_ID, network: 'testnet',
  appointmentId: 14, issuanceId: 'a'.repeat(64), bookingValidUntil: 1_900_000_000, prescriptionId, document: DIGITAL_CABS_RX_DOCUMENT,
  steps: { attest: { requestId: '82430b50-aea4-48ae-8f0d-98df073da627' }, consent: { requestId: consentId }, mint: { requestId: mintId } } });
const row = (patch: Record<string, unknown> = {}) => ({ id: 14, doctor_id: 9, date: DIGITAL_CABS_RX_SLOT.date, time_slot: DIGITAL_CABS_RX_SLOT.timeSlot,
  type: DIGITAL_CABS_RX_SLOT.type, status: 'in_progress', patient_email: patient.email, patient_user_id: patient.userId,
  patient_wallet_id: patient.walletId, patient_wallet: patient.address, doctor_email: doctor.email, doctor_user_id: doctor.userId,
  doctor_wallet_id: doctor.walletId, doctor_wallet: doctor.address, attendance_at: 'synthetic', attendance_user_id: patient.userId,
  started_at: 'synthetic', started_by: doctor.userId, ...patch });
const booking = (patch: Record<string, unknown> = {}) => ({ appointment_id: 14, issuance_id: 'a'.repeat(64), valid_until: 1_900_000_000,
  network: 'testnet', contract_id: PRIVATE_RX_CONTRACT_ID, patient_requested_by: patient.userId, patient_wallet_id: patient.walletId,
  patient_wallet: patient.address, doctor_user_id: doctor.userId, doctor_wallet_id: doctor.walletId, doctor_wallet: doctor.address, ...patch });
const request = (path: string, body: unknown, method = 'POST', origin = 'http://localhost') =>
  new Request('http://localhost/api/' + path, { method, headers: { host: 'localhost', origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks(); m.scope = appointmentScope(); m.failure = '';
  m.user.mockResolvedValue(patient); m.connect.mockResolvedValue({ query: m.connectionQuery, release: m.release });
  m.connectionQuery.mockResolvedValue({ rows: [] }); m.query.mockResolvedValue([]); m.sql.mockResolvedValue([]);
  m.wallet.mockImplementation(async (_sql, userId) => userId === patient.userId ? patient : doctor);
  m.doctor.mockResolvedValue({ ...doctor, doctor: { id: 9, email: doctor.email, status: 'active' } });
  m.registry.mockResolvedValue({ authorized: true });
  m.document.mockResolvedValue({ prescription: { id: prescriptionId } }); m.operation.mockResolvedValue({ operation: { id: consentId } });
  m.confirm.mockResolvedValue({ operation: { id: consentId } });
});

it('rejects a different slot, the wrong actor and a foreign origin before opening a database transaction', async () => {
  const input = { doctorId: 9, ...DIGITAL_CABS_RX_SLOT };
  expect((await create(request('appointments', { ...input, timeSlot: '09:30' }))).status).toBe(403);
  m.user.mockResolvedValueOnce(doctor);
  expect((await create(request('appointments', input))).status).toBe(403);
  expect((await create(request('appointments', input, 'POST', 'https://example.test'))).status).toBe(403);
  expect((await create(new Request('http://example.test/api/appointments', { method: 'POST',
    headers: { host: 'example.test', origin: 'http://example.test', 'Content-Type': 'application/json' }, body: JSON.stringify(input) }))).status).toBe(403);
  expect(m.connect).not.toHaveBeenCalled();
  expect(m.user.mock.calls.every(([, options]) => options?.strict === true)).toBe(true);
});

it('reuses the already locked exact appointment without another INSERT, and rejects a replaced participant', async () => {
  const input = { doctorId: 9, ...DIGITAL_CABS_RX_SLOT };
  m.sql.mockResolvedValueOnce([{ id: 9 }]);
  m.query.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);
  const result = await create(request('appointments', input));
  expect(result.status).toBe(201); expect((await result.json()).appointment.id).toBe(14);
  expect(m.sql.mock.calls.map(([strings]) => strings.join(' ')).join('\n')).not.toContain('INSERT INTO appointments');
  expect(m.connectionQuery).toHaveBeenCalledWith('COMMIT');
  m.sql.mockResolvedValueOnce([{ id: 9 }]);
  m.query.mockResolvedValueOnce([row({ patient_wallet_id: 'replaced-wallet' })]);
  expect((await create(request('appointments', input))).status).toBe(403);
  expect(m.connectionQuery).toHaveBeenLastCalledWith('ROLLBACK');
});

it('blocks expired and issuance-phase direct enqueues and never allows scoped cancellation', async () => {
  const input = { appointmentId: 14, confirmRequest: true };
  m.failure = 'private_rx_scope_expired';
  const expired = await book(request('prescription-bookings', input));
  expect(expired.status).toBe(409); expect(await expired.json()).toEqual({ error: 'private_rx_scope_expired' });
  m.failure = ''; m.scope = issuanceScope();
  expect((await book(request('prescription-bookings', input))).status).toBe(403);
  m.scope = appointmentScope();
  expect((await cancelBooking(request('prescription-bookings', input, 'DELETE'))).status).toBe(403);
  expect(m.connect).not.toHaveBeenCalled();
});

it('rejects another protected appointment under lock before checking wallets or enqueueing', async () => {
  m.query.mockResolvedValue([row({ doctor_wallet_id: 'foreign-wallet' })]);
  const result = await book(request('prescription-bookings', { appointmentId: 14, confirmRequest: true }));
  expect(result.status).toBe(403); expect(m.query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(m.wallet).not.toHaveBeenCalled(); expect(m.sql).not.toHaveBeenCalled(); expect(m.connectionQuery).toHaveBeenLastCalledWith('ROLLBACK');
});

it('lets the exact doctor start an attended appointment and creates only its native booking queue record', async () => {
  m.user.mockResolvedValue(doctor);
  m.query.mockResolvedValueOnce([row({ status: 'scheduled', started_at: null, started_by: null })]).mockResolvedValueOnce([row()])
    .mockResolvedValueOnce([row({ booking: booking({ state: 'prepared' }) })]);
  m.sql.mockResolvedValueOnce([row()]).mockResolvedValueOnce([booking({ state: 'prepared' })]);
  const result = await change(request('appointments', { id: 14, action: 'start' }, 'PATCH'));
  expect(result.status).toBe(200); expect((await result.json()).bookingPending).toBe(true);
  expect(m.sql.mock.calls.filter(([query]) => query.join(' ').includes('INSERT INTO prescription_booking_requests'))).toHaveLength(1);
  expect(m.connectionQuery).toHaveBeenLastCalledWith('COMMIT'); expect(m.legacyGate).not.toHaveBeenCalled();
});

it('the appointment phase cannot prepare a prescription, consent or confirm any signature', async () => {
  const signature = '1'.repeat(128);
  expect((await prepareDocument(request('private-prescriptions', { appointmentId: 14, document: DIGITAL_CABS_RX_DOCUMENT }))).status).toBe(403);
  expect((await prepareOperation(request('private-operations', { action: 'consent', appointmentId: 14, confirmed: true }))).status).toBe(403);
  expect((await confirmOperation(request(`private-operations/${consentId}/confirm`, { signature }), { params: Promise.resolve({ id: consentId }) })).status).toBe(403);
  expect(m.document).not.toHaveBeenCalled(); expect(m.operation).not.toHaveBeenCalled(); expect(m.confirm).not.toHaveBeenCalled();
});

it('requires the exact synthetic document and issuing doctor before calling preparation', async () => {
  m.scope = issuanceScope(); const body = { appointmentId: 14, document: DIGITAL_CABS_RX_DOCUMENT };
  expect((await prepareDocument(request('private-prescriptions', body))).status).toBe(403);
  m.user.mockResolvedValue(doctor);
  expect((await prepareDocument(request('private-prescriptions', { ...body, appointmentId: 15 }))).status).toBe(403);
  expect((await prepareDocument(request('private-prescriptions', { ...body, document: { ...body.document, dosage: 'different' } }))).status).toBe(403);
  expect((await prepareDocument(request('private-prescriptions', body))).status).toBe(200);
  expect(m.document).toHaveBeenCalledExactlyOnceWith(doctor, 14, body.document, m.scope);
});

it('binds consent, mint and confirmation to exact resources and distinct verified roles', async () => {
  m.scope = issuanceScope(); const signature = '1'.repeat(128);
  const consent = { action: 'consent', appointmentId: 14, confirmed: true };
  const mint = { action: 'mint', prescriptionId, confirmed: true };
  expect((await prepareOperation(request('private-operations', { ...consent, appointmentId: 15 }))).status).toBe(403);
  expect((await prepareOperation(request('private-operations', { ...consent, action: 'withdraw_consent' }))).status).toBe(403);
  expect((await prepareOperation(request('private-operations', mint))).status).toBe(403);
  expect((await confirmOperation(request(`private-operations/${mintId}/confirm`, { signature }), { params: Promise.resolve({ id: mintId }) })).status).toBe(403);
  expect((await prepareOperation(request('private-operations', consent))).status).toBe(200);
  expect((await confirmOperation(request(`private-operations/${consentId}/confirm`, { signature }), { params: Promise.resolve({ id: consentId }) })).status).toBe(200);
  m.user.mockResolvedValue(doctor);
  expect((await prepareOperation(request('private-operations', mint))).status).toBe(200);
  expect(m.operation.mock.calls).toEqual([[patient, 'consent', { appointmentId: 14 }, m.scope], [doctor, 'mint', { prescriptionId }, m.scope]]);
  expect(m.confirm).toHaveBeenCalledExactlyOnceWith(patient, consentId, signature, m.scope);
});

it('rechecks the exact SQL booking nonce, validity, patient binding and prescription under the service lock', () => {
  const scope = issuanceScope() as any, issued = { id: prescriptionId, appointment_id: 14, issuance_id: 'a'.repeat(64), network: 'testnet',
    contract_id: PRIVATE_RX_CONTRACT_ID, patient_wallet: patient.address, doctor_wallet: doctor.address };
  expect(() => assertPrivateRxContext(scope, row(), booking(), issued)).not.toThrow();
  for (const bad of [{ issuance_id: 'b'.repeat(64) }, { valid_until: 1_900_000_001 }, { patient_wallet_id: 'other' }, { network: 'public' }]) {
    expect(() => assertPrivateRxContext(scope, row(), booking(bad), issued)).toThrow('private_rx_scope_rejected');
  }
  expect(() => assertPrivateRxContext(scope, row(), booking(), { ...issued, id: consentId })).toThrow('private_rx_scope_rejected');
});

it('offers the single extra slot only to the exact patient on its reviewed date', async () => {
  m.scope = { ...appointmentScope(), slot: { ...DIGITAL_CABS_RX_SLOT, oneTime: true } };
  m.query.mockImplementation(async statement => {
    if (statement.includes('WITH free')) return [{ date: '2026-11-14', time: '09:00' }];
    if (statement.includes('search_until')) return [{ search_until: '2027-02-12' }];
    if (statement.includes('privy_stellar_wallet_bindings')) return [{}];
    if (statement.includes('WITH wanted')) return [{ available: true }];
    throw Error('unexpected_schedule_query');
  });
  const requestSlots = () => new Request('http://localhost/api/doctor/slots?doctorId=9&date=' + DIGITAL_CABS_RX_SLOT.date + '&nextAvailable=true',
    { headers: { host: 'localhost' } });
  expect(await (await slots(requestSlots())).json()).toMatchObject({ data: { date: DIGITAL_CABS_RX_SLOT.date, slots: [{ time: DIGITAL_CABS_RX_SLOT.timeSlot }] } });
  expect(m.query.mock.calls.some(([statement, params]) => statement.includes('WITH wanted') && params[1] === DIGITAL_CABS_RX_SLOT.date)).toBe(true);
  m.query.mockClear(); m.user.mockResolvedValue({ ...patient, userId: 'did:privy:differentuser' });
  expect(await (await slots(requestSlots())).json()).toMatchObject({ data: { date: '2026-11-14' } });
  expect(m.query.mock.calls.some(([statement]) => statement.includes('WITH wanted'))).toBe(false);
  expect(m.connect).not.toHaveBeenCalled();
});

it.each([true, false])('rechecks the one-time slot under the doctor lock before any INSERT (%s)', async available => {
  m.scope = { ...appointmentScope(), slot: { ...DIGITAL_CABS_RX_SLOT, oneTime: true } };
  m.sql.mockResolvedValueOnce([{ id: 9 }]).mockResolvedValueOnce([{ id: 14 }]);
  m.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ available }]).mockResolvedValueOnce([row({ status: 'scheduled' })]);
  const result = await create(request('appointments', { doctorId: 9, ...DIGITAL_CABS_RX_SLOT }));
  expect(result.status).toBe(available ? 201 : 409);
  expect(m.sql.mock.calls[0][0].join(' ')).toContain('FOR UPDATE');
  const queryIndex = m.query.mock.calls.findIndex(([statement]) => statement.includes('WITH wanted'));
  expect(queryIndex).toBeGreaterThanOrEqual(0);
  expect(m.sql.mock.invocationCallOrder[0]).toBeLessThan(m.query.mock.invocationCallOrder[queryIndex]);
  expect(m.sql.mock.calls.filter(([statement]) => statement.join(' ').includes('INSERT INTO appointments'))).toHaveLength(available ? 1 : 0);
  expect(m.connectionQuery).toHaveBeenLastCalledWith(available ? 'COMMIT' : 'ROLLBACK');
});
