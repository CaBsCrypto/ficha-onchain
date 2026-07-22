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
import { hasActiveConsent } from "@/lib/identity/center-grants";
import { ensureSandboxRecord, resolvePatientRecord, type RecordEnv } from "@/lib/identity/patient-records";
import { appendClinicalEntry, getSandboxCenterSecret } from "@/lib/stellar/server";

/** Thrown when a center tries to anchor without the patient's active consent. */
export class ConsentRequiredError extends Error {
  constructor() {
    super("El centro no tiene consentimiento vigente del paciente para escribir su ficha.");
    this.name = "ConsentRequiredError";
  }
}

export interface AnchorResult {
  /** onchain = confirmed; pending = submitted, not yet confirmed; simulated = not anchored. */
  mode: "onchain" | "pending" | "simulated";
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
  const payload = JSON.stringify({ rut: args.rut, kind: args.kind, content: args.content });
  const contentHash = createHash("sha256").update(payload).digest(); // Buffer(32)

  // 4) Real on-chain append in sandbox, signed by the center wallet.
  let mode: "onchain" | "pending" | "simulated" = "simulated";
  let txHash: string | null = null;
  if (args.env === "sandbox" && recordContract) {
    const centerSecret = getSandboxCenterSecret();
    // The append author MUST be the granted wallet, or the contract reverts
    // Unauthorized. Verify the custodial secret matches before spending a tx.
    const centerPub = centerSecret ? safePub(centerSecret) : null;
    if (!centerSecret) {
      // Expected when SANDBOX_CENTER_SECRET is unset → simulated, no noise.
    } else if (!centerPub || centerPub !== args.granteeWallet) {
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
          txHash = res.hash;
        } else if (res.status === "PENDING") {
          mode = "pending";
          txHash = res.hash;
        }
        // FAILED → stays simulated with no tx (nothing durable was anchored).
      } catch (e) {
        console.error("[anchor] append on-chain falló, degradando a simulated:", e);
      }
    }
  }

  return { mode, txHash, contentHash: contentHash.toString("hex"), kind: args.kind, recordContract };
}

/** Public key of a secret, or null if malformed (never throw into the caller). */
function safePub(secret: string): string | null {
  try {
    return Keypair.fromSecret(secret).publicKey();
  } catch {
    return null;
  }
}
