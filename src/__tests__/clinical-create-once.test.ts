import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, BASE_FEE, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
import { assertPrivateWrites, PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import { CLINICAL_ID } from '@/lib/clinical/config';
import { clinicalInvocation, deriveClinicalHistoryId } from '@/lib/clinical/chain';
import { assertClinicalWriteScope, assertClinicalCreateOnceFee, assertClinicalCreateOnceSavedFee } from '@/lib/clinical/create-once';

const owner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 81));
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 82));
const other = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 83));
const host = 'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech';
beforeEach(() => {
  for (const key of ['TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL']) vi.stubEnv(key, undefined);
  const env = { TRUSTLEAF_ENV: 'local', VERCEL_ENV: '', DATABASE_URL: `postgres://fixture:fixture@${host}/fixture`, TRUSTLEAF_DATABASE_URL: `postgres://fixture:fixture@${host}/fixture`, TRUSTLEAF_DB_HOST: host,
    PRIVY_APP_ID: PRIVY_APP, NEXT_PUBLIC_PRIVY_APP_ID: PRIVY_APP, DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: REGISTRY_PRIVATE, PRESCRIPTION_PRIVATE_CONTRACT_ID: RX_PRIVATE,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: PRIVATE_ADMIN, BOOKING_AUTHORITY_PUBLIC_KEY: PRIVATE_ADMIN, NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
    TRUSTLEAF_CLINICAL_WEB_ENABLED: 'true', CLINICAL_HISTORY_PRIVATE_CONTRACT_ID: CLINICAL_ID, TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false', RELAYER_SECRET: payer.secret(),
    TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET: owner.publicKey(), TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER: payer.publicKey(), TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL: String(Math.floor(Date.now()/1000)+480) };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});

