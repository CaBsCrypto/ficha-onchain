/**
 * GET /api/admin/activity?token=X  — unified global activity feed
 * ---------------------------------------------------------------------------
 * There is no dedicated audit table; instead this derives a single
 * chronological timeline from the `created_at` (and `started_at`) columns that
 * every domain table already carries. Each source contributes one or more
 * event kinds; all are merged and sorted newest-first.
 *
 * Auth: ?token=WAITLIST_ADMIN_TOKEN (same as the other admin routes).
 *
 * Response 200:
 *   { ok:true, generatedAt:string, count:number, events: ActivityEvent[] }
 *
 * ActivityEvent = {
 *   ts:      string            // ISO timestamp of the movement
 *   kind:    string            // e.g. "doctor.registered", "ficha.appended"
 *   title:   string            // human summary (es-CL)
 *   detail?: string
 *   actor?:  string            // email / wallet responsible
 *   tx_hash?: string           // Stellar tx (on-chain events)
 *   mode?:   string            // "onchain" | "simulated"
 *   table:   string            // source table
 * }
 */
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ActivityEvent {
  ts: string;
  kind: string;
  title: string;
  detail?: string;
  actor?: string;
  tx_hash?: string;
  mode?: string;
  table: string;
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  try { return new Date(v as string).toISOString(); } catch { return null; }
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  // Per-source LIMIT keeps any single table from flooding the feed; the merged
  // result is re-capped below. Tune with ?limit= (default 200 total).
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 200, 500);

  try {
    const sql = getDb();
    const events: ActivityEvent[] = [];

    // ── Doctors registered ────────────────────────────────────────────────
    for (const r of await sql`
      SELECT name, email, specialty, status, created_at
      FROM doctors ORDER BY created_at DESC LIMIT 100
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      const st = r.status as string;
      events.push({
        ts, kind: "doctor.registered", table: "doctors",
        title: st === "pending"
          ? `Médico solicitó acceso: ${r.name}`
          : `Médico registrado: ${r.name}`,
        detail: [r.specialty, st === "active" ? "activo" : st === "pending" ? "pendiente de aprobación" : "bloqueado"]
          .filter(Boolean).join(" · "),
        actor: r.email as string,
      });
    }

    // ── Users registered ──────────────────────────────────────────────────
    for (const r of await sql`
      SELECT email, wallet, created_at
      FROM registered_users ORDER BY created_at DESC LIMIT 100
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "user.registered", table: "registered_users",
        title: "Usuario registrado",
        detail: r.wallet ? `wallet ${String(r.wallet).slice(0, 6)}…${String(r.wallet).slice(-4)}` : "sin wallet",
        actor: (r.email as string) ?? undefined,
      });
    }

    // ── Waitlist joins ────────────────────────────────────────────────────
    for (const r of await sql`
      SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 100
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "waitlist.joined", table: "waitlist",
        title: "Se unió a la waitlist", actor: r.email as string,
      });
    }

    // ── Appointments: booking + consent (two events per row) ──────────────
    for (const r of await sql`
      SELECT id, doctor_email, patient_email, patient_name, date, time_slot, type,
             status, started_at, consent_tx, consent_mode, created_at
      FROM appointments ORDER BY created_at DESC LIMIT 200
    `.catch(() => [])) {
      const booked = iso(r.created_at);
      if (booked) {
        events.push({
          ts: booked, kind: "appointment.created", table: "appointments",
          title: `Reserva de hora: ${r.patient_name ?? r.patient_email ?? "paciente"}`,
          detail: [r.date, r.time_slot, r.type].filter(Boolean).join(" · "),
          actor: (r.patient_email as string) ?? undefined,
        });
      }
      const consent = iso(r.started_at);
      if (consent && r.consent_tx) {
        events.push({
          ts: consent, kind: "consent.granted", table: "appointments",
          title: "Consentimiento otorgado (ficha autorizada)",
          detail: `paciente ${r.patient_name ?? r.patient_email ?? ""}`.trim(),
          actor: (r.patient_email as string) ?? undefined,
          tx_hash: r.consent_tx as string,
          mode: (r.consent_mode as string) ?? undefined,
        });
      }
    }

    // ── Clinical entries (ficha) appended ─────────────────────────────────
    for (const r of await sql`
      SELECT id, patient_email, kind, summary, tx_hash, mode, doctor_email, created_at
      FROM clinical_entries ORDER BY created_at DESC LIMIT 200
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "ficha.appended", table: "clinical_entries",
        title: "Ficha clínica actualizada",
        detail: [r.kind, r.summary].filter(Boolean).join(": ").slice(0, 120) || undefined,
        actor: (r.doctor_email as string) ?? (r.patient_email as string) ?? undefined,
        tx_hash: (r.tx_hash as string) ?? undefined,
        mode: (r.mode as string) ?? undefined,
      });
    }

    // ── Medical licenses issued ───────────────────────────────────────────
    for (const r of await sql`
      SELECT id, doctor_email, patient_name, tipo, dias, status, tx_hash, mode, created_at
      FROM medical_licenses ORDER BY created_at DESC LIMIT 200
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "license.issued", table: "medical_licenses",
        title: `Licencia médica: ${r.patient_name ?? "paciente"}`,
        detail: [r.tipo, r.dias ? `${r.dias} días` : null, r.status].filter(Boolean).join(" · "),
        actor: (r.doctor_email as string) ?? undefined,
        tx_hash: (r.tx_hash as string) ?? undefined,
        mode: (r.mode as string) ?? undefined,
      });
    }

    // ── Prescriptions issued (off-chain mirror of the on-chain receta) ────
    for (const r of await sql`
      SELECT rx_id, tx_hash, mode, patient_email, patient_name, doctor_email,
             medication, dosage, quantity, created_at
      FROM prescriptions_log ORDER BY created_at DESC LIMIT 200
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "prescription.issued", table: "prescriptions_log",
        title: `Receta emitida: ${r.medication ?? "medicamento"}`,
        detail: [r.dosage, r.quantity ? `${r.quantity} u.` : null, r.patient_name]
          .filter(Boolean).join(" · ") || undefined,
        actor: (r.doctor_email as string) ?? (r.patient_email as string) ?? undefined,
        tx_hash: (r.tx_hash as string) ?? undefined,
        mode: (r.mode as string) ?? undefined,
      });
    }

    // ── Clinical documents (exams / labs / imaging) uploaded ──────────────
    for (const r of await sql`
      SELECT id, patient_email, doctor_email, category, title, tx_hash, mode, created_at
      FROM clinical_documents ORDER BY created_at DESC LIMIT 200
    `.catch(() => [])) {
      const ts = iso(r.created_at); if (!ts) continue;
      events.push({
        ts, kind: "document.uploaded", table: "clinical_documents",
        title: `Examen adjuntado: ${r.category ?? "Examen"}`,
        detail: (r.title as string) ?? undefined,
        actor: (r.doctor_email as string) ?? (r.patient_email as string) ?? undefined,
        tx_hash: (r.tx_hash as string) ?? undefined,
        mode: (r.mode as string) ?? undefined,
      });
    }

    // ── Antecedentes (structured health record) updated ───────────────────
    for (const r of await sql`
      SELECT patient_email, full_name, updated_at
      FROM patient_health_records ORDER BY updated_at DESC LIMIT 200
    `.catch(() => [])) {
      const ts = iso(r.updated_at); if (!ts) continue;
      events.push({
        ts, kind: "antecedentes.updated", table: "patient_health_records",
        title: "Antecedentes clínicos actualizados",
        detail: (r.full_name as string) ?? undefined,
        actor: (r.patient_email as string) ?? undefined,
      });
    }

    // ── Pain-diary entries ────────────────────────────────────────────────
    // NB: the column is `saved_at`, not `created_at` — the old query selected a
    // non-existent column, silently caught, and pain logs never reached the feed.
    for (const r of await sql`
      SELECT privy_id, date, entries, saved_at FROM pain_diary
      ORDER BY saved_at DESC LIMIT 100
    `.catch(() => [])) {
      const ts = iso(r.saved_at); if (!ts) continue;
      const n = Array.isArray(r.entries) ? r.entries.length : 0;
      events.push({
        ts, kind: "pain.logged", table: "pain_diary",
        title: "Registro de diario de dolor",
        detail: [r.date, n ? `${n} zona${n === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || undefined,
        actor: (r.privy_id as string) ?? undefined,
      });
    }

    // Merge: newest first, capped.
    events.sort((a, b) => b.ts.localeCompare(a.ts));
    const capped = events.slice(0, limit);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      count: capped.length,
      events: capped,
    });
  } catch (err) {
    console.error("[admin/activity]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
