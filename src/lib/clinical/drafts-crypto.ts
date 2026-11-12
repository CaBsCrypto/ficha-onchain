import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { PrivateFlowError } from '@/lib/private-config';
import { draftPayload } from './drafts-input';
import type { ClinicalDraftPayload } from './drafts-types';

const DOMAIN = 'TrustLeaf author clinical draft v1';
export interface DraftContext {
  schemaVersion: 1; network: 'testnet'; contractId: string; draftId: string;
  authorUserId: string; authorWalletId: string; author: string;
  historyId: string; patient: string; entryId: string | null; expectedVersion: number | null; revision: number;
}
export interface DraftEnvelope { schemaVersion: 1; keyId: string; iv: string; tag: string; ciphertext: string }
export interface DraftKeys { keyring: Record<string, string>; activeKeyId: string }
const unavailable = () => new PrivateFlowError('clinical_drafts_unavailable', 503);
function key(context: DraftContext, keys: DraftKeys, keyId: string, purpose: string): Buffer {
  const master = keys.keyring[keyId];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(keyId) || typeof master !== 'string' || !/^[a-f0-9]{64}$/i.test(master)) throw unavailable();
  const raw = Buffer.from(master, 'hex');
  try { return Buffer.from(hkdfSync('sha256', raw, Buffer.from(DOMAIN), Buffer.from(JSON.stringify([purpose, context.authorUserId, context.authorWalletId, context.author])), 32)); }
  finally { raw.fill(0); }
}
const aad = (c: DraftContext) => Buffer.from(JSON.stringify([DOMAIN, c.schemaVersion, c.network, c.contractId, c.draftId,
  c.authorUserId, c.authorWalletId, c.author, c.historyId, c.patient, c.entryId, c.expectedVersion, c.revision]));
export function sealDraft(context: DraftContext, payload: ClinicalDraftPayload, keys: DraftKeys): DraftEnvelope {
  const encryptionKey = key(context, keys, keys.activeKeyId, 'encryption'), iv = randomBytes(12), content = Buffer.from(JSON.stringify(draftPayload(payload)));
  try {
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv); cipher.setAAD(aad(context));
    const ciphertext = Buffer.concat([cipher.update(content), cipher.final()]);
    return { schemaVersion: 1, keyId: keys.activeKeyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { encryptionKey.fill(0); content.fill(0); }
}
export function openDraft(context: DraftContext, supplied: unknown, keys: DraftKeys): ClinicalDraftPayload {
  let encryptionKey: Buffer | undefined, clear: Buffer | undefined;
  try {
    const e = typeof supplied === 'string' ? JSON.parse(supplied) : supplied;
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).sort().join(',') !== 'ciphertext,iv,keyId,schemaVersion,tag' || e.schemaVersion !== 1 ||
        typeof e.iv !== 'string' || typeof e.tag !== 'string' || typeof e.ciphertext !== 'string' || e.ciphertext.length > 5_350_000 ||
        Buffer.from(e.iv, 'base64').length !== 12 || Buffer.from(e.tag, 'base64').length !== 16) throw unavailable();
    for (const value of [e.iv, e.tag, e.ciphertext]) if (!value || Buffer.from(value, 'base64').toString('base64') !== value) throw unavailable();
    encryptionKey = key(context, keys, e.keyId, 'encryption');
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(e.iv, 'base64'));
    cipher.setAAD(aad(context)); cipher.setAuthTag(Buffer.from(e.tag, 'base64'));
    clear = Buffer.concat([cipher.update(Buffer.from(e.ciphertext, 'base64')), cipher.final()]);
    const payload = draftPayload(JSON.parse(clear.toString('utf8')));
    if ((payload.entryId ?? null) !== context.entryId || (payload.expectedVersion ?? null) !== context.expectedVersion) throw unavailable();
    return payload;
  } catch { throw unavailable(); }
  finally { encryptionKey?.fill(0); clear?.fill(0); }
}
export function draftFingerprint(context: DraftContext, payload: ClinicalDraftPayload, expectedRevision: number, keys: DraftKeys, keyId = keys.activeKeyId): string {
  const authenticationKey = key(context, keys, keyId, 'save-idempotency');
  try { return keyId + ':' + createHmac('sha256', authenticationKey).update(aad({ ...context, revision: expectedRevision + 1 })).update('\n').update(JSON.stringify({ expectedRevision, payload: draftPayload(payload) })).digest('hex'); }
  finally { authenticationKey.fill(0); }
}
