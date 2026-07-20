// Fase 6 — El médico emite una receta on-chain (Decreto 41).
import { ctx, post, DEMO_PATIENT_WALLET, c } from "./lib.mjs";

export const name = "Fase 6 — Receta médica on-chain";

// RUT 11.111.111-1 tiene dígito verificador válido; el mint valida el RUT.
const RX_BODY = {
  patient: DEMO_PATIENT_WALLET,
  medication: "Losartán 50mg", dosage: "1 comprimido c/24h", quantity: 30,
  patientName: "Paciente Demo", patientDocType: "RUT", patientDocNumber: "11.111.111-1",
  patientSex: "F", patientBirthDate: "1987-04-12", patientAddress: "Av. Siempre Viva 742",
  patientPhone: "+56912345678", healthSystem: "FONASA",
  doctorName: "Dr. Cristian Brown", doctorRut: "11.111.111-1", doctorSpecialty: "Medicina General",
  clinicName: "Clínica Demo", clinicRut: "77.777.777-7",
  diagnosis: "Hipertensión esencial", cie10Code: "I10", prescriptionType: "SIMPLE",
  consentGranted: true, consentDate: "2026-07-20",
};

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);

  const mint = await post("/api/mint", RX_BODY).then((r) => r.json());
  x.ok("POST /api/mint genera el ancla FHIR (rxHash)", /^[0-9a-f]{64}$/.test(mint.rxHash ?? ""), `rxHash=${(mint.rxHash ?? "").slice(0, 12)}…`);
  x.ok("la receta se emite on-chain (mode=onchain)", mint.mode === "onchain", `mode=${mint.mode}${mint.reason ? ` (${mint.reason})` : ""}`);
  if (mint.rxId) x.ok("devuelve un id de receta on-chain", /^\d+$/.test(String(mint.rxId)), `rxId=${mint.rxId}`);

  // Activar la receta exige el token Privy del paciente (ruta estricta) → manual.
  x.manual("Activar receta (POST /api/prescriptions/activate) — requiere login del paciente");
  return x.state;
}

if (process.argv[1]?.endsWith("p6-receta.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
