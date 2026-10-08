import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { StrKey } from '@stellar/stellar-sdk';
import { syntheticClinicalPdf, syntheticClinicalImage } from './clinical-fixtures.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const PHASES = ['planned', 'preparing', 'prepared', 'signing', 'uncertain_signature', 'submitted', 'confirmed', 'audited', 'failed'];
const STATES = ['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled'];
const NAMES = ['create_history', 'append_pdf', 'append_note', 'append_image', 'correct_pdf', 'grant_read', 'grant_append', 'revoke'];
const ACTIONS = NAMES.map((_, index) => index === 0 ? 'create_history' : index < 5 ? 'append_version' : 'set_permissions');
const NOTE = Object.freeze({ title: 'Synthetic clinical note', text: 'Invented technical fixture for TrustLeaf Testnet. No real clinical or personal data.', eventDate: '2026-10-01' });
const clone = value => structuredClone(value);
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const check = (condition, code) => { if (!condition) fail(code); };
const hash = value => typeof value === 'string' && HEX.test(value);
const wallet = value => typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);

function fixture(index) {
  if (index === 2) return { note: { ...NOTE } };
  const image = index === 3, version = index === 4 ? 2 : 1;
  return { file: { fileName: image ? 'synthetic-clinical.png' : `synthetic-clinical-v${version}.pdf`,
    mediaType: image ? 'image/png' : 'application/pdf', base64: (image ? syntheticClinicalImage() : syntheticClinicalPdf(version)).toString('base64') } };
}
function payloadFor(state, index) {
  const step = state.steps[index], payload = { requestId: step.requestId, action: step.action };
  if (index > 0 && index < 5) Object.assign(payload, fixture(index));
  if (index === 4) {
    check(hash(state.steps[1].result?.entryId), 'clinical_rehearsal_state_invalid');
    Object.assign(payload, { entryId: state.steps[1].result.entryId, expectedVersion: 1 });
  }
  if (index >= 5) Object.assign(payload, { doctorId: state.doctor.id, canRead: index === 5, canAppend: index === 6, expectedRevision: index - 5 });
  return payload;
}
function publicChecks(value) {
  const output = {};
  const strings = new Set(['network', 'contractId', 'registryId', 'wasmHash', 'registryWasmHash', 'method', 'source', 'feeSource']);
  const numbers = new Set(['ledger', 'interfaceVersion', 'observedLedger']);
  const flags = new Set(['signatureVerified', 'sourceSignatureVerified', 'payerSignatureVerified', 'argumentsVerified', 'envelopeVerified',
    'returnVerified', 'operationVerified', 'deploymentVerified', 'networkVerified', 'sourceFunded', 'doctorAuthorized', 'wasmVerified', 'configurationVerified', 'interfaceVerified',
    'patientAccountExists', 'relayerBalanceChecked', 'chainProofVerified']);
  for (const [key, item] of Object.entries(value ?? {})) {
    if (flags.has(key) && typeof item === 'boolean') output[key] = item;
    else if (numbers.has(key) && Number.isSafeInteger(item) && item >= 0) output[key] = item;
    else if (strings.has(key) && typeof item === 'string' && /^[A-Za-z0-9_:-]{1,120}$/.test(item)) output[key] = item;
    else if (key === 'checks' && Array.isArray(item) && item.every(v => typeof v === 'string' && /^[a-z0-9_-]{1,80}$/.test(v))) output.checks = [...item];
  }
  return output;
}
function operation(value, step, previous) {
  const op = value?.operation ?? value;
  check(op && op.id === step.requestId && op.action === step.action && STATES.includes(op.state) && Number.isFinite(op.expiresAt) && op.expiresAt > 0 &&
    (op.transactionHash === null || hash(op.transactionHash)) && (!['submitted', 'confirmed'].includes(op.state) || hash(op.transactionHash)) &&
    (op.errorCode === null || typeof op.errorCode === 'string' && /^[a-z0-9_]{1,80}$/.test(op.errorCode)), 'clinical_rehearsal_operation_invalid');
  if (previous) check(op.expiresAt === previous.expiresAt && (!previous.transactionHash || op.transactionHash === previous.transactionHash) &&
    !(previous.state === 'submitted' && ['awaiting_signature', 'cancelled'].includes(op.state)) &&
    (!['confirmed', 'failed', 'cancelled'].includes(previous.state) || op.state === previous.state), 'clinical_rehearsal_operation_changed');
  return { id: op.id, action: op.action, state: op.state, expiresAt: op.expiresAt, transactionHash: op.transactionHash, errorCode: op.errorCode };
}
function resultFor(value, step, index, state) {
  check(value && hash(value.hash) && value.hash === step.operation.transactionHash && Number.isSafeInteger(value.ledger) && value.ledger > 0 &&
    hash(value.historyId), 'clinical_rehearsal_receipt_invalid');
  if (state.historyId) check(value.historyId === state.historyId, 'clinical_rehearsal_history_changed');
  if (value.operationId !== undefined) {
    check(hash(value.operationId) && !state.steps.some((s, i) => i !== index && s.result?.operationId === value.operationId), 'clinical_rehearsal_receipt_invalid');
  }
  check(Object.values(publicChecks(value)).every(item => typeof item !== 'boolean' || item === true), 'clinical_rehearsal_receipt_invalid');
  const result = { ...publicChecks(value), hash: value.hash, ledger: value.ledger, historyId: value.historyId, ...(value.operationId ? { operationId: value.operationId } : {}) };
  if (index > 0 && index < 5) {
    const version = index === 4 ? 2 : 1;
    check(hash(value.entryId) && value.version === version && hash(value.commitment), 'clinical_rehearsal_receipt_invalid');
    if (index === 4) check(value.entryId === state.steps[1].result.entryId, 'clinical_rehearsal_receipt_invalid');
    else check(!state.steps.some((s, i) => i !== index && i !== 4 && s.result?.entryId === value.entryId), 'clinical_rehearsal_receipt_invalid');
    Object.assign(result, { entryId: value.entryId, version, commitment: value.commitment });
  }
  if (step.result) for (const key of ['hash', 'ledger', 'historyId', 'entryId', 'version', 'commitment', 'operationId']) {
    check(result[key] === step.result[key], 'clinical_rehearsal_receipt_changed');
  }
  return result;
}
function validateState(state, runId, patient, doctor) {
  check(state && Object.keys(state).length === 6 && ['schemaVersion', 'runId', 'patient', 'doctor', 'historyId', 'steps'].every(key => Object.hasOwn(state, key)) && state.schemaVersion === 1 && state.runId === runId && state.patient === patient && isDeepStrictEqual(state.doctor, doctor) &&
    (state.historyId === null || hash(state.historyId)) && Array.isArray(state.steps) && state.steps.length === NAMES.length, 'clinical_rehearsal_state_invalid');
  check(new Set(state.steps.map(s => s?.requestId)).size === NAMES.length, 'clinical_rehearsal_state_invalid');
  let unfinished = false;
  state.steps.forEach((step, index) => {
    check(step && Object.keys(step).length === 7 && ['name', 'action', 'requestId', 'payload', 'phase', 'operation', 'result'].every(key => Object.hasOwn(step, key)) && step.name === NAMES[index] && step.action === ACTIONS[index] && UUID.test(step.requestId ?? '') && PHASES.includes(step.phase), 'clinical_rehearsal_state_invalid');
    check(!unfinished || step.phase === 'planned', 'clinical_rehearsal_state_invalid');
    if (step.phase !== 'audited') unfinished = true;
    if (step.payload !== null) check(isDeepStrictEqual(step.payload, payloadFor(state, index)), 'clinical_rehearsal_payload_changed');
    else check(step.phase === 'planned', 'clinical_rehearsal_state_invalid');
    if (step.operation !== null) step.operation = operation(step.operation, step);
    else check(['planned', 'preparing'].includes(step.phase), 'clinical_rehearsal_state_invalid');
    if (step.result !== null) {
      check(step.operation?.state === 'confirmed', 'clinical_rehearsal_state_invalid');
      step.result = resultFor(step.result, step, index, state);
    } else check(step.phase !== 'audited', 'clinical_rehearsal_state_invalid');
    if (['confirmed', 'audited'].includes(step.phase)) check(step.operation?.state === 'confirmed', 'clinical_rehearsal_state_invalid');
    if (step.phase === 'submitted') check(step.operation?.state === 'submitted', 'clinical_rehearsal_state_invalid');
    if (step.phase === 'failed') check(['failed', 'cancelled'].includes(step.operation?.state), 'clinical_rehearsal_state_invalid');
    if (step.phase === 'prepared') check(step.operation?.state === 'awaiting_signature', 'clinical_rehearsal_state_invalid');
  });
  if (state.historyId) check(state.steps[0].result?.historyId === state.historyId, 'clinical_rehearsal_state_invalid');
  return state;
}
function snapshotValue(value, state, { fresh = false } = {}) {
  check(value && Array.isArray(value.entries) && Array.isArray(value.grants) && Array.isArray(value.operations) &&
    typeof value.verifiedAt === 'string' && Number.isFinite(Date.parse(value.verifiedAt)), 'clinical_rehearsal_snapshot_invalid');
  if (value.history) {
    check(hash(value.history.id) && value.history.patient === state.patient, 'clinical_rehearsal_history_changed');
    if (fresh) fail('clinical_rehearsal_existing_history');
    if (state.historyId) check(value.history.id === state.historyId, 'clinical_rehearsal_history_changed');
    else check(state.steps[0].operation?.state === 'confirmed' || ['signing', 'uncertain_signature', 'submitted'].includes(state.steps[0].phase), 'clinical_rehearsal_existing_history');
  } else check(!state.historyId, 'clinical_rehearsal_history_changed');
  for (const op of value.operations) {
    if (['awaiting_signature', 'submitted'].includes(op?.state)) check(state.steps.some(step => step.requestId === op.id), 'clinical_rehearsal_source_busy');
  }
  return value;
}
function entryValue(snapshot, result, payload, patient) {
  const entries = snapshot.entries.filter(e => e.entryId === result.entryId && e.version === result.version);
  check(entries.length === 1, 'clinical_rehearsal_readback_invalid');
  const entry = entries[0], mediaType = payload.note ? 'application/json' : payload.file.mediaType;
  const fileName = payload.note ? 'antecedente.json' : payload.file.fileName;
  check(entry.author === patient && entry.source === 'patient' && entry.transactionHash === result.hash && entry.mediaType === mediaType &&
    entry.fileName === fileName && entry.title === (payload.note?.title ?? fileName) && isDeepStrictEqual(entry.note, payload.note ?? null), 'clinical_rehearsal_readback_invalid');
}
async function documentValue(api, result, payload) {
  const document = await api.document(result.entryId, result.version);
  if (payload.note) check(isDeepStrictEqual(document?.note, payload.note), 'clinical_rehearsal_readback_invalid');
  else check(document?.content instanceof Uint8Array && Buffer.from(document.content).equals(Buffer.from(payload.file.base64, 'base64')) &&
    document.mediaType === payload.file.mediaType, 'clinical_rehearsal_readback_invalid');
}
function permissionValue(snapshot, doctor, payload) {
  const grants = snapshot.grants.filter(g => g.doctorId === doctor.id);
  check(grants.length === 1 && grants[0].address === doctor.address && (!(payload.canRead || payload.canAppend) || grants[0].authorized === true) &&
    grants[0].canRead === payload.canRead && grants[0].canAppend === payload.canAppend &&
    grants[0].revision === payload.expectedRevision + 1, 'clinical_rehearsal_permissions_invalid');
}
function permissionTarget(snapshot, doctor, payload) {
  const grants = snapshot.grants.filter(g => g.doctorId === doctor.id);
  check(grants.length === 1 && grants[0].address === doctor.address && grants[0].revision === payload.expectedRevision &&
    (!(payload.canRead || payload.canAppend) || grants[0].authorized === true), 'clinical_rehearsal_permissions_invalid');
}
function allEntries(snapshot, state) {
  const versions = state.steps.filter(s => s.result?.entryId);
  check(snapshot.entries.length === versions.length && snapshot.entries.every(entry => versions.some(s =>
    s.result.entryId === entry.entryId && s.result.version === entry.version)), 'clinical_rehearsal_readback_invalid');
  for (const s of versions) {
    entryValue(snapshot, s.result, s.payload, state.patient);
    const entry = snapshot.entries.find(e => e.entryId === s.result.entryId && e.version === s.result.version);
    const head = Math.max(...versions.filter(v => v.result.entryId === entry.entryId).map(v => v.result.version));
    check(Number.isSafeInteger(entry.createdAt) && entry.createdAt >= 0 && entry.canCorrect === (entry.version === head), 'clinical_rehearsal_readback_invalid');
  }
}

