/** Separately approved, one-time read-proof restoration inside the already
 * reserved parent13 maintenance maximum. No parent dates or approvals change. */
import {createHash} from 'node:crypto';
import {realpathSync,lstatSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRehearsalPolicy,payloadHash} from './clinical-rehearsal-policy.mjs';
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
const parentDirectory=resolve(ROOT,'..','rehearsals','79d18d6d-7521-465c-999c-393bbb2212f9');
const keys=[
  "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"
];
const descriptor=Object.freeze({kind:'clinical-readproof-maintenance-addon',requestId:'82b2cccf-1070-41ca-8f69-e097eddfd73e',source:'GBMKFDNUAQWUPSU73SDLAHJLGYJ55B6OTATX5QRIHXYGVJXTZLF26PHB',
 parentPlanFile:resolve(parentDirectory,'plan.private.json'),parentPlanHash:'e3dcee6b274631db745401639a44a6290319fc04317e45a7437189ed2442a083',
 parentApprovalFile:resolve(parentDirectory,'approval.private.json'),parentApprovalHash:'b5567ed7746be4cc5aa0da4d637977fa188af8633c2184d89ffb225eb2741a1b',
 manifestFile:resolve(parentDirectory,'readproof-maintenance-plan.private.json'),approvalFile:resolve(parentDirectory,'readproof-maintenance-approval.private.json'),
 attemptFile:resolve(parentDirectory,'readproof-maintenance-attempt.private.json'),attemptRunId:'79d18d6d-7521-465c-999c-393bbb2212f9',attemptOperation:'restoreproofs',
 keys:Object.freeze(keys),keysSha256:'2e7514f5ac0d2606dd58e9d0356379284ca6531aae44c658f605bcffa35f2895',footprintSha256:'02d1517502b3f0a1822c21704ee7272020babba90af93e18eedb4645770e077a',
 maxFeeStroops:'6672371',until:Date.parse('2026-10-31T22:32:01Z')/1000,parentApprovedAt:Date.parse('2026-10-31T18:32:01Z')/1000,
 parentMaintenance:Object.freeze({requestId:'b6329a70-5b43-4193-8708-86be4280a7ef',transactionHash:'fafba54ec438d2e839e5d23b52ce0ee5b286c5c29bdcb17492005e79521d1c17',ledger:5489600,feeChargedStroops:'13327629'}),
 parentRenewal:Object.freeze({requestId:'de46469b-3f8a-4af8-b409-9744d85c4527',transactionHash:'cd6e6ea2abec586ff5a2e2325be19bb0783b7055264ba4c83fc77a1bfcba3519',ledger:5489712,feeChargedStroops:'4726'}),
 maintenanceMaximumStroops:'20000000',withdrawalReserveStroops:'60000000',aggregateMaximumStroops:'400000000'});
export function readproofMaintenanceDescriptor(){return descriptor;}
export function createReadproofMaintenanceManifest({preparedAt=Math.floor(Date.now()/1000)}={}){
 if(!Number.isSafeInteger(preparedAt)||preparedAt<descriptor.parentApprovedAt||preparedAt>=descriptor.until)throw Error('clinical_readproof_window_expired');
 return {schemaVersion:1,kind:descriptor.kind,preparedAt,parentPlanFile:descriptor.parentPlanFile,parentPlanHash:descriptor.parentPlanHash,
  parentApprovalFile:descriptor.parentApprovalFile,parentApprovalHash:descriptor.parentApprovalHash,requestId:descriptor.requestId,source:descriptor.source,
  maxFeeStroops:descriptor.maxFeeStroops,until:descriptor.until,keys:[...descriptor.keys],keysSha256:descriptor.keysSha256,footprintSha256:descriptor.footprintSha256,
  attemptFile:descriptor.attemptFile,attemptRunId:descriptor.attemptRunId,attemptOperation:descriptor.attemptOperation,
  parentMaintenance:{...descriptor.parentMaintenance},parentRenewal:{...descriptor.parentRenewal},maintenanceMaximumStroops:descriptor.maintenanceMaximumStroops,
  withdrawalReserveStroops:descriptor.withdrawalReserveStroops,aggregateMaximumStroops:descriptor.aggregateMaximumStroops};
}

const digest=value=>createHash('sha256').update(value).digest('hex');
const HASH=/^[a-f0-9]{64}$/;
const fail=code=>Error(code??'clinical_readproof_scope_rejected');
const check=(value,code)=>{if(!value)throw fail(code);};
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function readPinned(file,expectedHash,maximum=65536){
 check(typeof file==='string'&&resolve(file)===file&&HASH.test(expectedHash));
 check(realpathSync(dirname(file))===dirname(file)&&!lstatSync(dirname(file)).isSymbolicLink());
 const stat=lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=maximum&&realpathSync(file)===file);
 const bytes=readFileSync(file);check(digest(bytes)===expectedHash,'clinical_readproof_file_changed');return bytes;
}
function manifest(raw,now){
 check(raw&&Number.isSafeInteger(now)&&now>=raw.preparedAt&&now>=descriptor.parentApprovedAt);
 const expected=createReadproofMaintenanceManifest({preparedAt:raw.preparedAt});
 check(payloadHash(raw)===payloadHash(expected));
 check(BigInt(raw.parentMaintenance.feeChargedStroops)+BigInt(raw.maxFeeStroops)===BigInt(raw.maintenanceMaximumStroops));
 return raw;
}
/** Per-instance authority sets isolate hermetic test loaders from the CLI loader.
 * Dependencies are trusted local tests only; the command supplies none. */
