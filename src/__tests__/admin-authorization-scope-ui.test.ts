// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import AdminDoctorsPage from '@/app/admin/doctors/page';
const m=vi.hoisted(()=>({fetch:vi.fn()}));vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:m.fetch}));
const now=1800000000000,doctor={id:10,name:'Médico sintético',email:'doctor@example.test',status:'active',specialty:'Prueba'};
const base={doctor,wallet:'G'+'D'.repeat(55),authorization:{status:'expired',version:3,validUntil:1799999900,commitment:null},request:null,onboarding:null,dossier:{fullName:'Expediente sintético',license:'TEST',specialty:'Prueba',verificationSource:'Sólo demostración',reviewedBy:'reviewer',reviewedAt:'2026-10-23',version:3,validUntil:1799999900},syntheticOnly:true};
const response=(body:unknown)=>({ok:true,status:200,json:async()=>body});
let roots:Array<{root:Root;host:HTMLDivElement}>=[];
const button=(host:HTMLElement,text:string)=>[...host.querySelectorAll('button')].find(item=>item.textContent===text);
async function open(rehearsal?:unknown){m.fetch.mockImplementation((path,init)=>Promise.resolve(response(init?.method==='POST'?{request:{id:'fixed-renewal',state:'pending',action:'renew'}}:path.includes('?doctorId=')?{...base,...(rehearsal?{rehearsal}:{})}:{doctors:[doctor]})));const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push({root,host});await act(async()=>root.render(createElement(AdminDoctorsPage)));const reviewButton=button(host,'Revisar autorización');if(!reviewButton)throw new Error('Missing doctor review button: '+host.innerHTML);await act(async()=>reviewButton.click());return host;}
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});afterEach(async()=>{for(const {root,host}of roots){await act(async()=>root.unmount());host.remove();}roots=[];vi.restoreAllMocks();});
it('shows the fixed Chile expiry and only the approved renewal action, posting no browser supplied duration',async()=>{
 const validUntil=Math.floor(now/1000)+86400,until=Math.floor(now/1000)+21600,host=await open({status:'active',action:'renew',validUntil,until,durationHours:24});
 expect(host.textContent).toContain('alcance de 24 horas');expect(host.textContent).toContain(new Date(validUntil*1000).toLocaleString('es-CL',{timeZone:'America/Santiago'}));expect(host.textContent).toContain('Hora de Chile');expect(host.textContent).not.toContain('30 días');expect(button(host,'Confirmar revocación')).toBeUndefined();
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button(host,'Confirmar renovación')!.click());
 const posts=m.fetch.mock.calls.filter(call=>call[1]?.method==='POST');expect(posts).toHaveLength(1);expect(JSON.parse(posts[0][1].body)).toEqual({doctorId:10,action:'renew',confirmed:true,synthetic:true});
});
it('retains the ordinary 30 day behavior and revocation outside a rehearsal',async()=>{
 const host=await open();expect(host.textContent).toContain('vigencia de 30 días');expect(button(host,'Confirmar revocación')).toBeDefined();expect(host.textContent).not.toContain('alcance de 24 horas');expect(m.fetch.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);
});
it('preserves the historical dossier without a normal 30 day fallback when the scope is unavailable',async()=>{
 const host=await open({status:'unavailable'});expect(host.textContent).toContain('Expediente sintético');expect(host.textContent).toContain('confirmaciones permanecen deshabilitadas');expect(host.textContent).not.toContain('30 días');expect(button(host,'Confirmar renovación')).toBeUndefined();expect(button(host,'Confirmar revocación')).toBeUndefined();expect(host.querySelector('input[type="checkbox"]')).toBeNull();expect(m.fetch.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);
});

it('describes the continuation expiry as fixed from approval and keeps the same renewal-only POST',async()=>{
 const validUntil=Math.floor(now/1000)+86400,until=Math.floor(now/1000)+21600,host=await open({status:'active',action:'renew',validUntil,until,durationHours:24,timeAnchor:'approval'});
 expect(host.textContent).toContain('desde su aprobación');expect(host.textContent).not.toContain('desde su preparación');expect(host.textContent).not.toContain('30 días');expect(button(host,'Confirmar revocación')).toBeUndefined();
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button(host,'Confirmar renovación')!.click());
 const posts=m.fetch.mock.calls.filter(call=>call[1]?.method==='POST');expect(posts).toHaveLength(1);expect(JSON.parse(posts[0][1].body)).toEqual({doctorId:10,action:'renew',confirmed:true,synthetic:true});
});
it('rejects an unknown timing anchor without offering ordinary renewal controls',async()=>{
 const host=await open({status:'active',action:'renew',validUntil:Math.floor(now/1000)+86400,until:Math.floor(now/1000)+21600,durationHours:24,timeAnchor:'rolling'});
 expect(host.textContent).toContain('No se pudo comprobar el alcance');expect(button(host,'Confirmar renovación')).toBeUndefined();expect(host.textContent).not.toContain('30 días');expect(m.fetch.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);
});

it('renders the schema12 seven-day expiry with a single exact renewal POST',async()=>{
 const validUntil=Math.floor(now/1000)+604800,until=Math.floor(now/1000)+14400;
 const host=await open({status:'active',action:'renew',validUntil,until,durationHours:168,timeAnchor:'approval',continuationSchema:12});
 expect(host.textContent).toContain('alcance de 7 días desde su aprobación');expect(host.textContent).not.toContain('24 horas');expect(host.textContent).not.toContain('30 días');
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());await act(async()=>button(host,'Confirmar renovación')!.click());
 const posts=m.fetch.mock.calls.filter(call=>call[1]?.method==='POST');expect(posts).toHaveLength(1);expect(JSON.parse(posts[0][1].body)).toEqual({doctorId:10,action:'renew',confirmed:true,synthetic:true});
});
it.each([{durationHours:168,timeAnchor:'approval'},{durationHours:168,timeAnchor:'preparation',continuationSchema:12},{durationHours:24,timeAnchor:'approval',continuationSchema:12}])('rejects an inconsistent completion renewal review %j',async metadata=>{
 const host=await open({status:'active',action:'renew',validUntil:Math.floor(now/1000)+604800,until:Math.floor(now/1000)+14400,...metadata});
 expect(host.textContent).toContain('No se pudo comprobar el alcance');expect(button(host,'Confirmar renovación')).toBeUndefined();expect(m.fetch.mock.calls.every(call=>call[1]?.method!=='POST')).toBe(true);
});
