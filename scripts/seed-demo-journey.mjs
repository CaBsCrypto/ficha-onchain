/**
 * scripts/seed-demo-journey.mjs — runs ONE realistic patient journey end-to-end
 * against the running dev server and LEAVES the data in place (no cleanup), so
 * the whole flow lights up in /admin/flujo and /admin/historial.
 *
 * Demo-mode (no Privy token) — the guarded routes pass through. On-chain steps
 * (consent grant, ficha append) produce real testnet tx hashes when the DEMO
 * secrets are in .env.local; otherwise they degrade to mode:"simulated".
 *
 *   node scripts/seed-demo-journey.mjs
 */
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const BASE = "http://localhost:3000";
const ADMIN = process.env.WAITLIST_ADMIN_TOKEN;
const DOCTOR_EMAIL = "cabscryptocontacto@gmail.com";
const PATIENT_WALLET =
  process.env.NEXT_PUBLIC_DEMO_PATIENT_WALLET ||
  "GD7WGS7MACGCZCECTNO5V3CH3FORZ2JQYILB5VDCQOYYEAJQOS2V4ZFW";

const j = (r) => r.json();
const post = (p, b) => fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const put = (p, b) => fetch(`${BASE}${p}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const patch = (p, b) => fetch(`${BASE}${p}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const get = (p) => fetch(`${BASE}${p}`).then(j);

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const ok = (n, c, i = "") => console.log(`  ${c ? G + "✓" : R + "✗"}${X} ${n}${i ? ` ${D}${i}${X}` : ""}`);
// On-chain txs share one signer; back-to-back submits collide on the account
// sequence and degrade to simulated. A short pause lets each confirm first.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nextWeekday(off = 2) {
  const d = new Date(); d.setDate(d.getDate() + off);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const PATIENT = { email: `maria.gonzalez.${Date.now()}@demo.cl`, name: "María González Pérez" };

console.log(`\n${B}Seed — journey de demo (deja datos persistidos)${X}\n`);

// ── 0. Approve any pending doctor (shows the approval step) ──────────────────
if (ADMIN) {
  const docs = await get(`/api/admin/doctors?token=${ADMIN}`);
  const pending = (docs.doctors ?? []).filter((d) => d.status === "pending");
  for (const p of pending) {
    await patch(`/api/admin/doctors?token=${encodeURIComponent(ADMIN)}`, { id: p.id, status: "active" });
    ok(`Aprobado médico pendiente: ${p.name}`, true);
  }
  if (!pending.length) ok("No hay médicos pendientes por aprobar", true);
} else {
  ok("WAITLIST_ADMIN_TOKEN ausente — salto aprobación", false);
}

// ── 1. Availability ──────────────────────────────────────────────────────────
const availRes = await put("/api/doctor/availability", {
  doctorEmail: DOCTOR_EMAIL,
  blocks: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "09:00", end_time: "13:00", slot_minutes: 30 })),
});
ok("Disponibilidad configurada (L–V 09:00–13:00)", availRes.ok, `HTTP ${availRes.status}`);

// ── 2. Appointment ───────────────────────────────────────────────────────────
const date = nextWeekday(2);
const apptRes = await post("/api/appointments", {
  doctorEmail: DOCTOR_EMAIL, patientEmail: PATIENT.email, patientName: PATIENT.name,
  date, timeSlot: "10:00", type: "Telemedicina", motivo: "Control de presión arterial",
});
const appt = (await j(apptRes)).appointment;
ok("Reserva creada", Boolean(appt?.id), `${date} 10:00 · id=${appt?.id}`);

// ── 3. Consent grant (on-chain) ──────────────────────────────────────────────
const grant = await post("/api/ficha/grant", { appointmentId: appt?.id, patientEmail: PATIENT.email }).then(j);
ok("Consentimiento otorgado (paciente→médico)", grant.mode === "onchain" || grant.mode === "simulated", `mode=${grant.mode}`);
await sleep(6000);

// ── 4. Clinical entries (on-chain) ───────────────────────────────────────────
const entries = [
  { kind: "Condition",    summary: "Hipertensión arterial esencial", detail: "CIE-10 I10 · PA 150/95" },
  { kind: "Observation",  summary: "Presión arterial 150/95 mmHg",   detail: "Medición en consulta" },
  { kind: "MedicationRequest", summary: "Losartán 50mg c/24h",       detail: "30 comprimidos" },
];
for (const e of entries) {
  const r = await post("/api/ficha/entry", {
    patientEmail: PATIENT.email, patientWallet: PATIENT_WALLET, doctorEmail: DOCTOR_EMAIL, ...e,
  }).then(j);
  ok(`Ficha: ${e.summary}`, /^[0-9a-f]{64}$/.test(r.contentHash ?? ""), `mode=${r.mode}`);
  await sleep(6000);
}

// ── 5. Prescription (on-chain, Decreto 41) ───────────────────────────────────
const mint = await post("/api/mint", {
  patient: PATIENT_WALLET, medication: "Losartán 50mg", dosage: "1 comprimido c/24h", quantity: 30,
  patientName: PATIENT.name, patientDocType: "RUT", patientDocNumber: "11.111.111-1",
  patientSex: "F", patientBirthDate: "1987-04-12", patientAddress: "Av. Siempre Viva 742",
  patientPhone: "+56912345678", healthSystem: "FONASA",
  doctorName: "Dr. Cristian Brown", doctorRut: "11.111.111-1", doctorSpecialty: "Medicina General",
  clinicName: "Clínica Demo", clinicRut: "77.777.777-7",
  diagnosis: "Hipertensión esencial", cie10Code: "I10", prescriptionType: "SIMPLE",
  consentGranted: true, consentDate: new Date().toISOString().slice(0, 10),
}).then(j);
ok("Receta emitida", /^[0-9a-f]{64}$/.test(mint.rxHash ?? ""), `mode=${mint.mode}${mint.rxId ? ` · rxId=${mint.rxId}` : ""}`);

// ── 6. Medical license (draft in DB → shows in stage 8 / historial) ──────────
const lic = await post("/api/licenses", {
  doctor_email: DOCTOR_EMAIL, patient_email: PATIENT.email, patient_name: PATIENT.name,
  patient_rut: "11.111.111-1", fecha_inicio: date, dias: 3, cie10: "I10", tipo: "Enfermedad",
  diagnostico: "Crisis hipertensiva — reposo", observaciones: "Reevaluar en 72h",
}).then(j);
ok("Licencia médica creada", Boolean(lic.data?.id), `id=${lic.data?.id} · ${lic.data?.status}`);

console.log(`\n${B}Paciente:${X} ${PATIENT.name} <${PATIENT.email}>`);
console.log(`${D}Revisa /admin/flujo y /admin/historial — el journey quedó registrado.${X}\n`);
