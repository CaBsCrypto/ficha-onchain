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
import { withSignerLock } from "./serialize";

/** Fee the relayer is willing to cover for a bumped transaction (stroops). */
const RELAY_FEE = "2000000"; // 0.2 XLM ceiling — plenty for a Soroban invoke.

export function getRelayerKeypair(): Keypair {
  const secret = process.env.RELAYER_SECRET;
  if (!secret) throw new Error("RELAYER_SECRET is not configured");
  return Keypair.fromSecret(secret);
}

/**
 * Demo doctor signing secret, gated on the relayer being configured. Returns
 * undefined when there is no relayer (so on-chain flows degrade to simulated).
 */
export function getDemoDoctorSecret(): string | undefined {
  return process.env.RELAYER_SECRET ? process.env.DEMO_DOCTOR_SECRET : undefined;
}

/**
 * Demo patient (owner) signing secret, gated on the relayer being configured.
 * Returns undefined when there is no relayer.
 */
export function getDemoPatientSecret(): string | undefined {
  return process.env.RELAYER_SECRET
    ? process.env.DEMO_PATIENT_SECRET
    : undefined;
}

/**
 * Owner secret of the SANDBOX toy ClinicalRecord — signs the (real) on-chain
 * grant when a center requests consent in the sandbox. Gated on the relayer.
 * Returns undefined when unset, so sandbox consent degrades to mode:"simulated".
 */
export function getSandboxOwnerSecret(): string | undefined {
  return process.env.RELAYER_SECRET
    ? process.env.SANDBOX_OWNER_SECRET
    : undefined;
}

/**
 * Signing secret of the SANDBOX center — signs the (real) on-chain append_entry
 * when a center anchors a record in the sandbox. Its public key MUST be the
 * wallet the patient granted write access to (the org's signing_wallet), or the
 * contract reverts Unauthorized. Custodial, sandbox-only. Gated on the relayer;
 * undefined → anchor degrades to mode:"simulated".
 */
export function getSandboxCenterSecret(): string | undefined {
  return process.env.RELAYER_SECRET
    ? process.env.SANDBOX_CENTER_SECRET
    : undefined;
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
 * Build a Soroban invoke against `contractId.method(...args)`, sign it with
 * `signerSecret` (the signer is also the tx source, satisfying require_auth),
 * then fee-bump it via the relayer so the signer spends no XLM.
 *
 * Shared by appendClinicalEntry and grantWriteAccess — the fee (BASE_FEE),
 * timeout (60s), prepare-then-sign order and fee-bump are identical for both.
 */
/**
 * Build + prepare (simulate) a Soroban invoke against `contractId.method(...args)`
 * for `sourcePublicKey`, returning the UNSIGNED transaction XDR. The account is
 * fetched HERE so each call picks up a fresh sequence number.
 *
 * This is the half of an invoke that does NOT need a secret key. It is shared by
 * signInvokeAndSubmit (server-side signing below) and by future client-side
 * signing flows where a center/patient signs the XDR with their own passkey
 * wallet and the relayer only fee-bumps — so the signing party never has to hand
 * us their key. Keeping the build logic in one place stops those flows from
 * diverging from the server path.
 */
export async function buildInvokeXdr(args: {
  sourcePublicKey: string;
  contractId: string;
  method: string;
  args: xdr.ScVal[];
}): Promise<string> {
  const contract = new Contract(args.contractId);
  const source = await server.getAccount(args.sourcePublicKey);
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(args.method, ...args.args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  return prepared.toXDR();
}

async function signInvokeAndSubmit(args: {
  signerSecret: string;
  contractId: string;
  method: string;
  args: xdr.ScVal[];
}): Promise<SubmitResult> {
  const signer = Keypair.fromSecret(args.signerSecret);

  // One full build→prepare→sign→submit cycle. buildInvokeXdr fetches the account
  // HERE (not once outside) so each retry picks up a fresh sequence number.
  const attempt = async (): Promise<SubmitResult> => {
    const unsignedXdr = await buildInvokeXdr({
      sourcePublicKey: signer.publicKey(),
      contractId: args.contractId,
      method: args.method,
      args: args.args,
    });
    const prepared = TransactionBuilder.fromXDR(
      unsignedXdr,
      NETWORK_PASSPHRASE,
    ) as Transaction;
    prepared.sign(signer);
    return feeBumpAndSend(prepared.toXDR());
  };

  // Serialize per signer so concurrent invokes from the same demo secret never
  // race on the account sequence (see serialize.ts). The retry below is the
  // second line of defence — for transient RPC hiccups, not for the self-
  // inflicted txBadSeq collisions the lock already removes.
  return withSignerLock(signer.publicKey(), async () => {
    const MAX_ATTEMPTS = 3;
    let lastResult: SubmitResult | undefined;
    let lastError: unknown;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        const res = await attempt();
        if (res.status === "SUCCESS") return res;
        lastResult = res;
      } catch (err) {
        lastError = err;
      }
      if (i < MAX_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 1500));
    }
    // Persistent failure: hand back the last real status so the caller can
    // degrade with an accurate reason, or rethrow if we never got a result.
    if (lastResult) return lastResult;
    throw lastError;
  });
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
  return signInvokeAndSubmit({
    signerSecret: args.doctorSecret,
    contractId: args.contractId,
    method: "append_entry",
    args: [
      new Address(doctor.publicKey()).toScVal(),
      nativeToScVal(args.kind, { type: "string" }),
      xdr.ScVal.scvBytes(args.contentHash),
    ],
  });
}

/**
 * Grant a doctor write access to a patient's ClinicalRecord, signed by the
 * OWNER (the patient) and fee-bumped by the relayer. The contract's
 * `grant_write_access` calls `require_owner()`, so only the owner's signature is
 * accepted — the relayer fee-bump does NOT count as that inner signature.
 *
 * Takes a single Address (the grantee); the contract sets the flag to true. The
 * grantee MUST be the same wallet that later signs `append_entry`, or the append
 * reverts Unauthorized.
 */
export async function grantWriteAccess(args: {
  ownerSecret: string;
  contractId: string;
  grantee: string;
}): Promise<SubmitResult> {
  return signInvokeAndSubmit({
    signerSecret: args.ownerSecret,
    contractId: args.contractId,
    method: "grant_write_access",
    args: [new Address(args.grantee).toScVal()],
  });
}

/**
 * Revoke a doctor/center's write access on a patient's ClinicalRecord, signed by
 * the OWNER (the patient) and fee-bumped by the relayer. Mirrors
 * {@link grantWriteAccess} exactly — the contract's `revoke_write_access` (see
 * contracts/clinical-record/src/lib.rs) also calls `require_owner()`, so only the
 * owner's signature is accepted; the relayer fee-bump does NOT count as it.
 *
 * Needed so a patient can withdraw a center's standing consent (the external-API
 * model grants write access per center, not per appointment).
 */
export async function revokeWriteAccess(args: {
  ownerSecret: string;
  contractId: string;
  grantee: string;
}): Promise<SubmitResult> {
  return signInvokeAndSubmit({
    signerSecret: args.ownerSecret,
    contractId: args.contractId,
    method: "revoke_write_access",
    args: [new Address(args.grantee).toScVal()],
  });
}
