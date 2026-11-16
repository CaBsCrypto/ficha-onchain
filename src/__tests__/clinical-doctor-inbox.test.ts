import { beforeEach, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { deriveClinicalHistoryId } from '@/lib/clinical/chain';
import { PRIVY_APP, PrivateFlowError } from '@/lib/private-config';
import { CLINICAL_ID } from '@/lib/clinical/config';
import type { DoctorClinicalNotification } from '@/types/clinical';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), actor: vi.fn(), query: vi.fn(), doctor: vi.fn(), approved: vi.fn(), configuration: vi.fn(),
  reader: vi.fn(), authorized: vi.fn(), grant: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: mocks.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: mocks.actor }));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: mocks.doctor }));
vi.mock('@/lib/doctor-onboarding', () => ({ isDoctorLocallyApproved: mocks.approved }));
vi.mock('@/lib/clinical/config', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/clinical/config')>(), assertClinicalEnvironment: mocks.configuration,
}));
vi.mock('@/lib/clinical/chain', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/clinical/chain')>(), createClinicalWebChain: mocks.reader,
}));
import { GET } from '@/app/api/doctor/clinical-inbox/route';
import { isPrivatePortalPath } from '@/lib/private-routes';

const doctorId = 19;
const actor = { userId: 'did:privy:synthetic_doctor', walletId: 'doctor-wallet',
  address: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 81)).publicKey() };
const user = { userId: actor.userId, email: 'doctor@example.test' };
const time = '2026-11-16T02:00:00.000Z';
const path = '/api/doctor/clinical-inbox';
const request = (query = '') => new Request('http://localhost' + path + query);
const patients = Array.from({ length: 16 }, (_, i) => {
  const patient_wallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, i + 1)).publicKey();
  return { history_id: deriveClinicalHistoryId(patient_wallet), patient_wallet };
});
type Observation = ReturnType<typeof observation>;
function observation(index: number, overrides: {
  observation?: 'record' | 'notification'; kind?: DoctorClinicalNotification['kind']; can_read?: boolean;
  can_append?: boolean; expected_revision?: string; patient_label?: string | null; receipt_hash?: string;
  active_appointment_ids?: number[] | null;
} = {}) {
  return {
    ...patients[index], id: '66666666-1234-4baa-8000-000000000001', observation: 'record', kind: null,
    patient_label: '  Ana  María  ', can_read: true, can_append: false, expected_revision: '0', confirmed_at: new Date(time),
    receipt_hash: String(index + 1).padStart(64, '0'), active_appointment_ids: [], ...overrides,
  };
}
function database(rows: Observation[]) {
  mocks.query.mockImplementation(async (statement: string) => {
    if (statement.includes('FROM doctors WHERE LOWER(email)')) return [{ id: doctorId }];
    if (statement.startsWith('WITH confirmed AS')) return rows;
    throw new Error('Unexpected test query');
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(user);
  mocks.actor.mockResolvedValue(actor);
  mocks.doctor.mockResolvedValue({ ...actor, doctor: { id: doctorId, email: user.email, status: 'active' } });
  mocks.approved.mockResolvedValue(true);
  mocks.authorized.mockResolvedValue(true);
  mocks.reader.mockImplementation(() => ({ doctorAuthorized: mocks.authorized, grant: mocks.grant }));
  database([]);
});

it('allowlists only the inbox itself and requires a strict session even when there are no records', async () => {
  expect(isPrivatePortalPath(path)).toBe(true);
  expect(isPrivatePortalPath(path + '/patients')).toBe(false);
  mocks.auth.mockResolvedValue(null);
  const req = request();

  const response = await GET(req);

  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.auth).toHaveBeenCalledExactlyOnceWith(req, { strict: true });
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});

