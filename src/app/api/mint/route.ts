/**
 * POST /api/mint — issue a prescription.
 * ---------------------------------------------------------------------------
 * Body: { patient (wallet), plus the full Decreto 41 record — patient identity,
 *         prescriber/clinic, clinical content, optional consent }.
 *
 * 1. Assembles a Decreto 41 compliant record, validates the mandatory fields,
 *    builds a canonical FHIR R4 Bundle and derives
 *    rx_hash = SHA-256(canonical bundle) — the 32-byte anchor stored on-chain.
 * 2. If DEMO_DOCTOR_SECRET is set, performs a REAL, gasless mint:
 *    the doctor keypair signs the invoke (satisfying require_auth, since the
 *    doctor is the tx source), then the relayer fee-bumps and submits it so the
 *    doctor spends no XLM. Returns the on-chain rx id + tx hash.
 * 3. If the signer is missing, or the doctor isn't authorized in DoctorRegistry,
 *    or the network rejects the tx, returns a SIMULATED success (mode:"simulated")
 *    with the reason — the UI flow still completes for the demo.
 *
 * In production the doctor would sign step 2 with their passkey wallet in the
 * browser and POST the signed XDR to /api/relay; this server-signed path exists
 * so the flow is demonstrable end-to-end without passkey infra.
 */
import { createHash, randomBytes } from "node:crypto";
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
import { server, isDoctorAuthorized } from "@/lib/stellar/client";
import { feeBumpAndSend, getDemoDoctorSecret } from "@/lib/stellar/server";
import { withSignerLock } from "@/lib/stellar/serialize";
import { canonicalize, validateDecreto41 } from "@/lib/decreto41";
import { buildDecreto41Bundle } from "@/lib/fhir";
import { requireAuthOrDemo } from "@/lib/auth/privy-auth";
import type {
  Decreto41Prescription,
  PatientDocType,
  HealthSystem,
  PrescriptionType,
  Sex,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MintBody {
  /** On-chain patient wallet (G…) or demo name. */
  patient?: string;
  medication?: string;
  dosage?: string;
  units?: number | string;
  notes?: string;
  // --- Decreto 41: identificación del paciente ---
  patientName?: string;
  patientDocType?: PatientDocType;
  patientDocNumber?: string;
  patientSex?: Sex;
  patientBirthDate?: string;
  patientAddress?: string;
  patientPhone?: string;
  patientEmail?: string;
  healthSystem?: HealthSystem;
  representativeName?: string;
  representativeRut?: string;
  // --- Decreto 41: prescriptor / prestador ---
  doctorName?: string;
  doctorRut?: string;
  doctorSpecialty?: string;
  clinicName?: string;
  clinicRut?: string;
  // --- Decreto 41: contenido clínico ---
  diagnosis?: string;
  cie10Code?: string;
  quantity?: number | string;
  refills?: number | string;
  prescriptionType?: PrescriptionType;
  // --- Decreto 41: consentimiento ---
  consentGranted?: boolean;
  consentDate?: string | null;
}

async function handleMint(request: Request) {
  // Issuing a prescription is a doctor action — guard it (demo mode passes through).
  const gate = await requireAuthOrDemo(request);
  if (gate) return gate.error;

  let body: MintBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patient = (body.patient ?? "").trim();
  const medication = (body.medication ?? "").trim();
  const dosage = (body.dosage ?? "").trim();
  // "Cantidad a dispensar" (Decreto 41) drives the on-chain units_total.
  const quantity = Math.max(
    1,
    Math.floor(Number(body.quantity ?? body.units) || 1),
  );
  const units = quantity;

  // 1. Assemble the Decreto 41 compliant record.
  const record: Decreto41Prescription = {
    patient: {
      fullName: (body.patientName ?? "").trim(),
      documentType: body.patientDocType ?? "RUT",
      documentNumber: (body.patientDocNumber ?? "").trim(),
      sex: body.patientSex ?? "NO_ESPECIFICADO",
      birthDate: (body.patientBirthDate ?? "").trim(),
      address: (body.patientAddress ?? "").trim(),
      phone: body.patientPhone?.trim() || undefined,
      email: body.patientEmail?.trim() || undefined,
      healthSystem: body.healthSystem ?? "PARTICULAR",
      legalRepresentative:
        body.representativeName?.trim() || body.representativeRut?.trim()
          ? {
              fullName: (body.representativeName ?? "").trim(),
              rut: (body.representativeRut ?? "").trim(),
            }
          : undefined,
    },
    prescriber: {
      fullName: (body.doctorName ?? "").trim(),
      rut: (body.doctorRut ?? "").trim(),
      specialty: (body.doctorSpecialty ?? "").trim(),
      clinicName: (body.clinicName ?? "").trim(),
      clinicRut: (body.clinicRut ?? "").trim(),
    },
    content: {
      medication,
      dosage,
      instructions: body.notes?.trim() || undefined,
      diagnosis: (body.diagnosis ?? "").trim(),
      cie10Code: body.cie10Code?.trim() || undefined,
      quantity,
      refills: Math.max(0, Math.floor(Number(body.refills) || 0)),
      prescriptionType: body.prescriptionType ?? "SIMPLE",
    },
    consent: {
      granted: Boolean(body.consentGranted),
      date: body.consentGranted ? body.consentDate ?? null : null,
    },
    issuedAt: new Date().toISOString(),
  };

  // 2. Enforce Decreto 41 mandatory fields before anchoring anything on-chain.
  const validation = validateDecreto41(record);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios del Decreto 41", details: validation.errors },
      { status: 400 },
    );
  }

  if (!patient) {
    return NextResponse.json(
      { error: "patient (wallet o nombre demo) es obligatorio" },
      { status: 400 },
    );
  }

  // 3. Canonical FHIR Bundle → rx_hash (32 bytes).
  const bundle = buildDecreto41Bundle(record);
  const payload = canonicalize(bundle);
  const rxHash = createHash("sha256").update(payload).digest(); // Buffer(32)

  const patientIsG = isStellarAddress(patient);
  const doctorSecret = getDemoDoctorSecret();

  // 2. Attempt a real on-chain mint when we have a signer + a valid patient addr.
  if (doctorSecret && patientIsG) {
    try {
      const result = await realMint({
        doctorSecret,
        patient,
        rxHash,
        medication,
        dosage,
        units,
      });
      return NextResponse.json(result);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return NextResponse.json(simulated(rxHash, `on-chain mint failed: ${detail}`));
    }
  }

  // 3. Simulated fallback.
  const reason = !doctorSecret
    ? "no doctor signer configured (DEMO_DOCTOR_SECRET/RELAYER_SECRET)"
    : "patient is not a Stellar address";
  return NextResponse.json(simulated(rxHash, reason));
}

