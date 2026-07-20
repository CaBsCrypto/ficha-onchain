// Fase 3 — El paciente ve disponibilidad y reserva (anti doble-reserva).
import { ctx, seedAvailability, get, post, createAppointment, deleteAppointment, uniquePatient, nextWeekday, DOCTOR_EMAIL, c } from "./lib.mjs";

export const name = "Fase 3 — Reserva del paciente";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);
  await seedAvailability();

  const date = nextWeekday(2);
  const patientEmail = uniquePatient("reserva");
  const slots = (await get(`/api/doctor/slots?doctorEmail=${encodeURIComponent(DOCTOR_EMAIL)}&date=${date}`)).data?.slots ?? [];
  const free = slots.filter((s) => s.available);
  x.ok(`hay horas libres el ${date}`, free.length > 0, `libres=${free.length}`);
  const slot = free[0]?.time ?? "09:00";

  const { status, appt } = await createAppointment({ patientEmail, date, time: slot });
  x.ok("POST /api/appointments reserva (201)", status === 201, `status=${status}`);

  const dup = await post("/api/appointments", { doctorEmail: DOCTOR_EMAIL, patientEmail: `otro-${patientEmail}`, patientName: "x", date, timeSlot: slot, type: "Presencial", motivo: "choque" });
  x.ok("el mismo slot devuelve 409", dup.status === 409, `status=${dup.status}`);

  const after = (await get(`/api/doctor/slots?doctorEmail=${encodeURIComponent(DOCTOR_EMAIL)}&date=${date}`)).data?.slots ?? [];
  x.ok("el slot reservado desaparece de los libres", !after.some((s) => s.available && s.time === slot), `slot=${slot}`);

  await deleteAppointment(appt?.id);
  return x.state;
}

if (process.argv[1]?.endsWith("p3-reserva.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
