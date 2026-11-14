import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { neon } from '@neondatabase/serverless';
import { PrivyClient } from '@privy-io/server-auth';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { checkClinicalWebRelayerBudget } from '../lib/clinical-web-fee-policy.mjs';
import { createClinicalWebAuditor, WEB_CLINICAL_CONTRACT, webClinicalHistoryId } from '../lib/clinical-web-receipt-audit.mjs';
import { PRIVATE_RX_AUTHORITY, PRIVATE_RX_CONTRACT_ID, loadHostedPrivateRxScope } from '../lib/digital-cabs-rx-scope.mjs';
import { assertHostedCaptureOperator, readHostedCaptureActive, readHostedCaptureBySha } from '../lib/hosted-capture-store.mjs';
import { PRIVATE_REGISTRY_ID, readAuthorization } from '../lib/private-registry.mjs';
import { assertCurrentPrivyIdentity, PRIVY_APP_ID } from '../lib/private-worker-runtime.mjs';

const hex = /^(?!0{64}$)[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
const doctorEmail = 'cabscryptocontacto@gmail.com';
const check = (condition, code) => { if (!condition) throw Error(code); };
const fixtures = {
  note: { title: 'First visit note',
    text: "Synthetic note for the TrustLeaf Testnet demo. The doctor opened the patient's clinical record with permission and added this first entry.",
    eventDate: null },
  pdf: { fileName: 'synthetic-clinical-demo.pdf', mediaType: 'application/pdf', byteLength: 964,
    sha256: 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c' },
};

async function identity(provider, client, email, label) {
  const user = await provider.getUserByEmail(email);
  check(user?.id, `hosted_${label}_privy_login_required`);
  const wallets = user.linkedAccounts.filter(account => account.type === 'wallet' && account.chainType === 'stellar');
  check(wallets.length === 1 && wallets[0].id, `hosted_${label}_wallet_unverified`);
  const { id: walletId, address } = wallets[0];
  const actor = { userId: user.id, walletId, address };
  await assertCurrentPrivyIdentity(provider, { ...actor, email });
  const { rows } = await client.query(`SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings
    WHERE app_id=$1 AND (user_id=$2 OR address=$3)`, [PRIVY_APP_ID, actor.userId, address]);
  check(rows.length === 1 && rows[0].user_id === actor.userId && rows[0].wallet_id === walletId &&
    rows[0].address === address, `hosted_${label}_binding_unverified`);
  return actor;
}

async function rehearsalPair(client, configured, server) {
  const patientEmail = configured.TRUSTLEAF_HOSTED_CAPTURE_PATIENT_EMAIL?.trim().toLowerCase();
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail ?? '') && patientEmail !== doctorEmail &&
    patientEmail !== 'digitalmoneychile8@gmail.com' && configured.PRIVY_APP_ID === PRIVY_APP_ID && configured.PRIVY_APP_SECRET,
    'hosted_pair_configuration_unverified');
  const provider = new PrivyClient(PRIVY_APP_ID, configured.PRIVY_APP_SECRET);
  const [doctor, patient] = await Promise.all([
    identity(provider, client, doctorEmail, 'doctor'), identity(provider, client, patientEmail, 'patient'),
  ]);
  const relayer = configured.TRUSTLEAF_HOSTED_CAPTURE_RELAYER;
  check(Keypair.fromPublicKey(relayer).publicKey() === relayer &&
    new Set([patient.address, doctor.address, relayer, PRIVATE_RX_AUTHORITY]).size === 4 &&
    patient.userId !== doctor.userId && patient.walletId !== doctor.walletId, 'hosted_pair_not_distinct');
  const { rows } = await client.query(`SELECT d.id,d.status,o.id AS onboarding_id,o.state,o.privy_user_id,o.wallet_id,o.wallet,
      r.state AS request_state,r.transaction_hash,r.onboarding_submission_id,o.current_submission_id
    FROM doctors d LEFT JOIN LATERAL (SELECT * FROM doctor_onboarding_requests x WHERE x.doctor_id=d.id
      ORDER BY x.created_at DESC,x.id DESC LIMIT 1) o ON TRUE
    LEFT JOIN doctor_authorization_requests r ON r.id=o.authorization_request_id WHERE lower(d.email)=$1`, [doctorEmail]);
  const row = rows[0], doctorId = Number(row?.id);
  check(rows.length === 1 && Number.isSafeInteger(doctorId) && doctorId > 0 && row.status === 'active' &&
    (!row.onboarding_id || row.state === 'authorized' && row.privy_user_id === doctor.userId &&
      row.wallet_id === doctor.walletId && row.wallet === doctor.address && row.request_state === 'confirmed' &&
      hex.test(row.transaction_hash) && !!row.current_submission_id &&
      row.current_submission_id === row.onboarding_submission_id), 'hosted_doctor_profile_unverified');
  const auth = await readAuthorization({ wallet: doctor.address, source: PRIVATE_RX_AUTHORITY,
    registryId: PRIVATE_REGISTRY_ID, expectedAdmin: PRIVATE_RX_AUTHORITY, server });
  check(auth.authorized && auth.authorization?.version === 1 && auth.authorization.valid_until > now() + 600,
    'hosted_doctor_authorization_unverified');
  return { patient, doctor, relayer, doctorId, historyId: webClinicalHistoryId(patient.address), doctorValidUntil: auth.authorization.valid_until };
}

