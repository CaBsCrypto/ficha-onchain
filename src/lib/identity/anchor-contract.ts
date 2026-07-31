/**
 * Contrato de anclaje por paciente para las rutas de la APP — SERVER ONLY.
 * ---------------------------------------------------------------------------
 * Las rutas de ficha (entry/document/grant/patient-record/patient-grants)
 * anclaban TODO en el contrato demo compartido (`CONTRACT_IDS.clinicalRecordDemo`),
 * mezclando pacientes. El MCP ya resuelve un ClinicalRecord POR paciente vía
 * `patient_records` (keyed por rut_hash) — este helper conecta las rutas de la
 * app a ese mismo directorio:
 *
 *   email → RUT (patient_health_records) → ensureSandboxRecord(rut) → contract_id
 *
 * FALLBACK deliberado: si el paciente no tiene RUT válido registrado, el pepper
 * no está configurado, la DB falla o el deploy no provisiona, caemos al contrato
 * demo con un console.warn. El fallback conserva el comportamiento previo — un
 * problema de identidad NUNCA rompe el flujo clínico de la demo.
 *
 * FIRMANTE del owner: grant/revoke (`grant_write_access`/`revoke_write_access`)
 * deben firmarse con el OWNER del contrato, y ese owner es distinto según el caso:
 *   - contrato demo         → DEMO_PATIENT_SECRET (el paciente demo es el owner);
 *   - contrato por-paciente → SANDBOX_OWNER_SECRET (ensureSandboxRecord despliega
 *     con esa llave como owner custodial; ver patient-records.ts).
 * Por eso la resolución devuelve también `ownerSecret`: firmar el contrato
 * por-paciente con la llave del demo revertiría Unauthorized. LIMITACIÓN
 * conocida: en `live` el owner será la wallet del propio paciente (Privy) y no
 * tendremos su secreto — ese caso queda en fallback demo hasta la Fase 2.
 */
import { getDb } from "@/lib/db";
import { CONTRACT_IDS } from "@/lib/stellar/config";
import { ensureSandboxRecord } from "@/lib/identity/patient-records";
import { isValidRut } from "@/lib/identity/rut";
import { getDemoPatientSecret, getSandboxOwnerSecret } from "@/lib/stellar/server";

export interface AnchorContract {
  /** C… ClinicalRecord donde anclar las entradas de este paciente. */
  contractId: string;
  /** true cuando es el contrato demo compartido (fallback legacy). */
  isDemo: boolean;
  /**
   * Secreto del OWNER del contrato, para firmar grant/revoke. undefined cuando
   * el firmante correspondiente no está configurado en el entorno (→ el caller
   * degrada a mode:"simulated", igual que hoy).
   */
  ownerSecret: string | undefined;
}

/** Fallback al contrato demo compartido, conservando el comportamiento previo. */
function demoFallback(patientEmail: string, why: string): AnchorContract {
  console.warn(
    `[anchor-contract] ${patientEmail}: ${why} — anclando en el contrato demo compartido.`,
  );
  return {
    contractId: CONTRACT_IDS.clinicalRecordDemo,
    isDemo: true,
    ownerSecret: getDemoPatientSecret(),
  };
}

/**
 * Resuelve el ClinicalRecord donde anclar la ficha de `patientEmail`.
 *
 * Si el paciente tiene un RUT válido en `patient_health_records`, usa (o
 * provisiona) su contrato por-paciente en env sandbox. Cualquier otro caso cae
 * al contrato demo con un warn — nunca lanza, nunca rompe el flujo.
 */
export async function resolveAnchorContract(
  patientEmail: string | null | undefined,
): Promise<AnchorContract> {
  const email = (patientEmail ?? "").trim().toLowerCase();
  if (!email) return demoFallback("(sin email)", "sin email de paciente");

  let rut: string | null = null;
  try {
    const sql = getDb();
    const [row] = await sql<{ rut: string | null }>`
      SELECT rut FROM patient_health_records
      WHERE LOWER(patient_email) = ${email}
      LIMIT 1`;
    rut = row?.rut ?? null;
  } catch (e) {
    return demoFallback(email, `no se pudo leer el RUT (${e instanceof Error ? e.message : e})`);
  }

  if (!rut || !isValidRut(rut)) {
    return demoFallback(email, "sin RUT válido en patient_health_records");
  }

  try {
    // Sandbox: reutiliza el contrato del directorio o despliega uno nuevo con
    // el owner custodial (SANDBOX_OWNER_SECRET). Idempotente y fail-closed.
    const record = await ensureSandboxRecord(rut);
    if (!record?.contractId) {
      return demoFallback(email, "el registro por-paciente quedó sin provisionar");
    }
    return {
      contractId: record.contractId,
      isDemo: false,
      ownerSecret: getSandboxOwnerSecret(),
    };
  } catch (e) {
    // RutError (pepper ausente), fallo de deploy, DB, etc. — todo cae al demo.
    return demoFallback(
      email,
      `fallo resolviendo el contrato por-paciente (${e instanceof Error ? e.message : e})`,
    );
  }
}
