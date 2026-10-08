import type { ClinicalGrant, ClinicalPrepareRequest } from '@/types/clinical';

export interface ClinicalPermissionDraft { canRead: boolean; canAppend: boolean }
export function initialClinicalPermissionDraft(grant: ClinicalGrant): ClinicalPermissionDraft {
  return { canRead: grant.canRead, canAppend: grant.canAppend };
}
/** A new observed revision or wallet resets the component rather than submitting an old draft. */
export function clinicalPermissionKey(grant: ClinicalGrant): string {
  return [grant.doctorId, grant.address, grant.revision, grant.canRead, grant.canAppend, grant.authorized].join(':');
}
export function clinicalPermissionChanged(grant: ClinicalGrant, draft: ClinicalPermissionDraft): boolean {
  return grant.canRead !== draft.canRead || grant.canAppend !== draft.canAppend;
}
export function clinicalPermissionCanReview(grant: ClinicalGrant, draft: ClinicalPermissionDraft): boolean {
  return clinicalPermissionChanged(grant, draft) && (grant.authorized || (!draft.canRead && !draft.canAppend));
}
/** An expired/revoked medical authorization never prevents withdrawal. It does
 * prevent granting/preserving a positive flag in a new permission transaction. */
export function clinicalPermissionChange(grant: ClinicalGrant, draft: ClinicalPermissionDraft): Omit<ClinicalPrepareRequest, 'requestId'> {
  if (!Number.isSafeInteger(grant.doctorId) || grant.doctorId < 1 || !Number.isSafeInteger(grant.revision) || grant.revision < 0 ||
      typeof draft.canRead !== 'boolean' || typeof draft.canAppend !== 'boolean') throw new Error('clinical_permission_invalid');
  if (!clinicalPermissionChanged(grant, draft)) throw new Error('clinical_permission_unchanged');
  if (!grant.authorized && (draft.canRead || draft.canAppend)) throw new Error('clinical_permission_withdrawal_only');
  return { action: 'set_permissions', doctorId: grant.doctorId, canRead: draft.canRead,
    canAppend: draft.canAppend, expectedRevision: grant.revision };
}
export function clinicalPermissionError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'clinical_permission_conflict' || code === 'clinical_identity_changed') return 'Los permisos cambiaron. Actualiza el historial y vuelve a revisar tu elección.';
  if (code === 'doctor_not_authorized') return 'El médico ya no tiene autorización vigente. Actualiza el historial; puedes retirar sus permisos.';
  if (code === 'clinical_permission_withdrawal_only') return 'Para retirar los permisos de este médico, desmarca ambas opciones.';
  if (code === 'private_writes_paused' || code === 'clinical_writes_paused') return 'Los cambios están temporalmente pausados. Los permisos consultados se conservan.';
  return 'No se pudo preparar el cambio. Actualiza el historial e inténtalo de nuevo.';
}
