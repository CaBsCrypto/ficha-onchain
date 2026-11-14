import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readDemoInputsOrExit, requiredDemoDigest } from './demo-inputs.mjs';
import { isDeepStrictEqual, promisify } from 'node:util';
import { databaseConnectionString } from '../lib/database-connection.mjs';
import { clinicalSimulationIsLive } from '../lib/clinical-live-read.mjs';
import { clinicalRpcUrl } from '../lib/clinical-rpc.mjs';
import { loadPrivateRxScope } from '../lib/digital-cabs-rx-scope.mjs';
import { decryptPrescription, prescriptionCommitment } from '../lib/private-prescription.mjs';
import { createPrivateRxSponsorship } from '../lib/private-rx-sponsorship.mjs';
import { decodeSponsorshipReservation } from '../lib/sponsorship-sql-store.mjs';

const require = createRequire(import.meta.url);
const { args, envFile, artifactsDir, configured, privateFile: localFile } = readDemoInputsOrExit();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const epoch = () => Math.floor(Date.now() / 1000);
const check = (condition, reason) => { if (!condition) throw new Error(reason); };

async function auditBaseline(base, basePdfScopeSha256, pdfTransactionHash) {
  const auditScript = fileURLToPath(new URL('./auditar-toma-digital-cabs.mjs', import.meta.url));
  const audit = await promisify(execFile)(process.execPath, [auditScript, '--env-file', envFile, '--artifacts-dir', artifactsDir,
    '--sha256', basePdfScopeSha256, '--pdf-scope'], { timeout: 90_000, windowsHide: true });
  const proof = JSON.parse(audit.stdout);
  check(proof.status === 'verified' && proof.steps?.grant?.hash === base.grantTransactionHash &&
    proof.steps?.note?.hash === base.noteTransactionHash && proof.steps?.pdf?.hash === pdfTransactionHash &&
    ['grant', 'note', 'pdf'].every(step => proof.steps[step]?.state === 'confirmed' && proof.steps[step]?.reservation === 'settled') &&
    proof.grant?.canRead === true && proof.grant?.canAppend === true && proof.grant?.revision === 1 &&
    proof.note?.syntheticContentVerified === true && proof.pdf?.syntheticContentVerified === true &&
    proof.inventory?.entries === 2 && proof.inventory?.versions === 2 && proof.remainingReservations === 0,
  'clinical_baseline_unverified');
}

