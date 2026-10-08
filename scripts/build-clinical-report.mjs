// Presentation of public evidence only. Never reads .env, keys, Neon, or Stellar.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const INPUTS = ['demonstration.json', 'readback.json', 'contracts-audit.json', 'funding-audit.json', 'restoration-inspection.json', 'validation.json', 'ui-review.json', 'preparation.json'];
const STEPS = [
  ['create_history', 'Crear historial', 'Paciente', 'Firma del propietario'],
  ['grant', 'Conceder lectura y agregado', 'Paciente', 'Ser propietario del historial'],
  ['append_pdf', 'Agregar PDF', 'Médico', 'Autorización médica y permiso de agregar'],
  ['correct_pdf', 'Corregir PDF', 'Mismo médico', 'Ser autor y conservar permiso de agregar'],
  ['append_image', 'Agregar imagen', 'Médico', 'Autorización médica y permiso de agregar'],
  ['revoke', 'Revocar permisos', 'Paciente', 'Ser propietario del historial'],
];
const CLINICAL_CHECKS = [
  ['patientIntegrityAndPreviousVersion', 'Lectura del paciente e integridad de versiones'],
  ['authorizedDoctorRead', 'Lectura médica antes de revocar'],
  ['revocationDeniesSubsequentReadAndAppend', 'Lectura y agregado rechazados después de revocar'],
  ['alteredCiphertextRejected', 'Contenido cifrado alterado rechazado'],
];
const CONTRACT_LABELS = {
  DoctorRegistryPrivate: ['Registro médico', 'Conserva la autorización médica utilizada por la ficha y las recetas.'],
  PrescriptionPrivate: ['Recetas', 'Conserva el contrato de recetas del SOW 1. No se emiten ni modifican recetas en esta ejecución.'],
  ClinicalHistoryPrivate: ['Historia clínica', 'Registra historias, permisos independientes, versiones y comprobantes de integridad.'],
};
const FILE_GUIDE = [
  ['Dónde se guardan', 'En la base PostgreSQL alojada en Neon, dentro de la rama dev aislada de esta prueba. El archivo queda cifrado, sin un enlace público de descarga.'],
  ['Cómo se protegen', 'Cifrado AES-256-GCM con una clave por versión. La clave de servicio permanece fuera de Neon, protegida localmente con DPAPI en esta demostración.'],
  ['Quién puede leer', 'El servicio técnico comprueba identidad, permiso de lectura vigente, autorización médica cuando corresponde e integridad antes de entregar el archivo. Retirar permisos bloquea nuevos accesos; no borra copias ya descargadas.'],
  ['Formatos y tamaño', 'PDF, PNG y JPEG: hasta 3 MB (3.000.000 bytes) por archivo original, antes de cifrar. El contenido cifrado ocupa más espacio. La carga desde el portal y la compresión automática quedan para una etapa posterior.'],
];
const FILE_NARRATION = 'La imagen se guarda cifrada en Neon. Stellar registra quién la agregó, sus permisos y el comprobante de integridad. El archivo sólo se entrega tras comprobar el acceso autorizado, y el límite es de 3 MB.';

export function parseRunId(args) {
  if (args.length !== 2 || args[0] !== '--run-id' || !RUN_PATTERN.test(args[1] ?? '')) {
    throw Error('Use --run-id <UUID en minúsculas>.');
  }
  return args[1];
}

export function evidenceDirectory(runId, root = REPO_ROOT) {
  if (!RUN_PATTERN.test(runId)) throw Error('Identificador de ejecución inválido.');
  return resolve(root, 'docs', 'evidence', 'sow2-week1-runs', runId);
}

function assertWithin(root, path) {
  const rel = relative(realpathSync(root), realpathSync(path));
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Archivo fuera de la carpeta de evidencia.');
}

function rejectSymlinkPath(root, filename) {
  const rel = relative(root, filename);
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Archivo fuera de la carpeta de evidencia.');
  let current = root;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw Error('Enlace no permitido en evidencia pública.'); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
  }
}

