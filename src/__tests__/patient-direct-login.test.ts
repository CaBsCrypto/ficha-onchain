// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrivyLoginButton } from '@/components/auth/PrivyLoginButton';
import { LandingBackdrop } from '@/components/landing/LandingBackdrop';
import PatientLayout from '@/app/patient/layout';
const mock = vi.hoisted(() => ({ ready:true, authenticated:false, isOpen:false, user:null as any,
  login:vi.fn(), logout:vi.fn(), replace:vi.fn(), callbacks:null as any }));
vi.mock('@privy-io/react-auth', () => ({usePrivy:()=>mock, useModalStatus:()=>({isOpen:mock.isOpen}),
  useLogin:(callbacks:any)=>{mock.callbacks=callbacks;return {login:mock.login};}}));
vi.mock('next/navigation', () => ({useRouter:()=>({replace:mock.replace}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('next/link', () => ({default:(props:any)=>createElement('a',props)}));
vi.mock('@/hooks/useTrackUser', () => ({useTrackUser:()=>{}}));
vi.mock('@/hooks/useLanguage', () => ({useLanguage:()=>({lang:'es'})}));
vi.mock('@/components/private-portal/WalletBoundary', () => ({WalletBoundary:({children}:any)=>children}));
let root:Root, box:HTMLDivElement;
beforeEach(()=>{
  vi.clearAllMocks();mock.ready=true;mock.authenticated=false;mock.isOpen=false;mock.user=null;
  mock.logout.mockResolvedValue(undefined);mock.login.mockImplementation(()=>{});
  window.history.replaceState(null,'','/');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  box=document.createElement('div');document.body.append(box);root=createRoot(box);
});
afterEach(async()=>{await act(async()=>root.unmount());box.remove();});
async function render(portal=false){await act(async()=>root.render(createElement(StrictMode,null,
  portal ? createElement(PatientLayout,null,'Protected content')
    : createElement(LandingBackdrop,null,createElement(PrivyLoginButton)))));}
function button(label:string){return [...box.querySelectorAll('button')].find(b=>b.textContent===label)!;}
async function click(label:string){await act(async()=>button(label).click());}
it('opens Privy once directly and routes on successful login',async()=>{
  await render();await act(async()=>{button('Iniciar sesión').click();button('Iniciar sesión').click();});
  expect(mock.login).toHaveBeenCalledOnce();expect(mock.replace).not.toHaveBeenCalled();
  await act(async()=>mock.callbacks.onComplete());
  expect(mock.replace).toHaveBeenCalledExactlyOnceWith('/patient');
});
it('consumes the URL intent once and restores focus after cancellation',async()=>{
  window.history.replaceState(null,'','/?login=patient&lang=pt#how');
  mock.ready=false;await render();expect(mock.login).not.toHaveBeenCalled();
  mock.ready=true;await render();expect(mock.login).toHaveBeenCalledOnce();
  expect(window.location.search).toBe('?lang=pt');expect(window.location.hash).toBe('#how');
  mock.isOpen=true;await render();expect(box.firstElementChild?.hasAttribute('inert')).toBe(true);
  mock.isOpen=false;await render();await render();
  expect(mock.login).toHaveBeenCalledOnce();expect(mock.replace).not.toHaveBeenCalled();
  expect(box.firstElementChild?.hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(button('Iniciar sesión'));
  await click('Iniciar sesión');expect(mock.login).toHaveBeenCalledTimes(2);
});
it('does not redirect an existing session merely visiting the landing',async()=>{
  mock.authenticated=true;await render();expect(mock.replace).not.toHaveBeenCalled();
  expect(button('Cerrar sesión')).toBeDefined();await click('Ir a mi portal');
  expect(mock.replace).toHaveBeenCalledWith('/patient');expect(mock.login).not.toHaveBeenCalled();
});
it('honors a patient entry URL for an existing session without opening Privy',async()=>{
  mock.authenticated=true;window.history.replaceState(null,'','/?login=patient');await render();
  expect(mock.replace).toHaveBeenCalledExactlyOnceWith('/patient');expect(mock.login).not.toHaveBeenCalled();
});
it('recovers from a provider error and ignores completion after cancellation',async()=>{
  await render();await click('Iniciar sesión');await act(async()=>mock.callbacks.onError());
  expect(box.querySelector('[role=alert]')).not.toBeNull();await click('Iniciar sesión');
  mock.isOpen=true;await render();mock.isOpen=false;await render();
  await act(async()=>mock.callbacks.onComplete());expect(mock.replace).not.toHaveBeenCalled();
});
it('returns to the landing after explicit logout, including the auth-state race',async()=>{
  let finish!:()=>void;mock.logout.mockReturnValue(new Promise<void>(r=>{finish=r;}));
  mock.authenticated=true;await render(true);await click('Cerrar sesión');
  mock.authenticated=false;await render(true);
  expect(mock.replace).toHaveBeenCalledWith('/');expect(mock.replace).not.toHaveBeenCalledWith('/login/patient');
  await act(async()=>finish());expect(mock.login).not.toHaveBeenCalled();
});
it('keeps the portal after logout failure and allows retry',async()=>{
  mock.authenticated=true;mock.logout.mockRejectedValueOnce(new Error('offline'));await render(true);
  await click('Cerrar sesión');expect(box.textContent).toContain('No pudimos cerrar');
  expect(mock.replace).not.toHaveBeenCalled();await click('Cerrar sesión');expect(mock.replace).toHaveBeenCalledWith('/');
});
it('routes an expired portal session to the patient entry',async()=>{
  await render(true);expect(mock.replace).toHaveBeenCalledWith('/login/patient');
  expect(box.textContent).not.toContain('Protected content');
});
