// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorLayout from '@/app/doctor/layout';
const mock=vi.hoisted(()=>({fetch:vi.fn(),logout:vi.fn(),replace:vi.fn(),user:{id:'did:privy:synthetic-doctor'},email:'doctor@example.test'}));
vi.mock('@privy-io/react-auth',()=>({usePrivy:()=>({ready:true,authenticated:true,user:mock.user,logout:mock.logout})}));
vi.mock('@/hooks/usePrivyEmail',()=>({usePrivyEmail:()=>mock.email}));
vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:mock.fetch}));
vi.mock('@/components/private-portal/WalletBoundary',()=>({WalletBoundary:({children}:{children:React.ReactNode})=>children}));
vi.mock('@/components/private-portal/DoctorDraftRecovery',()=>({DoctorDraftRecovery:()=>null}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:mock.replace}),usePathname:()=>'/doctor',useSearchParams:()=>new URLSearchParams()}));
vi.mock('next/link',()=>({default:({children,...props}:any)=>createElement('a',props,children)}));
const response=(status=200)=>Response.json(status===200?{authorized:true,source:'private_registry',wallet:'G'+'D'.repeat(55),doctor:{id:10,name:'Synthetic doctor',email:mock.email,status:'active'},authorization:{status:'authorized',version:6,validUntil:Math.floor(Date.now()/1000)+86400}}:{error:'unauthorized'},{status});
let views:Array<{root:Root;host:HTMLDivElement}>=[];
async function mount(child:React.ReactNode=createElement('p',null,'Protected clinical panel')){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);views.push({root,host});await act(async()=>root.render(createElement(DoctorLayout,{children:child})));return{root,host};}
const advance=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-01T20:00:00Z'));mock.user={id:'did:privy:synthetic-doctor'};mock.email='doctor@example.test';(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;});
afterEach(async()=>{for(const{root,host}of views){await act(async()=>root.unmount());host.remove();}views=[];vi.useRealTimers();});
describe('doctor authorization failure backoff',()=>{
 it('backs off repeated failures to a bounded minute without mounting the clinical panel',async()=>{
  mock.fetch.mockRejectedValue(new Error('unavailable'));const{host}=await mount();expect(mock.fetch).toHaveBeenCalledTimes(1);
  let expectedCalls=1;for(const delay of [6000,12000,24000,48000,60000,60000]){await advance(delay-1);expect(mock.fetch).toHaveBeenCalledTimes(expectedCalls);await advance(1);expect(mock.fetch).toHaveBeenCalledTimes(++expectedCalls);expect(host.textContent).not.toContain('Protected clinical panel');}
  expect(host.textContent).toContain('No pudimos verificar tu autorización');expect(mock.logout).not.toHaveBeenCalled();
 });
 it('unmounts protected content on failure and restores normal polling only after a fresh success',async()=>{
  const cleanup=vi.fn();function Protected(){useEffect(()=>()=>cleanup(),[]);return createElement('p',null,'Protected clinical panel');}
  mock.fetch.mockResolvedValue(response()).mockResolvedValueOnce(response()).mockResolvedValueOnce(response(503));const{host}=await mount(createElement(Protected));
  expect(host.textContent).toContain('Protected clinical panel');await advance(3000);expect(cleanup).toHaveBeenCalledOnce();expect(host.textContent).not.toContain('Protected clinical panel');
  await advance(5999);expect(mock.fetch).toHaveBeenCalledTimes(2);await advance(1);expect(host.textContent).toContain('Protected clinical panel');
  await advance(2999);expect(mock.fetch).toHaveBeenCalledTimes(3);await advance(1);expect(mock.fetch).toHaveBeenCalledTimes(4);
 });
 it('retries manually at once and cancels the previous failure timer',async()=>{
  mock.fetch.mockRejectedValueOnce(new Error('unavailable')).mockImplementation(async()=>response());const{host}=await mount();const oldSignal=mock.fetch.mock.calls[0][1].signal as AbortSignal;
  const retry=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Comprobar estado')!;await act(async()=>retry.click());
  expect(oldSignal.aborted).toBe(true);expect(mock.fetch).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('Protected clinical panel');
  await advance(3000);expect(mock.fetch).toHaveBeenCalledTimes(3);await advance(3000);expect(mock.fetch).toHaveBeenCalledTimes(4);expect(mock.logout).not.toHaveBeenCalled();
 });
 it('aborts an in-flight poll on unmount and ignores its late successful result',async()=>{
  let resolve!:(value:Response)=>void;const late=new Promise<Response>(done=>{resolve=done;});mock.fetch.mockResolvedValueOnce(response()).mockReturnValueOnce(late);const view=await mount();
  await advance(3000);const signal=mock.fetch.mock.calls[1][1].signal as AbortSignal;await act(async()=>view.root.unmount());views=[];view.host.remove();expect(signal.aborted).toBe(true);
  await act(async()=>resolve(response()));await advance(120000);expect(mock.fetch).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
 });
});
