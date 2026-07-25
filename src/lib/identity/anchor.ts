/**
 * Anchor a clinical artifact into a patient's ficha — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * The actual write: a center that HOLDS active consent anchors the SHA-256 hash
 * of a clinical artifact (receta, examen, …) into the patient's ClinicalRecord
 * via append_entry. Only the hash goes on-chain; the artifact stays off-chain.
 *
 * Gated hard on consent: no active grant → we refuse (403-style), never anchor.
 * That is the whole point — a center can only write what the patient authorized.
 *
 * Sandbox signs the append with the shared sandbox center secret (custodial);
 * its public key must equal the granted wallet or the contract reverts
 * Unauthorized. Anything missing/failed → mode:"simulated" (never breaks the
 * flow, never anchors to the wrong record).
 */
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { hashRut } from "@/lib/identity/rut";
import { hasActiveConsent } from "@/lib/identity/center-grants";
import { ensureSandboxRecord, resolvePatientRecord, type RecordEnv } from "@/lib/identity/patient-records";
import { appendClinicalEntry, getSandboxCenterSecret } from "@/lib/stellar/server";
import { getClinicalEntries } from "@/lib/stellar/client";

/** Thrown when a center tries to anchor without the patient's active consent. */
export class ConsentRequiredError extends Error {
  constructor() {
    super("El centro no tiene consentimiento vigente del paciente para escribir su ficha.");
    this.name = "ConsentRequiredError";
  }
}

/**
 * Why an anchor did not confirm. `mode:"simulated"` used to be a catch-all for
 * four unrelated causes, two of which only left a console.error in Vercel — so
 * an integrator saw the same opaque shape whether the server was misconfigured
 * or their own record had no contract. The reason travels in the response now.
 */
export type AnchorReason =
  | "confirmed"          // onchain
  | "submitted"          // pending: broadcast, not yet confirmed
  | "no_record_contract" // the patient's ficha could not be provisioned
  | "signer_unavailable" // SANDBOX_CENTER_SECRET unset → nothing to sign with
  | "signer_mismatch"    // our signer ≠ the granted wallet; append would revert
  | "tx_failed"          // the network rejected the transaction
  | "append_error"       // the append threw (RPC/network)
  | "live_not_enabled";  // live env does not sign yet

export interface AnchorResult {
  /** onchain = confirmed; pending = submitted, not yet confirmed; simulated = not anchored. */
  mode: "onchain" | "pending" | "simulated";
  /** Stable machine-readable cause — always present, especially when simulated. */
  reason: AnchorReason;
  txHash: string | null;
  contentHash: string; // hex
  kind: string;
  recordContract: string | null;
}

/**
 * Anchor an artifact hash into the patient's ficha for a consenting center.
 *
 * @throws {ConsentRequiredError} when the center has no active grant.
 * @throws {RutError} when the RUT is invalid / pepper missing.
 */
