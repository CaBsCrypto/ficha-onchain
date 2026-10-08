import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { StrKey } from '@stellar/stellar-sdk';
import { rehearseClinicalWeb } from './clinical-web-rehearsal.mjs';
import { syntheticClinicalPdf, syntheticClinicalImage } from './clinical-fixtures.mjs';

const RUN = '01234567-89ab-4cde-8fab-0123456789ab';
const PATIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const DOCTOR = { id: 7, address: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4)) };
const OTHER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5));
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const NOTE = { title: 'Synthetic clinical note', text: 'Invented technical fixture for TrustLeaf Testnet. No real clinical or personal data.', eventDate: '2026-10-01' };

function harness() {
  const operations = new Map(), payloads = new Map(), proofs = new Map(), documents = new Map();
  const calls = { wallet: 0, snapshot: 0, prepare: [], sign: [], inspect: [], audit: [], documents: [], sleep: [], preflight: 0 };
  const faults = {};
  const store = { state: null, saves: [] };
  let history = null, entries = [], grants = [], ledger = 100;
  function snapshot() {
    const result = { history: clone(history), entries: clone(entries), grants: clone(grants),
      operations: [...operations.values()].map(clone), verifiedAt: '2026-10-08T12:00:00.000Z' };
    faults.snapshot?.(result);
    return result;
  }
  function apply(id) {
    const payload = payloads.get(id), hash = sha(`transaction:${id}`), opId = sha(`operation:${id}`);
    const proof = { hash, operationId: opId, ledger: ++ledger, historyId: '1'.repeat(64),
      signatureVerified: true, argumentsVerified: true, envelopeVerified: true, returnVerified: true,
      secretDiagnostic: 'must never enter evidence' };
    if (payload.action === 'create_history') history = { id: proof.historyId, patient: PATIENT, createdAt: 1000 };
    if (payload.action === 'append_version') {
      proof.entryId = payload.entryId ?? sha(`entry:${id}`); proof.version = (payload.expectedVersion ?? 0) + 1;
      proof.commitment = sha(`commitment:${id}`);
      entries = entries.map(e => e.entryId === proof.entryId ? { ...e, canCorrect: false } : e);
      const mediaType = payload.note ? 'application/json' : payload.file.mediaType;
      const fileName = payload.note ? 'antecedente.json' : payload.file.fileName;
      entries.push({ entryId: proof.entryId, version: proof.version, author: PATIENT, source: 'patient', createdAt: 1000 + ledger,
        title: payload.note?.title ?? fileName, mediaType, fileName, note: clone(payload.note ?? null), transactionHash: hash, canCorrect: true });
      documents.set(`${proof.entryId}:${proof.version}`, payload.note ? { note: clone(payload.note) }
        : { content: Buffer.from(payload.file.base64, 'base64'), mediaType });
    }
    if (payload.action === 'set_permissions') grants = [{ doctorId: DOCTOR.id, doctorName: 'Synthetic doctor', address: DOCTOR.address, authorized: true,
      canRead: payload.canRead, canAppend: payload.canAppend, revision: payload.expectedRevision + 1 }];
    proofs.set(id, proof);
    operations.set(id, { ...operations.get(id), state: faults.failedSign ? 'failed' : faults.pending ? 'submitted' : 'confirmed', transactionHash: hash });
  }
  const journal = {
    async load() { return clone(store.state); },
    async save(state) {
      if (faults.save?.(state)) throw new Error('secret provider detail');
      store.state = clone(state); store.saves.push(clone(state));
    },
  };
  const api = {
    async wallet() {
      calls.wallet++;
      return { address: faults.identityAt && calls.wallet >= faults.identityAt ? OTHER : PATIENT,
        walletId: faults.walletIdAt && calls.wallet >= faults.walletIdAt ? 'other-wallet' : 'synthetic-wallet', chain: 'stellar' };
    },
    async snapshot() { calls.snapshot++; return snapshot(); },
    async prepare(payload) {
      calls.prepare.push(clone(payload));
      assert.equal(store.state.steps.find(s => s.requestId === payload.requestId)?.phase, 'preparing');
      assert.deepEqual(store.state.steps.find(s => s.requestId === payload.requestId)?.payload, payload);
      if (payloads.has(payload.requestId)) assert.deepEqual(payloads.get(payload.requestId), payload);
      else {
        payloads.set(payload.requestId, clone(payload));
        operations.set(payload.requestId, { id: payload.requestId, action: payload.action, state: 'awaiting_signature',
          expiresAt: 2_000_000_000, transactionHash: null, errorCode: null });
      }
      if (faults.lostPrepare) { faults.lostPrepare = false; throw new Error('secret token'); }
      const result = clone(operations.get(payload.requestId));
      faults.prepare?.(result);
      return { operation: result };
    },
    async sign(id) {
      calls.sign.push(id);
      assert.equal(store.state.steps.find(s => s.requestId === id)?.phase, 'signing');
      if (faults.lostSignBefore) throw new Error('secret signing payload');
      if (faults.failedSign) operations.set(id, { ...operations.get(id), state: 'failed', transactionHash: sha('transaction:' + id) });
      else apply(id);
      if (faults.lostSignAfter) { faults.lostSignAfter = false; throw new Error('secret signing payload'); }
      return { operation: clone(operations.get(id)) };
    },
    async inspect(id) {
      calls.inspect.push(id);
      if (faults.inspectError) throw new Error('secret provider detail');
      const result = clone(operations.get(id));
      if (!result) throw new Error('missing operation');
      faults.inspect?.(result);
      return { operation: result };
    },
    async document(entryId, version) {
      calls.documents.push({ entryId, version });
      const document = clone(documents.get(`${entryId}:${version}`));
      faults.document?.(document, entryId, version);
      return document;
    },
  };
  const audit = {
    async preflight(input) {
      calls.preflight++; assert.deepEqual(input, { patient: PATIENT, doctor: DOCTOR });
      if (faults.preflight) throw new Error('secret RPC detail');
      return { sourceFunded: true, doctorAuthorized: true, deploymentVerified: true, network: 'testnet', secret: 'hidden' };
    },
    async operation(op, expected) {
      calls.audit.push(expected.step);
      assert.deepEqual(expected.payload, payloads.get(op.id));
      assert.equal(expected.patient, PATIENT); assert.deepEqual(expected.doctor, DOCTOR);
      assert.equal(expected.action, op.action); assert.equal(op.state, 'confirmed');
      assert.equal(expected.snapshot.history?.patient, PATIENT);
      if (faults.auditAt === expected.step) throw new Error('secret receipt envelope');
      const proof = clone(proofs.get(op.id));
      faults.proof?.(proof, expected);
      return proof;
    },
  };
  const args = { api, audit, journal, runId: RUN, patient: PATIENT, doctor: DOCTOR, mode: 'execute', allowWrites: true,
    pollLimit: 2, now: () => 1_790_000_000_000, sleep: async ms => { calls.sleep.push(ms); } };
  return { args, api, audit, journal, store, calls, faults, operations, proofs, documents, payloads,
    setHistory: value => { history = value; }, finishPending: () => { faults.pending = false; for (const op of operations.values()) if (op.state === 'submitted') op.state = 'confirmed'; } };
}

