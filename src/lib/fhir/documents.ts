/**
 * Document content schemas & hashing for the TrustLeaf document system.
 * ---------------------------------------------------------------------------
 * Mirrors the FHIR-like anchoring pattern used for prescriptions, extended to
 * cover medical certificates, professional licenses, and mental health certs.
 *
 * On-chain: only the 32-byte SHA-256 content hash is stored.
 * Off-chain: the canonical JSON payload (this file's types) carries all details.
 *
 * Canonical serialization: keys sorted alphabetically, no whitespace.
 * This guarantees the same hash regardless of object property insertion order.
 */

import { createHash } from "node:crypto";
import type {
  DocumentType,
  DocumentCategory,
  DocumentContent,
  LaborRestContent,
  LaborFitnessContent,
  DisabilityContent,
  MedicalLicenseContent,
  DegreeTitleContent,
  ProfCredentialContent,
  PsychCareContent,
  PsychEvalContent,
  TreatmentDischargeContent,
} from "@/types";

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

export const DOC_CATEGORY: Record<DocumentType, DocumentCategory> = {
  LaborRest: "medical_certificate",
  LaborFitness: "medical_certificate",
  Disability: "medical_certificate",
  MedicalLicense: "professional_license",
  DegreeTitle: "professional_license",
  ProfCredential: "professional_license",
  PsychCare: "mental_health",
  PsychEval: "mental_health",
  TreatmentDischarge: "mental_health",
};

/** Human-readable Spanish label for each document type. */
export const DOC_LABEL: Record<DocumentType, string> = {
  LaborRest: "Certificado de Reposo Laboral",
  LaborFitness: "Certificado de Aptitud Laboral",
  Disability: "Certificado de Incapacidad",
  MedicalLicense: "Licencia Médica",
  DegreeTitle: "Certificado de Título",
  ProfCredential: "Credencial de Habilitación Profesional",
  PsychCare: "Certificado de Atención Psicológica",
  PsychEval: "Certificado de Evaluación Psicológica",
  TreatmentDischarge: "Alta de Tratamiento Psicológico",
};

/** Which document types carry an expiry date (set expires_at on-chain). */
export const DOC_HAS_EXPIRY: Record<DocumentType, boolean> = {
  LaborRest: false,
  LaborFitness: false,
  Disability: false,
  MedicalLicense: true,
  DegreeTitle: false,
  ProfCredential: true,
  PsychCare: false,
  PsychEval: false,
  TreatmentDischarge: false,
};

// ---------------------------------------------------------------------------
// Canonical hashing
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys so serialization is deterministic regardless of
 * insertion order.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * Compute the SHA-256 content hash of a document payload.
 *
 * The payload is canonicalized (keys sorted, no whitespace) before hashing.
 * This Buffer(32) is passed directly to the Soroban `mint_document` call as
 * the `content_hash` argument.
 */
export function hashDocumentContent(content: DocumentContent): Buffer {
  const canonical = JSON.stringify(sortKeys(content));
  return createHash("sha256").update(canonical).digest();
}

// ---------------------------------------------------------------------------
// Payload builders — one per document type
// ---------------------------------------------------------------------------
// Each builder returns a typed payload ready for hashing. All PII fields are
// intentionally separated from on-chain data.

export function buildLaborRestPayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  recipientIdNumber?: string;
  restDays: number;
  startDate: string;
  endDate: string;
  diagnosisCode?: string;
  diagnosisText?: string;
  notes?: string;
}): LaborRestContent {
  return {
    resourceType: "LaborRestCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    recipientIdNumber: args.recipientIdNumber,
    issuedOn: new Date().toISOString().slice(0, 10),
    restDays: args.restDays,
    startDate: args.startDate,
    endDate: args.endDate,
    diagnosisCode: args.diagnosisCode,
    diagnosisText: args.diagnosisText,
    notes: args.notes,
  };
}

export function buildLaborFitnessPayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  recipientIdNumber?: string;
  fitnessResult: LaborFitnessContent["fitnessResult"];
  restrictions?: string[];
  validUntil?: string;
  notes?: string;
}): LaborFitnessContent {
  return {
    resourceType: "LaborFitnessCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    recipientIdNumber: args.recipientIdNumber,
    issuedOn: new Date().toISOString().slice(0, 10),
    fitnessResult: args.fitnessResult,
    restrictions: args.restrictions,
    validUntil: args.validUntil,
    notes: args.notes,
  };
}

