import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Account, Address, Keypair, Networks, SorobanDataBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import { listPrivatePrescriptions } from '@/lib/private-prescriptions';

const adapters = vi.hoisted(() => ({ connection: vi.fn(), wallet: vi.fn(), chain: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: vi.fn(() => ({})), getDbConnection: adapters.connection, sqlForConnection: vi.fn() }));
vi.mock('@/lib/doctor-authorizations', () => ({ verifiedWallet: adapters.wallet, readPrivateDoctor: vi.fn() }));
vi.mock('@/lib/stellar/private-chain', async () => ({
  ...await vi.importActual<typeof import('@/lib/stellar/private-chain')>('@/lib/stellar/private-chain'),
  createPrivateChain: adapters.chain,
}));
const owner = Keypair.random().publicKey(), doctor = Keypair.random().publicKey();
const actor = { userId: 'did:privy:synthetic-owner', email: 'synthetic@example.test' };
const expiresAt = 1_900_000_000;
const row = (id: string) => ({ id: `synthetic-${id}`, rx_id: id, state: 'confirmed', patient_wallet: owner, doctor_wallet: doctor,
  commitment: 'ab'.repeat(32), expires_at: expiresAt, appointment_id: Number(id), doctor_name: 'Synthetic doctor', patient_name: 'Synthetic patient' });
const record = (id: string) => ({ id, patient: owner, doctor, commitment: 'ab'.repeat(32), expiresAt, schemaVersion: 1, status: 'Active' });

