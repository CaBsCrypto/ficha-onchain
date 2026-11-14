import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PoolClient } from '@neondatabase/serverless';
import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { assertClinicalSavedEnvelope, createClinicalWebChain, type ClinicalSavedEnvelope } from '@/lib/clinical/chain';
import { clinicalKeyring } from '@/lib/clinical/keys';
import { CLINICAL_ID } from '@/lib/clinical/config';
import { encryptionKey, prescriptionView, storageContext } from '@/lib/private-prescriptions';
import { createPrivateChain } from '@/lib/stellar/private-chain';
import { PrivateFlowError, RX_PRIVATE } from '@/lib/private-config';
import type { ClinicalActor } from '@/types/clinical';
import { openClinicalVersion } from '../../scripts/lib/clinical-crypto.mjs';
import { DIGITAL_CABS_RX_DOCUMENT, loadHostedPrivateRxScope } from '../../scripts/lib/digital-cabs-rx-scope.mjs';
import { readHostedCaptureByRequest, readHostedCaptureBySha, type HostedCaptureSnapshot } from '../../scripts/lib/hosted-capture-store.mjs';
import { decryptPrescription, prescriptionCommitment } from '../../scripts/lib/private-prescription.mjs';
import { createPrivateRxSponsorship } from '../../scripts/lib/private-rx-sponsorship.mjs';
import { decodeSponsorshipReservation } from '../../scripts/lib/sponsorship-sql-store.mjs';

type BaselinePhase = 'pdf' | 'appointment' | 'close';
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const hex = /^(?!0{64}$)[a-f0-9]{64}$/;
const pdfFixture = Object.freeze({
  fileName: 'synthetic-clinical-demo.pdf', mediaType: 'application/pdf', byteLength: 964,
  sha256: 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c',
});
const noteFixture = Object.freeze({
  title: 'First visit note',
  text: "Synthetic note for the TrustLeaf Testnet demo. The doctor opened the patient's clinical record with permission and added this first entry.",
  eventDate: null,
});
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PrivateFlowError(code, 409);
}
type Chain = ReturnType<typeof createClinicalWebChain>;

async function settledOperation(client: PoolClient, chain: Chain, scope: HostedCaptureSnapshot,
  actor: ClinicalActor, id: string, action: 'append_version' | 'set_permissions' | 'create_history') {
  const { rows } = await client.query(`SELECT o.*,s.request_id,s.utc_day::text,s.state AS reservation_state,
    s.transaction_hash AS reservation_hash,s.payload FROM clinical_web_operations o
    JOIN sponsorship_reservations s ON s.request_id=o.id AND s.network=o.network WHERE o.id=$1`, [id]);
  const row = rows[0];
  check(rows.length === 1 && row?.network === 'testnet' && row.contract_id === CLINICAL_ID &&
    row.state === 'confirmed' && row.action === action && row.actor_user_id === actor.userId &&
    row.wallet_id === actor.walletId && row.source_wallet === actor.address && hex.test(row.transaction_hash) &&
    row.expected?.patient === scope.patient.address && row.expected?.historyId === scope.historyId,
    'hosted_capture_clinical_receipt_unverified');
  const reservation = decodeSponsorshipReservation({
    request_id: row.request_id, network: row.network, utc_day: row.utc_day,
    state: row.reservation_state, transaction_hash: row.reservation_hash, payload: row.payload,
  });
  const outer = assertClinicalSavedEnvelope(row as ClinicalSavedEnvelope, { historical: true });
  const receipt = await chain.receipt(row.transaction_hash);
  check(receipt.status === rpc.Api.GetTransactionStatus.SUCCESS &&
    receipt.envelopeXdr?.toXDR('base64') === row.signed_xdr && outer.feeSource === scope.relayer &&
    reservation.state === 'settled' && reservation.outcome === 'SUCCESS' && reservation.transactionHash === row.transaction_hash &&
    reservation.binding.actorId === actor.userId && reservation.binding.walletId === actor.walletId &&
    reservation.binding.sourceAddress === actor.address && reservation.binding.patientAddress === scope.patient.address &&
    reservation.binding.sponsorAddress === scope.relayer && reservation.binding.action === action &&
    reservation.binding.contractId === CLINICAL_ID &&
    reservation.binding.encounterId === (action === 'append_version' ? row.expected.entryId : undefined) &&
    reservation.ledger === receipt.ledger && reservation.chargedStroops === receipt.resultXdr.feeCharged().toString() &&
    reservation.quote.unsignedHash === hash(row.unsigned_xdr) && reservation.signedInnerDigest === hash(outer.innerTransaction.toXDR()) &&
    reservation.quote.offeredFeeStroops === outer.fee && BigInt(outer.fee) <= BigInt(10_000_000),
    'hosted_capture_clinical_settlement_unverified');
  await chain.verifyRecordedOperation(action, row.expected);
  return { row, hash: row.transaction_hash as string, ledger: receipt.ledger };
}

