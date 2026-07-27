/**
 * Center ↔ patient consent — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * A center may only write a patient's ficha AFTER the patient consents. This is
 * the off-chain mirror of the on-chain grant_write_access, plus the state a
 * center can query. It is keyed by (org_id, rut_hash) — never the raw RUT.
 *
 * CONSENT COMES FROM THE PATIENT, not the center — a center can request consent
 * and check it, but cannot authorize itself. How that resolves depends on env:
 *   - sandbox: throwaway data on records we own, so a request is AUTO-APPROVED — this
 *     is what makes the hackathon demo end-to-end. NOBODY consented; every
 *     response carries consentSource:'auto_sandbox' to say so. That label is
 *     separate from `mode` on purpose: `mode` flips to 'onchain' as soon as the
 *     grant tx confirms, and the "no human consented" fact must survive that.
 *   - live: a request only ever records status 'pending'; a real patient must
 *     sign the grant out of band (deferred with per-patient provisioning). Live
 *     is disabled by the MCP kill-switch anyway.
 *
 * There is exactly one active grant per (org, patient) — enforced by the partial
 * unique index on center_grants (PR-0c).
 */
import { getDb } from "@/lib/db";
import { hashRut } from "@/lib/identity/rut";
import { ensureSandboxRecord, resolvePatientRecord, type RecordEnv } from "@/lib/identity/patient-records";
import { grantWriteAccess, revokeWriteAccess, getSandboxOwnerSecret } from "@/lib/stellar/server";
import { isStellarAddress } from "@/lib/stellar/config";

/**
 * The center's signing wallet is missing or invalid, so a consent cannot be
 * granted to anyone. The message is caller-safe (no secrets, no SQL) — the MCP
 * route forwards it to the integrator instead of an opaque internal error.
 */
export class SignerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignerUnavailableError";
  }
}

export type GrantStatus = "active" | "pending" | "revoked" | "none";

/**
 * WHO actually consented. Independent of `mode` (which only says whether the
 * grant reached the chain) and of `status`. In sandbox no human is ever asked,
 * and that must be legible in every response — including the ones that carry a
 * real txUrl, which is exactly where it is easiest to mistake for the real thing.
 */
export type ConsentSource = "auto_sandbox" | "patient_signature";

/** What actually happened to the center's on-chain write access on revoke. */
export type OnchainRevoke = "done" | "skipped_shared_wallet" | "unconfigured" | "failed";

export interface ConsentState {
  status: GrantStatus;
  mode: "onchain" | "simulated" | null;
  consentSource: ConsentSource;
  granteeWallet: string | null;
  recordContract: string | null;
  grantTx: string | null;
}

/** Sandbox grants are machine-issued; live ones require the patient to sign. */
export function consentSourceFor(env: RecordEnv): ConsentSource {
  return env === "sandbox" ? "auto_sandbox" : "patient_signature";
}

/**
 * Current consent state for a center over a patient IN A GIVEN ENV. env is part
 * of the WHERE on purpose: a sandbox consent (auto-approved, no real signature)
 * must never be reported as valid for a live check.
 */
export async function checkConsent(args: {
  orgId: number;
  rut: string;
  env: RecordEnv;
}): Promise<ConsentState> {
  const rutHash = hashRut(args.rut);
  const sql = getDb();
  const rows = await sql<{
    status: GrantStatus;
    mode: "onchain" | "simulated";
    grantee_wallet: string | null;
    record_contract: string | null;
    grant_tx: string | null;
  }>`
    SELECT status, mode, grantee_wallet, record_contract, grant_tx
    FROM center_grants
    WHERE org_id = ${args.orgId} AND patient_rut_hash = ${rutHash} AND env = ${args.env}
    ORDER BY (status = 'active') DESC, created_at DESC
    LIMIT 1`;
  const consentSource = consentSourceFor(args.env);
  if (!rows.length) {
    return { status: "none", mode: null, consentSource, granteeWallet: null, recordContract: null, grantTx: null };
  }
  const r = rows[0];
  return {
    status: r.status,
    mode: r.mode,
    consentSource,
    granteeWallet: r.grantee_wallet,
    recordContract: r.record_contract,
    grantTx: r.grant_tx,
  };
}

/**
 * True when the center holds an ACTIVE grant for the patient in THIS env. `env`
 * is required — an eventual write gate must never accept a sandbox grant as
 * authorization for a live write.
 */
