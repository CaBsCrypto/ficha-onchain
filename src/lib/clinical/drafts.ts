import 'server-only';
import { StrKey } from '@stellar/stellar-sdk';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { getDb, type Sql } from '@/lib/db';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalActor } from '@/types/clinical';
import { CLINICAL_ID } from './config';
import { clinicalDoctorContext } from './doctor-context';
import { clinicalKeyring } from './keys';
import { draftId, draftRevision, draftSave, draftSaveRequest, draftPayload } from './drafts-input';
import { clinicalInput } from './input';
import { validateNewClinicalFile } from './file-validation';
import { draftFingerprint, openDraft, sealDraft, type DraftContext, type DraftKeys } from './drafts-crypto';
import type { ClinicalDraft, ClinicalDraftMetadata, ClinicalDraftSave, ClinicalDraftPayload, ClinicalDraftPage } from './drafts-types';

type Row = Record<string, unknown>;
export interface DraftSql { query(sql: string, params?: unknown[]): Promise<Row[]> }
export interface DraftTransactionClient { query(sql: string, params?: unknown[]): Promise<{ rows: Row[] }> }
const unavailable = () => new PrivateFlowError('clinical_drafts_unavailable', 503);
const missing = () => new PrivateFlowError('clinical_draft_not_found', 404);
const conflict = () => new PrivateFlowError('clinical_draft_conflict', 409);
const bound = () => new PrivateFlowError('clinical_draft_publication_pending', 409);
const scope = (actor: ClinicalActor) => [actor.userId, actor.walletId, actor.address, CLINICAL_ID, 'testnet'];
const SELECT = 'SELECT * FROM clinical_private_drafts WHERE id=$1 AND owner_user_id=$2 AND wallet_id=$3 AND author_wallet=$4 AND contract_id=$5 AND network=$6';
function actorValid(actor: ClinicalActor) {
  if (!/^did:privy:[A-Za-z0-9_-]{1,128}$/.test(actor.userId) || !/^[A-Za-z0-9:_-]{1,160}$/.test(actor.walletId) || !StrKey.isValidEd25519PublicKey(actor.address)) throw unavailable();
}
function context(row: Row, actor: ClinicalActor): DraftContext {
  actorValid(actor);
  if (row.owner_user_id !== actor.userId || row.wallet_id !== actor.walletId || row.author_wallet !== actor.address || row.contract_id !== CLINICAL_ID || row.network !== 'testnet' ||
      typeof row.history_id !== 'string' || !/^[a-f0-9]{64}$/.test(row.history_id) || typeof row.patient_wallet !== 'string' || !StrKey.isValidEd25519PublicKey(row.patient_wallet) ||
      (row.entry_id !== null && (typeof row.entry_id !== 'string' || !/^[a-f0-9]{64}$/.test(row.entry_id))) ||
      (row.entry_id === null ? row.expected_version !== null : typeof row.expected_version !== 'number' || row.expected_version < 1) ||
      (row.publication_request_id !== null && draftId(row.publication_request_id) !== row.publication_request_id)) throw unavailable();
  return { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID, draftId: draftId(row.id),
    authorUserId: actor.userId, authorWalletId: actor.walletId, author: actor.address, historyId: row.history_id,
    patient: row.patient_wallet, entryId: row.entry_id as string | null, expectedVersion: row.expected_version as number | null, revision: draftRevision(row.revision) };
}
function metadata(row: Row, actor: ClinicalActor): ClinicalDraftMetadata {
  const c = context(row, actor), createdAt = new Date(String(row.created_at)), updatedAt = new Date(String(row.updated_at));
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(updatedAt.getTime())) throw unavailable();
  return { id: c.draftId, revision: c.revision, historyId: c.historyId, patient: c.patient, author: c.author, state: 'draft',
    publicationRequestId: row.publication_request_id as string | null, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}