beforeEach(() => {
  vi.clearAllMocks();
  const host = 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech';
  const env = { TRUSTLEAF_ENV: 'local', TRUSTLEAF_DB_HOST: host, DATABASE_URL: `postgresql://test:test@${host}/test`,
    TRUSTLEAF_DATABASE_URL: `postgresql://test:test@${host}/test`, PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN,
    NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org', VERCEL_ENV: '' };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('Network is forbidden in isolated tests')));
  adapters.wallet.mockResolvedValue({ address: owner, walletId: 'synthetic-owner-wallet' });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function simulationFixture() {
  const actual = await vi.importActual<typeof import('@/lib/stellar/private-chain')>('@/lib/stellar/private-chain');
  const source = new Account(PRIVATE_ADMIN, '19');
  const transactions: Transaction[] = [];
  const server = {
    getAccount: vi.fn(async () => source),
    simulateTransaction: vi.fn(async (tx: Transaction) => {
      transactions.push(tx);
      const op = tx.operations[0];
      if (op.type !== 'invokeHostFunction') throw Error('Unexpected operation');
      const method = op.func.invokeContract().functionName().toString();
      const values: Record<string, unknown> = { interface_version: 2, get_registry: REGISTRY_PRIVATE,
        get_admin: PRIVATE_ADMIN, get_booking_authority: PRIVATE_ADMIN,
        get_prescription: { id: 1n, patient: owner, doctor, commitment: Buffer.from('ab'.repeat(32), 'hex'),
          expires_at: BigInt(expiresAt), issued_at: 1n, schema_version: 1, status: ['Active'] } };
      return { transactionData: new SorobanDataBuilder(), result: { auth: [],
        retval: nativeToScVal(values[method], { type: method === 'interface_version' ? 'u32' : undefined }) } };
    }),
    prepareTransaction: vi.fn(), sendTransaction: vi.fn(), getTransaction: vi.fn(),
  };
  return { actual, server, source, transactions, chain: actual.createPrivateChain(server as any) };
}

describe('request-scoped prescription simulations', () => {
  it('reuses one source lookup while keeping every deployment and record verification unsigned on Testnet', async () => {
    const f = await simulationFixture();
    await Promise.all([f.chain.verifyDeployment(), f.chain.prescription('1'), f.chain.prescription('1')]);
    expect(f.server.getAccount).toHaveBeenCalledExactlyOnceWith(PRIVATE_ADMIN);
    expect(f.server.simulateTransaction).toHaveBeenCalledTimes(6);
    expect(f.source.sequenceNumber()).toBe('19');
    for (const tx of f.transactions) {
      expect(tx.sequence).toBe('20'); expect(tx.source).toBe(PRIVATE_ADMIN);
      expect(tx.networkPassphrase).toBe(Networks.TESTNET); expect(tx.signatures).toHaveLength(0);
      expect(tx.operations).toHaveLength(1);
      const op = tx.operations[0]; if (op.type !== 'invokeHostFunction') throw Error();
      expect(op.func.invokeContract().contractAddress().toXDR()).toEqual(new Address(RX_PRIVATE).toScAddress().toXDR());
    }
    const methods = f.transactions.map(tx => {
      const op = tx.operations[0]; if (op.type !== 'invokeHostFunction') throw Error();
      return op.func.invokeContract().functionName().toString();
    });
    expect(methods.sort()).toEqual(['get_admin', 'get_booking_authority', 'get_prescription', 'get_prescription', 'get_registry', 'interface_version'].sort());
    expect(f.server.prepareTransaction).not.toHaveBeenCalled(); expect(f.server.sendTransaction).not.toHaveBeenCalled();
    expect(f.server.getTransaction).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('does not cache returned states or share account lookups across chain instances', async () => {
    const f = await simulationFixture();
    await f.chain.prescription('1'); await f.chain.prescription('1');
    await f.actual.createPrivateChain(f.server as any).prescription('1');
    expect(f.server.getAccount).toHaveBeenCalledTimes(2);
    expect(f.server.simulateTransaction).toHaveBeenCalledTimes(3);
  });

  it('fails closed on a source lookup error and permits a fresh instance to query again', async () => {
    const f = await simulationFixture();
    f.server.getAccount.mockRejectedValueOnce(Error('source unavailable'));
    await expect(f.chain.verifyDeployment()).rejects.toThrow('source unavailable');
    expect(f.server.getAccount).toHaveBeenCalledTimes(1); expect(f.server.simulateTransaction).not.toHaveBeenCalled();
    await expect(f.actual.createPrivateChain(f.server as any).verifyDeployment()).resolves.toBeUndefined();
    expect(f.server.getAccount).toHaveBeenCalledTimes(2); expect(f.server.sendTransaction).not.toHaveBeenCalled();
  });
});

describe('bounded verified prescription lists', () => {
  function listFixture(rows: ReturnType<typeof row>[]) {
    const release = vi.fn();
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      expect(sql).toContain('p.patient_wallet=$1'); expect(sql).toContain('b.patient_requested_by=$2');
      expect(sql).toContain("p.state='confirmed'"); expect(values).toEqual([owner, actor.userId, RX_PRIVATE]);
      return { rows };
    });
    adapters.connection.mockResolvedValue({ release, query });
    const chain = { verifyDeployment: vi.fn(async () => undefined), prescription: vi.fn(async (id: string) => record(id)) };
    adapters.chain.mockReturnValue(chain);
    return { chain, release };
  }

  it('keeps the original order with at most three record reads in flight and returns only after every record verifies', async () => {
    const f = listFixture(['1', '2', '3', '4', '5', '6', '7'].map(row));
    let active = 0, maximum = 0;
    const finish = new Map<string, () => void>();
    f.chain.prescription.mockImplementation(id => new Promise(resolve => {
      active++; maximum = Math.max(maximum, active);
      finish.set(id, () => { active--; resolve(record(id)); });
    }));
    let finished = false;
    const result = listPrivatePrescriptions(actor, 'patient').then(value => { finished = true; return value; });
    await vi.waitFor(() => expect(f.chain.prescription).toHaveBeenCalledTimes(3));
    finish.get('3')!(); finish.get('2')!(); await Promise.resolve();
    expect(finished).toBe(false); expect(f.chain.prescription).toHaveBeenCalledTimes(3);
    finish.get('1')!();
    await vi.waitFor(() => expect(f.chain.prescription).toHaveBeenCalledTimes(6));
    finish.get('6')!(); finish.get('4')!(); finish.get('5')!();
    await vi.waitFor(() => expect(f.chain.prescription).toHaveBeenCalledTimes(7));
    expect(finished).toBe(false); finish.get('7')!();
    const verified = await result;
    expect(verified.prescriptions.map(value => value.rxId)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(Number.isFinite(Date.parse(verified.checkedAt))).toBe(true);
    expect(maximum).toBe(3); expect(f.chain.verifyDeployment).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });

  it.each(['patient', 'doctor', 'commitment', 'expiresAt', 'schemaVersion', 'id'])('does not return a partial list when record %s mismatches', async field => {
    const f = listFixture(['1', '2', '3', '4'].map(row));
    f.chain.prescription.mockImplementation(async id => id === '2' ? { ...record(id), [field]: 'wrong' } : record(id));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('prescription_integrity_unavailable');
    expect(f.chain.prescription).toHaveBeenCalledTimes(3); expect(f.release).toHaveBeenCalledOnce();
  });

  it('rejects an unavailable record and an invalid deployment instead of reporting an empty success', async () => {
    const f = listFixture(['1', '2'].map(row));
    f.chain.prescription.mockRejectedValueOnce(Error('RPC unavailable'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('RPC unavailable');
    f.chain.prescription.mockClear(); f.chain.verifyDeployment.mockRejectedValueOnce(Error('private_contract_mismatch'));
    await expect(listPrivatePrescriptions(actor, 'patient')).rejects.toThrow('private_contract_mismatch');
    expect(f.chain.prescription).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(2);
  });
});
