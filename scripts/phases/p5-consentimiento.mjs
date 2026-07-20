// Fase 5 — El paciente inicia la consulta y autoriza a su médico (grant on-chain).
import { ctx, seedAvailability, get, post, createAppointment, deleteAppointment, uniquePatient, nextWeekday, DEMO_PATIENT_WALLET, c } from "./lib.mjs";

export const name = "Fase 5 — Consentimiento paciente→médico";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);
  await seedAvailability();
  const date = nextWeekday(4);
  const patientEmail = uniquePatient("consent");

  const { appt } = await createAppointment({ patientEmail, date, time: "11:00", type: "Telemedicina" });

  const grant = await post("/api/ficha/grant", { appointmentId: appt?.id, patientEmail }).then((r) => r.json());
  x.ok("POST /api/ficha/grant autoriza al médico", grant.mode === "onchain" || grant.mode === "simulated", `mode=${grant.mode}${grant.reason ? ` (${grant.reason})` : ""}`);

  const appts = (await get(`/api/appointments?patientEmail=${encodeURIComponent(patientEmail)}`)).appointments ?? [];
  const a2 = appts.find((a) => a.id === appt?.id);
  x.ok("la cita queda 'in_progress'", a2?.status === "in_progress", `status=${a2?.status}`);
  x.ok("la cita expone el consentimiento", Boolean(a2?.consent_mode) && (a2?.consent_mode !== "onchain" || /^[0-9a-f]{64}$/.test(a2?.consent_tx ?? "")), `consent=${a2?.consent_mode}`);

  const re = await post("/api/ficha/grant", { appointmentId: appt?.id, patientEmail });
  x.ok("re-otorgar sobre cita ya iniciada devuelve 409", re.status === 409, `status=${re.status}`);

  await deleteAppointment(appt?.id);
  void DEMO_PATIENT_WALLET;
  return x.state;
}

if (process.argv[1]?.endsWith("p5-consentimiento.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
