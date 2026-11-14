// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { setTimeout as realTimeout } from 'node:timers';
import { Keypair } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalSigningCheck, CLINICAL_SIGNING_CHECK_DOMAIN, clinicalSigningCheckScopeKey, type ClinicalSigningCheckScope } from '@/components/private-portal/ClinicalSigningCheck';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import type { ClinicalSnapshot } from '@/types/clinical';
const deps=vi.hoisted(()=>({sign:vi.fn(),status:vi.fn(),fetch:vi.fn(),userId:'did:privy:doctor',walletId:'doctor-wallet',address:''}));
vi.mock('@privy-io/react-auth/extended-chains',()=>({useSignRawHash:()=>({signRawHash:deps.sign})}));
vi.mock('@privy-io/react-auth',()=>({usePrivy:()=>({ready:true,authenticated:true,user:{id:deps.userId}})}));
vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:deps.fetch}));
vi.mock('@/components/private-portal/WalletBoundary',()=>({usePortalWallet:()=>({walletId:deps.walletId,address:deps.address})}));
let key: Keypair, other: Keypair;
const NOW=1792926000000,HISTORY='a'.repeat(64),RUN='10000000-0000-4000-8000-000000000001',REQUEST='10000000-0000-4000-8000-000000000002';
const scope=():ClinicalSigningCheckScope=>({identity:'did:privy:doctor:doctor-wallet:'+key.publicKey()+':doctor:'+HISTORY,address:key.publicKey(),historyId:HISTORY,runId:RUN,until:Math.floor(NOW/1000)+21600});
const response=(body:unknown)=>({ok:true,status:200,json:async()=>body});
const signValid=async({hash}:{hash:string})=>({signature:'0x'+key.sign(Buffer.from(hash.slice(2),'hex')).toString('hex')});
let roots:Array<{root:Root;host:HTMLDivElement}>=[];
async function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});await act(async()=>root.render(node));return{root,host};}
const button=(host:HTMLElement,label:string)=>[...host.querySelectorAll('button')].find(value=>value.textContent===label)!;
async function click(host:HTMLElement,label:string){await act(async()=>button(host,label).click());}
async function settle(predicate:()=>boolean){for(let n=0;n<200;n++){await act(async()=>{await new Promise(resolve=>realTimeout(resolve,5));});if(predicate())return;}throw Error('local_check_did_not_settle');}
function check(value=scope(),props:Partial<React.ComponentProps<typeof ClinicalSigningCheck>>={}){return createElement(ClinicalSigningCheck,{scope:value,verified:false,disabled:false,onStatusChange:deps.status,...props});}
function snapshot(flag:boolean|undefined=true,canAppend=true):ClinicalSnapshot{return{history:{id:HISTORY,patient:other.publicKey(),createdAt:1792800000},entries:[],grants:[],operations:[],verifiedAt:new Date(NOW).toISOString(),context:{role:'doctor',canRead:false,canAppend,grantRevision:5},writes:{create_history:false,append_version:canAppend,set_permissions:false},rehearsal:{runId:RUN,until:scope().until,...(flag===true?{signingCheck:true as const}:{}),steps:[{requestId:REQUEST,action:'append_version',kind:'note',expectedVersion:0}]}};}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('Uint8Array',Object.getPrototypeOf(Buffer.prototype).constructor);key=Keypair.fromRawEd25519Seed(Buffer.alloc(32,61));other=Keypair.fromRawEd25519Seed(Buffer.alloc(32,62));vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});vi.setSystemTime(NOW);vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn());deps.userId='did:privy:doctor';deps.walletId='doctor-wallet';deps.address=key.publicKey();deps.sign.mockImplementation(signValid);deps.fetch.mockResolvedValue(response(snapshot()));(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollIntoView=vi.fn();});
afterEach(async()=>{for(const{root,host}of roots){await act(async()=>root.unmount());host.remove();}roots=[];vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('local Privy signing check without a clinical request',()=>{
 it('signs a fresh domain-separated challenge and verifies real Ed25519 locally without persistence or network',async()=>{
  const digest=vi.spyOn(webcrypto.subtle,'digest');const storage=vi.spyOn(Storage.prototype,'setItem');const current=scope();
  const{host}=await mount(check(current));expect(host.textContent).toContain('Prueba técnica sin transacción');expect(deps.sign).not.toHaveBeenCalled();
  await click(host,'Comprobar firma con Privy');await settle(()=>deps.status.mock.calls.some(([,status])=>status==='verified'));
  expect(deps.sign).toHaveBeenCalledOnce();const input=deps.sign.mock.calls[0][0];expect(input).toMatchObject({address:current.address,chainType:'stellar'});expect(input.hash).toMatch(/^0x[a-f0-9]{64}$/);expect(input.hash).not.toBe('0x'+'f'.repeat(64));
  const message=new TextDecoder().decode(digest.mock.calls[0][1] as Uint8Array);expect(message.startsWith(CLINICAL_SIGNING_CHECK_DOMAIN+'\n')).toBe(true);const payload=JSON.parse(message.slice(message.indexOf('\n')+1));expect(payload).toMatchObject({network:'testnet',identity:current.identity,address:current.address,historyId:HISTORY,runId:RUN,until:current.until});expect(payload.nonce).toMatch(/^[a-f0-9]{64}$/);expect(payload.nonce).not.toBe('0'.repeat(64));
  expect(deps.status).toHaveBeenLastCalledWith(clinicalSigningCheckScopeKey(current),'verified');expect(deps.fetch).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();expect(host.textContent).not.toContain(input.hash);expect(host.textContent).not.toContain(payload.nonce);
 });
 it('rejects a real signature from another key instead of unlocking preparation',async()=>{
  deps.sign.mockImplementation(async({hash})=>({signature:other.sign(Buffer.from(hash.slice(2),'hex')).toString('hex')}));const{host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>!!host.querySelector('[role="alert"]'));
  expect(host.textContent).toContain('no coincide con esta cuenta');expect(deps.status.mock.calls.some(([,status])=>status==='verified')).toBe(false);expect(deps.status).toHaveBeenLastCalledWith(clinicalSigningCheckScopeKey(scope()),'idle');expect(deps.fetch).not.toHaveBeenCalled();
 });
 it.each([null,{signature:'private-provider-secret'}, {signature:'0x'+'00'.repeat(64)}])('rejects a malformed or invalid signature privately (%s)',async(result)=>{
  deps.sign.mockResolvedValue(result);const{host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>!!host.querySelector('[role="alert"]'));expect(host.textContent).toContain('no coincide con esta cuenta');expect(host.textContent).not.toContain('private-provider-secret');expect(deps.status.mock.calls.some(([,status])=>status==='verified')).toBe(false);expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('uses only the fixed safe provider classification and never logs its error, hash or signature',async()=>{
  const debug=vi.spyOn(console,'debug').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});deps.sign.mockRejectedValue({code:'private-token',message:'secret@example.test',payload:{signature:'7'.repeat(128)}});
  const{host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>!!host.querySelector('[role="alert"]'));expect(host.textContent).toContain('Privy no pudo completar la firma');expect(host.textContent).not.toMatch(/private-token|secret@|777777/);expect(JSON.stringify(deps.status.mock.calls)).not.toMatch(/private-token|secret@|777777/);expect(debug).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('classifies an unavailable wallet before any allocation and retries only after an explicit click with a fresh challenge',async()=>{
  deps.sign.mockRejectedValueOnce(Error('Wallet not found')).mockImplementation(signValid);const{host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>!!host.querySelector('[role="alert"]'));expect(host.textContent).toContain('wallet Stellar');expect(deps.sign).toHaveBeenCalledOnce();await act(async()=>vi.advanceTimersByTime(1000));expect(deps.sign).toHaveBeenCalledOnce();await click(host,'Comprobar firma con Privy');await settle(()=>deps.status.mock.calls.some(([,status])=>status==='verified'));expect(deps.sign).toHaveBeenCalledTimes(2);expect(deps.sign.mock.calls[0][0].hash).not.toBe(deps.sign.mock.calls[1][0].hash);expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('coalesces rapid clicks into one local prompt',async()=>{
  let complete!:(value:{signature:string})=>void;deps.sign.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));const{host}=await mount(check());await act(async()=>{button(host,'Comprobar firma con Privy').click();button(host,'Comprobar firma con Privy').click();});await settle(()=>deps.sign.mock.calls.length===1);await act(async()=>complete(await signValid(deps.sign.mock.calls[0][0])));await settle(()=>deps.status.mock.calls.some(([,status])=>status==='verified'));expect(deps.sign).toHaveBeenCalledOnce();expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('rejects a zero nonce or invalid address before opening a signature prompt',async()=>{
  const random=vi.spyOn(webcrypto,'getRandomValues').mockImplementation((value:any)=>{value.fill(0);return value;});const{host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>!!host.querySelector('[role="alert"]'));expect(deps.sign).not.toHaveBeenCalled();random.mockRestore();const second=await mount(check({...scope(),address:'invalid'}));await click(second.host,'Comprobar firma con Privy');await settle(()=>!!second.host.querySelector('[role="alert"]'));expect(deps.sign).not.toHaveBeenCalled();
 });
 it.each(['identity','address','historyId','runId','until'] as const)('discards a signature that finishes after %s changes',async(field)=>{
  let complete!:(value:{signature:string})=>void;deps.sign.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));const current=scope(),{root,host}=await mount(check(current));await click(host,'Comprobar firma con Privy');await settle(()=>deps.sign.mock.calls.length===1);const changed={...current,[field]:field==='until'?current.until-1:field==='address'?other.publicKey():field==='historyId'?'b'.repeat(64):field==='runId'?'20000000-0000-4000-8000-000000000001':'did:privy:other'};await act(async()=>root.render(check(changed)));await act(async()=>complete(await signValid(deps.sign.mock.calls[0][0])));expect(deps.status.mock.calls.some(([,status])=>status==='verified')).toBe(false);expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('discards an in-flight signature at the fixed expiry without calling an API',async()=>{
  let complete!:(value:{signature:string})=>void;deps.sign.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));const current={...scope(),until:Math.floor(NOW/1000)+1},{host}=await mount(check(current));await click(host,'Comprobar firma con Privy');await settle(()=>deps.sign.mock.calls.length===1);await act(async()=>vi.advanceTimersByTime(1000));await act(async()=>complete(await signValid(deps.sign.mock.calls[0][0])));expect(deps.status.mock.calls.some(([,status])=>status==='verified')).toBe(false);expect(host.textContent).toContain('ventana de esta prueba venció');expect(deps.fetch).not.toHaveBeenCalled();
 });
 it('discards a late signature after unmount with no result callback or request',async()=>{
  let complete!:(value:{signature:string})=>void;deps.sign.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));const{root,host}=await mount(check());await click(host,'Comprobar firma con Privy');await settle(()=>deps.sign.mock.calls.length===1);await act(async()=>root.unmount());roots=roots.filter(value=>value.root!==root);host.remove();const count=deps.status.mock.calls.length;await act(async()=>complete(await signValid(deps.sign.mock.calls[0][0])));expect(deps.status).toHaveBeenCalledTimes(count);expect(deps.fetch).not.toHaveBeenCalled();
 });
});

describe('doctor preparation gate for the explicit server signing-check flag',()=>{
 it('blocks a new doctor intent until the check succeeds, then preserves the result through snapshot refresh',async()=>{
  const{host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));expect(button(host,'Agregar antecedente o archivo').disabled).toBe(true);expect(deps.fetch).toHaveBeenCalledOnce();await click(host,'Comprobar firma con Privy');await settle(()=>host.textContent!.includes('Firma de prueba verificada'));expect(button(host,'Agregar antecedente o archivo').disabled).toBe(false);expect(deps.fetch).toHaveBeenCalledOnce();await click(host,'Actualizar');expect(host.textContent).toContain('Firma de prueba verificada');expect(button(host,'Agregar antecedente o archivo').disabled).toBe(false);expect(deps.sign).toHaveBeenCalledOnce();expect(deps.fetch.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true);
 });
 it('rechecks the actual deadline before allocating a doctor intent even if the expiry timer has not rendered yet',async()=>{
  const{host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));await click(host,'Comprobar firma con Privy');await settle(()=>host.textContent!.includes('Firma de prueba verificada'));await click(host,'Agregar antecedente o archivo');
  const form=host.querySelector('form')!,title=form.querySelector('input:not([type])')!,text=form.querySelector('textarea')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(title,'Nota sintética');title.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(text,'Sólo revisión local');text.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));vi.setSystemTime(scope().until*1000);await click(host,'Preparar firma');expect(host.textContent).toContain('Comprueba primero la firma con Privy');expect(deps.fetch.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true);expect(deps.sign).toHaveBeenCalledOnce();
 });
 it.each(['account','wallet','history','run','deadline'] as const)('does not reuse a verified check after the %s changes',async(field)=>{
  let data=snapshot();deps.fetch.mockImplementation(()=>Promise.resolve(response(data)));const{host,root}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));await click(host,'Comprobar firma con Privy');await settle(()=>host.textContent!.includes('Firma de prueba verificada'));let nextHistory=HISTORY;if(field==='account')deps.userId='did:privy:new-account';if(field==='wallet')deps.walletId='new-wallet-binding';if(field==='history'){nextHistory='b'.repeat(64);data={...data,history:{...data.history!,id:nextHistory}};}if(field==='run')data={...data,rehearsal:{...data.rehearsal!,runId:'20000000-0000-4000-8000-000000000001'}};if(field==='deadline')data={...data,rehearsal:{...data.rehearsal!,until:data.rehearsal!.until-1}};if(['run','deadline'].includes(field))await click(host,'Actualizar');else await act(async()=>root.render(createElement(ClinicalHistory,{historyId:nextHistory})));expect(host.textContent).not.toContain('Firma de prueba verificada');expect(button(host,'Agregar antecedente o archivo').disabled).toBe(true);expect(deps.sign).toHaveBeenCalledOnce();expect(deps.fetch.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true);
 });
 it.each([undefined,false])('keeps the check inactive without the explicit true flag (%s)',async(flag)=>{
  const data=snapshot(false);if(flag===undefined)delete data.rehearsal!.signingCheck;else Object.assign(data.rehearsal!,{signingCheck:false});deps.fetch.mockResolvedValue(response(data));const{host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));expect(button(host,'Comprobar firma con Privy')).toBeUndefined();expect(button(host,'Agregar antecedente o archivo').disabled).toBe(false);expect(deps.sign).not.toHaveBeenCalled();
 });
 it('never shows the doctor check in the patient permissions flow even with a flag',async()=>{
  const data=snapshot();delete data.context;data.writes.set_permissions=true;deps.fetch.mockResolvedValue(response(data));const permissions=vi.fn(()=>createElement('span',null,'Patient controls'));const{host}=await mount(createElement(ClinicalHistory,{renderPermissions:permissions}));expect(host.textContent).toContain('Patient controls');expect(button(host,'Comprobar firma con Privy')).toBeUndefined();expect(deps.sign).not.toHaveBeenCalled();expect(permissions.mock.calls.at(-1)![0].disabled).toBe(false);
 });
 it('does not expose a signing prompt for a read-only doctor',async()=>{
  deps.fetch.mockResolvedValue(response(snapshot(true,false)));const{host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));expect(button(host,'Comprobar firma con Privy')).toBeUndefined();expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch).toHaveBeenCalledOnce();
 });
});
