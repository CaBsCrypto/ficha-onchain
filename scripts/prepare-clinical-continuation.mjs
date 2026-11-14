/** Read-only preparation for the exact continuation of the local week-three rehearsal.
 * Remote capabilities are SELECT, existing-user/wallet lookups and unsigned getter simulations.
 * This module never approves, signs, submits, funds, restores, creates identities or changes env.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { PrivyClient } from '@privy-io/server-auth';
import { Account, Address, BASE_FEE, Contract, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { createClinicalContractAuditor } from './lib/clinical-contract-audit.mjs';
import { createClinicalChainReader } from './lib/clinical-chain-read.mjs';
import { clinicalSimulationIsLive } from './lib/clinical-live-read.mjs';
import { clinicalRpcUrl } from './lib/clinical-rpc.mjs';
import { syntheticClinicalPdf } from './lib/clinical-fixtures.mjs';
import { loadRehearsalPolicy, rehearsalMaintenanceDescriptor } from './lib/clinical-rehearsal-policy.mjs';

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const ORIGINAL_HASH = 'e94cf9ee6318f94dacb61b35a5c7569b4608ea47ef08cbf17ee2ce4c1a4937a8';
const APP = 'cmrix722m03d30clewd1fuffq';
const PINNED = [
  { name: 'ClinicalHistoryPrivate', contractId: 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U', wasm: '29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0', interfaceVersion: 1 },
  { name: 'DoctorRegistryPrivate', contractId: 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2', wasm: 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02', interfaceVersion: 1 },
  { name: 'PrescriptionPrivate', contractId: 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE', wasm: '4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c', interfaceVersion: 2 },
];
const PRIOR_HASHES = [
  '3cf5ccedbbcc8aa796662b1af869996e0a474934e7b5b62eaa78c805b318e4bb',
  '0e9798dd745f544ee70b818fb860abb78de4663fbca0e0c4c2d3454070931215',
  '43e1f8d254c4d6deba5c5c2e35f324806cfd2ea4498ddc84e52feb6e450c9f0f',
];
const READS = new Map([
  [PINNED[0].contractId, new Set(['interface_version', 'get_registry', 'get_history', 'get_grant', 'can_read', 'get_version'])],
  [PINNED[1].contractId, new Set(['interface_version', 'get_admin', 'get_authorization', 'is_authorized'])],
  [PINNED[2].contractId, new Set(['interface_version', 'get_registry', 'get_admin', 'get_booking_authority', 'get_prescription', 'is_valid'])],
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => { if (!condition) throw Error(code); };
const epoch = () => Math.floor(Date.now() / 1000);
const contained = (parent, child) => { const p = relative(parent, child); return p === '' || !p.startsWith('..') && !isAbsolute(p); };
const emailOf = user => (user?.email?.address ?? user?.google?.email ?? '').trim().toLowerCase();
function privateFile(file) {
  check(isAbsolute(file) && !lstatSync(file).isSymbolicLink(), 'continuation_private_path_invalid');
  const actual = realpathSync(file);
  check(!contained(ROOT, actual) && !actual.split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)), 'continuation_private_path_invalid');
  return actual;
}
function safeFile(file, value) { writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
function deriveEntry(historyId, author, operationId) {
  return sha(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()),
    new Address(PINNED[0].contractId).toScVal(), nativeToScVal(Buffer.from(historyId, 'hex')), new Address(author).toScVal(), nativeToScVal(Buffer.from(operationId, 'hex'))]).toXDR());
}

export async function auditClinicalContinuation({ envFile, originalPlanFile, publicRoot }) {
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  check(env.TRUSTLEAF_ENV === 'local' && env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false' && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' && !env.VERCEL && !env.VERCEL_ENV, 'continuation_environment_invalid');
  check(!Object.keys(env).some(key => /^TRUSTLEAF_CLINICAL_REHEARSAL_/.test(key)), 'continuation_env_file_scope_present');
  check(env.PRIVY_APP_ID === APP && env.NEXT_PUBLIC_PRIVY_APP_ID === APP && env.PRIVY_APP_SECRET, 'continuation_privy_configuration_invalid');
  const originalPath = privateFile(originalPlanFile), originalBytes = readFileSync(originalPath);
  check(sha(originalBytes) === ORIGINAL_HASH, 'continuation_original_changed');
  const old = JSON.parse(originalBytes.toString('utf8'));
  const connection = databaseConnectionString(env), url = new URL(connection);
  check(['postgres:', 'postgresql:'].includes(url.protocol) && /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname) && url.hostname === env.TRUSTLEAF_DB_HOST, 'continuation_database_scope_invalid');
  check(env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === old.contractId && env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === old.registryId && env.PRESCRIPTION_PRIVATE_CONTRACT_ID === PINNED[2].contractId && env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === old.admin && env.BOOKING_AUTHORITY_PUBLIC_KEY === old.admin, 'continuation_contract_scope_invalid');
  const sql = neon(connection), calls = { sqlSelect: 0, privyRead: 0, rpcGetNetwork: 0, rpcGetLedgerEntries: 0, rpcGetTransaction: 0, rpcGetAccount: 0, rpcSimulateGetter: 0 };
  async function select(query, params = []) {
    check(/^SELECT\s/i.test(query) && !/[;]/.test(query) && !/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|LOCK|CALL|DO|COPY|SET)\b/i.test(query), 'continuation_sql_not_readonly');
    calls.sqlSelect++;
    return sql.query(query, params);
  }
  const provider = new PrivyClient(APP, env.PRIVY_APP_SECRET);
  async function existingActor(actor) {
    calls.privyRead++;
    const found = await provider.getUserByEmail(actor.email);
    calls.privyRead++;
    const user = await provider.getUser(actor.userId);
    check(found?.id === actor.userId && user?.id === actor.userId && emailOf(found) === actor.email && emailOf(user) === actor.email, 'continuation_user_changed');
    const wallets = user.linkedAccounts.filter(v => v.type === 'wallet' && v.chainType === 'stellar');
    check(wallets.length === 1 && wallets[0].id === actor.walletId && wallets[0].address === actor.address, 'continuation_wallet_changed');
    calls.privyRead++;
    const wallet = await provider.walletApi.getWallet({ id: actor.walletId });
    check(wallet.id === actor.walletId && wallet.address === actor.address && wallet.chainType === 'stellar', 'continuation_provider_binding_changed');
    const saved = await select('SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings WHERE app_id=$1 AND user_id=$2', [APP, actor.userId]);
    check(saved.length === 1 && saved[0].user_id === actor.userId && saved[0].wallet_id === actor.walletId && saved[0].address === actor.address, 'continuation_saved_binding_changed');
  }
  await Promise.all([existingActor(old.patient), existingActor(old.doctor)]);
  check((env.ADMIN_EMAILS ?? '').split(',').map(v => v.trim().toLowerCase()).includes(old.reviewer.email) && old.reviewer.userId === old.patient.userId, 'continuation_reviewer_changed');
  const doctors = await select('SELECT id,email,status FROM doctors WHERE id=$1', [old.doctorId]);
  check(doctors.length === 1 && doctors[0].email === old.doctor.email && doctors[0].status === 'active', 'continuation_doctor_profile_changed');
  const histories = await select("SELECT history_id,owner_user_id,wallet_id,patient_wallet,transaction_hash FROM clinical_web_histories WHERE history_id=$1 AND contract_id=$2 AND network='testnet'", [old.historyId, old.contractId]);
  check(histories.length === 1 && histories[0].owner_user_id === old.patient.userId && histories[0].wallet_id === old.patient.walletId && histories[0].patient_wallet === old.patient.address, 'continuation_history_changed');
  const versions = await select("SELECT entry_id,version,context,commitment,operation_id FROM clinical_private_versions WHERE history_id=$1 AND contract_id=$2 AND network='testnet' AND state='confirmed' ORDER BY entry_id,version", [old.historyId, old.contractId]);
  check(versions.length === 5 && new Set(versions.map(v => v.entry_id)).size === 4, 'continuation_history_count_changed');
  const auths = await select('SELECT id,state,requested_by,requested_email,doctor_id,doctor_user_id,wallet_id,wallet,contract_id,network,method,expected_version,target_version,valid_until,dossier_id,commitment,transaction_hash,prepared_xdr FROM doctor_authorization_requests WHERE id=$1', [old.steps[0].requestId]);
  const a = auths[0];
  check(auths.length === 1 && a.state === 'confirmed' && a.transaction_hash === PRIOR_HASHES[0] && a.requested_by === old.reviewer.userId && a.requested_email === old.reviewer.email && Number(a.doctor_id) === old.doctorId && a.doctor_user_id === old.doctor.userId && a.wallet_id === old.doctor.walletId && a.wallet === old.doctor.address && a.contract_id === old.registryId && a.network === 'testnet' && a.method === old.authorization.method && Number(a.expected_version) === 3 && Number(a.target_version) === 4 && Number(a.valid_until) === old.doctorValidUntil && a.dossier_id === old.authorization.dossierId, 'continuation_prior_renewal_changed');
  const priorRows = await select('SELECT id,actor_user_id,wallet_id,source_wallet,contract_id,network,action,expected,state,error_code,expires_at,signed_xdr,transaction_hash,created_at,updated_at FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [old.steps.slice(1).map(v => v.requestId)]);
  check(priorRows.length === 3, 'continuation_prior_rows_changed');
  for (const [index, hash] of [[1, PRIOR_HASHES[1]], [2, PRIOR_HASHES[2]]]) {
    const row = priorRows.find(v => v.id === old.steps[index].requestId);
    check(row?.state === 'confirmed' && row.transaction_hash === hash && row.signed_xdr && row.source_wallet === old.patient.address && row.actor_user_id === old.patient.userId && row.wallet_id === old.patient.walletId && row.contract_id === old.contractId && row.network === 'testnet' && row.action === 'set_permissions' && row.expected.operationId === old.steps[index].operationId, 'continuation_prior_grant_changed');
  }
  const cancelled = priorRows.find(v => v.id === old.steps[3].requestId);
  check(cancelled?.state === 'cancelled' && cancelled.error_code === 'signature_request_expired' && !cancelled.signed_xdr && cancelled.transaction_hash === null && Number(cancelled.expires_at) < epoch() && cancelled.source_wallet === old.doctor.address && cancelled.actor_user_id === old.doctor.userId && cancelled.wallet_id === old.doctor.walletId && cancelled.expected.operationId === old.steps[3].operationId && cancelled.action === 'append_version', 'continuation_cancelled_note_changed');
  const sources = [old.patient.address, old.doctor.address, old.admin];
  for (const [table, states] of [['clinical_web_operations', "'awaiting_signature','submitted'"], ['private_operations', "'awaiting_signature','submitted'"], ['clinical_transaction_attempts', "'prepared','submitted'"]]) {
    const rows = await select(`SELECT COUNT(*) AS total FROM ${table} WHERE source_wallet=ANY($1::text[]) AND state IN (${states})`, [sources]);
    check(Number(rows[0]?.total) === 0, 'continuation_pending_intent');
  }
  const pendingAuth = await select("SELECT COUNT(*) AS total FROM doctor_authorization_requests WHERE wallet=$1 AND contract_id=$2 AND state IN ('pending','submitted')", [old.doctor.address, old.registryId]);
  check(Number(pendingAuth[0]?.total) === 0, 'continuation_pending_authorization');
  const prescriptions = await select("SELECT id,rx_id,appointment_id,patient_wallet,doctor_wallet,commitment,expires_at,transaction_hash FROM private_prescriptions WHERE patient_wallet=$1 AND doctor_wallet=$2 AND contract_id=$3 AND network='testnet' AND state='confirmed' AND rx_id IN (3,4) ORDER BY rx_id", [old.patient.address, old.doctor.address, PINNED[2].contractId]);
  check(prescriptions.length === 2 && prescriptions[0].id === old.steps[3].input.note.prescriptionId, 'continuation_prescriptions_changed');
  const remote = new rpc.Server(clinicalRpcUrl(env.TRUSTLEAF_CLINICAL_RPC_PROVIDER), { timeout: 30 });
  let highestLedger = 0;
  const server = Object.freeze({
    getNetwork: async () => { calls.rpcGetNetwork++; return remote.getNetwork(); },
    getLedgerEntries: async (...keys) => { calls.rpcGetLedgerEntries++; const result = await remote.getLedgerEntries(...keys); check(result.latestLedger >= highestLedger, 'continuation_ledger_regressed'); highestLedger = result.latestLedger; return result; },
    getAccount: async address => { check(sources.includes(address) || address === old.relayer, 'continuation_reader_invalid'); calls.rpcGetAccount++; return remote.getAccount(address); },
    getTransaction: async hash => { check(PRIOR_HASHES.includes(hash), 'continuation_receipt_not_allowlisted'); calls.rpcGetTransaction++; return remote.getTransaction(hash); },
    simulateTransaction: async tx => {
      check(tx.signatures.length === 0 && tx.operations.length === 1 && tx.operations[0].type === 'invokeHostFunction', 'continuation_simulation_invalid');
      const call = tx.operations[0].func.invokeContract(), contractId = Address.fromScAddress(call.contractAddress()).toString(), method = call.functionName().toString();
      check(READS.get(contractId)?.has(method), 'continuation_getter_not_allowlisted');
      for (let attempt = 0; attempt < 3; attempt++) {
        calls.rpcSimulateGetter++;
        const result = await remote.simulateTransaction(tx);
        check(rpc.Api.isSimulationSuccess(result) && !rpc.Api.isSimulationRestore(result) && result.result && clinicalSimulationIsLive(result) && Array.isArray(result.result.auth) && result.result.auth.length === 0 && Number.isSafeInteger(result.latestLedger) && result.latestLedger > 0, 'continuation_live_read_failed');
        if (result.latestLedger < highestLedger && attempt < 2) continue;
        check(result.latestLedger >= highestLedger, 'continuation_ledger_regressed');
        highestLedger = result.latestLedger; return result;
      }
    },
  });
  check((await server.getNetwork()).passphrase === Networks.TESTNET, 'continuation_network_changed');
  const auditor = createClinicalContractAuditor({ server, readerAddress: old.admin }), deployments = [];
  for (const pin of PINNED) {
    const configuration = pin.contractId === old.contractId ? { get_registry: old.registryId } : pin.contractId === old.registryId ? { get_admin: old.admin } : { get_registry: old.registryId, get_admin: old.admin, get_booking_authority: old.admin };
    deployments.push(await auditor.auditDeployment({ name: pin.name, contractId: pin.contractId, expectedWasmHash: pin.wasm, interfaceVersion: pin.interfaceVersion, configuration }));
  }
  const authorization = await auditor.doctor(old.doctor.address);
  check(authorization.version === 4 && authorization.validUntil === old.doctorValidUntil && authorization.revoked === false && authorization.commitment === a.commitment, 'continuation_chain_authorization_changed');
  async function getter(contractId, method, args) {
    const tx = new TransactionBuilder(new Account(old.admin, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(new Contract(contractId).call(method, ...args)).setTimeout(60).build();
    return scValToNative((await server.simulateTransaction(tx)).result.retval);
  }
  const historyArg = nativeToScVal(Buffer.from(old.historyId, 'hex'));
  const history = await getter(old.contractId, 'get_history', [historyArg]);
  check(history.patient === old.patient.address && Buffer.from(history.history_id).toString('hex') === old.historyId, 'continuation_chain_history_changed');
  const grantRaw = await getter(old.contractId, 'get_grant', [historyArg, new Address(old.doctor.address).toScVal()]);
  check(grantRaw.can_read === false && grantRaw.can_append === true && Number(grantRaw.revision) === 5, 'continuation_chain_grant_changed');
  const reader = createClinicalChainReader({ network: 'testnet', contractId: old.contractId, registryId: old.registryId, wasmHash: PINNED[0].wasm, readerAddress: old.admin }, { server, requestScoped: true });
  for (const row of versions) {
    const observed = await reader.readVersion({ deployment: { network: 'testnet', contractId: old.contractId }, historyId: old.historyId, entryId: row.entry_id, version: Number(row.version) });
    check(observed.commitment === row.commitment && Object.keys(observed.context).length === Object.keys(row.context).length && Object.entries(observed.context).every(([key,value]) => row.context[key] === value), 'continuation_chain_version_changed');
  }
  const recipeEvidence = [];
  for (const row of prescriptions) recipeEvidence.push(await auditor.prescription({ contractId: PINNED[2].contractId, rxId: String(row.rx_id), doctor: row.doctor_wallet, patient: row.patient_wallet, commitment: row.commitment, expiresAt: Number(row.expires_at) }));
  const receipts = [];
  for (const [index, hash] of PRIOR_HASHES.entries()) {
    const receipt = await server.getTransaction(hash), saved = index === 0 ? a.prepared_xdr : priorRows.find(v => v.transaction_hash === hash).signed_xdr;
    check(receipt.status === 'SUCCESS' && receipt.envelopeXdr?.toXDR('base64') === saved && receipt.resultXdr && receipt.resultMetaXdr && Number.isSafeInteger(receipt.ledger), 'continuation_receipt_changed');
    receipts.push({ key: old.steps[index].key, transactionHash: hash, ledger: receipt.ledger, feeChargedStroops: receipt.resultXdr.feeCharged().toString(), envelopeMatchesPersisted: true });
  }
  const charged = receipts.reduce((total, v) => total + BigInt(v.feeChargedStroops), 0n);
  check(charged === 756690n, 'continuation_receipt_fee_changed');
  const fixture = readFileSync(resolve(ROOT, 'docs/evidence/sow2-week3-fixtures/aporte-medico-sintetico-v1.pdf'));
  check(fixture.equals(syntheticClinicalPdf(1)) && sha(fixture) === 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c', 'continuation_fixture_changed');
  check(sha(readFileSync(originalPath)) === ORIGINAL_HASH, 'continuation_original_changed');
  const report = { status: 'audited_read_only', auditedAt: new Date().toISOString(), originalPlanHash: ORIGINAL_HASH, originalRunId: old.runId,
    priorPlanExpired: old.until < epoch(), originalUntil: new Date(old.until * 1000).toISOString(), identitiesAndBindingsMatch: true, doctorProfileActive: true, reviewerUnchanged: true,
    confirmedHistory: { entries: 4, versions: 5, canonicalVersionsVerified: versions.length },
    grant: { canRead: false, canAppend: true, revision: 5 }, authorization: { version: authorization.version, revoked: false, validUntil: authorization.validUntilUtc, authorizedAtAudit: authorization.authorized },
    cancelledNote: { state: 'cancelled', errorCode: cancelled.error_code, expiresAt: new Date(Number(cancelled.expires_at) * 1000).toISOString(), signedEnvelopePresent: false, transactionHash: null, retained: true },
    priorConfirmedReceipts: receipts, feeChargedStroops: charged.toString(), pendingIntents: 0, recipes: recipeEvidence.map(v => ({ rxId: v.rxId, status: v.lifecycleState, expired: v.expired })),
    fixture: { bytes: fixture.length, sha256: sha(fixture) }, deployments, checkedLedger: highestLedger, calls,
    sqlWrites: 0, signatures: 0, submissions: 0, newIdentities: 0, environmentChanges: 0, approvalCreated: false };
  if (publicRoot) { mkdirSync(publicRoot, { recursive: true }); safeFile(resolve(publicRoot, 'estado-actual-continuacion.json'), report); }
  return { old, env, originalPath, cancelled, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const argv = process.argv.slice(2);
    check([6,8].includes(argv.length) && argv[0] === '--env-file' && argv[2] === '--original-plan' && argv[4] === '--public-root' && (argv.length === 6 || argv[6] === '--private-root'), 'continuation_arguments_invalid');
    const options = { envFile: resolve(argv[1]), originalPlanFile: resolve(argv[3]), publicRoot: resolve(argv[5]) };
    const result = argv.length === 8 ? await prepareClinicalContinuation({ ...options, privateRoot: resolve(argv[7]) }) : (await auditClinicalContinuation(options)).report;
    console.log(JSON.stringify(result));
  } catch (error) {
    const code = error instanceof Error && /^(?:continuation|audit|clinical)_[a-z_]+$/.test(error.message) ? error.message : 'continuation_read_unavailable';
    console.error(JSON.stringify({ error: code, signed: false, submitted: false, approvalCreated: false })); process.exitCode = 1;
  }
}

/** Build reviewable static authority; no approval timestamp or computed expiry is stored. */
export function continuationManifest({ old, originalPath, cancelledExpiresAt, preparedAt = epoch() }) {
  check(old?.schemaVersion === 1 && old.runId === 'e33dc64c-b634-493a-82b8-a29381a2e542' && Number.isSafeInteger(preparedAt) && preparedAt >= old.createdAt, 'continuation_original_invalid');
  check(Number.isSafeInteger(Number(cancelledExpiresAt)) && Number(cancelledExpiresAt) > old.createdAt && Number(cancelledExpiresAt) <= old.until && Number(cancelledExpiresAt) < preparedAt, 'continuation_cancelled_note_invalid');
  const keys = ['renew', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
  const steps = keys.map((key, index) => ({ key, requestId: randomUUID(), actor: index === 0 ? 'admin' : [2,5].includes(index) ? 'patient' : 'doctor', action: index === 0 ? 'renew' : [2,5].includes(index) ? 'set_permissions' : 'append_version', maxFeeStroops: '10000000', ...(index ? { operationId: randomBytes(32).toString('hex') } : {}) }));
  steps[1].input = { requestId: steps[1].requestId, action: 'append_version', historyId: old.historyId, note: structuredClone(old.steps[3].input.note) };
  steps[2].input = { requestId: steps[2].requestId, action: 'set_permissions', doctorId: old.doctorId, canRead: true, canAppend: true, expectedRevision: 5 };
  steps[3].input = { requestId: steps[3].requestId, action: 'append_version', historyId: old.historyId, file: structuredClone(old.steps[5].input.file) };
  steps[4].input = { requestId: steps[4].requestId, action: 'append_version', historyId: old.historyId, entryId: deriveEntry(old.historyId, old.doctor.address, steps[1].operationId), expectedVersion: 1, note: structuredClone(old.steps[6].input.note) };
  steps[5].input = { requestId: steps[5].requestId, action: 'set_permissions', doctorId: old.doctorId, canRead: false, canAppend: false, expectedRevision: 6 };
  return { schemaVersion: 2, runId: randomUUID(), preparedAt, notBefore: old.doctorValidUntil, executionWindowSeconds: 21600, doctorWindowSeconds: 86400,
    ...Object.fromEntries(['network','contractId','registryId','relayer','admin','patient','doctor','historyId','doctorId','reviewer'].map(key => [key, structuredClone(old[key])])),
    startingGrantRevision: 5, startingDoctorVersion: 4, totalMaxFeeStroops: '60000000', steps,
    authorization: { requestId: steps[0].requestId, dossierId: randomUUID(), expectedVersion: 4, targetVersion: 5, method: 'reauthorize_doctor' },
    lineage: { originalPlanFile: originalPath, originalPlanHash: ORIGINAL_HASH, originalRunId: old.runId,
      confirmed: old.steps.slice(0,3).map((step,index) => ({ key: step.key, requestId: step.requestId, transactionHash: PRIOR_HASHES[index] })),
      cancelledNote: { requestId: old.steps[3].requestId, operationId: old.steps[3].operationId, expiresAt: Number(cancelledExpiresAt) }, priorDoctorValidUntil: old.doctorValidUntil } };
}

export async function prepareClinicalContinuation({ envFile, originalPlanFile, privateRoot, publicRoot }) {
  check(isAbsolute(privateRoot) && isAbsolute(publicRoot) && !contained(ROOT, resolve(privateRoot)) && !resolve(privateRoot).split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)), 'continuation_private_path_invalid');
  const audited = await auditClinicalContinuation({ envFile, originalPlanFile });
  const plan = continuationManifest({ old: audited.old, originalPath: audited.originalPath, cancelledExpiresAt: audited.cancelled.expires_at });
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  check(!contained(ROOT, realpathSync(privateRoot)) && !realpathSync(privateRoot).split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)), 'continuation_private_path_invalid');
  const directory = resolve(privateRoot, plan.runId); mkdirSync(directory, { mode: 0o700 });
  const file = resolve(directory, 'plan.private.json'), bytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n'), digest = sha(bytes);
  writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  const previewEnv = { ...audited.env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: file, TRUSTLEAF_CLINICAL_REHEARSAL_HASH: digest };
  const simulatedApprovedAt = plan.preparedAt, simulatedNow = Math.max(epoch(), plan.notBefore);
  const preview = loadRehearsalPolicy({ env: previewEnv, now: simulatedNow, requireApproval: false,
    previewApproval: { schemaVersion: 1, planHash: digest, approvedAt: simulatedApprovedAt, statement: 'Vista previa técnica sin autorización humana' } });
  check(preview?.runId === plan.runId && preview.createdAt === simulatedApprovedAt && preview.until === simulatedApprovedAt + 21600 && preview.doctorValidUntil === simulatedApprovedAt + 86400, 'continuation_preview_failed');
  let activationDenied = false;
  try { loadRehearsalPolicy({ env: previewEnv, now: simulatedNow }); } catch (error) { activationDenied = error instanceof Error && error.message === 'clinical_rehearsal_approval_required'; }
  check(activationDenied && !existsSync(resolve(directory, 'approval.private.json')), 'continuation_activation_not_blocked');
  const originalAmendmentApproval = resolve(dirname(audited.originalPath), '..', '332becf1-c41a-45c7-add8-665c31cc0d24', 'approval.private.json');
  check(!existsSync(originalAmendmentApproval), 'continuation_previous_amendment_approval_present');
  const sourcePaths = ['scripts/prepare-clinical-continuation.mjs','scripts/lib/clinical-rehearsal-policy.mjs','scripts/lib/clinical-rehearsal-policy.d.mts','src/lib/clinical/rehearsal.ts'];
  const sourceSHA = Object.fromEntries(sourcePaths.map(path => [path, sha(readFileSync(resolve(ROOT, path)))]));
  const proposal = { status: 'pending_approval', schemaVersion: 2, runId: plan.runId, policyHash: digest, preparedAt: new Date(plan.preparedAt * 1000).toISOString(),
    timing: { notBefore: new Date(plan.notBefore * 1000).toISOString(), executionWindowHoursAfterApproval: 6, doctorWindowHoursAfterApproval: 24, datesDerivedFromSingleHumanApproval: true, runtimeLoadsNeverMoveDates: true, notBeforeDoesNotMoveApprovalWindow: true, actualApprovedAt: null, actualUntil: null, actualDoctorValidUntil: null },
    identities: { patient: { email: plan.patient.email, address: plan.patient.address }, doctor: { email: plan.doctor.email, address: plan.doctor.address, doctorId: 10 } },
    lineage: { originalPlanHash: ORIGINAL_HASH, originalRunId: plan.lineage.originalRunId, previousAmendmentNeverApproved: true, previousAmendmentExpired: true,
      priorConfirmedReceipts: audited.report.priorConfirmedReceipts, priorConfirmedFeeChargedStroops: '756690', priorConfirmedTransactionsNotRepeated: 3,
      cancelledNoteRetained: audited.report.cancelledNote, previousApprovalNotInherited: true, newUniqueTransactionsAtMost: 6, maxUniqueSubmittedTransactionsAcrossLineage: 9, maxPersistedRequestRowsAcrossLineage: 10, persistedRequestRowsCountingRule: 'Cuatro solicitudes previas persistidas entre administración y clínica, incluida la nota cancelada, más seis nuevas; los UUID reservados en planes no ejecutados no se cuentan aquí. El máximo de transacciones distintas enviadas sigue siendo nueve.' },
    budget: { perStepMaxFeeStroops: '10000000', futureMaxFeeStroops: '60000000', priorChargedStroops: '756690', maximumEffectiveFeeAfterContinuationStroops: '60756690', newFunding: false },
    steps: [
      { key: 'renew', actor: 'administrator', description: 'Renovar el mismo médico desde registro v4 a v5, vencimiento fijo a las24 horas desde la nueva aprobación.', maxFeeXlm: 1 },
      { key: 'append_note', actor: 'doctor', description: 'Agregar la misma nota sintética con receta histórica #3 vencida, bajo el permiso sólo agregado existente.', maxFeeXlm: 1, title: plan.steps[1].input.note.title, text: plan.steps[1].input.note.text },
      { key: 'grant_both', actor: 'patient', description: 'Conceder lectura y agregado a la misma cuenta médica, revisión5 a6.', maxFeeXlm: 1 },
      { key: 'append_pdf', actor: 'doctor', description: 'Agregar el PDF médico sintético original.', maxFeeXlm: 1, fileName: plan.steps[3].input.file.fileName, fixture: audited.report.fixture },
      { key: 'correct_note', actor: 'doctor', description: 'Corregir sólo la nota propia, versión1 a2; preservar la versión anterior y el vínculo histórico.', maxFeeXlm: 1, text: plan.steps[4].input.note.text },
      { key: 'revoke', actor: 'patient', description: 'Retirar ambos permisos, revisión6 a7; retirada anticipada permitida desde revisión5 o6 con el mismo paso final.', maxFeeXlm: 1 },
    ],
    finalExpected: { canRead: false, canAppend: false, entries: 6, versions: 8 }, checks: { sameExistingIdentities: true, currentCanonicalStateAudited: true, exactOriginalNoteRecipePdfAndCorrection: true, privatePreviewValidated: true, activationDeniedWithoutNewApproval: activationDenied, approvalFileAbsent: true, originalPlanUnchanged: sha(readFileSync(audited.originalPath)) === ORIGINAL_HASH },
    readOnlyAudit: 'estado-preparacion-v2.json', sourceSHA, effectsPerformed: { sqlWrites: 0, signatures: 0, submittedTransactions: 0, environmentChanges: 0, approvalsCreated: 0 },
    limitations: ['La continuación no está autorizada ni activada.', 'La aprobación anterior no cubre la renovación adicional ni la sustitución del intento vencido.', 'La revisión humana inicia una sola ventana de6 horas y una autorización médica fija de24 horas; esperar notBefore no desplaza esos plazos.', 'El registro clínico sólo agregado sigue vigente; el retiro final no se ejecutó automáticamente al vencer el plan anterior.', 'Semana3 sigue pendiente del recorrido real; video, revisión y aceptación de semana4 siguen pendientes.'] };
  mkdirSync(publicRoot, { recursive: true });
  safeFile(resolve(publicRoot, 'estado-preparacion-v2.json'), audited.report);
  safeFile(resolve(publicRoot, 'propuesta-continuacion-pendiente.json'), proposal);
  safeFile(resolve(directory, 'preparation-metadata.json'), { status: 'pending_approval', policyHash: digest, sourceSHA, approvalCreated: false, publicProposalSha256: sha(readFileSync(resolve(publicRoot, 'propuesta-continuacion-pendiente.json'))) });
  return { privatePath: file, policyHash: digest, runId: plan.runId, publicProposal: resolve(publicRoot, 'propuesta-continuacion-pendiente.json'), status: 'pending_approval' };
}

