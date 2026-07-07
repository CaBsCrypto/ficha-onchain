/**
 * Shared TypeScript types for TrustLeaf
 */

export type Language = "en" | "es";

/** Actor role for the D2 portals (doctor / patient). */
export type Role = "doctor" | "patient";

/** Lifecycle status of an on-chain prescription (mirrors the Soroban contract). */
export type PrescriptionStatus = "active" | "dispensed" | "revoked" | "expired";

/** A blockchain-verified prescription record. */
export interface Prescription {
  /** Soulbound token id on Soroban. */
  id: string;
  doctorWallet: string;
  patientWallet: string;
  /** Keccak/sha hash of the encrypted FHIR payload. */
  rxHash: string;
  issuedAt: number;
  status: PrescriptionStatus;
}

/** A registered, credential-verified prescribing doctor. */
export interface Doctor {
  wallet: string;
  fullName: string;
  /** National medical license number. */
  licenseId: string;
  authorized: boolean;
  /**
   * Named permissions granted by the admin on the DoctorRegistry contract.
   * Values are Soroban Symbol strings, e.g. "CANNABIS", "MNT_HLTH".
   * An empty array means no specialised permissions have been granted.
   */
  permissions: string[];
}

/** Minimal patient profile shown on the on-chain card. */
export interface PatientProfile {
  fullName: string;
  wallet: string;
}

/** Waitlist signup payload. */
export interface WaitlistEntry {
  email: string;
  /** "doctor" | "patient" | undefined */
  role?: "doctor" | "patient";
  createdAt: number;
}

/* ===========================================================================
   Decreto 41 MINSAL (Chile) — Reglamento de recetas médicas.
   ---------------------------------------------------------------------------
   The Soroban PrescriptionSoulbound contract only stores the minimal on-chain
   fields (doctor, patient, rx_hash, medication, dosage, units). Every mandatory
   Decreto 41 field lives in the off-chain FHIR content that is SHA-256 hashed
   into `rx_hash`, so the on-chain anchor cryptographically covers the full,
   regulation-compliant record without bloating (or altering) the contract.

   These types are the single source of truth for that content — the doctor
   form collects them, the mint API validates + hashes them, and the patient /
   pharmacy views render them.
   =========================================================================== */

/** Tipo de documento de identidad del paciente. */
export type PatientDocType = "RUT" | "PASAPORTE" | "OTRO";

/** Sexo del paciente (Decreto 41 exige consignarlo). */
export type Sex = "MASCULINO" | "FEMENINO" | "INTERSEX" | "NO_ESPECIFICADO";

/** Sistema de salud / previsión del paciente. */
export type HealthSystem = "FONASA" | "ISAPRE" | "PARTICULAR" | "OTRO";

/** Tipo de receta según su régimen de control. */
export type PrescriptionType = "SIMPLE" | "RETENIDA" | "MAGISTRAL";

/** Representante legal (solo cuando aplica: menor de edad, interdicto, etc.). */
export interface LegalRepresentative {
  fullName: string;
  /** RUT del representante, formato XX.XXX.XXX-X. */
  rut: string;
}

/** Identificación del paciente (Decreto 41 — datos del paciente). */
export interface PatientIdentification {
  fullName: string;
  documentType: PatientDocType;
  /** RUT (XX.XXX.XXX-X), nº de pasaporte u otro documento. */
  documentNumber: string;
  sex: Sex;
  /** Fecha de nacimiento en ISO-8601 (yyyy-mm-dd). */
  birthDate: string;
  /** Domicilio / dirección del paciente. */
  address: string;
  phone?: string;
  email?: string;
  healthSystem: HealthSystem;
  /** Opcional — solo si el paciente actúa mediante representante legal. */
  legalRepresentative?: LegalRepresentative;
}

/** Identificación del prescriptor y del prestador institucional. */
export interface PrescriberIdentification {
  fullName: string;
  /** RUT del médico, formato XX.XXX.XXX-X. */
  rut: string;
  /** Especialidad médica del prescriptor. */
  specialty: string;
  /** Nombre de la clínica / prestador. */
  clinicName: string;
  /** RUT de la clínica / prestador, formato XX.XXX.XXX-X. */
  clinicRut: string;
}

