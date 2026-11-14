import { beforeEach, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
const mocks = vi.hoisted(() => ({ query: vi.fn(), doctor: vi.fn(), chain: {} as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDb: () => ({ query: mocks.query }) }));
vi.mock('@/lib/doctor-authorizations', () => ({ resolveDoctor: mocks.doctor }));
vi.mock('@/lib/clinical/chain', () => ({ createClinicalWebChain: () => mocks.chain }));
import { clinicalDoctorContext } from '@/lib/clinical/doctor-context';

const doctorWallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 81)).publicKey();
const patientWallet = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 82)).publicKey();
const actor = { userId: 'did:privy:doctor_context', walletId: 'verified-wallet', address: doctorWallet };
const user = { userId: actor.userId, email: 'doctor@example.test' };
const historyId = 'ab'.repeat(32);
let grant: { canRead: boolean; canAppend: boolean; revision: number } | null;
let doctor: any;

beforeEach(() => {
  vi.resetAllMocks();
  grant = { canRead: true, canAppend: false, revision: 3 };
  doctor = { doctor: { id: 7, email: user.email, status: 'active' }, userId: actor.userId,
    walletId: actor.walletId, address: actor.address };
  mocks.doctor.mockImplementation(async () => structuredClone(doctor));
  mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM doctors') ? [{ id: 7 }]
    : [{ history_id: historyId, patient_wallet: patientWallet }]);
  mocks.chain = { doctorAuthorized: vi.fn(async () => true),
    history: vi.fn(async () => ({ id: historyId, patient: patientWallet })),
    grant: vi.fn(async () => grant && { ...grant }) };
});

it.each([[true, false], [false, true], [true, true]])('keeps read=%s and append=%s independent without returning clinical data', async (canRead, canAppend) => {
  grant = { canRead, canAppend, revision: 3 };
  const result = await clinicalDoctorContext(user, actor, historyId);
  expect(result).toEqual({ doctorId: 7, historyId, canRead, canAppend, grantRevision: 3, verifiedAt: expect.any(String) });
  expect(result).not.toHaveProperty('patient');
  expect(result).not.toHaveProperty('entries');
  expect(mocks.query.mock.calls.every(([sql]: [string]) => !/clinical_private_versions|SELECT \*/.test(sql))).toBe(true);
});

it.each([null, { canRead: false, canAppend: false, revision: 4 }])('rejects absent or withdrawn permission', async value => {
  grant = value;
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ message: 'clinical_context_unavailable', status: 404 });
});

it.each(['revoked', 'expired', 'paused'])('does not accept an active app profile when registry authorization is %s', async () => {
  mocks.chain.doctorAuthorized.mockResolvedValue(false);
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
  expect(mocks.chain.history).not.toHaveBeenCalled();
});

it.each(['userId', 'walletId', 'address'])('rejects a changed verified doctor %s', async field => {
  doctor[field] = 'another-identity';
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('rejects an inactive local profile independently of the registry', async () => {
  doctor.doctor.status = 'pending';
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('does not silently choose between ambiguous doctor profiles', async () => {
  mocks.query.mockResolvedValue([{ id: 7 }, { id: 8 }]);
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
  expect(mocks.doctor).not.toHaveBeenCalled();
});

it('returns the same denial for an unknown history', async () => {
  mocks.query.mockImplementation(async (sql: string) => sql.includes('FROM doctors') ? [{ id: 7 }] : []);
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ message: 'clinical_context_unavailable', status: 404 });
});

it('rejects a history bound to a different patient in SQL and Stellar', async () => {
  mocks.chain.history.mockResolvedValue({ id: historyId, patient: doctorWallet });
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('rejects a withdrawn permission during the first observation', async () => {
  mocks.chain.grant.mockResolvedValueOnce({ ...grant }).mockResolvedValue(null);
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('rejects a changed grant revision even when both capabilities remain granted', async () => {
  mocks.chain.grant.mockResolvedValueOnce({ ...grant }).mockResolvedValue({ ...grant, revision: 4 });
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('rechecks registry authorization after reading the grant', async () => {
  mocks.chain.doctorAuthorized.mockResolvedValueOnce(true).mockResolvedValue(false);
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('rechecks the current app identity after chain IO', async () => {
  mocks.doctor.mockResolvedValueOnce(structuredClone(doctor)).mockResolvedValue({ ...doctor, walletId: 'changed' });
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toMatchObject({ status: 404 });
});

it('does not turn RPC failure into a permission', async () => {
  mocks.chain.grant.mockRejectedValue(new Error('unavailable'));
  await expect(clinicalDoctorContext(user, actor, historyId)).rejects.toThrow();
});

it.each(['', 'patient@example.test', 'AB'.repeat(32), 'ab'.repeat(31)])('rejects invalid history locator %s before providers', async id => {
  await expect(clinicalDoctorContext(user, actor, id)).rejects.toMatchObject({ status: 400 });
  expect(mocks.query).not.toHaveBeenCalled();
});


it('reuses only the supplied request deployment reader while observing identity and grants freshly twice',async()=>{
 const chain={...mocks.chain,doctorAuthorized:vi.fn(async()=>true),history:vi.fn(async()=>({id:historyId,patient:patientWallet})),grant:vi.fn(async()=>({...grant!}))};
 const result=await clinicalDoctorContext(user,actor,historyId,chain as any);
 expect(result.grantRevision).toBe(3);expect(chain.doctorAuthorized).toHaveBeenCalledTimes(4);expect(chain.grant).toHaveBeenCalledTimes(2);expect(mocks.doctor).toHaveBeenCalledTimes(2);
 expect(mocks.chain.doctorAuthorized).not.toHaveBeenCalled();
});
it.each(['revoked','grant-changed','identity-changed'])('denies %s with a reused request deployment reader',async failure=>{
 const chain={...mocks.chain,doctorAuthorized:vi.fn(async()=>true),history:vi.fn(async()=>({id:historyId,patient:patientWallet})),grant:vi.fn(async()=>({...grant!}))};
 if(failure==='revoked')chain.doctorAuthorized.mockResolvedValueOnce(true).mockResolvedValue(false);
 if(failure==='grant-changed')chain.grant.mockResolvedValueOnce({...grant!}).mockResolvedValue({...grant!,revision:4});
 if(failure==='identity-changed')mocks.doctor.mockResolvedValueOnce(structuredClone(doctor)).mockResolvedValue({...doctor,walletId:'changed'});
 await expect(clinicalDoctorContext(user,actor,historyId,chain as any)).rejects.toMatchObject({status:404});
});
