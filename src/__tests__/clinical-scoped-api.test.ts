import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { PRIVATE_ADMIN, PRIVY_APP, REGISTRY_PRIVATE, RX_PRIVATE } from '@/lib/private-config';
import { CLINICAL_ID } from '@/lib/clinical/config';
import { assertClinicalWriteScope } from '@/lib/clinical/create-once';
const m = vi.hoisted(() => ({ auth: vi.fn(), actor: vi.fn(), prepare: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/privy-auth', () => ({ requireUser: m.auth }));
vi.mock('@/lib/clinical/identity', () => ({ resolveClinicalActor: m.actor }));
vi.mock('@/lib/clinical/operations', () => ({ prepareClinicalOperation: m.prepare }));
// Actual HTTP wrapper, environment checks, create-once policy and body parser.
import { clinicalApi } from '@/lib/clinical/api';
import { POST } from '@/app/api/private-clinical-operations/route';
const patient=Keypair.fromRawEd25519Seed(Buffer.alloc(32,91)), payer=Keypair.fromRawEd25519Seed(Buffer.alloc(32,92));
const actor={userId:'did:privy:scope_test',walletId:'scope_wallet',address:patient.publicKey()};
const input={requestId:'2f4929bd-48f9-4b9d-bde4-47f7b66a6d91',action:'create_history'};
const request=(body:unknown=input,origin='https://www.trustleaf.org')=>new Request('https://www.trustleaf.org/api/private-clinical-operations',{method:'POST',headers:{host:'www.trustleaf.org',origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.resetAllMocks(); m.auth.mockResolvedValue({userId:actor.userId,email:'fixture@example.test'});m.actor.mockResolvedValue(actor);
 const host='ep-jolly-haze-ahpi0708-pooler.c-3.us-east-1.aws.neon.tech';
 const env={TRUSTLEAF_ENV:'test',VERCEL_ENV:'production',TRUSTLEAF_DATABASE_URL:`postgres://fixture:fixture@${host}/test`,TRUSTLEAF_DB_HOST:host,
  PRIVY_APP_ID:PRIVY_APP,NEXT_PUBLIC_PRIVY_APP_ID:PRIVY_APP,DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID:REGISTRY_PRIVATE,PRESCRIPTION_PRIVATE_CONTRACT_ID:RX_PRIVATE,
  DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY:PRIVATE_ADMIN,BOOKING_AUTHORITY_PUBLIC_KEY:PRIVATE_ADMIN,NEXT_PUBLIC_STELLAR_NETWORK:'testnet',NEXT_PUBLIC_SOROBAN_RPC_URL:'https://soroban-testnet.stellar.org',
  TRUSTLEAF_CLINICAL_WEB_ENABLED:'true',CLINICAL_HISTORY_PRIVATE_CONTRACT_ID:CLINICAL_ID,TRUSTLEAF_PRIVATE_WRITES_ENABLED:'false',TRUSTLEAF_CLINICAL_RPC_PROVIDER:'sdf',RELAYER_SECRET:payer.secret(),
  TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_WALLET:actor.address,TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_RELAYER:payer.publicKey(),TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL:String(Math.floor(Date.now()/1000)+480)};
 for(const[key,value]of Object.entries(env))vi.stubEnv(key,value);
 for(const suffix of ['WALLET','RELAYER','UNTIL'])vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_'+suffix,undefined);
 m.prepare.mockImplementation(async(_user,current,body)=>{assertClinicalWriteScope(body.action,current.address);return {prepared:true};});
});
afterEach(()=>vi.unstubAllEnvs());
it('allows the opted-in HTTP creation while ordinary writes remain disabled',async()=>{
 const result=await POST(request());expect(result.status).toBe(200);expect(await result.json()).toEqual({prepared:true});expect(m.prepare).toHaveBeenCalledOnce();expect(result.headers.get('Cache-Control')).toBe('no-store');
 const work=vi.fn();const ordinary=await clinicalApi(request(),work);expect(ordinary.status).toBe(503);expect(work).not.toHaveBeenCalled();
});
it.each([{action:'append_version',note:{title:'Fixture',text:'Synthetic',eventDate:null}},{action:'set_permissions',doctorId:2,canRead:true,canAppend:false,expectedRevision:0}])('denies another action at the actual operation policy ($action)',async body=>{
 const result=await POST(request({...body,requestId:input.requestId}));expect(result.status).toBe(403);expect(await result.json()).toEqual({error:'clinical_create_once_scope_rejected'});
});
it.each(['anonymous','other-account','cross-origin','expired','missing-mode','mixed-mode'])('rejects %s before invoking the operation handler',async failure=>{
 if(failure==='anonymous')m.auth.mockResolvedValue(null);
 if(failure==='other-account')m.actor.mockResolvedValue({...actor,address:payer.publicKey()});
 if(failure==='expired')vi.stubEnv('TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_UNTIL','1000000000');
 if(failure==='missing-mode')for(const suffix of ['WALLET','RELAYER','UNTIL'])vi.stubEnv('TRUSTLEAF_CLINICAL_HOSTED_CREATE_ONCE_'+suffix,undefined);
 if(failure==='mixed-mode')vi.stubEnv('TRUSTLEAF_CLINICAL_CREATE_ONCE_WALLET',actor.address);
 const result=await POST(request(input,failure==='cross-origin'?'https://other.test':'https://www.trustleaf.org'));
 if(failure==='expired'){expect(result.status).toBe(409);expect(await result.json()).toEqual({error:'clinical_create_once_expired'});}
 else expect([401,403,503]).toContain(result.status);
 expect(m.prepare).not.toHaveBeenCalled();expect(result.headers.get('Cache-Control')).toBe('no-store');
});