export function buildDisabilityPayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  recipientIdNumber?: string;
  disabilityType: DisabilityContent["disabilityType"];
  percentage?: number;
  startDate: string;
  endDate?: string;
  diagnosisCode?: string;
  notes?: string;
}): DisabilityContent {
  return {
    resourceType: "DisabilityCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    recipientIdNumber: args.recipientIdNumber,
    issuedOn: new Date().toISOString().slice(0, 10),
    disabilityType: args.disabilityType,
    percentage: args.percentage,
    startDate: args.startDate,
    endDate: args.endDate,
    diagnosisCode: args.diagnosisCode,
    notes: args.notes,
  };
}

export function buildMedicalLicensePayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  licenseType: MedicalLicenseContent["licenseType"];
  specialty: string;
  licenseNumber: string;
  validFrom: string;
  validUntil: string;
  issuingBody: string;
  notes?: string;
}): MedicalLicenseContent {
  return {
    resourceType: "MedicalLicenseCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    licenseType: args.licenseType,
    specialty: args.specialty,
    licenseNumber: args.licenseNumber,
    validFrom: args.validFrom,
    validUntil: args.validUntil,
    issuingBody: args.issuingBody,
    notes: args.notes,
  };
}

export function buildDegreeTitlePayload(args: {
  issuerName: string;
  recipientFullName: string;
  profession: string;
  university: string;
  graduationDate: string;
  registrationNumber?: string;
  notes?: string;
}): DegreeTitleContent {
  return {
    resourceType: "DegreeTitleCertificate",
    issuerName: args.issuerName,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    profession: args.profession,
    university: args.university,
    graduationDate: args.graduationDate,
    registrationNumber: args.registrationNumber,
    notes: args.notes,
  };
}

export function buildProfCredentialPayload(args: {
  issuerName: string;
  recipientFullName: string;
  credentialType: string;
  profession: string;
  issuingBody: string;
  validFrom: string;
  validUntil?: string;
  notes?: string;
}): ProfCredentialContent {
  return {
    resourceType: "ProfCredentialCertificate",
    issuerName: args.issuerName,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    credentialType: args.credentialType,
    profession: args.profession,
    issuingBody: args.issuingBody,
    validFrom: args.validFrom,
    validUntil: args.validUntil,
    notes: args.notes,
  };
}

export function buildPsychCarePayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  attendanceStatus: PsychCareContent["attendanceStatus"];
  approximatePeriod?: string;
  purposeOfCertificate?: string;
  notes?: string;
}): PsychCareContent {
  return {
    resourceType: "PsychCareAttendanceCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    attendanceStatus: args.attendanceStatus,
    approximatePeriod: args.approximatePeriod,
    purposeOfCertificate: args.purposeOfCertificate,
    notes: args.notes,
    // ⚠ No diagnosis, no ICD codes, no session details by design.
  };
}

export function buildPsychEvalPayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  evaluationPurpose: string;
  evaluationDate: string;
  resultSummary: string;
  evaluatorSpecialty?: string;
  notes?: string;
}): PsychEvalContent {
  return {
    resourceType: "PsychologicalEvaluationCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    evaluationPurpose: args.evaluationPurpose,
    evaluationDate: args.evaluationDate,
    resultSummary: args.resultSummary,
    evaluatorSpecialty: args.evaluatorSpecialty,
    notes: args.notes,
  };
}

export function buildTreatmentDischargePayload(args: {
  issuerName: string;
  issuerLicenseId?: string;
  recipientFullName: string;
  dischargeDate: string;
  dischargeSummary?: string;
  notes?: string;
}): TreatmentDischargeContent {
  return {
    resourceType: "TreatmentDischargeCertificate",
    issuerName: args.issuerName,
    issuerLicenseId: args.issuerLicenseId,
    recipientFullName: args.recipientFullName,
    issuedOn: new Date().toISOString().slice(0, 10),
    dischargeDate: args.dischargeDate,
    dischargeSummary: args.dischargeSummary,
    notes: args.notes,
  };
}
