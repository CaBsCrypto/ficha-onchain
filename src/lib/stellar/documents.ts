/**
 * Soroban read client for the `document-soulbound` contract — server-side only.
 * ---------------------------------------------------------------------------
 * Mirrors the pattern in client.ts (prescription reads) extended to cover
 * medical certificates, professional licenses, and mental health certs.
 *
 * All functions are read-only (simulation via prepareTransaction / simulateTransaction).
 * Write operations (mint, revoke) live in the corresponding API route handlers.
 *
 * Enumeration strategy: scan `doc_mint` events (same pattern as `rx_mint`).
 * Limitation: RPC event retention ~7 days on testnet; a production build would
 * mirror events into an off-chain indexer.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_IDS,
  NETWORK_PASSPHRASE,
  SOROBAN_RPC_URL,
} from "./config";
import { ContractCallError } from "./client";
import type { DocumentType, DocumentStatus } from "@/types";

// ---------------------------------------------------------------------------
// Reuse the shared RPC server instance from client.ts
// ---------------------------------------------------------------------------

const server = new rpc.Server(SOROBAN_RPC_URL, {
  allowHttp: SOROBAN_RPC_URL.startsWith("http://"),
});

const SIM_SOURCE =
  process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET ??
  "GAAG2XS7WM332FV5WOXXE4BZ56LVA474AZB4QDYPSSWJ3FLLLYH7ZZI2";

// ---------------------------------------------------------------------------
// On-chain document shape (typed return from callReadDocument)
// ---------------------------------------------------------------------------

export interface OnChainDocument {
  id: string;
  docType: DocumentType;
  issuerWallet: string;
  recipientWallet: string;
  /** Hex-encoded SHA-256 content hash. */
  contentHash: string;
  /** Ledger unix timestamp at issuance. */
  issuedAt: number;
  /** Ledger unix timestamp at expiry. 0 = does not expire. */
  expiresAt: number;
  status: DocumentStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ordered DocType variant names matching the Soroban enum discriminants 0–8. */
const DOC_TYPE_ORDER: DocumentType[] = [
  "LaborRest",
  "LaborFitness",
  "Disability",
  "MedicalLicense",
  "DegreeTitle",
  "ProfCredential",
  "PsychCare",
  "PsychEval",
  "TreatmentDischarge",
];

function decodeDocType(raw: unknown): DocumentType {
  if (typeof raw === "string" && DOC_TYPE_ORDER.includes(raw as DocumentType)) {
    return raw as DocumentType;
  }
  if (typeof raw === "number" && raw >= 0 && raw < DOC_TYPE_ORDER.length) {
    return DOC_TYPE_ORDER[raw];
  }
  if (raw && typeof raw === "object") {
    const tag = (raw as { tag?: string }).tag;
    if (tag && DOC_TYPE_ORDER.includes(tag as DocumentType)) return tag as DocumentType;
  }
  return "LaborRest"; // safe fallback
}

function decodeDocStatus(raw: unknown, expiresAt: number): DocumentStatus {
  const now = Math.floor(Date.now() / 1000);
  // Check expiry first (client-side, since contract doesn't auto-transition).
  if (expiresAt > 0 && now > expiresAt) return "expired";

  if (typeof raw === "string") {
    if (raw === "Revoked") return "revoked";
    return "active";
  }
  if (typeof raw === "number") {
    return raw === 1 ? "revoked" : "active";
  }
  if (raw && typeof raw === "object") {
    const tag = (raw as { tag?: string }).tag;
    if (tag === "Revoked") return "revoked";
  }
  return "active";
}

function toHex(bytes: unknown): string {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes).toString("hex");
  if (Buffer.isBuffer(bytes)) return bytes.toString("hex");
  return String(bytes ?? "");
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

async function callReadDocument<T = unknown>(
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const contractId = CONTRACT_IDS.documentSoulbound;
  if (!contractId) throw new ContractCallError("DOCUMENT_SOULBOUND_ID not configured");

  const contract = new Contract(contractId);
  const source = new Account(SIM_SOURCE, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new ContractCallError(sim.error);
  }
  if (!sim.result?.retval) {
    throw new ContractCallError(`No return value from ${method}`);
  }
  return scValToNative(sim.result.retval) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single document by id. Returns null if not found.
 */
export async function getDocument(
  id: string | number | bigint,
): Promise<OnChainDocument | null> {
  try {
    const raw = await callReadDocument<Record<string, unknown>>(
      "get_document",
      [nativeToScVal(BigInt(id), { type: "u64" })],
    );
    const expiresAt = Number(raw.expires_at ?? 0);
    return {
      id: String(raw.id),
      docType: decodeDocType(raw.doc_type),
      issuerWallet: String(raw.issuer_wallet),
      recipientWallet: String(raw.recipient_wallet),
      contentHash: toHex(raw.content_hash),
      issuedAt: Number(raw.issued_at),
      expiresAt,
      status: decodeDocStatus(raw.status, expiresAt),
    };
  } catch {
    return null; // NotFound or contract not deployed
  }
}

/**
 * Enumerate documents by scanning `doc_mint` events filtered by wallet.
 *
 * Event topics: [ "doc_mint", issuer_wallet, recipient_wallet ] → doc_id (u64)
 * `role` selects which topic slot to filter:
 *   "issuer"    → doctors / institutions querying documents they issued
 *   "recipient" → patients / professionals querying their own documents
 */
export async function listDocuments(
  wallet: string,
  role: "issuer" | "recipient",
): Promise<OnChainDocument[]> {
  const ids = await findDocumentIds(wallet, role);
  const records = await Promise.all(ids.map((id) => getDocument(id)));
  return records
    .filter((r): r is OnChainDocument => r !== null)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

async function findDocumentIds(
  wallet: string,
  role: "issuer" | "recipient",
): Promise<string[]> {
  const contractId = CONTRACT_IDS.documentSoulbound;
  if (!contractId) return [];

  const latest = await server.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - 100_000);

  const walletTopic = new Address(wallet).toScVal().toXDR("base64");
  const mintTopic = xdr.ScVal.scvSymbol("doc_mint").toXDR("base64");

  // topics: [ "doc_mint", issuer_wallet, recipient_wallet ]
  const topicFilter =
    role === "issuer"
      ? [mintTopic, walletTopic, "*"]
      : [mintTopic, "*", walletTopic];

  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    // Ledger range and cursor are mutually exclusive in SDK v14.
    const filters: rpc.Api.EventFilter[] = [
      {
        type: "contract",
        contractIds: [contractId],
        topics: [topicFilter],
      },
    ];
    const res: rpc.Api.GetEventsResponse = await server.getEvents(
      cursor
        ? { filters, cursor, limit: 100 }
        : { filters, startLedger, limit: 100 },
    );
    for (const ev of res.events ?? []) {
      try {
        ids.add(String(scValToNative(ev.value)));
      } catch {
        /* skip malformed */
      }
    }
    if (!res.cursor || (res.events?.length ?? 0) === 0) break;
    cursor = res.cursor;
  }
  return [...ids];
}
