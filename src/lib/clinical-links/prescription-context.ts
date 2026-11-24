import { Address, Contract, FeeBumpTransaction, Keypair, Networks, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';
import type { PoolClient } from '@neondatabase/serverless';
import { PrivateFlowError } from '@/lib/private-config';
import type { PrivateRow } from '@/lib/private-prescriptions';
import { appointmentStartedByDoctorSql } from '@/lib/prescription-booking';
import type { createPrivateChain } from '@/lib/stellar/private-chain';
import { createClinicalContractAuditor, PRIVATE_PRESCRIPTION_WASM_HASH } from '../../../scripts/lib/clinical-contract-audit.mjs';
import { privateRxPartnerContext, type PrivateRxOperationScope } from '../../../scripts/lib/digital-cabs-rx-scope.mjs';
import { verifyPrivateRxReceipt } from '../../../scripts/lib/private-rx-sponsorship.mjs';
import { PARTNER_PRESCRIPTION_CUSTODY } from '../../../scripts/lib/clinical-links-mint-policy.mjs';

/** Recheck the original shared-account grant and PDF commitment under the
 * appointment lock. Receipt-only reconciliation can finish after expiry. */
export async function assertPartnerRxContext(client: PoolClient, scope: PrivateRxOperationScope, booking: PrivateRow, prescription?: PrivateRow) {
  const partner = privateRxPartnerContext(scope);
  if (!partner) {
    if (prescription?.ciphertext === PARTNER_PRESCRIPTION_CUSTODY) throw new PrivateFlowError('partner_prescription_required', 403);
    return;
  }
  const { rows } = await client.query(`SELECT g.status, g.expires_at > now() AS grant_current, p.active,
      (a.status='in_progress' AND (${appointmentStartedByDoctorSql})) AS appointment_current
    FROM clinical_partner_prescriptions m
    JOIN clinical_partner_bindings g ON g.binding_id=m.binding_id AND g.partner_id=m.partner_id
    JOIN clinical_link_partners p ON p.partner_id=m.partner_id
    JOIN appointments a ON a.id=m.appointment_id
    WHERE m.id=$1 AND m.appointment_id=$2 AND m.issuance_id=$3 AND m.consultation_ref=$4
      AND m.binding_id=$5 AND m.partner_id=$6 AND m.commitment=$7
      AND m.patient_user_id=$8 AND m.doctor_user_id=$9 AND g.patient_user_id=m.patient_user_id
      AND g.shared_identity AND g.partner_patient_ref=m.partner_patient_ref
      AND m.consent_request_id=$10 AND m.mint_request_id=$11 AND m.expires_at=$12
    FOR SHARE OF m, g, p`, [scope.prescriptionId, scope.appointmentId, scope.issuanceId, partner.consultationRef, partner.bindingId,
    partner.partnerId, partner.commitment, scope.patient.userId, scope.doctor.userId, scope.steps.consent.requestId, scope.steps.mint.requestId, partner.expiresAt]);
  const grant = rows[0];
  if (!grant || (!partner.historical && (grant.status !== 'active' || !grant.grant_current || !grant.active || !grant.appointment_current)) ||
      booking.attestation_hash !== partner.attestationHash || !prescription || prescription.commitment !== partner.commitment ||
      Number(prescription.expires_at) !== partner.expiresAt || prescription.ciphertext !== PARTNER_PRESCRIPTION_CUSTODY) {
    throw new PrivateFlowError('partner_prescription_unavailable', 404);
  }
}

export async function verifyPartnerRxWasm(scope: PrivateRxOperationScope, chain: ReturnType<typeof createPrivateChain>) {
  if (!privateRxPartnerContext(scope)) return;
  try {
    const audit = createClinicalContractAuditor({ server: chain.server, readerAddress: scope.authority });
    await audit.network();
    await audit.verifyWasm(scope.contractId, PRIVATE_PRESCRIPTION_WASM_HASH);
  } catch {
    throw new PrivateFlowError('partner_prescription_chain_unavailable', 503);
  }
}

/** The existing Ficha booking worker has already submitted this transaction.
 * Verify it before treating the attestation as a sponsorship predecessor. */
export async function verifyPartnerRxAttestation(scope: PrivateRxOperationScope, chain: ReturnType<typeof createPrivateChain>) {
  const partner = privateRxPartnerContext(scope);
  if (!partner) return;
  try {
    const receipt = await chain.receipt(partner.attestationHash);
    if (receipt.status !== 'SUCCESS') throw Error();
    const outer = TransactionBuilder.fromXDR(receipt.envelopeXdr.toXDR('base64'), Networks.TESTNET);
    if (!(outer instanceof FeeBumpTransaction) || outer.hash().toString('hex') !== partner.attestationHash) throw Error();
    const inner = outer.innerTransaction;
    const expected = new Contract(scope.contractId).call('attest_booking', new Address(scope.doctor.address).toScVal(),
      new Address(scope.patient.address).toScVal(), nativeToScVal(Buffer.from(scope.issuanceId, 'hex')),
      nativeToScVal(BigInt(scope.bookingValidUntil), { type: 'u64' }));
    const [operation] = inner.operations;
    if (inner.operations.length !== 1 || operation.type !== 'invokeHostFunction' || (operation.source && operation.source !== scope.authority) ||
        inner.source !== scope.authority || !operation.func.toXDR().equals(expected.body().invokeHostFunctionOp().hostFunction().toXDR()) ||
        !inner.signatures.some(value => Keypair.fromPublicKey(scope.authority).verify(inner.hash(), value.signature()))) throw Error();
    verifyPrivateRxReceipt(receipt, outer, partner.attestationHash);
  } catch {
    throw new PrivateFlowError('partner_prescription_attestation_unavailable', 503);
  }
}
