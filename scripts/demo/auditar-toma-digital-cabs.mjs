import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { readDemoInputsOrExit, requiredDemoDigest } from './demo-inputs.mjs';

const require = createRequire(import.meta.url);
const { args, configured: env, privateFile } = readDemoInputsOrExit();
const load = name => import(new URL('../lib/' + name, import.meta.url).href);
const sha = value => createHash('sha256').update(value).digest();
const check = (condition, code) => { if (!condition) throw Object.assign(new Error(), { auditCode: code }); };
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const app = 'cmrix722m03d30clewd1fuffq';
const clinic = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const registry = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
const authority = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const approvedPdf = { fileName: 'synthetic-clinical-demo.pdf', mediaType: 'application/pdf', byteLength: 964,
  sha256: 'ff33beb1f5c938fc0b3d264b2b21ab02e3bb3e0e4447a1dacdeb30172bf1c93c' };
const result = { checkedAtUtc: new Date().toISOString(), sqlWrites: 0, signatures: 0, submissions: 0 };

async function audit() {
  const creationHash = requiredDemoDigest(env, 'TRUSTLEAF_DEMO_CREATION_TX_SHA256');
  const pdfMode = args[2] === '--pdf-scope';
  check(args.length === (pdfMode ? 3 : 2) && args[0] === '--sha256' && hex.test(args[1]), 'approved_digest_required');
  const encoded = readFileSync(privateFile(pdfMode ? 'digital-cabs-pdf-scope.private.json' : 'digital-cabs-scope.private.json'));
  check(encoded.length <= 4096 && sha(encoded).toString('hex') === args[1], 'scope_digest_mismatch');
  const plan = JSON.parse(encoded);
  const labels = pdfMode ? ['grant', 'note', 'pdf'] : ['grant', 'note'];
  const ids = labels.map(name => plan[name + 'RequestId']), scopedIds = [plan.runId, ...ids];
  const reviewed = JSON.parse(readFileSync(privateFile('nota-demo-digital-cabs.en.json'), 'utf8').replace(/^\uFEFF/, ''));
  check(plan.schemaVersion === 1 && plan.network === 'testnet' && plan.contractId === clinic && plan.registryId === registry && Number.isSafeInteger(plan.doctorId) && plan.doctorId > 0 && String(plan.doctorId) === env.TRUSTLEAF_DEMO_DOCTOR_ID &&
    scopedIds.every(id => uuid.test(id)) && new Set(scopedIds).size === scopedIds.length && hex.test(plan.historyId) &&
    Number.isSafeInteger(plan.openedAt) && Number.isSafeInteger(plan.until) && plan.until > plan.openedAt &&
    plan.until - plan.openedAt <= 3600 && isDeepStrictEqual(plan.note, { ...reviewed, eventDate: null }), 'scope_unverified');
  if (pdfMode) {
    check(args[1] === requiredDemoDigest(env, 'TRUSTLEAF_DEMO_PDF_SCOPE_SHA256'), 'scope_digest_mismatch');
    check(isDeepStrictEqual(plan.pdf, approvedPdf) && hex.test(plan.grantTransactionHash) && hex.test(plan.noteTransactionHash) &&
      plan.grantTransactionHash !== plan.noteTransactionHash, 'pdf_scope_unverified');
  }
  const { databaseConnectionString } = await load('database-connection.mjs');
  const connection = databaseConnectionString(env), host = new URL(connection).hostname;
  check(env.TRUSTLEAF_ENV === 'local' && env.PRIVY_APP_ID === app && env.NEXT_PUBLIC_STELLAR_NETWORK === 'testnet' &&
    env.CLINICAL_HISTORY_PRIVATE_CONTRACT_ID === clinic && env.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID === registry &&
    env.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY === authority && env.TRUSTLEAF_DB_HOST === host &&
    env.TRUSTLEAF_DEMO_DB_HOST === host && /^ep-[a-z0-9-]+\.c-3\.us-east-1\.aws\.neon\.tech$/.test(host), 'environment_unverified');
  const { PrivyClient } = require('@privy-io/server-auth'), { neon } = require('@neondatabase/serverless');
  const { Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } = require('@stellar/stellar-sdk');
  const { assertCurrentPrivyIdentity } = await load('private-worker-runtime.mjs');
  const { createClinicalWebAuditor, webClinicalHistoryId } = await load('clinical-web-receipt-audit.mjs');
  const { decodeSponsorshipReservation } = await load('sponsorship-sql-store.mjs');
  const { assertClinicalWebSponsoredFee } = await load('clinical-web-fee-policy.mjs');
  const { clinicalSimulationIsLive } = await load('clinical-live-read.mjs');
  const { clinicalRpcUrl } = await load('clinical-rpc.mjs');
  const { openClinicalVersion } = await load('clinical-crypto.mjs');
  const { sha256 } = await load('sponsorship-domain.mjs');
  const patient = plan.patient, doctor = plan.doctor;
  check(webClinicalHistoryId(patient.address) === plan.historyId && Keypair.fromSecret(env.RELAYER_SECRET).publicKey() === plan.relayer &&
    patient.userId !== doctor.userId && new Set([patient.address, doctor.address, plan.relayer]).size === 3, 'pair_unverified');
  const provider = new PrivyClient(app, env.PRIVY_APP_SECRET);
  await Promise.all([
    assertCurrentPrivyIdentity(provider, { ...patient, email: env.TRUSTLEAF_DEMO_PATIENT_EMAIL }),
    assertCurrentPrivyIdentity(provider, { ...doctor, email: env.TRUSTLEAF_DEMO_DOCTOR_EMAIL }),
  ]);
  const sql = neon(connection, { fetchOptions: { signal: AbortSignal.timeout(20_000) } });
  const [histories, operations, reservations, versions, related] = await sql.transaction([
    sql.query("SELECT owner_user_id,wallet_id,patient_wallet,transaction_hash FROM clinical_web_histories WHERE network='testnet' AND contract_id=$1 AND history_id=$2", [clinic, plan.historyId]),
    sql.query('SELECT * FROM clinical_web_operations WHERE id=ANY($1::uuid[])', [ids]),
    sql.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=ANY($1::uuid[])', [ids]),
    sql.query("SELECT entry_id,version,context,commitment,envelope,operation_id,state,transaction_hash FROM clinical_private_versions WHERE network='testnet' AND contract_id=$1 AND history_id=$2 LIMIT 3", [clinic, plan.historyId]),
    sql.query("SELECT id,action,state,transaction_hash FROM clinical_web_operations WHERE network='testnet' AND contract_id=$1 AND expected->>'historyId'=$2 LIMIT 5", [clinic, plan.historyId]),
  ], { readOnly: true, isolationLevel: 'RepeatableRead' });
  const [history] = histories;
  check(histories.length === 1 && history.owner_user_id === patient.userId && history.wallet_id === patient.walletId &&
    history.patient_wallet === patient.address && history.transaction_hash === creationHash &&
    related.filter(row => row.action === 'create_history' && row.state === 'confirmed' && row.transaction_hash === creationHash).length === 1 &&
    related.every(row => row.transaction_hash === creationHash || ids.includes(row.id)), 'history_or_scope_unverified');
  const rows = Object.fromEntries(labels.map((name, index) => [name, operations.find(row => row.id === ids[index])]));
  if (pdfMode) {
    check(rows.grant?.state === 'confirmed' && rows.grant.transaction_hash === plan.grantTransactionHash &&
      rows.note?.state === 'confirmed' && rows.note.transaction_hash === plan.noteTransactionHash, 'pdf_baseline_unverified');
  }
  const holds = Object.fromEntries(labels.map((name, index) => {
    const found = reservations.find(row => row.request_id === ids[index]);
    return [name, found ? decodeSponsorshipReservation(found) : null];
  }));
  result.steps = Object.fromEntries(labels.map(name => [name, {
    state: rows[name]?.state ?? 'not_created', reservation: holds[name]?.state ?? null,
    hash: rows[name]?.transaction_hash ?? null,
  }]));
  result.inventory = { entries: new Set(versions.filter(v => v.state === 'confirmed').map(v => v.entry_id)).size,
    versions: versions.filter(v => v.state === 'confirmed').length };
  result.remainingReservations = Object.values(holds).filter(r => ['reserved', 'signed', 'submitted'].includes(r?.state)).length;
  if (rows.grant?.state !== 'confirmed') return 'pending';

  const rpcServer = new rpc.Server(clinicalRpcUrl('gateway'), { timeout: 20_000 });
  check((await rpcServer.getNetwork()).passphrase === Networks.TESTNET, 'network_mismatch');
  let floor = 0;
  const cache = new Map();
  const reader = { getNetwork: () => rpcServer.getNetwork(), getTransaction: async hash => {
    check(cache.has(hash), 'receipt_scope_unverified');
    return cache.get(hash);
  }, async simulateTransaction(tx) {
    const s = await rpcServer.simulateTransaction(tx);
    check(Number.isSafeInteger(s.latestLedger) && s.latestLedger >= floor && rpc.Api.isSimulationSuccess(s) &&
      !('restorePreamble' in s) && !rpc.Api.isSimulationRestore(s) && clinicalSimulationIsLive(s) &&
      Array.isArray(s.result?.auth) && s.result.auth.length === 0, 'canonical_read_unavailable');
    floor = s.latestLedger;
    return s;
  } };
  const address = value => new Address(value).toScVal();
  const bytes = value => xdr.ScVal.scvBytes(Buffer.from(value, 'hex'));
  const struct = fields => xdr.ScVal.scvMap(Object.keys(fields).sort().map(key =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val: fields[key] })));
  async function read(method, args) {
    const tx = new TransactionBuilder(new Account(authority, '0'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(clinic).call(method, ...args)).setTimeout(60).build();
    return scValToNative((await reader.simulateTransaction(tx)).result.retval);
  }
  async function receiptFor(name, actor, action) {
    const row = rows[name], hold = holds[name], e = row.expected, hash = row.transaction_hash;
    check(row.network === 'testnet' && row.contract_id === clinic && row.actor_user_id === actor.userId &&
      row.wallet_id === actor.walletId && row.source_wallet === actor.address && row.action === action && row.method === action &&
      e.historyId === plan.historyId && e.patient === patient.address && hex.test(e.operationId) && hex.test(hash) &&
      hold?.state === 'settled' && hold.outcome === 'SUCCESS' && hold.transactionHash === hash &&
      hold.binding.actorId === actor.userId && hold.binding.walletId === actor.walletId && hold.binding.sourceAddress === actor.address &&
      hold.binding.patientAddress === patient.address && hold.binding.contractId === clinic && hold.binding.action === action &&
      hold.binding.sponsorAddress === plan.relayer && sha256(row.unsigned_xdr) === hold.quote.unsignedHash, 'receipt_binding_unverified');
    const receipt = await rpcServer.getTransaction(hash), outer = TransactionBuilder.fromXDR(row.signed_xdr, Networks.TESTNET);
    check(receipt.status === 'SUCCESS' && receipt.feeBump === true && receipt.envelopeXdr?.toXDR().equals(outer.toEnvelope().toXDR()) &&
      outer.hash().toString('hex') === hash && outer.feeSource === plan.relayer && outer.fee === hold.quote.offeredFeeStroops &&
      BigInt(outer.fee) <= 10_000_000n && sha256(outer.innerTransaction.toXDR()) === hold.signedInnerDigest &&
      outer.innerTransaction.hash().toString('hex') === hold.quote.signingHash &&
      receipt.resultXdr.feeCharged().toString() === hold.chargedStroops && receipt.ledger === hold.ledger, 'receipt_settlement_unverified');
    assertClinicalWebSponsoredFee(outer);
    floor = Math.max(floor, receipt.ledger);
    cache.set(hash, receipt);
    Object.assign(result.steps[name], { ledger: receipt.ledger, offeredStroops: hold.quote.offeredFeeStroops, chargedStroops: hold.chargedStroops });
    return { receipt, outer };
  }
  const grant = rows.grant.expected;
  check(grant.doctorId === plan.doctorId && grant.doctor === doctor.address && grant.canRead === true && grant.canAppend === true &&
    grant.expectedRevision === 0, 'grant_action_mismatch');
  await receiptFor('grant', patient, 'set_permissions');
  const auditor = createClinicalWebAuditor({ server: reader, relayer: plan.relayer });
  const grantProof = await auditor.operation({ state: 'confirmed', action: 'set_permissions', transactionHash: rows.grant.transaction_hash }, {
    action: 'set_permissions', patient: patient.address, doctor: { id: 9, address: doctor.address },
    payload: { doctorId: plan.doctorId, expectedRevision: 0, canRead: true, canAppend: true },
  });
  check(grantProof.operationId === grant.operationId, 'grant_operation_unverified');
  const canonicalGrant = await read('get_grant', [bytes(plan.historyId), address(doctor.address)]);
  check(canonicalGrant.can_read === true && canonicalGrant.can_append === true && Number(canonicalGrant.revision) === 1, 'grant_state_unverified');
  result.grant = { canRead: true, canAppend: true, revision: 1 };
  if (rows.note?.state !== 'confirmed') return 'pending';

  const keyring = JSON.parse(env.TRUSTLEAF_CLINICAL_KEYRING);
  async function verifyContribution(name) {
    const e = rows[name].expected, isPdf = name === 'pdf';
    check(e.author === doctor.address && e.expectedVersion === 0 && e.expectedGrantRevision === 1 &&
      e.previousCommitment === null && hex.test(e.entryId) && hex.test(e.commitment), name + '_action_mismatch');
    const { receipt, outer } = await receiptFor(name, doctor, 'append_version');
    const entrySeed = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('entry_id'), xdr.ScVal.scvBytes(sha(Networks.TESTNET)),
      address(clinic), bytes(plan.historyId), address(doctor.address), bytes(e.operationId)]);
    check(sha(entrySeed.toXDR()).toString('hex') === e.entryId, name + '_entry_derivation_unverified');
    const input = struct({ history_id: bytes(plan.historyId), entry_id: bytes(e.entryId), author: address(doctor.address),
      commitment: bytes(e.commitment), expected_version: nativeToScVal(0, { type: 'u32' }),
      expected_grant_revision: nativeToScVal(1n, { type: 'u64' }), operation_id: bytes(e.operationId) });
    const invocation = new Contract(clinic).call('append_version', input).body().invokeHostFunctionOp().hostFunction();
    const inner = outer.innerTransaction, op = inner.operations[0];
    check(inner.source === doctor.address && inner.operations.length === 1 && op.type === 'invokeHostFunction' &&
      op.source === undefined && op.func.toXDR().equals(invocation.toXDR()) && op.auth?.length === 1, name + '_invocation_unverified');
    const [auth] = op.auth, root = auth.rootInvocation();
    check(auth.credentials().switch().name === 'sorobanCredentialsSourceAccount' && root.subInvocations().length === 0 &&
      root.function().switch().name === 'sorobanAuthorizedFunctionTypeContractFn' &&
      root.function().contractFn().toXDR().equals(invocation.invokeContract().toXDR()), name + '_auth_scope_unverified');
    for (const [tx, actor] of [[inner, doctor.address], [outer, plan.relayer]]) {
      const key = Keypair.fromPublicKey(actor), [signature] = tx.signatures;
      check(tx.signatures.length === 1 && signature.hint().equals(key.signatureHint()) &&
        key.verify(tx.hash(), signature.signature()), name + '_signatures_unverified');
    }
    const outerResult = receipt.resultXdr.result();
    check(outerResult.switch().name === 'txFeeBumpInnerSuccess', name + '_result_unverified');
    const pair = outerResult.innerResultPair(), innerResult = pair.result().result();
    check(pair.transactionHash().equals(inner.hash()) && innerResult.switch().name === 'txSuccess' &&
      innerResult.results().length === 1, name + '_result_unverified');
    const operation = innerResult.results()[0], meta = receipt.resultMetaXdr, value = meta.value();
    check(operation.switch().name === 'opInner' && operation.tr().switch().name === 'invokeHostFunction' &&
      [3, 4].includes(meta.switch()) && value.sorobanMeta()?.returnValue().toXDR().equals(receipt.returnValue.toXDR()), name + '_result_unverified');
    const events = meta.switch() === 3 ? value.sorobanMeta().events() : value.operations()[0]?.events();
    const operationResult = operation.tr().invokeHostFunctionResult();
    check(Array.isArray(events) && operationResult.switch().name === 'invokeHostFunctionSuccess' &&
      operationResult.success().equals(sha(new xdr.InvokeHostFunctionSuccessPreImage({ returnValue: receipt.returnValue, events }).toXDR())), name + '_event_unverified');
    const chainVersion = await read('get_version', [bytes(plan.historyId), bytes(e.entryId), nativeToScVal(1, { type: 'u32' })]);
    const returned = scValToNative(receipt.returnValue);
    const durable = await read('get_operation', [address(doctor.address), bytes(e.operationId)]);
    const preimage = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('append'), address(clinic), input]);
    check(isDeepStrictEqual(chainVersion, returned) && returned.author === doctor.address && Number(returned.version) === 1 &&
      Buffer.from(returned.commitment).toString('hex') === e.commitment && returned.previous_commitment === null &&
      Buffer.from(durable.digest).equals(sha(preimage.toXDR())) && isDeepStrictEqual(durable.outcome, ['Version', returned]), name + '_chain_record_unverified');
    const stored = versions.find(version => version.entry_id === e.entryId && Number(version.version) === 1);
    const context = { schemaVersion: 1, network: 'testnet', contractId: clinic, historyId: plan.historyId, entryId: e.entryId,
      author: doctor.address, patient: patient.address, version: 1, previousCommitment: null };
    check(stored?.state === 'confirmed' && stored.commitment === e.commitment && stored.transaction_hash === rows[name].transaction_hash &&
      stored.operation_id === e.operationId && isDeepStrictEqual(stored.context, context), name + '_inventory_unverified');
    const decoded = openClinicalVersion({ envelope: stored.envelope, expectedContext: context, expectedCommitment: e.commitment, keyring });
    try {
      if (isPdf) {
        check(decoded.metadata.mediaType === approvedPdf.mediaType && decoded.metadata.fileName === approvedPdf.fileName &&
          decoded.content.length === approvedPdf.byteLength && sha(decoded.content).toString('hex') === approvedPdf.sha256,
        'synthetic_pdf_content_unverified');
      } else {
        check(decoded.metadata.mediaType === 'application/json' && decoded.metadata.fileName === 'antecedente.json' &&
          isDeepStrictEqual(JSON.parse(decoded.content.toString('utf8')), plan.note), 'synthetic_note_content_unverified');
      }
    } finally { decoded.content.fill(0); }
    return e.entryId;
  }
  const noteEntryId = await verifyContribution('note');
  result.note = { author: 'Cabs', version: 1, syntheticContentVerified: true };
  if (pdfMode) {
    if (rows.pdf?.state !== 'confirmed') return 'pending';
    const pdfEntryId = await verifyContribution('pdf');
    check(pdfEntryId !== noteEntryId && rows.pdf.transaction_hash !== plan.noteTransactionHash &&
      rows.pdf.transaction_hash !== plan.grantTransactionHash, 'pdf_new_entry_unverified');
    result.pdf = { author: 'Cabs', version: 1, byteLength: approvedPdf.byteLength, sha256: approvedPdf.sha256,
      syntheticContentVerified: true, originalNoteRetained: true };
  }
  const count = pdfMode ? 2 : 1;
  check(versions.length === count && result.inventory.entries === count && result.inventory.versions === count &&
    result.remainingReservations === 0, 'final_inventory_or_reservation_unverified');
  result.totalChargedStroops = labels.reduce((total, name) => total + BigInt(result.steps[name].chargedStroops), 0n).toString();
  return 'verified';
}

try { result.status = await audit(); }
catch (error) { result.status = 'unverified'; result.reason = error.auditCode ?? 'read_unavailable'; process.exitCode = 1; }
console.log(JSON.stringify(result));
