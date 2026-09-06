import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Account, Keypair } from "@stellar/stellar-sdk";
import { pendingIssuance } from "@/lib/prescription-issuance";

const mocks = vi.hoisted(() => ({
  signer: vi.fn(), authorized: vi.fn(), prepare: vi.fn(), account: vi.fn(),
  send: vi.fn(), sql: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));
vi.mock("@/lib/auth/privy-auth", () => ({ requireAuthOrDemo: async () => null }));
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
const body = { patient: Keypair.random().publicKey(), medication: "SYNTHETIC", dosage: "TEST ONLY", issuance: identity };
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
afterEach(() => vi.useRealTimers());

describe("mint retry identity", () => {
  it("keeps the same hash after the clock advances and JSON keys change order", async () => {
    const first = await (await POST(request(body))).json();
    vi.setSystemTime(new Date("2026-09-06T12:05:00Z"));
    const retry = await (await POST(request({ issuance: identity, dosage: body.dosage, medication: body.medication, patient: body.patient }))).json();
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
    const signer = Keypair.random();
    mocks.signer.mockReturnValue(signer.secret());
    mocks.account.mockResolvedValue(new Account(signer.publicKey(), "1"));
    mocks.prepare.mockRejectedValue(new Error("HostError: Error(Contract, #8)"));
    const response = await POST(request(body));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_PRESCRIPTION" });
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("does not convert a rejected authorized-path call into simulated success", async () => {
    mocks.signer.mockReturnValue(Keypair.random().secret());
    mocks.authorized.mockResolvedValue(false);
    const response = await POST(request(body));
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
});
