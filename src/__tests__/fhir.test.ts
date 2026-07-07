import { describe, it, expect } from "vitest";
import { buildDecreto41Bundle } from "@/lib/fhir";
import type { Decreto41Prescription } from "@/types";

/** A minimal, valid Decreto 41 record used across the FHIR/hash tests. */
function sampleRx(): Decreto41Prescription {
  return {
    patient: {
      fullName: "María González Rojas",
      documentType: "RUT",
      documentNumber: "12.345.678-5",
      sex: "FEMENINO",
      birthDate: "1990-04-12",
      address: "Av. Providencia 1234, Santiago",
      phone: "+56912345678",
      email: "maria@correo.cl",
      healthSystem: "FONASA",
    },
    prescriber: {
      fullName: "Dra. Valentina Reyes",
      rut: "9.876.543-3",
      specialty: "Medicina Interna",
      clinicName: "Clínica Los Andes",
      clinicRut: "76.123.456-7",
    },
    content: {
      medication: "Amoxicilina 500mg",
      dosage: "1 cápsula c/8h",
      diagnosis: "Infección respiratoria aguda",
      cie10Code: "J06.9",
      quantity: 21,
      refills: 0,
      prescriptionType: "SIMPLE",
    },
    consent: { granted: false, date: null },
    issuedAt: "2026-07-07T12:00:00.000Z",
  };
}

describe("buildDecreto41Bundle", () => {
  it("produces a valid FHIR R4 document Bundle", () => {
    const bundle = buildDecreto41Bundle(sampleRx());

    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("document");
    expect(bundle.timestamp).toBe("2026-07-07T12:00:00.000Z");
    expect(Array.isArray(bundle.entry)).toBe(true);
  });

  it("includes Patient, Practitioner, Organization, Condition and MedicationRequest", () => {
    const bundle = buildDecreto41Bundle(sampleRx());
    const types = bundle.entry.map((e) => e.resource.resourceType);

    expect(types).toEqual(
      expect.arrayContaining([
        "Patient",
        "Practitioner",
        "Organization",
        "Condition",
        "MedicationRequest",
      ]),
    );

    const med = bundle.entry.find(
      (e) => e.resource.resourceType === "MedicationRequest",
    );
    // The MedicationRequest ties patient → practitioner → condition together.
    expect(med?.resource).toMatchObject({
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: "Amoxicilina 500mg" },
      subject: { reference: "Patient/patient-1" },
      requester: { reference: "Practitioner/practitioner-1" },
    });
  });

  it("appends a Consent entry only when consent is granted", () => {
    const withoutConsent = buildDecreto41Bundle(sampleRx());
    expect(
      withoutConsent.entry.some((e) => e.resource.resourceType === "Consent"),
    ).toBe(false);

    const granted = sampleRx();
    granted.consent = { granted: true, date: "2026-07-06" };
    const withConsent = buildDecreto41Bundle(granted);
    expect(
      withConsent.entry.some((e) => e.resource.resourceType === "Consent"),
    ).toBe(true);
  });
});
