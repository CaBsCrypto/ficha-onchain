import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({token:vi.fn(),fetch:vi.fn(),auth:vi.fn(),actor:vi.fn(),config:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@privy-io/react-auth',()=>({getAccessToken:m.token}));
vi.mock('@privy-io/react-auth/extended-chains',()=>({useSignRawHash:()=>({signRawHash:vi.fn()})}));
vi.mock('@/lib/auth/privy-auth',()=>({requireUser:m.auth}));
vi.mock('@/lib/clinical/identity',()=>({resolveClinicalActor:m.actor}));
vi.mock('@/lib/clinical/config',()=>({assertClinicalEnvironment:m.config}));
vi.mock('@/lib/clinical/create-once',()=>({clinicalCreateOnceConfigured:()=>false,assertClinicalWriteScope:vi.fn()}));
vi.mock('@/lib/clinical/rehearsal',()=>({rehearsalConfigured:()=>false,currentClinicalRehearsal:vi.fn()}));
import { createClinicalReadTrace, clinicalReadStage, CLINICAL_READ_DIAGNOSTICS_HEADER as HEADER } from '@/lib/clinical/read-trace';
import { clientClinicalReadDiagnostics } from '@/lib/clinical/read-trace-client';
import { createServerClinicalReadTrace } from '@/lib/clinical/read-trace-server';
import { authedFetch } from '@/lib/auth/authed-fetch';
import { readClinicalPrescriptions, CLINICAL_READ_TIMEOUT_MS } from '@/components/private-portal/clinical-client';
import { clinicalApi as serverApi } from '@/lib/clinical/api';
const PATH='/api/private-clinical-history',FRAGMENT='#clinical-read-diagnostics',SECRET='PRIVATE_SENTINEL_Bearer_JWT_user_id_url_body';
const user={userId:'did:privy:synthetic',email:'synthetic@example.test'},actor={...user,walletId:'private-wallet',address:'private-address'};
function browser(origin='http://localhost:3016',hash=FRAGMENT){vi.stubGlobal('window',{location:new URL(origin+'/doctor'+hash)});}
function request(path=PATH,{method='GET',header='1',host='localhost:3016',origin='http://localhost:3016',signal}:{method?:string;header?:string;host?:string;origin?:string;signal?:AbortSignal}={}){return new Request(origin+path,{method,signal,headers:{host,[HEADER]:header}});}
const logs=()=>JSON.stringify(vi.mocked(console.info).mock.calls);
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('TRUSTLEAF_CLINICAL_READ_DIAGNOSTICS',undefined);vi.stubGlobal('fetch',m.fetch);vi.spyOn(console,'info').mockImplementation(()=>{});m.token.mockResolvedValue(SECRET);m.fetch.mockResolvedValue(Response.json({prescriptions:[]}));m.auth.mockResolvedValue(user);m.actor.mockResolvedValue(actor);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
describe('fixed local clinical read trace switches',()=>{
 it.each(['localhost','127.0.0.1','[::1]'])('requires exact fragment and GET paths on %s',host=>{
  browser('http://'+host+':3016');for(const suffix of ['', '/prescriptions','/document'])expect(clientClinicalReadDiagnostics(PATH+suffix+'?historyId='+SECRET)).toBe(true);
  for(const path of [PATH+'/',PATH+'/other','/api/private-clinical-operations',PATH+'extra'])expect(clientClinicalReadDiagnostics(path)).toBe(false);
  expect(clientClinicalReadDiagnostics(PATH,{method:'POST'})).toBe(false);
 });
 it.each(['','#clinical-read-diagnostics-extra','#clinical-read-diagnostics%20','#clinical-read-diagnostics&token=secret'])('keeps diagnostics off for fragment %s',fragment=>{browser('http://localhost:3016',fragment);expect(clientClinicalReadDiagnostics(PATH)).toBe(false);});
 it('never attaches a diagnostic header off-default or to external origins, methods or other APIs',async()=>{
  for(const [origin,fragment,path,method]of [['http://localhost:3016','',PATH,'GET'],['https://external.example',FRAGMENT,PATH,'GET'],['http://localhost:3016',FRAGMENT,'https://external.example'+PATH,'GET'],['http://localhost:3016',FRAGMENT,'http://localhost:3017'+PATH,'GET'],['http://localhost:3016',FRAGMENT,PATH,'POST'],['http://localhost:3016',FRAGMENT,'/api/private-clinical-operations','GET']]){
   browser(origin,fragment);await authedFetch(path,{method,headers:{[HEADER]:'1'}});const init=m.fetch.mock.calls.at(-1)![1];expect(new Headers(init.headers).has(HEADER)).toBe(false);
  }expect(console.info).not.toHaveBeenCalled();
 });
 it('attaches only the constant opt-in header locally and emits no token, URL, query or body',async()=>{
  browser();const init={headers:{'X-Keep':'present'}};await readClinicalPrescriptions('a'.repeat(64));
  const headers=new Headers(m.fetch.mock.calls[0][1].headers);expect(headers.get(HEADER)).toBe('1');expect(headers.get('Authorization')).toBe('Bearer '+SECRET);expect(init.headers).toEqual({'X-Keep':'present'});
  const phases=vi.mocked(console.info).mock.calls.map(call=>(call[1] as any).phase);expect(phases).toEqual(['read','token','token','fetch','fetch','headers','body','body','read']);expect(logs()).not.toContain(SECRET);expect(logs()).not.toContain('a'.repeat(64));expect(logs()).not.toContain('http');
 });
 it('requires server env, exact header, method, path and loopback URL/Host independently',()=>{
  expect(createServerClinicalReadTrace(request())).toBeUndefined();vi.stubEnv('TRUSTLEAF_CLINICAL_READ_DIAGNOSTICS','true');
  expect(createServerClinicalReadTrace(new Request('http://localhost:3016'+PATH,{headers:{[HEADER]:'1'}}))).toBeUndefined();
  expect(createServerClinicalReadTrace(request(PATH,{host:''}))).toBeUndefined();
  for(const req of [request(PATH,{header:'true'}),request(PATH,{method:'POST'}),request(PATH+'/other'),request(PATH,{origin:'https://external.example'}),request(PATH,{host:'external.example'}),request(PATH,{host:'user@localhost:3016'})])expect(createServerClinicalReadTrace(req)).toBeUndefined();
  for(const host of ['localhost','127.0.0.1','[::1]']){const d=createServerClinicalReadTrace(request(PATH,{origin:'http://'+host+':3016',host:host+':3016'}));expect(d).toBeDefined();d!.close();}expect(console.info).not.toHaveBeenCalled();
 });
 it('redacts unsupported vocabulary and closes late callbacks without inspecting errors',async()=>{
  const d=createClinicalReadTrace('client');d.trace(SECRET as any,'ok');d.trace('read',SECRET as any);expect(console.info).not.toHaveBeenCalled();
  const error=new Error(SECRET);Object.defineProperty(error,'message',{get(){throw Error('Message must never be read');}});
  await expect(clinicalReadStage(d.trace,'body',async()=>{throw error;})).rejects.toBe(error);expect(logs()).not.toContain(SECRET);expect(vi.mocked(console.info).mock.calls).toHaveLength(2);
  d.close();d.trace('read','ok');expect(vi.mocked(console.info).mock.calls).toHaveLength(2);
 });
 it('keeps work results and failures unchanged when diagnostic callbacks or logger throw',async()=>{
  const failure=new Error(SECRET),throwing=()=>{throw failure;};expect(await clinicalReadStage(throwing,'work',async()=>17)).toBe(17);await expect(clinicalReadStage(throwing,'work',async()=>{throw failure;})).rejects.toBe(failure);
  vi.mocked(console.info).mockImplementation(()=>{throw failure;});const d=createClinicalReadTrace('server');expect(await clinicalReadStage(d.trace,'work',async()=>19)).toBe(19);d.close();
 });
});
describe('diagnosed read lifetime and existing final access gates',()=>{
 it('keeps the original ninety-second token deadline and prevents late token delivery from fetching or logging',async()=>{
  vi.useFakeTimers();browser();let resolve!:(token:string)=>void;m.token.mockReturnValue(new Promise<string>(done=>{resolve=done;}));
  const controller=new AbortController(),result=readClinicalPrescriptions('a'.repeat(64),controller.signal).catch(error=>error);await Promise.resolve();await Promise.resolve();
  await vi.advanceTimersByTimeAsync(CLINICAL_READ_TIMEOUT_MS);expect((await result).code).toBe('clinical_read_timeout');expect(m.fetch).not.toHaveBeenCalled();expect(logs()).toContain('timeout');const count=vi.mocked(console.info).mock.calls.length;
  resolve(SECRET);await Promise.resolve();await Promise.resolve();await vi.advanceTimersByTimeAsync(1);expect(m.fetch).not.toHaveBeenCalled();expect(vi.mocked(console.info).mock.calls).toHaveLength(count);expect(vi.getTimerCount()).toBe(0);
 });
 it('cleans a parent cancellation without sending a late request or leaving timers',async()=>{
  vi.useFakeTimers();browser();let resolve!:(token:string)=>void;m.token.mockReturnValue(new Promise<string>(done=>{resolve=done;}));const c=new AbortController(),result=readClinicalPrescriptions(undefined,c.signal).catch(error=>error);await Promise.resolve();await Promise.resolve();c.abort();expect((await result).name).toBe('AbortError');const count=vi.mocked(console.info).mock.calls.length;resolve(SECRET);await Promise.resolve();await vi.advanceTimersByTimeAsync(1);expect(m.fetch).not.toHaveBeenCalled();expect(vi.mocked(console.info).mock.calls).toHaveLength(count);expect(vi.getTimerCount()).toBe(0);
 });
 it.each(['session','binding'])('still discards content when the final %s changes during a diagnosed GET',async kind=>{
  vi.stubEnv('TRUSTLEAF_CLINICAL_READ_DIAGNOSTICS','true');if(kind==='session')m.auth.mockResolvedValueOnce(user).mockResolvedValueOnce(null);else m.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({...actor,walletId:'changed'});
  const c=new AbortController(),req=request(PATH+'?historyId='+SECRET,{signal:c.signal});const remove=vi.spyOn(req.signal,'removeEventListener');const response=await serverApi(req,async(_u,_a,trace)=>clinicalReadStage(trace,'target',async()=>({content:SECRET})));
  expect(response.status).toBe(kind==='session'?401:403);expect(await response.text()).not.toContain(SECRET);expect(logs()).not.toContain(SECRET);expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));const count=vi.mocked(console.info).mock.calls.length;c.abort();expect(vi.mocked(console.info).mock.calls).toHaveLength(count);
 });
 it('preserves a generic provider failure and never logs its raw payload',async()=>{
  vi.stubEnv('TRUSTLEAF_CLINICAL_READ_DIAGNOSTICS','true');m.auth.mockRejectedValue(new Error(SECRET));const response=await serverApi(request(),async()=>({content:SECRET}));expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'clinical_service_unavailable'});expect(logs()).not.toContain(SECRET);expect(logs()).toContain('auth');
 });
});
