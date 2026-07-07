/**
 * Decreto 41 MINSAL (Chile) — validation + helpers for prescription content.
 * ---------------------------------------------------------------------------
 * Browser-safe (no node APIs): imported by both the doctor form (client) and
 * the mint API (server). Provides:
 *   - Chilean RUT validation / formatting (módulo 11).
 *   - Display metadata (labels + option lists) for the Decreto 41 enums.
 *   - `validateDecreto41` — enforces the mandatory fields before a receta is
 *     hashed and anchored on-chain.
 *   - `canonicalizeDecreto41` — deterministic JSON used as the SHA-256 preimage.
 */
import type {
  Decreto41Prescription,
  PatientDocType,
  HealthSystem,
  PrescriptionType,
  Sex,
} from "@/types";

/* --------------------------------- RUT ----------------------------------- */

/** Strip dots and hyphen, uppercase the check digit. e.g. "12.345.678-5" → "123456785". */
export function normalizeRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

/** Validate a Chilean RUT/RUN via the módulo-11 check digit. */
export function isValidRut(rut: string): boolean {
  const clean = normalizeRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  return dv === expected;
}

/** Format a RUT as XX.XXX.XXX-X (returns the input untouched if not parseable). */
export function formatRut(rut: string): string {
  const clean = normalizeRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

/* ----------------------------- Display metadata -------------------------- */

export const DOCUMENT_TYPE_LABELS: Record<PatientDocType, string> = {
  RUT: "RUT",
  PASAPORTE: "Pasaporte",
  OTRO: "Otro documento",
};

export const SEX_LABELS: Record<Sex, string> = {
  MASCULINO: "Masculino",
  FEMENINO: "Femenino",
  INTERSEX: "Intersex",
  NO_ESPECIFICADO: "No especificado",
};

export const HEALTH_SYSTEM_LABELS: Record<HealthSystem, string> = {
  FONASA: "FONASA",
  ISAPRE: "ISAPRE",
  PARTICULAR: "Particular",
  OTRO: "Otro",
};

export const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  SIMPLE: "Receta simple",
  RETENIDA: "Receta retenida (cheque)",
  MAGISTRAL: "Receta magistral",
};

export const DOCUMENT_TYPE_OPTIONS = Object.keys(
  DOCUMENT_TYPE_LABELS,
) as PatientDocType[];
export const SEX_OPTIONS = Object.keys(SEX_LABELS) as Sex[];
export const HEALTH_SYSTEM_OPTIONS = Object.keys(
  HEALTH_SYSTEM_LABELS,
) as HealthSystem[];
export const PRESCRIPTION_TYPE_OPTIONS = Object.keys(
  PRESCRIPTION_TYPE_LABELS,
) as PrescriptionType[];

/* ------------------------------ Validation ------------------------------- */

export interface Decreto41ValidationResult {
  ok: boolean;
  /** Human-readable, field-prefixed messages (Spanish) for API 400 responses. */
  errors: string[];
}

function req(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

/**
 * Enforce the Decreto 41 mandatory field set. Optional fields (legal
 * representative, CIE-10, informed consent) are validated only when present.
 */
export function validateDecreto41(
  rx: Decreto41Prescription,
): Decreto41ValidationResult {
  const errors: string[] = [];
  const { patient, prescriber, content, consent } = rx;

  // --- Paciente ---
  if (!req(patient?.fullName)) errors.push("Paciente: falta el nombre completo.");
  if (!req(patient?.documentNumber))
    errors.push("Paciente: falta el número de documento.");
  else if (
    patient.documentType === "RUT" &&
    !isValidRut(patient.documentNumber)
  )
    errors.push("Paciente: el RUT no es válido (dígito verificador).");
  if (!req(patient?.sex)) errors.push("Paciente: falta el sexo.");
  if (!req(patient?.birthDate))
    errors.push("Paciente: falta la fecha de nacimiento.");
  if (!req(patient?.address)) errors.push("Paciente: falta el domicilio.");
  if (!req(patient?.phone) && !req(patient?.email))
    errors.push("Paciente: indique al menos un teléfono o email de contacto.");
  if (!req(patient?.healthSystem))
    errors.push("Paciente: falta el sistema de salud.");

  // Representante legal — opcional, pero si viene uno debe estar completo.
  if (patient?.legalRepresentative) {
    const rep = patient.legalRepresentative;
    if (!req(rep.fullName))
      errors.push("Representante legal: falta el nombre.");
    if (!req(rep.rut) || !isValidRut(rep.rut))
      errors.push("Representante legal: RUT inválido.");
  }

  // --- Prescriptor / prestador ---
  if (!req(prescriber?.fullName))
    errors.push("Médico: falta el nombre completo.");
  if (!req(prescriber?.rut) || !isValidRut(prescriber?.rut))
    errors.push("Médico: RUT inválido.");
  if (!req(prescriber?.specialty))
    errors.push("Médico: falta la especialidad.");
  if (!req(prescriber?.clinicName))
    errors.push("Prestador: falta el nombre de la clínica.");
  if (!req(prescriber?.clinicRut) || !isValidRut(prescriber?.clinicRut))
    errors.push("Prestador: RUT de la clínica inválido.");

  // --- Contenido clínico ---
  if (!req(content?.medication))
    errors.push("Contenido: falta el medicamento.");
  if (!req(content?.dosage)) errors.push("Contenido: falta la dosis.");
  if (!req(content?.diagnosis))
    errors.push("Contenido: falta el diagnóstico o indicación clínica.");
  if (!(Number(content?.quantity) > 0))
    errors.push("Contenido: la cantidad a dispensar debe ser mayor a 0.");
  if (Number(content?.refills) < 0)
    errors.push("Contenido: las repeticiones no pueden ser negativas.");
  if (!req(content?.prescriptionType))
    errors.push("Contenido: falta el tipo de receta.");

  // --- Consentimiento (opcional) ---
  if (consent?.granted && !req(consent.date))
    errors.push("Consentimiento: falta la fecha del consentimiento firmado.");

  return { ok: errors.length === 0, errors };
}

/* ---------------------------- Canonicalization --------------------------- */

/** Recursively sort object keys so JSON.stringify is deterministic. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Deterministic JSON of any value with keys sorted recursively — used as the
 * SHA-256 preimage so the same content always yields the same hash regardless
 * of field insertion order.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** Canonical JSON of a Decreto 41 record (convenience wrapper). */
export function canonicalizeDecreto41(rx: Decreto41Prescription): string {
  return canonicalize(rx);
}
