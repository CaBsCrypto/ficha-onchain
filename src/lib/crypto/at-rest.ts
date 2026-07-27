/**
 * At-rest encryption for clinical free text — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * The on-chain layer never sees content (only SHA-256 anchors), but the
 * off-chain layer did: clinical_entries.summary/detail and the base64 exam
 * files sat in Neon in cleartext, so a database dump was a readable medical
 * leak (Ley 19.628). This closes that: sensitive columns are encrypted with
 * AES-256-GCM under TRUSTLEAF_DATA_KEY before they touch the database.
 *
 * Format: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`
 *  - GCM authenticates as well as encrypts: a tampered byte fails decryption
 *    loudly instead of returning plausible garbage.
 *  - The `enc:v1` prefix makes rollout incremental and honest: values without
 *    it are legacy cleartext and pass through reads untouched, and
 *    /api/admin/encrypt walks them into ciphertext idempotently.
 *
 * Key handling:
 *  - TRUSTLEAF_DATA_KEY = 64 hex chars (32 bytes). Never stored in the DB.
 *  - encrypt WITHOUT a key configured → passthrough plus one loud warning.
 *    Fail-open here is deliberate and bounded: previews share production's
 *    DATABASE_URL, and a preview without the env var must degrade to today's
 *    behaviour (cleartext write) rather than take the product down.
 *  - decrypt of an `enc:` value WITHOUT the key → throws. That data is
 *    unreadable by definition; pretending otherwise would be a lie.
 *
 * Anchors are computed over the PLAINTEXT before encrypting — on-chain
 * verification is unaffected by this layer.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

class DataKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataKeyError";
  }
}

let warned = false;

function getKey(): Buffer | null {
  const hex = process.env.TRUSTLEAF_DATA_KEY?.trim();
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new DataKeyError(
      "TRUSTLEAF_DATA_KEY debe ser 64 caracteres hex (32 bytes). Genera una con: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, "hex");
}

/** True when the value is already in the encrypted-at-rest format. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt a value for storage. Null/empty passes through (nothing to protect);
 * an already-encrypted value passes through (idempotent, so backfill can
 * re-run); no key configured passes through with one loud warning.
 */
export function encryptAtRest(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return plain ?? null;
  if (isEncrypted(plain)) return plain;
  const key = getKey();
  if (!key) {
    if (!warned) {
      warned = true;
      console.warn(
        "[at-rest] TRUSTLEAF_DATA_KEY no está configurada — el contenido clínico se guarda EN CLARO.",
      );
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypt a stored value. Legacy cleartext (no prefix) passes through, so
 * reads work mid-rollout. An `enc:` value without the key, or with a tampered
 * byte, throws — unreadable data must never masquerade as readable.
 */
export function decryptAtRest(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!isEncrypted(stored)) return stored;
  const key = getKey();
  if (!key) {
    throw new DataKeyError(
      "Hay contenido cifrado en la base pero TRUSTLEAF_DATA_KEY no está configurada.",
    );
  }
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
