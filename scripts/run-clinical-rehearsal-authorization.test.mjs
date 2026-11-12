import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Address, Keypair, Networks, xdr } from '@stellar/stellar-sdk';
import { main, runAuthorizationRehearsal, assertAuthorizationRehearsalJob, verifyAuthorizationRegistryDeployment } from './run-clinical-rehearsal-authorization.mjs';
import { PRIVATE_REGISTRY_ID } from './lib/private-registry.mjs';
import { PRIVY_APP_ID, PRIVATE_PRESCRIPTION_ID } from './lib/private-worker-runtime.mjs';
const admin='GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const requestId='11111111-2222-4333-8444-555555555555',dossierId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',revokeId='22222222-3333-4444-8555-666666666666';
function fixture({expired=false,saved=false,missing=false,busy=false,startingVersion=3,schemaVersion=1,closed=false,runBusy=false}={}) {
  const now=Math.floor(Date.now()/1000),relayer=Keypair.random(),doctor=Keypair.random().publicKey();
  const plan={schemaVersion,runId:'33333333-4444-4555-8666-777777777777',policyHash:'ab'.repeat(32),createdAt:expired?now-10000:now,until:expired?now-9000:now+600,
    network:'testnet',admin,relayer:relayer.publicKey(),registryId:PRIVATE_REGISTRY_ID,doctorId:10,
    doctor:{userId:'did:privy:doctor',walletId:'verified-wallet',address:doctor,email:'doctor@example.test'},
    reviewer:{userId:'did:privy:reviewer',email:'reviewer@example.test'},
    authorization:{requestId,dossierId,validUntil:now+86400,expectedVersion:startingVersion,targetVersion:startingVersion+1,method:'reauthorize_doctor'},
    steps:[{key:'renew',actor:'admin',action:'renew',requestId,maxFeeStroops:'10000000'},...(schemaVersion===2?[{key:'revoke',actor:'patient',action:'set_permissions',requestId:revokeId,maxFeeStroops:'10000000'}]:[])]};
  const env={TRUSTLEAF_ENV:'local',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',TRUSTLEAF_DB_HOST:'ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',
    DATABASE_URL:'postgresql://synthetic:synthetic@ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech/test',
    PRIVY_APP_ID,DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:PRIVATE_REGISTRY_ID,PRESCRIPTION_PRIVATE_CONTRACT_ID:PRIVATE_PRESCRIPTION_ID,
    DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:admin,BOOKING_AUTHORITY_PUBLIC_KEY:admin,STELLAR_CONFIG_DIR:'synthetic',
    DOCTOR_REGISTRY_ADMIN_ALIAS:'synthetic',PRIVY_APP_SECRET:'synthetic',RELAYER_SECRET:relayer.secret(),TRUSTLEAF_DATA_KEY:'ab'.repeat(32)};
  const job={id:requestId,dossier_id:dossierId,network:'testnet',contract_id:PRIVATE_REGISTRY_ID,doctor_id:10,doctor_user_id:plan.doctor.userId,
    wallet_id:plan.doctor.walletId,wallet:doctor,doctor_email:plan.doctor.email,requested_by:plan.reviewer.userId,requested_email:plan.reviewer.email,
    action:'renew',method:'reauthorize_doctor',expected_version:startingVersion,target_version:startingVersion+1,valid_until:plan.authorization.validUntil,
    commitment:'cd'.repeat(32),state:saved?'submitted':'pending',transaction_hash:saved?'ef'.repeat(32):null,prepared_xdr:saved?'saved-envelope':null};
  const calls=[],counts={connect:0,sign:0,send:0,confirm:0,claim:0,signerFactory:0};let chainOptions;
  const client={query:async(sql,values)=>{
    calls.push(['sql',sql,values]);
    if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:!(runBusy&&values[0].startsWith('clinical-rehearsal:'))}]};
    if(sql.includes('pg_advisory_unlock'))return {rows:[{unlocked:true}]};
    if(sql.startsWith('SELECT id FROM clinical_web_operations'))return {rows:closed?[{id:revokeId}]:[]};
    if(sql.includes('SELECT EXISTS'))return {rows:[{busy}]};
    if(sql.startsWith('SELECT * FROM doctor_authorization_requests'))return {rows:missing?[]:[{...job}]};
    return {rows:[]};
  }};
  const adapters={
    loadPolicy:options=>{calls.push(['policy',options]);assert.equal(options.requireApproval,true);if(expired&&options.now!==plan.createdAt)throw Error('clinical_rehearsal_expired');return structuredClone(plan);},
    reconciliationInstant:()=>plan.createdAt,
    connect:async url=>{counts.connect++;assert.equal(new URL(url).hostname,'ep-lingering-water-ahzh89z5.c-3.us-east-1.aws.neon.tech');return {client,close:async()=>calls.push(['closed'])};},
    acquireSignerLock:async(_dir,source)=>{calls.push(['fileLock',source]);return async()=>calls.push(['fileUnlock',source]);},
    acquireSourceLocks:async(_client,sources)=>{assert.deepEqual(sources,[admin,plan.relayer]);return {assertHeld:async()=>calls.push(['assertLocks']),release:async()=>calls.push(['sourceUnlock'])};},
    server:{getNetwork:async()=>({passphrase:Networks.TESTNET}),getTransaction:async hash=>{assert.equal(hash,'ef'.repeat(32));return {status:'SUCCESS'};}},
    verifyRegistryDeployment:async({plan:current,server})=>{assert.equal(current.admin,admin);assert.equal(current.registryId,PRIVATE_REGISTRY_ID);assert.ok(server);calls.push(['registryPin']);},
    provider:{},secureStoreSigner:()=>{counts.signerFactory++;return async()=>{counts.sign++;return 'signed-envelope';};},
    createStore:(_client,options)=>{assert.deepEqual(options,{requestId});return {
      claim:async options=>{counts.claim++;calls.push(['claim',options]);return {...job};},eligible:async()=>true,
      prepared:async(_job,prepared)=>{calls.push(['persist']);Object.assign(job,{transaction_hash:prepared.hash,prepared_xdr:prepared.xdr,state:'submitted'});return {...job};},
      complete:async()=>{counts.confirm++;job.state='confirmed';},fail:async()=>calls.push(['fail']),note:async()=>calls.push(['note']),release:async()=>calls.push(['release'])};},
    createChain:options=>{chainOptions=options;assert.equal(options.requestId,requestId);assert.equal(options.maxFeeStroops,'10000000');assert.equal(options.until,plan.until);return {
      verifyEnvelope:async j=>{await options.assertJob(j,'verify');assert.equal(j.prepared_xdr,'saved-envelope');},
      receipt:async()=>({status:'SUCCESS'}),expired:async()=>false,
      authorization:async j=>{await options.assertJob(j,'read');return {authorized:true,authorization:{version:startingVersion+1,schema_version:1,commitment:j.commitment,valid_until:j.valid_until,revoked:false}};},
      validateIdentity:async j=>options.assertJob(j,'identity'),
      prepare:async j=>{await options.assertJob(j,'prepare');await options.assertJob(j,'sign');await options.signXdr('unsigned-envelope');return {xdr:'saved-envelope',hash:'ef'.repeat(32)};},
      submit:async(_xdr,j)=>{await options.assertJob(j,'submit');counts.send++;calls.push(['send']);}
    };}
  };
  // Fresh jobs must observe the exact expired baseline before preparing its next version.
  const original=adapters.createChain;
  adapters.createChain=options=>{const chain=original(options),read=chain.authorization;chain.authorization=async j=>
    !j.transaction_hash?{authorized:false,authorization:{version:startingVersion,valid_until:now-1,revoked:false}}:read(j);return chain;};
  return {plan,env,job,counts,calls,adapters,get chainOptions(){return chainOptions;}};
}