/** Patient API rehearsal. The caller owns transport credentials and public RPC
 * auditing. This module never loads env files, signs XDR, submits RPC writes,
 * funds accounts, restores state or retries a saved on-chain submission.
 * Journal.save must atomically persist the private state before returning.
 * Real API evidence requires an explicit evidenceKind from the live caller. */
export async function rehearseClinicalWeb({ api, audit, journal, runId, patient, doctor, mode = 'inspect', allowWrites = false,
  evidenceKind = 'isolated_simulation', onProgress = () => {}, pollLimit = 12, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now() } = {}) {
  let state, preflight = {}, current, walletId;
  const checkedNow = new Set();
  const report = (status, error) => ({ status, evidenceKind, runId, publicChecks: publicChecks(preflight),
    steps: (state?.steps ?? []).map(s => ({ name: s.name, action: s.action, requestId: s.requestId,
      status: checkedNow.has(s.name) ? 'passed' : s.operation?.state === 'failed' || s.operation?.state === 'cancelled' ? 'failed' : 'pending',
      ...(s.operation?.transactionHash ? { transactionHash: s.operation.transactionHash } : {}),
      ...(s.result ? checkedNow.has(s.name) ? { ...s.result, receiptVerified: true, readbackVerified: true }
        : { historicalVerificationSaved: true, receiptVerified: false, readbackVerified: false } : {}) })), ...(error ? { error } : {}) });
  const save = () => journal.save(clone(state));
  async function identity() {
    const binding = await api.wallet();
    check(binding && binding.address === patient && binding.chain === 'stellar' && typeof binding.walletId === 'string' && binding.walletId.length > 0,
      'clinical_rehearsal_identity_changed');
    if (walletId) check(binding.walletId === walletId, 'clinical_rehearsal_identity_changed');
    else walletId = binding.walletId;
  }
  async function receive(step, value) {
    const audited = step.phase === 'audited';
    step.operation = operation(value, step, step.operation);
    if (step.operation.transactionHash) check(!state.steps.some(s => s !== step && s.operation?.transactionHash === step.operation.transactionHash), 'clinical_rehearsal_operation_changed');
    if (['failed', 'cancelled'].includes(step.operation.state)) { step.phase = 'failed'; await save(); fail('clinical_rehearsal_operation_failed'); }
    step.phase = step.operation.state === 'confirmed' ? audited ? 'audited' : 'confirmed' : step.operation.state === 'submitted' ? 'submitted' : step.phase;
    await save();
  }
  try {
    check(UUID.test(runId ?? '') && wallet(patient) && doctor && Number.isSafeInteger(doctor.id) && doctor.id > 0 && wallet(doctor.address) && doctor.address !== patient &&
      Object.keys(doctor).length === 2 && ['isolated_simulation', 'real_api_testnet_readback'].includes(evidenceKind) && ['inspect', 'execute'].includes(mode) && typeof allowWrites === 'boolean' &&
      Number.isSafeInteger(pollLimit) && pollLimit >= 1 && pollLimit <= 120 && typeof sleep === 'function' && typeof now === 'function' && typeof onProgress === 'function' &&
      ['wallet', 'snapshot', 'prepare', 'sign', 'inspect', 'document'].every(key => typeof api?.[key] === 'function') &&
      typeof audit?.preflight === 'function' && typeof audit.operation === 'function' && typeof journal?.load === 'function' && typeof journal.save === 'function', 'clinical_rehearsal_configuration_invalid');
    const saved = await journal.load(), fresh = saved === null || saved === undefined;
    state = fresh ? { schemaVersion: 1, runId, patient, doctor: clone(doctor), historyId: null,
      steps: NAMES.map((name, index) => ({ name, action: ACTIONS[index], requestId: randomUUID(), payload: null, phase: 'planned', operation: null, result: null })) }
      : validateState(clone(saved), runId, patient, doctor);
    await identity();
    let snapshot = snapshotValue(await api.snapshot(), state, { fresh });
    preflight = await audit.preflight({ patient, doctor: clone(doctor) });
    if (fresh) await save();
    for (let index = 0; index < state.steps.length; index++) {
      current = state.steps[index];
      await onProgress({ step: current.name, index: index + 1, phase: current.phase });
      if (current.phase === 'failed') fail('clinical_rehearsal_operation_failed');
      await identity();
      snapshot = snapshotValue(await api.snapshot(), state);
      if (current.phase === 'planned') {
        if (mode !== 'execute' || !allowWrites) return report('pending', 'clinical_rehearsal_writes_disabled');
        current.payload = payloadFor(state, index);
        if (index >= 5) permissionTarget(snapshot, doctor, current.payload);
        current.phase = 'preparing'; await save();
      }
      if (current.phase === 'preparing') {
        if (mode !== 'execute' || !allowWrites) {
          try { await receive(current, await api.inspect(current.requestId)); }
          catch (error) { if (error.code) throw error; return report('pending', 'clinical_rehearsal_prepare_uncertain'); }
          if (current.operation.state === 'awaiting_signature') return report('pending', 'clinical_rehearsal_writes_disabled');
        } else {
          let response;
          try { response = await api.prepare(clone(current.payload)); }
          catch { return report('pending', 'clinical_rehearsal_prepare_uncertain'); }
          await receive(current, response);
          if (current.operation.state === 'awaiting_signature') { current.phase = 'prepared'; await save(); }
        }
      }
      if (current.phase === 'prepared') {
        if (mode !== 'execute' || !allowWrites) return report('pending', 'clinical_rehearsal_writes_disabled');
        check(current.operation.expiresAt * 1000 > now(), 'clinical_rehearsal_signature_expired');
        if (index >= 5) permissionTarget(snapshot, doctor, current.payload);
        await identity(); current.phase = 'signing'; await save();
        let response;
        try { response = await api.sign(current.requestId); }
        catch { /* This saved signing boundary can only be recovered by GET. */ }
        if (response !== undefined) await receive(current, response);
      }
      if (['signing', 'uncertain_signature'].includes(current.phase)) {
        let response;
        try { response = await api.inspect(current.requestId); }
        catch { return report('pending', 'clinical_rehearsal_signature_uncertain'); }
        await receive(current, response);
        if (current.operation.state === 'awaiting_signature') {
          current.phase = 'uncertain_signature'; await save();
          return report('pending', 'clinical_rehearsal_signature_uncertain');
        }
      }
      if (current.phase === 'submitted') {
        for (let poll = 0; poll < pollLimit && current.phase === 'submitted'; poll++) {
          let response;
          try { response = await api.inspect(current.requestId); }
          catch { return report('pending', 'clinical_rehearsal_submission_uncertain'); }
          await receive(current, response);
          if (current.phase === 'submitted' && poll + 1 < pollLimit) await sleep(2500);
        }
        if (current.phase === 'submitted') return report('pending', 'clinical_rehearsal_confirmation_pending');
      } else if (current.phase === 'audited') {
        await receive(current, await api.inspect(current.requestId));
      }
      check(['confirmed', 'audited'].includes(current.phase), 'clinical_rehearsal_state_invalid');
      snapshot = snapshotValue(await api.snapshot(), state);
      const proof = await audit.operation(clone(current.operation), { action: current.action, patient, doctor: clone(doctor),
        step: current.name, payload: clone(current.payload), snapshot: clone(snapshot) });
      current.result = resultFor({ ...proof, historyId: proof?.historyId ?? snapshot.history?.id }, current, index, state);
      if (index === 0) { state.historyId = current.result.historyId; snapshot = snapshotValue(snapshot, state); }
      check(snapshot.history?.id === state.historyId && snapshot.history.patient === patient, 'clinical_rehearsal_history_changed');
      if (index > 0 && index < 5) {
        entryValue(snapshot, current.result, current.payload, patient);
        await documentValue(api, current.result, current.payload);
        if (index === 4) await documentValue(api, state.steps[1].result, state.steps[1].payload);
      }
      // Earlier grant receipts remain historical when a later grant has already
      // been audited; the final current permissions are checked below as well.
      if (index >= 5 && !state.steps.slice(index + 1).some(s => s.phase === 'audited')) permissionValue(snapshot, doctor, current.payload);
      current.phase = 'audited'; await save(); checkedNow.add(current.name);
      await onProgress({ step: current.name, index: index + 1, phase: current.phase });
    }
    await identity(); snapshot = snapshotValue(await api.snapshot(), state);
    allEntries(snapshot, state);
    permissionValue(snapshot, doctor, state.steps[7].payload);
    for (const step of state.steps.filter(s => s.result?.entryId)) await documentValue(api, step.result, step.payload);
    check(state.steps.every(step => step.phase === 'audited'), 'clinical_rehearsal_incomplete');
    return report('passed');
  } catch (error) {
    const code = typeof error?.code === 'string' && /^clinical_rehearsal_[a-z_]+$/.test(error.code) ? error.code : 'clinical_rehearsal_unavailable';
    return report('failed', code);
  }
}
