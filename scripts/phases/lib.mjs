/**
 * Shared helpers for the per-phase flow tests (scripts/phases/*).
 *
 * Each phase file is self-contained: it seeds its own prerequisites, asserts,
 * and cleans up, so `node scripts/phases/pN-*.mjs` validates ONE phase in
 * isolation. `scripts/phases/run.mjs` runs them all (or a subset) in order.
 *
 * All checks go through the running dev server's HTTP API the way the UI does,
 * so a green phase means that phase works end-to-end against real DB + chain
 * (in demo passthrough — no Privy token). Steps that require a real login
 * (activar receta, editar perfil) are logged as MANUAL, not asserted.
 */
import { readFileSync } from "node:fs";

// Load .env.local so scripts see DEMO wallets etc. (best-effort).
try {
  for (const l of readFileSync(".env.local", "utf8").split("\n")) {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env.local — rely on the environment */ }

export const BASE = (process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export const DOCTOR_EMAIL = "cabscryptocontacto@gmail.com";
export const DEMO_PATIENT_WALLET =
  process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET ||
  "GD7WGS7MACGCZCECTNO5V3CH3FORZ2JQYILB5VDCQOYYEAJQOS2V4ZFW";

export const c = { green: "\x1b[32m", red: "\x1b[31m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m", cyan: "\x1b[36m" };

/** A test context accumulates pass/fail and prints per-check lines. */
export function ctx(phaseName) {
  const state = { pass: 0, fail: 0, name: phaseName };
  return {
    ok(name, cond, info = "") {
      const tag = cond ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
      console.log(`  ${tag}  ${name}${info ? ` ${c.dim}— ${info}${c.reset}` : ""}`);
      cond ? state.pass++ : state.fail++;
      return cond;
    },
    manual(name) {
      console.log(`  ${c.cyan}MANUAL${c.reset} ${c.dim}${name}${c.reset}`);
    },
    state,
  };
}

export const j = async (res) => { try { return await res.json(); } catch { return {}; } };
export const get = (path) => fetch(`${BASE}${path}`).then(j);
export const post = (path, body) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const del = (path, body) =>
  fetch(`${BASE}${path}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Unique patient email per run so phases never collide. */
export const uniquePatient = (tag) => `phase-${tag}-${Date.now()}@demo.dev`;

/** Next weekday (Mon–Fri) as YYYY-MM-DD, so seeded availability has slots. */
export function nextWeekday(offset = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Seed the demo doctor's weekly availability (idempotent, replace-all). */
export async function seedAvailability() {
  return post("/api/doctor/availability", {
    doctorEmail: DOCTOR_EMAIL,
    blocks: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday, start_time: "09:00", end_time: "13:00", slot_minutes: 30,
    })),
  }).then(j);
}

/** Create an appointment; returns the row (or null). Caller must delete it. */
export async function createAppointment({ patientEmail, date, time, type = "Telemedicina", motivo = "test" }) {
  const res = await post("/api/appointments", {
    doctorEmail: DOCTOR_EMAIL, patientEmail, patientName: "Test", date, timeSlot: time, type, motivo,
  });
  const data = await j(res);
  return { status: res.status, appt: data.appointment ?? null };
}

export async function deleteAppointment(id) {
  if (id) await del("/api/appointments", { id });
}
