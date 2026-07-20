/**
 * Runner de las pruebas por fase.
 *
 *   node scripts/phases/run.mjs           # todas las fases, en orden
 *   node scripts/phases/run.mjs 3 5       # solo las fases 3 y 5
 *
 * Cada fase es autocontenida (siembra sus prerrequisitos y limpia). Verde =
 * esa fase funciona end-to-end contra el server + DB + cadena (en modo demo).
 * Requiere el dev server corriendo (npm run dev) y la Neon dev branch migrada.
 */
import { c, BASE } from "./lib.mjs";
import * as p1 from "./p1-medico.mjs";
import * as p2 from "./p2-disponibilidad.mjs";
import * as p3 from "./p3-reserva.mjs";
import * as p4 from "./p4-consulta.mjs";
import * as p5 from "./p5-consentimiento.mjs";
import * as p6 from "./p6-receta.mjs";
import * as p7 from "./p7-ficha.mjs";
import * as p8 from "./p8-documentos.mjs";

const PHASES = [p1, p2, p3, p4, p5, p6, p7, p8];

const wanted = process.argv.slice(2).map(Number).filter((n) => n >= 1 && n <= PHASES.length);
const selected = wanted.length ? wanted.map((n) => PHASES[n - 1]) : PHASES;

console.log(`\n  ${c.bold}Pruebas por fase${c.reset}  ${c.dim}base: ${BASE}${c.reset}`);

let totalPass = 0, totalFail = 0;
const rows = [];
for (const phase of selected) {
  try {
    const s = await phase.run();
    totalPass += s.pass; totalFail += s.fail;
    rows.push({ name: s.name, pass: s.pass, fail: s.fail });
  } catch (err) {
    totalFail += 1;
    rows.push({ name: phase.name, pass: 0, fail: 1, err: err.message });
    console.log(`  ${c.red}ERROR${c.reset} ${phase.name}: ${err.message}`);
  }
}

console.log(`\n  ${c.bold}Resumen${c.reset}`);
for (const r of rows) {
  const mark = r.fail ? `${c.red}✗${c.reset}` : `${c.green}✓${c.reset}`;
  console.log(`  ${mark}  ${r.name}  ${c.dim}(${r.pass} ok${r.fail ? `, ${r.fail} fail` : ""})${r.err ? ` — ${r.err}` : ""}${c.reset}`);
}
console.log(`\n  ${c.bold}${totalPass} PASS · ${totalFail} FAIL${c.reset}\n`);
process.exit(totalFail ? 1 : 0);
