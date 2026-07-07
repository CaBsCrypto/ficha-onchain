/**
 * POST /api/waitlist — join the launch waitlist.
 * ---------------------------------------------------------------------------
 * TrustLeaf is on-chain — there is no database (no Prisma). Signups are appended
 * to a local JSON file at `data/waitlist.json` (created on first write). The
 * email is validated + normalized and duplicates are ignored, so the file holds
 * one entry per address.
 *
 * ⚠️  Production note: a local file only survives on a single, persistent
 * instance. On serverless (Vercel) the filesystem is ephemeral/read-only — swap
 * this for Vercel KV / a Resend broadcast audience once the infra token exists.
 *
 * Body (JSON): { email: string, role?: "doctor" | "patient" }
 * Responses:
 *   200 { success: true }
 *   400 { error }   — malformed / missing email
 *   500 { error }   — could not persist
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { WaitlistEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321 practical maximum for an email address. */
const MAX_EMAIL_LEN = 254;

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "waitlist.json");

async function readStore(): Promise<WaitlistEntry[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WaitlistEntry[]) : [];
  } catch {
    // Missing file or unparseable content → start fresh.
    return [];
  }
}

async function writeStore(entries: WaitlistEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export async function POST(request: Request) {
  let body: { email?: unknown; role?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 },
    );
  }

  const role =
    body.role === "doctor" || body.role === "patient" ? body.role : undefined;

  try {
    const entries = await readStore();
    // Idempotent: a repeat signup returns success without duplicating the entry.
    if (!entries.some((e) => e.email === email)) {
      entries.push({ email, role, createdAt: Date.now() });
      await writeStore(entries);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save your signup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
