#!/usr/bin/env node
/** Exactly one separately approved ten-key read-proof Testnet restoration. Diagnostics
 * never reserve an attempt or start an approval clock. A saved signature is
 * reconciled, never signed again or automatically resubmitted. */
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Account, BASE_FEE, Keypair, Networks, Operation, SorobanDataBuilder, Transaction, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import {loadReadproofMaintenancePolicy,assertReadproofMaintenancePolicy,inspectReadproofMaintenanceProposal,readproofMaintenanceDescriptor} from './lib/clinical-readproof-maintenance-policy.mjs';
import {maintenanceJournal,verifyMaintenanceReceipt} from './run-clinical-rehearsal-maintenance.mjs';
import {decodeSponsorshipReservation} from './lib/sponsorship-sql-store.mjs';
import * as budgetModule from './lib/clinical-rehearsal-budget.mjs';
import { clinicalAttemptStore } from './lib/clinical-attempt-store.mjs';
import { acquireClinicalSourceLocks } from './lib/clinical-source-lock.mjs';
import { acquireSignerLock } from './lib/private-worker-runtime.mjs';
import { rehearsalRunLockKey } from './lib/clinical-rehearsal-closure.mjs';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { checkClinicalWebRelayerBudget } from './lib/clinical-web-fee-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'restoreproofs', HASH = /^[a-f0-9]{64}$/;
const epoch = () => Math.floor(Date.now()/1000);
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => Error(code ?? 'clinical_readproof_scope_rejected');
const check = (value, code) => { if (!value) throw fail(code); };
const xlm = value => { const n=BigInt(value);return `${n/10000000n}.${String(n%10000000n).padStart(7,'0')}`; };
const same = (a,b) => Buffer.from(a).equals(Buffer.from(b));

/** Scope validation only. No metadata object, preview or decoded transaction
 * returned by these pure helpers grants financial authority. */