/** Contenido clínico de la prescripción. */
export interface PrescriptionClinicalContent {
  medication: string;
  dosage: string;
  /** Instrucciones de uso (posología ampliada). */
  instructions?: string;
  /** Diagnóstico o indicación clínica. */
  diagnosis: string;
  /** Código CIE-10 (opcional). */
  cie10Code?: string;
  /** Cantidad total a dispensar. */
  quantity: number;
  /** Número de repeticiones permitidas (default 0). */
  refills: number;
  prescriptionType: PrescriptionType;
}

/** Consentimiento informado del paciente. */
export interface InformedConsent {
  /** ¿Firmó consentimiento informado? (default false). */
  granted: boolean;
  /** Fecha del consentimiento en ISO-8601, o null si no aplica. */
  date: string | null;
}

/**
 * Registro completo de receta conforme al Decreto 41. Es el objeto que se
 * canonicaliza y hashea (SHA-256) para producir el `rx_hash` anclado on-chain.
 */
export interface Decreto41Prescription {
  patient: PatientIdentification;
  prescriber: PrescriberIdentification;
  content: PrescriptionClinicalContent;
  consent: InformedConsent;
  /** Fecha de creación / emisión en ISO-8601. */
  issuedAt: string;
}

// ============================================================================
// Document System — Medical Certificates, Professional Licenses, Mental Health
// ============================================================================

/**
 * Nine document types across three categories, mirroring the DocType enum
 * in the `document-soulbound` Soroban contract.
 */
export type DocumentType =
  // ── Medical Certificates ──────────────────────────────────────────────────
  | "LaborRest"          // Reposo laboral: días de reposo, diagnóstico, médico
  | "LaborFitness"       // Aptitud laboral: apto/no apto, restricciones
  | "Disability"         // Incapacidad temporal o permanente
  // ── Professional Licenses ─────────────────────────────────────────────────
  | "MedicalLicense"     // Licencia médica: emisión / renovación / especialidad
  | "DegreeTitle"        // Certificado de título: médico, psicólogo, enfermero…
  | "ProfCredential"     // Credencial de habilitación profesional
  // ── Mental Health Certificates ────────────────────────────────────────────
  | "PsychCare"          // Atención psicológica (solo "paciente en tratamiento", sin diagnóstico)
  | "PsychEval"          // Evaluación psicológica (trámites laborales / legales)
  | "TreatmentDischarge"; // Alta de tratamiento psicológico

/** Broad category grouping for UI routing and display. */
export type DocumentCategory =
  | "medical_certificate"
  | "professional_license"
  | "mental_health";

/** Lifecycle status of an on-chain document (mirrors DocStatus enum in Soroban). */
export type DocumentStatus = "active" | "revoked" | "expired";

/**
 * An on-chain MedDocument record fetched from the `document-soulbound` contract.
 * All PII is off-chain; only the content hash is stored on the ledger.
 */
export interface MedDocument {
  /** Soulbound token id on Soroban. */
  id: string;
  docType: DocumentType;
  /** Wallet of the issuing professional or institution. */
  issuerWallet: string;
  /** Wallet of the document's subject / holder. */
  recipientWallet: string;
  /** Hex-encoded SHA-256 of the off-chain canonical payload. */
  contentHash: string;
  /** Ledger unix timestamp at issuance. */
  issuedAt: number;
  /** Ledger unix timestamp at expiry. 0 = does not expire. */
  expiresAt: number;
  status: DocumentStatus;
}

// ── Content types (off-chain payloads, hashed before on-chain anchoring) ──

/** Shared fields across all document content payloads. */
interface DocumentContentBase {
  resourceType: string;
  issuerName: string;         // Full name of signing professional / institution
  issuerLicenseId?: string;   // Professional license number (when applicable)
  recipientFullName: string;  // Subject name
  recipientIdNumber?: string; // National ID (stored off-chain only)
  issuedOn: string;           // ISO-8601 date
  notes?: string;
}

// ── Medical Certificates ──────────────────────────────────────────────────

export interface LaborRestContent extends DocumentContentBase {
  resourceType: "LaborRestCertificate";
  restDays: number;
  startDate: string;        // ISO-8601
  endDate: string;          // ISO-8601
  diagnosisCode?: string;   // ICD-10, stored off-chain
  diagnosisText?: string;   // Free text, stored off-chain
}