test('runner requires an explicit CLI mode and approval before any database connection',async()=>{
  await assert.rejects(main([]),/clinical_rehearsal_explicit_mode_required/);
  const f=fixture();f.adapters.loadPolicy=()=>{throw Error('clinical_rehearsal_approval_required');};
  await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_approval_required/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('approved runner executes one exact request with both source locks and persistence before the single send',async()=>{
  const f=fixture();const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
  assert.equal(result.status,'submitted');assert.equal(result.requestId,requestId);assert.equal(result.transactionHash,'ef'.repeat(32));assert.equal(result.receiptStatus,'SUCCESS');
  assert.equal(f.counts.claim,1);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
  assert.equal(f.calls.filter(x=>x[0]==='registryPin').length,3);
  assert.ok(f.calls.findIndex(x=>x[0]==='persist')<f.calls.findIndex(x=>x[0]==='send'));
  assert.equal(f.calls.filter(x=>x[0]==='fileLock').length,2);assert.equal(f.calls.filter(x=>x[0]==='fileUnlock').length,2);
  assert.ok(f.calls.some(x=>x[0]==='sourceUnlock'));assert.ok(f.calls.some(x=>x[0]==='closed'));
  assert.equal(f.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED,'false');
});
test('does not create a queue item or signer when the approved request has not been enqueued',async()=>{
  const f=fixture({missing:true});assert.equal((await runAuthorizationRehearsal({env:f.env,adapters:f.adapters})).status,'not_queued');
  assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
  assert.ok(f.calls.filter(x=>x[0]==='sql').every(([,sql])=>!/^INSERT|^UPDATE|^DELETE/.test(sql)));
});
test('foreign pending queues block the selected request before its worker claims anything',async()=>{
  const f=fixture({busy:true});await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_authority_busy/);
  assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
});
test('a repeated once run on the saved envelope is read-only and never signs or resends',async()=>{
  const f=fixture({saved:true});const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
  assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
  assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('expired approved reconciliation verifies only the same signed envelope, with zero signatures or submissions',async()=>{
  const f=fixture({saved:true,expired:true});const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
  assert.equal(result.status,'confirmed');assert.equal(f.counts.confirm,1);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
  assert.ok(f.calls.filter(x=>x[0]==='policy').every(([,options])=>options.now===f.plan.createdAt));
  await assert.rejects(f.chainOptions.assertJob(f.job,'prepare'),/clinical_rehearsal_reconciliation_read_only/);
  await assert.rejects(f.chainOptions.assertJob(f.job,'sign'),/clinical_rehearsal_reconciliation_read_only/);
  await assert.rejects(f.chainOptions.assertJob(f.job,'submit'),/clinical_rehearsal_reconciliation_read_only/);
});
test('expired once mode cannot connect, claim, prepare or send',async()=>{
  const f=fixture({expired:true});await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_expired/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.claim,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('the fixed request rejects changed reviewer, doctor, duration, version and method',()=>{
  const f=fixture();assert.doesNotThrow(()=>assertAuthorizationRehearsalJob(f.plan,f.job));
  for(const [field,value] of [['id','other'],['requested_by','other'],['wallet_id','other'],['valid_until',f.job.valid_until+1],['expected_version',4],['method','renew_authorization']]){
    assert.throws(()=>assertAuthorizationRehearsalJob(f.plan,{...f.job,[field]:value}),/clinical_rehearsal_authorization_rejected/);
  }
});

test('a persisted technical clinical attempt appearing after preflight blocks signing despite held source locks',async()=>{
  const f=fixture(),connect=f.adapters.connect;let observations=0;
  f.adapters.connect=async url=>{
    const connection=await connect(url),query=connection.client.query;
    connection.client.query=async(sql,values)=>{
      if(sql.includes('SELECT EXISTS')&&sql.includes('clinical_transaction_attempts')){
        assert.match(sql,/clinical_transaction_attempts WHERE state IN \('prepared','submitted'\)/);
        observations++;return {rows:[{busy:observations>1}]};
      }
      return query(sql,values);
    };
    return connection;
  };
  const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
  assert.equal(result.status,'needs_reconciliation');assert.equal(f.counts.claim,1);
  assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);assert.ok(observations>=2);
  assert.ok(f.calls.some(x=>x[0]==='sourceUnlock'));assert.equal(f.calls.filter(x=>x[0]==='fileUnlock').length,2);
});


test('a registry executable change after preparation blocks the signer and submission',async()=>{
  const f=fixture();let checks=0;
  f.adapters.verifyRegistryDeployment=async()=>{if(++checks===2)throw Error('audit_wasm_mismatch');};
  const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
  assert.equal(result.status,'needs_reconciliation');assert.equal(checks,2);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

test('expired receipt reconciliation does not require the registry executable that is current today',async()=>{
  const f=fixture({saved:true,expired:true});let checks=0;
  f.adapters.verifyRegistryDeployment=async()=>{checks++;throw Error('audit_wasm_mismatch');};
  const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
  assert.equal(result.status,'confirmed');assert.equal(checks,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

test('canonical registry pin rejects another executable before any getter or signing API',async()=>{
  const f=fixture();let simulations=0;
  const server={getNetwork:async()=>({passphrase:Networks.TESTNET}),getLedgerEntries:async key=>({latestLedger:100,entries:[{key,liveUntilLedgerSeq:1000,
    val:xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:new Address(PRIVATE_REGISTRY_ID).toScAddress(),
      key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent(),val:xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({
        executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32,1)),storage:[]}))}))}]}),
    simulateTransaction:async()=>{simulations++;throw Error('not reached');}};
  await assert.rejects(verifyAuthorizationRegistryDeployment({plan:f.plan,server}),/audit_wasm_mismatch/);
  assert.equal(simulations,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

function withReconciliationFiles(t, raw, approval) {
  const directory=mkdtempSync(join(tmpdir(),'trustleaf-rehearsal-reconcile-'));
  const planFile=join(directory,'plan.private.json'),approvalFile=join(directory,'approval.private.json');
  writeFileSync(planFile,JSON.stringify(raw));writeFileSync(approvalFile,JSON.stringify(approval));
  t.after(()=>{unlinkSync(planFile);unlinkSync(approvalFile);rmdirSync(directory);});
  return planFile;
}
test('approved continuation renews only registry v4 to v5 with the same fixed identifiers and caps',async()=>{
  const f=fixture({startingVersion:4,schemaVersion:2});
  const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
  assert.equal(result.status,'submitted');assert.equal(f.job.expected_version,4);assert.equal(f.job.target_version,5);
  assert.equal(f.job.valid_until,f.plan.authorization.validUntil);assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
  assert.equal(f.chainOptions.until,f.plan.until);assert.equal(f.chainOptions.maxFeeStroops,'10000000');
});
test('expired continuation reconciliation evaluates its pinned approval instant or notBefore without signing',async t=>{
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  const approvedAt=f.plan.createdAt,notBefore=approvedAt+30;
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:2,preparedAt:approvedAt-500,notBefore},{approvedAt});
  delete f.adapters.reconciliationInstant;
  f.adapters.loadPolicy=options=>{f.calls.push(['policy',options]);assert.equal(options.requireApproval,true);assert.equal(options.now,notBefore);return structuredClone(f.plan);};
  const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
  assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
  assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
  await assert.rejects(f.chainOptions.assertJob(f.job,'prepare'),/clinical_rehearsal_reconciliation_read_only/);
});
test('an unvalidated approval timestamp never authorizes reconciliation before the policy loader',async t=>{
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:2,notBefore:f.plan.createdAt},{approvedAt:f.plan.createdAt});
  delete f.adapters.reconciliationInstant;
  f.adapters.loadPolicy=()=>{throw Error('clinical_rehearsal_approval_required');};
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_approval_required/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('malformed v2 reconciliation anchors fail before connecting or creating a signer',async t=>{
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:2,notBefore:f.plan.createdAt},{approvedAt:String(f.plan.createdAt)});
  delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});

test('a closed continuation cannot claim, instantiate a signer or submit its pending renewal',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2,closed:true});
 await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_order_conflict/);
 assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 assert.ok(f.calls.some(([kind,sql,values])=>kind==='sql'&&sql.includes('pg_advisory_unlock')&&values[0]==='clinical-rehearsal:'+f.plan.runId));
});
test('a busy continuation run fails closed before a signer or queue claim',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2,runBusy:true});
 await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_authority_busy/);
 assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('a saved continuation envelope may reconcile after closure without acquiring fresh mutation authority',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,closed:true});
 const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
 assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
 assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 assert.ok(!f.calls.some(([kind,sql])=>kind==='sql'&&sql.startsWith('SELECT id FROM clinical_web_operations')));
});
test('the continuation session lock is held across preparation, persistence and the single send, then released',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2});
 const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
 assert.equal(result.status,'submitted');
 const key='clinical-rehearsal:'+f.plan.runId;
 const acquired=f.calls.findIndex(([kind,sql,values])=>kind==='sql'&&sql.includes('pg_try_advisory_lock')&&values[0]===key);
 const released=f.calls.findIndex(([kind,sql,values])=>kind==='sql'&&sql.includes('pg_advisory_unlock')&&values[0]===key);
 assert.ok(acquired>=0);assert.ok(acquired<f.calls.findIndex(([kind])=>kind==='claim'));
 assert.ok(released>f.calls.findIndex(([kind])=>kind==='persist'));assert.ok(released>f.calls.findIndex(([kind])=>kind==='send'));
 assert.equal(f.calls.filter(([kind,sql])=>kind==='sql'&&sql.startsWith('SELECT id FROM clinical_web_operations')).length,4);
});

