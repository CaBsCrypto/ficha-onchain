import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from '@/lib/db';
import { commitmentFor, decryptDossier, encryptDossier, type DoctorDossier } from '../../scripts/lib/private-doctor-dossier.mjs';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getUserByEmail: vi.fn(), resolveWallet: vi.fn(), read: vi.fn() }));
vi.mock('@privy-io/server-auth', () => ({ PrivyClient: class {
  getUser = mocks.getUser;
  getUserByEmail = mocks.getUserByEmail;
  walletApi = {};
} }));
vi.mock('@/lib/stellar/privy-wallet-binding', () => ({ resolveStellarWallet: mocks.resolveWallet }));
vi.mock('../../scripts/lib/private-registry.mjs', () => ({ readAuthorization: mocks.read,PRIVATE_REGISTRY_ID:'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2' }));
import { RX_PRIVATE } from '@/lib/private-config';
import {
  PRIVATE_REGISTRY, REGISTRY_ADMIN, assertPrivateRegistryConfiguration, authorizationView,
  chooseAuthorizationMethod, doctorAuthorizationDetails, requestDoctorAuthorization,
  syntheticDossier, verifiedWallet,
} from '@/lib/doctor-authorizations';

const now = 1_900_000_000;
const appId = 'cmrix722m03d30clewd1fuffq';
const dataKey = 'af'.repeat(32);
const wallet = 'G'.padEnd(56, 'A');
const doctor = { id: 21, email: 'doctor@example.test', name: 'Doctor Test', specialty: 'Test', status: 'active' };
const actor = { userId: 'did:privy:admin', email: 'admin@example.test' };
const defaultRecord = { commitment: 'ab'.repeat(32), schema_version: 1, version: 4, valid_until: now + 3600, revoked: false };
const active = () => ({ authorization: { ...defaultRecord }, authorized: true, admin: REGISTRY_ADMIN });
const absent = () => ({ authorization: null, authorized: false, admin: REGISTRY_ADMIN });
const makeSql = () => {
  const tag = vi.fn().mockResolvedValue([]);
  const query = vi.fn();
  return { tag, query, sql: Object.assign(tag, { query }) as unknown as Sql };
};
const savedRequest = (action = 'authorize') => ({ id: 'request-1', action, method: 'authorize_doctor', state: 'pending', signed_xdr: 'never expose' });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  vi.stubEnv('TRUSTLEAF_PRIVATE_PORTAL_ENABLED', 'true');
  vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','true');
  vi.stubEnv('TRUSTLEAF_ENV','local');
  vi.stubEnv('TRUSTLEAF_DB_HOST','ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech');
  vi.stubEnv('DATABASE_URL','postgres://test:test@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test');
  vi.stubEnv('VERCEL_ENV','');
  vi.stubEnv('PRESCRIPTION_PRIVATE_CONTRACT_ID',RX_PRIVATE);
  vi.stubEnv('BOOKING_AUTHORITY_PUBLIC_KEY',REGISTRY_ADMIN);
  vi.stubEnv('DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID', PRIVATE_REGISTRY);
  vi.stubEnv('DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY', REGISTRY_ADMIN);
  vi.stubEnv('PRIVY_APP_ID', appId);
  vi.stubEnv('NEXT_PUBLIC_PRIVY_APP_ID', appId);
  vi.stubEnv('PRIVY_APP_SECRET', 'unit-test-only');
  vi.stubEnv('TRUSTLEAF_DATA_KEY', dataKey);
  mocks.getUserByEmail.mockResolvedValue({ id: 'did:privy:doctor' });
  mocks.getUser.mockResolvedValue({ email: { address: doctor.email } });
  mocks.resolveWallet.mockResolvedValue({ walletId: 'owned-wallet', address: wallet });
  mocks.read.mockResolvedValue(absent());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('private registry configuration and identity', () => {
  it.each([
    ['TRUSTLEAF_ENV', 'production', 'private_environment_mismatch'],
    ['TRUSTLEAF_DB_HOST', 'production.example.test', 'private_environment_mismatch'],
    ['DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID', 'old-contract', 'private_configuration_mismatch'],
    ['DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY', 'another-admin', 'private_configuration_mismatch'],
    ['PRIVY_APP_ID', 'different-app', 'private_configuration_mismatch'],
    ['NEXT_PUBLIC_PRIVY_APP_ID', 'different-app', 'private_configuration_mismatch'],
  ])('fails closed for %s', (key, value, error) => {
    vi.stubEnv(key, value);
    expect(assertPrivateRegistryConfiguration).toThrow(error);
  });
  it('pauses new authorizations while retaining access to current pending receipts',async()=>{
    vi.stubEnv('TRUSTLEAF_PRIVATE_WRITES_ENABLED','false');
    vi.stubEnv('TRUSTLEAF_PRIVATE_PORTAL_ENABLED','false');
    const {sql,tag,query}=makeSql();
    await expect(requestDoctorAuthorization(sql,actor,doctor.id,'authorize')).rejects.toMatchObject({status:503,message:'private_writes_paused'});
    expect(tag).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]).mockResolvedValueOnce([savedRequest()]);
    const details=await doctorAuthorizationDetails(sql,doctor.id);
    expect(details.request).toMatchObject({id:'request-1',state:'pending'});
  });
  it('rejects a changed Privy email before resolving a wallet', async () => {
    mocks.getUser.mockResolvedValue({ email: { address: 'different@example.test' } });
    await expect(verifiedWallet(makeSql().sql, 'did:privy:doctor', doctor.email))
      .rejects.toMatchObject({ status: 403, message: 'identity_changed' });
    expect(mocks.resolveWallet).not.toHaveBeenCalled();
  });
  it('propagates an ambiguous or changed wallet binding without a registry operation', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]);
    mocks.resolveWallet.mockRejectedValue(new Error('wallet_binding_changed'));
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).rejects.toThrow('wallet_binding_changed');
    expect(query).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe('contract action selection', () => {
  it('initial authorization creates the first version only for an absent record', () => {
    expect(chooseAuthorizationMethod('authorize', absent())).toEqual({ method: 'authorize_doctor', expectedVersion: 0, targetVersion: 1 });
    expect(() => chooseAuthorizationMethod('authorize', active())).toThrow('action_does_not_match_registry_state');
  });
  it('renews active authorization and increments its version', () => {
    expect(chooseAuthorizationMethod('renew', active())).toEqual({ method: 'renew_authorization', expectedVersion: 4, targetVersion: 5 });
  });
  it.each(['expired', 'revoked'])('reauthorizes a %s record', state => {
    const chain = active();
    chain.authorized = false;
    if (state === 'expired') chain.authorization.valid_until = now;
    else chain.authorization.revoked = true;
    expect(chooseAuthorizationMethod('renew', chain)).toEqual({ method: 'reauthorize_doctor', expectedVersion: 4, targetVersion: 5 });
    expect(authorizationView(chain).status).toBe(state);
  });
  it('does not renew an unexpired record while registry authorization is paused', () => {
    const chain = { ...active(), authorized: false };
    expect(authorizationView(chain).status).toBe('paused');
    expect(() => chooseAuthorizationMethod('renew', chain)).toThrow('registry_paused');
  });
  it('revokes without changing the dossier version and rejects a second revocation', () => {
    const chain = active();
    expect(chooseAuthorizationMethod('revoke', chain)).toEqual({ method: 'revoke_doctor', expectedVersion: 4, targetVersion: 4 });
    chain.authorization.revoked = true;
    chain.authorized = false;
    expect(() => chooseAuthorizationMethod('revoke', chain)).toThrow('action_does_not_match_registry_state');
  });
  it.each(['renew', 'revoke', 'mint_prescription'])('rejects %s for an unregistered doctor', action => {
    expect(() => chooseAuthorizationMethod(action, absent())).toThrow('action_does_not_match_registry_state');
  });
});

