// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PrivateConsultations} from '@/components/private-portal/Consultations';
import {DisponibilidadTab} from '@/components/doctor/DisponibilidadTab';
import {santiagoToday} from '@/components/private-portal/client';
const mock=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:mock.fetch}));
vi.mock('@/hooks/usePrivyEmail',()=>({usePrivyEmail:()=> 'doctor@example.test'}));
vi.mock('@/components/private-portal/ConsultationDetail',()=>({ConsultationDetail:()=>null}));
let root:Root,box:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();box=document.createElement('div');document.body.append(box);root=createRoot(box);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(async()=>{await act(async()=>root.unmount());box.remove();});
it('uses the Santiago date across UTC midnight and the daylight-saving change',()=>{
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-09-11T01:00:00Z'));expect(santiagoToday()).toBe('2026-09-10');
    vi.setSystemTime(new Date('2026-09-06T03:59:00Z'));expect(santiagoToday()).toBe('2026-09-05');
    vi.setSystemTime(new Date('2026-09-06T04:01:00Z'));expect(santiagoToday()).toBe('2026-09-06');
  } finally {vi.useRealTimers();}
});
const button=(text:string)=>[...box.querySelectorAll('button')].find(b=>b.textContent?.includes(text))!;
it('distinguishes identical doctor labels without revealing their emails',async()=>{
  mock.fetch.mockImplementation(async(url:string)=>Response.json(url==='/api/doctors'?{doctors:[
    {id:7,name:'Médico Demo',specialty:'General',email:'one@example.test'},
    {id:9,name:'Médico Demo',specialty:'General',email:'two@example.test'},
    {id:10,name:'Otra médica',specialty:'General'},
  ]}:{appointments:[]}));
  await act(async()=>root.render(createElement(PrivateConsultations,{role:'patient'})));
  await click('Reservar consulta');
  const options=[...box.querySelectorAll('option')].slice(1);
  expect(new Set(options.map(o=>o.textContent)).size).toBe(3);
  expect(options[0].textContent).toContain('Perfil #7');
  expect(options[1].textContent).toContain('Perfil #9');
  expect(options[2].textContent).toBe('Otra médica · General');
  expect(box.textContent).not.toContain('@example.test');
  expect(options.map(o=>o.value)).toEqual(['7','9','10']);
});
async function click(text:string){await act(async()=>button(text).click());}
async function change(el:HTMLInputElement|HTMLSelectElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('input',{bubbles:true}));});}
it('clears a rejected draft when corrected without hiding a save failure',async()=>{
  mock.fetch.mockImplementation(async(_url:string,init?:RequestInit)=>init?.method==='PUT'
    ? Response.json({error:'No se pudo guardar la disponibilidad'},{status:503})
    : Response.json({data:[]}));
  await act(async()=>root.render(createElement(DisponibilidadTab)));
  const times=box.querySelectorAll<HTMLInputElement>('input[type=time]');
  await change(times[0],'18:20');await click('Agregar bloque');
  expect(box.textContent).toContain('La hora de término debe ser posterior');
  await change(times[1],'20:00');
  expect(box.textContent).not.toContain('La hora de término debe ser posterior');
  await click('Agregar bloque');await click('Guardar disponibilidad');
  expect(box.textContent).toContain('No se pudo guardar la disponibilidad');
  await change(times[1],'21:00');
  expect(box.textContent).toContain('No se pudo guardar la disponibilidad');
});
it('only saves added blocks and requires confirmation to clear a saved agenda',async()=>{
  let stored:any[]=[];
  mock.fetch.mockImplementation(async(_url:string,init?:RequestInit)=>{if(init?.method==='PUT')stored=JSON.parse(String(init.body)).blocks;return Response.json({data:stored});});
  await act(async()=>root.render(createElement(DisponibilidadTab)));
  expect(button('Guardar disponibilidad').disabled).toBe(true);
  await click('Agregar bloque');expect(button('Guardar disponibilidad').disabled).toBe(false);
  await click('Guardar disponibilidad');expect(box.textContent).toContain('1 bloques semanales');expect(button('Guardar disponibilidad').disabled).toBe(true);
  await act(async()=>box.querySelector<HTMLButtonElement>('[aria-label="Eliminar bloque"]')!.click());
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await click('Guardar disponibilidad');expect(stored).toHaveLength(1);
  confirm.mockReturnValue(true);await click('Guardar disponibilidad');expect(stored).toHaveLength(0);confirm.mockRestore();
});
it('opens the next available date but preserves a manual empty date until requested',async()=>{
  mock.fetch.mockImplementation(async(url:string)=>{
    if(url==='/api/doctors')return Response.json({doctors:[{id:1,name:'Demo'}]});
    if(url.startsWith('/api/appointments'))return Response.json({appointments:[]});
    return Response.json({data:url.includes('nextAvailable=true')?{date:'2026-09-14',slots:[{time:'09:00',available:true}]}:{date:'2026-09-15',slots:[]}});
  });
  await act(async()=>root.render(createElement(PrivateConsultations,{role:'patient'})));
  await click('Reservar consulta');await change(box.querySelector('select')!,'1');
  expect(box.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2026-09-14');expect(button('Confirmar reserva').disabled).toBe(true);
  await change(box.querySelector<HTMLInputElement>('input[type=date]')!,'2026-09-15');
  expect(box.querySelector<HTMLInputElement>('input[type=date]')!.value).toBe('2026-09-15');
  expect(button('Ir a la próxima fecha disponible')).toBeDefined();
  await click('Ir a la próxima fecha disponible');expect(box.textContent).toContain('Próxima disponibilidad');
});
it('ignores a slow response for the previous doctor and offers retry after failure',async()=>{
  let finish!:(value:Response)=>void;
  mock.fetch.mockImplementation(async(url:string)=>{
    if(url==='/api/doctors')return Response.json({doctors:[{id:1,name:'First'},{id:2,name:'Second'}]});
    if(url.startsWith('/api/appointments'))return Response.json({appointments:[]});
    if(url.includes('doctorId=1'))return new Promise<Response>(resolve=>{finish=resolve;});
    throw Error('offline');
  });
  await act(async()=>root.render(createElement(PrivateConsultations,{role:'patient'})));
  await click('Reservar consulta');await change(box.querySelector('select')!,'1');await change(box.querySelector('select')!,'2');
  await act(async()=>finish(Response.json({data:{date:'2026-09-14',slots:[{time:'09:00',available:true}]}})));
  expect(box.textContent).not.toContain('09:00');expect(button('Confirmar reserva').disabled).toBe(true);
  expect(button('Reintentar')).toBeDefined();
});