async function contribution(client: PoolClient, chain: Chain, scope: HostedCaptureSnapshot, id: string, pdf: boolean) {
  const { row, hash: receiptHash, ledger } = await settledOperation(client, chain, scope, scope.doctor, id, 'append_version');
  const expected = row.expected;
  check(expected.author === scope.doctor.address && expected.expectedVersion === 0 && expected.expectedGrantRevision === 1 &&
    expected.previousCommitment === null && hex.test(expected.entryId) && hex.test(expected.commitment), 'hosted_capture_contribution_unverified');
  const head = await chain.entry(scope.historyId, expected.entryId);
  const version = await chain.version(scope.historyId, expected.entryId, 1);
  const { rows } = await client.query(`SELECT context,commitment,envelope,operation_id,state,transaction_hash FROM clinical_private_versions
    WHERE network='testnet' AND contract_id=$1 AND history_id=$2 AND entry_id=$3 AND version=1`,
  [CLINICAL_ID, scope.historyId, expected.entryId]);
  const stored = rows[0];
  check(head?.headVersion === 1 && head.author === scope.doctor.address && version.context.author === scope.doctor.address &&
    version.commitment === expected.commitment && rows.length === 1 && stored.state === 'confirmed' &&
    stored.operation_id === expected.operationId && stored.transaction_hash === receiptHash &&
    stored.commitment === version.commitment && isDeepStrictEqual(stored.context, version.context), 'hosted_capture_contribution_unverified');
  const decoded = openClinicalVersion({ envelope: stored.envelope, expectedContext: version.context,
    expectedCommitment: version.commitment, keyring: clinicalKeyring().keyring });
  try {
    const valid = pdf
      ? decoded.metadata.fileName === pdfFixture.fileName && decoded.metadata.mediaType === pdfFixture.mediaType &&
        decoded.content.byteLength === pdfFixture.byteLength && hash(decoded.content) === pdfFixture.sha256
      : decoded.metadata.fileName === 'antecedente.json' && decoded.metadata.mediaType === 'application/json' &&
        isDeepStrictEqual(JSON.parse(decoded.content.toString('utf8')), noteFixture);
    check(valid, 'hosted_capture_content_unverified');
  } finally {
    decoded.content.fill(0);
  }
  return { transactionHash: receiptHash, ledger, entryId: expected.entryId as string, commitment: version.commitment };
}