export async function hasActiveConsent(
  orgId: number,
  rut: string,
  env: RecordEnv,
): Promise<boolean> {
  const rutHash = hashRut(rut);
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM center_grants
    WHERE org_id = ${orgId} AND patient_rut_hash = ${rutHash}
      AND env = ${env} AND status = 'active'
    LIMIT 1`;
  return rows.length > 0;
}

/**
 * Request consent for a center to write a patient's ficha. Sandbox auto-approves
 * (simulated); live records 'pending'. Idempotent per (org, patient): a second
 * sandbox request just refreshes the active row.
 */
export async function requestConsent(args: {
  orgId: number;
  granteeWallet: string | null;
  rut: string;
  env: RecordEnv;
}): Promise<ConsentState> {
  // A grant IS "this wallet may write" — center_grants.grantee_wallet is NOT
  // NULL by design. Without a wallet there is nothing to consent to, so fail
  // closed with a clear reason instead of letting the INSERT hit the constraint
  // and surface as an opaque 500. Seen in prod: a malformed
  // SANDBOX_CENTER_SECRET made key-creation store the org with signing_wallet
  // null, and every request_consent after that crashed here.
  if (!args.granteeWallet || !isStellarAddress(args.granteeWallet)) {
    throw new SignerUnavailableError(
      "El centro no tiene una wallet firmante configurada, así que no hay a quién otorgar el acceso. " +
        "En sandbox esto significa que SANDBOX_CENTER_SECRET falta o es inválido en el servidor; " +
        "el consentimiento NO quedó registrado.",
    );
  }

  const rutHash = hashRut(args.rut);
  const sql = getDb();

  // Resolve (and, in sandbox, provision) the patient's record so the grant is
  // tied to a concrete contract.
  const record =
    args.env === "sandbox"
      ? await ensureSandboxRecord(args.rut)
      : await resolvePatientRecord(args.rut, args.env);
  const recordContract = record?.contractId ?? null;

  const status: GrantStatus = args.env === "sandbox" ? "active" : "pending";

  // Try a REAL on-chain grant on the patient's sandbox record: its owner signs
  // grant_write_access(centerWallet), fee-bumped by the relayer. Only when fully
  // configured (record provisioned + SANDBOX_OWNER_SECRET set) and the grantee
  // is a real G-address. Anything missing or any failure → mode:"simulated", so
  // the flow never breaks and nothing degrades silently into a wrong state.
  let mode: "onchain" | "simulated" = "simulated";
  let grantTx: string | null = null;
  if (
    args.env === "sandbox" &&
    recordContract &&
    args.granteeWallet &&
    isStellarAddress(args.granteeWallet)
  ) {
    const ownerSecret = getSandboxOwnerSecret();
    if (ownerSecret) {
      try {
        const res = await grantWriteAccess({
          ownerSecret,
          contractId: recordContract,
          grantee: args.granteeWallet,
        });
        if (res.status === "SUCCESS") {
          mode = "onchain";
          grantTx = res.hash;
        }
      } catch (e) {
        // Keep simulated — a demo must not fail because the chain hiccuped — but
        // log so a sandbox that "should" anchor and never does is not invisible.
        console.error("[center-grants] grant on-chain falló, degradando a simulated:", e);
      }
    }
  }

  // One ACTIVE grant per (org, patient, env), done atomically so two concurrent
  // requests can't both insert and trip the partial unique index (23505). The
  // ON CONFLICT target MUST match the partial index predicate.
  //
  // On a re-request we NEVER downgrade real provenance: if this attempt did not
  // anchor on-chain, keep the stored mode/grant_tx (a live grant stays proven).
  // created_at is left untouched so the original consent timestamp survives.
  await sql`
    INSERT INTO center_grants
      (org_id, patient_rut_hash, env, record_contract, grantee_wallet, status, mode, grant_tx)
    VALUES
      (${args.orgId}, ${rutHash}, ${args.env}, ${recordContract}, ${args.granteeWallet}, ${status}, ${mode}, ${grantTx})
    ON CONFLICT (org_id, patient_rut_hash, env) WHERE status = 'active'
      DO UPDATE SET
        record_contract = EXCLUDED.record_contract,
        grantee_wallet  = EXCLUDED.grantee_wallet,
        mode = CASE WHEN EXCLUDED.mode = 'onchain' THEN 'onchain' ELSE center_grants.mode END,
        grant_tx = COALESCE(EXCLUDED.grant_tx, center_grants.grant_tx),
        revoked_at = NULL`;

  // Return the AUTHORITATIVE persisted state (provenance may have been preserved
  // above), not just this attempt's outcome.
  return checkConsent({ orgId: args.orgId, rut: args.rut, env: args.env });
}

/**
 * Revoke a center's active consent for a patient in this env. Symmetric with
 * requestConsent: the center's wallet should actually lose write access, since
 * revocation is the direction that matters most for consent.
 *
 * The DB row is ALWAYS marked revoked (never leave consent "active" because the
 * chain hiccuped). The on-chain revoke is conditional — write_access is keyed by
 * WALLET and sandbox orgs share one, so pulling it unconditionally would cut
 * every other org holding a grant through that same wallet. We only pull it when
 * this was the last active grant on that (contract, wallet) pair.
 *
 * `onchainRevoke` reports which of those actually happened, because "revoked"
 * alone would imply the key can no longer write:
 *   done                  — revoked on-chain, see revokeTx
 *   skipped_shared_wallet — another org still holds a grant through this wallet
 *   unconfigured          — no owner secret / no contract; nothing to revoke with
 *   failed                — we tried and the chain refused or errored
 * Only "done" means the wallet lost write access.
 */
export async function revokeConsent(args: {
  orgId: number;
  rut: string;
  env: RecordEnv;
}): Promise<{
  revoked: boolean;
  revokeTx: string | null;
  onchainRevoke: OnchainRevoke | null;
  onchainAccessRemains: boolean;
}> {
  const rutHash = hashRut(args.rut);
  const sql = getDb();

  // Revoke in the DB FIRST, atomically. Two reasons the order matters:
  //   · `AND status = 'active'` + RETURNING makes a double revoke a no-op — only
  //     one concurrent caller gets the row.
  //   · The "last one out turns off the light" count below must run AFTER this
  //     row is already inactive. Counting first is a TOCTOU: two concurrent
  //     revokes would each see the other still active, both skip the on-chain
  //     revoke, and leave the wallet with write access and zero active grants.
  const [g] = await sql<{
    id: number;
    record_contract: string | null;
    grantee_wallet: string | null;
  }>`
    UPDATE center_grants SET status = 'revoked', revoked_at = NOW()
    WHERE org_id = ${args.orgId} AND patient_rut_hash = ${rutHash}
      AND env = ${args.env} AND status = 'active'
    RETURNING id, record_contract, grantee_wallet`;
  if (!g) return { revoked: false, revokeTx: null, onchainRevoke: null, onchainAccessRemains: false };

  // write_access is keyed by WALLET, and every sandbox org defaults to the same
  // custodial signing wallet — so pulling it while another org still holds a
  // grant through that wallet would silently cut them off too.
  const [sharing] = await sql<{ n: number }>`
    SELECT COUNT(*)::int AS n FROM center_grants
    WHERE record_contract = ${g.record_contract} AND grantee_wallet = ${g.grantee_wallet}
      AND env = ${args.env} AND status = 'active'`;
  const walletStillGranted = (sharing?.n ?? 0) > 0;

  let revokeTx: string | null = null;
  let onchainRevoke: OnchainRevoke;
  if (walletStillGranted) {
    onchainRevoke = "skipped_shared_wallet";
  } else if (!g.record_contract || !g.grantee_wallet || !isStellarAddress(g.grantee_wallet)) {
    onchainRevoke = "unconfigured";
  } else {
    const ownerSecret = getSandboxOwnerSecret();
    if (!ownerSecret) {
      onchainRevoke = "unconfigured";
    } else {
      try {
        const res = await revokeWriteAccess({
          ownerSecret,
          contractId: g.record_contract,
          grantee: g.grantee_wallet,
        });
        if (res.status === "SUCCESS") {
          revokeTx = res.hash;
          onchainRevoke = "done";
        } else {
          onchainRevoke = "failed";
          console.error(`[center-grants] revoke tx ${res.hash ?? "?"} no confirmó (${res.status})`);
        }
      } catch (e) {
        // The DB row stays revoked — never leave consent "active" because the
        // chain hiccuped — but say out loud that the key can still write.
        onchainRevoke = "failed";
        console.error("[center-grants] revoke on-chain falló; se marca revocado en DB igual:", e);
      }
    }
  }

  if (revokeTx) await sql`UPDATE center_grants SET revoke_tx = ${revokeTx} WHERE id = ${g.id}`;
  return {
    revoked: true,
    revokeTx,
    onchainRevoke,
    // Anything but a confirmed on-chain revoke means the wallet may still write.
    onchainAccessRemains: onchainRevoke !== "done",
  };
}