export function readproofFootprint(policy) {
  const m=policy, pinned=readproofMaintenanceDescriptor();
  check(m && m.requestId===pinned.requestId && m.source===policy.parentPolicy.relayer && m.maxFeeStroops==='6672371' &&
    m.keysSha256===pinned.keysSha256 && m.footprintSha256===pinned.footprintSha256 && Array.isArray(m.keys) && m.keys.length===10);
  const keys=m.keys.map(value=>{check(typeof value==='string');const key=xdr.LedgerKey.fromXDR(value,'base64');check(key.toXDR('base64')===value);return key;});
  const encoded=keys.map(key=>key.toXDR('base64')).sort();
  check(new Set(encoded).size===10 && sha(encoded.join('\n'))===pinned.keysSha256);
  return keys;
}
export function inspectReadproofTransaction(policy, transaction, {signed=false}={}) {
  const keys=readproofFootprint(policy), m=policy;
  check(transaction instanceof Transaction && transaction.networkPassphrase===Networks.TESTNET && transaction.source===m.source &&
    transaction.operations.length===1 && transaction.operations[0].type==='restoreFootprint' && transaction.operations[0].source===undefined);
  const body=transaction.toEnvelope().v1().tx(), expected=Operation.restoreFootprint({});
  check(body.memo().switch().name==='memoNone' && body.cond().switch().name==='precondTime' && Number(transaction.timeBounds.minTime)===0 &&
    /^\d+$/.test(transaction.sequence) && BigInt(transaction.sequence)>0n &&
    same(body.operations()[0].toXDR(),expected.toXDR()) && body.ext().switch()===1);
  const data=body.ext().sorobanData(), footprint=data.resources().footprint(), actual=footprint.readWrite().map(key=>key.toXDR('base64')).sort();
  check(!footprint.readOnly().length && actual.length===10 && new Set(actual).size===10 && sha(actual.join('\n'))===m.keysSha256);
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
export async function prepareReadproofQuote({policy,server,now=epoch}) {
  const keys=readproofFootprint(policy), m=policy;
  check((await server.getNetwork()).passphrase===Networks.TESTNET);
  const source=await server.getAccount(m.source);check(source instanceof Account && source.accountId()===m.source);
  const first=new TransactionBuilder(new Account(source.accountId(),source.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .setSorobanData(new SorobanDataBuilder().setReadWrite(keys).build()).addOperation(Operation.restoreFootprint({}))
    .setTimebounds(0,Math.min(now()+300,policy.until)).build();
  const simulation=await server.simulateTransaction(first);
  check(rpc.Api.isSimulationSuccess(simulation) && !rpc.Api.isSimulationRestore(simulation) && !('restorePreamble' in simulation) &&
    /^\d+$/.test(simulation.minResourceFee) && Number.isSafeInteger(simulation.latestLedger) && simulation.latestLedger>0);
  if (simulation.result?.auth!==undefined) check(Array.isArray(simulation.result.auth) && simulation.result.auth.length===0);
  const data=new SorobanDataBuilder(simulation.transactionData.build()).build();
  check(BigInt(data.resourceFee().toString())===BigInt(simulation.minResourceFee));
  const preparedAt=now();
  const transaction=new TransactionBuilder(new Account(source.accountId(),source.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .setSorobanData(data).addOperation(Operation.restoreFootprint({})).setTimebounds(0,Math.min(preparedAt+300,policy.until)).build();
  const inspected=inspectReadproofTransaction(policy,transaction);
  check(inspected.maxTime>preparedAt);
  return {transaction,metadata:{status:'UNSIGNED_DIAGNOSTIC_ONLY',network:'testnet',source:m.source,requestId:m.requestId,
    keyCount:10,approvedKeysSha256:m.keysSha256,observedFootprintSha256:inspected.footprintSha256,observedLedger:simulation.latestLedger,
    preparedAt,maxTime:inspected.maxTime,offeredFeeStroops:inspected.offeredFeeStroops,offeredFeeXlm:xlm(inspected.offeredFeeStroops),
    maximumFeeStroops:m.maxFeeStroops,maximumConservativelyHeldInAggregate:true,signatureRequested:false,submitted:false,journalCreated:false}};
}

/** CAS file journal, always in the already validated canonical parent13 directory.
 * The caller holds signer/source/run locks before creating or changing it. */
export function readproofJournal(file) {
  check(typeof file==='string' && resolve(file)===file && basename(file)==='readproof-maintenance-attempt.private.json');
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
function intent(policy,journal) {return sha(JSON.stringify(['TrustLeaf/approved-readproof-maintenance10/v1',policy.planHash,journal.requestId,journal.source,journal.unsignedXdr]));}
function journalFor(policy,prepared) {
  const m=policy, tx=prepared.transaction, value={schemaVersion:1,requestId:m.requestId,planHash:policy.planHash,
    approvalHash:policy.approvalHash,network:'testnet',source:m.source,keysSha256:m.keysSha256,maximumFeeStroops:m.maxFeeStroops,
    preparedAt:prepared.metadata.preparedAt,unsignedXdr:tx.toXDR(),unsignedSha256:sha(tx.toXDR()),
    signingHash:tx.hash().toString('hex'),offeredFeeStroops:prepared.metadata.offeredFeeStroops,maxTime:prepared.metadata.maxTime,
    phase:'prepared',signedXdr:null,transactionHash:null,submissionAttempted:false,receipt:null};
  value.intent=intent(policy,value);return value;
}
function verifyJournal(policy,value) {
  const m=policy;
  check(value&&value.schemaVersion===1&&value.requestId===m.requestId&&value.planHash===policy.planHash&&value.approvalHash===policy.approvalHash&&
    value.network==='testnet'&&value.source===m.source&&value.keysSha256===m.keysSha256&&value.maximumFeeStroops===m.maxFeeStroops&&
    ['prepared','signing','signed','confirmed','failed'].includes(value.phase)&&typeof value.unsignedXdr==='string'&&
    sha(value.unsignedXdr)===value.unsignedSha256&&value.intent===intent(policy,value)&&typeof value.submissionAttempted==='boolean');
  const tx=TransactionBuilder.fromXDR(value.unsignedXdr,Networks.TESTNET), checked=inspectReadproofTransaction(policy,tx);
  check(value.signingHash===checked.unsignedBodyHash&&value.offeredFeeStroops===checked.offeredFeeStroops&&value.maxTime===checked.maxTime&&
    Number.isSafeInteger(value.preparedAt)&&value.preparedAt>=policy.createdAt&&value.preparedAt<value.maxTime&&value.maxTime<=value.preparedAt+300);
  if(value.signedXdr!==null){const signed=TransactionBuilder.fromXDR(value.signedXdr,Networks.TESTNET);inspectReadproofTransaction(policy,signed,{signed:true});
    check(signed.hash().toString('hex')===value.transactionHash&&value.transactionHash===value.signingHash&&
      same(signed.toEnvelope().v1().tx().toXDR(),tx.toEnvelope().v1().tx().toXDR()));
  }else check(value.transactionHash===null&&!value.submissionAttempted&&!['signed','confirmed','failed'].includes(value.phase));
  return tx;
}
export function verifyReadproofReceipt(policy,journal,receipt) {
  verifyJournal(policy,journal);check(journal.signedXdr&&['SUCCESS','FAILED'].includes(receipt?.status));
  const tx=TransactionBuilder.fromXDR(journal.signedXdr,Networks.TESTNET);
  check(receipt.envelopeXdr instanceof xdr.TransactionEnvelope && receipt.resultXdr instanceof xdr.TransactionResult &&
    same(receipt.envelopeXdr.toXDR(),tx.toEnvelope().toXDR())&&Number.isSafeInteger(receipt.ledger)&&receipt.ledger>0);
  const charged=BigInt(receipt.resultXdr.feeCharged().toString()), result=receipt.resultXdr.result();
  check(charged>=0n&&charged<=BigInt(journal.offeredFeeStroops)&&charged<=6672371n);
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
/** The two completed parent operations are immutable financial evidence, not
 * synthetic SQL receipts. Both exact SDK receipts and settled SQL bindings must
 * agree before a supplemental envelope can acquire a signature. */
export async function assertReadproofParentEvidence({scope,client,server,now=epoch(),readParentJournal=maintenanceJournal}) {
  const p=scope.parentPolicy, d=readproofMaintenanceDescriptor();
  const old=readParentJournal(p.maintenanceContinuation.attemptFile).load();
  check(old?.phase==='confirmed' && old.requestId===d.parentMaintenance.requestId && old.transactionHash===d.parentMaintenance.transactionHash);
  const originalRows=(await client.query('SELECT intent,signed_xdr,transaction_hash,state,source_wallet FROM clinical_transaction_attempts WHERE run_id=$1::uuid AND operation_name=$2 AND source_wallet=$3',
    [d.parentMaintenance.requestId,'restore14',scope.source])).rows;
  check(originalRows.length===1);const original=originalRows[0];
  check(original.state==='confirmed'&&original.source_wallet===scope.source&&original.intent===old.intent&&original.signed_xdr===old.signedXdr&&original.transaction_hash===old.transactionHash);
  const jobs=(await client.query('SELECT * FROM doctor_authorization_requests WHERE id=$1::uuid',[d.parentRenewal.requestId])).rows;
  check(jobs.length===1&&jobs[0].state==='confirmed'&&jobs[0].transaction_hash===d.parentRenewal.transactionHash);
  const evidence=await Promise.allSettled([server.getTransaction(d.parentMaintenance.transactionHash),server.getTransaction(d.parentRenewal.transactionHash)]);
  check(evidence.every(item=>item.status==='fulfilled'));
  const restored=verifyMaintenanceReceipt(p,old,evidence[0].value);
  check(restored.status==='SUCCESS'&&restored.transactionHash===d.parentMaintenance.transactionHash&&restored.ledger===d.parentMaintenance.ledger&&restored.feeChargedStroops===d.parentMaintenance.feeChargedStroops);
  const job=jobs[0],renewed=budgetModule.verifiedRehearsalAuthorizationReceipt(p,job,evidence[1].value);
  check(renewed.status==='SUCCESS'&&renewed.transactionHash===d.parentRenewal.transactionHash&&renewed.ledger===d.parentRenewal.ledger&&renewed.feeChargedStroops===d.parentRenewal.feeChargedStroops);
  const reserves=(await client.query("SELECT request_id,network,utc_day::text,state,transaction_hash,payload FROM sponsorship_reservations WHERE network='testnet' AND payload->'binding'->>'patientAddress'=$1 AND payload->'binding'->>'sponsorAddress'=$2",[p.patient.address,scope.source])).rows;
  let renewalReservations=0;
  for(const row of reserves){
    const r=decodeSponsorshipReservation(row);
    check(r.binding.patientAddress===p.patient.address&&r.binding.sponsorAddress===scope.source);
    if(r.state==='released')continue;
    check(r.binding.requestId===d.parentRenewal.requestId&&r.state==='settled','clinical_rehearsal_order_conflict');
    const bound=budgetModule.inspectRehearsalAuthorizationReservation(p,job,row);renewalReservations++;
    check(bound.transactionHash===renewed.transactionHash&&bound.outcome==='SUCCESS'&&bound.ledger===renewed.ledger&&bound.chargedStroops===renewed.feeChargedStroops);
  }
  check(renewalReservations===1);
  const ids=p.aggregateBudget.confirmedSteps.map(proof=>proof.requestId);
  const rows=(await client.query('SELECT id,state,action,method,source_wallet,actor_user_id,wallet_id,contract_id,network,expected,unsigned_xdr,signed_xdr,transaction_hash,signing_hash,error_code,expires_at FROM clinical_web_operations WHERE id=ANY($1::uuid[])',[ids])).rows;
  const historical=await budgetModule.assertRehearsalHistoricalCharges(p,{rows,receipt:hash=>server.getTransaction(hash),now});
  check(historical.paidStroops==='93618202');
  return Object.freeze({maintenancePaidStroops:restored.feeChargedStroops,renewalPaidStroops:renewed.feeChargedStroops,historicalPaidStroops:historical.paidStroops});
}
async function noNewSteps(client,scope) {
  const p=scope.parentPolicy,future=p.steps.filter(step=>['append_pdf','correct_note','revoke'].includes(step.key)).map(step=>step.requestId);
  check(future.length===3);
  const row=(await client.query('SELECT EXISTS(SELECT 1 FROM clinical_web_operations WHERE id=ANY($1::uuid[])) AS busy',[future])).rows[0];
  check(row?.busy===false,'clinical_rehearsal_order_conflict');
}
async function noCompeting(client,scope) {
  const row=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM doctor_authorization_requests WHERE network='testnet' AND state IN ('pending','submitted')
    UNION ALL SELECT 1 FROM prescription_booking_requests WHERE network='testnet' AND state IN ('prepared','submitted','cancel_requested')
    UNION ALL SELECT 1 FROM private_operations WHERE state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_web_operations WHERE network='testnet' AND state IN ('awaiting_signature','submitted')
    UNION ALL SELECT 1 FROM clinical_transaction_attempts WHERE state IN ('prepared','submitted') AND NOT(run_id=$1::uuid AND operation_name=$2 AND source_wallet=$3)
  ) AS busy`,[scope.attemptRunId,NAME,scope.source])).rows[0];check(row?.busy===false,'clinical_rehearsal_authority_busy');
}
/** Injected adapters are local tests only; the CLI supplies none. */
export async function runReadproofMaintenance({env=process.env,mode='--prepare',adapters={}}={}) {
  check(['--inspect-offline','--prepare','--once','--reconcile'].includes(mode));
  const now=adapters.now??epoch;
  if(mode==='--inspect-offline')return(adapters.inspectProposal??inspectReadproofMaintenanceProposal)({file:env.TRUSTLEAF_CLINICAL_READPROOF_MAINTENANCE_FILE,expectedHash:env.TRUSTLEAF_CLINICAL_READPROOF_MAINTENANCE_HASH,now:now()});
  const load=adapters.loadScope??loadReadproofMaintenancePolicy;
  const scope=load({env,mode,now:now()});
  const evaluatedAt=mode==='--reconcile'?scope.approvedAt:now();
  (adapters.assertScope??assertReadproofMaintenancePolicy)(scope,{now:evaluatedAt});
  const policy=scope;
  readproofFootprint(scope);
  check(env.TRUSTLEAF_ENV==='local'&&env.TRUSTLEAF_PRIVATE_WRITES_ENABLED==='false'&&env.NEXT_PUBLIC_STELLAR_NETWORK==='testnet');
  const server=adapters.server??new rpc.Server('https://soroban-testnet.stellar.org');
  if(mode==='--prepare') {
    const old=(adapters.journal??readproofJournal(scope.attemptFile)).load();
    check(!old,'clinical_rehearsal_order_conflict');
    return(await prepareReadproofQuote({policy:scope,server,now})).metadata;
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
    runKey=rehearsalRunLockKey(scope.parentPolicy);check(runKey);
    check((await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[runKey])).rows[0]?.locked===true,'clinical_rehearsal_authority_busy');runHeld=true;
    const journal=adapters.journal??readproofJournal(scope.attemptFile), store=(adapters.createAttemptStore??clinicalAttemptStore)(client,{runId:scope.attemptRunId,source:scope.source});
    let saved=journal.load();if(saved)verifyJournal(policy,saved);
    let persisted=await store.load(NAME);
    if(persisted){check(saved&&persisted.intent===saved.intent&&persisted.source===scope.source);const recovered={...saved,phase:'signed',signedXdr:persisted.xdr,transactionHash:persisted.hash};
      verifyJournal(policy,recovered);if(!saved.signedXdr)saved=journal.update(recovered,saved);}
    const reconcile=async()=>{
      if(!saved?.signedXdr)return{status:saved?.phase==='signing'?'SIGNATURE_UNCERTAIN':'NOT_SUBMITTED',readOnly:true,requestId:scope.requestId,phase:saved?.phase??'absent',conservativelyHeldStroops:scope.maintenanceMaximumStroops,addonMaximumStroops:scope.maxFeeStroops};
      verifyJournal(policy,saved);
      if(!persisted){await store.reserve(NAME,{intent:saved.intent,source:scope.source});await store.save(NAME,{intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash});persisted={intent:saved.intent,source:scope.source,xdr:saved.signedXdr,hash:saved.transactionHash};}
      let receipt;try{receipt=await server.getTransaction(saved.transactionHash);}catch{return{status:'PENDING_UNKNOWN',readOnly:true,transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maintenanceMaximumStroops,addonMaximumStroops:scope.maxFeeStroops};}
      if(!['SUCCESS','FAILED'].includes(receipt.status))return{status:'PENDING_UNKNOWN',readOnly:true,transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maintenanceMaximumStroops,addonMaximumStroops:scope.maxFeeStroops};
      const proof=verifyReadproofReceipt(scope,saved,receipt);await locks.assertHeld();
      await store.complete(NAME,proof);
      const terminal={...saved,phase:proof.status==='SUCCESS'?'confirmed':'failed',receipt:proof};saved=journal.update(terminal,saved);
      return{status:proof.status,readOnly:mode==='--reconcile',...proof,keyCount:10,conservativelyHeldStroops:scope.maintenanceMaximumStroops,addonMaximumStroops:scope.maxFeeStroops,liveClinicalReadVerificationPending:proof.status==='SUCCESS'};
    };
    if(mode==='--reconcile'||saved?.signedXdr||saved?.phase==='signing')return await reconcile();
    const active=async()=>{check(!stopped);const current=load({env,mode:'--once',now:now()});
      (adapters.assertScope??assertReadproofMaintenancePolicy)(current,{now:now()});
      check(current.planHash===scope.planHash&&current.approvalHash===scope.approvalHash&&current.parentPlanHash===scope.parentPlanHash);
      check(BigInt(scope.parentMaintenance.feeChargedStroops)+BigInt(scope.maxFeeStroops)<=BigInt(scope.maintenanceMaximumStroops));
      await locks.assertHeld();await noNewSteps(client,scope);await noCompeting(client,scope);
      const proofs=await(adapters.assertParentEvidence??assertReadproofParentEvidence)({scope,client,server,now:now()});
      check(proofs.maintenancePaidStroops==='13327629'&&proofs.renewalPaidStroops==='4726'&&proofs.historicalPaidStroops==='93618202');
      check(!stopped);(adapters.assertScope??assertReadproofMaintenancePolicy)(current,{now:now()});await locks.assertHeld();check(!stopped);};
    await active();
    await(adapters.checkBalance??checkClinicalWebRelayerBudget)(server,scope.source);
    if(!saved){check((await client.query('SELECT run_id FROM clinical_transaction_attempts WHERE run_id=$1::uuid AND operation_name=$2 AND source_wallet=$3',[scope.attemptRunId,NAME,scope.source])).rows.length===0);
      saved=journal.create(journalFor(policy,await prepareReadproofQuote({policy,server,now})));}
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
    try{await server.sendTransaction(signed);}catch{return{status:'PENDING_UNKNOWN',transactionHash:saved.transactionHash,conservativelyHeldStroops:scope.maintenanceMaximumStroops,addonMaximumStroops:scope.maxFeeStroops};}
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
  check(argv.length===1&&['--inspect-offline','--prepare','--once','--reconcile'].includes(argv[0]));if(argv[0]!=='--inspect-offline')process.loadEnvFile(resolve(ROOT,'.env.local'));
  return runReadproofMaintenance({mode:argv[0]});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(result=>console.log(JSON.stringify(result))).catch(error=>{
  const code=/^(?:clinical_rehearsal_[a-z_]+|clinical_readproof_[a-z_]+|signature_request_expired)$/.test(error?.message??'')?error.message:'clinical_readproof_unavailable';
  console.error(JSON.stringify({status:'blocked',error:code}));process.exitCode=1;
});
