/**
 * POST /api/documents/share — generate a 15-minute share token for a document.
 * ---------------------------------------------------------------------------
 * Body: { docId: string, recipient: string }
 *
 * Returns a signed HS256 JWT (same pattern as /api/share for prescriptions).
 * The token encodes docId + recipient; the /verify page uses it to fetch
 * GET /api/public/document/[id] without exposing the document id in a plain URL.
 *
 * Response: { data: { token, url, expiresInSeconds } }
 */
import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getDocument } from "@/lib/stellar/documents";
import { isStellarAddress } from "@/lib/stellar/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARE_TTL_SECONDS = 900; // 15 minutes

interface ShareBody {
  docId?: string;
  recipient?: string;
}

export async function POST(request: Request) {
  let body: ShareBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const docId = String(body.docId ?? "").trim();
  const recipient = (body.recipient ?? "").trim();

  if (!docId || isNaN(Number(docId))) {
    return NextResponse.json({ error: "docId must be a numeric string" }, { status: 400 });
  }
  if (!recipient || !isStellarAddress(recipient)) {
    return NextResponse.json(
      { error: "recipient must be a valid Stellar G-address" },
      { status: 400 },
    );
  }

  // Verify document exists and belongs to the recipient.
  const doc = await getDocument(docId);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (doc.recipientWallet !== recipient) {
    return NextResponse.json(
      { error: "recipient does not match document owner" },
      { status: 403 },
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.json({ error: "JWT_SECRET not configured" }, { status: 500 });
  }

  const secret = new TextEncoder().encode(jwtSecret);
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    docId,
    recipient,
    docType: doc.docType,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SHARE_TTL_SECONDS)
    .setIssuer("trustleaf")
    .setAudience("verify")
    .sign(secret);

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://trustleaf.app";

  return NextResponse.json({
    data: {
      token,
      url: `${baseUrl}/verify/document?token=${token}`,
      expiresInSeconds: SHARE_TTL_SECONDS,
    },
  });
}
