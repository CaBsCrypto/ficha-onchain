/**
 * Server-only Soroban signing + submission helpers.
 * Reads signing secrets from env; must never be imported by client code.
 * (Only imported from API route handlers.)
 */
import {
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
  rpc,
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