describe('one explicitly hosted Testnet history creation', () => {
  const hostedHost = 'ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech';
  beforeEach(() => {
    for (const suffix of ['WALLET', 'RELAYER', 'UNTIL']) {
      vi.stubEnv('TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_' + suffix, process.env['TRUSTLEAF_CLINICAL_CREATE_ONCE_' + suffix]);
      vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_' + suffix, undefined);
    }
    for (const [key, value] of Object.entries({ TRUSTLEAF_ENV: 'test', VERCEL_ENV: 'production', TRUSTLEAF_DB_HOST: hostedHost,
      DATABASE_URL: `postgres://fixture:fixture@${hostedHost}/fixture`, TRUSTLEAF_DATABASE_URL: `postgres://fixture:fixture@${hostedHost}/fixture` })) vi.stubEnv(key, value);
  });
  it('permits the selected creation without enabling general private writes', () => {
    expect(assertClinicalWriteScope('create_history', owner.publicKey())).toMatchObject({ wallet: owner.publicKey(), relayer: payer.publicKey() });
    expect(assertPrivateWrites).toThrow('private_writes_paused');
  });
  it.each(['append_version', 'set_permissions'] as const)('rejects %s and another account', action => {
    expect(() => assertClinicalWriteScope(action, owner.publicKey())).toThrow();
    expect(() => assertClinicalWriteScope('create_history', other.publicKey())).toThrow();
  });
  it.each(['WALLET', 'RELAYER', 'UNTIL'])('rejects a missing %s or mixed local configuration', suffix => {
    const key = 'TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_' + suffix, value = process.env[key];
    vi.stubEnv(key, undefined); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
    vi.stubEnv(key, value); vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET', owner.publicKey());
    expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
  });
  it.each(['preview', '', 'development'])('rejects runtime %s', runtime => {
    vi.stubEnv('VERCEL_ENV', runtime); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
  });
  it('rejects a different database even when its environment pin matches, or routing query overrides', () => {
    vi.stubEnv('TRUSTLEAF_DATABASE_URL', 'postgres://fixture:fixture@other.neon.tech/fixture'); vi.stubEnv('TRUSTLEAF_DB_HOST', 'other.neon.tech');
    expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
    vi.stubEnv('TRUSTLEAF_DATABASE_URL', `postgres://fixture:fixture@${hostedHost}/fixture?host=other.neon.tech`); vi.stubEnv('TRUSTLEAF_DB_HOST', hostedHost);
    expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
  });
  it('rechecks the one-XLM sponsored cap and expiry before signing or retransmission', () => {
    const scope = assertClinicalWriteScope('create_history', owner.publicKey());
    expect(() => assertClinicalCreateOnceFee(scope, unsigned('6000001'))).toThrow('clinical_create_once_fee_exceeded');
    vi.stubEnv('TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL', String(Math.floor(Date.now()/1000)-1));
    expect(() => assertClinicalCreateOnceSavedFee(scope, unsigned().toXDR())).toThrow();
  });
  it('rejects an envelope that could remain valid beyond the temporary authority', () => {
    vi.stubEnv('TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL', String(Math.floor(Date.now()/1000)+81));
    const scope = assertClinicalWriteScope('create_history', owner.publicKey());
    expect(() => assertClinicalCreateOnceFee(scope, unsigned())).toThrowError(expect.objectContaining({ message: 'clinical_create_once_window_too_short', status: 409 }));
  });
});
afterEach(() => vi.unstubAllEnvs());
function unsigned(resource = '1000000') {
  return new TransactionBuilder(new Account(owner.publicKey(), '100'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(clinicalInvocation('create_history', { patient: owner.publicKey(), historyId: deriveClinicalHistoryId(owner.publicKey()), operationId: '8'.repeat(64) }))
    .setSorobanData(new SorobanDataBuilder().setResourceFee(resource).build()).setTimeout(180).build();
}
describe('one local creation without enabling general private writes', () => {
  it('allows only the selected create while the general write guard still rejects all ordinary writes', () => {
    expect(assertClinicalWriteScope('create_history', owner.publicKey())).toMatchObject({ wallet: owner.publicKey(), relayer: payer.publicKey() });
    expect(assertPrivateWrites).toThrow('private_writes_paused');
  });
  it.each(['append_version', 'set_permissions'] as const)('rejects %s even for the selected owner', action => expect(() => assertClinicalWriteScope(action, owner.publicKey())).toThrow('clinical_create_once_scope_rejected'));
  it('rejects another verified actor', () => expect(() => assertClinicalWriteScope('create_history', other.publicKey())).toThrow('clinical_create_once_scope_rejected'));
  it.each(['TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL'])('rejects incomplete configuration %s', key => {
    vi.stubEnv(key, undefined); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow('clinical_create_once_scope_rejected');
  });
  it.each(['', 'true', 'TRUE'])('rejects broad writes set to %s alongside the scoped authority', flag => {
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', flag); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow('clinical_create_once_scope_rejected');
  });
  it.each([-1, 0, 601])('rejects expired or overly long deadline offset %s', offset => {
    vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL', String(Math.floor(Date.now()/1000)+offset));
    expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrowError(expect.objectContaining({
      message: offset <= 0 ? 'clinical_create_once_expired' : 'clinical_create_once_scope_rejected', status: offset <= 0 ? 409 : 403,
    }));
  });
  it.each(['preview', 'production'])('rejects a Vercel %s runtime', value => {
    vi.stubEnv('VERCEL_ENV', value); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow();
  });
  it('rejects a changed relayer secret', () => {
    vi.stubEnv('RELAYER_SECRET', other.secret()); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow('clinical_create_once_scope_rejected');
  });
  it('rejects a wrong database before permitting an operation', () => {
    vi.stubEnv('TRUSTLEAF_DATABASE_URL', 'postgres://fixture:fixture@other.neon.tech/fixture'); expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow('private_environment_mismatch');
  });
  it('caps the actual sponsored fee, not just the inclusion fee, at exactly one Testnet XLM', () => {
    const scope = assertClinicalWriteScope('create_history', owner.publicKey());
    expect(() => assertClinicalCreateOnceFee(scope, unsigned('6000000'))).not.toThrow();
    expect(() => assertClinicalCreateOnceFee(scope, unsigned('6000001'))).toThrow('clinical_create_once_fee_exceeded');
  });
  it('rechecks expiry before patient signing and retransmission', () => {
    const scope = assertClinicalWriteScope('create_history', owner.publicKey()), tx = unsigned();
    vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL', String(Math.floor(Date.now()/1000)-1));
    expect(() => assertClinicalCreateOnceFee(scope, tx)).toThrowError(expect.objectContaining({ message: 'clinical_create_once_expired', status: 409 }));
    expect(() => assertClinicalCreateOnceSavedFee(scope, tx.toXDR())).toThrowError(expect.objectContaining({ message: 'clinical_create_once_expired', status: 409 }));
  });
  it('preserves the existing broad policy only when no scoped authority is configured', () => {
    for (const key of ['TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_RELAYER', 'TRUSTLEAF_CLINICAL_CREATE_ONCE_UNTIL']) vi.stubEnv(key, undefined);
    expect(() => assertClinicalWriteScope('create_history', owner.publicKey())).toThrow('private_writes_paused');
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED', 'true'); expect(assertClinicalWriteScope('append_version', owner.publicKey())).toBeNull();
  });
});