/** Schema12 proposal only. It deliberately does not reuse the stopped raw11
 * approval, start a clock, activate sponsorship or create an approval record. */
export function completionContinuationManifest({basePlanFile,baseApprovalFile,preparedAt=epoch(),amendmentId=randomUUID(),renewalRequestId=randomUUID(),renewalDossierId=randomUUID()}) {
  check(typeof basePlanFile === 'string' && isAbsolute(basePlanFile) && typeof baseApprovalFile === 'string' && isAbsolute(baseApprovalFile), 'continuation_completion_base_path_invalid');
  check(Number.isSafeInteger(preparedAt) && preparedAt >= 1792975922, 'continuation_completion_time_invalid');
  const ids=[amendmentId,renewalRequestId,renewalDossierId];
  check(ids.every(id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) && new Set(ids).size===3, 'continuation_completion_identifiers_invalid');
  return {schemaVersion:12,amendmentId,preparedAt,basePlanFile,basePlanHash:'6ad1f0558da616fe37e6eea46161597d0d3adf8635df68dbd3840bc0c0478956',
    baseApprovalFile,baseApprovalHash:'330b65b8b635077c928e8be83f050433dfc56c0283e8772f14225e254e0acf26',
    executionWindowSeconds:14400,doctorWindowSeconds:604800,renewalMaxFeeStroops:'10000000',renewalRequestId,renewalDossierId,startingDoctorVersion:5,
    replacementPdfRequestId:'7b704051-d090-4251-ad57-82d45067f4e8',replacementPdfOperationId:'52ea85d09aa5a14d008395fe82cec664e09cadb57aad1c55748038ca1774fbf8',
    supersededPdf:{requestId:'ac5d06bb-c2c7-4af0-9c91-7feb2a5a1d65',operationId:'22a3ed39a40d6aa28d721e42c886a3d76f5de45d5ef59731beba2d4b215ac355',expiresAt:1792967797,
      unsignedEnvelopeHash:'8ec5b5e47c4fbf19c14d0254f4c55077cc0cefda3db435fa85653296f6cc9190',signingHash:'bb66bb48b433ba43e8d3c8262efdc5ee5e0f2194c5319cda15d77a0d74862b50'}};
}

