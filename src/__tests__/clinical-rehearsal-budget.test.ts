import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Account, BASE_FEE, Keypair, Networks, SorobanDataBuilder, TransactionBuilder } from '@stellar/stellar-sdk';
const mocks=vi.hoisted(()=>({authority:vi.fn(),exposure:vi.fn(),receipt:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../../scripts/lib/clinical-rehearsal-policy.mjs',async original=>({...await original<typeof import('../../scripts/lib/clinical-rehearsal-policy.mjs')>(),assertRehearsalAggregateBudget:mocks.authority}));
vi.mock('../../scripts/lib/clinical-rehearsal-budget.mjs',()=>({assertRehearsalAggregateExposure:mocks.exposure}));
vi.mock('@/lib/clinical/config',()=>({CLINICAL_ID:'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U'}));
vi.mock('@/lib/clinical/chain',async original=>({...await original<typeof import('@/lib/clinical/chain')>(),createClinicalWebChain:()=>({receipt:mocks.receipt})}));
import { assertClinicalRehearsalBudget } from '@/lib/clinical/rehearsal-budget';
import { assertClinicalUnsigned,clinicalInvocation,deriveClinicalEntryId,deriveClinicalHistoryId } from '@/lib/clinical/chain';
import { assertClinicalRehearsalExpected } from '@/lib/clinical/rehearsal';
import type { RehearsalPolicy } from '@/lib/clinical/rehearsal';
const patient={userId:'did:privy:aggregate_patient',walletId:'aggregate-patient',address:Keypair.fromRawEd25519Seed(Buffer.alloc(32,66)).publicKey()};
const doctor={userId:'did:privy:aggregate_doctor',walletId:'aggregate-doctor',address:Keypair.fromRawEd25519Seed(Buffer.alloc(32,67)).publicKey()};
function fixture(){
 const historyId=deriveClinicalHistoryId(patient.address),operationId='ab'.repeat(32);
 const step={key:'append_pdf',actor:'doctor',action:'append_version',requestId:'00000000-0000-4000-8000-000000000004',operationId,maxFeeStroops:'150000000',input:{action:'append_version',historyId}};
 const plan={schemaVersion:2,runId:'00000000-0000-4000-8000-000000000001',historyId,patient,doctor,startingGrantRevision:5,steps:[step],aggregateBudget:{approvedAt:1}} as unknown as RehearsalPolicy;
 const expected={historyId,patient:patient.address,author:doctor.address,operationId,entryId:deriveClinicalEntryId(historyId,doctor.address,operationId),expectedVersion:0,expectedGrantRevision:6,previousCommitment:null,commitment:'cd'.repeat(32)};
 const unsigned=new TransactionBuilder(new Account(doctor.address,'123'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(clinicalInvocation('append_version',expected)).setSorobanData(new SorobanDataBuilder().setResourceFee('120000000').build()).setTimeout(180).build();
 const row={id:step.requestId,state:'awaiting_signature',action:'append_version',method:'append_version',source_wallet:doctor.address,actor_user_id:doctor.userId,wallet_id:doctor.walletId,contract_id:'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U',network:'testnet',expected,unsigned_xdr:unsigned.toXDR(),signing_hash:unsigned.hash().toString('hex'),signed_xdr:null,transaction_hash:null,error_code:null,expires_at:Number(unsigned.timeBounds!.maxTime)};
 const rows:Record<string,any>[]=[];
 const client={query:vi.fn(async(sql:string,_values?:unknown[])=>({rows:sql.includes('FROM clinical_web_operations')?rows:[]}))};
 return {plan,step:step as RehearsalPolicy['steps'][number],expected,unsigned,row,rows,client:client as any};
}
beforeEach(()=>{vi.clearAllMocks();mocks.authority.mockReturnValue({});mocks.exposure.mockResolvedValue({});mocks.receipt.mockResolvedValue({status:'NOT_FOUND'});});
afterEach(()=>vi.restoreAllMocks());
it('old plans do not acquire a new database or RPC requirement',async()=>{
 const f=fixture();delete (f.plan as any).aggregateBudget;
 await assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected);
 expect(f.client.query).not.toHaveBeenCalled();expect(mocks.authority).not.toHaveBeenCalled();expect(mocks.exposure).not.toHaveBeenCalled();
});
it('rejects borrowed authority before database or RPC access',async()=>{
 const f=fixture();mocks.authority.mockImplementation(()=>{throw Error('clinical_rehearsal_scope_rejected');});
 await expect(assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected)).rejects.toMatchObject({message:'clinical_rehearsal_budget_unavailable',status:503});
 expect(f.client.query).not.toHaveBeenCalled();expect(mocks.exposure).not.toHaveBeenCalled();
});
it('locks the run before reading its exact slots and passes the same candidate and receipt adapter',async()=>{
 const f=fixture();expect(()=>assertClinicalRehearsalExpected(f.plan,f.step,doctor,f.expected)).not.toThrow();expect(()=>assertClinicalUnsigned(f.unsigned,doctor.address,'append_version',f.expected)).not.toThrow();f.rows.push(f.row);const receipt=vi.fn(async()=>({status:'NOT_FOUND'}));
 mocks.exposure.mockImplementation(async(_policy,options)=>{await options.receipt('a'.repeat(64));});
 await assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected,receipt);
 expect(f.client.query.mock.calls[0]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))',['clinical-rehearsal:'+f.plan.runId]]);
 expect(f.client.query.mock.calls[1][1]).toEqual([[f.step.requestId]]);
 expect(mocks.exposure).toHaveBeenCalledWith(f.plan,expect.objectContaining({step:f.step,rows:f.rows,candidate:{unsignedXdr:f.unsigned.toXDR(),offeredFeeStroops:124000000n}}));
 expect(receipt).toHaveBeenCalledWith('a'.repeat(64));
 expect(f.client.query.mock.calls.every((call:[string,unknown[]?])=>call[0].startsWith('SELECT'))).toBe(true);
});
it.each(['source_wallet','actor_user_id','wallet_id','contract_id','network','method','action'])('rejects a changed persisted %s before budget RPC',async field=>{
 const f=fixture();f.rows.push({...f.row,[field]:'changed'});
 await expect(assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected)).rejects.toMatchObject({message:'clinical_rehearsal_budget_unavailable',status:503});
 expect(mocks.exposure).not.toHaveBeenCalled();expect(mocks.receipt).not.toHaveBeenCalled();
});
it('refuses an altered persisted unsigned invocation and invalid signed envelope',async()=>{
 for(const patch of [{unsigned_xdr:'invalid'},{signed_xdr:'invalid',transaction_hash:'f'.repeat(64)}]){
  const f=fixture();f.rows.push({...f.row,...patch});
  await expect(assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected)).rejects.toMatchObject({message:'clinical_rehearsal_budget_unavailable',status:503});
 }
 expect(mocks.exposure).not.toHaveBeenCalled();
});
it('keeps aggregate overflow distinct from unavailable accounting without leaking raw details',async()=>{
 const f=fixture();mocks.exposure.mockRejectedValueOnce(Error('clinical_rehearsal_budget_exceeded'));
 await expect(assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected)).rejects.toMatchObject({message:'clinical_rehearsal_budget_exceeded',status:409});
 mocks.exposure.mockRejectedValueOnce(Error('private RPC diagnostic must not be returned'));
 await expect(assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected)).rejects.toMatchObject({message:'clinical_rehearsal_budget_unavailable',status:503});
});