function sameTarget(c: DraftContext, input: ClinicalDraftSave) {
  if (c.historyId !== input.historyId || c.patient !== input.patient || c.entryId !== (input.payload.entryId ?? null) || c.expectedVersion !== (input.payload.expectedVersion ?? null)) throw conflict();
}
async function safely<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) { if (error instanceof PrivateFlowError) throw error; throw unavailable(); }
}
async function authorizeInitial(sql: DraftSql, user: AuthedUser, actor: ClinicalActor, input: ClinicalDraftSave) {
  if (user.userId !== actor.userId) throw missing();
  const rows = await sql.query("SELECT owner_user_id,wallet_id,history_id,patient_wallet FROM clinical_web_histories WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2", [input.historyId, CLINICAL_ID]);
  if (rows.length !== 1 || rows[0].history_id !== input.historyId || rows[0].patient_wallet !== input.patient) throw missing();
  const row = rows[0];
  if (row.owner_user_id === actor.userId && row.wallet_id === actor.walletId && row.patient_wallet === actor.address) return;
  const doctor = await clinicalDoctorContext(user, actor, input.historyId);
  if (!doctor.canAppend || doctor.historyId !== input.historyId) throw missing();
  // Context resolver verifies canonical history.patient against this exact DB row.
  const again = await sql.query("SELECT patient_wallet FROM clinical_web_histories WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2", [input.historyId, CLINICAL_ID]);
  if (again.length !== 1 || again[0].patient_wallet !== input.patient) throw missing();
}
export function createClinicalDraftService(deps: { sql: DraftSql; keys: () => DraftKeys;
  authorizeCreate?: (user: AuthedUser, actor: ClinicalActor, input: ClinicalDraftSave) => Promise<void> }) {
  const { sql } = deps;
  const getRow = async (actor: ClinicalActor, id: string) => {
    actorValid(actor); const rows = await sql.query(SELECT, [draftId(id), ...scope(actor)]);
    if (rows.length !== 1) throw missing(); context(rows[0], actor); return rows[0];
  };
  return {
    list: (actor: ClinicalActor, options: { before?: string } = {}): Promise<ClinicalDraftPage> => safely(async () => {
      actorValid(actor); let anchor: Row | undefined;
      if (options.before !== undefined) anchor = await getRow(actor, draftId(options.before));
      const rows = await sql.query('SELECT id,owner_user_id,wallet_id,author_wallet,contract_id,network,history_id,patient_wallet,entry_id,expected_version,revision,publication_request_id,created_at,updated_at FROM clinical_private_drafts WHERE owner_user_id=$1 AND wallet_id=$2 AND author_wallet=$3 AND contract_id=$4 AND network=$5 AND deleted_at IS NULL' +
        (anchor ? ' AND (updated_at,id)<($6::timestamptz,$7::uuid)' : '') + ' ORDER BY updated_at DESC,id DESC LIMIT 51',
        [...scope(actor), ...(anchor ? [metadata(anchor, actor).updatedAt, anchor.id] : [])]);
      const drafts = rows.slice(0, 50).map(row => metadata(row, actor)), hasMore = rows.length > 50;
      return { drafts, hasMore, nextBefore: hasMore ? drafts[drafts.length - 1].id : null };
    }),
    get: (actor: ClinicalActor, id: string): Promise<ClinicalDraft> => safely(async () => {
      const row = await getRow(actor, id); if (row.deleted_at !== null) throw missing();
      return { ...metadata(row, actor), payload: openDraft(context(row, actor), row.envelope, deps.keys()) };
    }),
    save: (user: AuthedUser, actor: ClinicalActor, supplied: unknown): Promise<ClinicalDraftMetadata> => safely(async () => {
      actorValid(actor); if (user.userId !== actor.userId) throw missing();
      const request = draftSaveRequest(supplied);
      let patient = request.patient;
      if (patient === undefined) {
        const histories = await sql.query("SELECT history_id,patient_wallet FROM clinical_web_histories WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2", [request.historyId, CLINICAL_ID]);
        if (histories.length !== 1 || histories[0].history_id !== request.historyId || typeof histories[0].patient_wallet !== 'string' ||
            !StrKey.isValidEd25519PublicKey(histories[0].patient_wallet)) throw missing();
        patient = histories[0].patient_wallet;
      }
      // Patient is always normalized before initial authorization, fingerprints, or encrypted AAD.
      const input: ClinicalDraftSave = { ...request, patient };
      const existing = await sql.query(SELECT, [input.id, ...scope(actor)]);
      if (existing.length > 1) throw unavailable();
      const keys = deps.keys();
      if (existing.length) {
        const row = existing[0], c = context(row, actor); sameTarget(c, input);
        if (row.deleted_at !== null) throw missing();
        if (row.publication_request_id !== null) throw bound();
        if (c.revision === input.expectedRevision + 1) {
          const keyId = String(row.request_fingerprint).split(':')[0];
          if (row.request_fingerprint === draftFingerprint(c, input.payload, input.expectedRevision, keys, keyId)) return metadata(row, actor);
        }
        if (c.revision !== input.expectedRevision) throw conflict();
      } else {
        if (input.expectedRevision !== 0) throw missing();
        await (deps.authorizeCreate ? deps.authorizeCreate(user, actor, input) : authorizeInitial(sql, user, actor, input));
      }
      const c: DraftContext = { schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID, draftId: input.id, authorUserId: actor.userId,
        authorWalletId: actor.walletId, author: actor.address, historyId: input.historyId, patient: input.patient,
        entryId: input.payload.entryId ?? null, expectedVersion: input.payload.expectedVersion ?? null, revision: input.expectedRevision + 1 };
      if (input.payload.file) await validateNewClinicalFile(input.payload.file);
      const envelope = sealDraft(c, input.payload, keys), fingerprint = draftFingerprint(c, input.payload, input.expectedRevision, keys);
      const changed = input.expectedRevision === 0
        ? await sql.query('INSERT INTO clinical_private_drafts(id,owner_user_id,wallet_id,author_wallet,contract_id,network,history_id,patient_wallet,entry_id,expected_version,revision,envelope,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11::jsonb,$12) ON CONFLICT(id) DO NOTHING RETURNING *',
          [input.id, ...scope(actor), input.historyId, input.patient, c.entryId, c.expectedVersion, JSON.stringify(envelope), fingerprint])
        : await sql.query('UPDATE clinical_private_drafts SET revision=revision+1,envelope=$8::jsonb,request_fingerprint=$9,updated_at=NOW() WHERE id=$1 AND owner_user_id=$2 AND wallet_id=$3 AND author_wallet=$4 AND contract_id=$5 AND network=$6 AND revision=$7 AND deleted_at IS NULL AND publication_request_id IS NULL RETURNING *',
          [input.id, ...scope(actor), input.expectedRevision, JSON.stringify(envelope), fingerprint]);
      if (changed.length === 1) return metadata(changed[0], actor);
      const current = await getRow(actor, input.id); sameTarget(context(current, actor), input);
      if (current.deleted_at !== null) throw missing();
      if (current.publication_request_id !== null) throw bound();
      const keyId = String(current.request_fingerprint).split(':')[0];
      if (current.revision === c.revision && current.request_fingerprint === draftFingerprint(c, input.payload, input.expectedRevision, keys, keyId)) return metadata(current, actor);
      throw conflict();
    }),
    delete: (actor: ClinicalActor, id: string, revision: number): Promise<{ deleted: true; id: string; revision: number }> => safely(async () => {
      draftRevision(revision); const row = await getRow(actor, id);
      if (row.publication_request_id !== null) throw bound();
      if (row.deleted_at !== null) {
        if (row.revision === revision + 1) return { deleted: true, id: String(row.id), revision: Number(row.revision) };
        throw missing();
      }
      const deleted = await sql.query('UPDATE clinical_private_drafts SET revision=revision+1,envelope=NULL,request_fingerprint=NULL,deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND owner_user_id=$2 AND wallet_id=$3 AND author_wallet=$4 AND contract_id=$5 AND network=$6 AND revision=$7 AND deleted_at IS NULL AND publication_request_id IS NULL RETURNING *', [draftId(id), ...scope(actor), revision]);
      if (deleted.length !== 1) throw conflict();
      return { deleted: true, id: draftId(id), revision: Number(deleted[0].revision) };
    }),
  };
}
const service = () => createClinicalDraftService({ sql: getDb() as Sql, keys: clinicalKeyring });
export const listClinicalDrafts = (actor: ClinicalActor, options: { before?: string } = {}) => safely(() => service().list(actor, options));
export const getClinicalDraft = (actor: ClinicalActor, id: string) => safely(() => service().get(actor, id));
export const saveClinicalDraft = (user: AuthedUser, actor: ClinicalActor, input: unknown) => safely(() => service().save(user, actor, input));
export const deleteClinicalDraft = (actor: ClinicalActor, id: string, revision: number) => safely(() => service().delete(actor, id, revision));

