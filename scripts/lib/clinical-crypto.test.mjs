import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StrKey } from '@stellar/stellar-sdk';
import { MAX_CLINICAL_CONTENT_BYTES, openClinicalVersion, rewrapClinicalVersion, sealClinicalVersion, validateClinicalContext } from './clinical-crypto.mjs';

const keyring = { 'test-kek-1': 'a'.repeat(64) };
const activeKeyId = 'test-kek-1';
const context = {
  schemaVersion: 1, network: 'testnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 1)),
  historyId: '1'.repeat(64), entryId: '2'.repeat(64), author: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)),
  patient: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)), version: 1, previousCommitment: null,
};
const content = Buffer.from(JSON.stringify({ note: 'SYNTHETIC NOTE ONLY', observation: 'No real clinical data' }));
const metadata = { mediaType: 'application/json', fileName: 'Synthetic observation.json' };
const fixture = (overrides = {}) => sealClinicalVersion({ context, content, metadata, keyring, activeKeyId, ...overrides });
const inputFor = (sealed, overrides = {}) => ({ envelope: sealed.envelope, expectedContext: context, expectedCommitment: sealed.commitment, keyring, ...overrides });

test('clinical JSON round-trip returns bytes and encrypted metadata only', () => {
  const sealed = fixture();
  const result = openClinicalVersion(inputFor(sealed));
  assert.deepEqual(result, { content, metadata });
  assert.deepEqual(Object.keys(sealed).sort(), ['commitment', 'envelope']);
  assert.deepEqual(Object.keys(sealed.envelope).sort(), ['keyId', 'payload', 'schemaVersion', 'wrappedKey']);
  const wire = JSON.stringify(sealed);
  for (const hidden of [metadata.fileName, metadata.mediaType, 'SYNTHETIC NOTE ONLY', keyring[activeKeyId], 'blinding']) assert.equal(wire.includes(hidden), false);
  assert.equal(sealed.commitment.length, 64);
});

test('repeating identical content uses independent data keys, blindings and ciphertext', () => {
  const first = fixture();
  const second = fixture();
  assert.notEqual(first.commitment, second.commitment);
  assert.notEqual(first.envelope.payload, second.envelope.payload);
  assert.notEqual(first.envelope.wrappedKey, second.envelope.wrappedKey);
  assert.deepEqual(openClinicalVersion(inputFor(first)), openClinicalVersion(inputFor(second)));
  assert.throws(() => openClinicalVersion(inputFor(second, { expectedCommitment: first.commitment })), /clinical_version_unavailable/);
});

test('PDF, PNG and JPEG have matching declarations and file signatures', () => {
  const samples = [
    ['application/pdf', 'synthetic.pdf', Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n')],
    ['image/png', 'synthetic.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPqkAAAAASUVORK5CYII=', 'base64')],
    ['image/jpeg', 'synthetic.jpg', Buffer.from('ffd8ffe000044a46ffd9', 'hex')],
  ];
  for (const [mediaType, fileName, bytes] of samples) {
    const sealed = fixture({ content: bytes, metadata: { mediaType, fileName } });
    assert.deepEqual(openClinicalVersion(inputFor(sealed)), { content: bytes, metadata: { mediaType, fileName } });
    assert.throws(() => fixture({ content: bytes, metadata }), /clinical_content_type_mismatch/);
  }
});

