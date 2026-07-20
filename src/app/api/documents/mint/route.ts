/**
 * POST /api/documents/mint — issue a medical document on-chain.
 * ---------------------------------------------------------------------------
 * Body: { recipient, docType, expiresAt?, payload }
 *
 * `payload` is the full document content object (typed per DocumentType).
 * The server computes content_hash = SHA-256(canonical JSON(payload)) and
 * stores only the hash on-chain via the `document-soulbound` contract.
 *
 * Auth: DEMO_DOCTOR_SECRET (same as prescriptions) — signs as the issuer.
 * In production the issuer signs in-browser via passkey and POSTs XDR to /api/relay.
 *
 * Responses follow the { data } / { error } convention.
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  Address,
  Keypair,
  nativeToScVal,
  Contract,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from "@stellar/stellar-sdk";
import { CONTRACT_IDS, NETWORK_PASSPHRASE, STELLAR_EXPERT_TX, isStellarAddress } from "@/lib/stellar/config";
import { server } from "@/lib/stellar/client";
import { feeBumpAndSend, getDemoDoctorSecret } from "@/lib/stellar/server";
import { hashDocumentContent, DOC_LABEL } from "@/lib/fhir/documents";
import { requireAuthOrDemo } from "@/lib/auth/privy-auth";
import type { DocumentType, DocumentContent } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MintDocBody {
  /** Stellar G-address of the document recipient / subject. */
  recipient?: string;
  /** One of the nine DocumentType values. */
  docType?: string;
  /**
   * Unix timestamp (seconds) for document expiry. 0 or omit = no expiry.
   * Required for MedicalLicense and ProfCredential.
   */
  expiresAt?: number;
  /** Full off-chain content payload to be hashed and anchored. */
  payload?: DocumentContent;
}

const VALID_DOC_TYPES = new Set<DocumentType>([
  "LaborRest", "LaborFitness", "Disability",
  "MedicalLicense", "DegreeTitle", "ProfCredential",
  "PsychCare", "PsychEval", "TreatmentDischarge",
]);

async function handleMintDocument(request: Request) {
  // Issuing a document is an issuer (doctor/institution) action — guard it.
  const gate = await requireAuthOrDemo(request);
  if (gate) return gate.error;

  let body: MintDocBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipient = (body.recipient ?? "").trim();
  const docType = (body.docType ?? "").trim() as DocumentType;
  const expiresAt = Math.max(0, Math.floor(Number(body.expiresAt ?? 0)));
  const payload = body.payload;

  if (!recipient) {
    return NextResponse.json({ error: "recipient is required" }, { status: 400 });
  }
  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json(
      { error: `docType must be one of: ${[...VALID_DOC_TYPES].join(", ")}` },
      { status: 400 },
    );
  }
  if (!payload) {
    return NextResponse.json({ error: "payload is required" }, { status: 400 });
  }

  const recipientIsG = isStellarAddress(recipient);
  const doctorSecret = getDemoDoctorSecret();

  // Compute content hash from the off-chain payload.
  const contentHash = hashDocumentContent(payload);

  // Attempt real on-chain mint.
  if (doctorSecret && recipientIsG && CONTRACT_IDS.documentSoulbound) {
    try {
      const result = await realMint({
        doctorSecret,
        recipient,
        docType,
        contentHash,
        expiresAt,
      });
      return NextResponse.json({ data: result });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        data: simulated(contentHash, docType, `on-chain mint failed: ${detail}`),
      });
    }
  }

  // Simulated fallback.
  const reason = !CONTRACT_IDS.documentSoulbound
    ? "DOCUMENT_SOULBOUND_ID not configured — contract not deployed yet"
    : !doctorSecret
    ? "no issuer signer configured (DEMO_DOCTOR_SECRET / RELAYER_SECRET)"
    : "recipient is not a valid Stellar address";

  return NextResponse.json({ data: simulated(contentHash, docType, reason) });
}

export const POST = handleMintDocument;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function realMint(args: {
  doctorSecret: string;
  recipient: string;
  docType: DocumentType;
  contentHash: Buffer;
  expiresAt: number;
}) {
  const issuer = Keypair.fromSecret(args.doctorSecret);
  const contract = new Contract(CONTRACT_IDS.documentSoulbound!);

  // Map DocType string → Soroban u32 discriminant.
  const DOC_TYPE_DISC: Record<DocumentType, number> = {
    LaborRest: 0, LaborFitness: 1, Disability: 2,
    MedicalLicense: 3, DegreeTitle: 4, ProfCredential: 5,
    PsychCare: 6, PsychEval: 7, TreatmentDischarge: 8,
  };

  const op = contract.call(
    "mint_document",
    new Address(issuer.publicKey()).toScVal(),
    new Address(args.recipient).toScVal(),
    // DocType enum — pass as u32 discriminant.
    xdr.ScVal.scvU32(DOC_TYPE_DISC[args.docType]),
    xdr.ScVal.scvBytes(args.contentHash),
    nativeToScVal(BigInt(args.expiresAt), { type: "u64" }),
  );

  // One build→prepare→sign→submit cycle. The account is fetched inside so each
  // retry gets a fresh sequence number.
  const attempt = async () => {
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
    return feeBumpAndSend(prepared.toXDR());
  };

  // Back-to-back mints from the same demo issuer collide on the account sequence
  // (txBadSeq) and, without a retry, degrade the caller to "simulated". Re-fetch
  // the account and retry a few times before giving up. Mirrors the retry in
  // stellar/server.ts signInvokeAndSubmit.
  let submit: Awaited<ReturnType<typeof feeBumpAndSend>> | undefined;
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      submit = await attempt();
      if (submit.status === "SUCCESS") break;
    } catch (err) {
      lastError = err;
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!submit || submit.status !== "SUCCESS") {
    throw new Error(
      submit ? `transaction ${submit.status} (${submit.hash})` : String(lastError),
    );
  }

  const docId =
    submit.returnValue != null
      ? String(scValToNative(submit.returnValue))
      : null;

  return {
    mode: "onchain" as const,
    docId,
    docType: args.docType,
    docLabel: DOC_LABEL[args.docType],
    hash: submit.hash,
    contentHash: args.contentHash.toString("hex"),
    explorer: STELLAR_EXPERT_TX(submit.hash),
  };
}

function simulated(contentHash: Buffer, docType: DocumentType, reason: string) {
  return {
    mode: "simulated" as const,
    docId: null,
    docType,
    docLabel: DOC_LABEL[docType],
    hash: randomBytes(32).toString("hex"),
    contentHash: contentHash.toString("hex"),
    reason,
  };
}
