import 'server-only';
import { PrivateFlowError } from '@/lib/private-config';

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HEX_KEY = /^[a-fA-F0-9]{64}$/;

/** Only a dedicated server secret supplies web keys. No database, DPAPI, or legacy fallback. */
export function clinicalKeyring(): { keyring: Record<string, string>; activeKeyId: string } {
  const raw = process.env.TRUSTLEAF_CLINICAL_KEYRING;
  const activeKeyId = process.env.TRUSTLEAF_CLINICAL_ACTIVE_KEY_ID;
  try {
    if (!raw || !activeKeyId || !KEY_ID.test(activeKeyId)) throw new Error();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        Object.getPrototypeOf(parsed) !== Object.prototype) throw new Error();
    const entries = Object.entries(parsed);
    if (!entries.length) throw new Error();
    const keyring: Record<string, string> = Object.create(null);
    for (const [keyId, key] of entries) {
      if (!KEY_ID.test(keyId) || typeof key !== 'string' || !HEX_KEY.test(key)) throw new Error();
      keyring[keyId] = key;
    }
    if (!Object.hasOwn(keyring, activeKeyId)) throw new Error();
    return { keyring: Object.freeze(keyring), activeKeyId };
  } catch {
    // Never include raw configuration, key IDs, parser diagnostics, or key material in errors.
    throw new PrivateFlowError('clinical_keys_unavailable', 503);
  }
}