test('type mismatches, truncated signatures, HTML and invalid JSON are rejected before encryption', () => {
  for (const [mediaType, bytes] of [
    ['application/pdf', Buffer.from('<html>not a PDF</html>')],
    ['application/pdf', Buffer.from('%PDF-1.7\ntruncated')],
    ['image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
    ['image/jpeg', Buffer.from('ffd8ff', 'hex')],
    ['application/json', Buffer.from('not-json')],
    ['application/json', Buffer.from('["not a note object"]')],
    ['application/json', Buffer.from('{"note":"\xff"}', 'binary')],
  ]) assert.throws(() => fixture({ content: bytes, metadata: { ...metadata, mediaType } }), /clinical_content_type_mismatch/);
});

test('file size limit is exactly 3 MB and has no silent truncation', () => {
  assert.equal(MAX_CLINICAL_CONTENT_BYTES, 3_000_000);
  const note = Buffer.from('{"note":"' + 'a'.repeat(MAX_CLINICAL_CONTENT_BYTES - 11) + '"}');
  assert.equal(note.length, MAX_CLINICAL_CONTENT_BYTES);
  const sealed = fixture({ content: note });
  assert.equal(openClinicalVersion(inputFor(sealed)).content.length, MAX_CLINICAL_CONTENT_BYTES);
  assert.throws(() => fixture({ content: Buffer.concat([note, Buffer.from(' ')]) }), /clinical_content_invalid/);
  assert.throws(() => fixture({ content: Buffer.alloc(0) }), /clinical_content_invalid/);
  assert.throws(() => fixture({ content: 'plaintext is not bytes' }), /clinical_content_invalid/);
});

test('context validation rejects ambiguous schema, network, identifiers and revision chains', () => {
  const invalid = [
    null, { ...context, schemaVersion: 2 }, { ...context, network: 'mainnet' }, { ...context, extra: 'hidden' },
    { ...context, contractId: context.patient }, { ...context, author: 'not-a-wallet' }, { ...context, patient: 'not-a-wallet' },
    { ...context, historyId: 1 }, { ...context, historyId: 'short' }, { ...context, entryId: 'short' },
    { ...context, version: 0 }, { ...context, version: 1.5 }, { ...context, version: 0x1_0000_0000 },
    { ...context, previousCommitment: '3'.repeat(64) }, { ...context, version: 2 },
    { ...context, version: 2, previousCommitment: 'missing' },
  ];
  for (const candidate of invalid) assert.throws(() => fixture({ context: candidate }));
  const validated = validateClinicalContext(context);
  assert.deepEqual(validated, context);
  assert.notEqual(validated, context);
  assert.equal(Object.isFrozen(validated), true);
  const correctedContext = { ...context, version: 2, previousCommitment: '3'.repeat(64) };
  const corrected = fixture({ context: correctedContext });
  assert.deepEqual(openClinicalVersion(inputFor(corrected, { expectedContext: correctedContext })), { content, metadata });
});

test('encryption AAD rejects changing every patient, author, contract, entry and version field', () => {
  const sealed = fixture();
  const changed = {
    schemaVersion: 2, network: 'mainnet', contractId: StrKey.encodeContract(Buffer.alloc(32, 7)),
    historyId: '9'.repeat(64), entryId: '8'.repeat(64), author: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7)),
    patient: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8)), version: 2, previousCommitment: '7'.repeat(64),
  };
  for (const [field, value] of Object.entries(changed)) assert.throws(
    () => openClinicalVersion(inputFor(sealed, { expectedContext: { ...context, [field]: value } })),
    /clinical_version_unavailable/, field,
  );
});

test('all expected commitments must be externally verified and exact', () => {
  const sealed = fixture();
  for (const expectedCommitment of [undefined, '', '0'.repeat(64), Buffer.from(sealed.commitment, 'hex'), 'g'.repeat(64)]) {
    assert.throws(() => openClinicalVersion(inputFor(sealed, { expectedCommitment })), /clinical_version_unavailable/);
  }
});

test('metadata is bounded and rejects extra fields, path names and unsupported content types', () => {
  for (const candidate of [
    { ...metadata, diagnosticCode: 'never public' }, { ...metadata, fileName: '../private.json' },
    { ...metadata, fileName: 'c:\\private.json' }, { ...metadata, fileName: 'test\r\n.json' },
    { ...metadata, fileName: 'a'.repeat(256) }, { ...metadata, fileName: 'ñ'.repeat(128) },
    { ...metadata, fileName: '' }, { ...metadata, fileName: ' hidden' },
    { ...metadata, mediaType: 'text/html' }, { ...metadata, mediaType: 'application/json; charset=utf-8' },
  ]) assert.throws(() => fixture({ metadata: candidate }), /clinical_metadata_invalid/);
});