/** Schema13 proposal only. The maintenance request and its journal are fixed
 * across every new proposal, preserving at most one maintenance charge. */
export function maintenanceCompletionManifest(options) {
  const renewalRequestId='de46469b-3f8a-4af8-b409-9744d85c4527',renewalDossierId='f2d738c1-977d-40b3-9b72-126d04b5f4c7';
  check((options.renewalRequestId === undefined || options.renewalRequestId === renewalRequestId) &&
    (options.renewalDossierId === undefined || options.renewalDossierId === renewalDossierId),'continuation_maintenance_renewal_slot_rejected');
  const raw=completionContinuationManifest({...options,renewalRequestId,renewalDossierId}),maintenance=rehearsalMaintenanceDescriptor();
  for(const name of ['maintenance','maintenanceRequestId','maintenanceAttemptFile','maintenanceMaxFeeStroops','keys'])
    check(!Object.hasOwn(options,name),'continuation_maintenance_override_rejected');
  check(![raw.amendmentId,raw.renewalRequestId,raw.renewalDossierId,raw.replacementPdfRequestId].includes(maintenance.requestId),'continuation_maintenance_identifier_collision');
  return {...raw,schemaVersion:13,maintenance:{...maintenance,keys:[...maintenance.keys],
    attemptFile:resolve(dirname(raw.basePlanFile),'maintenance-14-attempt.private.json')}};
}
