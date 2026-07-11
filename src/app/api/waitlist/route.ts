/**
 * POST /api/waitlist — join the launch waitlist.
 * ---------------------------------------------------------------------------
 * TrustLeaf is on-chain — there is no database (no Prisma). Signups are durably
 * persisted with a layered strategy so nothing is lost on serverless (Vercel),
 * where the filesystem is ephemeral/read-only:
 *
 *   Layer 1 — Resend audience contact (primary durable store). Runs only when
 *             RESEND_API_KEY is set. Uses RESEND_AUDIENCE_ID (default "default").
 *   Layer 2 — Email notification to the founder (always runs when a key exists),
 *             so a signup is never silently lost even if the audience call fails.
 *   Layer 3 — Local `data/waitlist.json` append (best-effort, wrapped so it can
 *             fail silently on read-only filesystems). Useful for local dev.
 *
 * The email is validated + normalized and local-file duplicates are ignored, so
 * the file holds one entry per address.
 *
 * Body (JSON): { email: string, role?: "doctor" | "patient" }
 * Responses:
 *   200 { success: true }
 *   400 { error }   — malformed / missing email
 *   500 { error }   — could not persist anywhere
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

/** Founder address that must always be notified of new signups. */
const FOUNDER_EMAIL = "cabscryptocontacto@gmail.com";
/**
 * Resend requires a verified sender. `onboarding@resend.dev` works out of the
 * box for any account without domain verification, which keeps the notification
 * path functional even before a custom domain is set up.
 */
const NOTIFY_FROM = "TrustLeaf <onboarding@resend.dev>";

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

/**
 * Layer 1 — add the email to a Resend audience (the primary durable store).
 * Throws on non-OK responses so the caller can log/continue.
 */
async function addToResendAudience(
  apiKey: string,
  email: string,
): Promise<void> {
  const audienceId = process.env.RESEND_AUDIENCE_ID || "default";
  const res = await fetch(
    `https://api.resend.com/audiences/${audienceId}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Resend audience add failed (${res.status}): ${await res.text()}`,
    );
  }
}

/**
 * Layer 2 — email the founder so a signup is never silently lost, even if the
 * audience API is misconfigured or errors. Throws on non-OK responses.
 */
async function notifyFounder(
  apiKey: string,
  email: string,
  timestamp: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [FOUNDER_EMAIL],
      subject: "New TrustLeaf waitlist signup",
      text: `New TrustLeaf waitlist signup\n\nEmail: ${email}\nTimestamp: ${timestamp}`,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Resend email notification failed (${res.status}): ${await res.text()}`,
    );
  }
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

  const createdAt = Date.now();
  const apiKey = process.env.RESEND_API_KEY;
  // Tracks whether the signup was durably captured by any layer. If every layer
  // fails we return 500 so the client can retry rather than lose the signup.
  let persisted = false;

  // Layer 1 — Resend audience contact (primary durable store).
  if (apiKey) {
    try {
      await addToResendAudience(apiKey, email);
      persisted = true;
    } catch (err) {
      console.error("[waitlist] audience layer failed:", err);
    }

    // Layer 2 — founder notification. Always attempt this when a key exists, so
    // the founder is notified even if Layer 1 failed above.
    try {
      await notifyFounder(apiKey, email, new Date(createdAt).toISOString());
      persisted = true;
    } catch (err) {
      console.error("[waitlist] notification layer failed:", err);
    }
  }

  // Layer 3 — local JSON file (best-effort; expected to fail on read-only
  // serverless filesystems, so a failure here is not fatal).
  try {
    const entries = await readStore();
    if (!entries.some((e) => e.email === email)) {
      entries.push({ email, role, createdAt });
      await writeStore(entries);
    }
    persisted = true;
  } catch (err) {
    console.error("[waitlist] file layer failed:", err);
  }

  if (!persisted) {
    return NextResponse.json(
      { error: "Could not save your signup" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
