// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ClinicalEntryForm } from '@/components/private-portal/ClinicalEntryForm';
import { LanguageProvider } from '@/hooks/useLanguage';
import type { ClinicalPrescriptionReference, ClinicalVersion } from '@/types/clinical';
const m=vi.hoisted(()=>({read:vi.fn(),file:vi.fn()}));
vi.mock('@/components/private-portal/clinical-client',()=>({readClinicalPrescriptions:m.read,readClinicalFile:m.file}));
const RX='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', HISTORY='ab'.repeat(32), OTHER='cd'.repeat(32);
const note={title:'Synthetic follow-up',text:'Synthetic technical note only.',eventDate:null,prescriptionId:RX};
const rx:ClinicalPrescriptionReference={id:RX,rxId:'3',appointmentId:76,status:'Active',expired:true,expiresAt:1,
 transactionHash:'ef'.repeat(32),doctorName:'Synthetic doctor',patientName:'Synthetic patient'};
const correction:ClinicalVersion={entryId:'aa'.repeat(32),version:1,author:'G'+'A'.repeat(55),source:'doctor',createdAt:1800000000,
 title:note.title,mediaType:'application/json',fileName:'antecedente.json',note,transactionHash:'ef'.repeat(32),canCorrect:true};
let roots:Array<{root:Root;host:HTMLDivElement}>=[];
async function mount(props:Record<string,any>={}, withLanguageProvider=false){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});
 const prepare=vi.fn(async()=>({} as any));const base={correction,historyId:HISTORY,onPrepare:prepare,onCancel:vi.fn(),...props};
 const form=createElement(ClinicalEntryForm,base);
 await act(async()=>root.render(withLanguageProvider ? createElement(LanguageProvider,{children:form}) : form));
 return{host,root,prepare,base};}