test('a pending withdrawal or other pending work does not hide historical v2 receipts',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,closed:true,busy:true});
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
 assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 assert.ok(!f.calls.some(([kind,sql])=>kind==='sql'&&sql.includes('SELECT EXISTS')));
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});

function withFeeAmendmentReconciliationFiles(t,{baseApprovalAt,budgetApprovalAt,notBefore,baseSchemaVersion=2,schemaVersion=3}) {
 const directory=mkdtempSync(join(tmpdir(),'trustleaf-fee-reconcile-'));
 const planFile=join(directory,'plan.private.json'),approvalFile=join(directory,'approval.private.json'),baseFile=join(directory,'base.private.json'),baseApprovalFile=join(directory,'base-approval.private.json');
 writeFileSync(planFile,JSON.stringify({schemaVersion,basePlanFile:baseFile,baseApprovalFile}));
 writeFileSync(approvalFile,JSON.stringify({approvedAt:budgetApprovalAt}));writeFileSync(baseFile,JSON.stringify({schemaVersion:baseSchemaVersion,notBefore}));writeFileSync(baseApprovalFile,JSON.stringify({approvedAt:baseApprovalAt}));
 t.after(()=>{for(const file of [planFile,approvalFile,baseFile,baseApprovalFile])unlinkSync(file);rmdirSync(directory);});
 return planFile;
}
test('raw fee amendment reconciliation selects its fixed budget/base anchors then still requires the pinned loader',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true,closed:true,busy:true});
 const baseApprovalAt=f.plan.createdAt,budgetApprovalAt=baseApprovalAt+60,notBefore=baseApprovalAt-10;
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withFeeAmendmentReconciliationFiles(t,{baseApprovalAt,budgetApprovalAt,notBefore});
 delete f.adapters.reconciliationInstant;
 f.plan.feeAmendment={amendmentId:'44444444-5555-4666-8777-888888888888'};
 f.adapters.loadPolicy=options=>{f.calls.push(['policy',options]);assert.equal(options.requireApproval,true);assert.equal(options.now,budgetApprovalAt);return structuredClone(f.plan);};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
 assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 assert.equal(f.plan.until,baseApprovalAt+1000);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});
