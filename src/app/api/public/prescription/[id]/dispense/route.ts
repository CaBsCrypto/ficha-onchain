/**
 * POST /api/public/prescription/[id]/dispense
 * ---------------------------------------------------------------------------
 * Register a dispensation against a prescription. Requires pharmacy auth.
 *
 * Authentication:
 *   Authorization: Bearer <pharmacy_api_key>
 *
 *   Keys are configured via PHARMACY_API_KEYS env var:
 *     "key1:GPHARMACY1WALLET...,key2:GPHARMACY2WALLET..."
 *   Each key maps to the pharmacy's Stellar G-address. When
 *   PHARMACY_API_KEYS is unset the endpoint runs in demo mode (no auth
 *   required, dispensation is always simulated).
 *
 * Body (JSON):
 *   { amount: number, notes?: string }
 *
 * On-chain mode (when DISPENSE_RECORD_ID + PHARMACY_RELAYER_SECRET are set):
 *   Calls DispenseRecord.record_dispense() with the pharmacy keypair as signer,
 *   fee-bumped by the relayer. Returns the on-chain record_id.
 *
 * Simulated mode (contracts not yet deployed / demo):
 *   Returns a mock record_id; prescription state is NOT mutated on-chain.
 *   Use this to validate the API flow before deploying Phase 1 contracts.
 *
 * Possible responses:
 *   200 { data: DispenseResult }
 *   400 { error: "..." }
 *   401 { error: "Unauthorized: ..." }
 *   404 { error: "Prescription not found" }
 *   409 { error: "..." }   — cannot dispense (wrong status / insufficient balance)
 *   500 { error: "..." }
 */
import { randomBytes } from "node:crypto";
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";
import { server, getPrescription, type RxStatus } from "@/lib/stellar/client";
import { computeExpiry } from "@/lib/stellar/expiry";
import { NETWORK_PASSPHRASE, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { feeBumpAndSend } from "@/lib/stellar/server";
import { authorizePharmacy } from "@/lib/stellar/pharmacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPENSABLE: Set<RxStatus> = new Set([
  "Registrada",
  "Activa",
  "ConsumoParcial",
]);

interface DispenseBody {
  amount?: number | string;
  notes?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. Validate prescription id.
  const { id } = await params;
  const rxId = Number(id);
  if (!Number.isInteger(rxId) || rxId <= 0) {
    return NextResponse.json({ error: "Invalid prescription id" }, { status: 400 });
  }

  // 2. Authenticate pharmacy.
  const auth = await authorizePharmacy(request.headers.get("Authorization"));
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized: invalid or missing pharmacy API key" },
      { status: 401 },
    );
  }

  // 3. Parse body.
  let body: DispenseBody;
  try {
    body = (await request.json()) as DispenseBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Math.max(1, Math.floor(Number(body.amount) || 1));

  // 4. Fetch & validate the prescription on-chain.
  let rx;
  try {
    rx = await getPrescription(rxId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to fetch prescription: ${message}` },
      { status: 500 },
    );
  }

  if (!rx) {
    return NextResponse.json({ error: "Prescription not found" }, { status: 404 });
  }

  if (!DISPENSABLE.has(rx.status)) {
    return NextResponse.json(
      { error: `Prescription cannot be dispensed (status: ${rx.status})` },
      { status: 409 },
    );
  }

  // Reject prescriptions past their (derived) validity window. Expiry is not an
  // on-chain status, so this guard is enforced here rather than by the contract.
  if (computeExpiry(rx).expired) {
    return NextResponse.json(
      { error: "Prescription has expired and cannot be dispensed" },
      { status: 409 },
    );
  }

  if (rx.balance < amount) {
    return NextResponse.json(
      {
        error: `Insufficient balance: requested ${amount}, available ${rx.balance}`,
      },
      { status: 409 },
    );
  }

  const dispensedAt = Math.floor(Date.now() / 1000);

  // 5. Attempt on-chain dispensation if Phase 1 contracts are deployed.
  const dispenseRecordId = process.env.DISPENSE_RECORD_ID;
  const pharmacyRelayerSecret = process.env.PHARMACY_RELAYER_SECRET;

  if (dispenseRecordId && pharmacyRelayerSecret && auth.wallet) {
    try {
      const { recordId, txHash } = await onChainDispense({
        dispensaryWallet: auth.wallet,
        dispensarySecret: pharmacyRelayerSecret,
        rxId,
        patientWallet: rx.patientWallet,
        amount,
        dispensedAt,
        dispenseRecordId,
      });
      return NextResponse.json({
        data: {
          mode: "onchain",
          recordId,
          txHash,
          explorer: STELLAR_EXPERT_TX(txHash),
          rxId: rx.id,
          amount,
          dispensedAt,
          pharmacyWallet: auth.wallet,
          authSource: auth.source,
        },
      });
    } catch (err) {
      // Log and fall through to simulated mode.
      console.error("[dispense] on-chain call failed, falling back:", err);
    }
  }

  // 6. Simulated mode — return a deterministic mock record.
  const simulatedRecordId = randomBytes(4).readUInt32BE(0).toString();
  const simulatedTxHash = randomBytes(32).toString("hex");

  let reason: string;
  if (!dispenseRecordId) {
    reason = "DISPENSE_RECORD_ID not set (Phase 1 contracts not deployed)";
  } else if (!pharmacyRelayerSecret) {
    reason = "PHARMACY_RELAYER_SECRET not configured";
  } else if (!auth.wallet) {
    reason = "No pharmacy wallet (demo mode — PHARMACY_API_KEYS unset)";
  } else {
    reason = "On-chain dispense failed — check server logs";
  }

  return NextResponse.json({
    data: {
      mode: "simulated",
      recordId: simulatedRecordId,
      txHash: simulatedTxHash,
      rxId: rx.id,
      amount,
      dispensedAt,
      pharmacyWallet: auth.wallet,
      authSource: auth.source,
      reason,
    },
  });
}

// ---------------------------------------------------------------------------
// On-chain dispense (Phase 1)
// ---------------------------------------------------------------------------

async function onChainDispense(args: {
  dispensaryWallet: string;
  dispensarySecret: string;
  rxId: number;
  patientWallet: string;
  amount: number;
  dispensedAt: number;
  dispenseRecordId: string;
}): Promise<{ recordId: string; txHash: string }> {
  const dispensary = Keypair.fromSecret(args.dispensarySecret);
  const contract = new Contract(args.dispenseRecordId);

  const source = await server.getAccount(dispensary.publicKey());
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "record_dispense",
        new Address(args.dispensaryWallet).toScVal(),
        nativeToScVal(BigInt(args.rxId), { type: "u64" }),
        new Address(args.patientWallet).toScVal(),
        nativeToScVal(args.amount, { type: "u32" }),
        nativeToScVal(BigInt(args.dispensedAt), { type: "u64" }),
      ),
    )
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(dispensary);

  // Fee-bump so the pharmacy relayer covers gas; dispensary spends 0 XLM.
  const submit = await feeBumpAndSend(prepared.toXDR());
  if (submit.status !== "SUCCESS") {
    throw new Error(`transaction ${submit.status} (hash: ${submit.hash})`);
  }

  const recordId =
    submit.returnValue != null
      ? String(scValToNative(submit.returnValue))
      : "unknown";

  return { recordId, txHash: submit.hash };
}
