#!/usr/bin/env node
/** Exactly one separately approved fourteen-key Testnet restoration. Diagnostics
 * never reserve an attempt or start an approval clock. A saved signature is
 * reconciled, never signed again or automatically resubmitted. */
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Account, BASE_FEE, Keypair, Networks, Operation, SorobanDataBuilder, Transaction, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import * as policyModule from './lib/clinical-rehearsal-policy.mjs';
import * as budgetModule from './lib/clinical-rehearsal-budget.mjs';
import { clinicalAttemptStore } from './lib/clinical-attempt-store.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { acquireSignerLock } from './lib/private-worker-runtime.mjs';
import { rehearsalRunLockKey } from './lib/clinical-rehearsal-closure.mjs';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { checkClinicalWebRelayerBudget } from './lib/clinical-web-fee-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'restore14', HASH = /^[a-f0-9]{64}$/;
const epoch = () => Math.floor(Date.now()/1000);
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => Error(code ?? 'clinical_rehearsal_maintenance_rejected');
const check = (value, code) => { if (!value) throw fail(code); };
const xlm = value => { const n=BigInt(value);return `${n/10000000n}.${String(n%10000000n).padStart(7,'0')}`; };
const same = (a,b) => Buffer.from(a).equals(Buffer.from(b));

/** Scope validation only. No metadata object, preview or decoded transaction
 * returned by these pure helpers grants financial authority. */