test('a raw fee amendment cannot use unvalidated anchors as authority to connect or sign',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withFeeAmendmentReconciliationFiles(t,{baseApprovalAt:f.plan.createdAt,budgetApprovalAt:f.plan.createdAt+30,notBefore:f.plan.createdAt-10});
 delete f.adapters.reconciliationInstant;f.adapters.loadPolicy=()=>{throw Error('clinical_rehearsal_approval_required');};
 await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_approval_required/);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});
test('malformed amendment anchors or a non-v2 base reject historical selection before connecting',async t=>{
 for(const patch of [{baseApprovalAt:'1000'},{budgetApprovalAt:0},{notBefore:null},{baseSchemaVersion:1}]){
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withFeeAmendmentReconciliationFiles(t,{baseApprovalAt:f.plan.createdAt,budgetApprovalAt:f.plan.createdAt+30,notBefore:f.plan.createdAt-10,...patch});
  delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 }
});
test('once on an already saved C1 under a fee amendment remains read-only and cannot renew again',async()=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,closed:true,busy:true});
 f.plan.feeAmendment={amendmentId:'44444444-5555-4666-8777-888888888888'};
 const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
 assert.equal(result.status,'confirmed');assert.equal(result.readOnly,true);assert.equal(f.counts.confirm,1);
 assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
});


