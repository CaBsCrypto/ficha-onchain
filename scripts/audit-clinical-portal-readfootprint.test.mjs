import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Account,Address,Networks,SorobanDataBuilder,StrKey,nativeToScVal,scValToNative,xdr} from '@stellar/stellar-sdk';
import {auditClinicalPortalReadFootprint,PORTAL_PINS,PORTAL_SQL,portalFootprint,quotePortalRestoration,main} from './audit-clinical-portal-readfootprint.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),wallet=n=>StrKey.encodeEd25519PublicKey(Buffer.alloc(32,n)),hex=n=>n.toString(16).padStart(2,'0').repeat(32),b=v=>nativeToScVal(Buffer.from(v,'hex')),a=v=>new Address(v).toScVal(),symbol=v=>xdr.ScVal.scvSymbol(v);
const structure=v=>xdr.ScVal.scvMap(Object.keys(v).sort().map(k=>new xdr.ScMapEntry({key:symbol(k),val:v[k]})));
const storage=(contract,name,...args)=>xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(contract).toScAddress(),key:xdr.ScVal.scvVec([symbol(name),...args]),durability:xdr.ContractDataDurability.persistent()}));
function fixture(options={}){
 const now=1800000000,patient={userId:'did:privy:patient',walletId:'patient-wallet',address:wallet(1),email:'patient@example.test'},doctor={userId:'did:privy:doctor',walletId:'doctor-wallet',address:wallet(2),email:'doctor@example.test'};
 const policy={contractId:PORTAL_PINS.clinical.contractId,registryId:PORTAL_PINS.registry.contractId,admin:'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO',patient,doctor,doctorId:10,historyId:hex(10),relayer:wallet(3),createdAt:now-100,until:now+3600,policyHash:hex(11)};
 const host='ep-lingering-water-ahzh89z5-pooler.c-3.us-east-1.aws.neon.tech',env={TRUSTLEAF_ENV:'local',TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',NEXT_PUBLIC_STELLAR_NETWORK:'testnet',TRUSTLEAF_DB_HOST:host,DATABASE_URL:'postgresql://synthetic:fixture@'+host+'/unit'};
 const specs=[[1,1],[2,1],[3,1],[3,2],[4,1],[5,1]],rows=specs.map(([entry,version],index)=>{
   const author=entry===4?doctor.address:patient.address,previousCommitment=version===2?hex(22):null,commitment=hex(20+index),operationId=hex(40+index),entryId=hex(entry);
   const context={schemaVersion:1,network:'testnet',contractId:policy.contractId,historyId:policy.historyId,entryId,author,patient:patient.address,version,previousCommitment};
   const expected={historyId:policy.historyId,entryId,author,patient:patient.address,operationId,commitment,expectedVersion:version-1,expectedGrantRevision:author===doctor.address?5:0,previousCommitment};
   return{entry_id:entryId,version,context,commitment,operation_id:operationId,expected,source_wallet:author,transaction_hash:hex(70+index)};
 });
 const history={history_id:policy.historyId,owner_user_id:patient.userId,wallet_id:patient.walletId,patient_wallet:patient.address,transaction_hash:hex(90)};
 const creation={expected:{historyId:policy.historyId,patient:patient.address,operationId:hex(91)},source_wallet:patient.address,actor_user_id:patient.userId,wallet_id:patient.walletId};
 const rx={rx_id:'3',doctor_wallet:doctor.address,patient_wallet:patient.address,commitment:hex(92),expires_at:now-100,doctor_user_id:doctor.userId,patient_requested_by:patient.userId,doctor_wallet_id:doctor.walletId,patient_wallet_id:patient.walletId};
 const queries=[],transactions=[],pinRequests=[],counts={restore:0,send:0,account:0,ledger:0,grantReads:0},knownValues=new Map();
 const sql={query:async(q,args)=>{queries.push(q);assert(Object.values(PORTAL_SQL).includes(q));assert(q.startsWith('SELECT '));
  if(q===PORTAL_SQL.history)return[history];if(q===PORTAL_SQL.versions)return options.nonContiguous?rows.filter(r=>!(r.entry_id===hex(3)&&r.version===1)):rows;
  if(q===PORTAL_SQL.creation)return options.noCreation?[]:[creation];if(q===PORTAL_SQL.doctor)return[{id:10,email:doctor.email,status:options.blockedProfile?'blocked':'active'}];
  if(q===PORTAL_SQL.bindings)return[patient,doctor].map(v=>({user_id:v.userId,wallet_id:v.walletId,address:options.changedBinding&&v===doctor?wallet(9):v.address}));
  if(q===PORTAL_SQL.rx3)return[rx];throw Error('unexpected_sql');}};
 const contract=policy.contractId,historyValue={history_id:Buffer.from(policy.historyId,'hex'),patient:patient.address,created_at:1000n};
 const versionValue=row=>({author:row.context.author,commitment:Buffer.from(row.commitment,'hex'),previous_commitment:row.context.previousCommitment===null?null:Buffer.from(row.context.previousCommitment,'hex'),version:row.version,created_at:1000n});
 const digestFor=e=>sha(xdr.ScVal.scvVec([symbol('append'),a(contract),structure({history_id:b(e.historyId),entry_id:b(e.entryId),author:a(e.author),commitment:b(e.commitment),expected_version:nativeToScVal(e.expectedVersion,{type:'u32'}),expected_grant_revision:nativeToScVal(BigInt(e.expectedGrantRevision),{type:'u64'}),operation_id:b(e.operationId)})]).toXDR());
 const createDigest=sha(xdr.ScVal.scvVec([symbol('create'),a(contract),a(patient.address),b(policy.historyId),b(creation.expected.operationId)]).toXDR());
 const auth={commitment:Buffer.from(hex(93),'hex'),schema_version:1,version:6,valid_until:BigInt(options.expiredDoctor?now-1:now+3600),revoked:false};
 const server={
  getNetwork:async()=>({passphrase:options.wrongNetwork?Networks.PUBLIC:Networks.TESTNET}),
  getAccount:async address=>{counts.account++;return new Account(address,'100');},
  getLedgerEntries:async key=>{counts.ledger++;const pin=Object.values(PORTAL_PINS).find(p=>key.switch().name==='contractCode'?p.wasmHash===key.contractCode().hash().toString('hex'):key.contractData().contract().toXDR().equals(new Address(p.contractId).toScAddress().toXDR()));assert(pin);return{latestLedger:1000,entries:[{key,liveUntilLedgerSeq:2000,val:key.switch().name==='contractCode'?xdr.LedgerEntryData.contractCode(new xdr.ContractCodeEntry({ext:new xdr.ContractCodeEntryExt(0),hash:Buffer.from(pin.wasmHash,'hex'),code:Buffer.from('wrong-code-for-negative-test')})):xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:new Address(pin.contractId).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent(),val:xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.from(pin.wasmHash,'hex')),storage:[]}))}))}]}},
  simulateTransaction:async tx=>{
   assert.equal(tx.signatures.length,0);assert.equal(tx.operations.length,1);transactions.push(tx);const op=tx.operations[0];
   if(op.type==='restoreFootprint'){counts.restore++;const keys=tx.toEnvelope().v1().tx().ext().sorobanData().resources().footprint().readWrite(),selected=options.quoteExtraKey?[...keys,storage(contract,'Operation',a(wallet(9)),b(hex(99)))]:keys,data=new SorobanDataBuilder().setReadWrite(selected).setResources(100,100,100).setResourceFee('1000');return{latestLedger:1000,minResourceFee:'1000',transactionData:data};}
   assert.equal(op.type,'invokeHostFunction');const fn=op.func.invokeContract(),method=fn.functionName().toString(),args=fn.args(),native=args.map(scValToNative);
   let value,key,archived=false;
   if(method==='get_history')value=historyValue;
   else if(method==='get_grant'){counts.grantReads++;value=options.changedGrant&&counts.grantReads>1?{can_read:false,can_append:false,revision:7n}:{can_read:true,can_append:true,revision:6n};}
   else if(method==='get_authorization')value=auth;
   else if(method==='is_authorized')value=!options.expiredDoctor;
   else if(method==='can_read')value=native[1]===patient.address||!options.expiredDoctor;
   else if(method==='get_entry'){const id=Buffer.from(native[1]).toString('hex'),list=rows.filter(r=>r.entry_id===id),last=list.at(-1);value={author:last.context.author,head_version:last.version};key=storage(contract,'Entry',b(policy.historyId),b(id));archived=!!options.archived&&id!==hex(4);}
   else if(method==='get_version'){const id=Buffer.from(native[1]).toString('hex'),row=rows.find(r=>r.entry_id===id&&r.version===Number(native[2]));value=versionValue(row);if(options.badVersion)value.author=wallet(9);}
   else if(method==='get_operation'){const id=Buffer.from(native[1]).toString('hex'),row=rows.find(r=>r.operation_id===id);key=storage(contract,'Operation',a(native[0]),b(id));archived=!!options.archived&&native[0]===patient.address;if(!row&&options.creationArchived)archived=true;
    value=row?{digest:Buffer.from(digestFor(row.expected),'hex'),outcome:['Version',versionValue(row)]}:{digest:Buffer.from(createDigest,'hex'),outcome:['History',historyValue]};}
   else if(method==='get_prescription'){assert.equal(native[0],3n);value={id:3n,doctor:doctor.address,patient:patient.address,commitment:Buffer.from(rx.commitment,'hex'),schema_version:1,issued_at:1000n,expires_at:BigInt(rx.expires_at),status:['Active']};}
   else if(method==='is_valid'){assert.equal(native[0],3n);value=false;}
   else throw Error('unexpected_method_'+method);
   if(options.unexpectedArchivedKey&&method==='get_entry'){key=storage(contract,'Operation',a(wallet(9)),b(hex(99)));archived=true;}
   const data=new SorobanDataBuilder().setReadWrite(key?[key]:[]).setResources(100,100,100).build();
   if(archived)data.ext(new xdr.SorobanTransactionDataExt(1,new xdr.SorobanResourcesExtV0({archivedSorobanEntries:[0]})));
   const authList=options.authRequired&&method==='get_entry'?[{}]:[];
   const type=method==='get_version'||method==='get_entry'||method==='get_prescription'||method==='get_authorization'?{schema_version:['symbol','u32'],version:['symbol','u32'],head_version:['symbol','u32']}:undefined;
   const result={latestLedger:options.invalidLedger?'1000':1000,transactionData:{build:()=>data},result:{auth:authList,retval:nativeToScVal(value,{type})}};
   knownValues.set(method,value);return result;
  },
  sendTransaction:async()=>{counts.send++;throw Error('must_not_send');},
 };
 const deploymentAuditorFactory=()=>({auditDeployment:async spec=>{pinRequests.push(spec);const pin=Object.values(PORTAL_PINS).find(p=>p.contractId===spec.contractId);assert.equal(spec.expectedWasmHash,pin.wasmHash);assert.equal(spec.interfaceVersion,pin.interfaceVersion);return{name:spec.name,contractId:spec.contractId,observedWasmHash:pin.wasmHash,observedLedger:1000};}});
 return{env,policy,sql,server,rows,creation,counts,queries,transactions,pinRequests,knownValues,now,run:extra=>auditClinicalPortalReadFootprint({env,policy,sql,server,now,hashes:{'src/lib/clinical/history.ts':hex(94)},deploymentAuditorFactory,...extra})};
}
test('inventories the actual5heads6versions6appendproofs plus optional creation and never signs/sends',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.requiredStateReady,true);assert.equal(r.accessReady,true);assert.equal(r.readyForFinancialPreparation,true);
 assert.deepEqual(r.inventory,{entries:5,versions:6,headReads:5,appendOperationReads:6,creationOperationKnown:true,rxIds:['3']});
 assert.equal(r.probes.filter(p=>p.kind==='entry_head').length,5);assert.equal(r.probes.filter(p=>p.kind==='append_operation').length,6);assert.equal(r.probes.filter(p=>p.kind==='creation_operation').length,1);
 assert.equal(r.requiredMissingFootprint.keyCount,0);assert.equal(r.completeMissingFootprint.keyCount,0);assert.equal(r.restorationQuoteDisabledInCli,true);assert.equal(r.quote,null);assert.equal(f.pinRequests.length,3);assert.equal(f.counts.restore,0);assert.equal(f.counts.send,0);assert.equal(f.counts.account,0);assert.equal(r.rx3.expired,true);
});
test('Protocol23 archivedEntry indices reveal9mandatory and10complete keys instead of valid content',async()=>{
 const f=fixture({archived:true}),r=await f.run();assert.equal(r.requiredStateReady,false);assert.equal(r.readyForFinancialPreparation,false);assert.equal(r.requiredMissingFootprint.keyCount,9);assert.equal(r.completeMissingFootprint.keyCount,10);
 assert.equal(r.probes.filter(p=>p.status==='archived'&&p.required).length,9);assert(r.probes.filter(p=>p.status==='archived').every(p=>p.valueVerified===false));assert.equal(f.counts.restore,0);assert.equal(f.counts.send,0);
 const expected=[...r.requiredMissingFootprint.keys];assert.equal(new Set(expected).size,9);assert.equal(r.errors.length,0);
});
test('six canonical version reads alone cannot produce a positive portal preflight',async()=>{
 const r=await fixture({archived:true}).run();assert(r.probes.filter(p=>p.kind==='version').every(p=>p.status==='live'));assert.equal(r.accessReady,false);
 assert.equal(r.probes.find(p=>p.kind==='creation_operation').required,false);assert.equal(r.completeMissingFootprint.keyCount-r.requiredMissingFootprint.keyCount,1);
});
test('changed binding, blocked profile and noncontiguous versions fail before getter RPC',async()=>{
 for(const options of [{changedBinding:true},{blockedProfile:true},{nonContiguous:true}]){const f=fixture(options);await assert.rejects(()=>f.run());assert.equal(f.transactions.length,0);assert.equal(f.counts.restore,0);}
});
test('unexpected archival footprint, auth requirements and malformed values cannot authorize finances',async()=>{
 for(const options of [{unexpectedArchivedKey:true},{authRequired:true},{invalidLedger:true},{badVersion:true}]){const f=fixture(options),r=await f.run();assert.equal(r.requiredStateReady,false);assert.equal(r.readyForFinancialPreparation,false);assert(r.errors.length>0);assert.equal(f.counts.restore,0);assert.equal(f.counts.send,0);}
});
test('expired registry remains readable but cannot grant clinical financial readiness',async()=>{
 const f=fixture({expiredDoctor:true}),r=await f.run();assert.equal(r.requiredStateReady,true);assert.equal(r.doctor.expired,true);assert.equal(r.doctor.authorized,false);assert.equal(r.accessReady,false);assert.equal(r.readyForFinancialPreparation,false);
});
test('the real executable byte auditor rejects wrong WASM before content getters',async()=>{
 const f=fixture();await assert.rejects(()=>f.run({deploymentAuditorFactory:undefined}),{message:'audit_wasm_mismatch'});assert.equal(f.counts.ledger,2);assert.equal(f.transactions.length,0);assert.equal(f.counts.restore,0);
});
test('optional creation metadata absence does not invent an operation or fail verified content',async()=>{
 const r=await fixture({noCreation:true}).run();assert.equal(r.requiredStateReady,true);assert.equal(r.inventory.creationOperationKnown,false);assert.equal(r.probes.some(p=>p.kind==='creation_operation'),false);
});
test('fixture-only quote helper is exact unsigned and cannot change the selected footprint',async()=>{
 const f=fixture({archived:true}),r=await f.run(),keys=r.completeMissingFootprint.keys.map(k=>xdr.LedgerKey.fromXDR(k,'base64'));
 const quote=await quotePortalRestoration({policy:f.policy,server:f.server,keys,maxFeeStroops:'6672371',now:f.now});
 assert.equal(quote.keyCount,10);assert.equal(quote.offeredFeeStroops,'1100');assert.equal(quote.withinMaximum,true);assert.equal(quote.intentSaved,false);assert.equal(quote.journalCreated,false);assert.equal(f.counts.restore,1);assert.equal(f.counts.send,0);assert.equal(f.transactions.at(-1).signatures.length,0);
 const changed=fixture({quoteExtraKey:true});await assert.rejects(()=>quotePortalRestoration({policy:changed.policy,server:changed.server,keys,maxFeeStroops:'6672371',now:changed.now}),{message:'portal_preflight_quote_footprint_changed'});assert.equal(changed.counts.send,0);
});
test('public CLI rejects restore-quote flags before environment, SQL or RPC',async()=>{
 await assert.rejects(()=>main(['--prepare-quote']),{message:'portal_preflight_arguments_invalid'});
 await assert.rejects(()=>main(['--quote-max-fee-stroops','6672371']),{message:'portal_preflight_arguments_invalid'});
});

