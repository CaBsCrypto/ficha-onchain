/**
 * FHIR R4 data structures for TrustLeaf prescriptions.
 * ------------------------------------------------------------------
 * Clinical data follows the HL7 FHIR R4 standard so records stay
 * interoperable with hospitals, labs and EHR systems. Only a content
 * hash (rx_hash) is stored on-chain; the encrypted FHIR payload lives
 * off-chain.
 *
 * The builders below map a Decreto 41 (MINSAL Chile) compliant record
 * onto a FHIR Bundle — Patient, Practitioner, Organization, a Condition
 * carrying the CIE-10 code, and the MedicationRequest that ties them
 * together. This Bundle is what `canonicalizeDecreto41` hashes.
 *
 * Reference: https://www.hl7.org/fhir/
 */
import type { Decreto41Prescription } from "@/types";

/** Trimmed FHIR MedicationRequest — the core of a prescription. */
export interface FhirMedicationRequest {
  resourceType: "MedicationRequest";
  status: "active" | "completed" | "cancelled";
  intent: "order";
  /** SIMPLE | RETENIDA | MAGISTRAL mapped to a FHIR category coding. */
  category?: { text: string }[];
  medicationCodeableConcept: { text: string };
  subject: { reference: string }; // Patient/{id}
  requester: { reference: string }; // Practitioner/{id}
  /** Condition/{id} carrying the diagnosis (+ CIE-10 when present). */
  reasonReference?: { reference: string }[];
  authoredOn: string; // ISO-8601
  dosageInstruction?: { text: string }[];
  note?: { text: string }[];
  dispenseRequest?: {
    quantity: { value: number };
    /** Decreto 41 "repeticiones permitidas". */
    numberOfRepeatsAllowed?: number;
  };
}

export interface FhirPatient {
  resourceType: "Patient";
  id: string;
  name: [{ text: string }];
  /** RUT / pasaporte / otro documento. */
  identifier: [{ system: string; value: string }];
  gender?: string;
  birthDate?: string;
  address?: [{ text: string }];
  telecom?: { system: "phone" | "email"; value: string }[];
  /** Sistema de salud (FONASA / ISAPRE / …). */
  extension?: { url: string; valueString: string }[];
  contact?: [{ name: { text: string }; identifier: [{ value: string }] }];
}

export interface FhirPractitioner {
  resourceType: "Practitioner";
  id: string;
  name: [{ text: string }];
  identifier: [{ system: string; value: string }];
  qualification?: [{ code: { text: string } }];
}

export interface FhirOrganization {
  resourceType: "Organization";
  id: string;
  name: string;
  identifier: [{ system: string; value: string }];
}

export interface FhirCondition {
  resourceType: "Condition";
  id: string;
  code: { text: string; coding?: [{ system: string; code: string }] };
  subject: { reference: string };
}

export interface FhirConsent {
  resourceType: "Consent";
  status: "active" | "rejected";
  scope: { text: "patient-privacy" };
  dateTime?: string;
}

export interface FhirBundleEntry {
  resource:
    | FhirPatient
    | FhirPractitioner
    | FhirOrganization
    | FhirCondition
    | FhirMedicationRequest
    | FhirConsent;
}

export interface FhirBundle {
  resourceType: "Bundle";
  type: "document";
  timestamp: string;
  entry: FhirBundleEntry[];
}

const RUT_SYSTEM = "https://registrocivil.cl/rut";
const CIE10_SYSTEM = "http://hl7.org/fhir/sid/icd-10";
const HEALTH_SYSTEM_EXT = "https://trustleaf.cl/fhir/StructureDefinition/prevision";

/** Map the Decreto 41 record → a FHIR R4 document Bundle. */
export function buildDecreto41Bundle(rx: Decreto41Prescription): FhirBundle {
  const { patient, prescriber, content, consent } = rx;

  const patientRes: FhirPatient = {
    resourceType: "Patient",
    id: "patient-1",
    name: [{ text: patient.fullName }],
    identifier: [
      { system: patient.documentType === "RUT" ? RUT_SYSTEM : patient.documentType, value: patient.documentNumber },
    ],
    gender: patient.sex,
    birthDate: patient.birthDate,
    address: [{ text: patient.address }],
    telecom: [
      ...(patient.phone ? [{ system: "phone" as const, value: patient.phone }] : []),
      ...(patient.email ? [{ system: "email" as const, value: patient.email }] : []),
    ],
    extension: [{ url: HEALTH_SYSTEM_EXT, valueString: patient.healthSystem }],
    ...(patient.legalRepresentative
      ? {
          contact: [
            {
              name: { text: patient.legalRepresentative.fullName },
              identifier: [{ value: patient.legalRepresentative.rut }],
            },
          ] as FhirPatient["contact"],
        }
      : {}),
  };

  const practitioner: FhirPractitioner = {
    resourceType: "Practitioner",
    id: "practitioner-1",
    name: [{ text: prescriber.fullName }],
    identifier: [{ system: RUT_SYSTEM, value: prescriber.rut }],
    qualification: [{ code: { text: prescriber.specialty } }],
  };

  const organization: FhirOrganization = {
    resourceType: "Organization",
    id: "organization-1",
    name: prescriber.clinicName,
    identifier: [{ system: RUT_SYSTEM, value: prescriber.clinicRut }],
  };

  const condition: FhirCondition = {
    resourceType: "Condition",
    id: "condition-1",
    code: {
      text: content.diagnosis,
      ...(content.cie10Code
        ? { coding: [{ system: CIE10_SYSTEM, code: content.cie10Code }] as FhirCondition["code"]["coding"] }
        : {}),
    },
    subject: { reference: "Patient/patient-1" },
  };

  const medicationRequest: FhirMedicationRequest = {
    resourceType: "MedicationRequest",
    status: "active",
    intent: "order",
    category: [{ text: content.prescriptionType }],
    medicationCodeableConcept: { text: content.medication },
    subject: { reference: "Patient/patient-1" },
    requester: { reference: "Practitioner/practitioner-1" },
    reasonReference: [{ reference: "Condition/condition-1" }],
    authoredOn: rx.issuedAt,
    dosageInstruction: [
      { text: content.dosage },
      ...(content.instructions ? [{ text: content.instructions }] : []),
    ],
    dispenseRequest: {
      quantity: { value: content.quantity },
      numberOfRepeatsAllowed: content.refills,
    },
  };

  const entry: FhirBundleEntry[] = [
    { resource: patientRes },
    { resource: practitioner },
    { resource: organization },
    { resource: condition },
    { resource: medicationRequest },
  ];

  if (consent.granted) {
    entry.push({
      resource: {
        resourceType: "Consent",
        status: "active",
        scope: { text: "patient-privacy" },
        dateTime: consent.date ?? undefined,
      },
    });
  }

  return {
    resourceType: "Bundle",
    type: "document",
    timestamp: rx.issuedAt,
    entry,
  };
}
