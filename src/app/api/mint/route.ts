/**
 * POST /api/mint — issue a prescription.
 * ---------------------------------------------------------------------------
 * Body: { patient (wallet), plus the full Decreto 41 record — patient identity,
 *         prescriber/clinic, clinical content, optional consent }.
 *
 * 1. Assembles a Decreto 41 compliant record, validates the mandatory fields,
 *    builds a canonical FHIR R4 Bundle and derives
 *    rx_hash = SHA-256(canonical bundle) — the 32-byte anchor stored on-chain.
 * 2. Explicit Testnet demo mode requires verified doctor identity, active DB
 *    role, configured email/signer binding, and one configured synthetic patient.
 *    Only then performs a REAL, gasless mint:
 *    the doctor keypair signs the invoke (satisfying require_auth, since the
 *    doctor is the tx source), then the relayer fee-bumps and submits it so the
 *    doctor spends no XLM. Returns the on-chain rx id + tx hash.
 * 3. Explicit simulated mode never signs or writes the clinical log.
 *    Once a real mint is attempted, rejection/uncertainty returns an error,
 *    never simulated success. Callers must preserve issuance identity on retry.
 *
 * In production the doctor would sign step 2 with their passkey wallet in the
 * browser and POST the signed XDR to /api/relay; this server-signed path exists
 * so the flow is demonstrable end-to-end without passkey infra.
 */
