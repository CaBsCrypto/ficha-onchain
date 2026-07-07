/**
 * POST /api/revoke — cancel a prescription (Registrada|Activa → Revocada).
 * Body: { rxId: string }
 *
 * revoke_prescription(rx_id) requires the *issuing* doctor's signature. When the
 * configured DEMO_DOCTOR_SECRET is that issuer, we sign + fee-bump a real revoke;
 * otherwise we return a simulated success so the demo UI stays interactive.
 */
import { NextResponse } from "next/server";
import {
  Contract,
  Keypair,
  nativeToScVal,
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { CONTRACT_IDS, NETWORK_PASSPHRASE, STELLAR_EXPERT_TX } from "@/lib/stellar/config";
import { server, getPrescription } from "@/lib/stellar/client";
import { feeBumpAndSend } from "@/lib/stellar/server";
import { withAuth } from "@/lib/auth/withAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleRevoke(request: Request) {
  let body: { rxId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rxId = String(body.rxId ?? "").trim();
  if (!rxId) {
    return NextResponse.json({ error: "rxId is required" }, { status: 400 });
  }

  const doctorSecret = process.env.RELAYER_SECRET
    ? process.env.DEMO_DOCTOR_SECRET
    : undefined;

  if (doctorSecret) {
    try {
      const doctor = Keypair.fromSecret(doctorSecret);
      const rx = await getPrescription(rxId);
      if (rx && rx.doctorWallet === doctor.publicKey()) {
        const contract = new Contract(CONTRACT_IDS.prescriptionSoulbound);
        const op = contract.call(
          "revoke_prescription",
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
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ mode: "simulated", reason: detail });
    }
  }

  return NextResponse.json({
    mode: "simulated",
    reason: "not the issuing doctor / no signer configured",
  });
}

// Revoking a prescription is a doctor action — guard it (demo mode passes through).
export const POST = withAuth(handleRevoke, { role: "doctor" });