export function loadReportEvidence(runId, root = REPO_ROOT) {
  const evidence = {}, files = [], issues = [];
  const directory = evidenceDirectory(runId, root);
  const read = (name, filename, area) => {
    try {
      rejectSymlinkPath(root, filename);
      assertWithin(root, filename);
      const bytes = readFileSync(filename);
      if (bytes.length > 2_000_000) throw Error('too_large');
      const data = JSON.parse(bytes.toString('utf8'));
      if (data === null || typeof data !== 'object' || Array.isArray(data)) throw Error('shape');
      evidence[name] = data;
      files.push({ file: relative(root, filename).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) {
      issues.push({ name, state: error.code === 'ENOENT' ? 'pending' : 'failed', area });
    }
  };
  read('deployment', join(root, 'docs/evidence/sow2-week1-2026-10-05/deployment.json'), 'base');
  const previousSnapshot = join(directory, 'previous-readback.json');
  read('original', existsSync(previousSnapshot) ? previousSnapshot : join(root, 'docs/evidence/sow2-week1-2026-10-05/readback.json'), 'previous');
  for (const name of INPUTS) read(name.replace('.json', ''), join(directory, name), 'new');
  return { evidence, files, issues, directory };
}

const safeDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;
const address = value => typeof value === 'string' && ADDRESS_PATTERN.test(value) ? value : null;
const hash = value => typeof value === 'string' && HASH_PATTERN.test(value) ? value : null;
const commit = value => typeof value === 'string' && COMMIT_PATTERN.test(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const result = value => value === true ? 'passed' : value === false ? 'failed' : 'pending';
const statusText = state => ({ passed: 'Comprobado', failed: 'Fallo observado', pending: 'Pendiente' })[state] ?? 'Pendiente';
const txLink = value => `https://stellar.expert/explorer/testnet/tx/${value}`;
const contractLink = value => `https://stellar.expert/explorer/testnet/contract/${value}`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function matchingRun(data, runId, deployment) {
  return data?.schemaVersion === 1 && data.network === 'testnet' && data.syntheticOnly === true &&
    data.runId === runId && data.contractId === deployment?.contractId && data.wasmHash === deployment?.wasmHash &&
    data.registryId === deployment?.registryId && safeDate(data.observedAt) !== null;
}

export function createReportModel(runId, { evidence, issues = [] }, generatedAt = new Date().toISOString()) {
  if (!RUN_PATTERN.test(runId) || !safeDate(generatedAt)) throw Error('Parámetros del informe inválidos.');
  const d = evidence.deployment;
  const deploymentValid = d?.schemaVersion === 1 && d.network === 'testnet' && address(d.contractId)?.startsWith('C') &&
    address(d.registryId)?.startsWith('C') && hash(d.wasmHash) && hash(d.registryWasmHash);
  const demo = matchingRun(evidence.demonstration, runId, d) ? evidence.demonstration : null;
  const readback = matchingRun(evidence.readback, runId, d) ? evidence.readback : null;
  const rawAudit = evidence['contracts-audit'];
  const audit = rawAudit?.schemaVersion === 1 && rawAudit.runId === runId && rawAudit.network === 'testnet' &&
    rawAudit.syntheticOnly === true && rawAudit.readOnly === true && rawAudit.newTransactions === 0 &&
    safeDate(rawAudit.observedAt) && Array.isArray(rawAudit.contracts) ? rawAudit : null;
  const invalid = [...issues.filter(issue => issue.state === 'failed')];
  for (const [name, value, valid] of [['deployment', d, deploymentValid], ['demonstration', evidence.demonstration, demo],
    ['readback', evidence.readback, readback], ['contracts-audit', rawAudit, audit]]) {
    if (value && !valid) invalid.push({ name, state: 'failed' });
  }
  const report = readback ?? demo;
  const patient = address(report?.transactions?.create_history?.source);
  const doctor = address(report?.transactions?.append_pdf?.source);
  const receipts = STEPS.map(([key, label, actor, permission]) => {
    const raw = report?.transactions?.[key];
    const txHash = hash(raw?.transactionHash), source = address(raw?.source);
    const expectedActor = ['create_history', 'grant', 'revoke'].includes(key) ? patient : doctor;
    const valid = txHash && source?.startsWith('G') && source === expectedActor && raw.status === 'SUCCESS' && count(raw.ledger) > 0;
    return { key, label, actor, permission, source, hash: txHash, ledger: count(raw?.ledger),
      state: raw ? (valid ? 'passed' : 'failed') : 'pending', explorer: valid ? txLink(txHash) : null };
  });
  const uniqueReceipts = new Set(receipts.map(tx => tx.hash).filter(Boolean)).size;
  const receiptsComplete = receipts.every(tx => tx.state === 'passed') && uniqueReceipts === 6 &&
    report?.confirmedAttemptCount === 6 && report?.pendingAttemptCount === 0 && Object.keys(report.transactions ?? {}).length === 6;
  if (report && !receiptsComplete) invalid.push({ name: 'clinical-receipts', state: 'failed' });
  const exactAudits = Array.isArray(readback?.auditedReceipts) && readback.auditedReceipts.length === 6 &&
    new Set(readback.auditedReceipts.map(row => row.name)).size === 6 && receipts.every(tx => {
      const row = readback.auditedReceipts.find(item => item.name === tx.key);
      const method = tx.key === 'create_history' ? 'create_history' : ['grant','revoke'].includes(tx.key) ? 'set_permissions' : 'append_version';
      return row?.contractId === d?.contractId && row.method === method && row.source === tx.source && row.transactionHash === tx.hash &&
        row.ledger === tx.ledger && row.status === 'SUCCESS' && row.signatureVerified === true && row.argumentsVerified === true && row.envelopeVerified === true;
    });
  const readbackVerified = Boolean(readback && receiptsComplete && exactAudits && readback.readbackAfterProcessRestart === true &&
    readback.files?.pdfVersions === 2 && readback.files?.pngVersions === 1 && readback.files?.maximumOriginalBytes === 3_000_000 &&
    CLINICAL_CHECKS.every(([key]) => readback.checks?.[key] === true));
  const checks = CLINICAL_CHECKS.map(([key, label]) => ({ label, state: result(report?.checks?.[key]) }));
  checks.push({ label: 'Lectura posterior desde otro proceso', state: readback ? (readbackVerified ? 'passed' : 'failed') : 'pending' });
  checks.push({ label: 'Cero intentos clínicos pendientes', state: report ? result(report.pendingAttemptCount === 0 && receiptsComplete) : 'pending' });
  const cards = Object.entries(CONTRACT_LABELS).map(([name, [label, description]]) => {
    const raw = audit?.contracts.find(item => item?.name === name);
    const fallbackId = name === 'ClinicalHistoryPrivate' ? d?.contractId : name === 'DoctorRegistryPrivate' ? d?.registryId : null;
    const id = address(raw?.contractId ?? fallbackId);
    const expectedId = name === 'ClinicalHistoryPrivate' ? d?.contractId : name === 'DoctorRegistryPrivate' ? d?.registryId : null;
    const wrongId = raw && (!id?.startsWith('C') || (expectedId && id !== expectedId));
    const expectedBaseHash = name === 'ClinicalHistoryPrivate' ? d?.wasmHash : name === 'DoctorRegistryPrivate' ? d?.registryWasmHash : null;
    const wasmMatches = hash(raw?.expectedWasmHash) && hash(raw?.observedWasmHash) && raw.expectedWasmHash === raw.observedWasmHash;
    const cardChecks = [
      { label: 'Código desplegado', state: raw ? result(raw.wasmVerified === true && Boolean(wasmMatches) && !wrongId && (!expectedBaseHash || raw.observedWasmHash === expectedBaseHash)) : 'pending' },
      { label: 'Interfaz y configuración', state: raw ? result(raw.interfaceVerified === true && raw.configurationVerified === true && !wrongId) : 'pending' },
    ];
    if (name === 'DoctorRegistryPrivate') cardChecks.push({ label: 'Autorización médica en la consulta', state: result(audit?.doctor?.authorized) });
    if (name === 'PrescriptionPrivate') cardChecks.push({ label: 'Registro de receta existente', state: audit?.prescriptionFixture?.status === 'verified' ? 'passed' : 'pending' });
    if (name === 'ClinicalHistoryPrivate') cardChecks.push({ label: 'Nueva ejecución y lectura posterior', state: readback ? result(readbackVerified) : 'pending' });
    return { name, label, description, contractId: id, wasmHash: hash(raw?.observedWasmHash),
      observedAt: audit ? safeDate(audit.observedAt) : null, checks: cardChecks,
      prescription: name === 'PrescriptionPrivate' && audit?.prescriptionFixture?.status === 'verified' ? {
        rxId: typeof audit.prescriptionFixture.rxId === 'string' && /^\d{1,20}$/.test(audit.prescriptionFixture.rxId) ? audit.prescriptionFixture.rxId : null,
        lifecycleState: { Registered: 'Registrada', Active: 'Activa', Revoked: 'Revocada' }[audit.prescriptionFixture.lifecycleState] ?? 'Estado no acreditado',
        expired: audit.prescriptionFixture.expired === true,
        isValid: audit.prescriptionFixture.isValid === true,
      } : null,
      state: cardChecks.some(check => check.state === 'failed') ? 'failed' : cardChecks.every(check => check.state === 'passed') ? 'passed' : 'pending' };
  });
  const v = evidence.validation;
  const validationValid = v?.schemaVersion === 1 && v.runId === runId && v.network === 'testnet' && safeDate(v.observedAt) && typeof v.tests === 'object';
  if (v && !validationValid) invalid.push({ name: 'validation', state: 'failed' });
  const tests = [['clinical', 'Contrato clínico'], ['contracts', 'Workspace contractual'], ['private', 'Servicios privados'], ['application', 'Aplicación']]
    .map(([key, label]) => ({ label, passed: validationValid ? count(v.tests[key]) : null }));
  const testChecks = [['typeScript', 'TypeScript'], ['build', 'Build']]
    .map(([key, label]) => ({ label, state: validationValid ? result(v.tests[key]) : 'pending' }));
  const previous = evidence.original;
  const previousValid = previous?.schemaVersion === 1 && previous.network === 'testnet' && previous.syntheticOnly === true &&
    RUN_PATTERN.test(previous.runId ?? '') && previous.runId !== runId && previous.contractId === d?.contractId && safeDate(previous.observedAt);
  const executionBlocked = audit?.clinicalExecution?.ready === false;
  const fundingHash = hash(report?.funding?.transactionHash);
  const fundingAudit = evidence['funding-audit'];
  const fundingVerified = !fundingHash || (fundingAudit?.schemaVersion === 1 && fundingAudit.runId === runId && fundingAudit.network === 'testnet' &&
    fundingAudit.readOnly === true && fundingAudit.transactionHash === fundingHash && fundingAudit.patient === patient && fundingAudit.status === 'verified' &&
    fundingAudit.envelopeHashVerified === true && fundingAudit.destinationVerified === true && fundingAudit.operationsVerified === 1 && fundingAudit.clinicalOperation === false);
  const funding = fundingHash ? { hash: fundingHash, explorer: txLink(fundingHash), provider: 'Stellar Testnet Friendbot' } : null;
  const complete = readbackVerified && cards.every(card => card.state === 'passed') && tests.every(test => test.passed > 0) &&
    testChecks.every(check => check.state === 'passed') && fundingVerified && invalid.length === 0;
  return { runId, generatedAt: safeDate(generatedAt), state: invalid.length || checks.some(check => check.state === 'failed') || cards.some(card => card.state === 'failed') ? 'failed' : complete ? 'passed' : 'pending',
    sourceCommit: commit(v?.sourceCommit ?? v?.productCommit ?? v?.commit) ?? commit(audit?.sourceCommit),
    deployment: deploymentValid ? { contractId: d.contractId, registryId: d.registryId, wasmHash: d.wasmHash,
      confirmedAt: safeDate(d.confirmedAt), transactions: ['upload', 'deploy'].map(key => {
        const tx = d.transactions?.[key]; return { label: key === 'upload' ? 'Publicación del WASM' : 'Despliegue clínico',
          hash: hash(tx?.transactionHash), state: tx?.status === 'SUCCESS' && hash(tx.transactionHash) ? 'passed' : 'pending' };
      }) } : null,
    observedAt: safeDate(report?.observedAt), auditObservedAt: safeDate(audit?.observedAt), validationObservedAt: validationValid ? safeDate(v.observedAt) : null,
    cards, receipts, checks, tests, testChecks, funding, executionBlocked, doctorValidUntil: safeDate(audit?.doctor?.validUntilUtc),
    confirmedTransactions: receiptsComplete ? 6 : receipts.filter(tx => tx.state === 'passed').length,
    encryptedVersions: readbackVerified ? 3 : null,
    original: previousValid ? { runId: previous.runId, observedAt: safeDate(previous.observedAt), confirmedTransactions: count(previous.confirmedAttemptCount) } : null,
    issues: invalid.map(issue => issue.name), inputsMissing: issues.filter(issue => issue.state === 'pending').map(issue => issue.name),
  };
}

function badge(state) { return `<span class="badge ${esc(state)}">${esc(statusText(state))}</span>`; }
function code(value) { return value ? `<code>${esc(value)}</code>` : '<span class="muted">Pendiente</span>'; }
function link(url, label) { return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}<span class="sr-only"> (abre en otra pestaña)</span></a>`; }
function formatDate(value) { return value ? `${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value))} (Chile); ${value}` : 'Sin comprobación registrada'; }
function stateList(items) { return `<ul class="checks">${items.map(item => `<li><span>${esc(item.label)}</span>${badge(item.state)}</li>`).join('')}</ul>`; }

export function renderClinicalHtml(m) {
  const clinical = m.cards.find(card => card.name === 'ClinicalHistoryPrivate');
  const contractSummary = {
    DoctorRegistryPrivate: { label: 'Registro médico', stage: 'Existente · SOW 1', description: 'Comprueba qué médicos están autorizados en TrustLeaf.' },
    PrescriptionPrivate: { label: 'Recetas', stage: 'Existente · SOW 1', description: 'Conserva las recetas y permite consultar sus estados.' },
    ClinicalHistoryPrivate: { label: 'Historia clínica', stage: 'Nuevo · SOW 2', description: 'Registra permisos del paciente, versiones y comprobantes de integridad.' },
  };
  const clinicalTests = m.tests.find(test => test.label === 'Contrato clínico')?.passed;
  const summaryChecks = [
    { ...m.checks[0], label: 'Versiones conservadas e integridad comprobada' },
    { ...m.checks[2], label: 'Acceso médico rechazado tras revocar' },
    { ...m.checks[3], label: 'Archivo alterado rechazado' },
    { ...m.checks[5], label: 'Sin intentos pendientes' },
  ];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TrustLeaf · Evidencia de semana 1</title>
<style>
:root{color-scheme:light;--ink:#15324b;--muted:#4b6579;--blue:#00679d;--sky:#edf8ff;--line:#c8dfef;--paper:#fff;--base:#f5faff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--base);font:16px/1.55 "Segoe UI",Arial,sans-serif}main{max-width:1040px;margin:0 auto;padding:30px 24px 48px}a{color:var(--blue);text-underline-offset:.2em;overflow-wrap:anywhere}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #005d91;outline-offset:4px}h1,h2,h3,p{margin-top:0}h1{max-width:22ch;font-size:clamp(2rem,4vw,2.8rem);line-height:1.16;letter-spacing:-.025em;margin-bottom:16px}h2{font-size:1.45rem;line-height:1.3;margin-bottom:14px}h3{font-size:1.15rem;line-height:1.3;margin-bottom:10px}p{max-width:74ch}.skip{position:absolute;top:-90px;background:white;padding:12px;z-index:10}.skip:focus{top:8px}.brand{font-weight:700;color:var(--blue);margin-bottom:22px}.brand small{font-weight:400;color:var(--muted);margin-left:12px;font-size:.95rem}.intro{padding-bottom:22px;border-bottom:1px solid var(--line)}.lead{font-size:1.1rem;margin-bottom:14px}.provenance,.muted{color:var(--muted)}.provenance{font-size:.9rem;overflow-wrap:anywhere}.section{margin-top:30px}.notice{background:var(--sky);border-left:4px solid #0083c9;padding:16px 20px;margin:20px 0}.notice.warning{background:#fff5dd;border-color:#a86a06}.notice p:last-child{margin-bottom:0}.foundation{background:white;border:1px solid var(--line);border-left:4px solid #7bc9f2;border-radius:10px;padding:20px 24px}.foundation p:last-child{margin-bottom:0}.checks{list-style:none;padding:0;margin:14px 0 0}.checks li{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-top:1px solid var(--line);padding:10px 0;font-size:.95rem}.badge{display:inline-block;white-space:nowrap;line-height:1.4;padding:4px 9px;font-size:.8rem;border-radius:6px;flex:none;font-weight:650}.passed{color:#12522d;background:#e5f5ec}.failed{color:#873421;background:#ffede8}.pending{color:#735013;background:#fff2ce}code{font-family:Consolas,monospace;font-size:.87em;overflow-wrap:anywhere;word-break:break-word}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--paper)}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--sky);font-weight:650;font-size:.9rem}tr:last-child td{border-bottom:0}td small{display:block;color:var(--muted);margin-top:5px}.receipt{display:inline-block;font-size:.9rem;margin-left:12px}.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.compare article{background:var(--paper);border-left:3px solid var(--line);padding:18px 20px}.compare article p{margin-bottom:0}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);border-radius:10px;background:white;padding:18px 8px;gap:8px}.stats div{padding:0 16px}.stats strong{display:block;font-size:1.75rem;line-height:1.25;color:var(--blue)}.stats span{font-size:.9rem;color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{padding:20px;border:1px solid var(--line);background:white;border-radius:10px}.card h3{margin-top:12px}.card p{font-size:.95rem}.contract-id{font-size:.83rem}.version{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 16px;margin:16px 0}.version dt{font-weight:650}.version dd{margin:0;overflow-wrap:anywhere}.technical{margin-top:28px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px 0}.technical>summary{font-weight:650;padding:15px 0}.technical-body{padding:4px 0 22px}.technical-body>.section{margin-top:24px}summary{cursor:pointer;padding:10px 0;color:var(--blue)}.limits{margin-top:20px;font-size:.9rem;color:var(--muted)}.limits p{margin-bottom:8px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}footer{margin-top:20px;color:var(--muted);font-size:.85rem}@media(max-width:800px){.cards{grid-template-columns:1fr}}@media(max-width:540px){main{padding:24px 16px 36px}.brand small{display:block;margin-left:0;margin-top:4px}.compare{grid-template-columns:1fr}.version{grid-template-columns:1fr;gap:2px}.version dd{margin-bottom:12px}.checks li{flex-wrap:wrap;gap:6px}.foundation{padding:18px}.stats{padding:12px 4px;gap:0}.stats div{padding:0 8px}.stats strong{font-size:1.5rem}.stats span{font-size:.8rem}.flow-wrap{border:0;background:transparent;overflow:visible}.flow thead{display:none}.flow,.flow tbody,.flow tr,.flow td{display:block;width:100%}.flow tr{background:white;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;padding:4px}.flow td{border:0;padding:8px 12px}.flow td::before{content:attr(data-label);display:block;font-size:.78rem;font-weight:650;color:var(--muted);margin-bottom:3px}.receipt{margin-left:10px}.notice{padding:14px 16px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white}main{padding:0}a{color:inherit}article,tr{break-inside:avoid}.technical-body{display:block}}
</style></head><body><a class="skip" href="#contenido">Saltar al informe</a><main id="contenido">
<div class="brand">TrustLeaf <small>SOW 2 · Semana 1 · Stellar Testnet</small></div>
<header class="intro"><h1>Historia privada.<br>Permisos del paciente.</h1><p class="lead">La base técnica para compartir antecedentes con autorización y comprobar sus cambios.</p>${badge(m.state)}<p class="provenance">Informe guardado, sin consulta en vivo. Datos sintéticos; ejecución ya realizada.</p></header>
${m.executionBlocked ? `<div class="notice warning"><p><strong>Preparación bloqueada en la consulta registrada.</strong> No hay luz verde para una ejecución nueva.</p><p>Vigencia médica registrada: ${esc(formatDate(m.doctorValidUntil))}. Debe comprobarse otra vez antes de firmar.</p></div>` : ''}
${m.issues.length ? `<div class="notice warning"><p><strong>Evidencia incompleta o inconsistente.</strong> No se declara aprobada.</p><p>Comprobaciones: ${esc(m.issues.join(', '))}.</p></div>` : ''}
<section class="section" aria-labelledby="contratos"><h2 id="contratos">Qué entregamos</h2><article class="foundation"><h3>Un contrato clínico nuevo en Testnet</h3><p>El paciente concede y retira permisos de <strong>lectura y agregado por separado</strong>. El médico autorizado agrega sus aportes; las correcciones conservan las versiones anteriores.</p>${clinical?.contractId ? `<p>${link(contractLink(clinical.contractId), 'Ver contrato en Stellar Expert')}</p>` : '<p>Identificador pendiente de auditoría.</p>'}</article><p class="provenance">Se integra con el registro médico existente. El contrato de recetas se conserva.</p></section>
<section class="section" aria-labelledby="ejecucion"><h2 id="ejecucion">El recorrido comprobado</h2><p class="provenance">Seis operaciones ya confirmadas. Los recibos permiten revisar cada paso.</p><div class="table-wrap flow-wrap"><table class="flow"><thead><tr><th scope="col">Paso</th><th scope="col">Quién firma</th><th scope="col">Resultado</th></tr></thead><tbody>${m.receipts.map((tx,i)=>`<tr><td data-label="Paso"><strong>${i+1}. ${esc(tx.label)}</strong>${tx.key==='append_image'?'<small><a href="#archivos">Dónde se guarda</a></small>':''}</td><td data-label="Quién firma">${esc(tx.actor)}</td><td data-label="Resultado">${badge(tx.state)}${tx.explorer?`<span class="receipt">${link(tx.explorer,'Ver recibo')}</span>`:'<small>Recibo confirmado pendiente.</small>'}</td></tr>`).join('')}</tbody></table></div></section>
<section class="section" aria-labelledby="archivos"><h2 id="archivos">Dónde quedan los archivos</h2><div class="compare"><article><h3>En Neon, privados</h3><p>PDF e imágenes cifrados con AES-256-GCM. Las claves permanecen fuera de la base. Límite actual: <strong>3 MB por archivo original</strong>.</p></article><article><h3>En Stellar, comprobantes</h3><p>Permisos, autores y versiones con pruebas de integridad. <strong>El contenido médico no se publica.</strong></p></article></div></section>
<section class="section" aria-labelledby="resultados"><h2 id="resultados">Qué comprobamos</h2><div class="stats"><div><strong>${esc(m.confirmedTransactions)}</strong><span>recibos clínicos</span></div><div><strong>${m.encryptedVersions===null?'—':esc(m.encryptedVersions)}</strong><span>versiones recuperadas</span></div><div><strong>${clinicalTests===null||clinicalTests===undefined?'—':esc(clinicalTests)}</strong><span>pruebas del contrato</span></div></div>${stateList(summaryChecks)}<p class="provenance">Lectura registrada: ${esc(formatDate(m.observedAt).split(';')[0])}. Pruebas aisladas: ${esc(formatDate(m.validationObservedAt).split(';')[0])}.</p></section>
<section class="section" aria-labelledby="tres-contratos"><h2 id="tres-contratos">Tres contratos en el flujo de TrustLeaf</h2><p class="provenance">El nuevo historial clínico utiliza el registro médico existente. La vinculación de recetas con la ficha corresponde a las semanas siguientes.</p><div class="cards">${m.cards.map(c=>{const summary=contractSummary[c.name];return `<article class="card"><p class="provenance">${esc(summary.stage)}</p><h3>${esc(summary.label)}</h3><p>${esc(summary.description)}</p><p>${c.contractId?link(contractLink(c.contractId),'Ver contrato'): 'Identificador pendiente de auditoría'}</p></article>`;}).join('')}</div></section>
<details class="technical"><summary>Ver evidencia técnica</summary><div class="technical-body">
<dl class="version"><dt>Ejecución</dt><dd>${code(m.runId)}</dd><dt>Commit de referencia</dt><dd>${code(m.sourceCommit)}</dd><dt>Informe generado</dt><dd>${esc(formatDate(m.generatedAt))}</dd><dt>Lectura registrada</dt><dd>${esc(formatDate(m.observedAt))}</dd></dl>
<section class="section"><h3>Tres contratos y sus comprobaciones</h3><div class="cards">${m.cards.map(c=>`<article class="card">${badge(c.state)}<h3>${esc(c.label)}</h3><p><strong>${esc(c.name)}</strong></p><p>${esc(c.description)}</p><p class="contract-id">${c.contractId?link(contractLink(c.contractId),c.contractId):'Identificador pendiente de auditoría'}</p>${stateList(c.checks)}${c.prescription?`<p class="provenance">Receta existente ${c.prescription.rxId?'#'+esc(c.prescription.rxId):''}: ${esc(c.prescription.lifecycleState)}${c.prescription.expired?', vencida':''}. Vigencia en la consulta: ${c.prescription.isValid?'sí':'no'}. Comprobar el registro no equivale a declararlo vigente.</p>`:''}<p class="provenance">Consulta registrada: ${esc(formatDate(c.observedAt))}</p>${c.wasmHash?`<details><summary>Ver comprobante de código</summary>${code(c.wasmHash)}</details>`:''}</article>`).join('')}</div></section>
<section class="section"><h3>Actores, permisos y recibos completos</h3><div class="table-wrap"><table><thead><tr><th scope="col">Paso</th><th scope="col">Actor y permiso</th><th scope="col">Recibo</th></tr></thead><tbody>${m.receipts.map(tx=>`<tr><td>${esc(tx.label)}</td><td>${esc(tx.actor)}<small>${esc(tx.permission)}</small>${tx.source?`<small>${code(tx.source)}</small>`:''}</td><td>${tx.explorer?link(tx.explorer,tx.hash):'Pendiente'}<small>Ledger ${esc(tx.ledger??'Pendiente')}</small></td></tr>`).join('')}</tbody></table></div>${stateList(m.checks)}</section>
${m.deployment?`<section class="section" aria-labelledby="despliegue"><h3 id="despliegue">Despliegue anterior</h3><p>Estos recibos no forman parte de las seis operaciones clínicas.</p><ul>${m.deployment.transactions.map(tx=>`<li>${esc(tx.label)}: ${tx.state==='passed'?link(txLink(tx.hash),tx.hash):'Pendiente de recibo válido'}</li>`).join('')}</ul><p class="provenance">Despliegue registrado: ${esc(formatDate(m.deployment.confirmedAt))}</p></section>`:''}
${m.funding?`<section class="section" aria-labelledby="adicionales"><h3 id="adicionales">Financiación adicional</h3><p>La financiación por ${esc(m.funding.provider)} se registra aparte de las seis operaciones clínicas.</p><p>${link(m.funding.explorer,m.funding.hash)}</p></section>`:''}
<section class="section"><h3>Almacenamiento y protección</h3><dl class="version">${FILE_GUIDE.map(([label,text])=>`<dt>${esc(label)}</dt><dd>${esc(text)}</dd>`).join('')}</dl><p><strong>Para narrar:</strong> «${esc(FILE_NARRATION)}»</p><p>Neon aloja la base; las herramientas locales realizan el cifrado y las comprobaciones. El servidor puede descifrar para personas autorizadas. No se promete cifrado de extremo a extremo ni se eliminan copias descargadas al revocar.</p></section>
<section class="section" aria-labelledby="pruebas"><h3 id="pruebas">Pruebas aisladas de esta versión</h3><p>No sustituyen operaciones reales de Privy o Stellar. Las 14 clínicas están incluidas en el total contractual cuando corresponde al registro mostrado.</p><div class="table-wrap"><table><thead><tr><th scope="col">Conjunto</th><th scope="col">Aprobadas</th></tr></thead><tbody>${m.tests.map(t=>`<tr><td>${esc(t.label)}</td><td>${t.passed===null?'Pendiente':esc(t.passed)}</td></tr>`).join('')}</tbody></table></div>${stateList(m.testChecks)}<p class="provenance">Validación registrada: ${esc(formatDate(m.validationObservedAt))}</p></section>
<section class="section" aria-labelledby="separacion"><h3 id="separacion">Dos ejecuciones, evidencia separada</h3>${m.original?`<p>Primera prueba: ${code(m.original.runId)}. ${esc(m.original.confirmedTransactions??'Cantidad no acreditada')} transacciones clínicas. Lectura: ${esc(formatDate(m.original.observedAt))}.</p>`:'<p>Primera prueba pendiente de evidencia completa.</p>'}<p>Prueba presentada: ${code(m.runId)}. ${esc(m.confirmedTransactions)} recibos clínicos. No se vuelven a ejecutar ni se atribuyen recibos de la primera prueba a ésta.</p></section>
</div></details>
<aside class="limits" aria-labelledby="limites"><h3 id="limites">Alcance de esta entrega</h3><p>Demostración técnica con datos sintéticos en Testnet. Las pantallas clínicas y Privy corresponden a las semanas siguientes. Restauración real de estado archivado: pendiente.</p><p>Revisión de PR, checks del commit final y video se acreditan por separado. Sin certificación de seguridad ni veracidad clínica.</p></aside>
<footer>Informe estático local, sin archivos clínicos, secretos ni acciones de firma.</footer></main></body></html>`;
}