it.each(['doctorId=19', 'historyId=' + patients[0].history_id, 'wallet=forged', 'role=doctor'])(
  'rejects caller-supplied selectors (%s)', async query => {
    expect((await GET(request('?' + query))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.reader).not.toHaveBeenCalled();
  },
);

it.each(['unrelated user', 'changed binding', 'inactive profile', 'local review missing', 'registry expired'])(
  'fails closed for %s before looking up the inbox', async condition => {
    if (condition === 'unrelated user') mocks.query.mockResolvedValue([]);
    if (condition === 'changed binding') mocks.doctor.mockResolvedValue({ ...actor, walletId: 'stale', doctor: { id: doctorId, email: user.email, status: 'active' } });
    if (condition === 'inactive profile') mocks.doctor.mockResolvedValue({ ...actor, doctor: { id: doctorId, email: user.email, status: 'pending' } });
    if (condition === 'local review missing') mocks.approved.mockResolvedValue(false);
    if (condition === 'registry expired') mocks.authorized.mockResolvedValue(false);

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'clinical_context_unavailable' });
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('WITH confirmed AS'))).toBe(false);
    expect(mocks.grant).not.toHaveBeenCalled();
  },
);

it('delivers only independent live rights, safe linked notifications, and redacted past or withdrawn events', async () => {
  const first = observation(0, { active_appointment_ids: [53, 28, 53, -5, 2_147_483_648] });
  const append = observation(1, { can_read: false, can_append: true, expected_revision: '2', patient_label: 'somebody@example.test',
    active_appointment_ids: [515] });
  const stale = observation(2, { active_appointment_ids: [91843] });
  database([
    first, append, stale,
    observation(0, { observation: 'notification', kind: 'access_granted', receipt_hash: 'a'.repeat(64) }),
    observation(1, { observation: 'notification', kind: 'access_changed', can_read: false, can_append: true, receipt_hash: 'b'.repeat(64) }),
    observation(2, { observation: 'notification', kind: 'access_granted', receipt_hash: 'c'.repeat(64) }),
    observation(0, { observation: 'notification', kind: 'access_withdrawn', can_read: false, receipt_hash: 'd'.repeat(64) }),
  ]);
  mocks.grant.mockImplementation(async (history: string) => ({
    canRead: history === first.history_id, canAppend: history === append.history_id, revision: history === first.history_id ? 1 : 3,
  }));
  const req = request();

  const response = await GET(req);
  expect(response.status).toBe(200);
  expect(response.headers.get('Vary')).toBe('Authorization');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(mocks.actor).toHaveBeenCalledTimes(2);
  expect(mocks.actor).toHaveBeenCalledWith(user, { existingOnly: true });
  expect(mocks.doctor).toHaveBeenCalledExactlyOnceWith(expect.anything(), doctorId, { existingOnly: true });
  expect(mocks.approved).toHaveBeenLastCalledWith(expect.anything(), doctorId, { ...actor, email: user.email });
  expect(mocks.configuration).toHaveBeenCalledWith(false);
  expect(mocks.authorized).toHaveBeenCalledTimes(2);
  expect(mocks.grant).toHaveBeenCalledTimes(3);
  expect(mocks.grant.mock.calls.every(([, wallet]) => wallet === actor.address)).toBe(true);
  const body = await response.json();
  expect(body.records).toEqual([
    { historyId: first.history_id, patientLabel: 'Ana María', canRead: true, canAppend: false, activeAppointmentIds: [28, 53] },
    { historyId: append.history_id, patientLabel: null, canRead: false, canAppend: true, activeAppointmentIds: [515] },
  ]);
  expect(body.notifications).toEqual([
    { id: expect.stringMatching(/^[a-f0-9]{64}$/), kind: 'access_granted', at: time, historyId: first.history_id, patientLabel: 'Ana María', canRead: true, canAppend: false },
    { id: expect.stringMatching(/^[a-f0-9]{64}$/), kind: 'access_changed', at: time, historyId: append.history_id, patientLabel: null, canRead: false, canAppend: true },
    { id: expect.stringMatching(/^[a-f0-9]{64}$/), kind: 'access_granted', at: time, historyId: null, patientLabel: null, canRead: false, canAppend: false },
    { id: expect.stringMatching(/^[a-f0-9]{64}$/), kind: 'access_withdrawn', at: time, historyId: null, patientLabel: null, canRead: false, canAppend: false },
  ]);
  expect(JSON.stringify(body)).not.toContain(stale.history_id);
  expect(JSON.stringify(body)).not.toContain(first.patient_wallet);
  expect(JSON.stringify(body)).not.toContain(first.id);
  expect(JSON.stringify(body)).not.toContain('a'.repeat(64));
  expect(body.records.some((row: { activeAppointmentIds: number[] }) => row.activeAppointmentIds.includes(91843))).toBe(false);
});