it('schema12 includes the exact administrative request and its durable reservation under the shared run lock',async()=>{
 const f=fixture(),requestId='00000000-0000-4000-8000-000000000101',authorizationRows=[{id:requestId,state:'submitted'}],authorizationReservations=[{request_id:requestId,state:'signed'}];
 Object.defineProperty(f.plan,'completionContinuation',{value:{doctorWindowSeconds:604800}});(f.plan as any).authorization={requestId};
 f.client.query.mockImplementation(async(sql:string)=>({rows:sql.includes('FROM doctor_authorization_requests')?authorizationRows:sql.includes('FROM sponsorship_reservations')?authorizationReservations:[]}));
 await assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected);
 expect(f.client.query.mock.calls[0]).toEqual(['SELECT pg_advisory_xact_lock(hashtext($1))',['clinical-rehearsal:'+f.plan.runId]]);
 expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('FROM doctor_authorization_requests WHERE id=$1'),[requestId]);
 expect(f.client.query).toHaveBeenCalledWith(expect.stringContaining('FROM sponsorship_reservations WHERE request_id=$1'),[requestId]);
 expect(mocks.exposure).toHaveBeenCalledWith(f.plan,expect.objectContaining({authorizationRows,authorizationReservations}));
 expect(f.client.query.mock.calls.every((call:[string,unknown[]?])=>call[0].startsWith('SELECT'))).toBe(true);
});

it('schema14 passes its original approved object and raw receipt transport to the shared canonical resolver',async()=>{
 const f=fixture();Object.defineProperty(f.plan,'resumeContinuation',{value:{previousUntil:1,receiptEvidenceFile:'unit-private',receiptEvidenceSha256:'a'.repeat(64)}});
 const hash='b'.repeat(64),live={status:'NOT_FOUND'};mocks.receipt.mockResolvedValue(live);
 mocks.exposure.mockImplementation(async(policy,options)=>{expect(policy).toBe(f.plan);expect(policy.resumeContinuation.receiptEvidenceSha256).toBe('a'.repeat(64));expect(await options.receipt(hash)).toBe(live);});
 await assertClinicalRehearsalBudget(f.client,f.plan,f.step,f.unsigned,f.expected);
 expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith(hash);
});