export function renderClinicalMarkdown(m) {
  const lines = [ '# TrustLeaf · SOW 2 · Informe de semana 1', '',
    `**Estado:** ${statusText(m.state)}. **Ejecución:** \`${m.runId}\`.`, '',
    `Informe generado: ${formatDate(m.generatedAt)}. Es evidencia guardada; no una consulta en vivo.`, '',
    `Commit de referencia de la evidencia: ${m.sourceCommit ? `\`${m.sourceCommit}\`` : '**pendiente**'}.`, '',
    '## Contratos y comprobaciones', '', '| Contrato | Función | Estado | Identificador |', '|---|---|---|---|',
    ...m.cards.map(c => `| ${c.name} | ${c.description} | ${statusText(c.state)} | ${c.contractId ? `[Stellar Expert](${contractLink(c.contractId)})` : 'Pendiente'} |`), '',
    `Auditoría registrada: ${formatDate(m.auditObservedAt)}. Sólo el contrato clínico recibe operaciones nuevas.`, '',
    ...m.cards.filter(c => c.prescription).map(c => `Receta existente ${c.prescription.rxId ? '#' + c.prescription.rxId : ''}: **${c.prescription.lifecycleState}${c.prescription.expired ? ', vencida' : ''}**. Vigencia consultada: ${c.prescription.isValid ? 'sí' : 'no'}. Comprobar el registro no declara que esté vigente.`), '',
    ...(m.deployment ? ['### Despliegue existente', '', `Contrato clínico: \`${m.deployment.contractId}\`. WASM: \`${m.deployment.wasmHash}\`.`, '',
      ...m.deployment.transactions.map(tx => `- ${tx.label}: ${tx.hash ? `[${tx.hash}](${txLink(tx.hash)})` : 'Recibo pendiente'}.`), '',
      `Registrado: ${formatDate(m.deployment.confirmedAt)}. Los recibos de despliegue son anteriores; no pertenecen a las seis operaciones nuevas.`, ''] : []),
    ...(m.executionBlocked ? ['**Preparación bloqueada en la consulta registrada.** Volver a comprobar la autorización médica antes de firmar.', '', `Vigencia registrada: ${formatDate(m.doctorValidUntil)}.`, ''] : []),
    ...(m.issues.length ? [`**Evidencia inconsistente:** ${m.issues.join(', ')}. No se declara aprobada.`, ''] : []),
    '## Recorrido de la ejecución nueva', '', '| Paso | Firma | Permiso necesario | Estado | Recibo |', '|---|---|---|---|---|',
    ...m.receipts.map(tx => `| ${tx.label} | ${tx.actor} | ${tx.permission} | ${statusText(tx.state)} | ${tx.explorer ? `[${tx.hash}](${tx.explorer})` : 'Pendiente'} |`), '',
    `Lectura posterior registrada: ${formatDate(m.observedAt)}.`, '',
    ...m.checks.map(c => `- ${c.label}: **${statusText(c.state)}**.`), '',
    '### Paso 5 · Almacenamiento y tamaño de archivos', '',
    ...FILE_GUIDE.map(([label, text]) => `- **${label}:** ${text}`), '',
    `**Para narrar:** «${FILE_NARRATION}»`, '',
    'Neon aloja la base; las herramientas locales de TrustLeaf realizan el cifrado y las comprobaciones de esta prueba. El informe sólo muestra evidencia guardada.', '',
    ...(m.funding ? ['### Operación adicional de preparación', '', `Financiación de la cuenta sintética por ${m.funding.provider}: [${m.funding.hash}](${m.funding.explorer}). Se registra aparte; no forma parte de las seis operaciones clínicas.`, ''] : []),
    '## Pruebas aisladas', '', '| Conjunto | Pruebas aprobadas |', '|---|---|',
    ...m.tests.map(t => `| ${t.label} | ${t.passed === null ? 'Pendiente' : t.passed} |`),
    ...m.testChecks.map(c => `| ${c.label} | ${statusText(c.state)} |`), '',
    `Registro de validación: ${formatDate(m.validationObservedAt)}. Las pruebas simuladas se distinguen de transacciones reales.`, '',
    '## Privacidad y evidencia anterior', '',
    'Stellar conserva identificadores técnicos, permisos, versiones y comprobantes. Neon conserva PDF e imágenes cifrados; las claves permanecen fuera de la base. Leer no crea una transacción.', '',
    'TrustLeaf puede descifrar para usuarios autorizados. Retirar permisos bloquea accesos posteriores mediante la aplicación; no elimina copias descargadas ni garantiza la veracidad clínica.', '',
    m.original ? `Primera ejecución conservada: \`${m.original.runId}\`, ${m.original.confirmedTransactions ?? 'cantidad no acreditada'} recibos clínicos. No se atribuyen a esta ejecución nueva.` : 'Comparación de la primera ejecución pendiente de evidencia disponible.', '',
    '## Pendientes y alcance', '',
    '- Restauración real de estado archivado pendiente. Inspeccionar entradas disponibles no la demuestra.',
    '- Revisión de PR, checks del commit final y video se acreditan por separado.',
    '- Sin pantallas clínicas nuevas ni integración clínica Privy. Sólo identidades técnicas y datos sintéticos en Testnet.',
    '- No representa auditoría externa, certificación de seguridad ni atención clínica real.', '',
    'La financiación de cuentas y cualquier operación adicional real deben quedar registradas por separado del recorrido clínico.', '',
  ];
  return lines.join('\n');
}