export interface LaborFitnessContent extends DocumentContentBase {
  resourceType: "LaborFitnessCertificate";
  fitnessResult: "apt" | "not_apt" | "apt_with_restrictions";
  restrictions?: string[];
  validUntil?: string;      // ISO-8601
}

export interface DisabilityContent extends DocumentContentBase {
  resourceType: "DisabilityCertificate";
  disabilityType: "temporary" | "permanent";
  percentage?: number;      // 0–100 (for permanent disability grading)
  startDate: string;        // ISO-8601
  endDate?: string;         // ISO-8601 (omitted for permanent)
  diagnosisCode?: string;
}

// ── Professional Licenses ─────────────────────────────────────────────────

export interface MedicalLicenseContent extends DocumentContentBase {
  resourceType: "MedicalLicenseCertificate";
  licenseType: "issuance" | "renewal";
  specialty: string;
  licenseNumber: string;
  validFrom: string;        // ISO-8601
  validUntil: string;       // ISO-8601
  issuingBody: string;      // e.g., "Colegio Médico de Chile"
}

export interface DegreeTitleContent extends DocumentContentBase {
  resourceType: "DegreeTitleCertificate";
  profession: string;       // "Médico", "Psicólogo", "Enfermero/a", etc.
  university: string;
  graduationDate: string;   // ISO-8601
  registrationNumber?: string; // Ministerial registration
}

export interface ProfCredentialContent extends DocumentContentBase {
  resourceType: "ProfCredentialCertificate";
  credentialType: string;   // Free text — varies by regulatory body
  profession: string;
  issuingBody: string;
  validFrom: string;        // ISO-8601
  validUntil?: string;      // ISO-8601
}

// ── Mental Health Certificates ────────────────────────────────────────────

/**
 * PRIVACY NOTE: PsychCare certificates intentionally contain NO clinical
 * diagnosis, no DSM/ICD codes, and no treatment details. The only statement
 * is that the named person is / was under psychological care. This design
 * protects patient privacy while satisfying administrative requirements.
 */
export interface PsychCareContent extends DocumentContentBase {
  resourceType: "PsychCareAttendanceCertificate";
  attendanceStatus: "in_treatment" | "completed_treatment";
  approximatePeriod?: string; // e.g., "enero–junio 2025" (no exact dates required)
  purposeOfCertificate?: string; // e.g., "trámite laboral", "uso personal"
  // ⚠ NO diagnosis, NO session count, NO clinical notes stored.
}

export interface PsychEvalContent extends DocumentContentBase {
  resourceType: "PsychologicalEvaluationCertificate";
  evaluationPurpose: string; // e.g., "evaluación de aptitud laboral", "pericia judicial"
  evaluationDate: string;    // ISO-8601
  resultSummary: string;     // Free text — no ICD codes
  evaluatorSpecialty?: string;
}

export interface TreatmentDischargeContent extends DocumentContentBase {
  resourceType: "TreatmentDischargeCertificate";
  dischargeDate: string;     // ISO-8601
  dischargeSummary?: string; // Generic summary — no diagnosis
}

/** Union of all document content payloads. */
export type DocumentContent =
  | LaborRestContent
  | LaborFitnessContent
  | DisabilityContent
  | MedicalLicenseContent
  | DegreeTitleContent
  | ProfCredentialContent
  | PsychCareContent
  | PsychEvalContent
  | TreatmentDischargeContent;

// ============================================================================
// Telemedicine — Google Meet consultations
// ============================================================================

export type ConsultationStatus = "scheduled" | "completed";

/** A telemedicine session backed by a Google Meet space. */
export interface Consultation {
  id: string;
  doctorWallet: string;
  patientWallet?: string;
  /** Full Meet join URL (https://meet.google.com/…) */
  meetLink: string;
  /** Short meeting code shown to participants */
  meetingCode: string;
  /** Internal Meet resource name ("spaces/…") */
  spaceName: string;
  /** Unix timestamp (ms) for the scheduled start; undefined = ASAP */
  scheduledAt?: number;
  notes?: string;
  status: ConsultationStatus;
  createdAt: number;
  /** Soroban prescription ID linked after rx is issued */
  rxId?: string;
}