const button=(host:HTMLElement,name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===name)!;
async function submit(host:HTMLElement){await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
beforeEach(()=>{vi.resetAllMocks();m.read.mockResolvedValue([rx]);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(async()=>{for(const{root,host}of roots){await act(async()=>root.unmount());host.remove();}roots=[];});
it('rechecks only a correction existing RX and preserves its historical status and link',async()=>{
 const{host,prepare}=await mount();
 expect(m.read).toHaveBeenCalledExactlyOnceWith(HISTORY,expect.any(AbortSignal),RX);
 expect(host.querySelector('option[value="'+RX+'"]')?.textContent).toContain('Vencida');
 expect(button(host,'Ver otras recetas')).toBeDefined();await submit(host);await act(async()=>button(host,'Preparar firma').click());
 expect(prepare).toHaveBeenCalledExactlyOnceWith({action:'append_version',entryId:correction.entryId,expectedVersion:1,note});
});
it('shows the correction review in English without changing the selected prescription or intent',async()=>{
 const previousUrl=window.location.href;
 const previousLanguage=window.localStorage.getItem('ficha-lang');
 const previousDocumentLanguage=document.documentElement.lang;
 window.history.replaceState(null,'','/?lang=en');
 try {
  const {host,prepare}=await mount({},true);
  expect(host.querySelector('h2')?.textContent).toBe('Correct my entry');
  expect(host.querySelector('option[value="'+RX+'"]')?.textContent).toBe('Prescription #3 · Consultation 76 · Expired');
  expect(m.read).toHaveBeenCalledExactlyOnceWith(HISTORY,expect.any(AbortSignal),RX);
  await submit(host);
  expect(host.querySelector('h3')?.textContent).toBe('Review before preparing the signature');
  await act(async()=>button(host,'Prepare signature').click());
  expect(prepare).toHaveBeenCalledExactlyOnceWith({action:'append_version',entryId:correction.entryId,expectedVersion:1,note});
 } finally {
  window.history.replaceState(null,'',previousUrl);
  if(previousLanguage===null)window.localStorage.removeItem('ficha-lang');
  else window.localStorage.setItem('ficha-lang',previousLanguage);
  document.documentElement.lang=previousDocumentLanguage;
 }
});
it('rechecks only the preselected RX in a recovered note draft',async()=>{
 await mount({correction:null,initialPayload:{note}});
 expect(m.read).toHaveBeenCalledExactlyOnceWith(HISTORY,expect.any(AbortSignal),RX);
});
it('keeps the ordinary new-note selector unfiltered until the user opens it',async()=>{
 const{host}=await mount({correction:null});expect(m.read).not.toHaveBeenCalled();
 await act(async()=>button(host,'Vincular una receta existente').click());
 expect(m.read).toHaveBeenCalledExactlyOnceWith(HISTORY,expect.any(AbortSignal),undefined);
});
it('lets the user request all options and recover the original scoped check if an unrelated RX is archived',async()=>{
 m.read.mockImplementation(async(_h,_signal,id)=>{if(id===undefined)throw Error('Other prescription temporarily unavailable');return[rx];});
 const{host,prepare}=await mount();await act(async()=>button(host,'Ver otras recetas').click());
 expect(m.read.mock.calls.at(-1)[2]).toBeUndefined();expect(host.textContent).toContain('Other prescription temporarily unavailable');
 await submit(host);expect(prepare).not.toHaveBeenCalled();expect(button(host,'Preparar firma')).toBeUndefined();
 await act(async()=>button(host,'Volver a la receta vinculada').click());
 expect(m.read.mock.calls.at(-1)[2]).toBe(RX);await submit(host);await act(async()=>button(host,'Preparar firma').click());
 expect(prepare).toHaveBeenCalledOnce();
});
it('fails closed when the selected RX itself cannot be verified',async()=>{
 m.read.mockRejectedValue(Error('Selected prescription unavailable'));const{host,prepare}=await mount();
 await submit(host);expect(prepare).not.toHaveBeenCalled();expect(button(host,'Preparar firma')).toBeUndefined();
 expect(host.textContent).toContain('Selected prescription unavailable');
});
it('does not allow review while the selected RX check is pending or returns no entitlement',async()=>{
 const pending=deferred<ClinicalPrescriptionReference[]>();m.read.mockReturnValue(pending.promise);const{host,prepare}=await mount();
 await submit(host);expect(prepare).not.toHaveBeenCalled();expect(button(host,'Preparar firma')).toBeUndefined();
 await act(async()=>pending.resolve([]));await submit(host);expect(prepare).not.toHaveBeenCalled();expect(button(host,'Preparar firma')).toBeUndefined();
});
it('aborts a previous history check and ignores its late result',async()=>{
 const pending=deferred<ClinicalPrescriptionReference[]>();m.read.mockImplementation((history)=>history===HISTORY?pending.promise:Promise.reject(Error('New history unavailable')));
 const{host,root,base,prepare}=await mount();const signal=m.read.mock.calls[0][1] as AbortSignal;
 await act(async()=>root.render(createElement(ClinicalEntryForm,{...base,historyId:OTHER})));
 expect(signal.aborted).toBe(true);await act(async()=>pending.resolve([rx]));await submit(host);
 expect(prepare).not.toHaveBeenCalled();expect(host.textContent).toContain('New history unavailable');expect(button(host,'Preparar firma')).toBeUndefined();
});
it('aborts an outstanding linked RX read when the form unmounts',async()=>{
 const pending=deferred<ClinicalPrescriptionReference[]>();m.read.mockReturnValue(pending.promise);const{root,host}=await mount();
 const signal=m.read.mock.calls[0][1] as AbortSignal;await act(async()=>root.unmount());host.remove();roots=[];
 expect(signal.aborted).toBe(true);await act(async()=>pending.resolve([rx]));
});

it('normalizes the preselected UUID without changing the linked record',async()=>{
 const{host,prepare}=await mount({correction:{...correction,note:{...note,prescriptionId:RX.toUpperCase()}}});
 expect(m.read.mock.calls[0][2]).toBe(RX);await submit(host);await act(async()=>button(host,'Preparar firma').click());
 expect(prepare.mock.calls[0][0].note.prescriptionId).toBe(RX);
});
it('invalidates a prior successful check when live lookup is disabled for recovery',async()=>{
 const{host,root,base,prepare}=await mount();const signal=m.read.mock.calls[0][1] as AbortSignal;
 await act(async()=>root.render(createElement(ClinicalEntryForm,{...base,disablePrescriptionLookup:true})));
 expect(signal.aborted).toBe(true);expect(m.read).toHaveBeenCalledOnce();await submit(host);
 expect(prepare).not.toHaveBeenCalled();expect(button(host,'Preparar firma')).toBeUndefined();
});
it('aborts linked RX lookup when the user switches to a file and rechecks on return to the note',async()=>{
 const pending=deferred<ClinicalPrescriptionReference[]>();m.read.mockReturnValueOnce(pending.promise).mockResolvedValue([rx]);
 const{host}=await mount({correction:null,initialPayload:{note}});const signal=m.read.mock.calls[0][1] as AbortSignal;
 await act(async()=>host.querySelector<HTMLInputElement>('input[value="file"]')!.click());expect(signal.aborted).toBe(true);
 await act(async()=>pending.resolve([rx]));await act(async()=>host.querySelector<HTMLInputElement>('input[value="note"]')!.click());
 expect(m.read).toHaveBeenCalledTimes(2);expect(m.read.mock.calls[1][2]).toBe(RX);
});
