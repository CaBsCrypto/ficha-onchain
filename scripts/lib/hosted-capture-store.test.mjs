import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Keypair } from '@stellar/stellar-sdk';
import { webClinicalHistoryId } from './clinical-web-receipt-audit.mjs';
import {
  activateHostedCapture, assertHostedCaptureOperator, assertHostedCaptureWeb, closeHostedCapture,
  lockHostedCaptureMutation, lockHostedCaptureRecovery, readHostedCaptureActive, readHostedCaptureByRequest,
  readHostedCaptureBySha, recordHostedCaptureVerification, stageHostedCapture,
} from './hosted-capture-store.mjs';

const database = 'ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech';
const env = {
  TRUSTLEAF_HOSTED_CAPTURE_OPERATOR: 'true', TRUSTLEAF_ENV: 'test', TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false',
  NEXT_PUBLIC_STELLAR_NETWORK: 'testnet', TRUSTLEAF_DB_HOST: database,
  TRUSTLEAF_DATABASE_URL: 'postgresql://user:example@' + database + '/sample?sslmode=require',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function example(openedAt = Math.floor(Date.now() / 1000) - 1) {
  const patient = { userId: 'did:privy:patient12345', walletId: 'patientwallet', address: Keypair.random().publicKey() };
  const doctor = { userId: 'did:privy:doctor12345', walletId: 'doctorwallet', address: Keypair.random().publicKey() };
  const plan = { schemaVersion: 1, phase: 'create', runId: randomUUID(), openedAt, until: openedAt + 60,
    network: 'testnet', patient, doctor, historyId: webClinicalHistoryId(patient.address), doctorId: 28,
    relayer: Keypair.random().publicKey(), requestId: randomUUID() };
  const bytes = Buffer.from(JSON.stringify(plan) + '\n');
  const sha256 = sha(bytes);
  return { plan, bytes, sha256, phase: 'create', env };
}

function store(plan) {
  const scopes = new Map(), requests = new Map(), verifications = new Map(), activations = [], calls = [];
  const result = rows => ({ rows });
  return { scopes, requests, verifications, activations, calls, async query(statement, params = []) {
    calls.push(statement);
    const [id, value] = params;
    if (statement.startsWith('SELECT pg_advisory')) return result([{ released: true }]);
    if (statement.includes('FROM doctors')) return result([{ id: plan.doctorId }]);
    if (statement.includes('FROM privy_stellar_wallet_bindings')) return result([plan.patient, plan.doctor].map(actor => (
      { user_id: actor.userId, wallet_id: actor.walletId, address: actor.address })));
    if (statement.includes('AS unresolved')) return result([{ unresolved: false }]);
    if (statement.startsWith('SELECT (EXISTS')) return result([{ present: false }]);
    if (statement.startsWith('SELECT 1 FROM hosted_capture_manifests')) return result([]);
    if (statement.startsWith('INSERT INTO hosted_capture_manifests')) {
      const [sha256, run_id, phase, bytes, predecessor_sha256, base_sha256, base_receipt_hash, expires_at] = params;
      scopes.set(id, { sha256, run_id, phase, bytes, predecessor_sha256, base_sha256, base_receipt_hash, expires_at });
      return result([]);
    }
    if (statement.startsWith('INSERT INTO hosted_capture_requests')) {
      requests.set(id, { sha256: value, phase: params[2] });
      return result([]);
    }
    if (statement.startsWith('SELECT 1 FROM hosted_capture_verifications')) return result(verifications.get(id) === value ? [{ present: true }] : []);
    if (statement.startsWith('INSERT INTO hosted_capture_verifications')) {
      verifications.set(id, value);
      return result([]);
    }
    if (statement.startsWith('INSERT INTO hosted_capture_activations')) {
      activations.push({ sha256: id, phase: value ?? 'shutdown' });
      return result([]);
    }
    if (statement.startsWith('SELECT sha256,phase FROM hosted_capture_activations')) return result(activations.slice(-1));
    if (statement.startsWith('SELECT sha256,phase FROM hosted_capture_requests')) return result(requests.has(id) ? [requests.get(id)] : []);
    if (statement.startsWith('SELECT phase FROM hosted_capture_manifests')) return result(scopes.has(id) ? [scopes.get(id)] : []);
    if (statement.startsWith('SELECT m.sha256')) {
      const item = scopes.get(id);
      if (!item) return result([]);
      return result([{ ...item, base_bytes: item.base_sha256 ? scopes.get(item.base_sha256).bytes : null,
        approved_at: activations.some(state => state.sha256 === id && state.phase === value) ? 10 : null }]);
    }
    throw new Error('Unexpected test query: ' + statement);
  } };
}

test('Pins hosted web, origin and operator connection independently', () => {
  const operator = assertHostedCaptureOperator(env);
  assert.equal(operator.origin, 'https://www.trustleaf.org');
  assert.equal(new URL(operator.directConnectionString).hostname, database.replace('-pooler.', '.'));
  const { TRUSTLEAF_HOSTED_CAPTURE_OPERATOR: _, ...shared } = env;
  const web = { ...shared, TRUSTLEAF_HOSTED_CAPTURE_ENABLED: 'true', VERCEL_ENV: 'production',
    TRUSTLEAF_CLINICAL_MIGRATION: 'false', TRUSTLEAF_CLINICAL_WEB_MIGRATION: 'false' };
  assert.equal(assertHostedCaptureWeb(web).connectionString, env.TRUSTLEAF_DATABASE_URL);
  const bad = [
    { VERCEL_ENV: 'preview' }, { TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'true' }, { NEXT_PUBLIC_STELLAR_NETWORK: 'mainnet' },
    { TRUSTLEAF_CLINICAL_MIGRATION: 'true' }, { TRUSTLEAF_HOSTED_CAPTURE_ENABLED: 'false' },
    { TRUSTLEAF_DATABASE_URL: env.TRUSTLEAF_DATABASE_URL + '&host=other' }, { TRUSTLEAF_DB_HOST: 'other' },
  ];
  for (const patch of bad) assert.throws(() => assertHostedCaptureWeb({ ...web, ...patch }), /hosted_capture_environment_rejected/);
});

test('Staged bytes are unapproved, active writes lock and historical recovery survives shutdown', async () => {
  const input = example();
  const client = store(input.plan);
  const staged = await stageHostedCapture(client, input);
  assert.equal(staged.approvalSha256, null);
  assert.equal(await readHostedCaptureByRequest(client, input.plan.requestId), null);
  assert.equal(await readHostedCaptureActive(client), null);
  await assert.rejects(recordHostedCaptureVerification(client, input.sha256), /hosted_capture_verification_rejected/);
  const active = await activateHostedCapture(client, input);
  assert.equal(active.approvalSha256, input.sha256);
  assert.deepEqual((await lockHostedCaptureMutation(client, 'create', input.sha256)).bytes, input.bytes);
  assert.ok(client.calls.includes('SELECT pg_advisory_xact_lock_shared(hashtext($1))'));
  await assert.rejects(lockHostedCaptureMutation(client, 'grant-note', input.sha256), /hosted_capture_not_active/);
  await closeHostedCapture(client, input.sha256);
  assert.equal(await readHostedCaptureActive(client), null);
  assert.equal((await lockHostedCaptureRecovery(client, input.plan.requestId, input.sha256)).active, false);
  await assert.rejects(activateHostedCapture(client, input), /hosted_capture_activation_rejected/);
});

test('Staging fails closed for another pair, wrong digest, legacy overlap and invalid phase order', async () => {
  const input = example();
  const client = store(input.plan);
  await assert.rejects(stageHostedCapture(client, { ...input, sha256: 'a'.repeat(64) }), /hosted_capture_stage_rejected/);
  await assert.rejects(stageHostedCapture(client, { ...input, phase: 'pdf' }), /hosted_capture_phase_order/);
  const legacy = { ...env, TRUSTLEAF_CLINICAL_PATIENT_DEMO_WALLETS: input.plan.patient.address };
  await assert.rejects(stageHostedCapture(client, { ...input, env: legacy }), /hosted_capture_legacy_overlap/);
  const changedBytes = Buffer.from(JSON.stringify({ ...input.plan, historyId: 'b'.repeat(64) }));
  await assert.rejects(stageHostedCapture(client, { ...input, bytes: changedBytes, sha256: sha(changedBytes) }), /hosted_capture_scope_rejected/);
  assert.equal(client.scopes.size, 0);
});

test('Expired phase remains readable but cannot authorize a mutation', async () => {
  const input = example();
  const client = store(input.plan);
  await stageHostedCapture(client, input);
  await activateHostedCapture(client, input);
  const oldNow = Date.now;
  Date.now = () => (input.plan.until + 1) * 1000;
  try {
    assert.equal((await readHostedCaptureActive(client)).sha256, input.sha256);
    await assert.rejects(lockHostedCaptureMutation(client, 'create', input.sha256), /hosted_capture_expired/);
    assert.equal((await readHostedCaptureByRequest(client, input.plan.requestId)).sha256, input.sha256);
  } finally {
    Date.now = oldNow;
  }
});

test('Tampered stored bytes and a missing hosted migration fail closed', async () => {
  const input = example();
  const client = store(input.plan);
  await stageHostedCapture(client, input);
  client.scopes.get(input.sha256).bytes = Buffer.from('{}');
  await assert.rejects(readHostedCaptureBySha(client, input.sha256), /hosted_capture_scope_rejected/);
  await assert.rejects(readHostedCaptureActive({ async query() { throw Object.assign(Error(), { code: '42P01' }); } }),
    /hosted_capture_schema_unavailable/);
});


test('PDF activation requires a durable verification of the exact staged digest and predecessor', async () => {
  const input = example();
  const client = store(input.plan);
  const grant = { ...input.plan, runId: randomUUID() };
  delete grant.phase;
  delete grant.requestId;
  Object.assign(grant, {
    contractId: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',
    registryId: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',
    doctorValidUntil: grant.until + 600,
    grantRequestId: randomUUID(), noteRequestId: randomUUID(), note: { title: 'Test', text: 'Synthetic note.', eventDate: null },
  });
  const grantBytes = Buffer.from(JSON.stringify(grant)), grantHash = sha(grantBytes);
  client.scopes.set(grantHash, { sha256: grantHash, run_id: input.plan.runId, phase: 'grant-note', bytes: grantBytes, expires_at: grant.until,
    predecessor_sha256: input.sha256, base_sha256: null, base_receipt_hash: null });
  client.activations.push({ sha256: grantHash, phase: 'grant-note' });

  const pdf = { ...grant, runId: randomUUID(), grantTransactionHash: 'a'.repeat(64), noteTransactionHash: 'b'.repeat(64), pdfRequestId: randomUUID(),
    pdf: { fileName: 'synthetic-clinical-demo.pdf', mediaType: 'application/pdf', byteLength: 964,
      sha256: 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c' } };
  const pdfBytes = Buffer.from(JSON.stringify(pdf)), pdfHash = sha(pdfBytes);
  client.scopes.set(pdfHash, { sha256: pdfHash, run_id: input.plan.runId, phase: 'pdf', bytes: pdfBytes, expires_at: pdf.until,
    predecessor_sha256: grantHash, base_sha256: grantHash, base_receipt_hash: null });
  await assert.rejects(activateHostedCapture(client, { phase: 'pdf', sha256: pdfHash, env }), /hosted_capture_verification_required/);
  await recordHostedCaptureVerification(client, pdfHash);
  assert.equal(client.verifications.get(pdfHash), grantHash);
  await closeHostedCapture(client, grantHash);
  await assert.rejects(activateHostedCapture(client, { phase: 'pdf', sha256: pdfHash, env }), /hosted_capture_phase_order/);
});
