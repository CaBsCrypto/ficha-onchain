import { expect,it,vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
vi.mock('server-only',()=>({}));
import { clinicalRehearsalStep, type RehearsalPolicy } from '@/lib/clinical/rehearsal';
const address=(n:number)=>Keypair.fromRawEd25519Seed(Buffer.alloc(32,n)).publicKey();
const doctor={userId:'did:privy:synthetic_doctor',walletId:'synthetic-wallet',address:address(31)};
const patient={userId:'did:privy:synthetic_patient',walletId:'patient-wallet',address:address(32)};
const draftId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',historyId='ab'.repeat(32);
function fixture(input:Record<string,unknown>){
 const step={key:'append_pdf',requestId,actor:'doctor',action:'append_version',maxFeeStroops:'150000000',operationId:'cd'.repeat(32),input};
 return {step,plan:{schemaVersion:2,patient,doctor,steps:[step]} as unknown as RehearsalPolicy};
}
const fileInput={requestId,action:'append_version',historyId,file:{fileName:'synthetic.pdf',mediaType:'application/pdf',base64:'JVBERi0xLjQK'}};
it('permits only the two valid offchain fields around the exact approved PDF, without changing plan or content',()=>{
 const {plan,step}=fixture(fileInput),before=JSON.stringify(plan);
 expect(clinicalRehearsalStep(plan,doctor,{...fileInput,draftId,draftRevision:3} as any)).toBe(step);
 expect(clinicalRehearsalStep(plan,doctor,fileInput as any)).toBe(step);
 expect(JSON.stringify(plan)).toBe(before);
});
it('retains every note/RX/correction field in the exact approved payload comparison',()=>{
 const input={requestId,action:'append_version',historyId,entryId:'ef'.repeat(32),expectedVersion:1,
   note:{title:'Synthetic correction',text:'exact approved text',eventDate:null,prescriptionId:'33333333-3333-4333-8333-333333333333'}};
 const {plan}=fixture(input);
 expect(()=>clinicalRehearsalStep(plan,doctor,{...input,draftId,draftRevision:1} as any)).not.toThrow();
 for(const patch of [{expectedVersion:2},{entryId:'ff'.repeat(32)},{note:{...input.note,text:'changed'}},{note:{...input.note,prescriptionId:undefined}}])
  expect(()=>clinicalRehearsalStep(plan,doctor,{...input,...patch,draftId,draftRevision:1} as any)).toThrow('clinical_rehearsal_scope_rejected');
});
it('does not ignore altered PDF bytes, filename, media type or unknown request fields',()=>{
 const {plan}=fixture(fileInput);
 for(const patch of [{file:{...fileInput.file,base64:'changed'}},{file:{...fileInput.file,fileName:'other.pdf'}},
   {file:{...fileInput.file,mediaType:'image/png'}},{until:9999999999},{patient:patient.address},{draftOwner:'other'}])
   expect(()=>clinicalRehearsalStep(plan,doctor,{...fileInput,...patch,draftId,draftRevision:1} as any)).toThrow('clinical_rehearsal_scope_rejected');
});
it('requires paired canonical draft UUID and bounded positive integer revision, only for append',()=>{
 const {plan}=fixture(fileInput);
 for(const patch of [{draftId},{draftRevision:1},{draftId:'invalid',draftRevision:1},{draftId,draftRevision:0},
   {draftId,draftRevision:1.5},{draftId,draftRevision:2147483647},{draftId:draftId.toUpperCase().replace('11111111','AAAAAAAA'),draftRevision:1}])
   expect(()=>clinicalRehearsalStep(plan,doctor,{...fileInput,...patch} as any)).toThrow('clinical_rehearsal_scope_rejected');
 const grant={requestId,action:'set_permissions',doctorId:10,canRead:false,canAppend:false,expectedRevision:6};
 const g=fixture(grant);(g.plan.steps[0] as any).actor='patient';(g.plan.steps[0] as any).key='revoke';
 expect(()=>clinicalRehearsalStep(g.plan,patient,{...grant,draftId,draftRevision:1} as any)).toThrow('clinical_rehearsal_scope_rejected');
});