test('missing keys, wrong keys and inherited key IDs have no fallback', () => {
  const sealed = fixture();
  for (const candidate of [undefined, {}, { [activeKeyId]: 'b'.repeat(64) }, Object.create(keyring)]) {
    assert.throws(() => openClinicalVersion(inputFor(sealed, { keyring: candidate })), /clinical_version_unavailable/);
  }
  assert.throws(() => fixture({ keyring: undefined }), /clinical_key_unavailable/);
  assert.throws(() => fixture({ activeKeyId: 'unknown' }), /clinical_key_unavailable/);
  assert.throws(() => fixture({ keyring: { [activeKeyId]: 'plaintext' } }), /clinical_key_unavailable/);
  assert.throws(() => fixture({ activeKeyId: '../secret' }), /clinical_key_unavailable/);
  // A second available key is never tried if the envelope's named key is missing.
  assert.throws(() => openClinicalVersion(inputFor(sealed, { keyring: { another: keyring[activeKeyId] } })), /clinical_version_unavailable/);
});

test('malformed and modified ciphertext/key wraps fail without disclosing content or provider details', () => {
  const sealed = fixture();
  const envelopes = [
    { ...sealed.envelope, schemaVersion: 2 }, { ...sealed.envelope, extra: 'unexpected' },
    { ...sealed.envelope, keyId: 'test-kek-2' }, { ...sealed.envelope, payload: 'plaintext fallback' },
    { ...sealed.envelope, wrappedKey: 'dossier:v1::::extra' },
    { ...sealed.envelope, payload: sealed.envelope.payload + ':' },
  ];
  for (const field of ['wrappedKey', 'payload']) {
    for (const index of [2, 3, 4]) {
      const parts = sealed.envelope[field].split(':');
      const bytes = Buffer.from(parts[index], 'base64'); bytes[0] ^= 1; parts[index] = bytes.toString('base64');
      envelopes.push({ ...sealed.envelope, [field]: parts.join(':') });
    }
    const parts = sealed.envelope[field].split(':'); parts[4] = '!' + parts[4];
    envelopes.push({ ...sealed.envelope, [field]: parts.join(':') });
  }
  for (const envelope of envelopes) assert.throws(() => openClinicalVersion(inputFor(sealed, { envelope })), error => {
    assert.equal(error.message, 'clinical_version_unavailable'); assert.equal(error.cause, undefined); return true;
  });
});

test('rotation changes only the wrapped data key and key ID, retaining commitment and content', () => {
  const sealed = fixture();
  const newKeyring = { 'test-kek-2': 'b'.repeat(64) };
  const rotated = rewrapClinicalVersion({ ...inputFor(sealed), newKeyring, activeKeyId: 'test-kek-2' });
  assert.equal(rotated.commitment, sealed.commitment);
  assert.equal(rotated.envelope.payload, sealed.envelope.payload);
  assert.notEqual(rotated.envelope.wrappedKey, sealed.envelope.wrappedKey);
  assert.deepEqual(openClinicalVersion(inputFor(rotated, { keyring: newKeyring })), { content, metadata });
  assert.throws(() => openClinicalVersion(inputFor(rotated)), /clinical_version_unavailable/);
  assert.throws(() => rewrapClinicalVersion({ ...inputFor(sealed), newKeyring: {}, activeKeyId: 'test-kek-2' }), /clinical_version_unavailable/);
});

test('recovery requires the correct backed-up historical key; a new KEK cannot recover old data', () => {
  const sealed = fixture();
  const newKeyring = { 'test-kek-2': 'b'.repeat(64) };
  assert.throws(() => rewrapClinicalVersion({ ...inputFor(sealed, { keyring: newKeyring }), newKeyring, activeKeyId: 'test-kek-2' }), /clinical_version_unavailable/);
  const recovered = rewrapClinicalVersion({ ...inputFor(sealed), newKeyring, activeKeyId: 'test-kek-2' });
  assert.deepEqual(openClinicalVersion(inputFor(recovered, { keyring: newKeyring })), { content, metadata });
  const tampered = { ...sealed.envelope, payload: fixture().envelope.payload };
  assert.throws(() => rewrapClinicalVersion({ ...inputFor(sealed, { envelope: tampered }), newKeyring, activeKeyId: 'test-kek-2' }), /clinical_version_unavailable/);
});
