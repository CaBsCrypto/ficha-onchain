import 'server-only';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { getDb } from '@/lib/db';
import { PrivateFlowError } from '@/lib/private-config';
import type { ClinicalActor } from '@/types/clinical';
import { CLINICAL_ID } from './config';
import { getClinicalDraft, saveClinicalDraft, type DraftSql } from './drafts';
import { draftId, draftObject, draftRevision } from './drafts-input';
import type { ClinicalDraft, ClinicalDraftMetadata, ClinicalDraftSave } from './drafts-types';

type Dependencies = {
  sql: DraftSql;
  getDraft: (actor: ClinicalActor, id: string) => Promise<ClinicalDraft>;
  saveDraft: (user: AuthedUser, actor: ClinicalActor, input: ClinicalDraftSave) => Promise<ClinicalDraftMetadata>;
};
const missing = () => new PrivateFlowError('clinical_draft_not_found', 404);
const conflict = () => new PrivateFlowError('clinical_draft_conflict', 409);
const unavailable = () => new PrivateFlowError('clinical_draft_resume_unavailable', 409);

/** Copies private author content only; this never allocates a publication nonce or prepares/signs/submits. */
export function createClinicalDraftResumeService(deps: Dependencies) {
  return {
    async resume(user: AuthedUser, actor: ClinicalActor, sourceId: string, supplied: unknown): Promise<ClinicalDraft> {
      try {
        if (user.userId !== actor.userId) throw missing();
        const body = draftObject(supplied, ['expectedRevision', 'id']);
        const id = draftId(body.id), originalId = draftId(sourceId), expectedRevision = draftRevision(body.expectedRevision);
        if (id === originalId) throw conflict();
        const original = await deps.getDraft(actor, originalId);
        if (original.id !== originalId || original.author !== actor.address) throw missing();
        if (original.revision !== expectedRevision) throw conflict();
        if (!original.publicationRequestId) throw unavailable();
        const publicationId = draftId(original.publicationRequestId);
        const rows = await deps.sql.query(
          "SELECT id,state,action,actor_user_id,wallet_id,source_wallet,contract_id,network,expected,signed_xdr,transaction_hash FROM clinical_web_operations WHERE id=$1 AND actor_user_id=$2 AND wallet_id=$3 AND source_wallet=$4 AND contract_id=$5 AND network=$6 LIMIT 2",
          [publicationId, actor.userId, actor.walletId, actor.address, CLINICAL_ID, 'testnet']);
        if (rows.length !== 1) throw unavailable();
        const operation = rows[0], expected = operation.expected as Record<string, unknown> | null;
        if (operation.id !== publicationId || operation.actor_user_id !== actor.userId || operation.wallet_id !== actor.walletId ||
            operation.source_wallet !== actor.address || operation.contract_id !== CLINICAL_ID || operation.network !== 'testnet' ||
            operation.action !== 'append_version' || operation.state !== 'cancelled' || operation.signed_xdr !== null ||
            operation.transaction_hash !== null || !expected || typeof expected !== 'object' ||
            expected.historyId !== original.historyId || expected.patient !== original.patient || expected.author !== actor.address ||
            (original.payload.entryId ? expected.entryId !== original.payload.entryId || expected.expectedVersion !== original.payload.expectedVersion
              : expected.expectedVersion !== 0)) throw unavailable();
        const saved = await deps.saveDraft(user, actor, { id, expectedRevision: 0, historyId: original.historyId,
          patient: original.patient, payload: original.payload });
        if (saved.id !== id || saved.revision !== 1 || saved.publicationRequestId !== null ||
            saved.historyId !== original.historyId || saved.patient !== original.patient || saved.author !== actor.address) throw conflict();
        return { ...saved, payload: original.payload };
      } catch (error) {
        if (error instanceof PrivateFlowError) throw error;
        throw new PrivateFlowError('clinical_drafts_unavailable', 503);
      }
    },
  };
}
export function resumeClinicalDraft(user: AuthedUser, actor: ClinicalActor, sourceId: string, supplied: unknown): Promise<ClinicalDraft> {
  return createClinicalDraftResumeService({ sql: getDb(), getDraft: getClinicalDraft, saveDraft: saveClinicalDraft }).resume(user, actor, sourceId, supplied);
}