export async function anchorRecord(args: {
  orgId: number;
  granteeWallet: string | null;
  rut: string;
  env: RecordEnv;
  kind: string;
  content: string;
}): Promise<AnchorResult> {
  // 1) Consent gate — fail closed. No grant, no write.
  if (!(await hasActiveConsent(args.orgId, args.rut, args.env))) {
    throw new ConsentRequiredError();
  }

  // 2) Resolve the patient's record contract (sandbox provisions the toy record).
  const record =
    args.env === "sandbox"
      ? await ensureSandboxRecord(args.rut)
      : await resolvePatientRecord(args.rut, args.env);
  const recordContract = record?.contractId ?? null;

  // 3) Hash the artifact — only this hash ever touches the chain.
  //
  // The preimage binds the artifact to the patient so the same content under two
  // patients yields two hashes. It MUST use the peppered rut_hash, never the raw
  // RUT: the RUT space is enumerable, so a plain SHA-256 over it is brute-force
  // reversible from the public ledger (see rut.ts). hashRut also normalizes, so
  // "12.345.678-5" and "123456785" produce the same anchor.
  const payload = JSON.stringify({
    rut_hash: hashRut(args.rut),
    kind: args.kind,
    content: args.content,
  });
  const contentHash = createHash("sha256").update(payload).digest(); // Buffer(32)

  // 4) Real on-chain append in sandbox, signed by the center wallet.
  let mode: "onchain" | "pending" | "simulated" = "simulated";
  let reason: AnchorReason = args.env === "sandbox" ? "no_record_contract" : "live_not_enabled";
  let txHash: string | null = null;
  if (args.env === "sandbox" && recordContract) {
    const centerSecret = getSandboxCenterSecret();
    // The append author MUST be the granted wallet, or the contract reverts
    // Unauthorized. Verify the custodial secret matches before spending a tx.
    const centerPub = centerSecret ? safePub(centerSecret) : null;
    if (!centerSecret) {
      // Expected when SANDBOX_CENTER_SECRET is unset → simulated, no noise.
      reason = "signer_unavailable";
    } else if (!centerPub || centerPub !== args.granteeWallet) {
      reason = "signer_mismatch";
      // Config mismatch: the grant went to granteeWallet but our signer is a
      // DIFFERENT wallet → the append would revert Unauthorized. Surface it
      // loudly instead of a silent "simulated" — the two must be aligned.
      console.error(
        `[anchor] SANDBOX_CENTER_SECRET (${centerPub ?? "malformado"}) no coincide con el ` +
          `signing_wallet del org (${args.granteeWallet}). No se puede firmar el append; ` +
          `alinea ambos. Degradando a simulated.`,
      );
    } else {
      try {
        const res = await appendClinicalEntry({
          doctorSecret: centerSecret,
          contractId: recordContract,
          kind: args.kind,
          contentHash,
        });
        // Keep the hash on PENDING too: the tx is submitted and may confirm
        // after the poll window — reporting "simulated, no tx" would be a lie.
        if (res.status === "SUCCESS") {
          mode = "onchain";
          reason = "confirmed";
          txHash = res.hash;
        } else if (res.status === "PENDING") {
          mode = "pending";
          reason = "submitted";
          txHash = res.hash;
        } else {
          // FAILED → nothing durable was anchored. Keep the hash (the caller can
          // retry with it) and say so out loud; this used to log nothing at all.
          reason = "tx_failed";
          txHash = res.hash ?? null;
          console.error(`[anchor] tx ${res.hash ?? "?"} FAILED en ${recordContract}`);
        }
      } catch (e) {
        reason = "append_error";
        console.error("[anchor] append on-chain falló, degradando a simulated:", e);
      }
    }
  }

  return { mode, reason, txHash, contentHash: contentHash.toString("hex"), kind: args.kind, recordContract };
}

/** Public key of a secret, or null if malformed (never throw into the caller). */
function safePub(secret: string): string | null {
  try {
    return Keypair.fromSecret(secret).publicKey();
  } catch {
    return null;
  }
}

export interface ReadEntry {
  kind: string;
  contentHash: string; // hex
  author: string; // G… wallet that anchored it
  timestamp: number; // ledger unix seconds
}

export interface ReadResult {
  recordContract: string | null;
  entries: ReadEntry[];
}

/**
 * Read the anchored entries of a patient's ficha — the read side of the loop.
 * Gated on active consent (a center only reads records of patients that
 * consented to it). Returns the on-chain append-only history: kind + hash +
 * author + timestamp. Never returns clinical content — that lives off-chain.
 *
 * Every patient — sandbox included — has their OWN ClinicalRecord contract
 * (see patient-records.ts), so the read is always scoped to one person.
 *
 * @throws {ConsentRequiredError} when the center has no active grant.
 * @throws {RutError} when the RUT is invalid / pepper missing.
 */
export async function readRecords(args: {
  orgId: number;
  rut: string;
  env: RecordEnv;
}): Promise<ReadResult> {
  if (!(await hasActiveConsent(args.orgId, args.rut, args.env))) {
    throw new ConsentRequiredError();
  }
  const record = await resolvePatientRecord(args.rut, args.env);
  const contractId = record?.contractId ?? null;
  if (!contractId) return { recordContract: null, entries: [] };

  // An RPC failure must not masquerade as "this patient has no history" — a
  // silent [] here is indistinguishable from an empty ficha to the caller.
  const raw = await getClinicalEntries(contractId).catch((e) => {
    console.error(`[anchor] getClinicalEntries falló para ${contractId}:`, e);
    throw new Error("No se pudo leer la ficha on-chain en este momento.");
  });
  const entries: ReadEntry[] = raw.map((e) => ({
    kind: e.kind,
    contentHash: e.contentHash,
    author: e.author,
    timestamp: e.timestamp,
  }));
  return { recordContract: contractId, entries };
}
