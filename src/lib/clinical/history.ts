import { createHash } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { openClinicalVersion } from '../../../scripts/lib/clinical-crypto.mjs';
import { clinicalSponsorshipQuoteView } from './sponsorship';
import { getDb } from '@/lib/db';
import { requireUser, type AuthedUser } from '@/lib/auth/privy-auth';
import { resolveDoctor } from '@/lib/doctor-authorizations';
import { PrivateFlowError, REGISTRY_PRIVATE, PRIVATE_ADMIN } from '@/lib/private-config';
import type { ClinicalActor, ClinicalSnapshot, ClinicalVersion, ClinicalGrant, ClinicalOperation, ClinicalOperationReview } from '@/types/clinical';
import { createClinicalChainReader } from '../../../scripts/lib/clinical-chain-read.mjs';
import { readClinicalVersion } from '../../../scripts/lib/clinical-read.mjs';
import { clinicalNeonStore } from '../../../scripts/lib/clinical-neon-store.mjs';
import { CLINICAL_ID, CLINICAL_WASM } from './config';
import { resolveClinicalActor, assertClinicalOwner } from './identity';
import { clinicalKeyring } from './keys';
import { createClinicalWebChain, assertClinicalSavedEnvelope, type ClinicalSavedEnvelope } from './chain';
import { clinicalNote } from './input';
import { clinicalCreateOnceConfigured, clinicalWriteCapabilities } from './create-once';
import { clinicalDoctorContext, clinicalDoctorIdentity } from './doctor-context';
import { clinicalPrescriptionReference } from './prescriptions';
import { rehearsalConfigured, clinicalRehearsalView } from './rehearsal';
import { clinicalCaptureConfigured, clinicalCaptureView } from './capture';
import { clinicalReadStage, type ClinicalReadTrace } from './read-trace';

export function clinicalStorageClient() { return { query: async (sql: string, values?: unknown[]) => ({ rows: await getDb().query(sql, values) }) }; }
export async function ownClinicalHistory(actor: ClinicalActor, chain = createClinicalWebChain()) {
  const [row] = await getDb().query(`SELECT * FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet'`, [actor.userId, CLINICAL_ID]);
  if (!row) return null;
  assertClinicalOwner(row as { owner_user_id: string; patient_wallet: string; wallet_id: string }, actor);
  const observed = await chain.history(String(row.history_id));
  if (!observed || observed.id !== row.history_id || observed.patient !== actor.address) throw new PrivateFlowError('clinical_history_unavailable', 503);
  return { row, history: observed };
}
export function clinicalPublicOperation(row: Record<string, any>): ClinicalOperation {
  return { id: row.id as string, action: row.action, state: row.state, expiresAt: Number(row.expires_at), transactionHash: row.transaction_hash ?? null, errorCode: row.error_code ?? null,
    ...(row.state === 'awaiting_signature' && !row.signed_xdr && Number(row.expires_at) > Date.now()/1000
      ? { signing: { address: row.source_wallet as string, hash: row.signing_hash as string, network: 'testnet' as const, expiresAt: Number(row.expires_at) } } : {}) };
}
/** Attach a review only for an unsigned pending intent with a matching verified
 * reservation. No key, ciphertext, envelope, token or document bytes leave here.
 * Own legacy attempts remain readable/cancellable when sponsorship is unavailable. */
