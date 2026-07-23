/**
 * Patient → ClinicalRecord directory — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * Resolves a patient (identified by RUT) to THEIR on-chain ClinicalRecord
 * contract. This is what makes "1 paciente = 1 ficha" real: instead of every
 * append landing in the single hard-coded demo contract (the patient-mixing bug
 * flagged in docs/ARCHITECTURE_REVIEW.md), each patient maps to their own record
 * via the `patient_records` table, keyed by rut_hash (never the raw RUT).
 *
 * `env` isolates sandbox from real data end-to-end: a 'sandbox' lookup can only
 * ever see 'sandbox' rows, so hackathon writes and production data never cross.
 *
 * Per-patient contract DEPLOY (a fresh ClinicalRecord owned by the patient) is
 * deferred — it needs the contract WASM installed on testnet, which goes through
 * CI (WDAC blocks local Rust builds). For the sandbox we point every row at one
 * shared TOY contract (SANDBOX_CLINICAL_RECORD_ID); see provisionLiveRecord.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { getDb } from "@/lib/db";
import { hashRut } from "@/lib/identity/rut";
import { deployClinicalRecord, getSandboxOwnerSecret } from "@/lib/stellar/server";

export type RecordEnv = "sandbox" | "live";

export interface PatientRecord {
  /** HMAC of the RUT — the directory key. The raw RUT is never stored here. */
  rutHash: string;
  env: RecordEnv;
  /** C… ClinicalRecord contract id, or null until the record is provisioned. */
  contractId: string | null;
  /** G… owner wallet of the record, when known. */
  patientWallet: string | null;
  /** True once a contract is assigned (contractId is non-null). */
  provisioned: boolean;
}

/**
 * Resolve a patient's ClinicalRecord for the given environment. Returns null
 * when no directory row exists (the caller decides whether to provision or to
 * reject with a "patient not enrolled" error — for health data we fail closed,
 * we do NOT silently fall back to a shared record).
 *
 * @throws {RutError} if the RUT is invalid or the pepper is misconfigured.
 */
export async function resolvePatientRecord(
  rut: string,
  env: RecordEnv = "sandbox",
): Promise<PatientRecord | null> {
  const rutHash = hashRut(rut);
  const sql = getDb();
  const rows = await sql<{
    contract_id: string | null;
    patient_wallet: string | null;
  }>`
    SELECT contract_id, patient_wallet
    FROM patient_records
    WHERE rut_hash = ${rutHash} AND env = ${env}
    LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    rutHash,
    env,
    contractId: r.contract_id,
    patientWallet: r.patient_wallet,
    provisioned: r.contract_id != null,
  };
}

/**
 * Ensure a SANDBOX directory row exists for this patient, pointing at the shared
 * toy ClinicalRecord (SANDBOX_CLINICAL_RECORD_ID). Idempotent via the
 * UNIQUE(rut_hash, env) index. This is the sandbox stand-in for real
 * provisioning — it lets the end-to-end flow run without deploying a contract
 * per patient. NEVER used for 'live': sandbox rows share one toy contract, which
 * is fine for throwaway data but would mix real patients.
 */
export async function ensureSandboxRecord(
  rut: string,
  patientWallet?: string,
): Promise<PatientRecord> {
  // Already provisioned → reuse it (never redeploy a patient's record).
  const existing = await resolvePatientRecord(rut, "sandbox");
  if (existing?.contractId) return existing;

  const rutHash = hashRut(rut);
  const sql = getDb();

  // Reserve the directory slot FIRST with contract_id NULL. This way a deploy
  // that later fails leaves an UNPROVISIONED row (→ the flow degrades to
  // simulated), and we NEVER fall back to a shared record — that would mix
  // patients, exactly what per-patient records exist to prevent. Fail closed.
  await sql`
    INSERT INTO patient_records (rut_hash, env, contract_id, patient_wallet)
    VALUES (${rutHash}, 'sandbox', NULL, ${patientWallet ?? null})
    ON CONFLICT (rut_hash, env) DO NOTHING`;

  // A concurrent call may have already provisioned it between our check and now.
  const afterReserve = await resolvePatientRecord(rut, "sandbox");
  if (afterReserve?.contractId) return afterReserve;

  // Deploy a per-patient ClinicalRecord (owner = sandbox owner key we control;
  // the real patient key is Fase 2). If we can't deploy, stay unprovisioned —
  // no shared-contract fallback.
  const ownerSecret = getSandboxOwnerSecret();
  if (!ownerSecret) return afterReserve as PatientRecord;

  let contractId: string;
  try {
    const ownerAddress = Keypair.fromSecret(ownerSecret).publicKey();
    contractId = await deployClinicalRecord({ ownerAddress, deployerSecret: ownerSecret });
  } catch (e) {
    console.error(
      "[patient-records] deploy por-paciente falló; queda sin anclar (simulated). " +
        "NO se comparte contrato para no mezclar pacientes:",
      e,
    );
    return afterReserve as PatientRecord;
  }

  // Claim the fresh contract for THIS patient only if nobody else did, so a
  // concurrent deploy can't overwrite the winner (the loser's contract is
  // orphaned on-chain but no patient data is ever mixed).
  await sql`
    UPDATE patient_records
      SET contract_id  = ${contractId},
          patient_wallet = COALESCE(patient_wallet, ${patientWallet ?? null}),
          updated_at   = NOW()
    WHERE rut_hash = ${rutHash} AND env = 'sandbox' AND contract_id IS NULL`;
  const rec = await resolvePatientRecord(rut, "sandbox");
  return rec as PatientRecord;
}

/**
 * Live provisioning: deploy a fresh ClinicalRecord owned by the patient and
 * record it in the directory. DEFERRED — requires the clinical-record WASM
 * installed on testnet (via CI) plus a random deploy salt (see PR-0c, C7).
 * Intentionally throws so nothing enables real per-patient records by accident.
 */
export async function provisionLiveRecord(): Promise<never> {
  throw new Error(
    "provisionLiveRecord no implementado: requiere el deploy de un ClinicalRecord " +
      "por paciente (WASM en testnet vía CI). Ver docs/ARCHITECTURE_REVIEW.md, fase de deploy.",
  );
}