test('an archived optional creation proof remains optional without inventing a receipt',async()=>{const f=fixture({creationArchived:true}),r=await f.run();assert.equal(r.requiredStateReady,true);assert.equal(r.readyForFinancialPreparation,true);assert.equal(r.requiredMissingFootprint.keyCount,0);assert.equal(r.completeMissingFootprint.keyCount,1);const p=r.probes.find(x=>x.kind==='creation_operation');assert.equal(p.status,'archived');assert.equal(p.valueVerified,false);assert.equal(f.counts.restore,0);});
test('a grant revision changed during the inventory blocks readiness without cached permission',async()=>{const f=fixture({changedGrant:true}),r=await f.run();assert.equal(r.requiredStateReady,false);assert.equal(r.readyForFinancialPreparation,false);assert(r.errors.includes('portal_preflight_value_invalid'));assert.equal(f.counts.restore,0);});
test('programmatic inventory cannot trigger a quote through unsupported options',async()=>{const f=fixture({archived:true}),r=await f.run({prepareQuote:true,includeOptional:true,maxFeeStroops:'6672371'});assert.equal(r.quote,null);assert.equal(r.restorationQuoteDisabledInCli,true);assert.equal(f.counts.restore,0);assert.equal(f.counts.account,0);});

test('expired historical policy permits read-only inventory but never financial readiness',async()=>{const f=fixture();f.policy.createdAt=f.now-7200;f.policy.until=f.now-1;const r=await f.run();assert.equal(r.requiredStateReady,true);assert.equal(r.accessReady,true);assert.equal(r.financialWindow.active,false);assert.equal(r.readyForFinancialPreparation,false);assert.equal(r.financialWindow.evaluatedAt,f.now);assert.equal(f.counts.restore,0);assert.equal(f.counts.send,0);});
test('a future or missing approval window cannot create financial readiness',async()=>{for(const mode of ['future','missing']){const f=fixture();if(mode==='future')f.policy.createdAt=f.now+1;else delete f.policy.createdAt;const r=await f.run();assert.equal(r.accessReady,true);assert.equal(r.financialWindow.active,false);assert.equal(r.readyForFinancialPreparation,false);assert.equal(f.counts.restore,0);}});