export async function clinicalPreparedOperation(actor: ClinicalActor, row: Record<string, any>, client?: PoolClient): Promise<ClinicalOperation> {
  const base = clinicalPublicOperation(row);
  if (row.state !== 'awaiting_signature' || row.signed_xdr || row.transaction_hash) return base;
  try {
    const sponsorship = await clinicalSponsorshipQuoteView(actor, row, client);
    if (!sponsorship) return base;
    const e = row.expected;
    const review: ClinicalOperationReview = { network: 'testnet', contractId: CLINICAL_ID, historyId: e.historyId,
      patient: e.patient, author: actor.address, operationId: e.operationId, content: { kind: 'history' } };
    if (row.action === 'append_version') {
      review.entryId = e.entryId; review.version = e.expectedVersion + 1;
      const document = openClinicalVersion({ envelope: row.prepared_envelope, expectedContext: {
        schemaVersion: 1, network: 'testnet', contractId: CLINICAL_ID, historyId: e.historyId, entryId: e.entryId,
        author: e.author, patient: e.patient, version: review.version, previousCommitment: e.previousCommitment ?? null,
      }, expectedCommitment: e.commitment, keyring: clinicalKeyring().keyring });
      try {
        if (document.metadata.mediaType === 'application/json') {
          review.content = { kind: 'note', note: clinicalNote(JSON.parse(Buffer.from(document.content).toString('utf8'))) };
        } else {
          if (!['application/pdf', 'image/png', 'image/jpeg'].includes(document.metadata.mediaType)) throw new Error();
          review.content = { kind: 'file', fileName: document.metadata.fileName,
            mediaType: document.metadata.mediaType as 'application/pdf' | 'image/png' | 'image/jpeg',
            byteLength: document.content.byteLength, sha256: createHash('sha256').update(document.content).digest('hex') };
        }
      } finally { document.content.fill(0); }
    } else if (row.action === 'set_permissions') {
      review.content = { kind: 'permissions', doctor: e.doctor, canRead: e.canRead, canAppend: e.canAppend, expectedRevision: e.expectedRevision };
    } else if (row.action !== 'create_history') throw new Error();
    return { ...base, sponsorship, review };
  } catch {
    // The client requires both verified quote and review before signing. Never
    // turn a read/cancel into renewed authority or expose an internal failure.
    return base;
  }
}
export async function clinicalOperations(actor: ClinicalActor, historyId?: string | null) {
  // A null target is the no-history view: expose only this patient's creation intent.
  const scope = historyId === null ? " AND action='create_history' AND expected->>'patient'=$5" : historyId ? " AND expected->>'historyId'=$5" : '';
  const values = historyId === null ? [actor.address] : historyId ? [historyId] : [];
  const rows = await getDb().query(`SELECT * FROM clinical_web_operations WHERE actor_user_id=$1 AND wallet_id=$2 AND source_wallet=$3 AND contract_id=$4${scope} ORDER BY created_at DESC LIMIT 50`, [actor.userId, actor.walletId, actor.address, CLINICAL_ID, ...values]);
  return Promise.all(rows.map(row => clinicalPreparedOperation(actor, row)));
}
/** A caller supplies only an opaque locator. No patient enumeration or wallet input. */
export function clinicalReadQuery(request: Request, document = false) {
  const params = new URL(request.url).searchParams;
  const allowed = document ? ['historyId', 'entryId', 'version'] : ['historyId'];
  if ([...params.keys()].some(key => !allowed.includes(key)) || allowed.some(key => params.getAll(key).length > 1)) {
    throw new PrivateFlowError('clinical_request_invalid', 400);
  }
  const historyId = params.get('historyId') ?? undefined;
  if (historyId !== undefined && !/^[a-f0-9]{64}$/.test(historyId)) throw new PrivateFlowError('clinical_request_invalid', 400);
  return { params, historyId };
}
type DoctorReadContext = Awaited<ReturnType<typeof clinicalDoctorContext>>;
export type ClinicalReadTarget = NonNullable<Awaited<ReturnType<typeof ownClinicalHistory>>> & { context?: DoctorReadContext };
export async function clinicalReadTarget(user: AuthedUser, actor: ClinicalActor, historyId?: string,
  chain = createClinicalWebChain()): Promise<ClinicalReadTarget | null> {
  if (historyId === undefined) return ownClinicalHistory(actor, chain);
  const context = await clinicalDoctorContext(user, actor, historyId, chain);
  const rows = await getDb().query(`SELECT history_id,patient_wallet,transaction_hash FROM clinical_web_histories
    WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2`, [historyId, CLINICAL_ID]);
  const row = rows[0];
  const history = await chain.history(historyId);
  if (rows.length !== 1 || !row || !history || history.id !== historyId || row.history_id !== historyId ||
      history.patient !== row.patient_wallet || history.patient === actor.address) throw new PrivateFlowError('clinical_context_unavailable', 404);
  return { row, history, context };
}
function sameDoctorContext(before: DoctorReadContext, after: DoctorReadContext) {
  return ['doctorId', 'historyId', 'canRead', 'canAppend', 'grantRevision'].every(key => before[key as keyof DoctorReadContext] === after[key as keyof DoctorReadContext]);
}
/** Recheck current session, app/registry identity and exact permission revision after all IO. */
export async function clinicalConfirmReadTarget(request: Request, actor: ClinicalActor, target: ClinicalReadTarget, chain?: ReturnType<typeof createClinicalWebChain>) {
  if (!target.context) return;
  const user = await requireUser(request, { strict: true });
  if (!user || user.userId !== actor.userId) throw new PrivateFlowError('clinical_context_unavailable', 404);
  const current = await resolveClinicalActor(user);
  if (current.address !== actor.address || current.walletId !== actor.walletId) throw new PrivateFlowError('clinical_context_unavailable', 404);
  const after = await clinicalReadTarget(user, current, target.history.id, chain);
  if (!after?.context || after.history.patient !== target.history.patient || !sameDoctorContext(target.context, after.context)) {
    throw new PrivateFlowError('clinical_context_unavailable', 404);
  }
}
/** A clinical grant does not confer access to a linked prescription. Keep its ID private on denial. */
export async function clinicalVisibleNote(user: AuthedUser, actor: ClinicalActor, patient: string, note: ReturnType<typeof clinicalNote> | null) {
  if (!note?.prescriptionId) return { note };
  const { prescriptionId, ...withoutReference } = note;
  try {
    const prescription = await clinicalPrescriptionReference(user, actor, patient, prescriptionId);
    return { note, prescription };
  } catch (error) {
    if (error instanceof PrivateFlowError && error.status === 404 && error.message === 'clinical_prescription_unavailable') {
      return { note: withoutReference, prescriptionUnavailable: true as const };
    }
    throw error;
  }
}
/** Link only an audited creation receipt, independently of the recent-intent
 * list. A missing historical receipt cannot invalidate a live owner history,
 * but it must never be replaced with an unverified database hash. */
