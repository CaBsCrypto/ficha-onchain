/**
 * /api/patient/grants — the patient manages who may write their on-chain ficha.
 * ---------------------------------------------------------------------------
 * GET   → list the caller's grants (active first), each enriched best-effort
 *         with the DoctorRegistry's on-chain name/authorized flag.
 * POST  { wallet } → grant_write_access on the ClinicalRecord, signed by the
 *         record OWNER (demo patient key) and fee-bumped by the relayer. Falls
 *         back to mode:"simulated" with the reason when no signer is configured
 *         (the accepted pattern of /api/ficha/grant).
 * PATCH { wallet } → revoke_write_access, same signing model; marks the row.
 *
 * Identity always comes from the Privy token (resolveOwnerEmail): there is no
 * way to grant or revoke on someone else's ficha.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { CONTRACT_IDS, STELLAR_EXPERT_TX, isStellarAddress } from "@/lib/stellar/config";
import { grantWriteAccess, revokeWriteAccess, getDemoPatientSecret } from "@/lib/stellar/server";
import { getDoctor } from "@/lib/stellar/client";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GrantRow {
  id: number;
  grantee_wallet: string;
  grantee_name: string | null;
  tx_hash: string | null;
  mode: string;
  revoke_tx_hash: string | null;
  granted_at: string;
  revoked_at: string | null;
}

async function resolveEmail(request: Request) {
  const claimed = new URL(request.url).searchParams.get("patientEmail");
  return resolveOwnerEmail(request, claimed);
}

export async function GET(request: Request) {
  const owner = await resolveEmail(request);
  if ("error" in owner) return owner.error;

  try {
    const sql = getDb();
    const rows = await sql<GrantRow>`
      SELECT id, grantee_wallet, grantee_name, tx_hash, mode,
             revoke_tx_hash, granted_at, revoked_at
      FROM patient_grants
      WHERE LOWER(patient_email) = ${owner.email}
      ORDER BY (revoked_at IS NULL) DESC, granted_at DESC
      LIMIT 100`;

    // Best-effort on-chain enrichment: an unreachable chain must not hide the
    // list, so a failed read just leaves the stored name and verified:false.
    const grants = await Promise.all(
      rows.map(async (r) => {
        let verified = false;
        let name = r.grantee_name;
        try {
          const doc = await getDoctor(r.grantee_wallet);
          if (doc) {
            verified = doc.authorized;
            name = name ?? doc.fullName;
          }
        } catch { /* chain unreachable — keep stored values */ }
        return { ...r, verified, grantee_name: name };
      }),
    );
    return NextResponse.json({ grants });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/grants GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

/** Shared signer step for grant and revoke. */
async function signOnChain(
  fn: typeof grantWriteAccess,
  grantee: string,
): Promise<{ mode: "onchain" | "simulated"; txHash: string | null; reason?: string }> {
  const ownerSecret = getDemoPatientSecret();
  if (!ownerSecret) {
    return {
      mode: "simulated",
      txHash: null,
      reason: "sin firmante del paciente (DEMO_PATIENT_SECRET/RELAYER_SECRET)",
    };
  }
  try {
    const res = await fn({
      ownerSecret,
      contractId: CONTRACT_IDS.clinicalRecordDemo,
      grantee,
    });
    if (res.status === "SUCCESS") return { mode: "onchain", txHash: res.hash };
    return { mode: "simulated", txHash: null, reason: `transacción ${res.status}` };
  } catch (err) {
    return {
      mode: "simulated",
      txHash: null,
      reason: err instanceof Error ? err.message : "fallo on-chain",
    };
  }
}

export async function POST(request: Request) {
  let body: { wallet?: unknown; patientEmail?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const owner = await resolveOwnerEmail(request, String(body.patientEmail ?? "") || null);
  if ("error" in owner) return owner.error;

  const wallet = String(body.wallet ?? "").trim();
  if (!isStellarAddress(wallet)) {
    return NextResponse.json({ error: "wallet inválida (G…)" }, { status: 400 });
  }

  try {
    const sql = getDb();

    const [existing] = await sql`
      SELECT id FROM patient_grants
      WHERE LOWER(patient_email) = ${owner.email}
        AND grantee_wallet = ${wallet} AND revoked_at IS NULL`;
    if (existing) {
      return NextResponse.json({ error: "esa wallet ya tiene acceso" }, { status: 409 });
    }

    // Resolve the doctor's on-chain identity for the stored name + badge.
    let name: string | null = null;
    let verified = false;
    try {
      const doc = await getDoctor(wallet);
      if (doc) { name = doc.fullName; verified = doc.authorized; }
    } catch { /* chain unreachable — grant proceeds unnamed */ }

    const { mode, txHash, reason } = await signOnChain(grantWriteAccess, wallet);
    if (mode === "simulated") {
      console.warn(`[patient/grants] grant degraded to simulated — ${reason ?? "unknown"}`);
    }

    const [row] = await sql`
      INSERT INTO patient_grants (patient_email, grantee_wallet, grantee_name, tx_hash, mode)
      VALUES (${owner.email}, ${wallet}, ${name}, ${txHash}, ${mode})
      RETURNING id, grantee_wallet, grantee_name, tx_hash, mode, granted_at, revoked_at`;

    return NextResponse.json({
      mode,
      reason,
      hash: txHash,
      explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null,
      grant: { ...row, verified },
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/grants POST]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: { wallet?: unknown; patientEmail?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const owner = await resolveOwnerEmail(request, String(body.patientEmail ?? "") || null);
  if ("error" in owner) return owner.error;

  const wallet = String(body.wallet ?? "").trim();
  if (!isStellarAddress(wallet)) {
    return NextResponse.json({ error: "wallet inválida (G…)" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const [existing] = await sql`
      SELECT id FROM patient_grants
      WHERE LOWER(patient_email) = ${owner.email}
        AND grantee_wallet = ${wallet} AND revoked_at IS NULL`;
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { mode, txHash, reason } = await signOnChain(revokeWriteAccess, wallet);
    if (mode === "simulated") {
      console.warn(`[patient/grants] revoke degraded to simulated — ${reason ?? "unknown"}`);
    }

    const [row] = await sql`
      UPDATE patient_grants SET
        revoked_at = NOW(), revoke_tx_hash = ${txHash}, revoke_mode = ${mode}
      WHERE id = ${existing.id}
      RETURNING id, grantee_wallet, grantee_name, revoke_tx_hash, revoked_at`;

    return NextResponse.json({
      mode,
      reason,
      hash: txHash,
      explorer: txHash ? STELLAR_EXPERT_TX(txHash) : null,
      grant: row,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/grants PATCH]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
