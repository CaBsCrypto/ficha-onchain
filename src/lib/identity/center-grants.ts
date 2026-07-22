/**
 * Center ↔ patient consent — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * A center may only write a patient's ficha AFTER the patient consents. This is
 * the off-chain mirror of the on-chain grant_write_access, plus the state a
 * center can query. It is keyed by (org_id, rut_hash) — never the raw RUT.
 *
 * CONSENT COMES FROM THE PATIENT, not the center — a center can request consent
 * and check it, but cannot authorize itself. How that resolves depends on env:
 *   - sandbox: toy data on a shared toy contract we own, so a request is
 *     AUTO-APPROVED in mode 'simulated' — this is what makes the hackathon demo
 *     end-to-end. It is clearly labelled simulated; no real person consented.
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

export type GrantStatus = "active" | "pending" | "revoked" | "none";

export interface ConsentState {
  status: GrantStatus;
  mode: "onchain" | "simulated" | null;
  granteeWallet: string | null;
  recordContract: string | null;
  grantTx: string | null;
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
  if (!rows.length) {
    return { status: "none", mode: null, granteeWallet: null, recordContract: null, grantTx: null };
  }
  const r = rows[0];
  return {
    status: r.status,
    mode: r.mode,
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

  // Try a REAL on-chain grant on the sandbox toy record: the sandbox owner signs
  // grant_write_access(centerWallet), fee-bumped by the relayer. Only when fully
  // configured (toy contract deployed + SANDBOX_OWNER_SECRET set) and the grantee
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
 * Revoke a center's active consent for a patient in this env. If the grant was
 * anchored on-chain, revoke it on-chain too (symmetric with requestConsent) so
 * the center's wallet actually loses write access — revocation is the direction
 * that matters most for consent. Best-effort: the DB row is always marked
 * revoked; revoke_tx records the on-chain revoke when it happened.
 */
export async function revokeConsent(args: {
  orgId: number;
  rut: string;
  env: RecordEnv;
}): Promise<{ revoked: boolean; revokeTx: string | null }> {
  const rutHash = hashRut(args.rut);
  const sql = getDb();

  const [g] = await sql<{
    id: number;
    mode: "onchain" | "simulated";
    record_contract: string | null;
    grantee_wallet: string | null;
  }>`
    SELECT id, mode, record_contract, grantee_wallet
    FROM center_grants
    WHERE org_id = ${args.orgId} AND patient_rut_hash = ${rutHash}
      AND env = ${args.env} AND status = 'active'
    LIMIT 1`;
  if (!g) return { revoked: false, revokeTx: null };

  let revokeTx: string | null = null;
  if (g.mode === "onchain" && g.record_contract && g.grantee_wallet && isStellarAddress(g.grantee_wallet)) {
    const ownerSecret = getSandboxOwnerSecret();
    if (ownerSecret) {
      try {
        const res = await revokeWriteAccess({
          ownerSecret,
          contractId: g.record_contract,
          grantee: g.grantee_wallet,
        });
        if (res.status === "SUCCESS") revokeTx = res.hash;
      } catch (e) {
        // Still mark revoked in the DB — never leave consent "active" because
        // the chain hiccuped. Surface it for operators.
        console.error("[center-grants] revoke on-chain falló; se marca revocado en DB igual:", e);
      }
    }
  }

  await sql`
    UPDATE center_grants SET status = 'revoked', revoked_at = NOW(), revoke_tx = ${revokeTx}
    WHERE id = ${g.id}`;
  return { revoked: true, revokeTx };
}
