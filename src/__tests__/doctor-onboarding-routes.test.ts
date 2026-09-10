import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDb: vi.fn(),
  view: vi.fn(),
  accept: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  review: vi.fn(),
}));

vi.mock('@/lib/auth/privy-auth', () => ({
  requireUser: mocks.requireUser,
  unauthorized: () => Response.json({ error: 'unauthorized' }, { status: 401 }),
  forbidden: () => Response.json({ error: 'forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/doctor-onboarding', () => ({
  doctorOnboardingView: mocks.view,
  acceptDoctorInvitation: mocks.accept,
  saveDoctorApplication: mocks.save,
  listDoctorOnboarding: mocks.list,
  reviewDoctorOnboarding: mocks.review,
}));

import { GET as doctorGET, POST as doctorPOST } from '@/app/api/doctor/onboarding/route';
import { GET as adminGET, POST as adminPOST } from '@/app/api/admin/doctor-onboarding/route';
import { PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE, PRIVATE_ADMIN } from '@/lib/private-config';

const admin = { userId: 'did:privy:admin', email: 'admin@example.test' };
const doctor = { userId: 'did:privy:doctor', email: 'doctor@example.test' };
const db = { query: vi.fn() };

function request(path: string, method = 'GET', body?: unknown, origin = 'http://localhost:3002') {
  return new Request(`http://localhost:3002${path}`, {
    method,
    headers: { host: 'localhost:3002', origin, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAILS', admin.email);
  vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'true');
  vi.stubEnv('TRUSTLEAF_ENV', 'local');
  vi.stubEnv('TRUSTLEAF_DB_HOST', 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech');
  vi.stubEnv('DATABASE_URL', 'postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test');
  vi.stubEnv('PRIVY_APP_ID', PRIVY_APP);
  vi.stubEnv('NEXT_PUBLIC_PRIVY_APP_ID', PRIVY_APP);
  vi.stubEnv('DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID', REGISTRY_PRIVATE);
  vi.stubEnv('PRESCRIPTION_PRIVATE_CONTRACT_ID', RX_PRIVATE);
  vi.stubEnv('DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY', PRIVATE_ADMIN);
  vi.stubEnv('BOOKING_AUTHORITY_PUBLIC_KEY', PRIVATE_ADMIN);
  mocks.getDb.mockReturnValue(db);
  mocks.requireUser.mockResolvedValue(doctor);
  mocks.view.mockResolvedValue({ wallet: 'GDOCTOR', onboarding: null });
  mocks.accept.mockResolvedValue({ wallet: 'GDOCTOR', onboarding: { state: 'draft' } });
  mocks.save.mockResolvedValue({ wallet: 'GDOCTOR', onboarding: { state: 'submitted' } });
  mocks.list.mockResolvedValue([]);
  mocks.review.mockResolvedValue({ id: '10000000-0000-4000-8000-000000000000', state: 'changes_requested' });
});
afterEach(() => vi.unstubAllEnvs());

describe('doctor onboarding API boundary', () => {
  it('requires a Privy session for reads and writes', async () => {
    mocks.requireUser.mockResolvedValue(null);
    expect((await doctorGET(request('/api/doctor/onboarding'))).status).toBe(401);
    expect((await doctorPOST(request('/api/doctor/onboarding', 'POST', { action: 'accept_invitation' }))).status).toBe(401);
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('accepts an invitation using only the authenticated identity', async () => {
    const response = await doctorPOST(request('/api/doctor/onboarding', 'POST', { action: 'accept_invitation' }));
    expect(response.status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith(db, doctor);
  });

  it.each(['wallet', 'walletId', 'userId', 'email', 'contractId', 'xdr', 'hash'])('rejects caller-selected %s', async key => {
    const response = await doctorPOST(request('/api/doctor/onboarding', 'POST', { action: 'submit', name: 'Test', specialty: 'Test', licenseNum: 'TEST', rut: '11-1', [key]: 'forged' }));
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rejects writes from a foreign origin', async () => {
    const response = await doctorPOST(request('/api/doctor/onboarding', 'POST', { action: 'accept_invitation' }, 'https://other.example'));
    expect(response.status).toBe(403);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});

describe('admin onboarding API boundary', () => {
  it('rejects doctors and anonymous users', async () => {
    expect((await adminGET(request('/api/admin/doctor-onboarding'))).status).toBe(403);
    mocks.requireUser.mockResolvedValue(null);
    expect((await adminGET(request('/api/admin/doctor-onboarding'))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('lists the review queue for the allowlisted administrator', async () => {
    mocks.requireUser.mockResolvedValue(admin);
    const response = await adminGET(request('/api/admin/doctor-onboarding'));
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(db);
  });

  it.each(['wallet', 'walletId', 'email', 'doctorId', 'contractId', 'xdr'])('rejects admin-supplied %s', async key => {
    mocks.requireUser.mockResolvedValue(admin);
    const response = await adminPOST(request('/api/admin/doctor-onboarding', 'POST', {
      id: '10000000-0000-4000-8000-000000000000', action: 'reject', note: 'Datos de prueba incompletos', [key]: 'forged',
    }));
    expect(response.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it('requires same-origin review and passes only the review decision', async () => {
    mocks.requireUser.mockResolvedValue(admin);
    const payload = { id: '10000000-0000-4000-8000-000000000000', action: 'request_changes', note: '  Corregir registro  ' };
    expect((await adminPOST(request('/api/admin/doctor-onboarding', 'POST', payload, 'https://other.example'))).status).toBe(403);
    const response = await adminPOST(request('/api/admin/doctor-onboarding', 'POST', payload));
    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(db, admin, payload.id, payload.action, 'Corregir registro');
  });
});