const run = h => rehearseClinicalWeb(h.args);

test('eight isolated steps require exact receipts, files, versions and independent grant readback', async () => {
  const h = harness(), progress = []; h.args.onProgress = event => progress.push(event);
  const result = await run(h);
  assert.equal(result.status, 'passed'); assert.equal(result.evidenceKind, 'isolated_simulation');
  assert.equal(progress.length, 16);
  assert.deepEqual(progress[0], { step: 'create_history', index: 1, phase: 'planned' });
  assert.deepEqual(progress[15], { step: 'revoke', index: 8, phase: 'audited' });
  assert.ok(progress.every(event => Object.keys(event).sort().join(',') === 'index,phase,step'));
  assert.equal(result.steps.length, 8); assert.ok(result.steps.every(s => s.status === 'passed' && s.receiptVerified && s.readbackVerified));
  assert.equal(h.calls.sign.length, 8); assert.equal(h.calls.prepare.length, 8); assert.equal(h.calls.audit.length, 8);
  assert.deepEqual(h.calls.prepare[1].file.base64, syntheticClinicalPdf(1).toString('base64'));
  assert.deepEqual(h.calls.prepare[2].note, NOTE);
  assert.deepEqual(h.calls.prepare[3].file.base64, syntheticClinicalImage().toString('base64'));
  assert.deepEqual(h.calls.prepare[4].file.base64, syntheticClinicalPdf(2).toString('base64'));
  assert.equal(h.calls.prepare[4].entryId, result.steps[1].entryId); assert.equal(h.calls.prepare[4].expectedVersion, 1);
  assert.deepEqual(h.calls.prepare.slice(5).map(p => [p.canRead, p.canAppend, p.expectedRevision]), [[true, false, 0], [false, true, 1], [false, false, 2]]);
  assert.equal(new Set(h.calls.prepare.map(p => p.requestId)).size, 8);
  const pdf = result.steps[1]; assert.ok(h.calls.documents.filter(d => d.entryId === pdf.entryId && d.version === 1).length >= 3);
  const wire = JSON.stringify(result);
  for (const hidden of ['secret', 'base64', 'Invented technical', 'synthetic-wallet', 'synthetic-clinical']) assert.equal(wire.includes(hidden), false);
  assert.equal(JSON.stringify(h.store.state).includes('synthetic-wallet'), false);
});

