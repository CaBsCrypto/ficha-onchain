import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { requireUser, type AuthedUser } from '@/lib/auth/privy-auth';
import { resolveDoctor } from '@/lib/doctor-authorizations';
import { PrivateFlowError, REGISTRY_PRIVATE, PRIVATE_ADMIN } from '@/lib/private-config';
import type { ClinicalActor, ClinicalSnapshot, ClinicalVersion, ClinicalGrant } from '@/types/clinical';
import { createClinicalChainReader } from '../../../scripts/lib/clinical-chain-read.mjs';
import { readClinicalVersion } from '../../../scripts/lib/clinical-read.mjs';
import { clinicalNeonStore } from '../../../scripts/lib/clinical-neon-store.mjs';
import { CLINICAL_ID, CLINICAL_WASM } from './config';
import { resolveClinicalActor, assertClinicalOwner } from './identity';
import { clinicalKeyring } from './keys';
import { createClinicalWebChain, assertClinicalSavedEnvelope, type ClinicalSavedEnvelope } from './chain';
import { clinicalNote } from './input';

export function clinicalStorageClient() { return { query: async (sql: string, values?: unknown[]) => ({ rows: await getDb().query(sql, values) }) }; }
export async function ownClinicalHistory(actor: ClinicalActor) {
  const [row] = await getDb().query(`SELECT * FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet'`, [actor.userId, CLINICAL_ID]);
  if (!row) return null;
  assertClinicalOwner(row as { owner_user_id: string; patient_wallet: string; wallet_id: string }, actor);
  const observed = await createClinicalWebChain().history(String(row.history_id));
  if (!observed || observed.id !== row.history_id || observed.patient !== actor.address) throw new PrivateFlowError('clinical_history_unavailable', 503);
  return { row, history: observed };
}
export function clinicalPublicOperation(row: Record<string, any>) {
  return { id: row.id as string, action: row.action, state: row.state, expiresAt: Number(row.expires_at), transactionHash: row.transaction_hash ?? null, errorCode: row.error_code ?? null };
}
export async function clinicalOperations(actor: ClinicalActor) {
  const rows = await getDb().query(`SELECT * FROM clinical_web_operations WHERE actor_user_id=$1 AND wallet_id=$2 AND source_wallet=$3 AND contract_id=$4 ORDER BY created_at DESC LIMIT 50`, [actor.userId, actor.walletId, actor.address, CLINICAL_ID]);
  return rows.map(clinicalPublicOperation);
}
/** The reader rechecks live identity and permissions after decrypting, before delivery. */
export async function clinicalDocument(request: Request, actor: ClinicalActor, historyId: string, entryId: string, version: number) {
  const credential = request;
  const reader = createClinicalChainReader({ network: 'testnet', contractId: CLINICAL_ID, registryId: REGISTRY_PRIVATE, wasmHash: CLINICAL_WASM, readerAddress: PRIVATE_ADMIN });
  const store = clinicalNeonStore(clinicalStorageClient());
  return readClinicalVersion({ credential, historyId, entryId, version, signal: request.signal }, {
    deployment: reader.deployment,
    authenticate: async () => {
      const user = await requireUser(request, { strict: true });
      return user ? { userId: user.userId, sessionId: createHash('sha256').update(request.headers.get('Authorization') ?? '').digest('hex') } : null;
    },
    findBinding: async (identity: { userId: string }) => {
      const user = await requireUser(request, { strict: true });
      if (!user || user.userId !== identity.userId || user.userId !== actor.userId) return null;
      const current = await resolveClinicalActor(user);
      if (current.address !== actor.address || current.walletId !== actor.walletId) return null;
      return { userId: current.userId, bindingId: current.walletId, wallet: current.address, role: 'patient', revokedAt: null, verifiedAt: new Date().toISOString() };
    },
    readAccess: reader.readAccess, readVersion: reader.readVersion,
    loadEnvelope: store.loadEnvelope,
    getKeyring: async () => clinicalKeyring().keyring,
  });
}
export async function clinicalGrants(historyId: string): Promise<ClinicalGrant[]> {
  const chain = createClinicalWebChain();
  const rows = await getDb().query('SELECT id,name FROM doctors ORDER BY name,id LIMIT 200');
  const result: ClinicalGrant[] = [];
  for (const row of rows) {
    let doctor;
    try { doctor = await resolveDoctor(getDb(), Number(row.id)); }
    catch (error) { if (error instanceof Error && error.message === 'doctor_privy_login_required') continue; throw error; }
    const [grant, authorized] = await Promise.all([chain.grant(historyId, doctor.address), chain.doctorAuthorized(doctor.address)]);
    if (!authorized && !grant) continue;
    result.push({ doctorId: Number(row.id), doctorName: String(row.name), address: doctor.address, authorized: authorized && doctor.doctor.status === 'active',
      canRead: grant?.canRead ?? false, canAppend: grant?.canAppend ?? false, revision: grant?.revision ?? 0 });
  }
  return result;
}
export async function clinicalSnapshot(request: Request, _user: AuthedUser, actor: ClinicalActor): Promise<ClinicalSnapshot> {
  const own = await ownClinicalHistory(actor);
  const operations = await clinicalOperations(actor);
  if (!own) return { history: null, entries: [], grants: [], operations, verifiedAt: new Date().toISOString() };
  const rows = await getDb().query(`SELECT entry_id,version,transaction_hash,operation_id,commitment FROM clinical_private_versions
    WHERE history_id=$1 AND contract_id=$2 AND network='testnet' AND state='confirmed' ORDER BY created_at DESC,version DESC`, [own.history.id, CLINICAL_ID]);
  const chain = createClinicalWebChain();
  const entries: ClinicalVersion[] = [];
  const heads = new Map<string, number>();
  for (const row of rows) {
    const entryId = String(row.entry_id), version = Number(row.version);
    if (!heads.has(entryId)) {
      const entry = await chain.entry(own.history.id, entryId);
      if (!entry || entry.headVersion !== Math.max(...rows.filter(r => r.entry_id === entryId).map(r => Number(r.version))) ||
          rows.filter(r => r.entry_id === entryId).length !== entry.headVersion) throw new PrivateFlowError('clinical_history_unavailable', 503);
      heads.set(entryId, entry.headVersion);
    }
    const [document, evidence] = await Promise.all([clinicalDocument(request, actor, own.history.id, entryId, version), chain.version(own.history.id, entryId, version)]);
    if (!evidence) throw new PrivateFlowError('clinical_history_unavailable', 503);
    const [operation] = await getDb().query(`SELECT * FROM clinical_web_operations WHERE transaction_hash=$1 AND contract_id=$2 AND network='testnet' AND state='confirmed'`, [row.transaction_hash, CLINICAL_ID]);
    if (!operation || operation.action !== 'append_version' || operation.source_wallet !== evidence.context.author ||
        operation.expected.operationId !== row.operation_id || operation.expected.commitment !== evidence.commitment || row.commitment !== evidence.commitment ||
        operation.expected.historyId !== own.history.id || operation.expected.entryId !== entryId || operation.expected.expectedVersion+1 !== version) throw new PrivateFlowError('clinical_receipt_mismatch', 503);
    assertClinicalSavedEnvelope(operation as ClinicalSavedEnvelope, { historical: true });
    await chain.verifyRecordedOperation('append_version', operation.expected);
    const note = document.metadata.mediaType === 'application/json' ? clinicalNote(JSON.parse(Buffer.from(document.content).toString('utf8'))) : null;
    entries.push({ entryId, version, author: evidence.context.author, source: evidence.context.author === actor.address ? 'patient' : 'doctor',
      createdAt: evidence.createdAt, title: note?.title ?? document.metadata.fileName, mediaType: document.metadata.mediaType,
      fileName: document.metadata.fileName, note, transactionHash: String(row.transaction_hash),
      canCorrect: evidence.context.author === actor.address && version === heads.get(entryId) });
  }
  entries.sort((a,b) => b.createdAt-a.createdAt || b.version-a.version || a.entryId.localeCompare(b.entryId));
  return { history: own.history, entries, grants: await clinicalGrants(own.history.id), operations, verifiedAt: new Date().toISOString() };
}