function maintenanceDescriptor(policy) {
  check(!policy.closingContinuation);
  return policy.restoredCompletion?.restoration ?? policy.maintenanceContinuation;
}
export function maintenanceFootprint(policy) {
  const m=policy?.restoredCompletion?.restoration??policy?.maintenanceContinuation, pinned=policy.restoredCompletion ? policy.restoredCompletion.restoration : policyModule.rehearsalMaintenanceDescriptor();
  const count=policy.restoredCompletion ? 27 : 14;
  check(m && m.requestId===pinned.requestId && m.source===policy.relayer && m.maxFeeStroops==='20000000' &&
    m.keysSha256===pinned.keysSha256 && m.footprintSha256===pinned.footprintSha256 && Array.isArray(m.keys) && m.keys.length===count);
  const keys=m.keys.map(value=>{check(typeof value==='string');const key=xdr.LedgerKey.fromXDR(value,'base64');check(key.toXDR('base64')===value);return key;});
  const encoded=keys.map(key=>key.toXDR('base64')).sort();
  check(new Set(encoded).size===count && sha(encoded.join('\n'))===pinned.keysSha256);
  return keys;
}
export function inspectMaintenanceTransaction(policy, transaction, {signed=false}={}) {
  const keys=maintenanceFootprint(policy), m=maintenanceDescriptor(policy);
  check(transaction instanceof Transaction && transaction.networkPassphrase===Networks.TESTNET && transaction.source===m.source &&
    transaction.operations.length===1 && transaction.operations[0].type==='restoreFootprint' && transaction.operations[0].source===undefined);
  const body=transaction.toEnvelope().v1().tx(), expected=Operation.restoreFootprint({});
  check(body.memo().switch().name==='memoNone' && body.cond().switch().name==='precondTime' && Number(transaction.timeBounds.minTime)===0 &&
    /^\d+$/.test(transaction.sequence) && BigInt(transaction.sequence)>0n &&
    same(body.operations()[0].toXDR(),expected.toXDR()) && body.ext().switch()===1);
  const data=body.ext().sorobanData(), footprint=data.resources().footprint(), actual=footprint.readWrite().map(key=>key.toXDR('base64')).sort();
  check(!footprint.readOnly().length && actual.length===keys.length && new Set(actual).size===keys.length && sha(actual.join('\n'))===m.keysSha256);
  check(actual.every((value,index)=>value===keys.map(key=>key.toXDR('base64')).sort()[index]));
  const offered=BigInt(transaction.fee), resource=BigInt(data.resourceFee().toString()), maxTime=Number(transaction.timeBounds.maxTime);
  check(resource>=0n && offered===resource+BigInt(BASE_FEE) && offered<=BigInt(m.maxFeeStroops) && offered>0n &&
    data.resources().diskReadBytes()>0 && data.resources().writeBytes()>0 &&
    Number.isSafeInteger(maxTime) && maxTime>policy.createdAt && maxTime<=policy.until);
  if (signed) {
    const key=Keypair.fromPublicKey(m.source), signatures=transaction.signatures;
    check(signatures.length===1 && same(signatures[0].hint(),key.signatureHint()) && key.verify(transaction.hash(),signatures[0].signature()));
  } else check(transaction.signatures.length===0);
  return {offeredFeeStroops:offered.toString(),resourceFeeStroops:resource.toString(),maxTime,
    unsignedBodyHash:transaction.hash().toString('hex'),footprintSha256:sha(footprint.toXDR())};
}
export async function prepareMaintenanceQuote({policy,server,now=epoch}) {
  const keys=maintenanceFootprint(policy), m=maintenanceDescriptor(policy);
  check((await server.getNetwork()).passphrase===Networks.TESTNET);
  const source=await server.getAccount(m.source);check(source instanceof Account && source.accountId()===m.source);
  const first=new TransactionBuilder(new Account(source.accountId(),source.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .setSorobanData(new SorobanDataBuilder().setReadWrite(keys).build()).addOperation(Operation.restoreFootprint({}))
    .setTimebounds(0,Math.min(now()+180,policy.until)).build();
  const simulation=await server.simulateTransaction(first);
  check(rpc.Api.isSimulationSuccess(simulation) && !rpc.Api.isSimulationRestore(simulation) && !('restorePreamble' in simulation) &&
    /^\d+$/.test(simulation.minResourceFee) && Number.isSafeInteger(simulation.latestLedger) && simulation.latestLedger>0);
  if (simulation.result?.auth!==undefined) check(Array.isArray(simulation.result.auth) && simulation.result.auth.length===0);
  const data=new SorobanDataBuilder(simulation.transactionData.build()).build();
  check(BigInt(data.resourceFee().toString())===BigInt(simulation.minResourceFee));
  const preparedAt=now();
  const transaction=new TransactionBuilder(new Account(source.accountId(),source.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .setSorobanData(data).addOperation(Operation.restoreFootprint({})).setTimebounds(0,Math.min(preparedAt+180,policy.until)).build();
  const inspected=inspectMaintenanceTransaction(policy,transaction);
  check(inspected.maxTime>preparedAt);
  return {transaction,metadata:{status:'UNSIGNED_DIAGNOSTIC_ONLY',network:'testnet',source:m.source,requestId:m.requestId,
    keyCount:m.keys.length,approvedKeysSha256:m.keysSha256,observedFootprintSha256:inspected.footprintSha256,observedLedger:simulation.latestLedger,
    preparedAt,maxTime:inspected.maxTime,offeredFeeStroops:inspected.offeredFeeStroops,offeredFeeXlm:xlm(inspected.offeredFeeStroops),
    maximumFeeStroops:m.maxFeeStroops,maximumConservativelyHeldInAggregate:true,signatureRequested:false,submitted:false,journalCreated:false}};
}

/** CAS file journal, always in the already validated canonical private directory.
 * The caller holds signer/source/run locks before creating or changing it. */
export function maintenanceJournal(file,{keyCount=14}={}) {
  const expectedName=keyCount===27?'maintenance27-attempt.private.json':'maintenance-14-attempt.private.json';
  check([14,27].includes(keyCount) && typeof file==='string' && resolve(file)===file && basename(file)===expectedName);
  const parent=dirname(file);
  const location=()=>check(realpathSync(parent)===parent && !lstatSync(parent).isSymbolicLink());
  const load=()=>{
    location();if(!existsSync(file))return null;
    const stat=lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=1000000&&realpathSync(file)===file);
    return JSON.parse(readFileSync(file,'utf8'));
  };
  const durable=(path,value,flags)=>{const fd=openSync(path,flags,0o600);try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}};
  return {load,create(value){location();check(!existsSync(file));durable(file,value,'wx');return value;},
    update(value,previous){location();const current=load();check(current&&sha(JSON.stringify(current))===sha(JSON.stringify(previous)));
      const temp=file+'.tmp';check(resolve(temp)===resolve(parent,basename(file)+'.tmp'));durable(temp,value,'wx');
      location();check(sha(JSON.stringify(load()))===sha(JSON.stringify(previous)));renameSync(temp,file);return value;}};
}
function intent(policy,journal) {return sha(JSON.stringify(['TrustLeaf/approved-maintenance14/v1',policy.policyHash,journal.requestId,journal.source,journal.unsignedXdr]));}
function journalFor(policy,prepared) {
  const m=maintenanceDescriptor(policy), tx=prepared.transaction, value={schemaVersion:1,requestId:m.requestId,planHash:policy.policyHash,
    approvalHash:policy.approvalHash,network:'testnet',source:m.source,keysSha256:m.keysSha256,maximumFeeStroops:m.maxFeeStroops,
    preparedAt:prepared.metadata.preparedAt,unsignedXdr:tx.toXDR(),unsignedSha256:sha(tx.toXDR()),
    signingHash:tx.hash().toString('hex'),offeredFeeStroops:prepared.metadata.offeredFeeStroops,maxTime:prepared.metadata.maxTime,
    phase:'prepared',signedXdr:null,transactionHash:null,submissionAttempted:false,receipt:null};
  value.intent=intent(policy,value);return value;
}
function verifyJournal(policy,value) {
  const m=maintenanceDescriptor(policy);
  check(value&&value.schemaVersion===1&&value.requestId===m.requestId&&value.planHash===policy.policyHash&&value.approvalHash===policy.approvalHash&&
    value.network==='testnet'&&value.source===m.source&&value.keysSha256===m.keysSha256&&value.maximumFeeStroops===m.maxFeeStroops&&
    ['prepared','signing','signed','confirmed','failed'].includes(value.phase)&&typeof value.unsignedXdr==='string'&&
    sha(value.unsignedXdr)===value.unsignedSha256&&value.intent===intent(policy,value)&&typeof value.submissionAttempted==='boolean');
  const tx=TransactionBuilder.fromXDR(value.unsignedXdr,Networks.TESTNET), checked=inspectMaintenanceTransaction(policy,tx);
  check(value.signingHash===checked.unsignedBodyHash&&value.offeredFeeStroops===checked.offeredFeeStroops&&value.maxTime===checked.maxTime&&
    Number.isSafeInteger(value.preparedAt)&&value.preparedAt>=policy.createdAt&&value.preparedAt<value.maxTime&&value.maxTime<=value.preparedAt+180);
  if(value.signedXdr!==null){const signed=TransactionBuilder.fromXDR(value.signedXdr,Networks.TESTNET);inspectMaintenanceTransaction(policy,signed,{signed:true});
    check(signed.hash().toString('hex')===value.transactionHash&&value.transactionHash===value.signingHash&&
      same(signed.toEnvelope().v1().tx().toXDR(),tx.toEnvelope().v1().tx().toXDR()));
  }else check(value.transactionHash===null&&!value.submissionAttempted&&!['signed','confirmed','failed'].includes(value.phase));
  return tx;
}
export function verifyMaintenanceReceipt(policy,journal,receipt) {
  verifyJournal(policy,journal);check(journal.signedXdr&&['SUCCESS','FAILED'].includes(receipt?.status));
  const tx=TransactionBuilder.fromXDR(journal.signedXdr,Networks.TESTNET);
  check(receipt.envelopeXdr instanceof xdr.TransactionEnvelope && receipt.resultXdr instanceof xdr.TransactionResult &&
    same(receipt.envelopeXdr.toXDR(),tx.toEnvelope().toXDR())&&Number.isSafeInteger(receipt.ledger)&&receipt.ledger>0);
  const charged=BigInt(receipt.resultXdr.feeCharged().toString()), result=receipt.resultXdr.result();
  check(charged>=0n&&charged<=BigInt(journal.offeredFeeStroops)&&charged<=20000000n);
  if(receipt.status==='SUCCESS')check(result.switch().name==='txSuccess'&&result.results().length===1&&
    result.results()[0].switch().name==='opInner'&&result.results()[0].tr().switch().name==='restoreFootprint'&&
    result.results()[0].tr().restoreFootprintResult().switch().name==='restoreFootprintSuccess');
  else {
    check(!['txSuccess','txFeeBumpInnerSuccess','txFeeBumpInnerFailed'].includes(result.switch().name));
    if(result.switch().name==='txFailed'){
      check(result.results().length===1);const operation=result.results()[0];
      if(operation.switch().name==='opInner')check(operation.tr().switch().name==='restoreFootprint'&&operation.tr().restoreFootprintResult().switch().name!=='restoreFootprintSuccess');
    }
  }
  return {status:receipt.status,transactionHash:journal.transactionHash,ledger:receipt.ledger,feeChargedStroops:charged.toString(),feeChargedXlm:xlm(charged)};
}
async function connect(url) {
  const {Pool,neonConfig}=await import('@neondatabase/serverless');neonConfig.webSocketConstructor=(await import('ws')).default;
  const pool=new Pool({connectionString:url,connectionTimeoutMillis:15000});let client;
  try{client=await pool.connect();return{client,close:async()=>{client.release();await pool.end();}};}catch(error){await pool.end();throw error;}
}
function reconciliationInstant(env) {
  const own=JSON.parse(readFileSync(resolve(dirname(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE),'approval.private.json'),'utf8'));
  check(Number.isSafeInteger(own.approvedAt)&&own.approvedAt>0);return own.approvedAt;
}
async function noNewSteps(client,policy) {
  const future=policy.steps.filter(step=>['append_pdf','correct_note','revoke'].includes(step.key)).map(step=>step.requestId);
  const row=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM doctor_authorization_requests WHERE id=$1::uuid
    UNION ALL SELECT 1 FROM clinical_web_operations WHERE id=ANY($2::uuid[])
    UNION ALL SELECT 1 FROM sponsorship_reservations WHERE network='testnet' AND state<>'released'
      AND payload->'binding'->>'patientAddress'=$3 AND payload->'binding'->>'sponsorAddress'=$4
      AND ($5::uuid IS NULL OR NOT (state='settled' AND request_id=$5::uuid))
  ) AS busy`,[policy.authorization.requestId,future,policy.patient.address,policy.relayer,policy.restoredCompletion?.priorAuthorization.requestId??null])).rows[0];
  check(row?.busy===false,'clinical_rehearsal_order_conflict');
}
async function noCompeting(client,scope) {
  const row=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state IN ('pending','submitted')
    UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND state IN ('prepared','submitted','cancel_requested')
    UNION ALL SELECT 1 FROM private_operations WHERE state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_web_operations WHERE network='testnet' AND state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_transaction_attempts WHERE state IN ('prepared','submitted') AND NOT(run_id=$1::uuid AND operation_name=$2 AND source_wallet=$3)
  ) AS busy`,[scope.requestId,NAME,scope.source])).rows[0];check(row?.busy===false,'clinical_rehearsal_authority_busy');
}
/** Injected adapters are local tests only; the CLI supplies none. */
export async function runMaintenanceRehearsal({env=process.env,mode='--prepare',adapters={}}={}) {
  check(['--prepare','--once','--reconcile'].includes(mode));const now=adapters.now??epoch, load=adapters.loadPolicy??policyModule.loadRehearsalPolicy;
  let options={env,requireApproval:true};
  if(mode==='--prepare') {
    const raw=JSON.parse(readFileSync(env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE,'utf8'));check([13,19].includes(raw.schemaVersion));
    const previewEnv={...env};delete previewEnv.TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH;
    options={env:previewEnv,requireApproval:false,now:now(),previewApproval:{schemaVersion:1,planHash:env.TRUSTLEAF_CLINICAL_REHEARSAL_HASH,
      approvedAt:now(),statement:'Technical unsigned maintenance diagnostics only; no human approval or execution authority.'}};
  } else if(mode==='--reconcile')options.now=(adapters.reconciliationInstant??reconciliationInstant)(env);
  const policy=load(options);check(policy&&policy.maintenanceContinuation);
  const scope=mode==='--prepare'?maintenanceDescriptor(policy):(adapters.assertScope??policyModule.assertRehearsalMaintenanceBudget)(policy,{now:options.now??now()});
  maintenanceFootprint(policy);
  check(env.TRUSTLEAF_ENV==='local'&&env.TRUSTLEAF_PRIVATE_WRITES_ENABLED==='false'&&env.NEXT_PUBLIC_STELLAR_NETWORK==='testnet');
  const server=adapters.server??new rpc.Server('https://soroban-testnet.stellar.org');
  if(mode==='--prepare') {
    const old=(adapters.journal??maintenanceJournal(scope.attemptFile,{keyCount:policy.restoredCompletion?27:14})).load();
    check(!old,'clinical_rehearsal_order_conflict');
    return (await prepareMaintenanceQuote({policy,server,now})).metadata;
  }
  check((await server.getNetwork()).passphrase===Networks.TESTNET);
  const url=new URL(databaseConnectionString(env));check(['postgres:','postgresql:'].includes(url.protocol)&&
    /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname)&&env.TRUSTLEAF_DB_HOST===url.hostname);
  url.hostname=url.hostname.replace('-pooler.','.');
  let releaseSigner,connection,locks,runKey,runHeld=false,stopped=false;
  const stop=()=>{stopped=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    releaseSigner=await(adapters.acquireSignerLock??acquireSignerLock)(env.STELLAR_CONFIG_DIR,scope.source);check(releaseSigner,'clinical_rehearsal_authority_busy');
    connection=await(adapters.connect??connect)(url.href);const client=connection.client;
    locks=await(adapters.acquireSourceLocks??acquireClinicalSourceLocks)(client,[scope.source]);await locks.assertHeld();
    runKey=rehearsalRunLockKey(policy);check(runKey);
    check((await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[runKey])).rows[0]?.locked===true,'clinical_rehearsal_authority_busy');runHeld=true;
    const journal=adapters.journal??maintenanceJournal(scope.attemptFile,{keyCount:policy.restoredCompletion?27:14}), store=(adapters.createAttemptStore??clinicalAttemptStore)(client,{runId:scope.requestId,source:scope.source});
    let saved=journal.load();if(saved)verifyJournal(policy,saved);
    let persisted=await store.load(NAME);
    if(persisted){check(saved&&persisted.intent===saved.intent&&persisted.source===scope.source);const recovered={...saved,phase:'signed',signedXdr:persisted.xdr,transactionHash:persisted.hash};
      verifyJournal(policy,recovered);if(!saved.signedXdr)saved=journal.update(recovered,saved);}
    const reconcile=async()=>{
      if(!saved?.signedXdr)return{status:saved?.phase==='signing'?'SIGNATURE_UNCERTAIN':'NOT_SUBMITTED',readOnly:true,requestId:scope.requestId,phase:saved?.phase??'absent',conservativelyHeldStroops:scope.maxFeeStroops};
      verifyJournal(policy,saved);
      if(!persisted){await store.reserve(NAME,{intent:saved.intent,source:scope.source});await store.save(NAME,{intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash});persisted={intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash};}
      let receipt;try{receipt=await server.getTransaction(saved.transactionHash);}catch{return{status:'PENDING_UNKNOWN',readOnly:true,transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maxFeeStroops};}
      if(!['SUCCESS','FAILED'].includes(receipt.status))return{status:'PENDING_UNKNOWN',readOnly:true,transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maxFeeStroops};
      const proof=verifyMaintenanceReceipt(policy,saved,receipt);await locks.assertHeld();
      await store.complete(NAME,proof);
      const terminal={...saved,phase:proof.status==='SUCCESS'?'confirmed':'failed',receipt:proof};saved=journal.update(terminal,saved);
      return{status:proof.status,readOnly:mode==='--reconcile',...proof,keyCount:scope.keys.length,conservativelyHeldStroops:scope.maxFeeStroops,liveClinicalReadVerificationPending:proof.status==='SUCCESS'};
    };
    if(mode==='--reconcile'||saved?.signedXdr||saved?.phase==='signing')return await reconcile();
    const active=async()=>{check(!stopped);const current=load({env,requireApproval:true});
      (adapters.assertScope??policyModule.assertRehearsalMaintenanceBudget)(current,{now:now()});check(current.policyHash===policy.policyHash&&current.approvalHash===policy.approvalHash);
      await locks.assertHeld();await noNewSteps(client,policy);await noCompeting(client,scope);};
    await active();
    if(policy.restoredCompletion){
      const id=policy.restoredCompletion.priorAuthorization.requestId;
      const [job]=(await client.query('SELECT id,state,action,method,doctor_id,doctor_user_id,doctor_email,wallet_id,wallet,contract_id,network,requested_by,requested_email,dossier_id,expected_version,target_version,valid_until,commitment,prepared_xdr,transaction_hash,error_code FROM doctor_authorization_requests WHERE id=$1',[id])).rows;
      const [reservationRow]=(await client.query('SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE request_id=$1',[id])).rows;
      (adapters.inspectPriorRenewal??budgetModule.inspectPriorRehearsalRenewal)(policy,{job,reservationRow});
    }
    const ids=policy.aggregateBudget.confirmedSteps.map(proof=>proof.requestId);
    const rows=(await client.query('SELECT id,state,action,method,source_wallet,actor_user_id,wallet_id,contract_id,network,expected,unsigned_xdr,signed_xdr,transaction_hash,signing_hash,error_code,expires_at FROM clinical_web_operations WHERE id=ANY($1::uuid[])',[ids])).rows;
    await(adapters.assertHistoricalCharges??budgetModule.assertRehearsalHistoricalCharges)(policy,{rows,receipt:hash=>server.getTransaction(hash),now:now()});
    await(adapters.checkBalance??checkClinicalWebRelayerBudget)(server,scope.source);
    if(!saved){check((await client.query('SELECT run_id FROM clinical_transaction_attempts WHERE run_id=$1::uuid AND operation_name=$2 AND source_wallet=$3',[scope.requestId,NAME,scope.source])).rows.length===0);
      saved=journal.create(journalFor(policy,await prepareMaintenanceQuote({policy,server,now})));}
    const unsigned=verifyJournal(policy,saved);
    await active();check(now()>=saved.preparedAt&&now()<saved.maxTime,'signature_request_expired');
    const account=await server.getAccount(scope.source);check(account.accountId()===scope.source&&BigInt(account.sequenceNumber())+1n===BigInt(unsigned.sequence),'clinical_rehearsal_sequence_changed');
    await active();check(now()<saved.maxTime,'signature_request_expired');
    const sign=(adapters.signerFactory??(()=>{const key=Keypair.fromSecret(env.RELAYER_SECRET);check(key.publicKey()===scope.source);return async value=>{const tx=TransactionBuilder.fromXDR(value,Networks.TESTNET);tx.sign(key);return tx.toXDR();};}))();
    saved=journal.update({...saved,phase:'signing'},saved);
    const signedXdr=await sign(saved.unsignedXdr), signed=TransactionBuilder.fromXDR(signedXdr,Networks.TESTNET);
    const bound={...saved,phase:'signed',signedXdr,transactionHash:signed.hash().toString('hex')};verifyJournal(policy,bound);saved=journal.update(bound,saved);
    await active();check(now()<saved.maxTime,'signature_request_expired');
    await store.reserve(NAME,{intent:saved.intent,source:scope.source});await store.save(NAME,{intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash});persisted={intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash};
    await active();check(now()<saved.maxTime,'signature_request_expired');saved=journal.update({...saved,submissionAttempted:true},saved);
    try{await server.sendTransaction(signed);}catch{return{status:'PENDING_UNKNOWN',transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maxFeeStroops};}
    // Submission response is not confirmation. Only the exact canonical receipt settles it.
    return await reconcile();
  } finally {
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    const errors=[];
    if(runHeld)try{check((await connection.client.query('SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',[runKey])).rows[0]?.unlocked===true);}catch(error){errors.push(error);}
    if(locks)await locks.release().catch(error=>errors.push(error));if(connection)await connection.close().catch(error=>errors.push(error));
    if(releaseSigner)await releaseSigner().catch(error=>errors.push(error));if(errors.length)throw fail('clinical_rehearsal_lock_cleanup_required');
  }
}
export async function main(argv=process.argv.slice(2)) {
  check(argv.length===1&&['--prepare','--once','--reconcile'].includes(argv[0]));process.loadEnvFile(resolve(ROOT,'.env.local'));
  return runMaintenanceRehearsal({mode:argv[0]});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(result=>console.log(JSON.stringify(result))).catch(error=>{
  const code=/^(?:clinical_rehearsal_[a-z_]+|signature_request_expired)$/.test(error?.message??'')?error.message:'clinical_rehearsal_maintenance_unavailable';
  console.error(JSON.stringify({status:'blocked',error:code}));process.exitCode=1;
});