async function verifyEmpty(client, server, pair) {
  const patient = pair.patient;
  const { rows: [state] } = await client.query(`SELECT
    EXISTS(SELECT 1 FROM clinical_web_histories WHERE network='testnet' AND contract_id=$1 AND (owner_user_id=$2 OR patient_wallet=$3)) AS history,
    EXISTS(SELECT 1 FROM clinical_web_operations WHERE network='testnet' AND contract_id=$1 AND (actor_user_id=$2 OR source_wallet=$3)) AS intent,
    EXISTS(SELECT 1 FROM private_operations WHERE source_wallet=$3 AND state IN ('awaiting_signature','submitted')) AS rx,
    EXISTS(SELECT 1 FROM clinical_transaction_attempts WHERE source_wallet=$3 AND state IN ('prepared','submitted')) AS legacy`,
  [WEB_CLINICAL_CONTRACT, patient.userId, patient.address]);
  check(state && !state.history && !state.intent && !state.rx && !state.legacy, 'hosted_patient_sql_not_empty');
  const accountKey = xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(patient.address).xdrPublicKey() }));
  const account = await server.getLedgerEntries(accountKey);
  check(account.entries.length === 1 && account.entries[0].key.toXDR().equals(accountKey.toXDR()), 'hosted_patient_testnet_funding_required');
  const probe = new TransactionBuilder(new Account(PRIVATE_RX_AUTHORITY, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(WEB_CLINICAL_CONTRACT).call('get_history_for_patient', new Address(patient.address).toScVal()))
    .setTimeout(60).build();
  const result = await server.simulateTransaction(probe);
  check(rpc.Api.isSimulationError(result) && !('restorePreamble' in result) && result.latestLedger >= account.latestLedger &&
    /^\s*(?:HostError:\s*)?Error\(Contract,\s*#1\)(?:\s|$)/.test(result.error), 'hosted_patient_history_absence_unverified');
  await checkClinicalWebRelayerBudget(server, pair.relayer);
}

async function readClinicalResult(client, run, id, action) {
  const { rows } = await client.query(`SELECT o.transaction_hash,o.expected FROM clinical_web_operations o
      JOIN sponsorship_reservations s ON s.request_id=o.id AND s.network=o.network
    WHERE o.id=$1 AND o.action=$2 AND o.network='testnet' AND o.contract_id=$3 AND o.state='confirmed'
      AND o.expected->>'historyId'=$4 AND o.expected->>'patient'=$5
      AND s.state='settled' AND s.transaction_hash=o.transaction_hash AND s.payload->>'outcome'='SUCCESS'`,
  [id, action, WEB_CLINICAL_CONTRACT, run.historyId, run.patient.address]);
  check(rows.length === 1 && hex.test(rows[0].transaction_hash), 'hosted_clinical_predecessor_unverified');
  return rows[0];
}

async function manifest(mode, client, configured, server) {
  const openedAt = now();
  const active = await readHostedCaptureActive(client);
  if (mode === 'preflight' || mode === 'create') {
    check(!active, 'hosted_capture_run_already_open');
    const { doctorValidUntil, ...pair } = await rehearsalPair(client, configured, server);
    // This preflight queries the canonical contracts and performs no signing.
    const auditor = createClinicalWebAuditor({ server, relayer: pair.relayer });
    await verifyEmpty(client, server, pair);
    await auditor.preflight({ patient: pair.patient.address, doctor: { id: pair.doctorId, address: pair.doctor.address } });
    if (mode === 'preflight') return { network: 'testnet', patientReady: true, doctorId: pair.doctorId,
      doctorValidUntil: new Date(doctorValidUntil * 1000).toISOString() };
    return { schemaVersion: 1, phase: 'create', runId: randomUUID(), openedAt, until: openedAt + 600,
      network: 'testnet', ...pair, requestId: randomUUID() };
  }
  const predecessor = { 'grant-note': 'create', pdf: 'grant-note', close: 'issuance' }[mode];
  check(active?.phase === predecessor && active.approvalSha256 === active.sha256, 'hosted_capture_predecessor_unverified');
  const prior = JSON.parse(active.bytes.toString('utf8'));
  if (mode === 'grant-note') {
    await readClinicalResult(client, active, prior.requestId, 'create_history');
    const auth = await readAuthorization({ wallet: active.doctor.address, source: PRIVATE_RX_AUTHORITY,
      registryId: PRIVATE_REGISTRY_ID, expectedAdmin: PRIVATE_RX_AUTHORITY, server });
    const doctorValidUntil = auth.authorization?.valid_until;
    check(auth.authorized && auth.authorization?.version === 1 && doctorValidUntil > openedAt + 60, 'hosted_doctor_authorization_unverified');
    return { schemaVersion: 1, runId: randomUUID(), openedAt, until: Math.min(openedAt + 3600, doctorValidUntil - 1),
      network: 'testnet', contractId: WEB_CLINICAL_CONTRACT, registryId: PRIVATE_REGISTRY_ID, relayer: active.relayer,
      patient: active.patient, doctor: active.doctor, historyId: active.historyId, doctorId: active.doctorId,
      doctorValidUntil, grantRequestId: randomUUID(), noteRequestId: randomUUID(), note: fixtures.note };
  }
  if (mode === 'pdf') {
    const [grant, note] = await Promise.all([
      readClinicalResult(client, active, prior.grantRequestId, 'set_permissions'),
      readClinicalResult(client, active, prior.noteRequestId, 'append_version'),
    ]);
    return { ...prior, runId: randomUUID(), openedAt, until: Math.min(openedAt + 900, prior.doctorValidUntil - 1),
      pdfRequestId: randomUUID(), grantTransactionHash: grant.transaction_hash, noteTransactionHash: note.transaction_hash, pdf: fixtures.pdf };
  }
  const issuance = loadHostedPrivateRxScope(active, { historical: true });
  check(issuance?.phase === 'issuance' && active.baseSha256 && active.baseBytes && sha(active.baseBytes) === active.baseSha256,
    'hosted_capture_closure_unverified');
  const pdf = JSON.parse(active.baseBytes.toString('utf8'));
  check(openedAt >= pdf.until && pdf.doctorValidUntil > openedAt + 60, 'hosted_capture_closure_window_unavailable');
  const note = await readClinicalResult(client, active, pdf.noteRequestId, 'append_version');
  const attachment = await readClinicalResult(client, active, pdf.pdfRequestId, 'append_version');
  const { rows: [prescription] } = await client.query(`SELECT o.transaction_hash FROM private_operations o
    JOIN private_prescriptions p ON p.id=o.prescription_id AND p.transaction_hash=o.transaction_hash
    WHERE o.id=$1 AND p.id=$2 AND o.action='mint' AND o.state='confirmed' AND p.state='confirmed' AND p.contract_id=$3
      AND p.network='testnet' AND p.patient_wallet=$4 AND p.doctor_wallet=$5`,
  [issuance.steps.mint.requestId, issuance.prescriptionId, PRIVATE_RX_CONTRACT_ID, active.patient.address, active.doctor.address]);
  check(hex.test(note.expected?.entryId) && hex.test(note.expected?.commitment) &&
    hex.test(prescription?.transaction_hash ?? ''), 'hosted_capture_closure_unverified');
  return { schemaVersion: 2, runId: randomUUID(), openedAt, until: Math.min(openedAt + 3600, pdf.doctorValidUntil - 1),
    basePdfScopeSha256: active.baseSha256, pdfTransactionHash: attachment.transaction_hash,
    correction: { requestId: randomUUID(), operationId: randomBytes(32).toString('hex'),
      entryId: note.expected.entryId, previousCommitment: note.expected.commitment, note: { ...pdf.note, prescriptionId: issuance.prescriptionId } },
    revocation: { requestId: randomUUID(), operationId: randomBytes(32).toString('hex') } };
}

try {
  const [envFlag, envFile, dirFlag, directory, mode, ...extra] = process.argv.slice(2);
  check(envFlag === '--env-file' && envFile && dirFlag === '--artifacts-dir' && directory &&
    ['preflight', 'create', 'grant-note', 'pdf', 'close'].includes(mode) && !extra.length, 'hosted_capture_preparer_arguments');
  const configured = parseEnv(readFileSync(realpathSync(envFile), 'utf8'));
  const { connectionString } = assertHostedCaptureOperator(configured);
  const artifacts = realpathSync(directory);
  const sql = neon(connectionString, { fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  const client = { query: async (query, values) => ({ rows: await sql.query(query, values) }) };
  const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 20_000 });
  check((await server.getNetwork()).passphrase === Networks.TESTNET, 'hosted_capture_network_unverified');
  const result = await manifest(mode, client, configured, server);
  if (mode === 'preflight') console.log(JSON.stringify(result));
  else {
    check(result.until > now(), 'hosted_capture_preparer_expired');
    const bytes = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    const filename = 'hosted-' + mode + '-' + result.runId + '.private.json';
    writeFileSync(join(artifacts, filename), bytes, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ phase: mode, filename, sha256: sha(bytes), until: new Date(result.until * 1000).toISOString() }));
  }
} catch (error) {
  console.error(JSON.stringify({ error: /^hosted_[a-z_]+$/.test(error?.message) ? error.message : 'hosted_capture_preparer_unavailable' }));
  process.exitCode = 1;
}
