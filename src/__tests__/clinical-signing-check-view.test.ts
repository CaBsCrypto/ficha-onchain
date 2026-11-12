import {beforeEach,expect,it,vi} from 'vitest';
const mocked=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../../scripts/lib/clinical-rehearsal-policy.mjs',async importOriginal=>({...await importOriginal<any>(),loadRehearsalPolicy:mocked.load}));
import {clinicalRehearsalView} from '@/lib/clinical/rehearsal';
const patient={userId:'did:privy:check_patient',walletId:'check_patient_wallet',address:'G'+'P'.repeat(55)},doctor={userId:'did:privy:check_doctor',walletId:'check_doctor_wallet',address:'G'+'D'.repeat(55)};
const history='a'.repeat(64),runId='00000000-0000-4000-8000-000000000030';
function policy(replacement=true){return {runId,until:1900000000,historyId:history,patient,doctor,...(replacement?{noteReplacement:{privateProof:'MUST_NOT_LEAK'}}:{}),steps:[{actor:'doctor',requestId:'00000000-0000-4000-8000-000000000001',input:{action:'append_version',note:{title:'PRIVATE TITLE',text:'PRIVATE TEXT',prescriptionId:'PRIVATE RECIPE'}}},{actor:'patient',requestId:'00000000-0000-4000-8000-000000000002',input:{action:'set_permissions',canRead:false,canAppend:false,expectedRevision:6}}]};}
beforeEach(()=>vi.resetAllMocks());
it('exposes the technical signing check only to the doctor of an approved replacement scope',()=>{
 mocked.load.mockReturnValue(policy());
 expect(clinicalRehearsalView(doctor,history)?.signingCheck).toBe(true);
 expect(clinicalRehearsalView(patient,history)?.signingCheck).toBeUndefined();
 expect(clinicalRehearsalView(doctor,'b'.repeat(64))).toBeUndefined();
 mocked.load.mockReturnValue(policy(false));expect(clinicalRehearsalView(doctor,history)?.signingCheck).toBeUndefined();
});
it('missing or expired approval exposes no check and the view contains no payload or superseded proof',()=>{
 mocked.load.mockReturnValue(policy());
 const view=JSON.stringify(clinicalRehearsalView(doctor,history));
 for(const privateValue of ['MUST_NOT_LEAK','PRIVATE TITLE','PRIVATE TEXT','PRIVATE RECIPE','privateProof'])expect(view).not.toContain(privateValue);
 mocked.load.mockImplementation(()=>{throw Error('clinical_rehearsal_approval_required');});expect(clinicalRehearsalView(doctor,history)).toBeUndefined();
 mocked.load.mockImplementation(()=>{throw Error('clinical_rehearsal_expired');});expect(clinicalRehearsalView(doctor,history)).toBeUndefined();
});