export function buildClinicalReport(runId, root = REPO_ROOT) {
  const loaded = loadReportEvidence(runId, root);
  const model = createReportModel(runId, loaded);
  rejectSymlinkPath(root, loaded.directory);
  mkdirSync(loaded.directory, { recursive: true });
  assertWithin(root, loaded.directory);
  const outputs = [['index.html', renderClinicalHtml(model)], ['report.md', renderClinicalMarkdown(model)]];
  const files = [...loaded.files];
  for (const [name, content] of outputs) {
    const output = join(loaded.directory, name);
    rejectSymlinkPath(loaded.directory, output);
    // Existing symlink output files are not followed outside the evidence root.
    try { assertWithin(loaded.directory, output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    writeFileSync(output, content, { encoding: 'utf8', flag: 'w' });
    const bytes = Buffer.from(content);
    files.push({ file: relative(root, output).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = { schemaVersion: 1, runId, network: 'testnet', generatedAt: model.generatedAt,
    sourceCommit: model.sourceCommit, state: model.state, liveVerification: false, files,
    limits: ['Does not verify authenticity of source evidence', 'No medical files or secrets', 'Manifest does not hash itself', 'Archived-state restoration not demonstrated'] };
  const manifestFile = join(loaded.directory, 'integrity-manifest.json');
  rejectSymlinkPath(loaded.directory, manifestFile);
  try { assertWithin(loaded.directory, manifestFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { model, directory: loaded.directory };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const runId = parseRunId(process.argv.slice(2));
    const { model, directory } = buildClinicalReport(runId);
    console.log(JSON.stringify({ runId, state: model.state, publicReport: relative(REPO_ROOT, directory).replaceAll('\\', '/'),
      liveVerification: false, confirmedClinicalTransactions: model.confirmedTransactions }));
  } catch { console.error('No se pudo generar el informe público. Comprueba --run-id y la evidencia saneada.'); process.exitCode = 1; }
}