async function verifyPrescription(client: PoolClient, snapshot: HostedCaptureSnapshot, prescriptionId: string) {
  const predecessor = snapshot.predecessorSha256 && await readHostedCaptureBySha(client, snapshot.predecessorSha256);
  check(predecessor, 'hosted_capture_issuance_unverified');
  const mintRequestId: unknown = JSON.parse(predecessor.bytes.toString('utf8'))?.steps?.mint?.requestId;
  check(typeof mintRequestId === 'string', 'hosted_capture_issuance_unverified');
  const issuance = await readHostedCaptureByRequest(client, mintRequestId);
  check(issuance?.phase === 'issuance' && issuance.sha256 === predecessor.sha256 && issuance.approvalSha256 === issuance.sha256,
    'hosted_capture_issuance_unverified');
  const scope = loadHostedPrivateRxScope({ ...issuance, phase: 'issuance', approvalSha256: issuance.sha256 }, { historical: true });
  check(scope?.phase === 'issuance' && scope.prescriptionId === prescriptionId, 'hosted_capture_issuance_unverified');
  const { rows } = await client.query(`SELECT o.expected,o.unsigned_xdr,o.signed_xdr,o.transaction_hash,
      p.id,p.rx_id::text,p.appointment_id,p.issuance_id,p.patient_wallet,p.doctor_wallet,p.state,p.expires_at,p.commitment,p.ciphertext
    FROM private_operations o JOIN private_prescriptions p ON p.id=o.prescription_id AND p.appointment_id=o.appointment_id
    JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id AND b.issuance_id=p.issuance_id
    JOIN appointments a ON a.id=p.appointment_id
    WHERE o.id=$1 AND p.id=$2 AND p.appointment_id=$3 AND p.issuance_id=$4 AND p.contract_id=$5 AND p.network='testnet'
    AND o.contract_id=$5 AND o.action='mint' AND o.method='mint_prescription' AND o.state='confirmed'
    AND p.state='confirmed' AND p.transaction_hash=o.transaction_hash AND p.patient_wallet=$6 AND p.doctor_wallet=$7
    AND b.contract_id=$5 AND b.network='testnet' AND b.state='consumed' AND b.patient_wallet=$6 AND b.doctor_wallet=$7
    AND b.patient_requested_by=$8 AND b.doctor_user_id=$9 AND b.patient_wallet_id=$10 AND b.doctor_wallet_id=$11
    AND o.actor_user_id=$9 AND o.wallet_id=$11 AND o.source_wallet=$7 AND b.valid_until=$12
    AND a.patient_user_id=$8 AND a.doctor_user_id=$9 AND a.patient_wallet=$6 AND a.doctor_wallet=$7
    AND a.patient_wallet_id=$10 AND a.doctor_wallet_id=$11 AND a.doctor_id=$13
    AND a.date=$14::date AND a.time_slot=$15 AND a.type=$16`,
  [scope.steps.mint.requestId, scope.prescriptionId, scope.appointmentId, scope.issuanceId, RX_PRIVATE,
    scope.patient.address, scope.doctor.address, scope.patient.userId, scope.doctor.userId, scope.patient.walletId,
    scope.doctor.walletId, scope.bookingValidUntil, scope.doctorId, scope.slot.date, scope.slot.timeSlot, scope.slot.type]);
  const row = rows[0];
  check(rows.length === 1 && row.expected?.rxScopeSha256 === scope.policyHash && hex.test(row.transaction_hash) &&
    row.expected.commitment === row.commitment && Number(row.expires_at) === row.expected.expiresAt, 'hosted_capture_issuance_unverified');
  const chain = createPrivateChain();
  await chain.verifyDeployment();
  const receipt = await chain.receipt(row.transaction_hash);
  const sponsor = createPrivateRxSponsorship({ scope, client });
  const verified = await sponsor.reconcile('mint', row.unsigned_xdr, row.expected, row.signed_xdr, row.transaction_hash, receipt, { readOnly: true });
  const holds = await client.query(`SELECT request_id,network,utc_day::text,state,transaction_hash,payload
    FROM sponsorship_reservations WHERE request_id=$1`, [scope.steps.mint.requestId]);
  const hold = holds.rows.length === 1 ? decodeSponsorshipReservation(holds.rows[0]) : null;
  check(receipt.status === rpc.Api.GetTransactionStatus.SUCCESS && verified?.status === 'SUCCESS' &&
    String(scValToNative(receipt.returnValue!)) === row.rx_id && hold?.state === 'settled' && hold.outcome === 'SUCCESS' &&
    hold.transactionHash === row.transaction_hash && hold.ledger === verified.ledger && hold.chargedStroops === verified.feeChargedStroops,
    'hosted_capture_issuance_unverified');
  const actual = await prescriptionView(row, row, chain);
  const clear = decryptPrescription(row.ciphertext, encryptionKey(), storageContext(prescriptionId));
  check(actual.status === 'Registered' && !actual.expired && clear.network === 'testnet' && clear.contractId === RX_PRIVATE &&
    clear.patient === scope.patient.address && clear.doctor === scope.doctor.address && clear.issuanceId === scope.issuanceId &&
    clear.expiresAt === Number(row.expires_at) && isDeepStrictEqual(clear.document, DIGITAL_CABS_RX_DOCUMENT) &&
    prescriptionCommitment(clear) === row.commitment, 'hosted_capture_prescription_content_unverified');
  return { transactionHash: row.transaction_hash as string, ledger: verified.ledger };
}