test('default inspect mode has no prepare or sign calls and cannot claim a partial pass', async () => {
  const h = harness(); delete h.args.mode; delete h.args.allowWrites;
  const result = await run(h);
  assert.equal(result.status, 'pending'); assert.equal(result.error, 'clinical_rehearsal_writes_disabled');
  assert.equal(h.calls.prepare.length, 0); assert.equal(h.calls.sign.length, 0);
});

test('execute requires allowWrites=true; invalid modes and evidence kinds fail closed', async () => {
  for (const override of [{ allowWrites: false }, { mode: 'inspect', allowWrites: true }]) {
    const h = harness(); Object.assign(h.args, override); assert.equal((await run(h)).status, 'pending');
    assert.equal(h.calls.prepare.length, 0); assert.equal(h.calls.sign.length, 0);
  }
  for (const override of [{ mode: 'run' }, { onProgress: false }, { evidenceKind: 'mock_testnet' }, { allowWrites: 1 }, { pollLimit: 0 }, { pollLimit: 121 },
    { runId: '../other' }, { patient: 'bad-wallet' }, { doctor: { ...DOCTOR, id: 0 } }, { doctor: { ...DOCTOR, address: PATIENT } }]) {
    const h = harness(); Object.assign(h.args, override); assert.equal((await run(h)).error, 'clinical_rehearsal_configuration_invalid');
    assert.equal(h.calls.wallet, 0); assert.equal(h.calls.prepare.length, 0);
  }
});

test('only a live caller explicitly selects real API evidence', async () => {
  const h = harness(); h.args.evidenceKind = 'real_api_testnet_readback';
  assert.equal((await run(h)).evidenceKind, 'real_api_testnet_readback');
});

test('fresh journal never adopts an existing or foreign history', async () => {
  for (const patient of [PATIENT, OTHER]) {
    const h = harness(); h.setHistory({ id: '1'.repeat(64), patient, createdAt: 1 });
    assert.equal((await run(h)).status, 'failed'); assert.equal(h.calls.prepare.length, 0); assert.equal(h.calls.sign.length, 0);
  }
});

test('lost prepare reply persists and replays exactly the same UUID and payload', async () => {
  const h = harness(); h.faults.lostPrepare = true;
  assert.equal((await run(h)).error, 'clinical_rehearsal_prepare_uncertain');
  const saved = clone(h.calls.prepare[0]); assert.equal(h.store.state.steps[0].phase, 'preparing');
  const resumed = await run(h); assert.equal(resumed.status, 'passed');
  assert.deepEqual(h.calls.prepare[1], saved); assert.equal(h.calls.sign.length, 8);
});

