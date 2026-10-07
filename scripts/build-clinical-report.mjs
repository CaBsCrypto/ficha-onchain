// Presentation of public evidence only. Never reads .env, keys, Neon, or Stellar.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ADDRESS_PATTERN = /^[GC][A-Z2-7]{55}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const INPUTS = ['demonstration.json', 'readback.json', 'contracts-audit.json', 'validation.json', 'preparation.json'];
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
  read('original', join(root, 'docs/evidence/sow2-week1-2026-10-05/readback.json'), 'previous');
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
  const readbackVerified = Boolean(readback && receiptsComplete && readback.readbackAfterProcessRestart === true &&
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
  const funding = fundingHash ? { hash: fundingHash, explorer: txLink(fundingHash), provider: 'Stellar Testnet Friendbot' } : null;
  const complete = readbackVerified && cards.every(card => card.state === 'passed') && tests.every(test => test.passed > 0) &&
    testChecks.every(check => check.state === 'passed') && invalid.length === 0;
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
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TrustLeaf · Evidencia de semana 1</title>
<style>
:root{color-scheme:light;--ink:#15324b;--muted:#4b6579;--blue:#00679d;--sky:#edf8ff;--line:#c8dfef;--paper:#fff;--base:#f5faff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:var(--base);font:16px/1.6 "Segoe UI",Arial,sans-serif}a{color:var(--blue);text-underline-offset:.2em;overflow-wrap:anywhere}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible{outline:3px solid #005d91;outline-offset:4px}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(2rem,4vw,3rem);line-height:1.16;letter-spacing:-.03em;margin-bottom:18px}h2{font-size:1.55rem;line-height:1.3}h3{font-size:1.2rem;line-height:1.35}p{max-width:74ch}main{max-width:1180px;margin:0 auto;padding:36px 24px 72px}.skip{position:absolute;top:-90px;background:white;padding:12px;z-index:10}.skip:focus{top:8px}.brand{font-weight:700;font-size:1.2rem;color:var(--blue);margin-bottom:24px}.brand small{font-weight:400;color:var(--muted);margin-left:12px;font-size:1rem}.intro{padding:0 0 26px;border-bottom:1px solid var(--line)}.lead{font-size:1.1rem}.notice{background:var(--sky);border-left:4px solid #0083c9;padding:16px 20px;margin:22px 0}.notice.warning{background:#fff5dd;border-color:#a86a06}.notice p:last-child{margin-bottom:0}.provenance{font-size:.95rem;color:var(--muted);overflow-wrap:anywhere}.section{margin-top:36px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{background:var(--paper);padding:22px;border:1px solid var(--line);border-top:4px solid #7bc9f2;border-radius:12px}.card h3{margin-top:14px}.card p{font-size:.95rem}.contract-id{font-size:.83rem}.checks{list-style:none;padding:0;margin:16px 0 0}.checks li{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-top:1px solid var(--line);padding:11px 0;font-size:.95rem}.badge{display:inline-block;white-space:nowrap;line-height:1.4;padding:4px 9px;font-size:.8rem;border-radius:6px;flex:none;font-weight:650}.passed{color:#12522d;background:#e5f5ec}.failed{color:#873421;background:#ffede8}.pending{color:#735013;background:#fff2ce}code{font-family:Consolas,monospace;font-size:.87em;overflow-wrap:anywhere;word-break:break-word}.muted{color:var(--muted)}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--paper)}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:15px;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--sky);font-weight:650;font-size:.9rem}tr:last-child td{border-bottom:0}td small{display:block;color:var(--muted);margin-top:6px}.receipt{font-size:.82rem;display:block;margin-top:6px}.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.compare article{background:var(--paper);border-left:3px solid var(--line);padding:20px}.compare h3{margin-bottom:10px}.legend{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.legend span{border:1px solid var(--line);padding:5px 10px;border-radius:6px;font-size:.85rem}.version{display:grid;grid-template-columns:150px minmax(0,1fr);gap:6px 16px;margin:16px 0}.version dt{font-weight:650}.version dd{margin:0;overflow-wrap:anywhere}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}footer{margin-top:36px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}summary{cursor:pointer;padding:10px 0;color:var(--blue)}li{margin-bottom:6px}@media(max-width:900px){.cards{grid-template-columns:1fr}.card{padding:20px}.compare{grid-template-columns:1fr}}@media(max-width:540px){main{padding:24px 16px 48px}.brand small{display:block;margin-left:0}.version{grid-template-columns:1fr;gap:2px}.version dd{margin-bottom:12px}th,td{padding:11px}.checks li{flex-wrap:wrap;gap:6px}.notice{padding:14px 16px}.table-wrap{border:0;background:transparent;overflow:visible}.flow thead{display:none}.flow,.flow tbody,.flow tr,.flow td{display:block;width:100%}.flow tr{background:white;border:1px solid var(--line);border-radius:10px;margin-bottom:12px;padding:5px}.flow td{border:0}.flow td::before{content:attr(data-label);display:block;font-size:.78rem;font-weight:650;color:var(--muted);margin-bottom:3px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white}main{padding:0}.cards{grid-template-columns:repeat(3,1fr)}a{color:inherit}article,tr{break-inside:avoid}.notice{border:1px solid var(--line)}}
</style></head><body><a class="skip" href="#contenido">Saltar al informe</a><main id="contenido">
<div class="brand">TrustLeaf <small>SOW 2 · Semana 1 · Stellar Testnet</small></div>
<header class="intro"><h1>Una ficha privada.<br>Un recorrido comprobable.</h1><p class="lead">Evidencia técnica del contrato clínico, sus permisos y el almacenamiento cifrado. Esta página permite revisar el trabajo; todavía no es el portal clínico de pacientes y médicos.</p>${badge(m.state)}
<div class="notice"><p><strong>Informe guardado, sin consulta en vivo.</strong> Las fechas indican cuándo se comprobó cada resultado. Recargar esta página no consulta Stellar ni actualiza permisos.</p><p class="provenance">Preparado: ${esc(formatDate(m.generatedAt))}</p></div>
<dl class="version"><dt>Ejecución nueva</dt><dd>${code(m.runId)}</dd><dt>Commit de referencia</dt><dd>${code(m.sourceCommit)}</dd><dt>Lectura registrada</dt><dd>${esc(formatDate(m.observedAt))}</dd></dl></header>
${m.executionBlocked ? `<div class="notice warning"><p><strong>Preparación bloqueada en la consulta registrada.</strong> La auditoría no dio luz verde para una ejecución nueva. Los resultados disponibles no sustituyen esa condición.</p><p>Vigencia médica registrada: ${esc(formatDate(m.doctorValidUntil))}. La autorización requiere comprobarse de nuevo antes de firmar.</p></div>` : ''}
${m.issues.length ? `<div class="notice warning"><p><strong>Evidencia incompleta o inconsistente.</strong> No se declara aprobada.</p><p>Archivos o comprobaciones: ${esc(m.issues.join(', '))}.</p></div>` : ''}
<section class="section" aria-labelledby="contratos"><h2 id="contratos">Tres contratos, responsabilidades distintas</h2><p>Sólo la historia clínica recibe operaciones nuevas en este recorrido. El registro médico y las recetas se consultan sin modificar sus estados.</p><div class="cards">${m.cards.map(c => `<article class="card">${badge(c.state)}<h3>${esc(c.label)}</h3><p><strong>${esc(c.name)}</strong></p><p>${esc(c.description)}</p><p class="contract-id">${c.contractId ? link(contractLink(c.contractId), c.contractId) : 'Identificador pendiente de auditoría'}</p>${stateList(c.checks)}${c.prescription ? `<p class="provenance">Receta existente ${c.prescription.rxId ? '#' + esc(c.prescription.rxId) : ''}: ${esc(c.prescription.lifecycleState)}${c.prescription.expired ? ', vencida' : ''}. Vigencia en la consulta: ${c.prescription.isValid ? 'sí' : 'no'}. Comprobar el registro no equivale a declararlo vigente.</p>` : ''}<p class="provenance">Consulta registrada: ${esc(formatDate(c.observedAt))}</p>${c.wasmHash ? `<details><summary>Ver comprobante de código</summary>${code(c.wasmHash)}</details>` : ''}</article>`).join('')}</div></section>
${m.deployment ? `<section class="section" aria-labelledby="despliegue"><h2 id="despliegue">Un despliegue existente, una prueba nueva</h2><p>Se reutiliza el contrato clínico desplegado anteriormente. Estos dos recibos no forman parte de las seis operaciones de la ejecución nueva.</p><ul>${m.deployment.transactions.map(tx => `<li>${esc(tx.label)}: ${tx.hash ? link(txLink(tx.hash), tx.hash) : 'Pendiente de recibo válido'}</li>`).join('')}</ul><p class="provenance">Despliegue registrado: ${esc(formatDate(m.deployment.confirmedAt))}</p></section>` : ''}
<section class="section" aria-labelledby="ejecucion"><h2 id="ejecucion">La nueva ejecución, paso a paso</h2><p>Cada fila es una operación del contrato clínico. Guardar o leer el archivo en Neon es una acción separada; leer no crea una transacción Stellar.</p><div class="legend"><span>Transacciones nuevas</span><span>Lecturas reales</span><span>Pruebas aisladas</span></div><div class="table-wrap"><table class="flow"><thead><tr><th scope="col">Momento</th><th scope="col">Actor y permiso</th><th scope="col">Resultado y recibo</th></tr></thead><tbody>${m.receipts.map((tx, i) => `<tr><td data-label="Momento"><strong>${i + 1}. ${esc(tx.label)}</strong></td><td data-label="Actor y permiso">${esc(tx.actor)}<small>${esc(tx.permission)}</small>${tx.source ? `<small>${code(tx.source)}</small>` : ''}</td><td data-label="Resultado y recibo">${badge(tx.state)}${tx.explorer ? `<span class="receipt">${link(tx.explorer, tx.hash)}</span><small>Ledger ${esc(tx.ledger)}</small>` : '<small>No hay recibo confirmado acreditado en esta ejecución.</small>'}</td></tr>`).join('')}</tbody></table></div><p class="provenance">${esc(m.confirmedTransactions)} recibos clínicos confirmados en el informe. ${m.encryptedVersions === null ? 'Persistencia de las tres versiones pendiente de lectura posterior.' : 'Tres versiones cifradas recuperadas: PDF original, corrección y una imagen.'}</p>${stateList(m.checks)}</section>
${m.funding ? `<section class="section" aria-labelledby="adicionales"><h2 id="adicionales">Operación adicional de preparación</h2><p>La cuenta sintética nueva recibió financiación de ${esc(m.funding.provider)}. Es una operación distinta de las seis transacciones clínicas; no se cuenta como permiso ni como aporte médico.</p><p>${link(m.funding.explorer, m.funding.hash)}</p></section>` : ''}
<section class="section" aria-labelledby="privacidad"><h2 id="privacidad">Qué es público y qué queda privado</h2><div class="compare"><article><h3>En Stellar Testnet</h3><p>Identificadores técnicos, autorizaciones, versiones y comprobantes de integridad. No se publican los PDF, imágenes ni su contenido médico.</p></article><article><h3>Fuera de blockchain</h3><p>Los archivos permanecen cifrados en Neon dev. Las claves se guardan fuera de la base. TrustLeaf verifica identidad, permisos e integridad antes de entregar el contenido.</p></article></div><p class="provenance">El servidor puede descifrar para personas autorizadas. No se promete cifrado de extremo a extremo ni se eliminan copias ya descargadas al revocar.</p></section>
<section class="section" aria-labelledby="pruebas"><h2 id="pruebas">Pruebas aisladas de esta versión</h2><p>No sustituyen una operación real de Privy o Stellar. Las cifras sólo se muestran cuando hay un registro de validación para esta ejecución.</p><div class="table-wrap"><table><thead><tr><th scope="col">Conjunto</th><th scope="col">Aprobadas</th></tr></thead><tbody>${m.tests.map(t => `<tr><td>${esc(t.label)}</td><td>${t.passed === null ? 'Pendiente' : esc(t.passed)}</td></tr>`).join('')}</tbody></table></div>${stateList(m.testChecks)}<p class="provenance">Validación registrada: ${esc(formatDate(m.validationObservedAt))}</p></section>
<section class="section" aria-labelledby="separacion"><h2 id="separacion">Dos ejecuciones, evidencia separada</h2><div class="compare"><article><h3>Primera prueba conservada</h3>${m.original ? `<p>${code(m.original.runId)}</p><p>${esc(m.original.confirmedTransactions ?? 'Cantidad no acreditada')} transacciones clínicas registradas. No se vuelven a ejecutar ni se atribuyen a la prueba nueva.</p><p class="provenance">Lectura registrada: ${esc(formatDate(m.original.observedAt))}</p>` : '<p>No hay evidencia original completa disponible para comparar.</p>'}</article><article><h3>Prueba nueva</h3><p>${code(m.runId)}</p><p>${esc(m.confirmedTransactions)} recibos clínicos acreditados. Financiación, preparación o cualquier operación adicional se documenta por separado.</p><p class="provenance">Lectura registrada: ${esc(formatDate(m.observedAt))}</p></article></div></section>
<section class="section" aria-labelledby="limites"><h2 id="limites">Pendientes y límites de entrega</h2><ul><li>Restauración real de estado archivado: pendiente; una inspección de entradas disponibles no demuestra restauración.</li><li>Revisión de PR, CI/Vercel del commit final y grabación: deben quedar acreditados por separado.</li><li>Esta semana no incluye las pantallas clínicas nuevas ni sus firmas mediante Privy.</li><li>Datos sintéticos en Testnet; sin atención real, auditoría externa ni certificación de seguridad.</li></ul></section>
<footer>Archivo estático local. No contiene secretos, archivos clínicos ni acciones que firmen. Los enlaces abren recibos públicos en Stellar Expert.</footer></main></body></html>`;
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
