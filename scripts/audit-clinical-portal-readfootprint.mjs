#!/usr/bin/env node
/** Read-only inventory of the real clinicalSnapshot ledger dependencies.
 * No authentication impersonation, decryption, signing, submission or journal.
 * CLI restoration quotes are disabled; an approved add-on must own that authority.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Account, Address, BASE_FEE, Contract, Networks, Operation, SorobanDataBuilder, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { neon } from '@neondatabase/serverless';
import { databaseConnectionString } from './lib/database-connection.mjs';
import { loadRehearsalPolicy } from './lib/clinical-rehearsal-policy.mjs';
import { createClinicalContractAuditor } from './lib/clinical-contract-audit.mjs';
import { clinicalSimulationIsLive } from './lib/clinical-live-read.mjs';
import { clinicalRpcUrl } from './lib/clinical-rpc.mjs';
import { validateClinicalContext } from './lib/clinical-crypto.mjs';
import { buildClinicalRestoration } from './lib/clinical-restoration-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PORTAL_PINS = Object.freeze({
  clinical: { name:'ClinicalHistoryPrivate',contractId:'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',wasmHash:'29e5510efc758f66bebc44c156fe13fb288a2ef339159467dd787bf4231e1ce0',interfaceVersion:1 },
  registry: { name:'DoctorRegistryPrivate',contractId:'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2',wasmHash:'b31de89cfd704aa917afd2b9056b97a38242d91f2452846a208962f7de358e02',interfaceVersion:1 },
  rx: { name:'PrescriptionPrivate',contractId:'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE',wasmHash:'4703d26f7ed6321c4c5f1bcb20ac9392c43c79fae3e0f16adbc7ac70e738155c',interfaceVersion:2 },
});
const ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const APP = 'cmrix722m03d30clewd1fuffq';
const HASH = /^[a-f0-9]{64}$/;
const SOURCES = ['src/lib/clinical/history.ts','src/lib/clinical/api.ts','src/lib/clinical/chain.ts','src/lib/clinical/doctor-context.ts','src/lib/clinical/prescriptions.ts','scripts/lib/clinical-chain-read.mjs','scripts/lib/clinical-read.mjs'];
const METHODS = new Set(['interface_version','get_registry','get_admin','get_booking_authority','get_history','get_grant','can_read','get_entry','get_version','get_operation','get_authorization','is_authorized','get_prescription','is_valid']);
export const PORTAL_SQL = Object.freeze({
  history: "SELECT history_id,owner_user_id,wallet_id,patient_wallet,transaction_hash FROM clinical_web_histories WHERE history_id=$1 AND contract_id=$2 AND network='testnet' LIMIT 2",
  versions: "SELECT v.entry_id,v.version,v.context,v.commitment,v.operation_id,o.expected,o.source_wallet,o.transaction_hash FROM clinical_private_versions v JOIN clinical_web_operations o ON o.transaction_hash=v.transaction_hash AND o.contract_id=v.contract_id AND o.network=v.network WHERE v.history_id=$1 AND v.contract_id=$2 AND v.network='testnet' AND v.state='confirmed' AND o.state='confirmed' AND o.action='append_version' ORDER BY v.entry_id,v.version LIMIT 201",
  creation: "SELECT expected,source_wallet,actor_user_id,wallet_id FROM clinical_web_operations WHERE transaction_hash=$1 AND contract_id=$2 AND network='testnet' AND action='create_history' AND state='confirmed' AND actor_user_id=$3 AND wallet_id=$4 AND source_wallet=$5 LIMIT 2",
  doctor: 'SELECT id,email,status FROM doctors WHERE id=$1 LIMIT 2',
  bindings: 'SELECT user_id,wallet_id,address FROM privy_stellar_wallet_bindings WHERE app_id=$1 AND user_id=ANY($2::text[])',
  rx3: "SELECT p.rx_id,p.doctor_wallet,p.patient_wallet,p.commitment,p.expires_at,b.doctor_user_id,b.patient_requested_by,b.doctor_wallet_id,b.patient_wallet_id FROM private_prescriptions p JOIN prescription_booking_requests b ON b.appointment_id=p.appointment_id AND b.issuance_id=p.issuance_id WHERE p.rx_id=3 AND p.contract_id=$1 AND p.network='testnet' AND p.state='confirmed' AND p.doctor_wallet=$2 AND p.patient_wallet=$3 AND b.contract_id=p.contract_id AND b.network=p.network AND b.doctor_wallet=p.doctor_wallet AND b.patient_wallet=p.patient_wallet LIMIT 2",
});
const fail = code => { throw Error(code ?? 'portal_preflight_unavailable'); };
const check = (v, code) => { if (!v) fail(code); };
const sha = v => createHash('sha256').update(v).digest('hex');
const bytes = v => { check(typeof v==='string'&&HASH.test(v),'portal_preflight_metadata_invalid');return nativeToScVal(Buffer.from(v,'hex')); };
const addr = v => new Address(v).toScVal();
const sym = v => xdr.ScVal.scvSymbol(v);
const struct = v => xdr.ScVal.scvMap(Object.keys(v).sort().map(k=>new xdr.ScMapEntry({key:sym(k),val:v[k]})));
const exact = (v,names) => !!v&&typeof v==='object'&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const uint = v => (typeof v==='number'||typeof v==='bigint')&&Number.isSafeInteger(Number(v))&&Number(v)>=0;
const hex = v => v instanceof Uint8Array&&v.length===32?Buffer.from(v).toString('hex'):null;
function ledgerKey(contract,name,...args) { return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(contract).toScAddress(),key:xdr.ScVal.scvVec([sym(name),...args]),durability:xdr.ContractDataDurability.persistent()})); }
function sortedKeys(keys) { return [...keys].sort((a,b)=>Buffer.compare(a.toXDR(),b.toXDR())); }
export function portalFootprint(keys) {
  const unique=[...new Map(keys.map(k=>[k.toXDR('base64'),k])).values()],sorted=sortedKeys(unique),encoded=sorted.map(k=>k.toXDR('base64'));
  const fp=new SorobanDataBuilder().setReadWrite(sorted).build().resources().footprint();
  return {keyCount:encoded.length,keys:encoded,keysSha256:sha([...encoded].sort().join('\n')),footprintSha256:sha(fp.toXDR())};
}
function sourceHashes() { return Object.fromEntries(SOURCES.map(file=>[file,sha(readFileSync(resolve(ROOT,file)))])); }
function environment(env,policy) {
  check(env.TRUSTLEAF_ENV==='local'&&env.TRUSTLEAF_PRIVATE_WRITES_ENABLED==='false'&&env.NEXT_PUBLIC_STELLAR_NETWORK==='testnet'&&!env.VERCEL&&!env.VERCEL_ENV,'portal_preflight_environment_invalid');
  let url;try{url=new URL(databaseConnectionString(env));}catch{fail('portal_preflight_database_invalid');}
  check(['postgres:','postgresql:'].includes(url.protocol)&&/^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(url.hostname)&&url.hostname===env.TRUSTLEAF_DB_HOST,'portal_preflight_database_invalid');
  check(policy?.contractId===PORTAL_PINS.clinical.contractId&&policy.registryId===PORTAL_PINS.registry.contractId&&policy.admin===ADMIN&&policy.patient?.address!==policy.doctor?.address&&policy.patient?.userId!==policy.doctor?.userId,'portal_preflight_policy_invalid');
}
function archiveKeys(simulation,known) {
  const selected=[];
  if ('restorePreamble' in simulation) {
    const d=simulation.restorePreamble?.transactionData?.build?.();check(d,'portal_preflight_archival_metadata_invalid');
    selected.push(...d.resources().footprint().readWrite());
  } else {
    const d=simulation.transactionData?.build?.();check(d,'portal_preflight_archival_metadata_invalid');
    const ext=d.ext();check(ext.switch()===1,'portal_preflight_archival_metadata_invalid');
    const rw=d.resources().footprint().readWrite();
    for(const i of ext.resourceExt().archivedSorobanEntries()){check(Number.isInteger(i)&&i>=0&&rw[i],'portal_preflight_archival_metadata_invalid');selected.push(rw[i]);}
  }
  check(selected.length>0,'portal_preflight_archival_metadata_invalid');
  for(const key of selected)check(known.has(key.toXDR('base64')),'portal_preflight_unexpected_footprint');
  return selected;
}
/** Fixture/approved-adapter helper only; the public CLI never calls this.
 * No signer, store, send capability or financial authority is created. */
