/**
 * scripts/seed-pain-journey.mjs — 8 weeks of pain-diary history for the demo.
 *
 * An empty diary demos nothing: the whole point of the product is what you see
 * ACROSS weeks, so the recording needs a patient with a past. This writes a
 * story that is legible in the chart without narration:
 *
 *   sem 1-2  dolor lumbar alto y errático, sin patrón   → "así llega el paciente"
 *   sem 3    aparece el patrón: peor los lunes/martes    → lo que el médico no ve hoy
 *   sem 4    ajuste de tratamiento (marcado en la nota)
 *   sem 5-8  descenso sostenido, con una recaída real    → mejora creíble, no una recta
 *
 * The relapse in week 6 is deliberate. A monotonic curve reads as fake, and the
 * point of continuous follow-up is precisely catching the bad week.
 *
 *   node scripts/seed-pain-journey.mjs --privy-id=did:privy:xxx [--base=URL] [--weeks=8]
 *
 * BASE defaults to localhost:3000. Point it at production to seed the real
 * deploy. Idempotent: /api/pain-diary upserts on (privy_id, date), so re-running
 * overwrites the same days instead of duplicating them.
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);

const BASE = (args.base || "http://localhost:3000").replace(/\/$/, "");
const PRIVY_ID = args["privy-id"];
const WEEKS = Number(args.weeks || 8);

if (!PRIVY_ID) {
  console.error(`
Falta --privy-id.

Cómo obtenerlo: entra a la app como el paciente del demo, abre la consola del
navegador (F12) y corre:

  JSON.parse(localStorage.getItem('privy:user') || '{}')?.id

O búscalo en el panel de Privy. Se ve así: did:privy:cm4xxxxxxxxxxxxx

Uso:
  node scripts/seed-pain-journey.mjs --privy-id=did:privy:xxx
  node scripts/seed-pain-journey.mjs --privy-id=did:privy:xxx --base=https://trustleaf-demo.vercel.app
`);
  process.exit(1);
}

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

/** YYYY-MM-DD, `back` days before today. */
function isoDaysAgo(back) {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Pain level for a given day, counting backwards from today.
 * `age` 0 = today, larger = further in the past.
 */
function levelFor(age, weekday) {
  const week = Math.floor(age / 7); // 0 = this week, WEEKS-1 = oldest
  // Baseline improves as we approach today (low week index = recent = better).
  const baseline = week >= 6 ? 7.5 : week >= 4 ? 6.8 : week === 3 ? 6.0 : week === 2 ? 4.6 : week === 1 ? 3.4 : 2.8;
  // The pattern the doctor never gets to see: Monday/Tuesday are worse.
  const weekdayBump = weekday === 1 ? 1.6 : weekday === 2 ? 1.1 : weekday === 0 ? -0.4 : 0;
  // A real relapse ~6 weeks in — a straight line down reads as fabricated.
  const relapse = week === 1 && weekday >= 3 && weekday <= 4 ? 2.4 : 0;
  // Deterministic jitter (no Math.random: re-runs must produce the same story).
  const jitter = ((age * 37) % 7) / 10 - 0.3;
  return Math.max(1, Math.min(10, Math.round((baseline + weekdayBump + relapse + jitter) * 10) / 10));
}

/** The zones that carry the story: lumbar primary, leg referred, neck secondary. */
function zonesFor(level, age) {
  const entries = [{ zone: "back_lower", level, note: undefined }];
  // Referred leg pain only on the bad days — that IS the clinical signal.
  if (level >= 6) entries.push({ zone: "leg_r", level: Math.max(1, Math.round((level - 2) * 10) / 10) });
  // Neck tension shows up intermittently, unrelated to the lumbar pattern.
  if (age % 5 === 0) entries.push({ zone: "neck", level: Math.max(1, Math.round((level - 3.5) * 10) / 10) });
  return entries;
}

/** Notes only on the days that mean something — a note every day reads as noise. */
function noteFor(age, weekday, level) {
  const week = Math.floor(age / 7);
  if (week === 3 && weekday === 3) return "Control con el médico. Se ajusta el tratamiento.";
  if (week === 1 && weekday === 3) return "Mala semana. Dormí muy poco.";
  if (weekday === 1 && level >= 6) return "Otra vez peor el lunes.";
  if (week >= 6 && weekday === 5) return "No pude salir a caminar.";
  if (week === 0 && weekday === 5) return "Mucho mejor. Caminé 40 minutos.";
  return undefined;
}

const days = [];
for (let age = WEEKS * 7 - 1; age >= 0; age--) {
  const date = isoDaysAgo(age);
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  // Real people skip days. A perfect streak is the tell of seeded data.
  if ((age * 13) % 9 === 0) continue;
  const level = levelFor(age, weekday);
  const note = noteFor(age, weekday, level);
  const timestamp = `${date}T${19 + (age % 3)}:${String((age * 7) % 60).padStart(2, "0")}:00.000Z`;
  const entries = zonesFor(level, age).map((e, i) => ({
    ...e,
    note: i === 0 ? note : undefined,
    timestamp,
  }));
  days.push({ date, entries, level });
}

console.log(`\n${B}Sembrando ${days.length} días de diario de dolor${X}`);
console.log(`${D}  destino: ${BASE}${X}`);
console.log(`${D}  paciente: ${PRIVY_ID}${X}\n`);

let okCount = 0;
const failures = [];
for (const d of days) {
  try {
    const res = await fetch(`${BASE}/api/pain-diary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privyId: PRIVY_ID, date: d.date, entries: d.entries }),
    });
    if (res.ok) {
      okCount++;
    } else {
      failures.push(`${d.date} → HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  } catch (e) {
    failures.push(`${d.date} → ${e.message}`);
  }
}

// A compact sparkline so you can eyeball the story before recording.
const BLOCKS = "▁▂▃▄▅▆▇█";
const spark = days.map((d) => BLOCKS[Math.min(7, Math.floor((d.level - 1) / 1.13))]).join("");
console.log(`  ${G}✓${X} ${okCount}/${days.length} días escritos`);
console.log(`\n  ${D}hace ${WEEKS} semanas${X}  ${spark}  ${D}hoy${X}`);
console.log(`  ${D}         dolor alto y errático → patrón → ajuste → mejora (con recaída)${X}\n`);

if (failures.length) {
  console.log(`  ${R}✗ ${failures.length} fallaron:${X}`);
  for (const f of failures.slice(0, 5)) console.log(`    ${D}${f}${X}`);
  process.exit(1);
}
console.log(`  ${B}Listo.${X} Abre ${BASE}/patient/pain-diary/history como este paciente.\n`);