test('raw execution reopening reconciles only the fixed C1 receipt without new signing or submission',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
 const baseApprovalAt=f.plan.createdAt-21600,budgetApprovalAt=f.plan.createdAt,notBefore=baseApprovalAt-10;
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withFeeAmendmentReconciliationFiles(t,{schemaVersion:4,baseApprovalAt,budgetApprovalAt,notBefore});
 delete f.adapters.reconciliationInstant;
 f.plan.feeAmendment={confirmedRenewalTransactionHash:f.job.transaction_hash};
 f.adapters.loadPolicy=options=>{assert.equal(options.now,budgetApprovalAt);return f.plan;};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.readOnly,true);assert.equal(result.status,'confirmed');
 assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});
test('an execution reopening rejects a missing or substituted C1 hash before creating any signer',async()=>{
 for(const saved of [false,true]){
  const f=fixture({startingVersion:4,schemaVersion:2,saved});
  f.plan.feeAmendment={confirmedRenewalTransactionHash:'aa'.repeat(32)};
  await assert.rejects(runAuthorizationRehearsal({env:f.env,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.claim,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 }
});


function replacementReconciliationFiles(t, {baseVersion=4,ownApprovalAt,baseApprovalAt,originalApprovalAt,notBefore}) {
 const directory=mkdtempSync(join(tmpdir(),'trustleaf-note-reconcile-'));
 const file=join(directory,'plan.private.json'),own=join(directory,'approval.private.json'),base=join(directory,'base.json'),baseApproval=join(directory,'base-approval.json'),original=join(directory,'original.json'),originalApproval=join(directory,'original-approval.json');
 for(const [path,value] of [[file,{schemaVersion:5,basePlanFile:base,baseApprovalFile:baseApproval}],[own,{approvedAt:ownApprovalAt}],[base,{schemaVersion:baseVersion,basePlanFile:original,baseApprovalFile:originalApproval}],[baseApproval,{approvedAt:baseApprovalAt}],[original,{schemaVersion:2,notBefore}],[originalApproval,{approvedAt:originalApprovalAt}]])writeFileSync(path,JSON.stringify(value));
 t.after(()=>{for(const path of [file,own,base,baseApproval,original,originalApproval])unlinkSync(path);rmdirSync(directory);});return file;
}
test('a replacement only reconciles the same confirmed C1 and cannot create another signer',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
 const ownApprovalAt=f.plan.createdAt;
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=replacementReconciliationFiles(t,{ownApprovalAt,baseApprovalAt:ownApprovalAt-60,originalApprovalAt:ownApprovalAt-22000,notBefore:ownApprovalAt-22010});
 delete f.adapters.reconciliationInstant;f.plan.feeAmendment={confirmedRenewalTransactionHash:f.job.transaction_hash};f.plan.noteReplacement={approvedAt:ownApprovalAt};
 f.adapters.loadPolicy=options=>{assert.equal(options.now,ownApprovalAt);return f.plan;};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.readOnly,true);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});
test('malformed replacement anchors or a substituted base fail historical selection before connecting',async t=>{
 for(const patch of [{baseVersion:3},{ownApprovalAt:0},{baseApprovalAt:'1000'}]){
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true}),approvedAt=f.plan.createdAt;
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=replacementReconciliationFiles(t,{ownApprovalAt:approvedAt,baseApprovalAt:approvedAt-60,originalApprovalAt:approvedAt-22000,notBefore:approvedAt-22010,...patch});delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 }
});


