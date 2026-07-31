/**
 * /api/patient/record-requests — solicitud de copia de ficha clínica.
 * ---------------------------------------------------------------------------
 * Ley 20.584 art. 13: el paciente tiene derecho a pedir copia de su ficha a
 * cualquier prestador, que debe entregarla dentro del plazo legal (15 días
 * hábiles — ver src/lib/dias-habiles.ts). Este endpoint guarda el ciclo de
 * vida de esa solicitud: borrador → enviada → respondida/cerrada.
 *
 * GET   → lista las solicitudes propias, más recientes primero.
 * POST  { providerName, providerEmail? } → crea un borrador con la carta
 *        formal generada (citando la ley, el plazo y la Superintendencia).
 * PATCH { id, status } → 'sent' fija sent_at y calcula due_at (15 días
 *        hábiles); 'responded'/'closed' solo cambian el estado.
 *
 * Identidad SIEMPRE del token Privy (resolveOwnerEmail); el fallback demo
 * sigue el mismo flag de enforcement que el resto de patient/*.
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";
import { dueDateFromSent, PLAZO_LEGAL_DIAS_HABILES } from "@/lib/dias-habiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RequestRow {
  id: number;
  provider_name: string;
  provider_email: string | null;
  request_text: string;
  status: string;
  sent_at: string | null;
  due_at: string | null;
  created_at: string;
}

/**
 * Carta formal de solicitud. El nombre del paciente es su email cuando no
 * hay nombre en el perfil — el prestador identifica al titular por los datos
 * que el propio paciente complete antes de enviar.
 */
function buildRequestText(patientName: string, providerName: string): string {
  const fecha = new Date().toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    `Santiago, ${fecha}`,
    ``,
    `Señores`,
    `${providerName}`,
    `Presente`,
    ``,
    `De mi consideración:`,
    ``,
    `Yo, ${patientName}, en mi calidad de paciente y titular de mi información de salud, vengo en solicitar formalmente copia íntegra de mi ficha clínica, en conformidad con el artículo 13 de la Ley N° 20.584, que regula los derechos y deberes que tienen las personas en relación con acciones vinculadas a su atención en salud.`,
    ``,
    `Dicha norma establece que el prestador debe entregar copia de la ficha clínica, o de los datos que en ella se contengan, a solicitud del titular. Solicito que la entrega se realice dentro del plazo legal de ${PLAZO_LEGAL_DIAS_HABILES} días hábiles contados desde la recepción de esta solicitud, en formato digital o impreso.`,
    ``,
    `En caso de no obtener respuesta dentro del plazo señalado, me reservo el derecho de presentar un reclamo ante la Superintendencia de Salud (www.superdesalud.gob.cl), organismo competente para fiscalizar el cumplimiento de la Ley N° 20.584.`,
    ``,
    `Agradeciendo su gestión, saluda atentamente,`,
    ``,
    `${patientName}`,
  ].join("\n");
}

const VALID_STATUSES = ["sent", "responded", "closed"] as const;
type PatchStatus = (typeof VALID_STATUSES)[number];

export async function GET(request: Request) {
  const claimed = new URL(request.url).searchParams.get("patientEmail");
  const owner = await resolveOwnerEmail(request, claimed);
  if ("error" in owner) return owner.error;

  try {
    const sql = getDb();
    const rows = await sql<RequestRow>`
      SELECT id, provider_name, provider_email, request_text, status,
             sent_at, due_at, created_at
      FROM record_requests
      WHERE LOWER(patient_email) = ${owner.email.toLowerCase()}
      ORDER BY created_at DESC
      LIMIT 100`;
    return NextResponse.json({ requests: rows });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/record-requests GET]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { providerName?: unknown; providerEmail?: unknown; patientName?: unknown; patientEmail?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const owner = await resolveOwnerEmail(request, String(body.patientEmail ?? "") || null);
  if ("error" in owner) return owner.error;

  const providerName = String(body.providerName ?? "").trim();
  if (!providerName || providerName.length > 200) {
    return NextResponse.json({ error: "providerName requerido (máx. 200)" }, { status: 400 });
  }
  const providerEmail = String(body.providerEmail ?? "").trim().toLowerCase() || null;
  if (providerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providerEmail)) {
    return NextResponse.json({ error: "providerEmail inválido" }, { status: 400 });
  }
  const patientName = String(body.patientName ?? "").trim() || owner.email;

  const requestText = buildRequestText(patientName, providerName);

  try {
    const sql = getDb();
    const [row] = await sql<RequestRow>`
      INSERT INTO record_requests (patient_email, provider_name, provider_email, request_text, status)
      VALUES (${owner.email}, ${providerName}, ${providerEmail}, ${requestText}, 'draft')
      RETURNING id, provider_name, provider_email, request_text, status, sent_at, due_at, created_at`;
    return NextResponse.json({ request: row });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/record-requests POST]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let body: { id?: unknown; status?: unknown; patientEmail?: unknown };
  try { body = (await request.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const owner = await resolveOwnerEmail(request, String(body.patientEmail ?? "") || null);
  if ("error" in owner) return owner.error;

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const status = String(body.status ?? "") as PatchStatus;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "status inválido (sent|responded|closed)" }, { status: 400 });
  }

  try {
    const sql = getDb();
    const [existing] = await sql<{ id: number; status: string }>`
      SELECT id, status FROM record_requests
      WHERE id = ${id} AND LOWER(patient_email) = ${owner.email.toLowerCase()}`;
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    let row: RequestRow;
    if (status === "sent") {
      if (existing.status !== "draft") {
        return NextResponse.json({ error: "solo un borrador puede marcarse como enviado" }, { status: 409 });
      }
      const sentAt = new Date();
      const dueAt = dueDateFromSent(sentAt); // 15 días hábiles (L-V)
      [row] = await sql<RequestRow>`
        UPDATE record_requests
        SET status = 'sent', sent_at = ${sentAt.toISOString()}, due_at = ${dueAt.toISOString()}
        WHERE id = ${id}
        RETURNING id, provider_name, provider_email, request_text, status, sent_at, due_at, created_at`;
    } else {
      [row] = await sql<RequestRow>`
        UPDATE record_requests SET status = ${status}
        WHERE id = ${id}
        RETURNING id, provider_name, provider_email, request_text, status, sent_at, due_at, created_at`;
    }
    return NextResponse.json({ request: row });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[patient/record-requests PATCH]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
