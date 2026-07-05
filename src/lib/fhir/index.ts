/**
 * FHIR data structures — PLACEHOLDER
 * ------------------------------------------------------------------
 * Clinical data follows the HL7 FHIR R4 standard so records stay
 * interoperable with hospitals, labs and EHR systems. Only a content
 * hash is stored on-chain; the encrypted payload lives off-chain.
 *
 * Reference: https://www.hl7.org/fhir/
 *
 * TODO:
 *  - Zod schemas for MedicationRequest, Patient, Practitioner
 *  - hashFhirResource(resource) -> rxHash stored on Soroban
 *  - encrypt/decrypt payload with patient-held keys
 */

/** Trimmed FHIR MedicationRequest — the core of a prescription. */
export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  status: "active" | "completed" | "cancelled";
  intent: "order";
  medicationCodeableConcept: { text: string };
  subject: { reference: string }; // Patient/{id}
  requester: { reference: string }; // Practitioner/{id}
  authoredOn: string; // ISO-8601
  dosageInstruction?: { text: string }[];
}

/** Placeholder — deterministic content hash for on-chain anchoring. */
export function hashFhirResource(_resource: FhirMedicationRequest): string {
  throw new Error("Not implemented — FHIR hashing pending (Phase 0).");
}
