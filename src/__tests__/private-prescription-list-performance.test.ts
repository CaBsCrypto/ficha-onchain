import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listPrivatePrescriptions } from '@/lib/private-prescriptions';

const m = vi.hoisted(() => ({ connection: vi.fn(), wallet: vi.fn(), query: vi.fn(), release: vi.fn(), verify: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}), getDbConnection: m.connection, sqlForConnection: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: m.wallet, readPrivateDoctor: vi.fn() }));
vi.mock('@/lib/private-config', async () => ({ ...await vi.importActual<object>('@/lib/private-config'), assertPrivateEnvironment: vi.fn() }));
vi.mock('@/lib/stellar/private-chain', () => ({ createPrivateChain: () => ({ verifyDeployment: m.verify, prescription: m.read }) }));
const actor = { userId: 'patient-id', email: 'patient@example.test' };
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, rx_id: String(i + 1), state: 'confirmed', patient_wallet: 'patient', doctor_wallet: 'doctor', commitment: 'hash', expires_at: 2000000000, doctor_name: 'Synthetic doctor' }));
const rx = (id: string) => ({ id, patient: 'patient', doctor: 'doctor', commitment: 'hash', expiresAt: 2000000000, schemaVersion: 1, status: 'Active' });
beforeEach(() => {
  vi.resetAllMocks();
  m.wallet.mockResolvedValue({ address: 'patient' });
  m.connection.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockResolvedValue({ rows: rows(1) });
  m.verify.mockResolvedValue(undefined);
  m.read.mockImplementation(async (id: string) => rx(id));
});
describe('verified prescription list scheduling', () => {
  it('releases the database before chain verification', async () => {
    m.verify.mockImplementation(async () => { expect(m.release).toHaveBeenCalledOnce(); });
    await listPrivatePrescriptions(actor, 'patient');
    expect(m.verify).toHaveBeenCalledOnce();
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('reads at most four concurrently and keeps order despite out-of-order completion', async () => {
    m.query.mockResolvedValue({ rows: rows(9) });
    const pending = new Map<string, () => void>();
    let active = 0, peak = 0;
    m.read.mockImplementation((id: string) => new Promise(resolve => {
      active++; peak = Math.max(peak, active);
      pending.set(id, () => { active--; pending.delete(id); resolve(rx(id)); });
    }));
    const result = listPrivatePrescriptions(actor, 'patient');
    await vi.waitFor(() => expect(pending.size).toBe(4));
    while (m.read.mock.calls.length < 9 || pending.size) {
      for (const complete of [...pending.values()].reverse()) complete();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect((await result).prescriptions.map(p => p.rxId)).toEqual(rows(9).map(r => r.rx_id));
    expect(peak).toBe(4);
  });
  it('releases on database failure and never reads the chain', async () => {
    m.query.mockRejectedValue(new Error('db unavailable'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('db unavailable');
    expect(m.release).toHaveBeenCalledOnce(); expect(m.read).not.toHaveBeenCalled();
  });
  it('rejects an integrity mismatch instead of returning a partial list', async () => {
    m.query.mockResolvedValue({ rows: rows(3) });
    m.read.mockImplementation(async (id: string) => ({ ...rx(id), patient: id === '2' ? 'stranger' : 'patient' }));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('prescription_integrity_unavailable');
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('keeps wallet rejection before opening a database connection', async () => {
    m.wallet.mockRejectedValue(new Error('forbidden'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('forbidden');
    expect(m.connection).not.toHaveBeenCalled();
  });
  it('verifies deployment for an empty list without reading prescriptions', async () => {
    m.query.mockResolvedValue({ rows: [] });
    expect(await listPrivatePrescriptions(actor, 'patient')).toEqual({ prescriptions: [] });
    expect(m.verify).toHaveBeenCalledOnce(); expect(m.read).not.toHaveBeenCalled();
  });
  it('fails closed when deployment verification fails', async () => {
    m.verify.mockRejectedValue(new Error('deployment unavailable'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('deployment unavailable');
    expect(m.release).toHaveBeenCalledOnce(); expect(m.read).not.toHaveBeenCalled();
  });
  it('stops scheduling further reads after an RPC failure', async () => {
    m.query.mockResolvedValue({ rows: rows(9) });
    m.read.mockRejectedValue(new Error('rpc unavailable'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('rpc unavailable');
    expect(m.read).toHaveBeenCalledTimes(4);
    expect(m.release).toHaveBeenCalledOnce();
  });
  it('preserves chain states, expiration and prepared documents', async () => {
    const records = rows(5);
    records[3].expires_at = 1;
    records[4].state = 'prepared';
    m.query.mockResolvedValue({ rows: records });
    m.read.mockImplementation(async (id: string) => ({ ...rx(id),
      status: ['Registered', 'Active', 'Revoked', 'Active'][Number(id) - 1],
      expiresAt: id === '4' ? 1 : 2000000000,
    }));
    const result = await listPrivatePrescriptions(actor, 'doctor');
    expect(result.prescriptions.map(p => [p.status, p.expired])).toEqual([
      ['Registered', false], ['Active', false], ['Revoked', false], ['Active', true], ['Pending', false],
    ]);
    expect(m.read).toHaveBeenCalledTimes(4);
  });
});
