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

export type GrantStatus = "active" | "pending" | "revoked" | "none";

export interface ConsentState {
  status: GrantStatus;
  mode: "onchain" | "simulated" | null;
  granteeWallet: string | null;
  recordContract: string | null;
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
  }>`
    SELECT status, mode, grantee_wallet, record_contract
    FROM center_grants
    WHERE org_id = ${args.orgId} AND patient_rut_hash = ${rutHash} AND env = ${args.env}
    ORDER BY (status = 'active') DESC, created_at DESC
    LIMIT 1`;
  if (!rows.length) {
    return { status: "none", mode: null, granteeWallet: null, recordContract: null };
  }
  const r = rows[0];
  return {
    status: r.status,
    mode: r.mode,
    granteeWallet: r.grantee_wallet,
    recordContract: r.record_contract,
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
  const mode = "simulated"; // real on-chain grant lands with per-patient deploy

  // One ACTIVE grant per (org, patient, env), done atomically so two concurrent
  // requests can't both insert and trip the partial unique index (23505). The
  // ON CONFLICT target MUST match the partial index predicate. A re-request just
  // refreshes the active row; a request after a revoke inserts a fresh one
  // (revoked rows stay as history and are outside the partial index).
  await sql`
    INSERT INTO center_grants
      (org_id, patient_rut_hash, env, record_contract, grantee_wallet, status, mode)
    VALUES
      (${args.orgId}, ${rutHash}, ${args.env}, ${recordContract}, ${args.granteeWallet}, ${status}, ${mode})
    ON CONFLICT (org_id, patient_rut_hash, env) WHERE status = 'active'
      DO UPDATE SET
        record_contract = EXCLUDED.record_contract,
        grantee_wallet  = EXCLUDED.grantee_wallet,
        mode            = EXCLUDED.mode,
        created_at      = NOW(),
        revoked_at      = NULL`;

  return { status, mode, granteeWallet: args.granteeWallet, recordContract };
}

/** Revoke a center's active consent for a patient in this env. No-op if none. */
export async function revokeConsent(args: {
  orgId: number;
  rut: string;
  env: RecordEnv;
}): Promise<{ revoked: boolean }> {
  const rutHash = hashRut(args.rut);
  const sql = getDb();
  const rows = await sql`
    UPDATE center_grants SET status = 'revoked', revoked_at = NOW()
    WHERE org_id = ${args.orgId} AND patient_rut_hash = ${rutHash}
      AND env = ${args.env} AND status = 'active'
    RETURNING id`;
  return { revoked: rows.length > 0 };
}