test('a second financial amendment reconciles only saved C1 at its own approved instant',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true}),approvedAt=f.plan.createdAt;
 const baseFile=replacementReconciliationFiles(t,{ownApprovalAt:approvedAt-30,baseApprovalAt:approvedAt-60,originalApprovalAt:approvedAt-22000,notBefore:approvedAt-22010});
 const planFile=withReconciliationFiles(t,{schemaVersion:6,basePlanFile:baseFile},{approvedAt});
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=planFile;delete f.adapters.reconciliationInstant;
 f.plan.feeAmendment={confirmedRenewalTransactionHash:f.job.transaction_hash};f.plan.budgetAmendment={approvedAt};
 f.adapters.loadPolicy=options=>{assert.equal(options.requireApproval,true);assert.equal(options.now,approvedAt);return f.plan;};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.readOnly,true);assert.equal(result.status,'confirmed');assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});

test('a second financial amendment rejects invalid own anchors and non-replacement bases before connecting',async t=>{
 for(const [baseVersion,approvedAt] of [[4,1000],[6,1000],[5,0],[5,'1000']]){
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  const baseFile=withReconciliationFiles(t,{schemaVersion:baseVersion},{});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:6,basePlanFile:baseFile},{approvedAt});delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 }
});


test('an aggregate redistribution only reconciles saved C1 after the whole pinned financial chain',async t=>{
 const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true}),approvedAt=f.plan.createdAt;
 const note=replacementReconciliationFiles(t,{ownApprovalAt:approvedAt-60,baseApprovalAt:approvedAt-90,originalApprovalAt:approvedAt-22000,notBefore:approvedAt-22010});
 const financial=withReconciliationFiles(t,{schemaVersion:6,basePlanFile:note},{approvedAt:approvedAt-30});
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:7,basePlanFile:financial},{approvedAt});delete f.adapters.reconciliationInstant;
 f.plan.feeAmendment={confirmedRenewalTransactionHash:f.job.transaction_hash};f.plan.aggregateBudget={approvedAt};
 f.adapters.loadPolicy=options=>{assert.equal(options.requireApproval,true);assert.equal(options.now,approvedAt);return f.plan;};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.readOnly,true);assert.equal(result.status,'confirmed');assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});

