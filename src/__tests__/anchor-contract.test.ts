/**
 * Tests de resolveAnchorContract (src/lib/identity/anchor-contract.ts).
 * ---------------------------------------------------------------------------
 * El contrato: con RUT válido registrado, la ruta ancla en el ClinicalRecord
 * POR paciente (owner = SANDBOX_OWNER_SECRET); en cualquier otro caso — sin
 * email, sin RUT, RUT inválido, DB caída, registro sin provisionar o
 * ensureSandboxRecord lanzando — cae al contrato demo compartido (owner =
 * DEMO_PATIENT_SECRET) con un console.warn y SIN lanzar jamás. El fallback es
 * la garantía de que un problema de identidad no rompe el flujo clínico.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks -----------------------------------------------------------------
const dbRows: { rut: string | null }[] = [];
let dbThrows = false;
vi.mock("@/lib/db", () => ({
  getDb: () => {
    if (dbThrows) throw new Error("db caída");
    // Tagged-template shim: cualquier consulta devuelve las filas preparadas.
    return async () => dbRows;
  },
}));

const ensureSandboxRecord = vi.fn();
vi.mock("@/lib/identity/patient-records", () => ({
  ensureSandboxRecord: (...args: unknown[]) => ensureSandboxRecord(...args),
}));

vi.mock("@/lib/stellar/server", () => ({
  getDemoPatientSecret: () => process.env.DEMO_PATIENT_SECRET || undefined,
  getSandboxOwnerSecret: () => process.env.SANDBOX_OWNER_SECRET || undefined,
}));

vi.mock("@/lib/stellar/config", () => ({
  CONTRACT_IDS: { clinicalRecordDemo: "CDEMO_CONTRACT" },
}));

import { resolveAnchorContract } from "@/lib/identity/anchor-contract";

const RUT_VALIDO = "12.345.678-5";
const RUT_INVALIDO = "12.345.678-0"; // dígito verificador malo

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dbRows.length = 0;
  dbThrows = false;
  ensureSandboxRecord.mockReset();
  process.env.DEMO_PATIENT_SECRET = "S_DEMO_OWNER";
  process.env.SANDBOX_OWNER_SECRET = "S_SANDBOX_OWNER";
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  delete process.env.DEMO_PATIENT_SECRET;
  delete process.env.SANDBOX_OWNER_SECRET;
});

describe("resolveAnchorContract", () => {
  it("con RUT válido usa el contrato por-paciente y el owner sandbox", async () => {
    dbRows.push({ rut: RUT_VALIDO });
    ensureSandboxRecord.mockResolvedValue({ contractId: "CPACIENTE_1" });

    const res = await resolveAnchorContract("ana@example.com");
    expect(res).toEqual({
      contractId: "CPACIENTE_1",
      isDemo: false,
      ownerSecret: "S_SANDBOX_OWNER",
    });
    expect(ensureSandboxRecord).toHaveBeenCalledWith(RUT_VALIDO);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("sin email cae al demo con warn", async () => {
    const res = await resolveAnchorContract("   ");
    expect(res).toEqual({
      contractId: "CDEMO_CONTRACT",
      isDemo: true,
      ownerSecret: "S_DEMO_OWNER",
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("sin fila en patient_health_records cae al demo con warn", async () => {
    const res = await resolveAnchorContract("nadie@example.com");
    expect(res.isDemo).toBe(true);
    expect(res.contractId).toBe("CDEMO_CONTRACT");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("con RUT inválido cae al demo (nunca crea un registro basura)", async () => {
    dbRows.push({ rut: RUT_INVALIDO });
    const res = await resolveAnchorContract("ana@example.com");
    expect(res.isDemo).toBe(true);
    expect(ensureSandboxRecord).not.toHaveBeenCalled();
  });

  it("si la DB falla cae al demo sin lanzar", async () => {
    dbThrows = true;
    const res = await resolveAnchorContract("ana@example.com");
    expect(res.isDemo).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("si el registro queda sin provisionar (deploy fallido) cae al demo", async () => {
    dbRows.push({ rut: RUT_VALIDO });
    ensureSandboxRecord.mockResolvedValue({ contractId: null });
    const res = await resolveAnchorContract("ana@example.com");
    expect(res.isDemo).toBe(true);
  });

  it("si ensureSandboxRecord lanza (p. ej. RutError por pepper) cae al demo", async () => {
    dbRows.push({ rut: RUT_VALIDO });
    ensureSandboxRecord.mockRejectedValue(new Error("TRUSTLEAF_RUT_PEPPER no está configurado"));
    const res = await resolveAnchorContract("ana@example.com");
    expect(res.isDemo).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("sin secreto configurado devuelve ownerSecret undefined (→ simulated)", async () => {
    delete process.env.SANDBOX_OWNER_SECRET;
    dbRows.push({ rut: RUT_VALIDO });
    ensureSandboxRecord.mockResolvedValue({ contractId: "CPACIENTE_1" });
    const res = await resolveAnchorContract("ana@example.com");
    expect(res.ownerSecret).toBeUndefined();
    expect(res.isDemo).toBe(false);
  });
});
