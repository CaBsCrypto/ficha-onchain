import { StrKey } from '@stellar/stellar-sdk';
import { validateClinicalEnvelope } from '../../../scripts/lib/clinical-crypto.mjs';
import type { ClinicalAction, ClinicalExpected, ClinicalOperationState } from '@/types/clinical';

/** Server-only persistence. Authentication and live Stellar verification belong to the caller. */
export interface ClinicalSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface ClinicalStoreScope { contractId: string; network: 'testnet' }
export interface ClinicalHistoryRow {
  historyId: string; ownerUserId: string; walletId: string; patientWallet: string;
  contractId: string; network: 'testnet'; transactionHash: string; createdAt: string;
}
export type ClinicalHistoryInsert = Omit<ClinicalHistoryRow, 'createdAt'>;
export interface ClinicalPreparedEnvelope { schemaVersion: 1; keyId: string; wrappedKey: string; payload: string }
export interface ClinicalOperationRow {
  id: string; actorUserId: string; walletId: string; sourceWallet: string; action: ClinicalAction;
  contractId: string; network: 'testnet'; method: ClinicalAction; expected: ClinicalExpected;
  requestFingerprint: string; preparedEnvelope: ClinicalPreparedEnvelope | null; state: ClinicalOperationState; unsignedXdr: string; signingHash: string; expiresAt: number;
  signedXdr: string | null; transactionHash: string | null; errorCode: string | null;
  createdAt: string; updatedAt: string; confirmedAt: string | null;
}
export type ClinicalOperationInsert = Omit<ClinicalOperationRow, 'preparedEnvelope' | 'createdAt' | 'updatedAt' | 'confirmedAt' | 'signedXdr' | 'transactionHash' | 'errorCode'> & { preparedEnvelope?: ClinicalPreparedEnvelope | null };
export interface ClinicalOperationPatch {
  actorUserId: string; state?: ClinicalOperationState; signedXdr?: string | null;
  transactionHash?: string | null; errorCode?: string | null;
}
export interface ClinicalStoredContext {
  schemaVersion: 1; network: 'testnet'; contractId: string; historyId: string; entryId: string;
  author: string; patient: string; version: number; previousCommitment: string | null;
}
export interface ClinicalStoredVersion {
  context: ClinicalStoredContext; commitment: string; operationId: string;
  state: 'confirmed'; transactionHash: string;
}
const HEX = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const WALLET = /^G[A-Z2-7]{55}$/;
const CONTRACT = /^C[A-Z2-7]{55}$/;
const USER = /^did:privy:[A-Za-z0-9_-]{1,128}$/;
const ACTIONS: ClinicalAction[] = ['create_history', 'append_version', 'set_permissions'];
const STATES: ClinicalOperationState[] = ['awaiting_signature', 'submitted', 'confirmed', 'failed', 'cancelled'];
const TERMINAL: ClinicalOperationState[] = ['confirmed', 'failed', 'cancelled'];
const EXPECTED_KEYS = ['historyId', 'patient', 'operationId', 'entryId', 'author', 'commitment', 'previousCommitment', 'expectedVersion', 'expectedGrantRevision', 'doctor', 'canRead', 'canAppend', 'expectedRevision'];
const CONTEXT_KEYS = ['schemaVersion', 'network', 'contractId', 'historyId', 'entryId', 'author', 'patient', 'version', 'previousCommitment'];
function invalid(): never { throw Error('clinical_storage_invalid'); }
function check(value: unknown, regex: RegExp): asserts value is string {
  if (typeof value !== 'string' || !regex.test(value) || (regex === WALLET && !StrKey.isValidEd25519PublicKey(value)) || (regex === CONTRACT && !StrKey.isValidContract(value))) invalid();
}
function opaque(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) invalid(); }
function uint(value: unknown, allowZero = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 4_294_967_295) invalid();
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function parsed(value: unknown): Record<string, unknown> {
  try { return object(typeof value === 'string' ? JSON.parse(value) : value); } catch { return invalid(); }
}
function iso(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== 'string') invalid();
  const date = new Date(value); if (!Number.isFinite(date.getTime())) invalid(); return date.toISOString();
}
function xdr(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) invalid();
}
function errorCode(value: unknown): asserts value is string | null { if (value !== null) check(value, /^[a-z][a-z0-9_]{0,95}$/); }
function assertScope(scope: ClinicalStoreScope) { if (scope.network !== 'testnet') invalid(); check(scope.contractId, CONTRACT); }
function expected(value: unknown, action: ClinicalAction, source: string): ClinicalExpected {
  const e = parsed(value);
  if (Object.keys(e).some(key => !EXPECTED_KEYS.includes(key))) invalid();
  check(e.historyId, HEX); check(e.patient, WALLET); check(e.operationId, HEX);
  for (const key of ['entryId', 'commitment', 'previousCommitment']) {
    if (key in e && !(key === 'previousCommitment' && e[key] === null)) check(e[key], HEX);
  }
  for (const key of ['author', 'doctor']) if (key in e) check(e[key], WALLET);
  for (const key of ['expectedVersion', 'expectedGrantRevision', 'expectedRevision']) if (key in e) uint(e[key], true);
  for (const key of ['canRead', 'canAppend']) if (key in e && typeof e[key] !== 'boolean') invalid();
  const permitted = action === 'append_version'
    ? ['historyId', 'patient', 'operationId', 'entryId', 'author', 'commitment', 'previousCommitment', 'expectedVersion', 'expectedGrantRevision']
    : action === 'set_permissions'
      ? ['historyId', 'patient', 'operationId', 'doctor', 'canRead', 'canAppend', 'expectedRevision']
      : ['historyId', 'patient', 'operationId'];
  if (Object.keys(e).some(key => !permitted.includes(key))) invalid();
  if (action === 'append_version') {
    if (!['entryId', 'author', 'commitment', 'previousCommitment', 'expectedVersion'].every(key => key in e) || e.author !== source) invalid();
    if (e.expectedVersion === 4_294_967_295 || (e.expectedVersion === 0 && e.previousCommitment !== null)) invalid();
    if (Number(e.expectedVersion) > 0 && e.previousCommitment === null) invalid();
  } else {
    if (e.patient !== source) invalid();
    if (action === 'set_permissions' && !['doctor', 'canRead', 'canAppend', 'expectedRevision'].every(key => key in e)) invalid();
  }
  return { ...e } as unknown as ClinicalExpected;
}
function encryptedEnvelope(value: unknown, action: ClinicalAction): ClinicalPreparedEnvelope | null {
  if (value === null || value === undefined) { if (action === 'append_version') invalid(); return null; }
  if (action !== 'append_version') invalid();
  const e = parsed(value);
  try { validateClinicalEnvelope(e); } catch { return invalid(); }
  if (Buffer.byteLength(JSON.stringify(e)) > 6_000_000) invalid();
  return { ...e } as unknown as ClinicalPreparedEnvelope;
}
function sameEnvelope(a: ClinicalPreparedEnvelope | null, b: ClinicalPreparedEnvelope | null) {
  return a === null || b === null ? a === b : ['schemaVersion', 'keyId', 'wrappedKey', 'payload'].every(key => a[key as keyof ClinicalPreparedEnvelope] === b[key as keyof ClinicalPreparedEnvelope]);
}
function sameExpected(a: ClinicalExpected, b: ClinicalExpected) {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key as keyof ClinicalExpected] === b[key as keyof ClinicalExpected]);
}
function history(row: Record<string, unknown>, scope: ClinicalStoreScope, actorId: string): ClinicalHistoryRow {
  check(row.history_id, HEX); check(row.owner_user_id, USER); opaque(row.wallet_id); check(row.patient_wallet, WALLET);
  check(row.transaction_hash, HEX);
  if (row.owner_user_id !== actorId || row.contract_id !== scope.contractId || row.network !== scope.network) invalid();
  return { historyId: row.history_id, ownerUserId: row.owner_user_id, walletId: row.wallet_id, patientWallet: row.patient_wallet,
    contractId: scope.contractId, network: scope.network, transactionHash: row.transaction_hash, createdAt: iso(row.created_at) };
}
function operation(row: Record<string, unknown>, scope: ClinicalStoreScope, actorId: string): ClinicalOperationRow {
  check(row.id, UUID); check(row.actor_user_id, USER); opaque(row.wallet_id); check(row.source_wallet, WALLET);
  if (row.actor_user_id !== actorId || row.contract_id !== scope.contractId || row.network !== scope.network ||
      !ACTIONS.includes(row.action as ClinicalAction) || row.method !== row.action || !STATES.includes(row.state as ClinicalOperationState)) invalid();
  const action = row.action as ClinicalAction, state = row.state as ClinicalOperationState;
  xdr(row.unsigned_xdr); check(row.signing_hash, HEX); check(row.request_fingerprint, FINGERPRINT);
  const expiresAt = Number(row.expires_at); if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) invalid();
  if (row.signed_xdr !== null) xdr(row.signed_xdr);
  if (row.transaction_hash !== null) check(row.transaction_hash, HEX);
  if ((row.signed_xdr === null) !== (row.transaction_hash === null)) invalid();
  if (['awaiting_signature', 'cancelled'].includes(state) && row.signed_xdr !== null) invalid();
  if (['submitted', 'confirmed'].includes(state) && row.signed_xdr === null) invalid();
  if ((state === 'confirmed') !== (row.confirmed_at !== null)) invalid();
  errorCode(row.error_code);
  return { id: row.id, actorUserId: row.actor_user_id, walletId: row.wallet_id, sourceWallet: row.source_wallet,
    action, method: action, requestFingerprint: row.request_fingerprint, preparedEnvelope: encryptedEnvelope(row.prepared_envelope, action), contractId: scope.contractId, network: scope.network, expected: expected(row.expected, action, row.source_wallet), state,
    unsignedXdr: row.unsigned_xdr, signingHash: row.signing_hash, expiresAt, signedXdr: row.signed_xdr as string | null,
    transactionHash: row.transaction_hash as string | null, errorCode: row.error_code as string | null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), confirmedAt: row.confirmed_at === null ? null : iso(row.confirmed_at) };
}
function storedVersion(row: Record<string, unknown>, scope: ClinicalStoreScope, h: ClinicalHistoryRow): ClinicalStoredVersion {
  const c = parsed(row.context);
  if (Object.keys(c).length !== CONTEXT_KEYS.length || Object.keys(c).some(key => !CONTEXT_KEYS.includes(key)) ||
      c.schemaVersion !== 1 || c.network !== scope.network || c.contractId !== scope.contractId || c.historyId !== h.historyId || c.patient !== h.patientWallet) invalid();
  check(c.entryId, HEX); check(c.author, WALLET); uint(c.version); if (c.previousCommitment !== null) check(c.previousCommitment, HEX);
  if ((c.version === 1) !== (c.previousCommitment === null)) invalid();
  check(row.commitment, HEX); check(row.operation_id, HEX); check(row.transaction_hash, HEX); if (row.state !== 'confirmed') invalid();
  return { context: { ...c } as unknown as ClinicalStoredContext, commitment: row.commitment, operationId: row.operation_id,
    state: 'confirmed', transactionHash: row.transaction_hash };
}
const OP_COLUMNS = `id,actor_user_id,wallet_id,source_wallet,action,contract_id,network,method,expected,request_fingerprint,prepared_envelope,state,unsigned_xdr,
 signing_hash,expires_at,signed_xdr,transaction_hash,error_code,created_at,updated_at,confirmed_at`;
