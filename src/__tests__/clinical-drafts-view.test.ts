// @vitest-environment jsdom
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/components/private-portal/clinical-client', () => ({
  clinicalApi: deps.api, ClinicalClientError: class extends Error { constructor(public status: number, public code: string) { super(code); } },
  readClinicalPrescriptions: async () => [], readClinicalFile: vi.fn(),
}));
import { ClinicalDraftEntryForm, ClinicalDraftWorkspace } from '@/components/private-portal/ClinicalDraftWorkspace';
const id = 'aa97f00b-e7e1-42d1-a923-2f544fd515bd', historyId = 'a'.repeat(64), patient = 'G' + 'P'.repeat(55);
const metadata = { id, historyId, patient, author: 'G' + 'D'.repeat(55), revision: 1, state: 'draft', publicationRequestId: null,
  createdAt: '2026-10-25T10:00:00Z', updatedAt: '2026-10-25T10:00:00Z' };
let roots: Array<{root: Root; host: HTMLDivElement}> = [];
async function mount(node: React.ReactNode) {
 const host=document.createElement('div'); document.body.append(host); const root=createRoot(host); roots.push({root,host});
 await act(async()=>root.render(node)); return host;
}
const button=(host:HTMLElement,text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
beforeEach(()=>{ vi.clearAllMocks(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; });
afterEach(async()=>{for(const {root,host}of roots){await act(async()=>root.unmount());host.remove();} roots=[];});
describe('recoverable draft workspace',()=>{
 it('saves an incomplete note while blockchain publishing is disabled',async()=>{
  deps.api.mockImplementation(async (_path: string, init: RequestInit) => ({draft: { ...metadata, id: JSON.parse(String(init.body)).id }}));
  const prepare=vi.fn(),host=await mount(createElement(ClinicalDraftEntryForm,{identity:'doctor',target:{historyId,patient},readOnly:true,onPrepare:prepare,onCancel:vi.fn()}));
  await act(async()=>button(host,'Guardar borrador privado').click());
  expect(deps.api).toHaveBeenCalledOnce(); expect(JSON.parse(deps.api.mock.calls[0][1].body).payload.note.text).toBe('');
  expect(host.textContent).toContain('Todavía no está publicado'); expect(prepare).not.toHaveBeenCalled();
 });
 it('keeps saving available after StrictMode effect cleanup and remount',async()=>{
  deps.api.mockImplementation(async (_path: string, init: RequestInit) => ({draft: { ...metadata, id: JSON.parse(String(init.body)).id }}));
  const host=await mount(createElement(React.StrictMode,{},createElement(ClinicalDraftEntryForm,{identity:'doctor',target:{historyId,patient},readOnly:true,onPrepare:vi.fn(),onCancel:vi.fn()})));
  await act(async()=>button(host,'Guardar borrador privado').click());
  expect(host.textContent).toContain('Borrador privado guardado'); expect(deps.api).toHaveBeenCalledOnce();
 });
 it('opens saved own content without loading the patient timeline or requesting a signature',async()=>{
  deps.api.mockImplementation(async(path:string)=>path.endsWith('/'+id)?{draft:{...metadata,payload:{note:{title:'Mi borrador',text:'Trabajo recuperado',eventDate:null}}}}:{drafts:[metadata],hasMore:false,nextBefore:null});
  const prepare=vi.fn(),host=await mount(createElement(ClinicalDraftWorkspace,{identity:'doctor',canPublish:false,disabled:false,role:'doctor',onPrepare:prepare,onReopen:vi.fn()}));
  expect(deps.api).not.toHaveBeenCalled(); await act(async()=>button(host,'Mis borradores privados').click());
  await act(async()=>button(host,'Abrir borrador').click());
  expect(host.querySelector('textarea')?.value).toBe('Trabajo recuperado');
  expect(button(host,'Guardar borrador privado')).toBeDefined(); expect(prepare).not.toHaveBeenCalled();
 });
 it('only offers the same linked publication when a draft is already bound',async()=>{
  deps.api.mockResolvedValue({drafts:[{...metadata,publicationRequestId:id}],hasMore:false,nextBefore:null});
  const reopen=vi.fn(),host=await mount(createElement(ClinicalDraftWorkspace,{identity:'doctor',currentHistoryId:historyId,canPublish:false,disabled:false,role:'doctor',onPrepare:vi.fn(),onReopen:reopen}));
  await act(async()=>button(host,'Mis borradores privados').click());
  expect(button(host,'Abrir borrador')).toBeUndefined();
  await act(async()=>button(host,'Consultar publicación vinculada').click()); expect(reopen).toHaveBeenCalledWith(id);
 });
});