describe('durable authorization requests', () => {
  it('returns the same pending request on double click without a new dossier or chain call', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([savedRequest()]);
    const result = await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize');
    expect(result.request).toMatchObject({ id: 'request-1', state: 'pending', transactionHash: null });
    expect(result.request).not.toHaveProperty('signed_xdr');
    expect(query).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('rejects a competing action while the first request is pending', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([savedRequest('renew')]);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'revoke'))
      .rejects.toMatchObject({ status: 409, message: 'another_action_pending' });
    expect(query).not.toHaveBeenCalled();
  });
  it('stores an encrypted synthetic dossier bound to wallet, version and requesting admin before any broadcast', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]);
    query.mockResolvedValueOnce([savedRequest()]);
    const result = await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize');
    const params = query.mock.calls[0][1] as unknown[];
    const dossier = decryptDossier(String(params[6]), dataKey, String(params[0]));
    expect(dossier).toMatchObject({ ...syntheticDossier(), network: 'testnet', contractId: PRIVATE_REGISTRY,
      wallet, version: 1, validUntil: now + 30 * 86400, reviewedBy: actor.userId });
    expect(commitmentFor(dossier)).toBe(params[5]);
    expect(String(params[6])).not.toContain(dossier.fullName);
    expect(() => decryptDossier(String(params[6]), dataKey, 'other-dossier-id')).toThrow();
    expect(params[13]).toBe('owned-wallet');
    expect(result.request?.state).toBe('pending');
    expect(result.request?.transactionHash).toBeNull();
  });
  it('recovers the winning identical request after a concurrent insert conflict', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([savedRequest()]);
    query.mockRejectedValueOnce(new Error('unique pending request conflict'));
    expect((await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).request?.id).toBe('request-1');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not mask a database failure as success when no winning request exists', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).rejects.toThrow('database unavailable');
  });
  it('does not queue an authorization if the registry cannot be read', async () => {
    const { sql, tag, query } = makeSql();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]);
    mocks.read.mockRejectedValue(new Error('registry_read_failed'));
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).rejects.toThrow('registry_read_failed');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('recovery of failed unsigned authorization requests', () => {
  function failedFixture() {
    const dossier: DoctorDossier = { schemaVersion: 1, network: 'testnet', contractId: PRIVATE_REGISTRY,
      wallet, version: 1, validUntil: now + 3600, ...syntheticDossier(), reviewedBy: actor.userId,
      reviewedAt: new Date(now * 1000).toISOString(), blinding: '34'.repeat(32) };
    return { dossier, row: {
      id: 'failed-request', state: 'failed', action: 'authorize', method: 'authorize_doctor',
      expected_version: 0, target_version: 1, doctor_id: doctor.id, doctor_user_id: 'did:privy:doctor',
      doctor_email: doctor.email, wallet_id: 'owned-wallet', wallet, network: 'testnet', contract_id: PRIVATE_REGISTRY,
      requested_by: actor.userId, requested_email: actor.email, valid_until: dossier.validUntil,
      commitment: commitmentFor(dossier), prepared_xdr: null, transaction_hash: null,
      error_code: 'authority_signature_invalid', dossier_record_id: 'existing-dossier', dossier_network: 'testnet',
      dossier_version: 1, dossier_valid_until: dossier.validUntil, dossier_commitment: commitmentFor(dossier),
      dossier_status: 'prepared', dossier_transaction_hash: null, has_signed_attempt: false,
      encrypted_dossier: encryptDossier(dossier, dataKey, 'existing-dossier'),
    } as Record<string, unknown> };
  }
  function arrange(row: Record<string, unknown>) {
    const result = makeSql();
    result.tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
    result.query.mockResolvedValueOnce([{ ...savedRequest(), id: 'retry-request' }]);
    return result;
  }
  it('reuses the unchanged dossier in a fresh request and retains the failed request and its error', async () => {
    const { row } = failedFixture();
    const { sql, query } = arrange(row);
    expect((await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).request)
      .toMatchObject({ id: 'retry-request', state: 'pending', transactionHash: null });
    const [statement, params] = query.mock.calls[0] as [string, unknown[]];
    expect(statement).toContain('INSERT INTO doctor_authorization_requests');
    expect(statement).not.toMatch(/INSERT INTO doctor_private_dossiers|UPDATE doctor_|DELETE FROM/);
    expect(params[0]).toBe('existing-dossier');
    expect(params[4]).toBe(row.valid_until);
    expect(params[5]).toBe(row.commitment);
    expect(params[6]).toBe(row.encrypted_dossier);
    expect(params[7]).not.toBe('failed-request');
    expect(params[17]).toBe('failed-request');
    expect(row.error_code).toBe('authority_signature_invalid');
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.resolveWallet).toHaveBeenCalledTimes(1);
  });
  it.each(['transaction_hash', 'prepared_xdr', 'dossier_transaction_hash', 'has_signed_attempt'])('never retries a saved or uncertain signed attempt indicated by %s', async field => {
    const { row } = failedFixture();
    row[field] = field === 'has_signed_attempt' ? true : 'saved-evidence';
    const { sql, query } = arrange(row);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 409, message: 'failed_authorization_requires_reconciliation' });
    expect(query).not.toHaveBeenCalled();
  });
  it('requires the original reviewer instead of attributing old evidence to a different administrator', async () => {
    const { row } = failedFixture();
    const { sql, query } = arrange(row);
    await expect(requestDoctorAuthorization(sql, { ...actor, userId: 'did:privy:other-admin' }, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 403, message: 'retry_requires_original_reviewer' });
    expect(query).not.toHaveBeenCalled();
  });
  it.each(['doctor_user_id', 'wallet_id', 'method', 'expected_version'])('rejects changed %s in the failed request', async field => {
    const { row } = failedFixture();
    row[field] = field === 'expected_version' ? 2 : 'changed';
    const { sql, query } = arrange(row);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 409, message: 'failed_authorization_state_changed' });
    expect(query).not.toHaveBeenCalled();
  });
  it('does not silently extend the lifetime of an expired review', async () => {
    const { row } = failedFixture();
    row.dossier_valid_until = now;
    const { sql, query } = arrange(row);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 409, message: 'failed_dossier_expired' });
    expect(query).not.toHaveBeenCalled();
  });
  it('checks the encrypted reviewer identity independently of the request metadata', async () => {
    const { row, dossier } = failedFixture();
    dossier.reviewedBy = 'did:privy:someone-else';
    row.commitment = row.dossier_commitment = commitmentFor(dossier);
    row.encrypted_dossier = encryptDossier(dossier, dataKey, 'existing-dossier');
    const { sql, query } = arrange(row);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 503, message: 'dossier_integrity_error' });
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects recovery when the chain has advanced since the unsigned failure', async () => {
    const { row } = failedFixture();
    const { sql, query } = arrange(row);
    mocks.read.mockResolvedValue(active());
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).rejects.toThrow('action_does_not_match_registry_state');
    expect(query).not.toHaveBeenCalled();
  });
  it('does not claim a successful retry if its atomic eligibility check no longer matches', async () => {
    const { row } = failedFixture();
    const { sql, query } = arrange(row);
    query.mockReset().mockResolvedValueOnce([]);
    await expect(requestDoctorAuthorization(sql, actor, doctor.id, 'authorize'))
      .rejects.toMatchObject({ status: 409, message: 'failed_authorization_requires_reconciliation' });
  });
  it('returns the concurrent winning retry without duplicating the dossier', async () => {
    const { row } = failedFixture();
    const { sql, query, tag } = arrange(row);
    query.mockReset().mockRejectedValueOnce(new Error('unique pending request conflict'));
    tag.mockResolvedValueOnce([{ ...savedRequest(), id: 'other-retry' }]);
    expect((await requestDoctorAuthorization(sql, actor, doctor.id, 'authorize')).request?.id).toBe('other-retry');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('private dossier review integrity', () => {
  function dossierFixture() {
    const dossier: DoctorDossier = { schemaVersion: 1, network: 'testnet', contractId: PRIVATE_REGISTRY,
      wallet, version: 4, validUntil: now + 3600, ...syntheticDossier(), reviewedBy: actor.userId,
      reviewedAt: new Date(now * 1000).toISOString(), blinding: '12'.repeat(32) };
    const stored = { id: 'dossier-1', version: 4, commitment: commitmentFor(dossier), encrypted_dossier: encryptDossier(dossier, dataKey, 'dossier-1') };
    return { dossier, stored };
  }
  it('allows review but omits the blinding secret and encrypted envelope from its response', async () => {
    const { sql, tag } = makeSql();
    const { stored, dossier } = dossierFixture();
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([stored]).mockResolvedValueOnce([]);
    mocks.read.mockResolvedValue(active());
    const details = await doctorAuthorizationDetails(sql, doctor.id);
    expect(details.dossier).toMatchObject({ fullName: dossier.fullName, wallet, version: 4 });
    expect(details.dossier).not.toHaveProperty('blinding');
    expect(JSON.stringify(details)).not.toContain(stored.encrypted_dossier);
    expect(details.authorization.status).toBe('authorized');
  });
  it.each(['commitment', 'wallet', 'contractId', 'version'])('rejects inconsistent dossier %s', field => {
    const { sql, tag } = makeSql();
    const { stored, dossier } = dossierFixture();
    if (field === 'commitment') stored.commitment = 'cd'.repeat(32);
    else {
      if (field === 'wallet') dossier.wallet = 'different-wallet';
      if (field === 'contractId') dossier.contractId = 'old-contract';
      if (field === 'version') dossier.version = 5;
      stored.commitment = commitmentFor(dossier);
      stored.encrypted_dossier = encryptDossier(dossier, dataKey, stored.id);
    }
    tag.mockResolvedValueOnce([doctor]).mockResolvedValueOnce([stored]);
    return expect(doctorAuthorizationDetails(sql, doctor.id)).rejects.toMatchObject({ status: 503, message: 'dossier_integrity_error' });
  });
});
