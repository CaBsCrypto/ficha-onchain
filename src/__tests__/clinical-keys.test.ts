import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { PrivateFlowError } from '@/lib/private-config';
import { openClinicalVersion, rewrapClinicalVersion, sealClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';

vi.mock('server-only', () => ({}));
import { clinicalKeyring } from '@/lib/clinical/keys';

const oldKey = 'a'.repeat(64);
const newKey = 'B'.repeat(64);
function configure(keyring: unknown = { 'web-1': oldKey }, active = 'web-1') {
  vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', JSON.stringify(keyring));
  vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', active);
}
const context = {
  schemaVersion: 1, network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)),
  historyId: '1'.repeat(64), entryId: '2'.repeat(64), author: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)),
  patient: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)), version: 1, previousCommitment: null,
};
const content = Buffer.from(JSON.stringify({ title: 'Synthetic note', text: 'No real patient data' }));
const metadata = { mediaType: 'application/json', fileName: 'synthetic-note.json' };
function seal() {
  return sealClinicalVersion({ context, content, metadata, ...clinicalKeyring() });
}
function openInput(sealed: ReturnType<typeof seal>) {
  return { envelope: sealed.envelope, expectedContext: context, expectedCommitment: sealed.commitment, keyring: clinicalKeyring().keyring };
}

afterEach(() => vi.unstubAllEnvs());

describe('dedicated clinical service keyring', () => {
  it('accepts versioned 32-byte keys and returns an isolated immutable keyring', () => {
    configure({ 'web-1': oldKey, 'web-2': newKey }, 'web-2');
    const result = clinicalKeyring();
    expect(result.activeKeyId).toBe('web-2');
    expect(result.keyring).toEqual({ 'web-1': oldKey, 'web-2': newKey });
    expect(Object.getPrototypeOf(result.keyring)).toBeNull();
    expect(Object.isFrozen(result.keyring)).toBe(true);
  });

  it('never substitutes the existing prescription key when clinical keys are missing', () => {
    vi.stubEnv('TRUSTLEAF_DATA_KEY', oldKey);
    vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', undefined);
    vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', undefined);
    expect(clinicalKeyring).toThrow('clinical_keys_unavailable');
  });

  it.each([
    null, [], 'not an object', 1, {},
    { 'bad key': oldKey }, { '_bad': oldKey }, { ['a'.repeat(65)]: oldKey },
    { 'web-1': oldKey.slice(1) }, { 'web-1': 'g'.repeat(64) },
    { 'web-1': 123 }, { 'web-1': oldKey, bad: 'invalid' },
  ])('rejects invalid keyring objects without returning a partial configuration', invalid => {
    configure(invalid);
    expect(clinicalKeyring).toThrow('clinical_keys_unavailable');
  });

  it.each(['missing-version', '', ' web-1', '_invalid'])('requires the active key to exist with an exact valid ID', active => {
    configure({ 'web-1': oldKey }, active);
    expect(clinicalKeyring).toThrow('clinical_keys_unavailable');
  });

  it('sanitizes parser errors and never exposes key material or raw configuration', () => {
    vi.stubEnv('TRUSTLEAF_CLINICAL_KEYRING', '{"web-1":"' + oldKey + '"');
    vi.stubEnv('TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID', 'web-1');
    try { clinicalKeyring(); throw new Error('unexpected success'); } catch (error) {
      expect(error).toBeInstanceOf(PrivateFlowError);
      expect((error as PrivateFlowError).status).toBe(503);
      expect((error as Error).message).toBe('clinical_keys_unavailable');
      expect(String(error)).not.toContain(oldKey);
      expect(String(error)).not.toContain('web-1');
    }
  });

  it('reads the current server configuration without retaining a stale cached keyring', () => {
    configure();
    const previous = clinicalKeyring();
    configure({ 'web-2': newKey }, 'web-2');
    expect(clinicalKeyring().activeKeyId).toBe('web-2');
    expect(Object.hasOwn(clinicalKeyring().keyring, 'web-1')).toBe(false);
    expect(previous.keyring['web-1']).toBe(oldKey);
  });
});

describe('clinical key recovery and rotation', () => {
  it('recovers an existing sealed version when its old wrapping key is retained', () => {
    configure();
    const sealed = seal();
    configure({ 'web-1': oldKey, 'web-2': newKey }, 'web-2');
    expect(openClinicalVersion(openInput(sealed))).toEqual({ content, metadata });
  });

  it('fails closed when an old key is missing or replaced by the wrong key', () => {
    configure();
    const sealed = seal();
    configure({ 'web-2': newKey }, 'web-2');
    expect(() => openClinicalVersion(openInput(sealed))).toThrow('clinical_version_unavailable');
    configure({ 'web-1': newKey });
    expect(() => openClinicalVersion(openInput(sealed))).toThrow('clinical_version_unavailable');
  });

  it('rewraps only the data key while preserving ciphertext and the verified commitment', () => {
    configure();
    const sealed = seal();
    const previousInput = openInput(sealed);
    configure({ 'web-2': newKey }, 'web-2');
    const next = clinicalKeyring();
    const rewrapped = rewrapClinicalVersion({ ...previousInput, newKeyring: next.keyring, activeKeyId: next.activeKeyId });
    expect(rewrapped.commitment).toBe(sealed.commitment);
    expect(rewrapped.envelope.payload).toBe(sealed.envelope.payload);
    expect(rewrapped.envelope.wrappedKey).not.toBe(sealed.envelope.wrappedKey);
    expect(rewrapped.envelope.keyId).toBe('web-2');
    expect(openClinicalVersion(openInput(rewrapped))).toEqual({ content, metadata });
    expect(() => openClinicalVersion(openInput(sealed))).toThrow('clinical_version_unavailable');
  });
});
