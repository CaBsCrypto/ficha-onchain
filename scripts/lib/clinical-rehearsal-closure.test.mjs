import test from 'node:test';
import assert from 'node:assert/strict';
import { rehearsalRunLockKey, lockClinicalRehearsalRun, assertRehearsalOpen } from './clinical-rehearsal-closure.mjs';
const uuid = number => '00000000-0000-4000-8000-' + String(number).padStart(12,'0');
const policy = { schemaVersion:2,runId:uuid(1),steps:[
  {key:'renew',requestId:uuid(2),actor:'admin',action:'renew',maxFeeStroops:'10000000'},
  {key:'append_note',requestId:uuid(3),actor:'doctor',action:'append_version',maxFeeStroops:'10000000'},
  {key:'revoke',requestId:uuid(4),actor:'patient',action:'set_permissions',maxFeeStroops:'10000000',input:{requestId:uuid(4),action:'set_permissions',doctorId:10,canRead:false,canAppend:false,expectedRevision:6}},
] };
const key = rehearsalRunLockKey(policy), final = policy.steps[2];
/** A small lock scheduler models PostgreSQL ownership and session/xact lifetime.
 * Only SELECTs are accepted. Test withdrawal persistence requires ownership. */
class AdvisoryDatabase {
  locks=new Map(); waiting=new Map(); closed=new Map();
  tryAcquire(owner,key,kind) {
    const current=this.locks.get(key);
    if(current&&current.owner!==owner)return false;
    const value=current??{owner,kinds:new Map()};value.kinds.set(kind,(value.kinds.get(kind)??0)+1);this.locks.set(key,value);return true;
  }
  async acquire(owner,key,kind) {
    if(this.tryAcquire(owner,key,kind))return;
    await new Promise(resolve=>{const waiting=this.waiting.get(key)??[];waiting.push({owner,kind,resolve});this.waiting.set(key,waiting);});
  }
  release(owner,key,kind,all=false) {
    const current=this.locks.get(key);assert.equal(current?.owner,owner);
    const count=current.kinds.get(kind);assert(count>0);if(all||count===1)current.kinds.delete(kind);else current.kinds.set(kind,count-1);
    if(current.kinds.size)return;
    this.locks.delete(key);const waiting=this.waiting.get(key)??[],next=waiting.shift();
    if(next){this.waiting.set(key,waiting);assert(this.tryAcquire(next.owner,key,next.kind));next.resolve();}
  }
  client(name) {
    const database=this,log=[];
    return {name,log,
      async query(sql,values=[]) {
        log.push({sql,values});
        if(sql==='SELECT pg_advisory_xact_lock(hashtext($1))'){await database.acquire(name,values[0],'xact');return {rows:[]};}
        if(sql==='SELECT pg_advisory_lock(hashtext($1))'){await database.acquire(name,values[0],'session');return {rows:[]};}
        if(sql==='SELECT pg_try_advisory_lock(hashtext($1)) AS acquired')return {rows:[{acquired:database.tryAcquire(name,values[0],'session')}]};
        if(sql==='SELECT pg_advisory_unlock(hashtext($1))'){database.release(name,values[0],'session');return {rows:[{pg_advisory_unlock:true}]};}
        if(sql==='SELECT id FROM clinical_web_operations WHERE id=$1')return {rows:database.closed.has(values[0])?[{id:values[0],state:database.closed.get(values[0])}]:[]};
        throw Error('unexpected_test_query');
      },
      persistWithdrawal(state){assert.equal(database.locks.get(key)?.owner,name);database.closed.set(final.requestId,state);},
      commit(){for(const [heldKey,value]of [...database.locks])if(value.owner===name&&value.kinds.has('xact'))database.release(name,heldKey,'xact',true);},
    };
  }
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('v1 keeps its original no-op and the v2 key is shared exactly across lock modes',async()=>{
  const db=new AdvisoryDatabase(),client=db.client('web');
  assert.equal(rehearsalRunLockKey({schemaVersion:1}),null);
  await lockClinicalRehearsalRun(client,{schemaVersion:1});await assertRehearsalOpen(client,{schemaVersion:1});assert.equal(client.log.length,0);
  assert.equal(key,'clinical-rehearsal:'+policy.runId);
  await assertRehearsalOpen(client,policy);assert.deepEqual(client.log.map(entry=>entry.sql),['SELECT pg_advisory_xact_lock(hashtext($1))','SELECT id FROM clinical_web_operations WHERE id=$1']);
  assert.deepEqual(client.log[0].values,[key]);assert.deepEqual(client.log[1].values,[final.requestId]);client.commit();
});
test('unknown policy, UUID, foreign step and withdrawal impersonation reject before SQL',async()=>{
  const client=new AdvisoryDatabase().client('web');
  for(const bad of [null,{schemaVersion:3},{schemaVersion:2,runId:'bad'}])assert.throws(()=>rehearsalRunLockKey(bad),/scope_rejected/);
  for(const step of [{...policy.steps[1],key:'revoke'},{...final,input:{...final.input,canAppend:true}},{...final,requestId:uuid(99)}])await assert.rejects(assertRehearsalOpen(client,policy,{step}),/scope_rejected/);
  await assert.rejects(assertRehearsalOpen(client,policy,{lock:'false'}),/scope_rejected/);assert.equal(client.log.length,0);
});
for(const state of ['awaiting_signature','submitted','confirmed','failed','cancelled'])test('withdrawal slot in '+state+' blocks every new phase before its callback',async()=>{
  const db=new AdvisoryDatabase();db.closed.set(final.requestId,state);
  for(const phase of ['enqueue','prepare','sign','submit']){
    const client=db.client(phase);let invoked=false;
    await assert.rejects(async()=>{await assertRehearsalOpen(client,policy);invoked=true;},/order_conflict/);
    assert.equal(invoked,false);client.commit();
  }
  const withdrawal=db.client('withdrawal');await assertRehearsalOpen(withdrawal,policy,{step:final});withdrawal.commit();
});
test('withdrawal committed first makes a waiting administrative action observe closure before signing',async()=>{
  const db=new AdvisoryDatabase(),withdrawal=db.client('patient'),admin=db.client('admin');
  await lockClinicalRehearsalRun(withdrawal,policy);let signed=false,settled=false;
  const pending=(async()=>{try{await assertRehearsalOpen(admin,policy);signed=true;}finally{settled=true;admin.commit();}})();
  await tick();assert.equal(settled,false);assert.equal(signed,false);
  withdrawal.persistWithdrawal('confirmed');withdrawal.commit();await assert.rejects(pending,/order_conflict/);assert.equal(signed,false);
});
test('an administrative transaction that owns the run lock completes before a concurrent withdrawal can seal it',async()=>{
  const db=new AdvisoryDatabase(),admin=db.client('admin'),withdrawal=db.client('patient');
  await assertRehearsalOpen(admin,policy);let sealed=false;
  const waiting=(async()=>{await lockClinicalRehearsalRun(withdrawal,policy);withdrawal.persistWithdrawal('awaiting_signature');sealed=true;withdrawal.commit();})();
  await tick();assert.equal(sealed,false);admin.commit();await waiting;assert.equal(sealed,true);
  const next=db.client('next');await assert.rejects(assertRehearsalOpen(next,policy),/order_conflict/);next.commit();
});
test('runner session lock survives its storage COMMIT and excludes transaction-scoped withdrawal until finally',async()=>{
  const db=new AdvisoryDatabase(),runner=db.client('runner'),patient=db.client('patient');
  const acquired=await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[key]);assert.equal(acquired.rows[0].acquired,true);
  await assertRehearsalOpen(runner,policy,{lock:false});runner.commit();
  let sealed=false;const waiting=(async()=>{await lockClinicalRehearsalRun(patient,policy);patient.persistWithdrawal('confirmed');sealed=true;patient.commit();})();
  await tick();assert.equal(sealed,false);
  // Storage's commit cannot release the runner's outer session lock.
  for(const phase of ['prepare','sign','submit'])await assertRehearsalOpen(runner,policy,{lock:false});
  assert.equal(runner.log.some(entry=>entry.sql.includes('xact_lock')),false);
  await runner.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);await waiting;assert.equal(sealed,true);
  const next=db.client('next-runner');const nextLock=await next.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[key]);assert.equal(nextLock.rows[0].acquired,true);
  await assert.rejects(assertRehearsalOpen(next,policy,{lock:false}),/order_conflict/);await next.query('SELECT pg_advisory_unlock(hashtext($1))',[key]);
});
test('a runner cannot acquire its session lock while the clinical transaction owns the same run',async()=>{
  const db=new AdvisoryDatabase(),patient=db.client('patient'),runner=db.client('runner');await lockClinicalRehearsalRun(patient,policy);
  const result=await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',[key]);assert.equal(result.rows[0].acquired,false);
  assert.equal(runner.log.length,1);patient.commit();
});
test('unexpected SQL errors propagate unchanged rather than being treated as an open run',async()=>{
  const failure=new Error('synthetic transport outage');let calls=0;
  const client={query:async()=>{if(++calls===2)throw failure;return {rows:[]};}};
  await assert.rejects(assertRehearsalOpen(client,policy),error=>error===failure);
});


