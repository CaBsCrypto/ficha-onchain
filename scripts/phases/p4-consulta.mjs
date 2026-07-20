// Fase 4 — La consulta: sala de video (Jitsi) en la cita de telemedicina.
import { ctx, seedAvailability, createAppointment, deleteAppointment, uniquePatient, nextWeekday, c } from "./lib.mjs";

export const name = "Fase 4 — Consulta (videollamada)";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);
  await seedAvailability();
  const date = nextWeekday(3);

  const tele = await createAppointment({ patientEmail: uniquePatient("tele"), date, time: "09:30", type: "Telemedicina" });
  x.ok("Telemedicina genera enlace de sala (Jitsi)", /^https:\/\/meet\.jit\.si\/trustleaf-/.test(tele.appt?.meet_link ?? ""), tele.appt?.meet_link ?? "sin link");

  const pres = await createAppointment({ patientEmail: uniquePatient("pres"), date, time: "10:00", type: "Presencial" });
  x.ok("Presencial NO genera enlace de video", !pres.appt?.meet_link, `meet_link=${pres.appt?.meet_link ?? "null"}`);

  await deleteAppointment(tele.appt?.id);
  await deleteAppointment(pres.appt?.id);
  return x.state;
}

if (process.argv[1]?.endsWith("p4-consulta.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