export const POST = handleMint;

async function realMint(args: {
  doctorSecret: string;
  patient: string;
  rxHash: Buffer;
  medication: string;
  dosage: string;
  units: number;
}) {
  const doctor = Keypair.fromSecret(args.doctorSecret);

  const authorized = await isDoctorAuthorized(doctor.publicKey());
  if (!authorized) {
    throw new Error(
      "doctor wallet is not authorized in DoctorRegistry (admin must register it)",
    );
  }

  // Chile's Decreto 41 gives a prescription a validity window rather than the
  // contract deriving one, so expiry is computed here and stored on-chain.
  const validityDays = Number(process.env.NEXT_PUBLIC_RX_VALIDITY_DAYS ?? 30);
  const expiresAt = Math.floor(Date.now() / 1000) + validityDays * 24 * 60 * 60;

  const contract = new Contract(CONTRACT_IDS.prescriptionSoulbound);
  const op = contract.call(
    "mint_prescription",
    new Address(doctor.publicKey()).toScVal(),
    new Address(args.patient).toScVal(),
    xdr.ScVal.scvBytes(args.rxHash),
    nativeToScVal(args.medication, { type: "string" }),
    nativeToScVal(args.dosage, { type: "string" }),
    nativeToScVal(args.units, { type: "u32" }),
    nativeToScVal(expiresAt, { type: "u64" }),
  );

  // One build→prepare→sign→submit cycle; account fetched inside so each retry
  // gets a fresh sequence number.
  const attempt = async () => {
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
    // Relayer fee-bumps so the doctor spends no XLM.
    return feeBumpAndSend(prepared.toXDR());
  };

  // Serialize per doctor signer + retry, so a prescription mint never races the
  // consultation's ficha / exam / license invokes on the shared account
  // sequence (see stellar/serialize.ts).
  const { submit, lastError } = await withSignerLock(doctor.publicKey(), async () => {
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
    return { submit, lastError };
  });
  if (!submit || submit.status !== "SUCCESS") {
    throw new Error(
      submit ? `transaction ${submit.status} (${submit.hash})` : String(lastError),
    );
  }

  const rxId =
    submit.returnValue != null
      ? String(scValToNative(submit.returnValue))
      : null;

  return {
    mode: "onchain" as const,
    rxId,
    hash: submit.hash,
    rxHash: args.rxHash.toString("hex"),
    explorer: STELLAR_EXPERT_TX(submit.hash),
  };
}

function simulated(rxHash: Buffer, reason: string) {
  return {
    mode: "simulated" as const,
    rxId: null,
    hash: randomBytes(32).toString("hex"),
    rxHash: rxHash.toString("hex"),
    reason,
  };
}
