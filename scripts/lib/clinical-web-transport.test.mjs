import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { clinicalLoopbackTarget, createClinicalWebApi, openClinicalWebJournal } from './clinical-web-transport.mjs';
const token = 'test-memory-only-credential-value';
const json = value => new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'no-store'}});
test('only exact HTTP loopback origins are accepted',()=>{
  assert.equal(clinicalLoopbackTarget('http://127.0.0.1:3016'),'http://127.0.0.1:3016');
  for(const bad of ['https://trustleaf-demo.vercel.app','http://example.org:3016','http://localhost:3016/patient','http://localhost:3016/?token=x','http://u:p@localhost:3016','http://localhost:3016/#x','http://localhost']) assert.throws(()=>clinicalLoopbackTarget(bad));
});
test('real API transport pins origin, no-store, redirects, and keeps token off URLs',async()=>{
  const calls=[]; const api=createClinicalWebApi({target:'http://localhost:3016',accessToken:token,fetchImpl:async(url,options)=>{calls.push({url,options});return json({ok:true});}});
  await api.wallet(); await api.prepare({action:'create_history'}); await api.sign(randomUUID());
  assert.ok(calls.every(c=>!c.url.includes(token)&&c.options.redirect==='error'&&c.options.cache==='no-store'&&c.options.headers.Origin==='http://localhost:3016'));
  assert.equal(calls[0].options.headers.Authorization,`Bearer ${token}`); assert.equal(calls[0].options.method,'GET');
  assert.equal(calls[2].options.body,'{"confirmed":true}');
  api.dispose(); await api.wallet(); assert.equal(calls[3].options.headers.Authorization,'Bearer ');
});
test('provider diagnostics cannot leak through HTTP or connection errors',async()=>{
  const api=createClinicalWebApi({target:'http://localhost:3016',accessToken:token,fetchImpl:async()=>new Response(token,{status:401})});
  await assert.rejects(api.snapshot(),{message:'rehearsal_session_expired'});
  const lost=createClinicalWebApi({target:'http://localhost:3016',accessToken:token,fetchImpl:async()=>{throw Error(token);}});
  await assert.rejects(lost.sign(randomUUID()),{message:'rehearsal_response_uncertain'});
});
test('uncached, non-JSON and oversized responses are rejected',async()=>{
  for(const response of [new Response('{}',{headers:{'content-type':'application/json'}}),new Response('<html>',{headers:{'content-type':'text/html','cache-control':'no-store'}}),json({text:'x'.repeat(1000001)})]) {
    const api=createClinicalWebApi({target:'http://localhost:3016',accessToken:token,fetchImpl:async()=>response});
    await assert.rejects(api.snapshot());
  }
});
test('documents preserve bytes and validate content types',async()=>{
  const api=createClinicalWebApi({target:'http://localhost:3016',accessToken:token,fetchImpl:async()=>new Response('%PDF-synthetic',{headers:{'content-type':'application/pdf','cache-control':'no-store','x-content-type-options':'nosniff'}})});
  assert.equal((await api.document('1'.repeat(64),1)).content.toString(),'%PDF-synthetic');
  assert.throws(()=>api.document('../not-selector',1));
});
test('journal survives restart; only one process holds a run',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'clinical-web-journal-')),runId=randomUUID();
  try {
    const a=await openClinicalWebJournal({directory,runId}); assert.equal(await a.load(),null);
    await a.save({runId,steps:[{id:randomUUID(),phase:'signRequested'}]});
    await assert.rejects(openClinicalWebJournal({directory,runId}),{message:'rehearsal_run_locked'});
    await a.close(); const b=await openClinicalWebJournal({directory,runId});
    assert.equal((await b.load()).steps[0].phase,'signRequested'); await b.close();
    assert.deepEqual(await readdir(join(directory,runId)),['journal.json']);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('credential-like values are never written to a journal',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'clinical-web-journal-'));let journal;
  try {journal=await openClinicalWebJournal({directory,runId:randomUUID()});await assert.rejects(journal.save({accessToken:token}));assert.equal(await journal.load(),null);}
  finally {await journal?.close();await rm(directory,{recursive:true,force:true});}
});