it('queries only exact confirmed recipient and owner bindings, ranking states by revision first', async () => {
  await GET(request());
  const [statement, bindings] = mocks.query.mock.calls.find(([sql]) => sql.startsWith('WITH confirmed AS'))!;

  expect(bindings).toEqual([doctorId, actor.address, actor.userId, actor.walletId, PRIVY_APP, CLINICAL_ID, 24]);
  expect(statement).toContain("o.state='confirmed'");
  expect(statement).toContain("o.action='set_permissions' AND o.method='set_permissions'");
  expect(statement).toContain("o.expected->'doctorId'=to_jsonb($1::integer) AND o.expected->>'doctor'=$2");
  expect(statement).toMatch(/h\.owner_user_id=o\.actor_user_id AND h\.wallet_id=o\.wallet_id/);
  expect(statement).toMatch(/PARTITION BY history_id ORDER BY expected_revision DESC,confirmed_at DESC/);
  expect(statement).toContain('r.current_rank=1 AND r.peers=1');
  expect(statement).toContain('prior_revision=expected_revision-1 AND prior_peers=1 AND NOT prior_access');
  expect(statement).toContain('a.doctor_user_id=$3 AND a.doctor_wallet_id=$4');
  expect(statement).toContain('a.patient_user_id=r.owner_user_id AND a.patient_wallet_id=r.wallet_id AND a.patient_wallet=r.patient_wallet');
  expect(statement).toContain("a.status='in_progress' AND a.completed_at IS NULL");
  expect(statement).toContain('a.attendance_user_id=a.patient_user_id');
  expect(statement).toContain('a.started_by=a.doctor_user_id AND a.started_at>=a.attendance_at AND a.started_at<=NOW()');
  expect(statement).toContain("a.date=(a.started_at AT TIME ZONE 'America/Santiago')::date");
});

it('uses bounded independent chain readers without dropping later available records', async () => {
  database(patients.map((_, index) => observation(index)));
  let running = 0, peak = 0;
  mocks.grant.mockImplementation(async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise(resolve => setImmediate(resolve));
    running--;
    return { canRead: true, canAppend: false, revision: 1 };
  });

  const response = await GET(request());

  expect((await response.json()).records).toHaveLength(patients.length);
  expect(peak).toBe(4);
  expect(mocks.reader).toHaveBeenCalledTimes(4);
});

it('stops scheduling further grant checks when the caller aborts an active inbox request', async () => {
  database(patients.map((_, index) => observation(index)));
  let running = 0;
  let releaseReaders: () => void;
  let markStarted: () => void;
  const inFlight = new Promise<void>(resolve => { releaseReaders = resolve; });
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  mocks.grant.mockImplementation(async () => {
    if (++running === 4) markStarted();
    await inFlight;
    return { canRead: true, canAppend: false, revision: 1 };
  });
  const abort = new AbortController();

  const response = GET(new Request('http://localhost' + path, { signal: abort.signal }));
  await started;
  abort.abort();
  releaseReaders!();

  expect((await response).status).toBe(503);
  expect(mocks.grant).toHaveBeenCalledTimes(4);
  expect(mocks.authorized).toHaveBeenCalledTimes(1);
});

it('treats an unavailable live observation as a provider failure instead of an empty list', async () => {
  database([observation(0)]);
  mocks.grant.mockRejectedValue(new PrivateFlowError('clinical_chain_unavailable', 503));

  const response = await GET(request());

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'clinical_chain_unavailable' });
});

it.each(['lost registry', 'lost local approval', 'changed session', 'changed email'])('discards inbox data after %s', async condition => {
  database([observation(0)]);
  mocks.grant.mockResolvedValue({ canRead: true, canAppend: false, revision: 1 });
  if (condition === 'lost registry') mocks.authorized.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  if (condition === 'lost local approval') mocks.approved.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  if (condition === 'changed session') mocks.auth.mockResolvedValueOnce(user).mockResolvedValueOnce({ userId: 'did:privy:other', email: 'other@example.test' });
  if (condition === 'changed email') mocks.auth.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, email: 'other@example.test' });

  const response = await GET(request());

  expect(response.status).toBe(condition === 'changed session' ? 401 : condition === 'changed email' ? 403 : 404);
  expect(await response.text()).not.toContain(patients[0].history_id);
});