test('inspect can find an uncertain prepared attempt but sends no POST', async () => {
  const h = harness(); h.faults.lostPrepare = true; await run(h);
  h.args.mode = 'inspect'; const result = await run(h);
  assert.equal(result.status, 'pending'); assert.equal(h.calls.prepare.length, 1); assert.equal(h.calls.sign.length, 0);
  assert.deepEqual(h.calls.inspect, [h.store.state.steps[0].requestId]);
});

test('lost signature reply that still awaits signature is permanently GET-only', async () => {
  const h = harness(); h.faults.lostSignBefore = true;
  assert.equal((await run(h)).error, 'clinical_rehearsal_signature_uncertain');
  assert.equal(h.store.state.steps[0].phase, 'uncertain_signature');
  h.faults.lostSignBefore = false;
  assert.equal((await run(h)).error, 'clinical_rehearsal_signature_uncertain');
  assert.equal(h.calls.sign.length, 1); assert.equal(h.calls.prepare.length, 1); assert.equal(h.calls.inspect.length, 2);
});

test('lost signature reply with a confirmed receipt recovers through GET', async () => {
  const h = harness(); h.faults.lostSignAfter = true;
  assert.equal((await run(h)).status, 'passed'); assert.equal(h.calls.sign.length, 8); assert.equal(h.calls.prepare.length, 8);
  assert.ok(h.calls.inspect.includes(h.calls.sign[0]));
});

test('a saved signing boundary survives inspect failure and never signs twice', async () => {
  const h = harness(); h.faults.lostSignAfter = true; h.faults.inspectError = true;
  assert.equal((await run(h)).status, 'pending'); assert.equal(h.store.state.steps[0].phase, 'signing');
  h.faults.inspectError = false; assert.equal((await run(h)).status, 'passed'); assert.equal(h.calls.sign.length, 8);
});

test('submitted polling is bounded and resume uses only the same operation', async () => {
  const h = harness(); h.faults.pending = true;
  assert.equal((await run(h)).error, 'clinical_rehearsal_confirmation_pending');
  assert.equal(h.calls.inspect.length, 2); assert.equal(h.calls.sleep.length, 1);
  const hash = h.store.state.steps[0].operation.transactionHash;
  assert.equal((await run(h)).status, 'pending'); assert.equal(h.calls.inspect.length, 4);
  assert.equal(h.calls.sign.length, 1); assert.equal(h.calls.prepare.length, 1);
  assert.equal(h.store.state.steps[0].operation.transactionHash, hash);
  h.finishPending(); assert.equal((await run(h)).status, 'passed'); assert.equal(h.calls.sign.length, 8);
});

test('expired submitted attempts remain pending instead of preparing replacements', async () => {
  const h = harness(); h.faults.pending = true; await run(h); h.args.now = () => 3_000_000_000_000;
  assert.equal((await run(h)).status, 'pending'); assert.equal(h.calls.sign.length, 1); assert.equal(h.calls.prepare.length, 1);
});

test('operation identity, action, expiry, hash and state transitions are immutable', async () => {
  for (const change of [op => { op.id = RUN; }, op => { op.action = 'set_permissions'; }, op => { op.expiresAt++; },
    op => { op.transactionHash = 'f'.repeat(64); }, op => { op.state = 'awaiting_signature'; op.transactionHash = null; }]) {
    const h = harness(); h.faults.pending = true; await run(h); h.faults.inspect = change;
    assert.equal((await run(h)).status, 'failed'); assert.equal(h.calls.sign.length, 1); assert.equal(h.calls.prepare.length, 1);
  }
});

test('wrong prepare response cannot reach signing', async () => {
  const h = harness(); h.faults.prepare = op => { op.action = 'append_version'; };
  assert.equal((await run(h)).error, 'clinical_rehearsal_operation_invalid'); assert.equal(h.calls.sign.length, 0);
});

