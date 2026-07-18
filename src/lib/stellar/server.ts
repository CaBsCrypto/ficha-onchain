/**
 * Server-only Soroban signing + submission helpers.
 * Reads signing secrets from env; must never be imported by client code.
 * (Only imported from API route handlers.)
 */
import {
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  nativeToScVal,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "./config";
import { server } from "./client";

/** Fee the relayer is willing to cover for a bumped transaction (stroops). */
const RELAY_FEE = "2000000"; // 0.2 XLM ceiling — plenty for a Soroban invoke.

export function getRelayerKeypair(): Keypair {
  const secret = process.env.RELAYER_SECRET;
  if (!secret) throw new Error("RELAYER_SECRET is not configured");
  return Keypair.fromSecret(secret);
}

export interface SubmitResult {
  hash: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
  returnValue?: rpc.Api.GetSuccessfulTransactionResponse["returnValue"];
}

/** Send a fully-built transaction and poll until it leaves PENDING. */
export async function sendAndConfirm(
  tx: Transaction | FeeBumpTransaction,
): Promise<SubmitResult> {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(
      `Submission rejected: ${JSON.stringify(sent.errorResult ?? sent)}`,
    );
  }
  const hash = sent.hash;

  // Poll getTransaction until it is no longer NOT_FOUND (max ~30s).
  for (let i = 0; i < 30; i += 1) {
    const res = await server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash, status: "SUCCESS", returnValue: res.returnValue };
    }
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      return { hash, status: "FAILED" };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { hash, status: "PENDING" };
}

/**
 * Wrap an already-signed inner transaction (XDR) in a fee-bump paid by the
 * relayer, so the original signer never spends XLM. Used by /api/relay and for
 * gasless mints.
 */
export async function feeBumpAndSend(innerXdr: string): Promise<SubmitResult> {
  const relayer = getRelayerKeypair();
  const inner = TransactionBuilder.fromXDR(
    innerXdr,
    NETWORK_PASSPHRASE,
  ) as Transaction;

  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    relayer,
    RELAY_FEE,
    inner,
    NETWORK_PASSPHRASE,
  );
  feeBump.sign(relayer);
  return sendAndConfirm(feeBump);
}

/**
 * Append a clinical entry to a patient's ClinicalRecord, signed by the doctor
 * and fee-bumped by the relayer (gasless for the doctor). The doctor wallet must
 * already hold write access on the record (the patient granted it); otherwise
 * the contract rejects the invoke with Unauthorized.
 *
 * `contentHash` is the 32-byte SHA-256 anchor of the off-chain encrypted FHIR
 * payload — the plaintext never touches the chain.
 */
export async function appendClinicalEntry(args: {
  doctorSecret: string;
  contractId: string;
  kind: string;
  contentHash: Buffer; // 32 bytes
}): Promise<SubmitResult> {
  const doctor = Keypair.fromSecret(args.doctorSecret);
  const contract = new Contract(args.contractId);
  const op = contract.call(
    "append_entry",
    new Address(doctor.publicKey()).toScVal(),
    nativeToScVal(args.kind, { type: "string" }),
    xdr.ScVal.scvBytes(args.contentHash),
  );

  const source = await server.getAccount(doctor.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(doctor);
  return feeBumpAndSend(prepared.toXDR());
}