const H_COLUMNS = 'history_id,owner_user_id,wallet_id,patient_wallet,contract_id,network,transaction_hash,created_at';

export function clinicalWebStore(client: ClinicalSqlClient, scope: ClinicalStoreScope) {
  assertScope(scope);
  const binding = Object.freeze({ ...scope });
  async function getHistory(actorId: string): Promise<ClinicalHistoryRow | null> {
    check(actorId, USER);
    const row = (await client.query(`SELECT ${H_COLUMNS} FROM clinical_web_histories
      WHERE owner_user_id=$1 AND contract_id=$2 AND network=$3`, [actorId, binding.contractId, binding.network])).rows[0];
    return row ? history(row, binding, actorId) : null;
  }
  async function getOperation(id: string, actorId: string): Promise<ClinicalOperationRow | null> {
    check(id, UUID); check(actorId, USER);
    const row = (await client.query(`SELECT ${OP_COLUMNS} FROM clinical_web_operations
      WHERE id=$1 AND actor_user_id=$2 AND contract_id=$3 AND network=$4`, [id, actorId, binding.contractId, binding.network])).rows[0];
    return row ? operation(row, binding, actorId) : null;
  }
  return {
    getHistory, getOperation,
    async saveHistory(data: ClinicalHistoryInsert): Promise<ClinicalHistoryRow> {
      check(data.historyId, HEX); check(data.ownerUserId, USER); opaque(data.walletId); check(data.patientWallet, WALLET); check(data.transactionHash, HEX);
      if (data.contractId !== binding.contractId || data.network !== binding.network) invalid();
      const inserted = (await client.query(`INSERT INTO clinical_web_histories
        (history_id,owner_user_id,wallet_id,patient_wallet,contract_id,network,transaction_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING ${H_COLUMNS}`,
      [data.historyId, data.ownerUserId, data.walletId, data.patientWallet, binding.contractId, binding.network, data.transactionHash])).rows[0];
      const saved = inserted ? history(inserted, binding, data.ownerUserId) : await getHistory(data.ownerUserId);
      if (!saved || saved.historyId !== data.historyId || saved.walletId !== data.walletId || saved.patientWallet !== data.patientWallet || saved.transactionHash !== data.transactionHash) throw Error('clinical_history_binding_conflict');
      return saved;
    },
    async listVersions(historyId: string, actorId: string): Promise<ClinicalStoredVersion[]> {
      check(historyId, HEX); check(actorId, USER);
      const h = await getHistory(actorId);
      if (!h || h.historyId !== historyId) throw Error('clinical_history_unavailable');
      const rows = (await client.query(`SELECT v.context,v.commitment,v.operation_id,v.state,v.transaction_hash
        FROM clinical_private_versions v JOIN clinical_web_histories h ON
          h.network=v.network AND h.contract_id=v.contract_id AND h.history_id=v.history_id
        WHERE v.history_id=$1 AND h.owner_user_id=$2 AND v.contract_id=$3 AND v.network=$4 AND v.state='confirmed'
        ORDER BY v.created_at ASC,v.entry_id ASC,v.version ASC`, [historyId, actorId, binding.contractId, binding.network])).rows;
      return rows.map(row => storedVersion(row, binding, h));
    },
    async listOperations(actorId: string): Promise<ClinicalOperationRow[]> {
      check(actorId, USER);
      const rows = (await client.query(`SELECT ${OP_COLUMNS} FROM clinical_web_operations
        WHERE actor_user_id=$1 AND contract_id=$2 AND network=$3 ORDER BY created_at DESC,id ASC`, [actorId, binding.contractId, binding.network])).rows;
      return rows.map(row => operation(row, binding, actorId));
    },
    async insertOperation(data: ClinicalOperationInsert): Promise<ClinicalOperationRow> {
      check(data.id, UUID); check(data.actorUserId, USER); opaque(data.walletId); check(data.sourceWallet, WALLET);
      if (data.contractId !== binding.contractId || data.network !== binding.network || !ACTIONS.includes(data.action) || data.method !== data.action || data.state !== 'awaiting_signature') invalid();
      xdr(data.unsignedXdr); check(data.signingHash, HEX); check(data.requestFingerprint, FINGERPRINT); if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= 0) invalid();
      const e = expected(data.expected, data.action, data.sourceWallet); const envelope = encryptedEnvelope(data.preparedEnvelope, data.action);
      const prior = await getOperation(data.id, data.actorUserId);
      if (prior) {
        if (prior.walletId !== data.walletId || prior.sourceWallet !== data.sourceWallet || prior.action !== data.action || prior.method !== data.method ||
            prior.requestFingerprint !== data.requestFingerprint || !sameExpected(prior.expected, e) || !sameEnvelope(prior.preparedEnvelope, envelope) || prior.unsignedXdr !== data.unsignedXdr || prior.signingHash !== data.signingHash || prior.expiresAt !== data.expiresAt) throw Error('clinical_operation_conflict');
        return prior;
      }
      const h = await getHistory(data.actorUserId);
      if (data.action === 'create_history' ? h !== null : !h || h.historyId !== e.historyId || h.patientWallet !== e.patient || h.walletId !== data.walletId || h.patientWallet !== data.sourceWallet) throw Error('clinical_history_binding_conflict');
      const row = (await client.query(`INSERT INTO clinical_web_operations
        (id,actor_user_id,wallet_id,source_wallet,action,contract_id,network,method,expected,request_fingerprint,prepared_envelope,state,unsigned_xdr,signing_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,'awaiting_signature',$12,$13,$14)
        ON CONFLICT DO NOTHING RETURNING ${OP_COLUMNS}`,
      [data.id, data.actorUserId, data.walletId, data.sourceWallet, data.action, binding.contractId, binding.network, data.method, JSON.stringify(e), data.requestFingerprint, envelope === null ? null : JSON.stringify(envelope), data.unsignedXdr, data.signingHash, data.expiresAt])).rows[0];
      const saved = row ? operation(row, binding, data.actorUserId) : await getOperation(data.id, data.actorUserId);
      if (!saved || saved.walletId !== data.walletId || saved.sourceWallet !== data.sourceWallet || saved.action !== data.action || saved.method !== data.method ||
        saved.requestFingerprint !== data.requestFingerprint || !sameExpected(saved.expected, e) || !sameEnvelope(saved.preparedEnvelope, envelope) || saved.unsignedXdr !== data.unsignedXdr || saved.signingHash !== data.signingHash || saved.expiresAt !== data.expiresAt) throw Error('clinical_operation_conflict');
      return saved;
    },
    async updateOperation(id: string, fromState: ClinicalOperationState, patch: ClinicalOperationPatch): Promise<ClinicalOperationRow> {
      check(id, UUID); check(patch.actorUserId, USER); if (!STATES.includes(fromState)) invalid();
      if (Object.keys(patch).some(key => !['actorUserId', 'state', 'signedXdr', 'transactionHash', 'errorCode'].includes(key))) invalid();
      const saved = await getOperation(id, patch.actorUserId);
      if (!saved || saved.state !== fromState) throw Error('clinical_operation_state_changed');
      const state = patch.state ?? saved.state, signedXdr = patch.signedXdr === undefined ? saved.signedXdr : patch.signedXdr;
      const transactionHash = patch.transactionHash === undefined ? saved.transactionHash : patch.transactionHash;
      const code = patch.errorCode === undefined ? saved.errorCode : patch.errorCode;
      if (!STATES.includes(state)) invalid(); errorCode(code);
      if (signedXdr !== null) xdr(signedXdr); if (transactionHash !== null) check(transactionHash, HEX);
      if ((signedXdr === null) !== (transactionHash === null) ||
          (['awaiting_signature', 'cancelled'].includes(state) && signedXdr !== null) ||
          (['submitted', 'confirmed'].includes(state) && signedXdr === null)) invalid();
      if (saved.signedXdr !== null && (signedXdr !== saved.signedXdr || transactionHash !== saved.transactionHash)) throw Error('clinical_operation_immutable');
      if (TERMINAL.includes(saved.state)) {
        if (state !== saved.state || signedXdr !== saved.signedXdr || transactionHash !== saved.transactionHash || code !== saved.errorCode) throw Error('clinical_operation_immutable');
        return saved;
      }
      if ((saved.state === 'submitted' && !['submitted', 'confirmed', 'failed'].includes(state)) ||
          (saved.state === 'awaiting_signature' && !['awaiting_signature', 'submitted', 'failed', 'cancelled'].includes(state))) throw Error('clinical_operation_transition_invalid');
      const row = (await client.query(`UPDATE clinical_web_operations SET state=$5,signed_xdr=$6,transaction_hash=$7,error_code=$8,
        updated_at=NOW(),confirmed_at=CASE WHEN $5='confirmed' THEN NOW() ELSE NULL END
        WHERE id=$1 AND actor_user_id=$2 AND contract_id=$3 AND network=$4 AND state=$9
          AND signed_xdr IS NOT DISTINCT FROM $10 AND transaction_hash IS NOT DISTINCT FROM $11
        RETURNING ${OP_COLUMNS}`, [id, patch.actorUserId, binding.contractId, binding.network, state, signedXdr, transactionHash, code, fromState, saved.signedXdr, saved.transactionHash])).rows[0];
      if (!row) throw Error('clinical_operation_state_changed');
      return operation(row, binding, patch.actorUserId);
    },
  };
}
