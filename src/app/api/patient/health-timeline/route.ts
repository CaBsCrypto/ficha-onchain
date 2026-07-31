/**
 * GET /api/patient/health-timeline — Unified chronological health timeline for the patient.
 * ---------------------------------------------------------------------------
 * Merges clinical entries, attached documents/exams, prescription logs, and
 * provider record requests into a single, unified timeline with provenance tracking
 * (doctor, patient self-upload, AI-assisted) and an AI narrative overview.
 *
 * Query params: ?patientEmail=...
 */
import { NextResponse } from "next/server";
import { dbNotConfiguredResponse } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HealthTimelineEvent {
  id: string;
  type: "entry" | "document" | "prescription" | "request";
  title: string;
  subtitle?: string;
  detail?: string;
  category: string;
  provenance: "doctor" | "patient" | "ai" | "system";
  date: string;
  mode?: string;
  txHash?: string | null;
  rawId: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const claimedEmail = searchParams.get("patientEmail");

  const auth = await resolveOwnerEmail(request, claimedEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  try {
    const sql = getDb();

    // 1. Clinical Entries
    const entries = await sql`
      SELECT id, kind, summary, detail, content_hash, tx_hash, mode, author_wallet, doctor_email, created_at
      FROM clinical_entries
      WHERE patient_email = ${patientEmail}
      ORDER BY created_at DESC LIMIT 50`;

    // 2. Clinical Documents
    const docs = await sql`
      SELECT id, category, title, file_name, mime_type, content_hash, tx_hash, mode, doctor_email, created_at
      FROM clinical_documents
      WHERE patient_email = ${patientEmail}
      ORDER BY created_at DESC LIMIT 50`;

    // 3. Prescriptions Mirror
    const rxs = await sql`
      SELECT id, rx_id, medication, dosage, quantity, prescription_type, doctor_email, created_at
      FROM prescriptions_log
      WHERE patient_email = ${patientEmail}
      ORDER BY created_at DESC LIMIT 50`;

    // 4. Record Requests (Ley 20.584 art. 13)
    const requests = await sql`
      SELECT id, provider_name, status, due_date, created_at
      FROM record_requests
      WHERE patient_email = ${patientEmail}
      ORDER BY created_at DESC LIMIT 50`;

    const timeline: HealthTimelineEvent[] = [];

    // Map entries
    for (const e of entries) {
      const summaryStr = String(e.summary || "");
      const isAi = summaryStr.includes("[IA Auto-aporte]") || String(e.detail || "").includes("Extraído con IA");
      const isSelf = !e.doctor_email || summaryStr.includes("[Auto-aporte]");
      const provenance = isAi ? "ai" : isSelf ? "patient" : "doctor";

      timeline.push({
        id: `entry-${e.id}`,
        type: "entry",
        title: summaryStr.replace(/^\[(IA Auto-aporte|Auto-aporte)\]\s*/, ""),
        subtitle: `Tipo: ${e.kind}${e.doctor_email ? ` · Dr/a. ${e.doctor_email}` : ""}`,
        detail: e.detail ? String(e.detail) : undefined,
        category: String(e.kind || "Registro"),
        provenance,
        date: new Date(e.created_at as string).toISOString(),
        mode: e.mode ? String(e.mode) : undefined,
        txHash: e.tx_hash ? String(e.tx_hash) : null,
        rawId: Number(e.id),
      });
    }

    // Map documents
    for (const d of docs) {
      const isSelf = !d.doctor_email;
      timeline.push({
        id: `doc-${d.id}`,
        type: "document",
        title: String(d.title),
        subtitle: d.category === "self" ? "Documento aportado por el paciente" : `Categoría: ${d.category}`,
        detail: d.file_name ? `Archivo: ${d.file_name}` : undefined,
        category: String(d.category || "Examen"),
        provenance: isSelf ? "patient" : "doctor",
        date: new Date(d.created_at as string).toISOString(),
        mode: d.mode ? String(d.mode) : undefined,
        txHash: d.tx_hash ? String(d.tx_hash) : null,
        rawId: Number(d.id),
      });
    }

    // Map prescriptions
    for (const r of rxs) {
      timeline.push({
        id: `rx-${r.id}`,
        type: "prescription",
        title: `Receta: ${r.medication} ${r.dosage || ""}`,
        subtitle: `Tipo: ${r.prescription_type || "Receta"}${r.doctor_email ? ` · Prescrito por ${r.doctor_email}` : ""}`,
        detail: r.quantity ? `Cantidad: ${r.quantity} unidad(es)` : undefined,
        category: "Receta",
        provenance: "doctor",
        date: new Date(r.created_at as string).toISOString(),
        rawId: Number(r.id),
      });
    }

    // Map requests
    for (const req of requests) {
      timeline.push({
        id: `req-${req.id}`,
        type: "request",
        title: `Solicitud de Ficha: ${req.provider_name}`,
        subtitle: `Estado: ${req.status} · Plazo legal 15 días`,
        detail: req.due_date ? `Vence: ${String(req.due_date).slice(0, 10)}` : undefined,
        category: "Solicitud",
        provenance: "system",
        date: new Date(req.created_at as string).toISOString(),
        rawId: Number(req.id),
      });
    }

    // Sort combined timeline chronologically (latest first)
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Generate narrative overview
    const totalCount = timeline.length;
    const doctorCount = timeline.filter((t) => t.provenance === "doctor").length;
    const patientCount = timeline.filter((t) => t.provenance === "patient" || t.provenance === "ai").length;

    const narrativeSummary =
      totalCount === 0
        ? "Aún no hay registros clínicos en tu línea de tiempo de salud. Puedes subir tus propios exámenes o solicitar tu ficha a tu clínica."
        : `Tu línea de tiempo de salud registra ${totalCount} evento(s) en total (${doctorCount} emitido(s) por profesionales médicos y ${patientCount} aportado(s) por ti). Mantienes tu historial ordenado y anclado on-chain.`;

    return NextResponse.json({
      success: true,
      patientEmail,
      narrativeSummary,
      totalEvents: totalCount,
      events: timeline,
    });
  } catch (err) {
    const dbDown = dbNotConfiguredResponse(err);
    if (dbDown) return dbDown;
    console.error("[api/patient/health-timeline]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