test('a fee-amended continuation rejects every new administrative renewal before SQL and leaves clinical slots under the same lock',async()=>{
  const amendedPolicy={...policy,feeAmendment:Object.freeze({amendmentId:uuid(9)})};
  assert.equal(rehearsalRunLockKey(amendedPolicy),key);
  for(const options of [{},{step:policy.steps[0]},{lock:false},{lock:false,step:policy.steps[0]}]){
    const client=new AdvisoryDatabase().client('blocked-admin');
    await assert.rejects(assertRehearsalOpen(client,amendedPolicy,options),/scope_rejected/);
    assert.equal(client.log.length,0);
  }
  const clinical=new AdvisoryDatabase().client('doctor');
  await assertRehearsalOpen(clinical,amendedPolicy,{step:policy.steps[1]});
  assert.equal(clinical.log.length,2);clinical.commit();
});

test('an amended continuation keeps the same withdrawal seal and permits only its own exact final slot after closure',async()=>{
  const amendedPolicy={...policy,feeAmendment:Object.freeze({executionApprovedAt:1800000000})};
  const db=new AdvisoryDatabase();db.closed.set(final.requestId,'cancelled');
  const doctor=db.client('doctor');await assert.rejects(assertRehearsalOpen(doctor,amendedPolicy,{step:policy.steps[1]}),/order_conflict/);doctor.commit();
  const withdrawal=db.client('withdrawal');await assertRehearsalOpen(withdrawal,amendedPolicy,{step:final});withdrawal.commit();
});

test('serialized resume metadata grants no admin, maintenance or clinical authority before own approval',async()=>{const resumed={...policy,resumeContinuation:{approvedAt:1800000000},completionContinuation:{},maintenanceThree:{}};for(const options of [{},{step:policy.steps[0]},{step:policy.steps[1]},{step:final}]){const client=new AdvisoryDatabase().client('unapproved14');await assert.rejects(assertRehearsalOpen(client,resumed,options),/scope_rejected/);assert.equal(client.log.length,0);}});
