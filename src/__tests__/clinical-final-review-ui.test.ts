// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import type { ClinicalIntent } from '@/components/private-portal/clinical-client';
import { ClinicalEntryForm } from '@/components/private-portal/ClinicalEntryForm';
import { ClinicalDraftEntryForm } from '@/components/private-portal/ClinicalDraftWorkspace';
import type { ClinicalOperation, ClinicalSnapshot } from '@/types/clinical';
import type { ClinicalDraft } from '@/lib/clinical/drafts-types';
import { syntheticClinicalPdf } from '../../scripts/lib/clinical-fixtures.mjs';
const deps = vi.hoisted(() => ({ fetch: vi.fn(), sign: vi.fn(async () => ({ signature: '0x' + '7'.repeat(128) })) }));
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: () => ({ signRawHash: deps.sign }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: deps.fetch }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: 'did:privy:synthetic-ui' } }) }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({ usePortalWallet: () => ({ walletId: 'synthetic-wallet', address: 'G' + 'A'.repeat(55) }) }));
const id='10000000-0000-4000-8000-000000000008', historyId='9'.repeat(64), address='G'+'A'.repeat(55), hash='f'.repeat(64);
const note={title:'Antecedente sintético',text:'Sólo datos de prueba',eventDate:null};
const response=(body:unknown)=>({ok:true,status:200,json:async()=>body});
function pendingOperation(requestId=id):ClinicalOperation {
 const now=Math.floor(Date.now()/1000);
 return {id:requestId,action:'append_version',state:'awaiting_signature',expiresAt:now+600,transactionHash:null,errorCode:null,
  signing:{address,hash,network:'testnet',expiresAt:now+600},
  sponsorship:{maxFeeStroops:'4150886',quotePreparedAt:now,quoteExpiresAt:now+300,quoteValidUntil:now+300},
  review:{network:'testnet',contractId:'C'+'A'.repeat(55),historyId,patient:address,author:address,operationId:'2'.repeat(64),entryId:'1'.repeat(64),version:1,content:{kind:'note',note}}};
}
const snapshot=(operations:ClinicalOperation[]=[]):ClinicalSnapshot=>({writes:{create_history:true,append_version:true,set_permissions:true},history:{id:historyId,patient:address,createdAt:1_800_000_000},entries:[],operations,grants:[],verifiedAt:new Date().toISOString()});
const terminal=(p:ClinicalOperation,state:'submitted'|'confirmed'):ClinicalOperation=>({id:p.id,action:p.action,state,expiresAt:p.expiresAt,transactionHash:hash,errorCode:null});
let roots:Array<{root:Root;host:HTMLDivElement}>=[];
async function mount(node:React.ReactNode){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});await act(async()=>root.render(node));return host;}
const button=(host:HTMLElement,text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
async function textValue(node:HTMLInputElement|HTMLTextAreaElement,value:string){const prototype=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function localNoteAndPrepare(host:HTMLElement){await act(async()=>button(host,'Agregar antecedente o archivo')!.click());const form=host.querySelector('form')!;await textValue(form.querySelector('input[required]')!,note.title);await textValue(form.querySelector('textarea')!,note.text);await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await act(async()=>button(host,'Preparar firma')!.click());}
function setupPreparation(change?:(operation:ClinicalOperation)=>ClinicalOperation){let saved:ClinicalOperation;deps.fetch.mockImplementation(async(path:string,init?:RequestInit)=>{if(path==='/api/private-clinical-history')return response(snapshot());if(path==='/api/private-clinical-operations'){saved=pendingOperation(JSON.parse(String(init?.body)).requestId);if(change)saved=change(saved);return response({operation:saved});}return response({operation:saved});});return()=>saved!;}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T20:40:00Z'));(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollIntoView=vi.fn();});
afterEach(async()=>{for(const{root,host}of roots){await act(async()=>root.unmount());host.remove();}roots=[];vi.unstubAllGlobals();vi.useRealTimers();});
describe('human confirmation after preparing an exact clinical intent',()=>{
 it('opens the final review immediately after prepare, never signs automatically, and distinguishes pending from confirmed',async()=>{
  let prepared:ClinicalOperation;
  deps.fetch.mockImplementation(async(path:string,init?:RequestInit)=>{
   if(path==='/api/private-clinical-history')return response(snapshot());
   if(path==='/api/private-clinical-operations'){prepared=pendingOperation(JSON.parse(String(init?.body)).requestId);return response({operation:prepared});}
   return response({operation:terminal(prepared,path.endsWith('/sign')?'submitted':'confirmed')});
  });
  const host=await mount(createElement(ClinicalHistory));await localNoteAndPrepare(host);
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeDefined();expect(document.activeElement?.textContent).toBe('Guardar aporte');
  expect(host.querySelector('[aria-label="Revisión del cambio preparado"]')?.textContent).toContain(note.text);
  expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch.mock.calls.filter(c=>c[0].endsWith('/sign'))).toHaveLength(0);
  await act(async()=>button(host,'Confirmar con mi cuenta Privy')!.click());
  expect(deps.sign).toHaveBeenCalledOnce();expect(host.textContent).toContain('El cambio sigue pendiente.');expect(host.textContent).not.toContain('El cambio está confirmado.');
  await act(async()=>vi.advanceTimersByTimeAsync(2500));
  expect(host.textContent).toContain('El cambio está confirmado.');expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();
  expect(deps.fetch.mock.calls.filter(c=>c[0]==='/api/private-clinical-operations')).toHaveLength(1);expect(deps.fetch.mock.calls.filter(c=>c[0].endsWith('/sign'))).toHaveLength(1);
 });
 it('keeps recovered attempts behind explicit review without creating or signing another intent',async()=>{
  const prepared=pendingOperation();deps.fetch.mockResolvedValue(response(snapshot([prepared])));const host=await mount(createElement(ClinicalHistory));
  await act(async()=>button(host,'Consultar intento pendiente')!.click());
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();expect(host.textContent).toContain(note.text);
  await act(async()=>button(host,'Revisar confirmación')!.click());expect(button(host,'Confirmar con mi cuenta Privy')).toBeDefined();
  expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch.mock.calls.every(c=>(c[1]?.method??'GET')==='GET')).toBe(true);
 });
 it('uses the server quote deadline beyond ninety seconds and does not renew it on check or timer expiry',async()=>{
  const saved=setupPreparation();const host=await mount(createElement(ClinicalHistory));await localNoteAndPrepare(host);const original=saved().sponsorship;
  await act(async()=>vi.advanceTimersByTimeAsync(90_000));
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeDefined();expect(host.querySelector('[role="timer"]')?.textContent).toContain('3:30');
  await act(async()=>button(host,'Consultar confirmación')!.click());expect(saved().sponsorship).toEqual(original);
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();await act(async()=>button(host,'Revisar confirmación')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(209_999));expect(button(host,'Confirmar con mi cuenta Privy')).toBeDefined();
  await act(async()=>vi.advanceTimersByTimeAsync(1));expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();
  expect(host.textContent).toContain('La cotización venció.');expect(host.querySelector('[aria-label="Revisión del cambio preparado"]')?.textContent).toContain(note.text);
  expect(deps.sign).not.toHaveBeenCalled();expect(deps.fetch.mock.calls.filter(c=>c[0]==='/api/private-clinical-operations')).toHaveLength(1);expect(deps.fetch).toHaveBeenCalledTimes(3);
 });
 it.each([['legacy',90],['XDR-bound',17]] as const)('honors the immutable %s deadline without extending or renewing it',async(mode,seconds)=>{
  setupPreparation(operation=>{
   const now=Math.floor(Date.now()/1000),deadline=now+seconds;
   if(mode==='legacy')return {...operation,sponsorship:{maxFeeStroops:'4150886',quotePreparedAt:now,quoteExpiresAt:deadline}};
   return {...operation,expiresAt:deadline,signing:{...operation.signing!,expiresAt:deadline},sponsorship:{...operation.sponsorship!,quoteExpiresAt:deadline,quoteValidUntil:deadline}};
  });
  const host=await mount(createElement(ClinicalHistory));await localNoteAndPrepare(host);
  await act(async()=>vi.advanceTimersByTimeAsync((seconds-1)*1000));expect(button(host,'Confirmar con mi cuenta Privy')).toBeDefined();
  expect(host.querySelector('[role="timer"]')?.textContent).toContain('0:01');
  await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();expect(host.textContent).toContain('La cotización venció.');
  expect(deps.fetch).toHaveBeenCalledTimes(2);expect(deps.sign).not.toHaveBeenCalled();
 });
 it.each(['review','sponsorship'] as const)('does not auto-open confirmation without verified %s',async field=>{
  setupPreparation(operation=>({...operation,[field]:undefined}));const host=await mount(createElement(ClinicalHistory));await localNoteAndPrepare(host);
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();expect(deps.sign).not.toHaveBeenCalled();
 });
 it('does not auto-open a quote that already expired while the immutable envelope is still live',async()=>{
  setupPreparation(operation=>({...operation,sponsorship:{maxFeeStroops:'4150886',quotePreparedAt:Math.floor(Date.now()/1000)-91,quoteExpiresAt:Math.floor(Date.now()/1000)-1}}));
  const host=await mount(createElement(ClinicalHistory));await localNoteAndPrepare(host);
  expect(button(host,'Confirmar con mi cuenta Privy')).toBeUndefined();expect(host.textContent).toContain('La cotización venció.');expect(deps.sign).not.toHaveBeenCalled();
 });
});
describe('small original PDF review and saved draft recovery',()=>{
 it.each(['local','saved-draft'] as const)('shows 964 bytes and keeps the exact PDF unchanged through %s review',async mode=>{
  class BrowserURL extends URL{static createObjectURL=vi.fn().mockReturnValue('blob:synthetic-pdf');static revokeObjectURL=vi.fn();}vi.stubGlobal('URL',BrowserURL);
  const bytes=syntheticClinicalPdf(1);expect(bytes.length).toBe(964);
  const file={fileName:'aporte-medico-sintetico-v1.pdf',mediaType:'application/pdf' as const,base64:Buffer.from(bytes).toString('base64')};
  const draft:ClinicalDraft={id,historyId,patient:address,author:address,revision:1,state:'draft',publicationRequestId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),payload:{file}};
  deps.fetch.mockResolvedValue(response({draft:{...draft,revision:2}}));
  const prepare=vi.fn(async(_input:ClinicalIntent)=>pendingOperation());
  const host=await mount(mode==='local'?createElement(ClinicalEntryForm,{initialPayload:{file},onPrepare:prepare,onCancel:vi.fn()}):createElement(ClinicalDraftEntryForm,{identity:'synthetic',target:{historyId,patient:address},initialDraft:draft,onPrepare:prepare,onCancel:vi.fn()}));
  expect(host.textContent).toContain('964 bytes');expect(host.textContent).not.toContain('0 MB');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(host.textContent).toContain('964 bytes');await act(async()=>button(host,'Preparar firma')!.click());
  expect(prepare).toHaveBeenCalledOnce();expect(prepare.mock.calls[0][0]).toMatchObject({action:'append_version',file});expect(deps.sign).not.toHaveBeenCalled();
  if(mode==='saved-draft')expect(JSON.parse(String(deps.fetch.mock.calls[0][1].body)).payload.file).toEqual(file);else expect(deps.fetch).not.toHaveBeenCalled();
 });
});
