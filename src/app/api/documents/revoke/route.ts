/**
 * POST /api/documents/revoke — revoke a document on-chain.
 * ---------------------------------------------------------------------------
 * Body: { docId: string }
 *
 * Only the original issuer may revoke (enforced on-chain via require_auth).
 * Uses DEMO_DOCTOR_SECRET as the issuer signer (same as prescriptions).
 *
 * Response: { data: { mode, hash?, explorer?, docId, reason? } }
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  Address,
  Keypair,
  nativeToScVal,
  Contract,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { CONTRACT_IDS, NETWORK_PASSPHRASE, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { server } from "@/lib/stellar/client";
import { feeBumpAndSend, getDemoDoctorSecret } from "@/lib/stellar/server";
import { getDocument } from "@/lib/stellar/documents";
import { requireAuthOrDemo } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RevokeBody {
  docId?: string | number;
}

async function handleRevokeDocument(request: Request) {
  // Revoking a document is an issuer action — guard it (demo mode passes through).
  const gate = await requireAuthOrDemo(request);
  if (gate) return gate.error;

  let body: RevokeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const docId = String(body.docId ?? "").trim();
  if (!docId || isNaN(Number(docId))) {
    return NextResponse.json({ error: "docId must be a numeric string" }, { status: 400 });
  }

  const doctorSecret = getDemoDoctorSecret();

  if (doctorSecret && CONTRACT_IDS.documentSoulbound) {
    try {
      const result = await realRevoke({ doctorSecret, docId });
      return NextResponse.json({ data: result });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        data: simulated(docId, `on-chain revoke failed: ${detail}`),
      });
    }
  }

  const reason = !CONTRACT_IDS.documentSoulbound
    ? "DOCUMENT_SOULBOUND_ID not configured"
    : "no issuer signer configured";
  return NextResponse.json({ data: simulated(docId, reason) });
}

export const POST = handleRevokeDocument;

async function realRevoke(args: { doctorSecret: string; docId: string }) {
  const issuer = Keypair.fromSecret(args.doctorSecret);

  // Verify the document exists and the signer is the issuer.
  const doc = await getDocument(args.docId);
  if (!doc) {
    throw new Error(`Document ${args.docId} not found`);
  }
  if (doc.issuerWallet !== issuer.publicKey()) {
    throw new Error(
      `Signer ${issuer.publicKey()} is not the issuer of document ${args.docId}`,
    );
  }
  if (doc.status === "revoked") {
    throw new Error(`Document ${args.docId} is already revoked`);
  }

  const contract = new Contract(CONTRACT_IDS.documentSoulbound!);
  const op = contract.call(
    "revoke_document",
    nativeToScVal(BigInt(args.docId), { type: "u64" }),
  );

  const source = await server.getAccount(issuer.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(issuer);

  const submit = await feeBumpAndSend(prepared.toXDR());
  if (submit.status !== "SUCCESS") {
    throw new Error(`transaction ${submit.status} (${submit.hash})`);
  }

  return {
    mode: "onchain" as const,
    docId: args.docId,
    hash: submit.hash,
    explorer: STELLAR_EXPERT_TX(submit.hash),
  };
}

function simulated(docId: string, reason: string) {
  return {
    mode: "simulated" as const,
    docId,
    hash: randomBytes(32).toString("hex"),
    reason,
  };
}
