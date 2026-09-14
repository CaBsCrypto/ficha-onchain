// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { usePortalData } from '@/components/private-portal/client';
const pending=vi.hoisted(()=>[] as Array<{signal:AbortSignal,resolve:(value:unknown)=>void}>);
vi.mock('@/lib/auth/authed-fetch',()=>({authedFetch:(_url:string,init:RequestInit)=>new Promise(resolve=>pending.push({signal:init.signal as AbortSignal,resolve}))}));
it('aborts closed reads and ignores late content after selecting another document',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  function View({path}:{path:string|null}){const result=usePortalData<{text:string}>(path,0);return createElement('div',null,result.data?.text??'loading');}
  await act(async()=>root.render(createElement(View,{path:'/a'})));
  await act(async()=>root.render(createElement(View,{path:null})));
  expect(pending[0].signal.aborted).toBe(true);
  await act(async()=>root.render(createElement(View,{path:'/b'})));
  await act(async()=>pending[0].resolve({ok:true,json:async()=>({text:'old private document'})}));
  expect(host.textContent).not.toContain('old private');
  await act(async()=>pending[1].resolve({ok:true,json:async()=>({text:'current document'})}));
  expect(host.textContent).toBe('current document');
  await act(async()=>root.unmount());host.remove();
});