export function createReadproofPolicyLoader({read=readPinned,parentLoader=loadRehearsalPolicy}={}){
 const approved=new WeakSet();
 function inspect({file=descriptor.manifestFile,expectedHash,now=Math.floor(Date.now()/1000)}={}){
  check(file===descriptor.manifestFile);check(typeof expectedHash==='string'&&HASH.test(expectedHash));
  const bytes=read(file,expectedHash),raw=manifest(JSON.parse(bytes.toString('utf8')),now);
  read(descriptor.parentPlanFile,descriptor.parentPlanHash,4100000);read(descriptor.parentApprovalFile,descriptor.parentApprovalHash,4096);
  return freeze({status:'OFFLINE_PROPOSAL_ONLY',planHash:expectedHash,requestId:raw.requestId,keyCount:10,keysSha256:raw.keysSha256,
   maxFeeStroops:raw.maxFeeStroops,until:raw.until,parentPlanHash:raw.parentPlanHash,parentApprovalHash:raw.parentApprovalHash,
   actualMaintenanceFeeStroops:raw.parentMaintenance.feeChargedStroops,maintenanceCombinedMaximumStroops:raw.maintenanceMaximumStroops,
   originalWindowPreserved:true,quoted:false,approvalEvaluated:false,spendingAllowed:false,rpcCalls:0,journalsCreated:0});
 }
 function load({env=process.env,mode='--once',now=Math.floor(Date.now()/1000)}={}){
  check(['--prepare','--once','--reconcile'].includes(mode));
  const file=env.TRUSTLEAF_CLINICAL_READPROOF_MAINTENANCE_FILE,hash=env.TRUSTLEAF_CLINICAL_READPROOF_MAINTENANCE_HASH,
   approvalHash=env.TRUSTLEAF_CLINICAL_READPROOF_MAINTENANCE_APPROVED_HASH;
  check(file===descriptor.manifestFile&&typeof hash==='string'&&HASH.test(hash));
  // Even an unsigned RPC simulation requires this new authorization. The old
  // fourteen-key approval is never accepted for supplemental-key egress.
  check(typeof approvalHash==='string'&&HASH.test(approvalHash),'clinical_readproof_approval_required');
  const raw=manifest(JSON.parse(read(file,hash).toString('utf8')),now),approval=JSON.parse(read(descriptor.approvalFile,approvalHash,4096).toString('utf8'));
  check(approval&&Object.keys(approval).sort().join(',')==='approvedAt,planHash,schemaVersion,statement'&&approval.schemaVersion===1&&approval.planHash===hash&&
   Number.isSafeInteger(approval.approvedAt)&&typeof approval.statement==='string'&&approval.statement.trim()===approval.statement&&approval.statement.length>0&&approval.statement.length<=2000,
   'clinical_readproof_approval_required');
  check(approval.approvedAt>=raw.preparedAt&&approval.approvedAt<descriptor.until&&now>=approval.approvedAt,'clinical_readproof_window_expired');
  const evaluatedAt=mode==='--reconcile'?approval.approvedAt:now;
  check(evaluatedAt<descriptor.until,'clinical_readproof_window_expired');
  read(descriptor.parentPlanFile,descriptor.parentPlanHash,4100000);read(descriptor.parentApprovalFile,descriptor.parentApprovalHash,4096);
  const parentEnv={...env,TRUSTLEAF_CLINICAL_REHEARSAL_FILE:descriptor.parentPlanFile,TRUSTLEAF_CLINICAL_REHEARSAL_HASH:descriptor.parentPlanHash,
   TRUSTLEAF_CLINICAL_REHEARSAL_APPROVED_HASH:descriptor.parentApprovalHash};
  const parent=parentLoader({env:parentEnv,requireApproval:true,now:evaluatedAt});
  check(parent&&parent.policyHash===descriptor.parentPlanHash&&parent.approvalHash===descriptor.parentApprovalHash&&
   parent.createdAt===descriptor.parentApprovedAt&&parent.until===descriptor.until&&parent.relayer===descriptor.source&&
   parent.completionContinuation?.amendmentId===descriptor.attemptRunId&&parent.maintenanceContinuation?.requestId===descriptor.parentMaintenance.requestId&&
   parent.maintenanceContinuation.maxFeeStroops===descriptor.maintenanceMaximumStroops&&parent.aggregateBudget?.maintenanceMaxFeeStroops===descriptor.maintenanceMaximumStroops&&
   parent.authorization?.requestId===descriptor.parentRenewal.requestId&&parent.doctorValidUntil===descriptor.parentApprovedAt+604800);
  const scope={...raw,createdAt:approval.approvedAt,approvedAt:approval.approvedAt,planHash:hash,approvalHash};
  Object.defineProperty(scope,'parentPolicy',{value:parent,enumerable:false});approved.add(scope);return freeze(scope);
 }
 function assert(scope,{now=Math.floor(Date.now()/1000)}={}){
  check(scope&&approved.has(scope),'clinical_readproof_approval_required');
  check(Number.isSafeInteger(now)&&now>=scope.approvedAt&&now<descriptor.until&&scope.until===descriptor.until,'clinical_readproof_window_expired');
  check(scope.maxFeeStroops==='6672371'&&BigInt(scope.parentMaintenance.feeChargedStroops)+BigInt(scope.maxFeeStroops)===20000000n);
  return scope;
 }
 return Object.freeze({load,assert,inspect});
}
const defaultLoader=createReadproofPolicyLoader();
export const loadReadproofMaintenancePolicy=options=>defaultLoader.load(options);
export const assertReadproofMaintenancePolicy=(scope,options)=>defaultLoader.assert(scope,options);
export const inspectReadproofMaintenanceProposal=options=>defaultLoader.inspect(options);