/** Caller must hold its existing wallet transaction; no publication authority is granted here. */
export async function assertDraftPublication(client: DraftTransactionClient, actor: ClinicalActor, supplied: {
  id: string; revision: number; requestId: string; historyId: string; patient: string; payload: ClinicalDraftPayload;
}): Promise<void> {
  return safely(async () => {
    const input = draftSave({ id: supplied.id, expectedRevision: supplied.revision, historyId: supplied.historyId, patient: supplied.patient, payload: supplied.payload });
    const requestId = draftId(supplied.requestId);
    const rows = (await client.query(SELECT + ' FOR UPDATE', [input.id, ...scope(actor)])).rows;
    if (rows.length !== 1 || rows[0].deleted_at !== null) throw missing();
    const row = rows[0], c = context(row, actor); sameTarget(c, input);
    if (c.revision !== supplied.revision) throw conflict();
    if (row.publication_request_id !== null && row.publication_request_id !== requestId) throw bound();
    const payload = openDraft(c, row.envelope, clinicalKeyring());
    const canonical = (p: ClinicalDraftPayload) => {
      const checked = clinicalInput({ requestId, action: 'append_version', ...p });
      return draftPayload({ ...(checked.entryId ? { entryId: checked.entryId, expectedVersion: checked.expectedVersion } : {}),
        ...(checked.note ? { note: checked.note } : { file: checked.file }) });
    };
    if (JSON.stringify(canonical(payload)) !== JSON.stringify(canonical(input.payload))) throw conflict();
  });
}
export async function markDraftPrepared(client: DraftTransactionClient, actor: ClinicalActor, id: string, revision: number, requestId: string): Promise<void> {
  return safely(async () => {
    actorValid(actor); draftRevision(revision);
    const rows = (await client.query('UPDATE clinical_private_drafts SET publication_request_id=$8,updated_at=NOW() WHERE id=$1 AND owner_user_id=$2 AND wallet_id=$3 AND author_wallet=$4 AND contract_id=$5 AND network=$6 AND revision=$7 AND deleted_at IS NULL AND (publication_request_id IS NULL OR publication_request_id=$8) RETURNING id',
      [draftId(id), ...scope(actor), revision, draftId(requestId)])).rows;
    if (rows.length !== 1) throw bound();
  });
}