import { createHash } from "node:crypto";
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
import { CONTRACT_IDS, NETWORK_PASSPHRASE, STELLAR_NETWORK, STELLAR_EXPERT_TX, isStellarAddress } from "@/lib/stellar/config";
import { server, isDoctorAuthorized } from "@/lib/stellar/client";
import { feeBumpAndSend, getDemoDoctorSecret } from "@/lib/stellar/server";
import { withSignerLock } from "@/lib/stellar/serialize";
import { canonicalize, validateDecreto41 } from "@/lib/decreto41";
import { buildDecreto41Bundle } from "@/lib/fhir";
import { getDb } from "@/lib/db";
import { requireUser, isDoctor, authEnforced, unauthorized, forbidden } from "@/lib/auth/privy-auth";
import { isPrescriptionIssuance, type PrescriptionIssuance } from "@/lib/prescription-issuance";
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
  mode?: "simulated" | "testnet-demo";
  issuance?: PrescriptionIssuance;
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
  doctorEmail?: string;
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
  if (process.env.TRUSTLEAF_PRIVATE_PORTAL_ENABLED === 'true') {
    return NextResponse.json({error:'private_prescription_flow_not_enabled'}, {status:409});
  }
  let body: MintBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // Simulation is explicit and never uses a signer or writes clinical records.
  const simulation = body.mode === "simulated";
  const user = await requireUser(request);
  if ((!simulation || authEnforced()) && !user?.email) return unauthorized();
  let doctorSecret: string | undefined;
  if (!simulation) {
    if (body.mode !== "testnet-demo" || process.env.TRUSTLEAF_ENABLE_TESTNET_DEMO_MINT !== "true" || STELLAR_NETWORK !== "testnet") {
      return NextResponse.json({ error: "Server signing is disabled" }, { status: 403 });
    }
    const email = process.env.TRUSTLEAF_DEMO_DOCTOR_EMAIL?.trim().toLowerCase();
    if (!email || user!.email !== email || (body.doctorEmail != null && (typeof body.doctorEmail !== "string" || body.doctorEmail.trim().toLowerCase() !== email))) return forbidden();
    try {
      if (!await isDoctor(getDb(), user!)) return forbidden();
    } catch {
      return NextResponse.json({ error: "Doctor authorization unavailable" }, { status: 503 });
    }
    doctorSecret = getDemoDoctorSecret() ?? undefined;
    try {
      if (!doctorSecret || Keypair.fromSecret(doctorSecret).publicKey() !== process.env.TRUSTLEAF_DEMO_DOCTOR_WALLET || !process.env.TRUSTLEAF_DEMO_PATIENT_WALLET || body.patient !== process.env.TRUSTLEAF_DEMO_PATIENT_WALLET) return forbidden();
    } catch { return forbidden(); }
    // Audit attribution always comes from verified identity, never the body.
    body.doctorEmail = user!.email!;
  }

  const stringFields = ["patient", "medication", "dosage", "notes", "patientName", "patientDocNumber", "patientBirthDate", "patientAddress", "patientPhone", "patientEmail", "doctorName", "doctorRut", "doctorSpecialty", "clinicName", "clinicRut", "diagnosis", "cie10Code", "representativeName", "representativeRut"] as const;
  if (stringFields.some((key) => body[key] != null && typeof body[key] !== "string")) return NextResponse.json({ error: "Invalid text field" }, { status: 400 });

  const patient = (body.patient ?? "").trim();
  if (!isPrescriptionIssuance(body.issuance) || Date.parse(body.issuance.issuedAt) > Date.now() + 300_000) {
    return NextResponse.json({ error: "Falta una identidad de emisión válida. Reutilízala en cada reintento." }, { status: 400 });
  }
  const medication = (body.medication ?? "").trim();
  const dosage = (body.dosage ?? "").trim();
  // "Cantidad a dispensar" (Decreto 41) drives the on-chain units_total.
  const quantity = Number(body.quantity ?? body.units ?? 1);
  const refills = Number(body.refills ?? 0);
  if ([body.quantity, body.units, body.refills].some((v) => v != null && typeof v !== "number" && typeof v !== "string")) return NextResponse.json({ error: "Invalid numeric field" }, { status: 400 });
  const validityDays = Number(process.env.NEXT_PUBLIC_RX_VALIDITY_DAYS ?? 30);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 0xffffffff || !Number.isInteger(refills) || refills < 0 || refills > 0xffffffff) return NextResponse.json({ error: "Invalid quantity or refills" }, { status: 400 });
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) return NextResponse.json({ error: "Invalid prescription validity configuration" }, { status: 503 });
  if (Date.parse(body.issuance.issuedAt) + validityDays * 86400000 <= Date.now()) return NextResponse.json({ error: "Issuance has expired" }, { status: 400 });
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
      refills,
      prescriptionType: body.prescriptionType ?? "SIMPLE",
    },
    consent: {
      granted: Boolean(body.consentGranted),
      date: body.consentGranted ? body.consentDate ?? null : null,
    },
    issuedAt: body.issuance.issuedAt,
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
  const payload = canonicalize({ ...bundle, identifier: { system: "urn:trustleaf:prescription-issuance", value: body.issuance.id } });
  const rxHash = createHash("sha256").update(payload).digest(); // Buffer(32)

  const patientIsG = isStellarAddress(patient);

  // Off-chain mirror of the issuance so /admin/historial can surface recetas
  // (the chain is the source of truth; this is only for observability). Never
  // blocks or fails the mint — best-effort.
  const logPrescription = async (result: { mode: string; rxId: string | null; hash: string | null }) => {
    try {
      const sql = getDb();
      await sql`
        INSERT INTO prescriptions_log
          (rx_id, tx_hash, mode, patient_email, patient_name, doctor_email,
           medication, dosage, quantity, cie10, diagnosis, prescription_type)
        VALUES
          (${result.rxId}, ${result.hash ?? null}, ${result.mode},
           ${body.patientEmail ?? null}, ${body.patientName ?? null}, ${body.doctorEmail ?? null},
           ${medication}, ${dosage}, ${quantity},
           ${body.cie10Code ?? null}, ${body.diagnosis ?? null}, ${body.prescriptionType ?? null})`;
    } catch (err) {
      console.error("[mint] prescriptions_log", err);
    }
  };

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
        issuedAt: record.issuedAt,
      });
      await logPrescription(result);
      return NextResponse.json(result);
    } catch (err) {
      // A rejected or uncertain real submission must never look like success.
      const duplicate = err instanceof DuplicatePrescriptionError;
      return NextResponse.json({
        error: duplicate ? "Esta receta ya fue emitida. Revisa tus recetas antes de crear otra." : "No se confirmó la emisión. Reintenta conservando los mismos datos.",
        code: duplicate ? "DUPLICATE_PRESCRIPTION" : "MINT_NOT_CONFIRMED",
        rxHash: rxHash.toString("hex"),
      }, { status: duplicate ? 409 : 502 });
    }
  }

  // 3. Simulated fallback.
  if (!simulation) return NextResponse.json({ error: "Invalid configured demo patient" }, { status: 403 });
  return NextResponse.json(simulated(rxHash, "explicit simulation; no transaction or clinical record written"));
}

export const POST = handleMint;

async function realMint(args: {
  issuedAt: string;
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
  const expiresAt = Math.floor(Date.parse(args.issuedAt) / 1000) + validityDays * 24 * 60 * 60;

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

    let prepared;
    try {
      prepared = await server.prepareTransaction(tx);
    } catch (err) {
      // Soroban's simulation diagnostic for the contract's explicit error 8.
      if (err instanceof Error && /Error\(Contract, #8\)/.test(err.message)) throw new DuplicatePrescriptionError();
      throw err;
    }
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
        if (err instanceof DuplicatePrescriptionError) throw err;
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
    // No transaction happened, so there is no transaction hash. This used to be
    // randomBytes(32) — a value indistinguishable from a real one, stored in
    // prescriptions_log.tx_hash and rendered by /admin/historial as a link to
    // stellar.expert, where it resolves to nothing. rxHash below is the real
    // SHA-256 of the prescription and is what the simulated path has to show.
    hash: null,
    rxHash: rxHash.toString("hex"),
    reason,
  };
}

class DuplicatePrescriptionError extends Error {}
