/**
 * POST /api/prescriptions/activate — activate a prescription (Registrada → Activa).
 * Body: { rxId: string }
 *
 * The contract's `activate(caller, prescription_id)` accepts EITHER the patient
 * or the issuing doctor as `caller` (require_auth on `caller`). There is no
 * server-held patient secret — Privy embedded wallets sign in the browser and no
 * server route submits a patient-signed XDR — so the demo signs as the
 * DEMO_DOCTOR keypair acting as `caller` (a contract-legal path that mirrors how
 * /api/mint and /api/revoke sign). The relayer fee-bumps so no one spends XLM.
 *
 * When RELAYER_SECRET / DEMO_DOCTOR_SECRET are absent, or the tx is rejected, we
 * return a simulated success so the demo UI stays interactive.
 *
 * Guarded by requireUser(): a patient activates their own prescription. The
 * guard is enforced whenever Privy is configured; demo mode passes through.
 */
import { NextResponse } from "next/server";
import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_IDS,
  NETWORK_PASSPHRASE,
  STELLAR_EXPERT_TX,
} from "@/lib/stellar/config";
import { server, getPrescription } from "@/lib/stellar/client";
import { feeBumpAndSend } from "@/lib/stellar/server";
import { requireUser, unauthorized } from "@/lib/auth/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privyConfigured(): boolean {
  return Boolean(
    (process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID) &&
      process.env.PRIVY_APP_SECRET,
  );
}

export async function POST(request: Request) {
  if (privyConfigured()) {
    const user = await requireUser(request);
    if (!user) return unauthorized();
  }

  let body: { rxId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rxId = String(body.rxId ?? "").trim();
  if (!rxId || !/^\d+$/.test(rxId)) {
    return NextResponse.json(
      { error: "rxId is required and must be a numeric id" },
      { status: 400 },
    );
  }

  const doctorSecret = process.env.RELAYER_SECRET
    ? process.env.DEMO_DOCTOR_SECRET
    : undefined;

  if (doctorSecret) {
    try {
      const doctor = Keypair.fromSecret(doctorSecret);

      // Fail fast: only a Registrada prescription can be activated.
      const rx = await getPrescription(rxId);
      if (!rx) {
        return NextResponse.json(
          { error: "prescription not found" },
          { status: 404 },
        );
      }
      if (rx.status !== "Registrada") {
        return NextResponse.json({
          mode: "simulated",
          reason: `prescription is ${rx.status}, not Registrada`,
        });
      }

      const contract = new Contract(CONTRACT_IDS.prescriptionSoulbound);
      const op = contract.call(
        "activate",
        new Address(doctor.publicKey()).toScVal(),
        nativeToScVal(BigInt(rxId), { type: "u64" }),
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
      const submit = await feeBumpAndSend(prepared.toXDR());

      return NextResponse.json({
        mode: "onchain",
        status: submit.status,
        hash: submit.hash,
        explorer: STELLAR_EXPERT_TX(submit.hash),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ mode: "simulated", reason: detail });
    }
  }

  return NextResponse.json({
    mode: "simulated",
    reason: "no doctor signer configured (DEMO_DOCTOR_SECRET/RELAYER_SECRET)",
  });
}
