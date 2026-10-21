// Offline presentation of public evidence. Does not verify live state or read secrets.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { clinicalRunConfiguration } from './lib/clinical-run-config.mjs';
try {
  const selection = clinicalRunConfiguration(process.argv.slice(2), { allowedModes: ['--present'], defaultMode: '--present' });
  const load = name => JSON.parse(readFileSync(resolve(selection.evidence, name), 'utf8'));
  const deployment = JSON.parse(readFileSync(selection.deploymentFile, 'utf8'));
  const report = load('readback.json');
  if (deployment.network !== 'testnet' || report.network !== 'testnet' ||
      report.contractId !== deployment.contractId || report.wasmHash !== deployment.wasmHash ||
      report.readbackAfterProcessRestart !== true || report.syntheticOnly !== true ||
      (selection.runId && report.runId !== selection.runId) || report.confirmedAttemptCount !== 6 || report.pendingAttemptCount !== 0 ||
      report.files.pdfVersions !== 2 || report.files.pngVersions !== 1 ||
      Object.keys(report.transactions).length !== 6 ||
      ['patientIntegrityAndPreviousVersion', 'authorizedDoctorRead', 'revocationDeniesSubsequentReadAndAppend', 'alteredCiphertextRejected'].some(key => report.checks?.[key] !== true) ||
      Object.values(report.transactions).some(tx => tx.status !== 'SUCCESS' || !/^[a-f0-9]{64}$/.test(tx.transactionHash))) {
    throw new Error('evidence_mismatch');
  }
  console.log('TRUSTLEAF · SOW 2 · SEMANA 1');
  console.log('Informe guardado; no es una consulta nueva de Testnet.');
  console.log(`Lectura registrada: ${report.observedAt}`);
  console.log(`Ejecución: ${report.runId}`);
  console.log(`Contrato: ${report.contractId}`);
  console.log(`WASM: ${report.wasmHash}`);
  console.log('6 recibos SUCCESS · 3 versiones cifradas · 0 intentos pendientes');
  console.log('Lectura e integridad del paciente: APROBADAS');
  console.log('Acceso médico tras revocación: RECHAZADO');
  console.log('Datos sintéticos · Neon dev · firmas técnicas, sin login Privy');
  const labels = { create_history: 'Crear historial', grant: 'Conceder permisos', append_pdf: 'Agregar PDF',
    correct_pdf: 'Corregir PDF conservando versión', append_image: 'Agregar imagen', revoke: 'Revocar permisos' };
  for (const [step, tx] of Object.entries(report.transactions)) {
    console.log(`\n${labels[step] ?? step}: ${tx.status}`);
    console.log(`https://stellar.expert/explorer/testnet/tx/${tx.transactionHash}`);
  }
  if (report.funding) console.log(`\nFinanciación adicional del paciente: ${report.funding.explorer}`);
  console.log('\nPendiente: restauración real de estado archivado. No acredita seguridad certificada ni veracidad clínica.');
} catch {
  console.error('No se pudo presentar la evidencia pública completa; no se declara aprobada.');
  process.exitCode = 1;
}
