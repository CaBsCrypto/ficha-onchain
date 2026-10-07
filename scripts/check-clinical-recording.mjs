// Read-only network validation of an existing execution; no deployment or new signatures.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clinicalRunConfiguration } from './lib/clinical-run-config.mjs';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, TRUSTLEAF_CLINICAL_TESTNET_WRITES: 'false', TRUSTLEAF_CLINICAL_MIGRATION: 'false' };
let selection;
try { selection = clinicalRunConfiguration(process.argv.slice(2), { allowedModes: ['--check'], defaultMode: '--check' }); }
catch { console.error('Selector de ejecución inválido; no se ejecutó ninguna comprobación.'); process.exit(1); }
const runArgs = selection.runId ? ['--run-id', selection.runId] : [];
const steps = [
  ['Auditoría de los tres contratos activos', process.execPath, ['scripts/audit-clinical-contracts.mjs', ...runArgs]],
  ['Reglas del contrato: pruebas aisladas', 'cargo', ['test', '--locked', '--manifest-path', 'contracts/Cargo.toml', '-p', 'clinical-history-private']],
  ['Lectura real de archivos, permisos y seis recibos', process.execPath, ['--env-file=.env.local', 'scripts/validate-clinical-testnet.mjs', '--readback', ...runArgs]],
  ['Inspección del estado disponible, sin restaurar', process.execPath, ['--env-file=.env.local', 'scripts/restore-clinical-testnet.mjs', '--inspect', ...runArgs]],
  ['Resumen de la evidencia recién leída', process.execPath, ['scripts/present-clinical-evidence.mjs', ...runArgs]],
];
console.log('SOW 2 · Semana 1 · Auditoría de ejecución existente');
console.log('Sin nuevas transacciones. Readback actualiza únicamente el informe público local.');
for (const [label, executable, args] of steps) {
  console.log(`\n${label}`);
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', shell: false, timeout: 180000 });
  if (result.error || result.status !== 0) {
    console.error('COMPROBACIÓN INTERRUMPIDA. No se declara lista la grabación; revisar este paso.');
    process.exit(1);
  }
}
console.log('\nAuditoría terminada. Pendientes separados: revisión de PR, video y restauración real de estado archivado.');
