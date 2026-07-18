/**
 * On-chain flow tests — read-only verification against testnet.
 *
 *   node scripts/test-onchain.mjs
 *
 * Exercises the deployed contracts (DoctorRegistry, PrescriptionSoulbound,
 * ClinicalRecord) via simulation — no signing, no fees, no state change. Safe to
 * re-run. Reports PASS/FAIL per flow so we can see, from the terminal, whether
 * the on-chain half of each clinical-journey step actually holds.
 *
 * The write flows (mint, activate, grant, append) and anything gated by a Privy
 * login are NOT here — those need signatures / a browser session and are checked
 * manually or by the contract unit tests.
 */
import { readFileSync } from "node:fs";
import {
  Account, Address, BASE_FEE, Contract, Networks, rpc, scValToNative, TransactionBuilder, nativeToScVal,
} from "@stellar/stellar-sdk";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const RPC = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const server = new rpc.Server(RPC);
const SIM_SRC = process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET;

const REGISTRY = process.env.NEXT_PUBLIC_DOCTOR_REGISTRY_ID;
const RX = process.env.NEXT_PUBLIC_PRESCRIPTION_ID;
const FICHA = process.env.NEXT_PUBLIC_DEMO_CLINICAL_RECORD_ID
  || "CCYDJJOA4AYDEDP6XBHXBZ6OAGRPDAUZRF23M3FMP6CO5L7SJ6YOSWSA";
const DOCTOR = process.env.NEXT_PUBLIC_DEMO_DOCTOR_WALLET;
const PATIENT = process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET;

async function read(contractId, method, args = []) {
  const tx = new TransactionBuilder(new Account(SIM_SRC, "0"), {
    fee: BASE_FEE, networkPassphrase: Networks.TESTNET,
  }).addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { error: sim.error };
  return { value: scValToNative(sim.result.retval) };
}
const addr = (a) => new Address(a).toScVal();

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  const ok = !!cond;
  console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
}

console.log(`\n  RPC: ${RPC}\n`);

// ── DoctorRegistry ───────────────────────────────────────────────────────────
console.log("\x1b[1mDoctorRegistry\x1b[0m");
{
  const auth = await read(REGISTRY, "is_authorized", [addr(DOCTOR)]);
  check("médico demo autorizado", auth.value === true, `is_authorized=${JSON.stringify(auth.value ?? auth.error)}`);

  const rand = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const unauth = await read(REGISTRY, "is_authorized", [addr(rand)]);
  check("wallet random NO autorizada", unauth.value === false, `is_authorized=${JSON.stringify(unauth.value ?? unauth.error)}`);
}

// ── PrescriptionSoulbound ────────────────────────────────────────────────────
console.log("\n\x1b[1mPrescriptionSoulbound\x1b[0m");
{
  const rxs = await read(RX, "get_prescriptions_by_patient", [addr(PATIENT)]);
  const list = Array.isArray(rxs.value) ? rxs.value : [];
  check("paciente tiene recetas on-chain", list.length >= 1, `count=${list.length}`);

  const statuses = list.map((r) => Number(r.status));
  check("hay al menos una Activa (status=1)", statuses.includes(1));
  check("hay al menos una Revocada (status=5)", statuses.includes(5));

  if (list.length) {
    const first = list.find((r) => Number(r.status) === 1) ?? list[0];
    const valid = await read(RX, "is_valid", [nativeToScVal(BigInt(first.id), { type: "u64" })]);
    check(`is_valid de la receta #${first.id}`, typeof valid.value === "boolean", `is_valid=${valid.value}`);
  }
}

// ── ClinicalRecord (ficha) ───────────────────────────────────────────────────
console.log("\n\x1b[1mClinicalRecord (ficha)\x1b[0m");
{
  const owner = await read(FICHA, "get_owner");
  check("owner = paciente demo", owner.value === PATIENT, `owner=${owner.value ?? owner.error}`);

  const entries = await read(FICHA, "get_entries");
  check("get_entries responde (lista)", Array.isArray(entries.value), `count=${Array.isArray(entries.value) ? entries.value.length : "n/a"}`);

  const access = await read(FICHA, "has_write_access", [addr(DOCTOR)]);
  check("médico sin grant → has_write_access=false", access.value === false, `has_write_access=${access.value}`);
}

console.log(`\n  \x1b[1m${pass} PASS · ${fail} FAIL\x1b[0m\n`);
process.exit(fail ? 1 : 0);
