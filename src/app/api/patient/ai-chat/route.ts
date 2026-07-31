/**
 * POST /api/patient/ai-chat — Conversational RAG Chat over Patient Record.
 * ---------------------------------------------------------------------------
 * 1. Checks patient ownership (resolveOwnerEmail).
 * 2. Logs opt-in RAG query in `api_access_log` as `ai.chat` (Ley 20.584).
 * 3. Fetches patient context and generates cited RAG response.
 *
 * Body: { message: string, history?: ChatMessage[], patientEmail?: string }
 */
import { NextResponse } from "next/server";
import { getDb, DbNotConfiguredError } from "@/lib/db";
import { resolveOwnerEmail } from "@/lib/auth/privy-auth";
import { logAccess } from "@/lib/access-log";
import { answerPatientQueryWithRAG, type ChatMessage } from "@/lib/ai/record-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  message?: string;
  history?: ChatMessage[];
  patientEmail?: string;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "cuerpo JSON inválido" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "message es obligatorio" }, { status: 400 });
  }

  const auth = await resolveOwnerEmail(request, body.patientEmail);
  if ("error" in auth) return auth.error;

  const patientEmail = auth.email;

  // Log Ley 20.584 access event
  logAccess({
    patientEmail,
    accessor: "Claude AI (Chat Ficha)",
    accessorRole: "system",
    action: "ai.chat",
    detail: `Consulta RAG: "${message.slice(0, 60)}"`,
  });

  try {
    const ragResponse = await answerPatientQueryWithRAG({
      patientEmail,
      query: message,
      history: body.history || [],
    });

    return NextResponse.json({
      success: true,
      ...ragResponse,
    });
  } catch (err) {
    if (err instanceof DbNotConfiguredError) {
      return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
    }
    console.error("[api/patient/ai-chat]", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