export async function verifyHostedClinicalBaseline(client: PoolClient, scope: HostedCaptureSnapshot, phase: BaselinePhase) {
  check(scope.phase === phase && scope.baseBytes && scope.baseSha256 && hash(scope.baseBytes) === scope.baseSha256,
    'hosted_capture_baseline_unverified');
  const plan = JSON.parse(scope.baseBytes.toString('utf8'));
  check(plan.historyId === scope.historyId && isDeepStrictEqual(plan.patient, scope.patient) && isDeepStrictEqual(plan.doctor, scope.doctor) &&
    plan.relayer === scope.relayer && plan.doctorId === scope.doctorId && plan.network === 'testnet' && plan.contractId === CLINICAL_ID &&
    isDeepStrictEqual(plan.note, noteFixture), 'hosted_capture_baseline_unverified');
  const chain = createClinicalWebChain();
  const authorization = await chain.doctorAuthorization(scope.doctor.address);
  check(authorization.version === 1 && !authorization.revoked && authorization.validUntil === plan.doctorValidUntil &&
    authorization.validUntil > Math.floor(Date.now() / 1000), 'hosted_capture_authorization_unverified');
  const grant = await chain.grant(scope.historyId, scope.doctor.address);
  check(grant?.revision === 1 && grant.canRead && grant.canAppend, 'hosted_capture_grant_unverified');
  const grantReceipt = await settledOperation(client, chain, scope, scope.patient, plan.grantRequestId, 'set_permissions');
  const grantExpected = grantReceipt.row.expected;
  check(grantExpected.doctor === scope.doctor.address && grantExpected.doctorId === scope.doctorId &&
    grantExpected.canRead === true && grantExpected.canAppend === true && grantExpected.expectedRevision === 0, 'hosted_capture_grant_unverified');
  const note = await contribution(client, chain, scope, plan.noteRequestId, false);
  const next = JSON.parse(scope.bytes.toString('utf8'));
  const pdfPlan = phase === 'pdf' ? next : plan;
  check(isDeepStrictEqual(pdfPlan.pdf, pdfFixture) && pdfPlan.grantRequestId === plan.grantRequestId &&
    pdfPlan.noteRequestId === plan.noteRequestId && pdfPlan.grantTransactionHash === grantReceipt.hash &&
    pdfPlan.noteTransactionHash === note.transactionHash, 'hosted_capture_baseline_unverified');
  const pdf = phase === 'pdf' ? null : await contribution(client, chain, scope, plan.pdfRequestId, true);
  let prescription = null;
  if (phase === 'close') {
    check(pdf && next.pdfTransactionHash === pdf.transactionHash && next.correction?.entryId === note.entryId &&
      next.correction?.previousCommitment === note.commitment && typeof next.correction?.note?.prescriptionId === 'string' &&
      isDeepStrictEqual(next.correction.note, { ...noteFixture, prescriptionId: next.correction.note.prescriptionId }),
      'hosted_capture_closure_unverified');
    prescription = await verifyPrescription(client, scope, next.correction.note.prescriptionId);
  }
  return { grant: { transactionHash: grantReceipt.hash, ledger: grantReceipt.ledger }, note, pdf, prescription };
}
