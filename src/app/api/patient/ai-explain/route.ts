/**
 * POST /api/patient/ai-explain — Plain language explanation for medical terms/results.
 * ---------------------------------------------------------------------------
 * 1. Ownership check (resolveOwnerEmail).
 * 2. Logs opt-in access in `api_access_log` as `ai.explain` under Ley 20.584.
 * 3. Returns plain-language explanation, key takeaway, suggested doctor questions,
 *    and non-negotiable medical disclaimers.
 *
 * Body: { termOrResult: string, context?: string, patientEmail?: string }
 */
import { NextResponse } from "next/server";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";
import { logAccess } from "@/lib/access-log";
import { explainMedicalTermInPlainLanguage } from "@/lib/ai/patient-explainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExplainBody {
  termOrResult?: string;
  context?: string;
  patientEmail?: string;
}

export async function POST(request: Request) {
  let body: ExplainBody;
  try {
    body = (await request.json()) as ExplainBody;
  } catch {
    return NextResponse.json({ error: "cuerpo JSON inválido" }, { status: 400 });
  }

  const termOrResult = body.termOrResult?.trim();
  if (!termOrResult) {
    return NextResponse.json(
      { error: "termOrResult es obligatorio" },
      { status: 400 }
    );
  }

  const auth = await resolveOwnerEmail(request, body.patientEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  // Log Ley 20.584 access event
  logAccess({
    patientEmail,
    accessor: "Claude AI (Explicador)",
    accessorRole: "system",
    action: "ai.explain",
    detail: `Explicación de término médico: "${termOrResult.slice(0, 60)}"`,
  });

  try {
    const explanation = await explainMedicalTermInPlainLanguage({
      termOrResult,
      context: body.context || null,
    });

    return NextResponse.json({
      success: true,
      explanation,
    });
  } catch (err) {
    console.error("[api/patient/ai-explain]", err);
    return NextResponse.json(
      { error: "error al generar la explicación" },
      { status: 500 }
    );
  }
}