test('redistribution reconciliation rejects a missing approval or non-financial base before connecting',async t=>{
 for(const [schemaVersion,approvedAt] of [[5,1000],[7,1000],[6,0],[6,'1000']]){
  const f=fixture({startingVersion:4,schemaVersion:2,saved:true,expired:true});
  const base=withReconciliationFiles(t,{schemaVersion},{});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:7,basePlanFile:base},{approvedAt});delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 }
});

test('schema12 orchestration passes its exact renewal step through every mutation phase',async()=>{
 const f=fixture({schemaVersion:2,startingVersion:5}),phases=[];f.plan.authorization.validUntil=f.plan.createdAt+604800;f.job.valid_until=f.plan.authorization.validUntil;
 f.plan.completionContinuation={approvedAt:f.plan.createdAt,doctorWindowSeconds:604800,renewalMaxFeeStroops:'10000000'};
 f.plan.feeAmendment={confirmedRenewalTransactionHash:'ca'.repeat(32)};
 f.adapters.assertRehearsalOpen=async(_client,plan,options)=>{assert.equal(plan.authorization.requestId,requestId);assert.equal(options.lock,false);assert.deepEqual(options.step,plan.steps[0]);phases.push('open');};
 f.adapters.createStore=()=>({});f.adapters.runOnce=async({chain})=>{
  await chain.prepare({...f.job});await chain.submit('saved-envelope',{...f.job});return{status:'synthetic_scope_verified'};
 };
 const result=await runAuthorizationRehearsal({env:f.env,adapters:f.adapters});
 assert.equal(result.status,'synthetic_scope_verified');assert.equal(f.counts.sign,1);assert.equal(f.counts.send,1);
 assert(phases.length>=4);assert.equal(typeof f.chainOptions.sponsorship.reserve,'function');
 assert.equal(f.job.transaction_hash,null); // No real intent or envelope was persisted by these adapters.
});