test('tampered journal payload, run, doctor, step order or request IDs fail before API access', async () => {
  const changes = [s => { s.steps[0].payload.extra = 'changed'; }, s => { s.runId = 'fedcba98-7654-4321-bfed-cba987654321'; },
    s => { s.patient = OTHER; }, s => { s.doctor.address = OTHER; }, s => { s.steps.reverse(); },
    s => { s.steps[1].requestId = s.steps[0].requestId; }, s => { s.steps[2].phase = 'preparing'; }];
  for (const change of changes) {
    const h = harness(); h.faults.lostPrepare = true; await run(h); change(h.store.state); const walletCount = h.calls.wallet;
    assert.equal((await run(h)).status, 'failed'); assert.equal(h.calls.wallet, walletCount); assert.equal(h.calls.prepare.length, 1);
  }
});

test('wallet address and wallet ID are rechecked before steps and signing', async () => {
  for (const key of ['identityAt', 'walletIdAt']) {
    const h = harness(); h.faults[key] = 3;
    assert.equal((await run(h)).error, 'clinical_rehearsal_identity_changed'); assert.equal(h.calls.sign.length, 0);
  }
  const h = harness(); h.faults.identityAt = 4;
  assert.equal((await run(h)).error, 'clinical_rehearsal_identity_changed'); assert.equal(h.calls.sign.length, 1);
});

test('failed and cancelled attempts are terminal and cannot be resumed with a replacement', async () => {
  const h = harness(); h.faults.failedSign = true;
  assert.equal((await run(h)).error, 'clinical_rehearsal_operation_failed');
  assert.equal((await run(h)).error, 'clinical_rehearsal_operation_failed'); assert.equal(h.calls.sign.length, 1);
  const cancelled = harness(); cancelled.faults.prepare = op => { op.state = 'cancelled'; };
  assert.equal((await run(cancelled)).status, 'failed'); assert.equal(cancelled.calls.sign.length, 0);
});

test('journal failure before signing cannot reach the signer', async () => {
  const h = harness(); h.faults.save = state => state.steps[0].phase === 'signing';
  const result = await run(h); assert.equal(result.status, 'failed'); assert.equal(h.calls.sign.length, 0);
  assert.equal(result.error, 'clinical_rehearsal_unavailable'); assert.equal(JSON.stringify(result).includes('secret provider'), false);
});

test('missing or mismatched receipt evidence cannot pass, even after successful API confirmation', async () => {
  for (const change of [proof => { proof.hash = 'e'.repeat(64); }, proof => { proof.ledger = 0; }, proof => { proof.signatureVerified = false; }, proof => { proof.historyId = '2'.repeat(64); }]) {
    const h = harness(); h.faults.proof = change;
    assert.equal((await run(h)).status, 'failed'); assert.equal(h.calls.sign.length, 1);
  }
  const h = harness(); h.faults.auditAt = 'append_note';
  const result = await run(h); assert.equal(result.status, 'failed'); assert.equal(result.steps.filter(s => s.status === 'passed').length, 2);
});

test('operation IDs cannot be reused across successful receipts', async () => {
  const h = harness(); h.faults.proof = proof => { proof.operationId = 'a'.repeat(64); };
  assert.equal((await run(h)).error, 'clinical_rehearsal_receipt_invalid'); assert.equal(h.calls.sign.length, 2);
});

test('authenticated files and note must retain exact synthetic content', async () => {
  for (const change of [doc => { if (doc?.content) doc.content[0] ^= 1; }, doc => { if (doc?.content) doc.mediaType = 'image/jpeg'; },
    doc => { if (doc?.note) doc.note.text = 'changed'; }]) {
    const h = harness(); h.faults.document = change;
    assert.equal((await run(h)).error, 'clinical_rehearsal_readback_invalid');
  }
});

test('snapshot metadata, authorship and correction history must match readback', async () => {
  for (const change of [s => { if (s.entries.length) s.entries[0].fileName = 'wrong.pdf'; },
    s => { if (s.entries.length) s.entries[0].author = OTHER; },
    s => { if (s.entries.some(e => e.version === 2)) s.entries = s.entries.filter(e => e.version !== 1); },
    s => { if (s.entries.length) s.entries.push(clone(s.entries[0])); }]) {
    const h = harness(); h.faults.snapshot = change;
    assert.equal((await run(h)).status, 'failed');
  }
});

