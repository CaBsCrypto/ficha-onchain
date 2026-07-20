/**
 * ⚠️  DESTRUCTIVE — DEV-ONLY.  POST /api/admin/reset
 *
 * Wipes DEMO/TEST rows from the dev database so the admin can re-run the
 * end-to-end flow from a clean slate. This DELETEs rows (never DROPs tables,
 * never touches the schema) and is guarded twice: a valid admin token AND an
 * explicit confirm:"RESET". Point DATABASE_URL at a Neon *dev branch* before
 * calling — running this against production erases live data.
 *
 * Body JSON: { token, confirm: "RESET", scope?: "transactional" | "all" }
 *   - "transactional" (default): per-run flow tables only; doctors,
 *     registered_users and waitlist are PRESERVED.
 *   - "all": additionally clears doctors, registered_users, waitlist.
 *
 * Table names are interpolated into raw SQL, so they come ONLY from the
 * hardcoded whitelists below — never from the request body — to avoid
 * SQL injection.
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-run flow tables — safe to wipe between end-to-end runs.
const TRANSACTIONAL_TABLES = [
  "appointments",
  "medical_licenses",
  "clinical_entries",
  "doctor_availability",
  "doctor_time_off",
  "pain_diary",
  "patient_health_records",
] as const;

// Only cleared additionally when scope === "all".
const ALL_EXTRA_TABLES = [
  "doctors",
  "registered_users",
  "waitlist",
] as const;

export async function POST(request: Request) {
  // Guard 1: admin authorization.
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { confirm?: unknown; scope?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Guard 2: explicit confirmation — prevents accidental wipes.
  if (body.confirm !== "RESET") {
    return NextResponse.json(
      { error: "confirmation_required", hint: "send confirm:'RESET'" },
      { status: 400 },
    );
  }

  const scope: "transactional" | "all" = body.scope === "all" ? "all" : "transactional";
  const targets: string[] =
    scope === "all"
      ? [...TRANSACTIONAL_TABLES, ...ALL_EXTRA_TABLES]
      : [...TRANSACTIONAL_TABLES];

  let sql;
  try {
    sql = getDb();
  } catch (err) {
    console.error("[admin/reset]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const cleared: string[] = [];
  const skipped: string[] = [];

  for (const t of targets) {
    try {
      // t comes only from the hardcoded whitelists above, never from the body.
      await sql.query("DELETE FROM " + t);
      cleared.push(t);
    } catch (err) {
      console.error(`[admin/reset] skip ${t}`, err);
      skipped.push(t);
    }
  }

  return NextResponse.json({ ok: true, scope, cleared, skipped });
}
