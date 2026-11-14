/** Prepare one reviewed local Testnet rehearsal. READ ONLY remotely.
 * Never changes process.env, SQL rows, identities, authorizations or ledger state.
 * Only local proposal files are created. No signing or transmission API is used.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { PrivyClient } from '@privy-io/server-auth';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { loadRehearsalPolicy } from './lib/clinical-rehearsal-policy.mjs';
import { clinicalSimulationIsLive, clinicalTtlMetadataUsable } from './lib/clinical-live-read.mjs';
import { clinicalRpcUrl } from './lib/clinical-rpc.mjs';
import { readAuthorization } from './lib/private-registry.mjs';
import { syntheticClinicalPdf } from './lib/clinical-fixtures.mjs';

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const APP = 'cmrix722m03d30clewd1fuffq';
const CLINICAL = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const REGISTRY = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const RX = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
const ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const PINNED = [
  [CLINICAL, '29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0'],
  [REGISTRY, 'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02'],
  [RX, '4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c'],
];
const METHODS = new Map([[CLINICAL, new Set(['interface_version', 'get_registry', 'get_history', 'get_grant'])],
  [REGISTRY, new Set(['get_authorization', 'is_authorized'])],
  [RX, new Set(['interface_version', 'get_registry', 'get_admin', 'get_booking_authority', 'get_prescription'])]]);
const HEX = /^[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (condition, code) => { if (!condition) throw Error(code); };
const seconds = () => Math.floor(Date.now() / 1000);
function contained(parent, child) { const value = relative(parent, child); return value === '' || !value.startsWith('..') && !isAbsolute(value); }
function readEnvironment(file) {
  const env = Object.create(null);
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line); check(match, 'rehearsal_preparation_env_invalid');
    check(!Object.hasOwn(env, match[1]), 'rehearsal_preparation_env_duplicate');
    let value = match[2].trim();
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  // No process.env assignments: validation receives this explicit copy only.
  return env;
}
function derive(kind, ...values) {
  const tuple = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind), nativeToScVal(createHash('sha256').update(Networks.TESTNET).digest()), new Address(CLINICAL).toScVal(), ...values]);
  return sha(tuple.toXDR());
}
function userEmail(user) { return (user?.email?.address ?? user?.google?.email ?? '').trim().toLowerCase(); }
function printableDate(epoch) { return new Date(epoch * 1000).toISOString(); }

export async function prepareClinicalRehearsal({ envFile, privateRoot, publicRoot }) {
  check(isAbsolute(envFile) && isAbsolute(privateRoot) && isAbsolute(publicRoot), 'rehearsal_preparation_paths_invalid');
  check(!contained(ROOT, resolve(privateRoot)) && !resolve(privateRoot).split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)), 'rehearsal_preparation_private_path_invalid');
  const sourcePaths = ['scripts/prepare-clinical-rehearsal.mjs', 'scripts/lib/clinical-rehearsal-policy.mjs', 'scripts/lib/private-registry.mjs', 'scripts/lib/clinical-fixtures.mjs', 'docs/sow2/ENSAYO-MEDICO-SEMANA-3-4.md'];
  const sourceSHA = Object.fromEntries(sourcePaths.map(file => [file, sha(readFileSync(resolve(ROOT, file)))]));
  const env = readEnvironment(envFile);
  const PATIENT_EMAIL = env.TRUSTLEAF_REHEARSAL_PATIENT_EMAIL?.trim().toLowerCase();
  const DOCTOR_EMAIL = env.TRUSTLEAF_REHEARSAL_DOCTOR_EMAIL?.trim().toLowerCase();
  const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  check(PATIENT_EMAIL && DOCTOR_EMAIL && PATIENT_EMAIL !== DOCTOR_EMAIL &&
    emailAddress.test(PATIENT_EMAIL) && emailAddress.test(DOCTOR_EMAIL), 'rehearsal_preparation_actor_configuration_invalid');
  check(!Object.keys(env).some(key => /^TRUSTLEAF_CLINICAL_REHEARSAL_/.test(key)), 'rehearsal_preparation_existing_policy');
  check(env.TRUSTLEAF_ENV === 'local' && env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false' && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' && !env.VERCEL && !env.VERCEL_ENV, 'rehearsal_preparation_environment_invalid');
  check(env.PRIVY_APP_ID === APP && env.NEXT_PUBLIC_PRIVY_APP_ID === APP && env.PRIVY_APP_SECRET && env.RELAYER_SECRET, 'rehearsal_preparation_identity_configuration_invalid');
  check(env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === CLINICAL && env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === REGISTRY && env.PRESCRIPTION_PRIVATE_CONTRACT_ID === RX && env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === ADMIN && env.BOOKING_AUTHORITY_PUBLIC_KEY === ADMIN, 'rehearsal_preparation_contract_configuration_invalid');
  const connection = databaseConnectionString(env), database = new URL(connection);
  check(['postgres:', 'postgresql:'].includes(database.protocol) && /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(database.hostname) && database.hostname === env.TRUSTLEAF_DB_HOST, 'rehearsal_preparation_database_scope_invalid');
  const sql = neon(connection), privy = new PrivyClient(APP, env.PRIVY_APP_SECRET);
  // SELECT-only capability; no row locks, SQL functions with side effects or CTEs.
  async function select(query, parameters = []) {
    check(/^SELECT\s/i.test(query) && !/[;]/.test(query) && !/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|LOCK|CALL|DO|COPY|SET)\b/i.test(query), 'rehearsal_preparation_sql_not_readonly');
    return sql.query(query, parameters);
  }
  async function knownUser(email) {
    const found = await privy.getUserByEmail(email);
    check(found?.id && userEmail(found) === email, 'rehearsal_preparation_existing_user_required');
    const user = await privy.getUser(found.id);
    check(user?.id === found.id && userEmail(user) === email, 'rehearsal_preparation_user_changed');
    return user;
  }
  async function actor(email) {
    const user = await knownUser(email);
    const linked = user.linkedAccounts.filter(item => item.type === 'wallet' && item.chainType === 'stellar');
    check(linked.length === 1 && linked[0].id && StrKey.isValidEd25519PublicKey(linked[0].address), 'rehearsal_preparation_wallet_ambiguous');
    const wallet = linked[0], actual = await privy.walletApi.getWallet({ id: wallet.id });
    check(actual.id === wallet.id && actual.address === wallet.address && actual.chainType === 'stellar', 'rehearsal_preparation_provider_binding_changed');
    const bindings = await select('SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings WHERE app_id=$1 AND user_id=$2 LIMIT 2', [APP, user.id]);
    check(bindings.length === 1 && bindings[0].user_id === user.id && bindings[0].wallet_id === wallet.id && bindings[0].address === wallet.address, 'rehearsal_preparation_saved_binding_changed');
    return { userId: user.id, walletId: wallet.id, address: wallet.address, email };
  }
  const [patient, doctor] = await Promise.all([actor(PATIENT_EMAIL), actor(DOCTOR_EMAIL)]);
  check(patient.userId !== doctor.userId && patient.address !== doctor.address && patient.walletId !== doctor.walletId, 'rehearsal_preparation_distinct_actors_required');
  const doctors = await select('SELECT id,email,status FROM doctors WHERE id=$1 AND LOWER(email)=$2 LIMIT 2', [10, DOCTOR_EMAIL]);
  check(doctors.length === 1 && Number(doctors[0].id) === 10 && doctors[0].email.toLowerCase() === DOCTOR_EMAIL && doctors[0].status === 'active', 'rehearsal_preparation_doctor_profile_invalid');
  const allowlist = [...new Set((env.ADMIN_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
  check(allowlist.length > 0, 'rehearsal_preparation_admin_allowlist_missing');
  let reviewer;
  for (const email of [PATIENT_EMAIL, ...allowlist.filter(value => value !== PATIENT_EMAIL)]) {
    if (!allowlist.includes(email)) continue;
    const user = await knownUser(email); reviewer = { userId: user.id, email }; break;
  }
  check(reviewer, 'rehearsal_preparation_existing_reviewer_required');
  const histories = await select("SELECT history_id,owner_user_id,wallet_id,patient_wallet,transaction_hash FROM clinical_web_histories WHERE owner_user_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2", [patient.userId, CLINICAL]);
  check(histories.length === 1 && histories[0].wallet_id === patient.walletId && histories[0].patient_wallet === patient.address && HEX.test(histories[0].transaction_hash), 'rehearsal_preparation_existing_history_required');
  const historyId = derive('hist_id', new Address(patient.address).toScVal());
  check(histories[0].history_id === historyId, 'rehearsal_preparation_history_derivation_mismatch');
  const counts = await select("SELECT COUNT(DISTINCT entry_id) AS entries,COUNT(*) AS versions FROM clinical_private_versions WHERE network='testnet' AND contract_id=$1 AND history_id=$2 AND state='confirmed'", [CLINICAL, historyId]);
  check(Number(counts[0]?.entries) === 4 && Number(counts[0]?.versions) === 5, 'rehearsal_preparation_history_baseline_changed');
  const pendingQueries = [
    ["SELECT COUNT(*) AS total FROM clinical_web_operations WHERE source_wallet=ANY($1::text[]) AND state IN ('awaiting_signature','submitted')", [[patient.address, doctor.address, ADMIN]]],
    ["SELECT COUNT(*) AS total FROM private_operations WHERE source_wallet=ANY($1::text[]) AND state IN ('awaiting_signature','submitted')", [[patient.address, doctor.address, ADMIN]]],
    ["SELECT COUNT(*) AS total FROM clinical_transaction_attempts WHERE source_wallet=ANY($1::text[]) AND state IN ('prepared','submitted')", [[patient.address, doctor.address, ADMIN]]],
    ["SELECT COUNT(*) AS total FROM doctor_authorization_requests WHERE contract_id=$1 AND wallet=$2 AND state IN ('pending','submitted')", [REGISTRY, doctor.address]],
  ];
  for (const [query, parameters] of pendingQueries) check(Number((await select(query, parameters))[0]?.total) === 0, 'rehearsal_preparation_pending_intent');
  const prescriptions = await select(`SELECT p.id,p.rx_id,p.appointment_id,p.doctor_wallet,p.patient_wallet,p.commitment,p.expires_at,p.transaction_hash,
    b.doctor_user_id,b.patient_requested_by,b.doctor_wallet_id,b.patient_wallet_id
    FROM private_prescriptions p JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id AND b.issuance_id=p.issuance_id
    WHERE p.contract_id=$1 AND p.network='testnet' AND p.state='confirmed' AND p.patient_wallet=$2 AND p.doctor_wallet=$3
      AND b.contract_id=$1 AND b.network='testnet' AND b.patient_wallet=p.patient_wallet AND b.doctor_wallet=p.doctor_wallet
      AND p.rx_id IN (3,4) ORDER BY p.rx_id`, [RX, patient.address, doctor.address]);
  check(prescriptions.length === 2 && String(prescriptions[0].rx_id) === '3' && String(prescriptions[1].rx_id) === '4', 'rehearsal_preparation_existing_recipes_required');
  for (const row of prescriptions) check(row.doctor_user_id === doctor.userId && row.patient_requested_by === patient.userId && row.doctor_wallet_id === doctor.walletId && row.patient_wallet_id === patient.walletId && HEX.test(row.commitment) && HEX.test(row.transaction_hash), 'rehearsal_preparation_recipe_binding_invalid');
  const server = new rpc.Server(clinicalRpcUrl(env.TRUSTLEAF_CLINICAL_RPC_PROVIDER), { timeout: 30 });
  check((await server.getNetwork()).passphrase === Networks.TESTNET, 'rehearsal_preparation_network_mismatch');
  let ledger = 0;
  const deployment = [];
  for (const [contractId, wasmHash] of PINNED) {
    const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({ contract: new Address(contractId).toScAddress(), key: xdr.ScVal.scvLedgerKeyContractInstance(), durability: xdr.ContractDataDurability.persistent() }));
    const result = await server.getLedgerEntries(key);
    check(result.latestLedger >= ledger && result.entries.length === 1, 'rehearsal_preparation_instance_unavailable'); ledger = result.latestLedger;
    const entry = result.entries[0], value = entry.val.contractData();
    check(entry.key.toXDR().equals(key.toXDR()) && value.contract().toXDR().equals(new Address(contractId).toScAddress().toXDR()) && value.durability().name === 'persistent' && value.key().switch().name === 'scvLedgerKeyContractInstance' && value.val().switch().name === 'scvContractInstance' && clinicalTtlMetadataUsable(entry.liveUntilLedgerSeq, ledger), 'rehearsal_preparation_instance_invalid');
    const executable = value.val().instance().executable();
    check(executable.switch().name === 'contractExecutableWasm' && executable.wasmHash().toString('hex') === wasmHash, 'rehearsal_preparation_wasm_mismatch');
    const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(wasmHash, 'hex') }));
    const codes = await server.getLedgerEntries(codeKey); check(codes.latestLedger >= ledger && codes.entries.length === 1, 'rehearsal_preparation_code_unavailable'); ledger = codes.latestLedger;
    const code = codes.entries[0];
    check(code.key.toXDR().equals(codeKey.toXDR()) && code.val.contractCode().hash().toString('hex') === wasmHash && sha(code.val.contractCode().code()) === wasmHash && clinicalTtlMetadataUsable(code.liveUntilLedgerSeq, ledger), 'rehearsal_preparation_code_invalid');
    deployment.push({ contractId, wasmHash, checkedLedger: ledger });
  }
  const source = await server.getAccount(ADMIN);
  async function read(contractId, method, args = []) {
    check(METHODS.get(contractId)?.has(method), 'rehearsal_preparation_getter_not_allowed');
    const unsigned = new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }).addOperation(new Contract(contractId).call(method, ...args)).setTimeout(60).build();
    const simulation = await server.simulateTransaction(unsigned);
    check(rpc.Api.isSimulationSuccess(simulation) && !rpc.Api.isSimulationRestore(simulation) && simulation.result && clinicalSimulationIsLive(simulation) && Array.isArray(simulation.result.auth) && simulation.result.auth.length === 0 && simulation.latestLedger >= ledger, 'rehearsal_preparation_live_read_failed');
    ledger = simulation.latestLedger; return scValToNative(simulation.result.retval);
  }
  check(Number(await read(CLINICAL, 'interface_version')) === 1 && await read(CLINICAL, 'get_registry') === REGISTRY, 'rehearsal_preparation_clinical_configuration_changed');
  const history = await read(CLINICAL, 'get_history', [nativeToScVal(Buffer.from(historyId, 'hex'))]);
  check(history.patient === patient.address && Buffer.from(history.history_id).toString('hex') === historyId, 'rehearsal_preparation_chain_history_changed');
  const grant = await read(CLINICAL, 'get_grant', [nativeToScVal(Buffer.from(historyId, 'hex')), new Address(doctor.address).toScVal()]);
  check(grant.can_read === false && grant.can_append === false && Number(grant.revision) === 3, 'rehearsal_preparation_grant_baseline_changed');
  const registry = await readAuthorization({ wallet: doctor.address, source: ADMIN, registryId: REGISTRY, expectedAdmin: ADMIN, server });
  const strictAuthorization = await read(REGISTRY, 'get_authorization', [new Address(doctor.address).toScVal()]);
  check(registry.authorization && registry.authorization.version === 3 && registry.authorization.revoked === false && registry.authorization.valid_until <= seconds() && registry.authorized === false && Number(strictAuthorization.version) === 3 && Number(strictAuthorization.schema_version) === 1 && Buffer.from(strictAuthorization.commitment).toString('hex') === registry.authorization.commitment && strictAuthorization.revoked === false && Number(strictAuthorization.valid_until) === registry.authorization.valid_until && await read(REGISTRY, 'is_authorized', [new Address(doctor.address).toScVal()]) === false, 'rehearsal_preparation_registry_baseline_changed');
  check(Number(await read(RX, 'interface_version')) === 2 && await read(RX, 'get_registry') === REGISTRY && await read(RX, 'get_admin') === ADMIN && await read(RX, 'get_booking_authority') === ADMIN, 'rehearsal_preparation_recipe_configuration_changed');
  const recipeEvidence = [];
  for (const row of prescriptions) {
    const record = await read(RX, 'get_prescription', [nativeToScVal(BigInt(row.rx_id), { type: 'u64' })]);
    const status = Array.isArray(record.status) ? String(record.status[0]) : String(record.status);
    check(String(record.id) === String(row.rx_id) && record.patient === patient.address && record.doctor === doctor.address && Number(record.schema_version) === 1 && Buffer.from(record.commitment).toString('hex') === row.commitment && Number(record.expires_at) === Number(row.expires_at), 'rehearsal_preparation_recipe_record_changed');
    check(Number(record.expires_at) <= seconds() && (String(row.rx_id) === '4' ? status === 'Revoked' : ['Registered', 'Active'].includes(status)), 'rehearsal_preparation_recipe_status_changed');
    recipeEvidence.push({ rxId: String(row.rx_id), appointmentId: Number(row.appointment_id), status, expired: true, originalIssuanceHash: row.transaction_hash });
  }
  const fixturePath = resolve(ROOT, 'docs/evidence/sow2-week3-fixtures/aporte-medico-sintetico-v1.pdf'), fixture = readFileSync(fixturePath);
  check(fixture.equals(syntheticClinicalPdf(1)) && sha(fixture) === 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c', 'rehearsal_preparation_fixture_changed');
  check(sourcePaths.every(file => sha(readFileSync(resolve(ROOT, file))) === sourceSHA[file]), 'rehearsal_preparation_source_changed');
  const createdAt = seconds(), runId = randomUUID(), requestIds = Array.from({ length: 8 }, () => randomUUID()), operationIds = Array.from({ length: 7 }, () => randomBytes(32).toString('hex'));
  const keys = ['renew', 'grant_read', 'grant_append', 'append_note', 'grant_both', 'append_pdf', 'correct_note', 'revoke'];
  const steps = keys.map((key, index) => ({ key, requestId: requestIds[index], actor: index === 0 ? 'admin' : [1, 2, 4, 7].includes(index) ? 'patient' : 'doctor', action: index === 0 ? 'renew' : [1, 2, 4, 7].includes(index) ? 'set_permissions' : 'append_version', maxFeeStroops: '10000000', ...(index ? { operationId: operationIds[index - 1] } : {}) }));
  for (const [index, flags, revision] of [[1, [true, false], 3], [2, [false, true], 4], [4, [true, true], 5], [7, [false, false], 6]]) steps[index].input = { requestId: steps[index].requestId, action: 'set_permissions', doctorId: 10, canRead: flags[0], canAppend: flags[1], expectedRevision: revision };
  const note = { title: 'Seguimiento técnico de demostración', text: 'Aporte médico ficticio para comprobar permisos y versiones en Stellar Testnet. No representa una atención ni indicación clínica. La receta vinculada es un antecedente histórico y conserva su estado y permisos propios.', eventDate: null, prescriptionId: prescriptions[0].id };
  steps[3].input = { requestId: steps[3].requestId, action: 'append_version', historyId, note };
  steps[5].input = { requestId: steps[5].requestId, action: 'append_version', historyId, file: { fileName: 'aporte-medico-sintetico-v1.pdf', mediaType: 'application/pdf', base64: fixture.toString('base64') } };
  const entryId = derive('entry_id', nativeToScVal(Buffer.from(historyId, 'hex')), new Address(doctor.address).toScVal(), nativeToScVal(Buffer.from(steps[3].operationId, 'hex')));
  steps[6].input = { requestId: steps[6].requestId, action: 'append_version', historyId, entryId, expectedVersion: 1, note: { ...note, text: note.text + ' Corrección técnica: revisión de redacción; se mantiene el vínculo histórico y la versión anterior.' } };
  const relayer = Keypair.fromSecret(env.RELAYER_SECRET).publicKey();
  const plan = { schemaVersion: 1, runId, createdAt, until: createdAt + 6 * 3600, doctorValidUntil: createdAt + 86400, network: 'testnet', contractId: CLINICAL, registryId: REGISTRY, relayer, admin: ADMIN, patient, doctor, historyId, doctorId: 10, startingGrantRevision: 3, startingDoctorVersion: 3, totalMaxFeeStroops: '80000000', reviewer, steps,
    authorization: { requestId: steps[0].requestId, dossierId: randomUUID(), validUntil: createdAt + 86400, expectedVersion: 3, targetVersion: 4, method: 'reauthorize_doctor' } };
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  check(!contained(ROOT, realpathSync(privateRoot)) && !realpathSync(privateRoot).split(/[\\/]/).some(part => /^OneDrive(?:\s*-.*)?$/i.test(part)), 'rehearsal_preparation_private_path_invalid');
  const privateDirectory = resolve(privateRoot, runId); mkdirSync(privateDirectory, { mode: 0o700 });
  const privatePath = resolve(privateDirectory, 'plan.private.json'), privateBytes = Buffer.from(JSON.stringify(plan, null, 2) + '\n');
  writeFileSync(privatePath, privateBytes, { mode: 0o600, flag: 'wx' });
  const policyHash = sha(privateBytes);
  const previewEnv = { ...env, TRUSTLEAF_CLINICAL_REHEARSAL_FILE: privatePath, TRUSTLEAF_CLINICAL_REHEARSAL_HASH: policyHash };
  const validated = loadRehearsalPolicy({ env: previewEnv, now: createdAt, requireApproval: false });
  check(validated && validated.policyHash === policyHash && validated.runId === runId, 'rehearsal_preparation_policy_validation_failed');
  const proposal = { status: 'prepared_not_executed', approval: 'pending', network: 'testnet', runId, policyHash, createdAt: printableDate(createdAt), localUntil: printableDate(plan.until), localWindowHours: 6, doctorValidUntil: printableDate(plan.doctorValidUntil), doctorWindowHours: 24,
    identities: { patient: { email: PATIENT_EMAIL, address: patient.address }, doctor: { email: DOCTOR_EMAIL, address: doctor.address, doctorId: 10 }, administrator: { address: ADMIN }, reviewer: { email: [PATIENT_EMAIL, DOCTOR_EMAIL].includes(reviewer.email) ? reviewer.email : 'existing-allowlisted-administrator' } },
    contractId: CLINICAL, registryId: REGISTRY, prescriptionContractId: RX, relayer, historyId,
    baseline: { clinicalEntries: 4, clinicalVersions: 5, grantRevision: 3, canRead: false, canAppend: false, doctorVersion: 3, doctorAuthorized: false, doctorRevoked: false, existingRecipes: recipeEvidence, checkedLedger: ledger, pendingIntents: 0 },
    maxTransactions: 8, maxFeePerTransactionXlm: 1, maxAggregateFeeXlm: 8, feesAreCapsNotQuotes: true,
    steps: steps.map(step => ({ key: step.key, actor: step.actor, action: step.action, maxFeeXlm: 1, status: 'pending', transactionHash: null, ...(step.input?.canRead !== undefined ? { canRead: step.input.canRead, canAppend: step.input.canAppend, expectedRevision: step.input.expectedRevision } : {}), ...(step.key === 'append_note' ? { syntheticNote: { title: note.title, text: note.text, eventDate: null }, historicalRecipeNumber: '3' } : {}), ...(step.key === 'correct_note' ? { expectedVersion: 1, targetVersion: 2, syntheticText: step.input.note.text, historicalRecipeNumber: '3' } : {}), ...(step.key === 'append_pdf' ? { fixture: { fileName: step.input.file.fileName, bytes: fixture.length, sha256: sha(fixture) } } : {}) })),
    finalPermissions: { canRead: false, canAppend: false }, checks: { privyAndSavedBindingsMatch: true, sameExistingIdentities: true, doctorProfileActive: true, canonicalWasmAndLiveReads: true, originalHistoryMatches: true, originalRecipesMatch: true, privatePolicyPreviewValidated: true }, deployment, sourceSHA,
    effectsPerformed: { sqlWrites: 0, newWallets: 0, signedTransactions: 0, submittedTransactions: 0, environmentChanges: 0, enqueuedRequests: 0 },
    limitations: ['Authorization and budget caps remain unapproved.', 'No fee estimate or balance reservation is claimed.', 'Renewal is not enqueued and no signatures have been requested.', 'Clinical/RX grants and historical document permissions remain independent.', 'New clinical evidence, video, review and acceptance remain pending.'] };
  mkdirSync(publicRoot, { recursive: true });
  const publicPath = resolve(publicRoot, 'propuesta.json');
  writeFileSync(publicPath, JSON.stringify(proposal, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(resolve(privateDirectory, 'preparation-metadata.json'), JSON.stringify({ status: 'prepared_not_executed', policyHash, publicProposalSha256: sha(readFileSync(publicPath)), sourceSHA }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { privatePath, policyHash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), allowed = ['--env-file', '--private-root', '--public-root'];
  try {
    check(args.length === 6 && args.every((value, index) => index % 2 ? typeof value === 'string' : allowed.includes(value)) && new Set(args.filter((_, index) => index % 2 === 0)).size === 3, 'rehearsal_preparation_arguments_invalid');
    const options = Object.fromEntries([0, 2, 4].map(index => [args[index].slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), resolve(args[index + 1])]));
    console.log(JSON.stringify(await prepareClinicalRehearsal(options)));
  } catch (error) {
    // Providers may include credentials or private payloads in errors. Never echo them.
    const code = error instanceof Error && /^(?:rehearsal_preparation|clinical_rehearsal)_[a-z_]+$/.test(error.message) ? error.message : 'rehearsal_preparation_unavailable';
    console.error(JSON.stringify({ error: code, signed: false, submitted: false })); process.exitCode = 1;
  }
}
