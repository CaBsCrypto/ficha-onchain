/** Read-only aggregate accounting, inside the same transaction run lock as writes. */
import { Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import type { ClinicalExpected } from '@/types/clinical';
import { PrivateFlowError } from '@/lib/private-config';
import { assertRehearsalAggregateBudget } from '../../../scripts/lib/clinical-rehearsal-policy.mjs';
import { assertRehearsalAggregateExposure } from '../../../scripts/lib/clinical-rehearsal-budget.mjs';
import { lockClinicalRehearsalRun } from '../../../scripts/lib/clinical-rehearsal-closure.mjs';
import { clinicalWebFeeQuote } from '../../../scripts/lib/clinical-web-fee-policy.mjs';
import { CLINICAL_ID } from './config';
import { assertClinicalSavedEnvelope, assertClinicalUnsigned, createClinicalWebChain } from './chain';
import { assertClinicalRehearsalExpected, type RehearsalPolicy, type RehearsalStep } from './rehearsal';

export async function assertClinicalRehearsalBudget(client: PoolClient, policy: RehearsalPolicy, step: RehearsalStep,
  unsigned: Transaction, expected: ClinicalExpected, receipt?: (hash: string) => Promise<unknown>): Promise<void> {
  if (!policy.aggregateBudget) return;
  try {
    assertRehearsalAggregateBudget(policy, { step });
    const actor = step.actor === 'doctor' ? policy.doctor : step.actor === 'patient' ? policy.patient : null;
    if (!actor) throw Error('clinical_rehearsal_budget_unavailable');
    assertClinicalRehearsalExpected(policy, step, actor, expected);
    assertClinicalUnsigned(unsigned, actor.address, step.action as 'append_version' | 'set_permissions', expected);
    await lockClinicalRehearsalRun(client, policy);
    const ids = policy.steps.filter(value => value.actor !== 'admin').map(value => value.requestId);
    const rows = (await client.query('SELECT id,state,action,method,source_wallet,actor_user_id,wallet_id,contract_id,network,expected,unsigned_xdr,signed_xdr,transaction_hash,signing_hash,error_code,expires_at FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [ids])).rows;
    for (const row of rows) {
      const declared = policy.steps.find(value => value.requestId === row.id);
      const owner = declared?.actor === 'doctor' ? policy.doctor : declared?.actor === 'patient' ? policy.patient : null;
      if (!declared || !owner || row.source_wallet !== owner.address || row.actor_user_id !== owner.userId || row.wallet_id !== owner.walletId ||
          row.contract_id !== CLINICAL_ID || row.network !== 'testnet' || row.action !== declared.action || row.method !== declared.action) throw Error('clinical_rehearsal_budget_unavailable');
      assertClinicalRehearsalExpected(policy, declared, owner, row.expected);
      const inner = TransactionBuilder.fromXDR(row.unsigned_xdr, Networks.TESTNET);
      if (!(inner instanceof Transaction)) throw Error('clinical_rehearsal_budget_unavailable');
      assertClinicalUnsigned(inner, owner.address, row.action, row.expected);
      if (row.signed_xdr) assertClinicalSavedEnvelope(row, { historical: true });
    }
    const authorizationRows = policy.completionContinuation ? (await client.query('SELECT id,state,action,method,doctor_id,doctor_user_id,doctor_email,wallet_id,wallet,contract_id,network,requested_by,requested_email,dossier_id,expected_version,target_version,valid_until,commitment,prepared_xdr,transaction_hash,error_code FROM doctor_authorization_requests WHERE id=$1', [policy.authorization.requestId])).rows : undefined;
    const authorizationReservations = policy.completionContinuation ? (await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1', [policy.authorization.requestId])).rows : undefined;
    // The shared authority boundary resolves only schema14 retained receipts.
    // Pass the original transport and approved object through without a browser fallback.
    const chain = receipt ? null : createClinicalWebChain();
    await assertRehearsalAggregateExposure(policy, { step, rows, ...(authorizationRows ? { authorizationRows, authorizationReservations } : {}),
      candidate: { unsignedXdr: unsigned.toXDR(), offeredFeeStroops: clinicalWebFeeQuote(unsigned).sponsored },
      receipt: receipt ?? (hash => chain!.receipt(hash)) });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['clinical_rehearsal_budget_exceeded','clinical_rehearsal_order_conflict','clinical_rehearsal_expired','signature_request_expired'].includes(code)) throw new PrivateFlowError(code, 409);
    if (error instanceof PrivateFlowError && code === 'clinical_rehearsal_scope_rejected') throw error;
    throw new PrivateFlowError('clinical_rehearsal_budget_unavailable', 503);
  }
}
