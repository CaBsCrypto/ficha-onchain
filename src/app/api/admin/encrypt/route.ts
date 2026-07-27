/**
 * POST /api/admin/encrypt — backfill: encrypt legacy cleartext clinical rows.
 * ---------------------------------------------------------------------------
 * New writes encrypt at the route level; this walks what was already in the
 * database (clinical_entries.summary/detail, clinical_documents.content_base64)
 * and converts cleartext to `enc:v1:…`. Idempotent — encrypted rows are
 * skipped — so re-running is safe, exactly like /api/admin/migrate.
 *
 * Auth: requireAdmin. Guard 2: confirm:'ENCRYPT'. Fails loudly if
 * TRUSTLEAF_DATA_KEY is missing: running a backfill that silently writes
 * cleartext back would be the fail-open pattern this repo keeps burying.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";
import { encryptAtRest, isEncrypted } from "@/lib/crypto/at-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: { confirm?: unknown };
  try { body = (await request.json()) as typeof body; } catch { body = {}; }
  if (body.confirm !== "ENCRYPT") {
    return NextResponse.json({ error: "confirmation_required", hint: "send confirm:'ENCRYPT'" }, { status: 400 });
  }
  if (!process.env.TRUSTLEAF_DATA_KEY) {
    return NextResponse.json(
      { error: "TRUSTLEAF_DATA_KEY no está configurada — no hay con qué cifrar." },
      { status: 500 },
    );
  }

  const sql = getDb();
  const out = { entries: 0, documents: 0, skipped: 0 };

  const entries = await sql<{ id: number; summary: string; detail: string | null }>`
    SELECT id, summary, detail FROM clinical_entries`;
  for (const e of entries) {
    if (isEncrypted(e.summary) && (e.detail == null || isEncrypted(e.detail))) {
      out.skipped++;
      continue;
    }
    await sql`
      UPDATE clinical_entries
      SET summary = ${encryptAtRest(e.summary)}, detail = ${encryptAtRest(e.detail)}
      WHERE id = ${e.id}`;
    out.entries++;
  }

  // Documents one by one — content_base64 can be MBs; no giant IN-memory batch.
  const docs = await sql<{ id: number }>`
    SELECT id FROM clinical_documents WHERE content_base64 NOT LIKE 'enc:v1:%'`;
  for (const d of docs) {
    const [row] = await sql<{ content_base64: string }>`
      SELECT content_base64 FROM clinical_documents WHERE id = ${d.id}`;
    await sql`
      UPDATE clinical_documents
      SET content_base64 = ${encryptAtRest(row.content_base64)}
      WHERE id = ${d.id}`;
    out.documents++;
  }

  return NextResponse.json({ ok: true, encrypted: out });
}
