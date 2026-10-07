import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { parseRunId, createReportModel, renderClinicalHtml, renderClinicalMarkdown, buildClinicalReport } from './build-clinical-report.mjs';
import { reportRequestHandler } from './serve-clinical-report.mjs';

const RUN = '12bb720d-8862-4735-824a-85c5ce63a5e0';
const OLD = 'f1a575bc-0146-47e1-a192-f259876f3b82';
const DATE = '2026-10-07T04:30:07.763Z';
const CLINICAL = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const REGISTRY = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const RX = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
const PATIENT = 'GC6HMNCSFQZNX5DQKTIKHLZ2R7A6RGBUC5NTOLEGBFCZPFSTFLXCHPM4';
const DOCTOR = 'GA2CSQROVUXJYUH6MTGN42UP3P624NY23HXUW2N3LYX5FSEQ4E2TX3TR';
const WASM = 'a'.repeat(64);

function fixture() {
  const deployment = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL, registryId: REGISTRY,
    registryWasmHash: WASM, wasmHash: WASM, confirmedAt: DATE, transactions: {} };
  const transactions = Object.fromEntries(['create_history', 'grant', 'append_pdf', 'correct_pdf', 'append_image', 'revoke'].map((key, i) => [key,
    { transactionHash: String(i + 1).repeat(64), source: ['create_history', 'grant', 'revoke'].includes(key) ? PATIENT : DOCTOR,
      status: 'SUCCESS', ledger: 5030000 + i, explorer: 'javascript:alert(1)' }]));
  const demonstration = { schemaVersion: 1, runId: RUN, network: 'testnet', syntheticOnly: true, contractId: CLINICAL, registryId: REGISTRY,
    wasmHash: WASM, observedAt: DATE, transactions, confirmedAttemptCount: 6, pendingAttemptCount: 0,
    files: { pdfVersions: 2, pngVersions: 1, maximumOriginalBytes: 3_000_000 },
    checks: { patientIntegrityAndPreviousVersion: true, authorizedDoctorRead: true, revocationDeniesSubsequentReadAndAppend: true, alteredCiphertextRejected: true } };
  const readback = { ...demonstration, readbackAfterProcessRestart: true };
  const audit = { schemaVersion: 1, runId: RUN, network: 'testnet', syntheticOnly: true, readOnly: true, newTransactions: 0,
    observedAt: DATE, sourceCommit: 'c'.repeat(40), contracts: ['DoctorRegistryPrivate', 'PrescriptionPrivate', 'ClinicalHistoryPrivate'].map((name, i) => ({
      name, contractId: [REGISTRY, RX, CLINICAL][i], expectedWasmHash: WASM, observedWasmHash: WASM,
      wasmVerified: true, interfaceVerified: true, configurationVerified: true })),
    doctor: { authorized: true, validUntilUtc: DATE }, clinicalExecution: { ready: true }, prescriptionFixture: { status: 'verified' } };
  const validation = { schemaVersion: 1, runId: RUN, network: 'testnet', observedAt: DATE,
    tests: { clinical: 14, contracts: 25, private: 109, application: 634, typeScript: true, build: true }, sourceCommit: 'c'.repeat(40) };
  return { evidence: { deployment, demonstration, readback, 'contracts-audit': audit, validation,
    original: { ...readback, runId: OLD } }, issues: [] };
}

test('run selector refuses traversal, option injection, uppercase and non-UUID values', () => {
  assert.equal(parseRunId(['--run-id', RUN]), RUN);
  for (const args of [['--run-id', '../secrets'], ['--run-id', RUN.toUpperCase()], ['--run-id', '--restore'], ['--run-id', RUN, '--run'], []]) {
    assert.throws(() => parseRunId(args));
  }
});

test('complete fixture is approved only with fresh-run readback, audits, and validation', () => {
  const model = createReportModel(RUN, fixture(), DATE);
  assert.equal(model.state, 'passed');
  assert.equal(model.confirmedTransactions, 6);
  assert.equal(model.encryptedVersions, 3);
  assert.equal(model.original.runId, OLD);
  assert.equal(model.sourceCommit, 'c'.repeat(40));
  assert.equal(model.cards.length, 3);
});

test('missing new evidence stays pending and does not reuse original run tests or receipts', () => {
  const data = fixture();
  delete data.evidence.demonstration; delete data.evidence.readback; delete data.evidence.validation;
  const model = createReportModel(RUN, data, DATE);
  assert.equal(model.state, 'pending');
  assert.equal(model.confirmedTransactions, 0);
  assert.equal(model.encryptedVersions, null);
  assert.ok(model.tests.every(row => row.passed === null));
});

test('cross-run, wrong-network, or non-synthetic readback is rejected', () => {
  for (const [key, value] of [['runId', OLD], ['network', 'mainnet'], ['syntheticOnly', false], ['wasmHash', 'b'.repeat(64)]]) {
    const data = fixture(); data.evidence.readback[key] = value;
    const model = createReportModel(RUN, data, DATE);
    assert.equal(model.state, 'failed');
    assert.equal(model.encryptedVersions, null);
  }
});

test('false checks, duplicate hashes, incorrect actor, and pending attempts never pass', () => {
  const changes = [
    data => { data.evidence.readback.checks.alteredCiphertextRejected = false; },
    data => { data.evidence.readback.transactions.grant.transactionHash = data.evidence.readback.transactions.create_history.transactionHash; },
    data => { data.evidence.readback.transactions.grant.source = DOCTOR; },
    data => { data.evidence.readback.pendingAttemptCount = 1; },
  ];
  for (const change of changes) { const data = fixture(); change(data); assert.equal(createReportModel(RUN, data, DATE).state, 'failed'); }
});