test('read-only, append-only and withdrawn grants are checked independently', async () => {
  for (const revision of [1, 2, 3]) {
    const h = harness(); h.faults.snapshot = snapshot => {
      if (snapshot.grants[0]?.revision === revision) snapshot.grants[0].canRead = !snapshot.grants[0].canRead;
    };
    assert.equal((await run(h)).error, 'clinical_rehearsal_permissions_invalid');
  }
});

test('preflight errors and a foreign pending operation stop before signing', async () => {
  const h = harness(); h.faults.preflight = true;
  assert.equal((await run(h)).status, 'failed'); assert.equal(h.calls.prepare.length, 0);
  const busy = harness(); busy.faults.snapshot = s => { s.operations.push({ id: RUN, state: 'submitted' }); };
  assert.equal((await run(busy)).error, 'clinical_rehearsal_source_busy'); assert.equal(busy.calls.prepare.length, 0);
});

test('completed journal inspection reaudits all receipts and content without prepare/sign', async () => {
  const h = harness(); assert.equal((await run(h)).status, 'passed'); h.args.mode = 'inspect';
  const result = await run(h); assert.equal(result.status, 'passed');
  assert.equal(h.calls.prepare.length, 8); assert.equal(h.calls.sign.length, 8); assert.equal(h.calls.audit.length, 16); assert.equal(h.calls.inspect.length, 8);
});

test('completed inspection rejects changed receipt facts and final permissions', async () => {
  const h = harness(); await run(h); h.args.mode = 'inspect'; h.faults.proof = proof => { proof.ledger++; };
  assert.equal((await run(h)).error, 'clinical_rehearsal_receipt_changed');
  const permissions = harness(); await run(permissions); permissions.args.mode = 'inspect';
  permissions.faults.snapshot = s => { if (s.grants.length) s.grants[0].canAppend = true; };
  assert.equal((await run(permissions)).status, 'failed'); assert.equal(permissions.calls.sign.length, 8);
});

test('failed completed-journal reinspection preserves resumable audited phases', async () => {
  const h = harness(); await run(h); h.args.mode = 'inspect'; h.faults.auditAt = 'append_note';
  assert.equal((await run(h)).status, 'failed'); assert.ok(h.store.state.steps.every(s => s.phase === 'audited'));
  h.faults.auditAt = undefined; assert.equal((await run(h)).status, 'passed'); assert.equal(h.calls.sign.length, 8);
});

test('duplicate transaction hashes and wrong current head flags fail readback', async () => {
  const h = harness(); h.faults.prepare = op => {
    if (h.calls.prepare.length === 2) { op.state = 'confirmed'; op.transactionHash = h.store.state.steps[0].operation.transactionHash; }
  };
  assert.equal((await run(h)).error, 'clinical_rehearsal_operation_changed');
  const head = harness(); head.faults.snapshot = s => { for (const entry of s.entries) entry.canCorrect = false; };
  assert.equal((await run(head)).status, 'failed');
});

test('optional receipt history selector uses the authenticated snapshot and remains immutable', async () => {
  const h = harness(); h.faults.proof = proof => { delete proof.historyId; };
  assert.equal((await run(h)).status, 'passed'); h.args.mode = 'inspect'; assert.equal((await run(h)).status, 'passed');
});

test('journal cannot retain credentials, wallet IDs or snapshots in extension fields', async () => {
  for (const change of [s => { s.walletId = 'provider-wallet'; }, s => { s.snapshot = {}; }, s => { s.steps[0].credential = 'secret'; }]) {
    const h = harness(); h.faults.lostPrepare = true; await run(h); change(h.store.state);
    const result = await run(h); assert.equal(result.error, 'clinical_rehearsal_state_invalid'); assert.equal(h.calls.prepare.length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
