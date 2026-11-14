// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalHistory } from '@/components/private-portal/ClinicalHistory';
import { DoctorClinicalHistory } from '@/components/private-portal/DoctorClinicalHistory';
import { readClinicalDownload } from '@/components/private-portal/clinical-client';
import type { ClinicalSnapshot, ClinicalVersion } from '@/types/clinical';
const deps = vi.hoisted(() => ({ fetch: vi.fn(), sign: vi.fn(), userId: 'did:privy:doctor' }));
vi.mock('@privy-io/react-auth/extended-chains', () => ({ useSignRawHash: () => ({ signRawHash: deps.sign }) }));
vi.mock('@/lib/auth/authed-fetch', () => ({ authedFetch: deps.fetch }));
vi.mock('@privy-io/react-auth', () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: deps.userId } }) }));
vi.mock('@/components/private-portal/WalletBoundary', () => ({ usePortalWallet: () => ({ walletId: 'doctor-wallet', address: 'G' + 'D'.repeat(55) }) }));
const HISTORY = 'a'.repeat(64), SECOND = 'b'.repeat(64), RX = '50c4f168-e3c3-4480-b015-43b4a589007f';
const receipt = 'e'.repeat(64), author = 'G' + 'D'.repeat(55);
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const note = { title: 'Control sintético', text: 'Nota médica sintética', eventDate: null };
const version = (overrides: Partial<ClinicalVersion> = {}): ClinicalVersion => ({ entryId: '1'.repeat(64), version: 1, author, source: 'doctor', createdAt: 1800000000, title: note.title, mediaType: 'application/json', fileName: 'note.json', note, transactionHash: receipt, canCorrect: true, ...overrides });
function snapshot(canRead = true, canAppend = true, entries: ClinicalVersion[] = [], id = HISTORY): ClinicalSnapshot { return { writes: { create_history: false, append_version: true, set_permissions: false }, context: { role: 'doctor', canRead, canAppend, grantRevision: 4 }, history: { id, patient: 'G'+'P'.repeat(55), createdAt: 1800000000 }, entries, grants: [], operations: [], verifiedAt: '2026-10-23T20:00:00Z' }; }
let roots: Array<{root: Root; host: HTMLDivElement}> = [];
async function mount(node: React.ReactNode) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push({root,host}); await act(async () => root.render(node)); return {root,host}; }
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find(value => value.textContent === text)!;
async function input(node: HTMLInputElement | HTMLTextAreaElement, value: string) { const prototype = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; await act(async () => { Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(node,value); node.dispatchEvent(new Event('input',{bubbles:true})); }); }
async function submit(form: HTMLFormElement) { await act(async () => { form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }); }
async function selectHistory(host: HTMLElement, id: string) { await input(host.querySelector<HTMLInputElement>('#doctor-history-id')!,id); await submit(host.querySelector('form')!); }
beforeEach(() => { vi.clearAllMocks(); deps.userId='did:privy:doctor'; (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; HTMLElement.prototype.scrollIntoView=vi.fn(); HTMLDialogElement.prototype.showModal=vi.fn(); });
afterEach(async () => { for(const {root,host} of roots) { await act(async () => root.unmount()); host.remove(); } roots=[]; vi.unstubAllGlobals(); });
describe('doctor clinical context and independent capabilities', () => {
 it('requires a patient supplied opaque code and never enumerates histories', async () => {
  deps.fetch.mockResolvedValue(response(snapshot(true,false,[version()])));
  const {host}=await mount(createElement(DoctorClinicalHistory)); expect(deps.fetch).not.toHaveBeenCalled();
  await selectHistory(host,'someone@example.com'); expect(deps.fetch).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await selectHistory(host,HISTORY); expect(deps.fetch.mock.calls[0][0]).toBe(`/api/private-clinical-history?historyId=${HISTORY}`);
  expect(host.textContent).toContain(note.text); expect(button(host,'Agregar antecedente o archivo')).toBeUndefined(); expect(button(host,'Corregir mi aporte')).toBeUndefined();
  expect(host.querySelector('#clinical-share-id')).toBeNull(); expect(deps.sign).not.toHaveBeenCalled();
 });
 it('keeps append only access free of the timeline and correction metadata', async () => {
  deps.fetch.mockResolvedValue(response(snapshot(false,true)));
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));
  expect(host.querySelector('ol')).toBeNull(); expect(host.querySelector('#clinical-filter')).toBeNull(); expect(host.textContent).toContain('no consultar su historial');
  await act(async () => button(host,'Agregar antecedente o archivo').click()); expect(host.querySelector('textarea')).not.toBeNull(); expect(host.textContent).toContain('autoría médica');
 });
 it('rejects history contents delivered without a read capability', async () => {
  deps.fetch.mockResolvedValue(response(snapshot(false,true,[version()]))); const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));
  expect(host.textContent).not.toContain(note.text); expect(host.querySelector('ol')).toBeNull(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
 });
 it('offers corrections only for the current author and preserves patient contributions', async () => {
  deps.fetch.mockResolvedValue(response(snapshot(true,true,[version(),version({entryId:'2'.repeat(64),source:'patient',author:'G'+'P'.repeat(55),canCorrect:false}),version({entryId:'3'.repeat(64),author:'G'+'X'.repeat(55),canCorrect:true})])));
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY})); expect([...host.querySelectorAll('button')].filter(value=>value.textContent==='Corregir mi aporte')).toHaveLength(1);
 });
 it('clears a draft and the selected history immediately when the account changes', async () => {
  deps.fetch.mockImplementation(path=>Promise.resolve(response(snapshot(true,true,[],path.includes(SECOND)?SECOND:HISTORY))));
  const {host,root}=await mount(createElement(DoctorClinicalHistory)); await selectHistory(host,HISTORY); await act(async () => button(host,'Agregar antecedente o archivo').click());
  await input(host.querySelector('textarea')!,'Private draft of previous patient');
  await selectHistory(host,SECOND); expect(host.querySelector('textarea')).toBeNull(); expect(host.textContent).not.toContain('Private draft');
  deps.userId='did:privy:other-doctor'; await act(async () => root.render(createElement(DoctorClinicalHistory))); expect(host.querySelector<HTMLInputElement>('#doctor-history-id')!.value).toBe(''); expect(host.querySelector('ol')).toBeNull();
 });
 it('revokes a local file preview when switching to another patient history', async () => {
  const revoke=vi.fn(); class BrowserURL extends URL { static createObjectURL=vi.fn().mockReturnValue('blob:patient-a'); static revokeObjectURL=revoke; } vi.stubGlobal('URL',BrowserURL);
  deps.fetch.mockImplementation(path=>Promise.resolve(response(snapshot(true,true,[],path.includes(SECOND)?SECOND:HISTORY))));
  const {host}=await mount(createElement(DoctorClinicalHistory)); await selectHistory(host,HISTORY); await act(async()=>button(host,'Agregar antecedente o archivo').click());
  await act(async()=>host.querySelector<HTMLInputElement>('input[value="file"]')!.click());
  const bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic\n%%EOF\n'); const file=new File([bytes],'private-patient-a.pdf',{type:'application/pdf'}); Object.defineProperty(file,'arrayBuffer',{value:async()=>bytes.buffer});
  const upload=host.querySelector<HTMLInputElement>('input[type="file"]')!;Object.defineProperty(upload,'files',{value:[file]});await act(async()=>upload.dispatchEvent(new Event('change',{bubbles:true})));
  expect(host.querySelector('a[download]')!.getAttribute('href')).toBe('blob:patient-a'); await selectHistory(host,SECOND);
  expect(revoke).toHaveBeenCalledWith('blob:patient-a'); expect(host.querySelector('a[download]')).toBeNull();expect(host.textContent).not.toContain('private-patient-a.pdf');
 });
 it('shows only patient sharing information for the owning screen', async () => {
  const data=snapshot(); delete data.context; deps.fetch.mockResolvedValue(response(data)); const {host}=await mount(createElement(ClinicalHistory));
  expect(host.querySelector<HTMLInputElement>('#clinical-share-id')!.value).toBe(HISTORY); expect(host.textContent).toContain('también debes habilitar su permiso');
 });
});
describe('clinical prescription links and immutable doctor attempts', () => {
 const rx = { id:RX,rxId:'42',appointmentId:8,status:'Active' as const,expired:false,expiresAt:1900000000,transactionHash:receipt,doctorName:'Médico sintético',patientName:'Paciente sintético' };
 it('binds the selected history and existing recipe to one reviewed preparation without issuing a recipe', async () => {
  let prepared:any;
  deps.fetch.mockImplementation((path,init)=>{
   if(path.includes('/prescriptions')) return Promise.resolve(response({prescriptions:[rx]}));
   if(path==='/api/private-clinical-operations') { prepared=JSON.parse(init.body); return Promise.resolve(response({operation:{id:prepared.requestId,action:'append_version',state:'awaiting_signature',expiresAt:1900000000,transactionHash:null,errorCode:null,signing:{address:author,hash:'f'.repeat(64),network:'testnet',expiresAt:1900000000}}})); }
   return Promise.resolve(response(snapshot()));
  });
  const {host}=await mount(createElement(DoctorClinicalHistory)); await selectHistory(host,HISTORY); await act(async()=>button(host,'Agregar antecedente o archivo').click());
  const form=host.querySelectorAll('form')[1]; await input(form.querySelector('input:not([type])')!,'Control'); await input(form.querySelector('textarea')!,'Evolución sintética');
  await act(async()=>button(host,'Vincular una receta existente').click()); expect(deps.fetch.mock.calls.some(call=>call[0]===`/api/private-clinical-history/prescriptions?historyId=${HISTORY}`)).toBe(true);
  await act(async()=>{const select=form.querySelector('select')!; select.value=RX;select.dispatchEvent(new Event('change',{bubbles:true}));});
  await submit(form); expect(host.textContent).toContain('Receta vinculada: 42'); await act(async()=>button(host,'Preparar firma').click());
  expect(prepared).toMatchObject({action:'append_version',historyId:HISTORY,note:{title:'Control',text:'Evolución sintética',prescriptionId:RX}});
  expect(host.querySelector<HTMLInputElement>('#doctor-history-id')!.disabled).toBe(true); expect(deps.sign).not.toHaveBeenCalled();
  expect(deps.fetch.mock.calls.filter(call=>(call[1]?.method??'GET')==='POST')).toHaveLength(1);
 });
 it('keeps history switching locked after an uncertain preparation without preparing a second intent', async () => {
  const bodies:any[]=[];
  deps.fetch.mockImplementation((path,init)=>{if(path==='/api/private-clinical-operations'){bodies.push(JSON.parse(init.body));return Promise.reject(new Error('Lost response'));}return Promise.resolve(response(snapshot()));});
  const {host}=await mount(createElement(DoctorClinicalHistory));await selectHistory(host,HISTORY);await act(async()=>button(host,'Agregar antecedente o archivo').click());
  const form=host.querySelectorAll('form')[1];await input(form.querySelector('input:not([type])')!,'Control');await input(form.querySelector('textarea')!,'Una sola preparación');await submit(form);await act(async()=>button(host,'Preparar firma').click());
  expect(host.querySelector<HTMLInputElement>('#doctor-history-id')!.disabled).toBe(true);expect(button(host,'Cambiar de ficha').disabled).toBe(true);expect(button(host,'Cerrar ficha').disabled).toBe(true);expect(host.textContent).toContain('Preparación sin resultado comprobado');expect(bodies).toHaveLength(1);expect(bodies[0].historyId).toBe(HISTORY);expect(deps.sign).not.toHaveBeenCalled();
 });
 it('clears previously verified content when a doctor context disappears during preparation', async () => {
  deps.fetch.mockImplementation(path=>Promise.resolve(path==='/api/private-clinical-operations'?response({error:'clinical_context_unavailable'},404):response(snapshot(true,true,[version()]))));
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));expect(host.textContent).toContain(note.text);await act(async()=>button(host,'Agregar antecedente o archivo').click());
  const form=host.querySelector('form')!;await input(form.querySelector('input:not([type])')!,'Control');await input(form.querySelector('textarea')!,'Preparación sintética');await submit(form);await act(async()=>button(host,'Preparar firma').click());
  expect(host.textContent).not.toContain(note.text);expect(host.querySelector('ol')).toBeNull();expect(host.querySelector('form')).toBeNull();expect(host.textContent).toContain('Cierra esta ficha y vuelve a comprobar');expect(deps.sign).not.toHaveBeenCalled();
 });
 it('opens a linked recipe through its independently authorized document endpoint and fails closed', async () => {
  deps.fetch.mockImplementation(path=>Promise.resolve(path.startsWith('/api/private-prescriptions/')?response({error:'private_prescription_unavailable'},403):response(snapshot(true,true,[version({prescription:rx})]))));
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY})); expect(host.textContent).toContain('Receta #42'); expect(deps.fetch.mock.calls).toHaveLength(1);
  await act(async()=>button(host,'Abrir documento privado').click()); expect(deps.fetch.mock.calls.at(-1)[0]).toBe(`/api/private-prescriptions/${RX}/document`); expect(document.body.textContent).toContain('No pudimos verificar'); expect(document.querySelector('[aria-label="Documento de receta privada"]')).toBeNull();
 });
 it.each([['Revoked','Revocada'],['Blocked','Bloqueada'],['Active','Vencida']] as const)('shows %s with expiry consistently in the linked note and recipe selector', async (status,label) => {
  const existing={...rx,status,expired:true};
  deps.fetch.mockImplementation(path=>Promise.resolve(response(path.includes('/prescriptions')?{prescriptions:[existing]}:snapshot(true,true,[version({prescription:existing})]))));
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));
  const linked=host.querySelector('section[aria-label="Receta vinculada"]')!;expect(linked.textContent).toContain(`${label} · Vence:`);if(status!=='Active') expect(linked.textContent).not.toContain('Vencida');
  await act(async()=>button(host,'Agregar antecedente o archivo').click());await act(async()=>button(host,'Vincular una receta existente').click());
  const option=host.querySelector(`option[value="${RX}"]`)!;expect(option.textContent).toContain(`· ${label}`);if(status!=='Active') expect(option.textContent).not.toContain('Vencida');expect(deps.sign).not.toHaveBeenCalled();
 });
 it('retains unavailable recipe links as closed references without exposing their document', async () => {
  deps.fetch.mockResolvedValue(response(snapshot(true,true,[version({prescriptionUnavailable:true})]))); const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));
  expect(host.textContent).toContain('vínculo a la receta se conserva'); expect(button(host,'Abrir documento privado')).toBeUndefined();expect(button(host,'Corregir mi aporte').disabled).toBe(true);
 });
 it('passes explicit doctor context on downloads and keeps the read authenticated', async () => {
  deps.fetch.mockResolvedValue({ok:true,headers:new Headers({'content-type':'application/pdf'}),blob:async()=>new Blob(['%PDF-1.7\n%%EOF'],{type:'application/pdf'})});
  await readClinicalDownload('1'.repeat(64),2,new AbortController().signal,HISTORY); expect(deps.fetch.mock.calls[0][0]).toBe(`/api/private-clinical-history/document?historyId=${HISTORY}&entryId=${'1'.repeat(64)}&version=2`); expect(deps.fetch.mock.calls[0][1].cache).toBe('no-store');
 });
});

it('saves a private draft from the selected code while the complete timeline is unavailable', async () => {
  deps.fetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/api/private-clinical-drafts' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      expect(body).not.toHaveProperty('patient');
      return response({ draft: { id: body.id, revision: 1, historyId: HISTORY, patient: 'G'+'P'.repeat(55), author,
        state: 'draft', publicationRequestId: null, createdAt: '2026-10-25T20:00:00Z', updatedAt: '2026-10-25T20:00:00Z' } });
    }
    if (path.startsWith('/api/private-clinical-history')) return new Promise(() => {});
    throw Error('Unexpected request');
  });
  const {host}=await mount(createElement(ClinicalHistory,{historyId:HISTORY}));
  await act(async()=>button(host,'Redactar borrador privado').click());
  await input(host.querySelector('textarea')!,'Trabajo propio sin esperar la cronología');
  await act(async()=>button(host,'Guardar borrador privado').click());
  expect(host.textContent).toContain('Borrador privado guardado');
  expect(deps.fetch.mock.calls.some(([path])=>String(path).includes('private-clinical-operations'))).toBe(false);
  expect(deps.sign).not.toHaveBeenCalled();
});
