// Fase 8 — El médico emite una licencia / documento on-chain.
import { ctx, post, DEMO_PATIENT_WALLET, c } from "./lib.mjs";

export const name = "Fase 8 — Licencias / documentos on-chain";

export async function run() {
  const x = ctx(name);
  console.log(`\n${c.bold}${name}${c.reset}`);

  const res = await post("/api/documents/mint", {
    recipient: DEMO_PATIENT_WALLET, docType: "LaborRest", expiresAt: 0,
    payload: { patientName: "Paciente Demo", patientRut: "11.111.111-1", days: 7, startDate: "2026-07-21", diagnosis: "Lumbago", cie10: "M54.5", doctorName: "Dr. Cristian Brown" },
  }).then((r) => r.json());
  const data = res.data ?? {};
  x.ok("POST /api/documents/mint genera el content hash", /^[0-9a-f]{64}$/.test(data.contentHash ?? ""), `hash=${(data.contentHash ?? "").slice(0, 12)}…`);
  x.ok("el documento se emite on-chain (mode=onchain)", data.mode === "onchain", `mode=${data.mode}${data.reason ? ` (${data.reason})` : ""}`);
  if (data.docId) x.ok("devuelve un id de documento on-chain", /^\d+$/.test(String(data.docId)), `docId=${data.docId}`);
  return x.state;
}

if (process.argv[1]?.endsWith("p8-documentos.mjs")) run().then((s) => process.exit(s.fail ? 1 : 0));
