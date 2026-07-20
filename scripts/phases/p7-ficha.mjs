// Fase 7 — El médico ancla una entrada en la ficha on-chain del paciente.
import { ctx, post, get, uniquePatient, DEMO_PATIENT_WALLET, DOCTOR_EMAIL, c } from "./lib.mjs";

export const name = "Fase 7 — Ficha clínica on-chain";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);
  const patientEmail = uniquePatient("ficha");

  const entry = await post("/api/ficha/entry", {
    patientEmail, patientWallet: DEMO_PATIENT_WALLET,
    kind: "Condition", summary: "Hipertensión arterial (fase 7)", detail: "CIE-10 I10", doctorEmail: DOCTOR_EMAIL,
  }).then((r) => r.json());
  x.ok("POST /api/ficha/entry genera el ancla SHA-256", /^[0-9a-f]{64}$/.test(entry.contentHash ?? ""), `hash=${(entry.contentHash ?? "").slice(0, 12)}…`);
  x.ok("la entrada se ancla on-chain (mode=onchain)", entry.mode === "onchain", `mode=${entry.mode}${entry.reason ? ` (${entry.reason})` : ""}`);

  const hist = (await get(`/api/ficha/entries?patientEmail=${encodeURIComponent(patientEmail)}`)).entries ?? [];
  x.ok("GET /api/ficha/entries devuelve la entrada", hist.some((e) => e.content_hash === entry.contentHash), `entradas=${hist.length}`);
  return x.state;
}

if (process.argv[1]?.endsWith("p7-ficha.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