async function clinicalCreationReceipt(actor: ClinicalActor, historyId: string, hash: unknown, chain: ReturnType<typeof createClinicalWebChain>): Promise<string | null> {
  try {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) return null;
    const rows = await getDb().query(`SELECT * FROM clinical_web_operations WHERE transaction_hash=$1 AND contract_id=$2 AND network='testnet'
      AND action='create_history' AND state='confirmed' AND actor_user_id=$3 AND wallet_id=$4 AND source_wallet=$5 LIMIT 2`,
      [hash, CLINICAL_ID, actor.userId, actor.walletId, actor.address]);
    const operation = rows[0];
    if (rows.length !== 1 || operation.transaction_hash !== hash || operation.contract_id !== CLINICAL_ID || operation.network !== 'testnet' ||
        operation.state !== 'confirmed' || operation.action !== 'create_history' || operation.method !== 'create_history' ||
        operation.actor_user_id !== actor.userId || operation.wallet_id !== actor.walletId || operation.source_wallet !== actor.address ||
        operation.expected?.historyId !== historyId || operation.expected?.patient !== actor.address) return null;
    assertClinicalSavedEnvelope(operation as ClinicalSavedEnvelope, { historical: true });
    await chain.verifyRecordedOperation('create_history', operation.expected);
    return hash;
  } catch { return null; }
}
/** The reader rechecks live identity and permissions after decrypting, before delivery. */
export async function clinicalDocument(request: Request, actor: ClinicalActor, historyId: string, entryId: string, version: number,
  reader = createClinicalChainReader({ network: 'testnet', contractId: CLINICAL_ID, registryId: REGISTRY_PRIVATE, wasmHash: CLINICAL_WASM, readerAddress: PRIVATE_ADMIN }, { requestScoped: true }),
  access?: { user: AuthedUser; context: DoctorReadContext }) {
  if (access && (access.context.historyId !== historyId || access.user.userId !== actor.userId)) throw new PrivateFlowError('clinical_context_unavailable', 404);
  const credential = request;
  const store = clinicalNeonStore(clinicalStorageClient());
  // Each initial/final identity gate consumes its own fresh authentication.
  // Avoid authenticating twice inside that same gate; never reuse it after IO.
  let checkedUser: AuthedUser | null = null;
  return readClinicalVersion({ credential, historyId, entryId, version, signal: request.signal }, {
    deployment: reader.deployment,
    authenticate: async () => {
      const user = await requireUser(request, { strict: true });
      checkedUser = user;
      return user ? { userId: user.userId, sessionId: createHash('sha256').update(request.headers.get('Authorization') ?? '').digest('hex') } : null;
    },
    findBinding: async (identity: { userId: string }) => {
      const user = checkedUser; checkedUser = null;
      if (!user || user.userId !== identity.userId || user.userId !== actor.userId) return null;
      const current = await resolveClinicalActor(user);
      if (current.address !== actor.address || current.walletId !== actor.walletId) return null;
      if (access) {
        const doctor = await clinicalDoctorIdentity(user, current);
        if (!access.context.canRead || doctor.doctorId !== access.context.doctorId) return null;
      }
      return { userId: current.userId, bindingId: current.walletId, wallet: current.address, role: access ? 'doctor' : 'patient', revokedAt: null, verifiedAt: new Date().toISOString() };
    },
    readAccess: async (input: Parameters<typeof reader.readAccess>[0]) => {
      const observed = await reader.readAccess(input);
      if (access && observed?.grantRevision !== access.context.grantRevision) return null;
      return observed;
    }, readVersion: reader.readVersion,
    loadEnvelope: store.loadEnvelope,
    getKeyring: async () => clinicalKeyring().keyring,
  });
}
export async function clinicalGrants(historyId: string, onUnavailable?: () => void, chain = createClinicalWebChain()): Promise<ClinicalGrant[]> {
  const rows = await getDb().query('SELECT id,name FROM doctors ORDER BY name,id LIMIT 200');
  const result: ClinicalGrant[] = [];
  for (const row of rows) {
    let doctor;
    try { doctor = await resolveDoctor(getDb(), Number(row.id)); }
    catch (error) {
      if (error instanceof Error && error.message === 'doctor_privy_login_required') continue;
      if (!onUnavailable) throw error;
      onUnavailable(); continue;
    }
    // Both calls share a monotonic ledger watermark. Concurrent responses can
    // finish out of order and make a valid older observation look regressive.
    try {
      const grant = await chain.grant(historyId, doctor.address);
      const authorized = await chain.doctorAuthorized(doctor.address);
      if (!authorized && !grant) continue;
      result.push({ doctorId: Number(row.id), doctorName: String(row.name), address: doctor.address, authorized: authorized && doctor.doctor.status === 'active',
        canRead: grant?.canRead ?? false, canAppend: grant?.canAppend ?? false, revision: grant?.revision ?? 0 });
    } catch (error) {
      // The patient's content was independently verified as owner. An unrelated
      // directory entry cannot authorize access, or invalidate that content.
      // Omit all unverified flags and controls, and report the incomplete panel.
      if (!onUnavailable) throw error;
      onUnavailable();
    }
  }
  return result;
}
export async function clinicalSnapshot(request: Request, user: AuthedUser, actor: ClinicalActor, historyId?: string, trace?: ClinicalReadTrace): Promise<ClinicalSnapshot> {
  const draftsEnabled = true;
  const writes = clinicalWriteCapabilities(actor.address);
  const chain = createClinicalWebChain();
  const own = await clinicalReadStage(trace, 'target', () => clinicalReadTarget(user, actor, historyId, chain));
  const operations = await clinicalReadStage(trace, 'ops', () => clinicalOperations(actor, own?.history.id ?? null));
  const rehearsal = own ? (clinicalCaptureConfigured() ? clinicalCaptureView(actor, own.history.id) : clinicalRehearsalView(actor, own.history.id)) : undefined;
  const doctorCanWrite = !clinicalCreateOnceConfigured() || rehearsalConfigured() || (clinicalCaptureConfigured() && !!rehearsal);
  if (!own) return { draftsEnabled, writes, history: null, entries: [], grants: [], operations, verifiedAt: new Date().toISOString() };
  if (own.context && !own.context.canRead) {
    await clinicalReadStage(trace, 'finalcontext', () => clinicalConfirmReadTarget(request, actor, own, chain));
    return { draftsEnabled, writes: { create_history: false, set_permissions: false, append_version: doctorCanWrite && writes.append_version && own.context.canAppend },
      context: { role: 'doctor', canRead: false, canAppend: own.context.canAppend, grantRevision: own.context.grantRevision },
      rehearsal, history: { ...own.history, creationTransactionHash: null }, entries: [], grants: [], operations, verifiedAt: new Date().toISOString() };
  }
  const rows = await clinicalReadStage(trace, 'index', () => getDb().query(`SELECT entry_id,version,transaction_hash,operation_id,commitment FROM clinical_private_versions
    WHERE history_id=$1 AND contract_id=$2 AND network='testnet' AND state='confirmed' ORDER BY created_at DESC,version DESC`, [own.history.id, CLINICAL_ID]));
  // Index once: positive distinct versions with max=count are exactly 1..head.
  // Reject malformed local history before starting any decryption or head RPC.
  const heads = new Map<string, number>(), seen = new Map<string, Set<number>>();
  for (const row of rows) {
    const entryId = String(row.entry_id), version = Number(row.version);
    if (!/^[a-f0-9]{64}$/.test(entryId) || !Number.isSafeInteger(version) || version < 1 || version > 0xffff_ffff) {
      throw new PrivateFlowError('clinical_history_unavailable', 503);
    }
    const versions = seen.get(entryId) ?? new Set<number>();
    if (versions.has(version)) throw new PrivateFlowError('clinical_history_unavailable', 503);
    versions.add(version); seen.set(entryId, versions);
    heads.set(entryId, Math.max(heads.get(entryId) ?? 0, version));
  }
  for (const [entryId, versions] of seen) {
    if (heads.get(entryId) !== versions.size) throw new PrivateFlowError('clinical_history_unavailable', 503);
  }
  const entries: ClinicalVersion[] = new Array(rows.length);
  const verifiedHeads = new Map<string, Promise<void>>();
  let next = 0, failed = false, failure: unknown;
  // A request-scoped reader serializes its watermark observations. Each bounded
  // worker therefore owns one reader and web chain, reusing only their immutable
  // account/deployment session across its jobs, never identity or permissions.
  async function worker(workerIndex: number) {
    if (failed) return;
    try {
      if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
      const versionChain = workerIndex === 0 ? chain : createClinicalWebChain();
      const reader = createClinicalChainReader({ network: 'testnet', contractId: CLINICAL_ID, registryId: REGISTRY_PRIVATE,
        wasmHash: CLINICAL_WASM, readerAddress: PRIVATE_ADMIN }, { requestScoped: true });
      while (!failed && next < rows.length) {
        if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
        const index = next++, row = rows[index], entryId = String(row.entry_id), version = Number(row.version);
        let checkedHead = verifiedHeads.get(entryId);
        if (!checkedHead) {
          checkedHead = clinicalReadStage(trace, 'head', () => versionChain.entry(own!.history.id, entryId)).then(entry => {
            if (!entry || entry.headVersion !== heads.get(entryId)) throw new PrivateFlowError('clinical_history_unavailable', 503);
          });
          verifiedHeads.set(entryId, checkedHead);
        }
        await checkedHead;
        if (failed || request.signal.aborted) {
          if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
          return;
        }
        // Wait for both branches even on failure so a decrypted result can be
        // cleared; Promise.all would lose a later document after an early error.
        const [documentResult, evidenceResult] = await Promise.allSettled([
          clinicalReadStage(trace, 'document', () => clinicalDocument(request, actor, own!.history.id, entryId, version, reader, own!.context ? { user, context: own!.context } : undefined)),
          clinicalReadStage(trace, 'receipt', () => versionChain.version(own!.history.id, entryId, version)),
        ]);
        const document = documentResult.status === 'fulfilled' ? documentResult.value : undefined;
        try {
          if (documentResult.status === 'rejected') throw documentResult.reason;
          if (evidenceResult.status === 'rejected') throw evidenceResult.reason;
          if (failed || request.signal.aborted) {
            if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
            return;
          }
          const evidence = evidenceResult.value;
          if (!evidence) throw new PrivateFlowError('clinical_history_unavailable', 503);
          const [operation] = await clinicalReadStage(trace, 'receipt', () => getDb().query(`SELECT * FROM clinical_web_operations WHERE transaction_hash=$1 AND contract_id=$2 AND network='testnet' AND state='confirmed'`, [row.transaction_hash, CLINICAL_ID]));
          if (!operation || operation.action !== 'append_version' || operation.source_wallet !== evidence.context.author ||
              operation.expected.operationId !== row.operation_id || operation.expected.commitment !== evidence.commitment || row.commitment !== evidence.commitment ||
              operation.expected.historyId !== own!.history.id || operation.expected.entryId !== entryId || operation.expected.expectedVersion+1 !== version) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
          if (failed || request.signal.aborted) {
            if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
            return;
          }
          assertClinicalSavedEnvelope(operation as ClinicalSavedEnvelope, { historical: true });
          await clinicalReadStage(trace, 'receipt', () => versionChain.verifyRecordedOperation('append_version', operation.expected));
          if (failed || request.signal.aborted) {
            if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
            return;
          }
          const note = document!.metadata.mediaType === 'application/json' ? clinicalNote(JSON.parse(Buffer.from(document!.content).toString('utf8'))) : null;
          const visibleNote = await clinicalReadStage(trace, 'prescription', () => clinicalVisibleNote(user, actor, own!.history.patient, note));
          entries[index] = { entryId, version, author: evidence.context.author, source: evidence.context.author === own!.history.patient ? 'patient' : 'doctor',
            createdAt: evidence.createdAt, title: note?.title ?? document!.metadata.fileName, mediaType: document!.metadata.mediaType,
            fileName: document!.metadata.fileName, ...visibleNote, transactionHash: String(row.transaction_hash),
            canCorrect: evidence.context.author === actor.address && version === heads.get(entryId) && (!own!.context || own!.context.canAppend) };
        } finally {
          const content: unknown = document?.content;
          if (content instanceof Uint8Array) content.fill(0);
        }
      }
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, (_, index) => worker(index)));
  if (failed) throw failure;
  if (request.signal.aborted) throw new PrivateFlowError('clinical_history_unavailable', 503);
  entries.sort((a,b) => b.createdAt-a.createdAt || b.version-a.version || a.entryId.localeCompare(b.entryId));
  if (own.context) {
    await clinicalReadStage(trace, 'finalcontext', () => clinicalConfirmReadTarget(request, actor, own, chain));
    return { draftsEnabled, writes: { create_history: false, set_permissions: false, append_version: doctorCanWrite && writes.append_version && own.context.canAppend },
      context: { role: 'doctor', canRead: own.context.canRead, canAppend: own.context.canAppend, grantRevision: own.context.grantRevision },
      rehearsal, history: { ...own.history, creationTransactionHash: null }, entries, grants: [], operations, verifiedAt: new Date().toISOString() };
  }
  const creationTransactionHash = await clinicalReadStage(trace, 'receipt', () => clinicalCreationReceipt(actor, own.history.id, own.row.transaction_hash, chain));
  let grantsUnavailable = false;
  const grants = await clinicalReadStage(trace, 'finalcontext', () => clinicalGrants(own.history.id, () => { grantsUnavailable = true; }, chain));
  return { draftsEnabled, writes, rehearsal, history: { ...own.history, creationTransactionHash }, entries, grants, grantsUnavailable, operations, verifiedAt: new Date().toISOString() };
}
