// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DocumentView } from '@/components/private-portal/DocumentView';
import type { PrivatePrescription } from '@/components/private-portal/types';
const mock = vi.hoisted(() => ({ loading: false, error: '', data: { document: { medication: 'Synthetic', dosage: 'Not for treatment', instructions: '' } }, refresh: vi.fn() }));
vi.mock('@/components/private-portal/client', () => ({ usePortalData: () => mock, localDate: () => 'Synthetic date' }));
let root: Root, host: HTMLDivElement;
const rx: PrivatePrescription = { id:'test', rxId:'10', appointmentId:5, status:'Active', expired:false, doctorName:'Doctor', patientName:'Patient', expiresAt:1790000000, transactionHash:null };
async function render(props = {}) { await act(async () => root.render(createElement(DocumentView, { id:rx.id, prescription:rx, ...props }))); }
async function click(text: string) { await act(async () => { [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!.click(); }); }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mock.loading=false; mock.error=''; mock.data.document.instructions=''; vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  host=document.createElement('div'); document.body.append(host); root=createRoot(host);
});
afterEach(async () => { await act(async()=>root.unmount()); host.remove(); });
it('hides document and disables exports while loading or denied, then allows retry', async()=>{
  mock.loading=true; await render(); await click('Abrir');
  expect(document.querySelector('article')).toBeNull();
  expect([...document.querySelectorAll('button')].filter(b=>b.disabled)).toHaveLength(1);
  mock.loading=false; mock.error='Access denied'; await render();
  expect(document.querySelector('article')).toBeNull();
  await click('Reintentar'); expect(mock.refresh).toHaveBeenCalledOnce();
});
it('keeps prepared review inline and preserves empty instructions and escaped long content', async()=>{
  mock.data.document.instructions='<script>unsafe</script>'+ 'Long text '.repeat(300);
  const available=vi.fn(); await render({prescription:{...rx,rxId:null,status:'Pending'},onAvailable:available}); await click('Abrir');
  expect(document.querySelector('dialog')).toBeNull(); expect(document.querySelector('script')).toBeNull();
  expect(document.body.textContent).toContain('<script>unsafe</script>'); expect(available).toHaveBeenLastCalledWith(true);
  await click('Cerrar'); expect(available).toHaveBeenLastCalledWith(false);
});
it('shows revoked history and empty-instruction fallback', async()=>{
  await render({prescription:{...rx,status:'Revoked'}}); await click('Abrir');
  expect(document.body.textContent).toContain('Revocada'); expect(document.body.textContent).toContain('Sin instrucciones adicionales');
  expect(document.querySelector('dialog')?.open).toBe(true);
});
it('offers print guidance without claiming a PDF exists and removes HTML export', async()=>{
  const print=vi.spyOn(window,'print').mockImplementation(()=>{});
  await render(); await click('Abrir'); await click('Guardar PDF');
  expect(print).toHaveBeenCalledOnce();
  expect(document.querySelector('details')?.open).toBe(false);
  expect(document.body.textContent).not.toContain('Descargar HTML');
  print.mockRestore();
});

it('closes only when the pointer starts and ends outside the document', async()=>{
  await render(); await click('Abrir');
  const dialog=document.querySelector('dialog')!;
  vi.spyOn(dialog,'getBoundingClientRect').mockReturnValue({left:100,right:500,top:100,bottom:600} as DOMRect);
  async function pointer(type:string,x:number,y:number){await act(async()=>{const e=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:1});dialog.dispatchEvent(e);});}
  await pointer('pointerdown',200,200);await pointer('pointerup',20,20);
  expect(document.querySelector('dialog')).not.toBeNull();
  await pointer('pointerdown',20,20);await pointer('pointerup',20,20);
  expect(document.querySelector('dialog')).toBeNull();
});
