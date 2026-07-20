/**
 * GET /api/admin/overview — live snapshot of every domain table.
 * Query: ?token=WAITLIST_ADMIN_TOKEN
 *
 * Read-only observability endpoint for the admin "flujo del sistema" page.
 * Each table is queried independently and degrades to { count: 0, recent: [] }
 * when it does not exist (older Neon branches), so a single missing table never
 * fails the whole response. A hard DB error (no connection) returns 500.
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const sql = getDb();

    const countOf = (rows: Array<{ n: number }>) => rows[0]?.n ?? 0;

    const [
      doctorsCount, doctorsRecent,
      usersCount, usersRecent,
      waitlistCount, waitlistRecent,
      availabilityCount,
      appointmentsCount, appointmentsRecent,
      clinicalCount, clinicalRecent,
      licensesCount, licensesRecent,
      painDiaryCount,
    ] = await Promise.all([
      // doctors
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM doctors`.catch(() => []),
      sql`SELECT id, name, email, specialty, status, created_at
            FROM doctors ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // registered_users
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM registered_users`.catch(() => []),
      sql`SELECT privy_id, email, wallet, created_at
            FROM registered_users ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // waitlist
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM waitlist`.catch(() => []),
      sql`SELECT id, email, created_at
            FROM waitlist ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // doctor_availability (count only)
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM doctor_availability`.catch(() => []),
      // appointments
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM appointments`.catch(() => []),
      sql`SELECT id, doctor_email, patient_email, patient_name, date, time_slot,
                 type, status, consent_tx, consent_mode, meet_link, created_at
            FROM appointments ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // clinical_entries
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM clinical_entries`.catch(() => []),
      sql`SELECT id, patient_wallet, author_wallet AS doctor_wallet, tx_hash, mode, created_at
            FROM clinical_entries ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // medical_licenses
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM medical_licenses`.catch(() => []),
      sql`SELECT id, doctor_email, patient_name, tipo, dias, cie10, status,
                 tx_hash, mode, created_at
            FROM medical_licenses ORDER BY created_at DESC LIMIT 10`.catch(() => []),
      // pain_diary (count only)
      sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM pain_diary`.catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      tables: {
        doctors:         { count: countOf(doctorsCount), recent: doctorsRecent },
        users:           { count: countOf(usersCount), recent: usersRecent },
        waitlist:        { count: countOf(waitlistCount), recent: waitlistRecent },
        availability:    { count: countOf(availabilityCount) },
        appointments:    { count: countOf(appointmentsCount), recent: appointmentsRecent },
        clinicalEntries: { count: countOf(clinicalCount), recent: clinicalRecent },
        licenses:        { count: countOf(licensesCount), recent: licensesRecent },
        painDiary:       { count: countOf(painDiaryCount) },
      },
    });
  } catch (err) {
    console.error("[admin/overview]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