test('expired doctor records a blocked preparation and failed registry condition', () => {
  const data = fixture(); data.evidence['contracts-audit'].doctor.authorized = false;
  data.evidence['contracts-audit'].clinicalExecution.ready = false;
  const model = createReportModel(RUN, data, DATE);
  assert.equal(model.executionBlocked, true);
  assert.equal(model.cards[0].state, 'failed');
  assert.match(renderClinicalHtml(model), /Preparación bloqueada/);
});

test('renderer uses safe derived Explorer links and omits unrecognized private fields', () => {
  const data = fixture();
  data.evidence.readback.email = 'do-not-publish@example.org';
  data.evidence.readback.clinicalContent = '<script>medical-secret</script>';
  data.evidence['contracts-audit'].clinicalExecution.blockers = ['<img src=x onerror=alert(1)>'];
  const model = createReportModel(RUN, data, DATE), html = renderClinicalHtml(model), markdown = renderClinicalMarkdown(model);
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('do-not-publish@example.org'));
  assert.ok(!html.includes('medical-secret'));
  assert.ok(!html.includes('onerror='));
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /Informe guardado, sin consulta en vivo/);
  assert.match(markdown, /Restauración real de estado archivado pendiente/);
});

test('funding receipt is separate from six clinical operations and its URL is derived', () => {
  const data = fixture();
  data.evidence.readback.funding = { transactionHash: 'f'.repeat(64), source: 'Stellar Testnet Friendbot', explorer: 'javascript:private' };
  const model = createReportModel(RUN, data, DATE);
  assert.equal(model.confirmedTransactions, 6);
  assert.equal(model.receipts.length, 6);
  assert.equal(model.funding.explorer, `https://stellar.expert/explorer/testnet/tx/${'f'.repeat(64)}`);
  assert.match(renderClinicalMarkdown(model), /Operación adicional de preparación/);
});

test('existing prescription may be verified while expired; report makes validity explicit', () => {
  const data = fixture();
  data.evidence['contracts-audit'].prescriptionFixture = { status: 'verified', rxId: '2', lifecycleState: 'Registered', expired: true, isValid: false };
  const model = createReportModel(RUN, data, DATE);
  assert.equal(model.cards[1].state, 'passed');
  assert.equal(model.cards[1].prescription.isValid, false);
  assert.match(renderClinicalHtml(model), /Registrada, vencida/);
  assert.match(renderClinicalMarkdown(model), /Vigencia consultada: no/);
});

test('generator produces HTML, Markdown and verifiable manifest inside one execution', () => {
  const root = mkdtempSync(join(tmpdir(), 'trustleaf-report-'));
  try {
    const original = join(root, 'docs/evidence/sow2-week1-2026-10-05'), run = join(root, 'docs/evidence/sow2-week1-runs', RUN);
    mkdirSync(original, { recursive: true }); mkdirSync(run, { recursive: true });
    const { evidence } = fixture();
    writeFileSync(join(original, 'deployment.json'), JSON.stringify(evidence.deployment));
    writeFileSync(join(original, 'readback.json'), JSON.stringify(evidence.original));
    for (const name of ['demonstration', 'readback', 'contracts-audit', 'validation']) writeFileSync(join(run, name + '.json'), JSON.stringify(evidence[name]));
    const built = buildClinicalReport(RUN, root);
    assert.equal(built.model.state, 'passed');
    const manifest = JSON.parse(readFileSync(join(run, 'integrity-manifest.json'), 'utf8'));
    assert.equal(manifest.liveVerification, false);
    assert.equal(manifest.files.length, 8);
    assert.ok(manifest.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
    for (const file of manifest.files) {
      const bytes = readFileSync(join(root, file.file));
      assert.equal(file.bytes, bytes.length);
      assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    assert.match(readFileSync(join(run, 'index.html'), 'utf8'), /<html lang="es">/);
    assert.match(readFileSync(join(run, 'report.md'), 'utf8'), /Informe de semana 1/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

async function http(server, path, method = 'GET') {
  const port = server.address().port;
  return new Promise((resolvePromise, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolvePromise({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end();
  });
}

test('loopback handler serves only index GET/HEAD and rejects traversal, private paths and writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trustleaf-viewer-'));
  let server;
  try {
    writeFileSync(join(root, 'index.html'), '<!doctype html><html lang="es"><p>public</p></html>');
    writeFileSync(join(root, 'secret.txt'), 'must-not-be-served');
    server = createServer(reportRequestHandler(root)).listen(0, '127.0.0.1'); await once(server, 'listening');
    const page = await http(server, '/'); assert.equal(page.status, 200); assert.match(page.body, /public/);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.match(page.headers['content-security-policy'], /default-src 'none'/);
    const head = await http(server, '/index.html', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
    for (const path of ['/secret.txt', '/../index.html', '/%2e%2e/index.html', '/.env', '/.trustleaf-local/', '/index.html?download=secret', '/index.html/']) {
      assert.equal((await http(server, path)).status, 404);
    }
    assert.equal((await http(server, '/', 'POST')).status, 405);
  } finally { if (server) await new Promise(resolvePromise => server.close(resolvePromise)); rmSync(root, { recursive: true, force: true }); }
});
