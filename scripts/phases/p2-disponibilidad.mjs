// Fase 2 — El médico planifica su disponibilidad semanal.
import { ctx, seedAvailability, get, DOCTOR_EMAIL, c } from "./lib.mjs";

export const name = "Fase 2 — Disponibilidad";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);

  // El PUT (replace-all) es la escritura; el GET es la fuente de verdad. Se
  // valida por el GET para no depender del parseo de la respuesta del PUT.
  await seedAvailability();
  const got = await get(`/api/doctor/availability?doctorEmail=${encodeURIComponent(DOCTOR_EMAIL)}`);
  x.ok("la grilla queda guardada (PUT + GET, ≥5 bloques)", Array.isArray(got.data) && got.data.length >= 5, `bloques=${got.data?.length}`);
  x.ok("los bloques son lun–vie 09:00–13:00", (got.data ?? []).every((b) => b.start_time === "09:00" && b.end_time === "13:00"), `bloques=${got.data?.length}`);
  return x.state;
}

if (process.argv[1]?.endsWith("p2-disponibilidad.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
