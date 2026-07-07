import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { canonicalize } from "@/lib/decreto41";
import { buildDecreto41Bundle } from "@/lib/fhir";
import type { Decreto41Prescription } from "@/types";

/**
 * rx_hash is exactly how POST /api/mint anchors a prescription:
 *   SHA-256( canonicalize( buildDecreto41Bundle(record) ) )
 * These tests pin its determinism — the property the on-chain anchor relies on.
 */
function rxHash(rx: Decreto41Prescription): string {
  return createHash("sha256")
    .update(canonicalize(buildDecreto41Bundle(rx)))
    .digest("hex");
}

function baseRx(): Decreto41Prescription {
  return {
    patient: {
      fullName: "Juan Pérez",
      documentType: "RUT",
      documentNumber: "11.111.111-1",
      sex: "MASCULINO",
      birthDate: "1985-01-01",
      address: "Calle Falsa 123",
      email: "juan@correo.cl",
      healthSystem: "ISAPRE",
    },
    prescriber: {
      fullName: "Dr. House",
      rut: "9.876.543-3",
      specialty: "Diagnóstico",
      clinicName: "Clínica X",
      clinicRut: "76.123.456-7",
    },
    content: {
      medication: "Ibuprofeno 400mg",
      dosage: "1 c/12h",
      diagnosis: "Dolor",
      quantity: 10,
      refills: 1,
      prescriptionType: "SIMPLE",
    },
    consent: { granted: false, date: null },
    issuedAt: "2026-07-07T00:00:00.000Z",
  };
}

describe("prescription rx_hash", () => {
  it("is deterministic for the same content", () => {
    expect(rxHash(baseRx())).toBe(rxHash(baseRx()));
  });

  it("is independent of object key insertion order", () => {
    // Same data, keys declared in a different order — canonicalization must
    // sort them so the hash is identical.
    const reordered: Decreto41Prescription = {
      issuedAt: "2026-07-07T00:00:00.000Z",
      consent: { date: null, granted: false },
      content: {
        prescriptionType: "SIMPLE",
        refills: 1,
        quantity: 10,
        diagnosis: "Dolor",
        dosage: "1 c/12h",
        medication: "Ibuprofeno 400mg",
      },
      prescriber: {
        clinicRut: "76.123.456-7",
        clinicName: "Clínica X",
        specialty: "Diagnóstico",
        rut: "9.876.543-3",
        fullName: "Dr. House",
      },
      patient: {
        healthSystem: "ISAPRE",
        email: "juan@correo.cl",
        address: "Calle Falsa 123",
        birthDate: "1985-01-01",
        sex: "MASCULINO",
        documentNumber: "11.111.111-1",
        documentType: "RUT",
        fullName: "Juan Pérez",
      },
    };
    expect(rxHash(reordered)).toBe(rxHash(baseRx()));
  });

  it("changes when the clinical content changes", () => {
    const changed = baseRx();
    changed.content.medication = "Paracetamol 500mg";
    expect(rxHash(changed)).not.toBe(rxHash(baseRx()));
  });

  it("produces a 32-byte (64 hex char) SHA-256 digest", () => {
    expect(rxHash(baseRx())).toMatch(/^[0-9a-f]{64}$/);
  });
});
