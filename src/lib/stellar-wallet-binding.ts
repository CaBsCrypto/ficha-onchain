import { randomBytes, randomUUID } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { Sql } from "@/lib/db";
import type { AuthedUser } from "@/lib/auth/privy-auth";
import { BookingPreparationError } from "@/lib/prescription-booking";

/** This first adapter supports detached Ed25519 ownership signatures only.
 * Contract accounts/passkeys require their own verified adapter, never a bypass.
 */
export async function createWalletChallenge(sql: Sql, actor: AuthedUser, wallet: string, role: string) {
  if (!actor.email) throw new BookingPreparationError("verified_email_required", 403);
  if (!StrKey.isValidEd25519PublicKey(wallet) || !["patient", "doctor"].includes(role)) {
    throw new BookingPreparationError("invalid_wallet_or_role", 400);
  }
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
  // An unambiguous domain-separated payload, with an unpredictable challenge.
  // It cannot authorize a Stellar transaction and contains no clinical data.
  const message = JSON.stringify({ domain: "trustleaf:wallet-binding:v1", network: "testnet",
    id, userId: actor.userId, email: actor.email, role, wallet,
    nonce: randomBytes(32).toString("hex"), expiresAt });
  await sql`INSERT INTO stellar_binding_challenges (id, user_id, email, role, wallet, message, expires_at)
    VALUES (${id}, ${actor.userId}, ${actor.email}, ${role}, ${wallet}, ${message}, ${expiresAt})`;
  return { challengeId: id, message, encoding: "utf8", signatureEncoding: "base64", expiresAt,
    network: "testnet", purpose: "wallet_ownership_only" };
}

export async function completeWalletChallenge(sql: Sql, actor: AuthedUser, challengeId: string, signature: string) {
  if (!actor.email) throw new BookingPreparationError("verified_email_required", 403);
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) {
    throw new BookingPreparationError("invalid_signature", 400);
  }
  const [challenge] = await sql`SELECT id, wallet, message FROM stellar_binding_challenges
    WHERE id = ${challengeId} AND user_id = ${actor.userId} AND email = ${actor.email}
      AND consumed_at IS NULL AND expires_at > NOW()`;
  if (!challenge) throw new BookingPreparationError("challenge_expired_or_used", 409);
  let verified = false;
  try {
    verified = Keypair.fromPublicKey(String(challenge.wallet)).verify(
      Buffer.from(String(challenge.message), "utf8"), Buffer.from(signature, "base64"));
  } catch { /* Fail closed for malformed stored values too. */ }
  if (!verified) throw new BookingPreparationError("invalid_signature", 403);
  // Consume and persist in one statement. Racing completions cannot both win.
  // Rebinding requires the same authenticated DID, not email possession alone.
  const rows = await sql`
    WITH consumed AS (
      UPDATE stellar_binding_challenges SET consumed_at = NOW(), verified_signature = ${signature}
      WHERE id = ${challengeId} AND user_id = ${actor.userId} AND email = ${actor.email}
        AND consumed_at IS NULL AND expires_at > NOW()
      RETURNING *
    )
    INSERT INTO stellar_verified_bindings (email, role, user_id, wallet, verification_reference, verified_at)
    SELECT email, role, user_id, wallet, id::text, NOW() FROM consumed
    ON CONFLICT (email, role) DO UPDATE SET wallet = EXCLUDED.wallet,
      verification_reference = EXCLUDED.verification_reference, verified_at = EXCLUDED.verified_at,
      revoked_at = NULL
      WHERE stellar_verified_bindings.user_id = EXCLUDED.user_id
    RETURNING wallet, role
  `;
  if (!rows[0]) throw new BookingPreparationError("challenge_used_or_binding_conflict", 409);
  return { verified: true, wallet: rows[0].wallet, role: rows[0].role, network: "testnet" };
}