async function readClosureEvidence(base, scope, connection, dataKey) {
  const { Pool, neonConfig } = require('@neondatabase/serverless');
  neonConfig.webSocketConstructor = require('ws');
  const { Account, BASE_FEE, Contract, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative } = require('@stellar/stellar-sdk');
  const server = new rpc.Server(clinicalRpcUrl('gateway'), { timeout: 20_000 });
  const pool = new Pool({ connectionString: connection, connectionTimeoutMillis: 15_000, query_timeout: 20_000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: noteRows } = await client.query(`SELECT o.expected AS note FROM clinical_web_operations o
      JOIN clinical_private_versions v ON v.network=o.network AND v.contract_id=o.contract_id
        AND v.history_id=o.expected->>'historyId' AND v.entry_id=o.expected->>'entryId'
        AND v.commitment=o.expected->>'commitment' AND v.operation_id=o.expected->>'operationId'
        AND v.transaction_hash=o.transaction_hash AND v.state='confirmed' AND v.version=1
      WHERE o.id=$1 AND o.transaction_hash=$2 AND o.contract_id=$3 AND o.network='testnet' AND o.state='confirmed'
        AND o.action='append_version' AND o.method=o.action AND o.actor_user_id=$4 AND o.wallet_id=$5 AND o.source_wallet=$6`,
    [base.noteRequestId, base.noteTransactionHash, base.contractId, base.doctor.userId, base.doctor.walletId, base.doctor.address]);
    const note = noteRows[0]?.note;
    check(noteRows.length === 1 && note.historyId === base.historyId && note.patient === base.patient.address &&
      note.author === base.doctor.address && note.expectedVersion === 0 && note.expectedGrantRevision === 1 &&
      hex.test(note.entryId) && hex.test(note.commitment) && note.previousCommitment === null, 'clinical_baseline_unverified');

    const { rows: rxRows } = await client.query(`SELECT o.expected,o.unsigned_xdr,o.signed_xdr,o.transaction_hash,
        p.rx_id::text,p.expires_at,p.commitment,p.ciphertext
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
    [scope.steps.mint.requestId, scope.prescriptionId, scope.appointmentId, scope.issuanceId, scope.contractId,
      scope.patient.address, scope.doctor.address, scope.patient.userId, scope.doctor.userId,
      scope.patient.walletId, scope.doctor.walletId, scope.bookingValidUntil, scope.doctorId,
      scope.slot.date, scope.slot.timeSlot, scope.slot.type]);
    const rx = rxRows[0], expiry = Number(rx?.expires_at);
    check(rxRows.length === 1 && /^[1-9][0-9]*$/.test(rx.rx_id) && Number.isSafeInteger(expiry) && expiry > epoch() &&
      hex.test(rx.commitment) && hex.test(rx.transaction_hash) && rx.expected?.rxScopeSha256 === scope.policyHash &&
      rx.expected.commitment === rx.commitment && rx.expected.expiresAt === expiry, 'confirmed_prescription_unverified');
    const clear = decryptPrescription(rx.ciphertext, dataKey,
      JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1', scope.prescriptionId, 'testnet', scope.contractId]));
    check(clear.network === 'testnet' && clear.contractId === scope.contractId && clear.issuanceId === scope.issuanceId &&
      clear.patient === scope.patient.address && clear.doctor === scope.doctor.address && clear.expiresAt === expiry &&
      isDeepStrictEqual(clear.document, scope.document) && prescriptionCommitment(clear) === rx.commitment, 'confirmed_prescription_unverified');

    check((await server.getNetwork()).passphrase === Networks.TESTNET, 'rpc_network_unverified');
    const receipt = await server.getTransaction(rx.transaction_hash);
    const sponsorship = createPrivateRxSponsorship({ scope, client });
    const mint = await sponsorship.reconcile('mint', rx.unsigned_xdr, rx.expected, rx.signed_xdr, rx.transaction_hash, receipt, { readOnly: true });
    const { rows: holds } = await client.query(
      'SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1',
      [scope.steps.mint.requestId]);
    const hold = holds.length === 1 ? decodeSponsorshipReservation(holds[0]) : null;
    check(mint?.status === 'SUCCESS' && String(scValToNative(receipt.returnValue)) === rx.rx_id && hold?.state === 'settled' &&
      hold.outcome === 'SUCCESS' && hold.transactionHash === rx.transaction_hash && hold.ledger === mint.ledger &&
      hold.chargedStroops === mint.feeChargedStroops, 'mint_receipt_unverified');

    const read = new TransactionBuilder(new Account(scope.authority, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(scope.contractId).call('get_prescription', nativeToScVal(BigInt(rx.rx_id), { type: 'u64' })))
      .setTimeout(60).build();
    const sim = await server.simulateTransaction(read);
    check(rpc.Api.isSimulationSuccess(sim) && !('restorePreamble' in sim) && !rpc.Api.isSimulationRestore(sim) &&
      clinicalSimulationIsLive(sim) && Array.isArray(sim.result?.auth) && sim.result.auth.length === 0 &&
      Number.isSafeInteger(sim.latestLedger) && sim.latestLedger >= mint.ledger, 'canonical_prescription_unverified');
    const current = scValToNative(sim.result.retval);
    const status = Array.isArray(current.status) ? current.status[0] : current.status;
    check(String(current.id) === rx.rx_id && current.doctor === scope.doctor.address && current.patient === scope.patient.address &&
      Number(current.schema_version) === 1 && Number(current.expires_at) === expiry &&
      Buffer.from(current.commitment).toString('hex') === rx.commitment && ['Registered', 'Active'].includes(status),
    'canonical_prescription_unverified');
    return { entryId: note.entryId, previousCommitment: note.commitment, mintHash: rx.transaction_hash, prescriptionStatus: status };
  } finally {
    try { if (client) await client.query('ROLLBACK'); }
    finally { client?.release(); await pool.end(); }
  }
}

try {
  const [flag, issuanceSha, ...rest] = args;
  const basePdfScopeSha256 = requiredDemoDigest(configured, 'TRUSTLEAF_DEMO_PDF_SCOPE_SHA256');
  const pdfTransactionHash = requiredDemoDigest(configured, 'TRUSTLEAF_DEMO_PDF_TX_SHA256');
  check(flag === '--issuance-sha256' && hex.test(issuanceSha) && rest.length === 0, 'approved_issuance_digest_required');
  const bytes = readFileSync(localFile('digital-cabs-pdf-scope.private.json'));
  check(digest(bytes) === basePdfScopeSha256, 'pdf_manifest_unverified');
  const base = JSON.parse(bytes.toString('utf8'));
  const connection = databaseConnectionString(configured);
  check(configured.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === base.contractId && !configured.VERCEL && !configured.VERCEL_ENV,
    'clinical_environment_unverified');
  const scope = loadPrivateRxScope({ requireApproval: false, allowExpired: true, env: {
    DATABASE_URL: connection, TRUSTLEAF_DB_HOST: configured.TRUSTLEAF_DB_HOST,
    TRUSTLEAF_ENV: configured.TRUSTLEAF_ENV, NEXT_PUBLIC_STELLAR_NETWORK: configured.NEXT_PUBLIC_STELLAR_NETWORK,
    PRIVY_APP_ID: configured.PRIVY_APP_ID, NEXT_PUBLIC_PRIVY_APP_ID: configured.NEXT_PUBLIC_PRIVY_APP_ID,
    PRESCRIPTION_PRIVATE_CONTRACT_ID: configured.PRESCRIPTION_PRIVATE_CONTRACT_ID,
    DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID: configured.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY: configured.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY,
    BOOKING_AUTHORITY_PUBLIC_KEY: configured.BOOKING_AUTHORITY_PUBLIC_KEY, TRUSTLEAF_PRIVATE_WRITES_ENABLED: 'false',
    TRUSTLEAF_DEMO_DB_HOST: configured.TRUSTLEAF_DEMO_DB_HOST,
    TRUSTLEAF_DEMO_PDF_SCOPE_SHA256: basePdfScopeSha256,
    TRUSTLEAF_DEMO_DOCTOR_ID: configured.TRUSTLEAF_DEMO_DOCTOR_ID,
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_FILE: localFile('digital-cabs-rx-issuance.private.json'),
    TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_SHA256: issuanceSha, TRUSTLEAF_DIGITAL_CABS_RX_SCOPE_APPROVED_SHA256: issuanceSha,
  } });
  check(scope?.phase === 'issuance' && hex.test(scope.attestationQuoteSha256), 'approved_issuance_unverified');
  const [, evidence] = await Promise.all([auditBaseline(base, basePdfScopeSha256, pdfTransactionHash), readClosureEvidence(base, scope, connection, configured.TRUSTLEAF_DATA_KEY)]);
  const openedAt = epoch(), until = Math.min(openedAt + 3600, base.doctorValidUntil - 1);
  check(openedAt >= base.until && until > openedAt, 'closure_window_unverified');
  const plan = { schemaVersion: 2, runId: randomUUID(), openedAt, until,
    basePdfScopeSha256, pdfTransactionHash,
    correction: { requestId: randomUUID(), operationId: randomBytes(32).toString('hex'), entryId: evidence.entryId,
      previousCommitment: evidence.previousCommitment, note: { ...base.note, prescriptionId: scope.prescriptionId } },
    revocation: { requestId: randomUUID(), operationId: randomBytes(32).toString('hex') } };
  const encoded = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(localFile('digital-cabs-close-scope.private.json'), encoded, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'closure_manifest_prepared_inactive', sha256: digest(encoded),
    until: new Date(until * 1000).toISOString(), mintHash: evidence.mintHash, prescriptionStatus: evidence.prescriptionStatus,
    sqlWrites: 0, signatures: 0, submissions: 0 }));
} catch (error) {
  const known = new Set(['approved_issuance_digest_required', 'demo_digest_required', 'pdf_manifest_unverified', 'clinical_environment_unverified',
    'approved_issuance_unverified', 'private_rx_scope_rejected', 'clinical_baseline_unverified', 'confirmed_prescription_unverified',
    'rpc_network_unverified', 'mint_receipt_unverified', 'canonical_prescription_unverified', 'closure_window_unverified', 'EEXIST']);
  const reason = error.code ?? error.message;
  console.log(JSON.stringify({ status: 'closure_manifest_not_prepared', reason: known.has(reason) ? reason : 'closure_evidence_unavailable' }));
  process.exitCode = 1;
}
