// Fase 1 — El médico existe, está activo y tiene perfil.
import { ctx, get, DOCTOR_EMAIL, c } from "./lib.mjs";

export const name = "Fase 1 — Médico (cuenta + perfil)";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);

  const docs = await get("/api/doctors");
  const doc = (docs.doctors ?? []).find((d) => d.email === DOCTOR_EMAIL);
  x.ok("el médico demo aparece en /api/doctors (activo)", Boolean(doc), doc?.name ?? "no encontrado");
  x.ok("el médico tiene especialidad", Boolean(doc?.specialty), doc?.specialty ?? "sin especialidad");

  // Editar/leer el perfil propio exige token Privy (ruta estricta) → manual.
  x.manual("Mi perfil (GET/PUT /api/doctor/profile) — requiere login del médico");
  return x.state;
}

if (process.argv[1]?.endsWith("p1-medico.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
