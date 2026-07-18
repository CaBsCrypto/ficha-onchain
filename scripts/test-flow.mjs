/**
 * End-to-end FLOW test — validates the clinical journey through the running app.
 *
 *   node scripts/test-flow.mjs [baseUrl]
 *   node scripts/test-flow.mjs http://localhost:56289
 *
 * Unlike scripts/test-onchain.mjs (which reads contracts directly), this drives
 * the HTTP API the way the UI does, so it proves each feature works AND still
 * works together with the ones before it:
 *
 *   médicos → disponibilidad → slots → reserva → Meet → anti doble-reserva
 *           → ficha on-chain (append) → historial de la ficha
 *
 * It is idempotent: every run uses a fresh patient email and cleans up the
 * appointment it creates. Safe to re-run. Exit code 0 = all green.
 *
 * Requires the dev server running (npm run dev) and DATABASE_URL pointed at the
 * dev branch. The doctor used is the seeded demo doctor.
 */
const BASE = (process.argv[2] || process.env.TEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const DOCTOR_EMAIL = "cabscryptocontacto@gmail.com";
const PATIENT_EMAIL = `flow-${Date.now()}@demo.dev`;
const PATIENT_WALLET = "GBBAAKF3Z6BHACXRS6FRRJIHR4UVXTSXGCLYWNHHUAE2D3BM733NXIJ2";

let pass = 0;
let fail = 0;
const ok = (name, cond, info = "") => {
  const c = cond ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${c}  ${name}${info ? `  — ${info}` : ""}`);
  cond ? pass++ : fail++;
  return cond;
};
const j = async (res) => {
  try { return await res.json(); } catch { return {}; }
};

// Next weekday (Mon–Fri) as YYYY-MM-DD, so the seeded availability has slots.
function nextWeekday() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n  base: ${BASE}\n  paciente de prueba: ${PATIENT_EMAIL}\n`);

  // 1 ── Médicos: el paciente puede elegir con quién reservar.
  console.log("\x1b[1m1. Médicos disponibles\x1b[0m");
  const docs = await j(await fetch(`${BASE}/api/doctors`));
  const doctor = (docs.doctors ?? []).find((d) => d.email === DOCTOR_EMAIL);
  ok("GET /api/doctors incluye al médico demo", Boolean(doctor), doctor ? doctor.name : "no encontrado");

  // 2 ── Disponibilidad: la reserva depende de esto (integración).
  console.log("\n\x1b[1m2. Disponibilidad del médico\x1b[0m");
  const avail = await j(await fetch(`${BASE}/api/doctor/availability`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doctorEmail: DOCTOR_EMAIL,
      blocks: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday, start_time: "09:00", end_time: "13:00", slot_minutes: 30,
      })),
    }),
  }));
  ok("PUT /api/doctor/availability guarda bloques", Array.isArray(avail.data) && avail.data.length >= 5, `bloques=${avail.data?.length}`);

  // 3 ── Slots: derivados de la disponibilidad, sin horas pasadas/tomadas.
  console.log("\n\x1b[1m3. Slots libres (deriva de la disponibilidad)\x1b[0m");
  const date = nextWeekday();
  const slotsRes = await j(await fetch(`${BASE}/api/doctor/slots?doctorEmail=${encodeURIComponent(DOCTOR_EMAIL)}&date=${date}`));
  const slots = (slotsRes.data?.slots ?? []).filter((s) => s.available);
  ok(`GET /api/doctor/slots (${date}) devuelve horas libres`, slots.length > 0, `libres=${slots.length}`);
  const slot = slots[0]?.time ?? "09:00";

  // 4 ── Reserva: crea la cita + (telemedicina) genera sala Meet (integración).
  console.log("\n\x1b[1m4. Reserva del paciente (+ Meet)\x1b[0m");
  const booking = await fetch(`${BASE}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doctorEmail: DOCTOR_EMAIL, patientEmail: PATIENT_EMAIL, patientName: "Paciente Flow",
      date, timeSlot: slot, type: "Telemedicina", motivo: "Control (test de flujo)",
    }),
  });
  const bookingData = await j(booking);
  const apptId = bookingData.appointment?.id;
  ok("POST /api/appointments crea la cita (201)", booking.status === 201, `status=${booking.status}`);
  ok("la cita de telemedicina trae enlace de Meet", Boolean(bookingData.appointment?.meet_link), bookingData.appointment?.meet_link ?? "sin link");

  // 5 ── Anti doble-reserva: el mismo slot no se puede tomar dos veces.
  console.log("\n\x1b[1m5. Anti doble-reserva\x1b[0m");
  const dup = await fetch(`${BASE}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doctorEmail: DOCTOR_EMAIL, patientEmail: `otro-${PATIENT_EMAIL}`, patientName: "Otro",
      date, timeSlot: slot, type: "Presencial", motivo: "Choque",
    }),
  });
  ok("reservar el mismo slot devuelve 409", dup.status === 409, `status=${dup.status}`);

  // 6 ── El slot reservado ya no aparece libre (integración slots↔reserva).
  const slotsAfter = await j(await fetch(`${BASE}/api/doctor/slots?doctorEmail=${encodeURIComponent(DOCTOR_EMAIL)}&date=${date}`));
  const stillFree = (slotsAfter.data?.slots ?? []).some((s) => s.available && s.time === slot);
  ok("el slot reservado desaparece de los libres", !stillFree, `slot=${slot}`);

  // 7 ── Ficha on-chain: el médico ancla una entrada (nueva feature).
  console.log("\n\x1b[1m6. Ficha on-chain (append)\x1b[0m");
  const entryRes = await j(await fetch(`${BASE}/api/ficha/entry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientEmail: PATIENT_EMAIL, patientWallet: PATIENT_WALLET,
      kind: "Condition", summary: "Hipertensión arterial (test de flujo)",
      detail: "CIE-10 I10", doctorEmail: DOCTOR_EMAIL,
    }),
  }));
  ok("POST /api/ficha/entry genera el ancla SHA-256", /^[0-9a-f]{64}$/.test(entryRes.contentHash ?? ""), `hash=${(entryRes.contentHash ?? "").slice(0, 12)}…`);
  ok("la entrada queda anclada on-chain (mode=onchain)", entryRes.mode === "onchain", `mode=${entryRes.mode}${entryRes.reason ? ` (${entryRes.reason})` : ""}`);

  // 8 ── Historial de la ficha lo devuelve (integración).
  const hist = await j(await fetch(`${BASE}/api/ficha/entries?patientEmail=${encodeURIComponent(PATIENT_EMAIL)}`));
  ok("GET /api/ficha/entries devuelve la entrada", (hist.entries ?? []).some((e) => e.content_hash === entryRes.contentHash), `entradas=${hist.entries?.length}`);

  // ── Limpieza: borra la cita de prueba (la entrada on-chain es inmutable).
  if (apptId) {
    await fetch(`${BASE}/api/appointments`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: apptId }),
    });
  }

  console.log(`\n  \x1b[1m${pass} PASS · ${fail} FAIL\x1b[0m\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("\n  flujo abortado:", err.message, "\n");
  process.exit(1);
});