for (const schema of [13,19]) test(`schema${schema} expired renewal reconciliation selects its own pinned approval instant without a signer or new submission`,async t=>{
 const f=fixture({startingVersion:5,schemaVersion:2,saved:true,expired:true}),approvedAt=f.plan.createdAt;
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:schema,preparedAt:approvedAt-60},{approvedAt});
 delete f.adapters.reconciliationInstant;
 f.adapters.loadPolicy=options=>{assert.equal(options.requireApproval,true);assert.equal(options.now,approvedAt);return f.plan;};
 const result=await runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters});
 assert.equal(result.readOnly,true);assert.equal(result.status,'confirmed');assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.sign,0);assert.equal(f.counts.send,0);
 for(const phase of ['prepare','sign','submit'])await assert.rejects(f.chainOptions.assertJob(f.job,phase),/clinical_rehearsal_reconciliation_read_only/);
});

for (const schema of [13,19]) test(`schema${schema} reconciliation rejects malformed or retimed own anchors before connecting`,async t=>{
 for(const approvedAt of [0,'1000',999]){
  const f=fixture({startingVersion:5,schemaVersion:2,saved:true,expired:true});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:schema,preparedAt:1000},{approvedAt});
  delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
 }
});

test('schema19 historical anchor cannot bypass the original manifest/approval verifier',async t=>{
 const f=fixture({startingVersion:6,saved:true,expired:true}),approvedAt=f.plan.createdAt;
 f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:19,preparedAt:approvedAt-60},{approvedAt});
 delete f.adapters.reconciliationInstant;
 f.adapters.loadPolicy=()=>{throw Error('clinical_rehearsal_approval_required');};
 await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_approval_required/);
 assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
});
test('schema19 reconciliation rejects missing or malformed preparation anchors before connecting',async t=>{
 for(const preparedAt of [undefined,0,'1000',1002]){
  const f=fixture({startingVersion:6,saved:true,expired:true});
  f.env.TRUSTLEAF_CLINICAL_REHEARSAL_FILE=withReconciliationFiles(t,{schemaVersion:19,preparedAt},{approvedAt:1001});
  delete f.adapters.reconciliationInstant;
  await assert.rejects(runAuthorizationRehearsal({env:f.env,reconcile:true,adapters:f.adapters}),/clinical_rehearsal_authorization_rejected/);
  assert.equal(f.counts.connect,0);assert.equal(f.counts.signerFactory,0);assert.equal(f.counts.send,0);
 }
});
