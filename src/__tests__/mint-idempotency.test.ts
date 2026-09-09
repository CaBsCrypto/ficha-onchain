import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Account, Keypair } from "@stellar/stellar-sdk";
import { pendingIssuance } from "@/lib/prescription-issuance";

const mocks = vi.hoisted(() => ({
  signer: vi.fn(), authorized: vi.fn(), prepare: vi.fn(), account: vi.fn(),
  send: vi.fn(), sql: vi.fn(), user: vi.fn(), doctor: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));
vi.mock("@/lib/auth/privy-auth", () => ({ requireUser: mocks.user, isDoctor: mocks.doctor, authEnforced: () => false, unauthorized: () => Response.json({}, { status: 401 }), forbidden: () => Response.json({}, { status: 403 }) }));
vi.mock("@/lib/decreto41", async (original) => ({
  ...await original<typeof import("@/lib/decreto41")>(),
  validateDecreto41: () => ({ ok: true }),
}));
vi.mock("@/lib/stellar/client", () => ({
  server: { getAccount: mocks.account, prepareTransaction: mocks.prepare },
  isDoctorAuthorized: mocks.authorized,
}));
vi.mock("@/lib/stellar/server", () => ({ getDemoDoctorSecret: mocks.signer, feeBumpAndSend: mocks.send }));
import { POST } from "@/app/api/mint/route";

const identity = { id: "12121212-1212-4212-8212-121212121212", issuedAt: "2026-09-06T12:00:00.000Z" };
const body = { mode: "simulated", patient: Keypair.random().publicKey(), medication: "SYNTHETIC", dosage: "TEST ONLY", issuance: identity };
function enableDemo() {
  const signer = Keypair.random();
  vi.stubEnv("TRUSTLEAF_ENABLE_TESTNET_DEMO_MINT", "true");
  vi.stubEnv("TRUSTLEAF_DEMO_DOCTOR_EMAIL", "doctor@example.test");
  vi.stubEnv("TRUSTLEAF_DEMO_DOCTOR_WALLET", signer.publicKey());
  vi.stubEnv("TRUSTLEAF_DEMO_PATIENT_WALLET", body.patient);
  mocks.user.mockResolvedValue({ userId: "verified", email: "doctor@example.test" });
  mocks.doctor.mockResolvedValue(true);
  mocks.signer.mockReturnValue(signer.secret());
  return signer;
}
const request = (value: unknown) => new Request("http://localhost/api/mint", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-06T12:00:01Z"));
  mocks.sql.mockResolvedValue([]);
  mocks.authorized.mockResolvedValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("mint retry identity", () => {
  it("keeps the same hash after the clock advances and JSON keys change order", async () => {
    const first = await (await POST(request(body))).json();
    vi.setSystemTime(new Date("2026-09-06T12:05:00Z"));
    const retry = await (await POST(request({ mode: "simulated", issuance: identity, dosage: body.dosage, medication: body.medication, patient: body.patient }))).json();
    expect(retry.rxHash).toBe(first.rxHash);
  });
  it("permits a distinct issuance of the same treatment", async () => {
    const first = await (await POST(request(body))).json();
    const next = await (await POST(request({ ...body, issuance: { ...identity, id: "34343434-3434-4434-8434-343434343434" } }))).json();
    expect(next.rxHash).not.toBe(first.rxHash);
  });
  it("rejects callers without a stable identity before signing or logging", async () => {
    expect((await POST(request({ ...body, issuance: undefined }))).status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("returns conflict for contract duplicate without simulated success or retry", async () => {
    const signer = enableDemo();
    mocks.account.mockResolvedValue(new Account(signer.publicKey(), "1"));
    mocks.prepare.mockRejectedValue(new Error("HostError: Error(Contract, #8)"));
    const response = await POST(request({ ...body, mode: "testnet-demo" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_PRESCRIPTION" });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("does not convert a rejected authorized-path call into simulated success", async () => {
    enableDemo();
    mocks.authorized.mockResolvedValue(false);
    const response = await POST(request({ ...body, mode: "testnet-demo" }));
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("mode");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("restores pending identity and refuses edited payloads while outcome is uncertain", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    const first = pendingIssuance(storage, "test", "digest-a");
    expect(pendingIssuance(storage, "test", "digest-a")).toEqual(first);
    expect(() => pendingIssuance(storage, "test", "digest-b")).toThrow("pendiente");
  });
  it("rejects anonymous real signing", async () => {
    enableDemo(); mocks.user.mockResolvedValue(null);
    expect((await POST(request({ ...body, mode: "testnet-demo" }))).status).toBe(401);
    expect(mocks.signer).not.toHaveBeenCalled();
  });
  it("allows verified configured doctor and synthetic patient with mocked signing", async () => {
    const signer = enableDemo();
    mocks.account.mockResolvedValue(new Account(signer.publicKey(), "1"));
    mocks.prepare.mockResolvedValue({ sign: vi.fn(), toXDR: () => "mock-only" });
    mocks.send.mockResolvedValue({ status: "SUCCESS", hash: "mock-transaction" });
    const response = await POST(request({ ...body, mode: "testnet-demo" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "onchain", hash: "mock-transaction" });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.sql).toHaveBeenCalledOnce();
    expect(mocks.sql.mock.calls[0]).toContain("doctor@example.test");
  });
  it("rejects a patient role and forged doctor email", async () => {
    enableDemo(); mocks.doctor.mockResolvedValue(false);
    expect((await POST(request({ ...body, mode: "testnet-demo" }))).status).toBe(403);
    mocks.doctor.mockResolvedValue(true);
    expect((await POST(request({ ...body, mode: "testnet-demo", doctorEmail: "other@example.test" }))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects unconfigured patient, signer mismatch, and disabled optin", async () => {
    enableDemo();
    expect((await POST(request({ ...body, mode: "testnet-demo", patient: Keypair.random().publicKey() }))).status).toBe(403);
    vi.stubEnv("TRUSTLEAF_DEMO_DOCTOR_WALLET", Keypair.random().publicKey());
    expect((await POST(request({ ...body, mode: "testnet-demo" }))).status).toBe(403);
    vi.stubEnv("TRUSTLEAF_ENABLE_TESTNET_DEMO_MINT", "false");
    expect((await POST(request({ ...body, mode: "testnet-demo" }))).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("explicit simulation never reads a signer or writes records", async () => {
    enableDemo();
    expect((await (await POST(request(body))).json()).mode).toBe("simulated");
    expect(mocks.signer).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects invalid quantities and expired issuance", async () => {
    for (const quantity of [-1, 0, 1.5, "Infinity", 4294967296]) {
      expect((await POST(request({ ...body, quantity }))).status).toBe(400);
    }
    expect((await POST(request({ ...body, issuance: { ...identity, issuedAt: "2020-01-01T00:00:00.000Z" } }))).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
