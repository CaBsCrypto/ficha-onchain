// Mixed audit suite: authorization regressions plus remaining legacy reproductions.
// Only external identity/RPC/database boundaries are mocked; real route, auth
// guard, document validation, hashing, transaction construction and signing run.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Account, Keypair } from "@stellar/stellar-sdk";
import { computeExpiry } from "@/lib/stellar/expiry";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), user: vi.fn(), sql: vi.fn(), signer: vi.fn(),
  authorized: vi.fn(), account: vi.fn(), prepare: vi.fn(), send: vi.fn(), prescription: vi.fn(),
}));
vi.mock("@privy-io/server-auth", () => ({ PrivyClient: class {
  verifyAuthToken = mocks.verify;
  getUser = mocks.user;
} }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.sql }));
vi.mock("@/lib/stellar/client", () => ({
  server: { getAccount: mocks.account, prepareTransaction: mocks.prepare },
  isDoctorAuthorized: mocks.authorized,
  getPrescription: mocks.prescription,
}));
vi.mock("@/lib/stellar/server", () => ({ getDemoDoctorSecret: mocks.signer, feeBumpAndSend: mocks.send }));
import { POST } from "@/app/api/mint/route";
import { GET as publicPrescription } from "@/app/api/public/prescription/[id]/route";

const syntheticDoctor = Keypair.random();
const body = {
  mode: "testnet-demo",
  patient: Keypair.random().publicKey(), patientName: "SYNTHETIC AUDIT",
  patientDocType: "PASAPORTE", patientDocNumber: "AUDIT-ONLY", patientBirthDate: "2000-01-01",
  patientAddress: "TEST", patientEmail: "patient@example.invalid",
  doctorName: "CLAIMED DOCTOR", doctorEmail: "claimed@example.invalid", doctorRut: "12.345.678-5",
  doctorSpecialty: "TEST", clinicName: "TEST", clinicRut: "12.345.678-5",
  medication: "SYNTHETIC", dosage: "NOT FOR CLINICAL USE", diagnosis: "SYNTHETIC", quantity: 1,
  issuance: { id: "12121212-1212-4212-8212-121212121212", issuedAt: "2026-09-06T12:00:00.000Z" },
};
const request = (token?: string, overrides = {}) => new Request("http://localhost/api/mint", {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({...body, ...overrides}),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TRUSTLEAF_REQUIRE_AUTH", "true");
  vi.stubEnv("PRIVY_APP_ID", "synthetic-app");
  vi.stubEnv("PRIVY_APP_SECRET", "synthetic-not-a-secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-06T12:00:01Z"));
  mocks.verify.mockResolvedValue({ userId: "did:privy:ordinary-patient" });
  mocks.user.mockResolvedValue({ linkedAccounts: [{ type: "email", address: "patient@example.invalid" }] });
  mocks.sql.mockResolvedValue([]); // No doctor membership exists in this fixture.
  mocks.signer.mockReturnValue(syntheticDoctor.secret());
  mocks.authorized.mockResolvedValue(true); // Only the server demo key is authorized.
  mocks.account.mockResolvedValue(new Account(syntheticDoctor.publicKey(), "1"));
  mocks.prepare.mockImplementation(async (tx) => tx);
  mocks.send.mockResolvedValue({ status: "SUCCESS", hash: "synthetic-local-only" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("strict auth rejects anonymous callers before the signing boundary", async () => {
  expect((await POST(request())).status).toBe(401);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("a verified non-doctor is rejected before the server signer even when demo signing is enabled", async () => {
  vi.stubEnv("TRUSTLEAF_ENABLE_TESTNET_DEMO_MINT", "true");
  // Match the email gate deliberately: this must test the database role gate,
  // not pass merely because the demo mode or configured email is missing.
  vi.stubEnv("TRUSTLEAF_DEMO_DOCTOR_EMAIL", "patient@example.invalid");
  const response = await POST(request("synthetic-verified-patient-token", {doctorEmail:"patient@example.invalid"}));
  expect(response.status).toBe(403);
  expect(mocks.sql).toHaveBeenCalledTimes(1);
  expect(mocks.sql.mock.calls[0][0].join(" ")).toContain("doctors");
  expect(mocks.signer).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});

it("the display expiry ignores an explicit earlier chain expiry", () => {
  const timestamp = 1_800_000_000;
  const chainRecord = { timestamp, status: "Activa" as const, expires_at: timestamp + 60 };
  const now = timestamp + 120;
  expect(now >= chainRecord.expires_at).toBe(true);
  expect(computeExpiry(chainRecord, now * 1000).expired).toBe(false);
});

it("the public verifier calls a Registered prescription active before activation", async () => {
  mocks.prescription.mockResolvedValue({ id: "1", status: "Registrada", timestamp: Date.now() / 1000,
    medication: "SYNTHETIC", dosage: "TEST", unitsTotal: 1, balance: 1, rxHash: "synthetic" });
  const response = await publicPrescription(new Request("http://localhost/api/public/prescription/1"),
    { params: Promise.resolve({ id: "1" }) });
  expect(await response.json()).toMatchObject({ data: { status: "Registrada", isActive: true } });
});