export async function quotePortalRestoration({policy,server,keys,maxFeeStroops,now=Math.floor(Date.now()/1000)}) {
  check(typeof maxFeeStroops==='string'&&/^[1-9]\d*$/.test(maxFeeStroops)&&BigInt(maxFeeStroops)<=10000000n,'portal_preflight_quote_cap_invalid');
  check(Number.isSafeInteger(now)&&now>0&&Number.isSafeInteger(policy.until)&&now<policy.until,'portal_preflight_quote_window_expired');
  const fp=portalFootprint(keys);check(fp.keyCount>0&&fp.keyCount<=128,'portal_preflight_quote_keys_invalid');
  for(const key of keys)check(key.switch().name==='contractData'&&key.contractData().durability().name==='persistent'&&key.contractData().contract().toXDR().equals(new Address(policy.contractId).toScAddress().toXDR()),'portal_preflight_quote_scope_invalid');
  check((await server.getNetwork()).passphrase===Networks.TESTNET,'portal_preflight_network_invalid');
  const account=await server.getAccount(policy.relayer);check(account.accountId()===policy.relayer,'portal_preflight_quote_source_invalid');
  const tx=new TransactionBuilder(new Account(account.accountId(),account.sequenceNumber()),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .setSorobanData(new SorobanDataBuilder().setReadWrite(sortedKeys(keys)).build()).addOperation(Operation.restoreFootprint({}))
    .setTimebounds(0,Math.min(now+180,policy.until)).build();
  const simulation=await server.simulateTransaction(tx);
  check(rpc.Api.isSimulationSuccess(simulation)&&!rpc.Api.isSimulationRestore(simulation)&&!('restorePreamble'in simulation)&&/^\d+$/.test(simulation.minResourceFee),'portal_preflight_quote_unavailable');
  check(simulation.result?.auth===undefined||(Array.isArray(simulation.result.auth)&&simulation.result.auth.length===0),'portal_preflight_quote_unavailable');
  const data=simulation.transactionData.build(),observed=portalFootprint(data.resources().footprint().readWrite());
  check(!data.resources().footprint().readOnly().length&&observed.keysSha256===fp.keysSha256,'portal_preflight_quote_footprint_changed');
  const offered=BigInt(simulation.minResourceFee)+BigInt(BASE_FEE);
  const built=buildClinicalRestoration({deployment:{network:'testnet',contractId:policy.contractId,wasmHash:PORTAL_PINS.clinical.wasmHash},sourceAccount:new Account(account.accountId(),account.sequenceNumber()),preamble:{minResourceFee:simulation.minResourceFee,transactionData:simulation.transactionData}});
  check(built.transaction.signatures.length===0&&BigInt(built.transaction.fee)===offered,'portal_preflight_quote_invalid');
  return {status:'UNSIGNED_QUOTE_ONLY',...fp,observedLedger:simulation.latestLedger,offeredFeeStroops:offered.toString(),maximumFeeStroops:maxFeeStroops,withinMaximum:offered<=BigInt(maxFeeStroops),signatureRequested:false,submitted:false,journalCreated:false,intentSaved:false};
}

/** SQL adapter and RPC are trusted local dependencies; no AuthUser is invented.
 * The actual route still has to verify the user's live session and decryption.
 */
export async function auditClinicalPortalReadFootprint({env,policy,sql,server,now=Math.floor(Date.now()/1000),hashes=sourceHashes(),deploymentAuditorFactory=createClinicalContractAuditor}) {
  environment(env,policy);
  check(Number.isSafeInteger(now)&&now>0,'portal_preflight_configuration_invalid');
  const calls={sqlSelect:0,unsignedGetterSimulations:0},probes=[],errors=[],known=new Set(),requiredMissing=new Map(),optionalMissing=new Map();
  const selectedSql=new Set(Object.values(PORTAL_SQL));
  async function select(query,args){check(selectedSql.has(query),'portal_preflight_sql_forbidden');calls.sqlSelect++;const r=await sql.query(query,args);return Array.isArray(r)?r:r.rows;}
  const p=policy.patient,d=policy.doctor,c=policy.contractId;
  const histories=await select(PORTAL_SQL.history,[policy.historyId,c]);check(histories?.length===1,'portal_preflight_history_invalid');const h=histories[0];
  check(h.owner_user_id===p.userId&&h.wallet_id===p.walletId&&h.patient_wallet===p.address,'portal_preflight_history_invalid');
  const profile=await select(PORTAL_SQL.doctor,[policy.doctorId]);check(profile?.length===1&&String(profile[0].email).toLowerCase()===d.email&&Number(profile[0].id)===policy.doctorId&&profile[0].status==='active','portal_preflight_doctor_invalid');
  const bindings=await select(PORTAL_SQL.bindings,[APP,[p.userId,d.userId]]);
  check([p,d].every(a=>bindings.filter(b=>b.user_id===a.userId&&b.wallet_id===a.walletId&&b.address===a.address).length===1),'portal_preflight_binding_invalid');
  const versions=await select(PORTAL_SQL.versions,[policy.historyId,c]);check(versions?.length>0&&versions.length<=200,'portal_preflight_index_invalid');
  const groups=new Map();
  for(const row of versions){const v=validateClinicalContext(row.context),e=row.expected;check(v.historyId===policy.historyId&&v.contractId===c&&v.patient===p.address&&[p.address,d.address].includes(v.author)&&v.entryId===row.entry_id&&v.version===Number(row.version)&&HASH.test(row.commitment)&&e?.historyId===v.historyId&&e.entryId===v.entryId&&e.author===v.author&&e.operationId===row.operation_id&&e.commitment===row.commitment&&e.expectedVersion+1===v.version&&e.previousCommitment===v.previousCommitment&&row.source_wallet===v.author,'portal_preflight_index_invalid');
    const list=groups.get(v.entryId)??[];check(!list.some(r=>Number(r.version)===v.version),'portal_preflight_index_invalid');list.push(row);groups.set(v.entryId,list);
  }
  for(const list of groups.values()){list.sort((a,b)=>Number(a.version)-Number(b.version));check(list.every((r,i)=>Number(r.version)===i+1),'portal_preflight_index_invalid');}
  const creations=await select(PORTAL_SQL.creation,[h.transaction_hash,c,p.userId,p.walletId,p.address]);check(creations.length<=1,'portal_preflight_creation_ambiguous');const creation=creations[0];
  if(creation)check(creation.expected?.historyId===policy.historyId&&creation.expected.patient===p.address&&creation.source_wallet===p.address,'portal_preflight_creation_invalid');
  const rxRows=await select(PORTAL_SQL.rx3,[PORTAL_PINS.rx.contractId,d.address,p.address]);check(rxRows.length===1,'portal_preflight_rx3_invalid');const rx=rxRows[0];
  check(rx.doctor_user_id===d.userId&&rx.patient_requested_by===p.userId&&rx.doctor_wallet_id===d.walletId&&rx.patient_wallet_id===p.walletId&&HASH.test(rx.commitment)&&uint(Number(rx.expires_at)),'portal_preflight_rx3_binding_invalid');
  function remember(key){known.add(key.toXDR('base64'));}
  for(const pin of Object.values(PORTAL_PINS)){remember(xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(pin.contractId).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent()})));remember(xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({hash:Buffer.from(pin.wasmHash,'hex')})));}
  remember(ledgerKey(c,'History',bytes(policy.historyId)));remember(ledgerKey(c,'Patient',addr(p.address)));remember(ledgerKey(c,'Grant',bytes(policy.historyId),addr(d.address)));
  remember(ledgerKey(policy.registryId,'Doctor',addr(d.address)));remember(ledgerKey(PORTAL_PINS.rx.contractId,'Rx',nativeToScVal(3n,{type:'u64'})));
  for(const [entryId,list] of groups){remember(ledgerKey(c,'Entry',bytes(policy.historyId),bytes(entryId)));for(const row of list){remember(ledgerKey(c,'Version',bytes(policy.historyId),bytes(entryId),nativeToScVal(Number(row.version),{type:'u32'})));remember(ledgerKey(c,'Operation',addr(row.context.author),bytes(row.operation_id)));}}
  if(creation)remember(ledgerKey(c,'Operation',addr(p.address),bytes(creation.expected.operationId)));
  let watermark=0;
  async function simulate(contractId,method,args,meta,validate) {
    check(METHODS.has(method)&&[c,policy.registryId,PORTAL_PINS.rx.contractId].includes(contractId),'portal_preflight_getter_forbidden');
    if(contractId===PORTAL_PINS.rx.contractId&&['get_prescription','is_valid'].includes(method))check(scValToNative(args[0])===3n,'portal_preflight_rx4_forbidden');
    const tx=new TransactionBuilder(new Account(policy.admin,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(new Contract(contractId).call(method,...args)).setTimeout(60).build();
    for(let attempt=0;attempt<3;attempt++){
      calls.unsignedGetterSimulations++;const r=await server.simulateTransaction(tx),record={...meta,contractId,method,observedLedger:r.latestLedger,status:'unavailable',valueVerified:false,archivedKeys:[]};
      if(!Number.isSafeInteger(r.latestLedger)||r.latestLedger<1){errors.push('portal_preflight_ledger_invalid');probes.push(record);return null;}
      if(r.result?.auth!==undefined&&(!Array.isArray(r.result.auth)||r.result.auth.length)){errors.push('portal_preflight_auth_required');probes.push(record);return null;}
      if('restorePreamble'in r||(rpc.Api.isSimulationSuccess(r)&&!clinicalSimulationIsLive(r))){
        try{const keys=archiveKeys(r,known);record.status='archived';record.archivedKeys=keys.map(key=>{const encoded=key.toXDR('base64');(meta.required?requiredMissing:optionalMissing).set(encoded,key);return{keyXdr:encoded,keySha256:sha(key.toXDR())};});}catch{errors.push('portal_preflight_archival_metadata_invalid');}
        probes.push(record);return null;
      }
      if(!rpc.Api.isSimulationSuccess(r)||!r.result||!Array.isArray(r.result.auth)){errors.push('portal_preflight_getter_unavailable');probes.push(record);return null;}
      let value;try{value=scValToNative(r.result.retval);check(validate(value),'portal_preflight_value_invalid');}catch{errors.push('portal_preflight_value_invalid');probes.push(record);return null;}
      if(r.latestLedger<watermark){if(attempt<2)continue;errors.push('portal_preflight_ledger_regressed');probes.push(record);return null;}
      watermark=r.latestLedger;record.status='live';record.valueVerified=true;probes.push(record);return value;
    }
  }
  check((await server.getNetwork()).passphrase===Networks.TESTNET,'portal_preflight_network_invalid');
  // Reuse the canonical executable-byte auditor; an unpinned executable stops the inventory.
  const pinServer={getNetwork:(...a)=>server.getNetwork(...a),getLedgerEntries:(...a)=>server.getLedgerEntries(...a),simulateTransaction:async tx=>{
    check(tx.signatures.length===0&&tx.operations.length===1&&tx.operations[0].type==='invokeHostFunction','portal_preflight_getter_forbidden');calls.unsignedGetterSimulations++;
    const r=await server.simulateTransaction(tx);check(rpc.Api.isSimulationSuccess(r)&&clinicalSimulationIsLive(r)&&r.result?.auth?.length===0,'portal_preflight_deployment_unavailable');return r;
  }};
  const auditor=deploymentAuditorFactory({server:pinServer,readerAddress:policy.admin}),deployments=[];
  for(const pin of Object.values(PORTAL_PINS)){const configuration=pin===PORTAL_PINS.clinical?{get_registry:policy.registryId}:pin===PORTAL_PINS.registry?{get_admin:policy.admin}:{get_registry:policy.registryId,get_admin:policy.admin,get_booking_authority:policy.admin};
    const v=await auditor.auditDeployment({name:pin.name,contractId:pin.contractId,expectedWasmHash:pin.wasmHash,interfaceVersion:pin.interfaceVersion,configuration});watermark=Math.max(watermark,v.observedLedger);deployments.push({name:v.name,contractId:v.contractId,wasmHash:v.observedWasmHash,verified:true});}
  const meta=(kind,extra={})=>({kind,required:true,...extra});
  await simulate(c,'get_history',[bytes(policy.historyId)],meta('history'),v=>exact(v,['history_id','patient','created_at'])&&hex(v.history_id)===policy.historyId&&v.patient===p.address&&uint(v.created_at));
  const grant=await simulate(c,'get_grant',[bytes(policy.historyId),addr(d.address)],meta('doctor_grant'),v=>exact(v,['can_read','can_append','revision'])&&typeof v.can_read==='boolean'&&typeof v.can_append==='boolean'&&uint(v.revision));
  const auth=await simulate(policy.registryId,'get_authorization',[addr(d.address)],meta('doctor_authorization'),v=>exact(v,['commitment','schema_version','version','valid_until','revoked'])&&hex(v.commitment)!==null&&Number(v.schema_version)===1&&uint(v.version)&&Number(v.version)>0&&uint(v.valid_until)&&Number(v.valid_until)>0&&typeof v.revoked==='boolean');
  const authorized=await simulate(policy.registryId,'is_authorized',[addr(d.address)],meta('doctor_authorized'),v=>typeof v==='boolean');
  const patientRead=await simulate(c,'can_read',[bytes(policy.historyId),addr(p.address)],meta('patient_access'),v=>typeof v==='boolean');
  const doctorRead=await simulate(c,'can_read',[bytes(policy.historyId),addr(d.address)],meta('doctor_access'),v=>typeof v==='boolean');
  let ordinal=0;
  for(const [entryId,list] of groups){ordinal++;const latest=list.at(-1);
    await simulate(c,'get_entry',[bytes(policy.historyId),bytes(entryId)],meta('entry_head',{entryOrdinal:ordinal}),v=>exact(v,['author','head_version'])&&v.author===latest.context.author&&Number(v.head_version)===Number(latest.version));
    for(const row of list){const e=row.expected,context=row.context,version=Number(row.version),validVersion=v=>exact(v,['author','commitment','previous_commitment','version','created_at'])&&v.author===context.author&&Number(v.version)===version&&hex(v.commitment)===row.commitment&&(v.previous_commitment===null?null:hex(v.previous_commitment))===context.previousCommitment&&uint(v.created_at);
      await simulate(c,'get_version',[bytes(policy.historyId),bytes(entryId),nativeToScVal(version,{type:'u32'})],meta('version',{entryOrdinal:ordinal,version}),validVersion);
      const input=struct({history_id:bytes(e.historyId),entry_id:bytes(e.entryId),author:addr(e.author),commitment:bytes(e.commitment),expected_version:nativeToScVal(e.expectedVersion,{type:'u32'}),expected_grant_revision:nativeToScVal(BigInt(e.expectedGrantRevision),{type:'u64'}),operation_id:bytes(e.operationId)}),digest=sha(xdr.ScVal.scvVec([sym('append'),addr(c),input]).toXDR());
      await simulate(c,'get_operation',[addr(e.author),bytes(e.operationId)],meta('append_operation',{entryOrdinal:ordinal,version}),v=>exact(v,['digest','outcome'])&&hex(v.digest)===digest&&Array.isArray(v.outcome)&&v.outcome.length===2&&v.outcome[0]==='Version'&&validVersion(v.outcome[1]));
    }
  }
  if(creation){const e=creation.expected,digest=sha(xdr.ScVal.scvVec([sym('create'),addr(c),addr(p.address),bytes(policy.historyId),bytes(e.operationId)]).toXDR());
    await simulate(c,'get_operation',[addr(p.address),bytes(e.operationId)],{kind:'creation_operation',required:false},v=>exact(v,['digest','outcome'])&&hex(v.digest)===digest&&v.outcome?.[0]==='History'&&v.outcome[1].patient===p.address&&hex(v.outcome[1].history_id)===policy.historyId);
  }
  let rxState=null;
  await simulate(PORTAL_PINS.rx.contractId,'get_prescription',[nativeToScVal(3n,{type:'u64'})],meta('rx3'),v=>{
    const state=Array.isArray(v.status)&&v.status.length===1?v.status[0]:null;
    if(!(exact(v,['id','doctor','patient','commitment','schema_version','issued_at','expires_at','status'])&&String(v.id)==='3'&&v.doctor===d.address&&v.patient===p.address&&hex(v.commitment)===rx.commitment&&Number(v.schema_version)===1&&Number(v.expires_at)===Number(rx.expires_at)&&['Registered','Active','Revoked','Blocked'].includes(state)))return false;
    rxState={lifecycleState:state,expired:Number(v.expires_at)<=now,expiresAt:Number(v.expires_at)};return true;
  });
  await simulate(PORTAL_PINS.rx.contractId,'is_valid',[nativeToScVal(3n,{type:'u64'})],meta('rx3_validity'),v=>typeof v==='boolean'&&(!rxState||v===(rxState.lifecycleState==='Active'&&!rxState.expired)));
  // Observe authorization again: no grant/registry result cache may conceal a mid-read change.
  await simulate(policy.registryId,'get_authorization',[addr(d.address)],meta('doctor_authorization_final'),v=>auth!==null&&JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x)===JSON.stringify(auth,(_,x)=>typeof x==='bigint'?x.toString():x));
  await simulate(c,'get_grant',[bytes(policy.historyId),addr(d.address)],meta('doctor_grant_final'),v=>grant!==null&&exact(v,['can_read','can_append','revision'])&&v.can_read===grant.can_read&&v.can_append===grant.can_append&&Number(v.revision)===Number(grant.revision));
  await simulate(c,'can_read',[bytes(policy.historyId),addr(d.address)],meta('doctor_access_final'),v=>typeof v==='boolean'&&v===doctorRead);
  for(const k of requiredMissing.keys())optionalMissing.delete(k);
  const requiredFootprint=portalFootprint([...requiredMissing.values()]),completeFootprint=portalFootprint([...requiredMissing.values(),...optionalMissing.values()]);
  const stateReady=errors.length===0&&probes.filter(v=>v.required).every(v=>v.status==='live'),accessReady=stateReady&&authorized===true&&patientRead===true&&doctorRead===true&&grant?.can_append===true&&Number(auth?.valid_until)>now&&auth?.revoked===false;
  const windowActive=Number.isSafeInteger(policy.createdAt)&&policy.createdAt>0&&Number.isSafeInteger(policy.until)&&now>=policy.createdAt&&now<policy.until;
  const quote=null; // No live quote path without a separately approved add-on loader.
  return {status:stateReady?'LIVE_READ_FOOTPRINT_VERIFIED':'READ_FOOTPRINT_NOT_READY',auditedAt:new Date(now*1000).toISOString(),network:'testnet',policyHash:policy.policyHash??null,sourceFilesSha256:hashes,sourceBoundaries:{head:'clinicalSnapshot/versionChain.entry',version:'clinicalDocument/readVersion plus versionChain.version',appendReceipt:'clinicalSnapshot/verifyRecordedOperation',creationReceipt:'owner-only optional clinicalCreationReceipt'},deployments,inventory:{entries:groups.size,versions:versions.length,headReads:groups.size,appendOperationReads:versions.length,creationOperationKnown:!!creation,rxIds:['3']},requiredStateReady:stateReady,accessReady,financialWindow:{createdAt:policy.createdAt,until:policy.until,evaluatedAt:now,active:windowActive},readyForFinancialPreparation:accessReady&&windowActive,grant:grant?{revision:Number(grant.revision),canRead:grant.can_read,canAppend:grant.can_append}:null,doctor:auth?{version:Number(auth.version),expired:Number(auth.valid_until)<=now,authorized,revoked:auth.revoked}:null,rx3:rxState,probes,errors,requiredMissingFootprint:requiredFootprint,completeMissingFootprint:completeFootprint,optionalDirectoryNotEnumerated:true,restorationQuoteDisabledInCli:true,quote,calls,limits:{authenticatedHttpExecuted:false,privatePlaintextRead:false,privyApiCalls:0,sqlWrites:0,signatures:0,submissions:0,journalsCreated:0,intentsSaved:0,environmentChanges:0,otherActorGrantsQueried:false,rx4Queried:false,financialAuthorityCreated:false}};
}

