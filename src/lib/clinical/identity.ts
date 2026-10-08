import 'server-only';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import type { ClinicalActor } from '@/types/clinical';
import { getDb } from '@/lib/db';
import { verifiedWallet } from '@/lib/doctor-authorizations';
import { PrivateFlowError } from '@/lib/private-config';

/** Email verifies the current provider session; it is never the history owner key. */
export async function resolveClinicalActor(actor: AuthedUser): Promise<ClinicalActor> {
  if (!/^did:privy:[A-Za-z0-9_-]+$/.test(actor.userId) || !actor.email?.trim()) {
    throw new PrivateFlowError('clinical_identity_required', 403);
  }
  const wallet = await verifiedWallet(getDb(), actor.userId, actor.email);
  return { userId: actor.userId, walletId: wallet.walletId, address: wallet.address };
}

/** Recheck all saved bindings before reading, preparing, or submitting a history operation. */
export function assertClinicalOwner(
  history: { owner_user_id: string; patient_wallet: string; wallet_id: string },
  actor: ClinicalActor,
): void {
  if (!history.owner_user_id || history.owner_user_id !== actor.userId) {
    throw new PrivateFlowError('clinical_access_denied', 403);
  }
  if (!history.wallet_id || !history.patient_wallet ||
      history.wallet_id !== actor.walletId || history.patient_wallet !== actor.address) {
    throw new PrivateFlowError('clinical_wallet_changed', 409);
  }
}