export async function main(argv=process.argv.slice(2)) {
  const flags=new Set(),values=new Set(['--env-file','--plan-file','--plan-hash','--approval-hash']),options={};
  for(let i=0;i<argv.length;i++){const k=argv[i];check(flags.has(k)||values.has(k),'portal_preflight_arguments_invalid');check(options[k]===undefined,'portal_preflight_arguments_invalid');if(flags.has(k))options[k]=true;else{check(typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'portal_preflight_arguments_invalid');options[k]=argv[++i];}}
  const env=parseEnv(readFileSync(options['--env-file']??resolve(ROOT,'.env.local'),'utf8'));
  check(options['--plan-file']&&options['--plan-hash']&&options['--approval-hash'],'portal_preflight_explicit_scope_required');
  const scoped={...env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:resolve(options['--plan-file']),TRUSTLEAF_CLINICAL_REHEARSAL_HASH:options['--plan-hash'],TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:options['--approval-hash']};
  const policy=loadRehearsalPolicy({env:scoped});environment(env,policy);
  const report=await auditClinicalPortalReadFootprint({env,policy,sql:neon(databaseConnectionString(env)),server:new rpc.Server(clinicalRpcUrl(env.TRUSTLEAF_CLINICAL_RPC_PROVIDER),{timeout:25})});
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(report=>{console.log(JSON.stringify(report));if(!report.readyForFinancialPreparation)process.exitCode=2;}).catch(error=>{console.error(JSON.stringify({status:'PREFLIGHT_FAILED_CLOSED',error:/^portal_preflight_[a-z_]+$/.test(error?.message??'')?error.message:'portal_preflight_unavailable',signatures:0,submissions:0,sqlWrites:0}));process.exitCode=1;});
