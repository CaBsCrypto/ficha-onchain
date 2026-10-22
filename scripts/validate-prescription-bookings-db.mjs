// Real PostgreSQL validation of the new booking services. Testnet/dev only.
// Synthetic rows are removed by exact captured IDs; no Stellar calls.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

if (!process.argv.includes('--dev-only')) throw Error('explicit_dev_only_required');
if (!process.env.DATABASE_URL) {
  const match=readFileSync('.env.local','utf8').match(/^DATABASE_URL=(.*)$/m);
  if(match)process.env.DATABASE_URL=match[1].trim().replace(/^['"]|['"]$/g,'');
}
if (!/^ep-lingering-water-ahzh89z5(?:-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.test(new URL(process.env.DATABASE_URL).hostname)) throw Error('unexpected_database');
process.env.PRESCRIPTION_PRIVATE_CONTRACT_ID=StrKey.encodeContract(Buffer.alloc(32,29));
neonConfig.webSocketConstructor=ws;
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:6});
const run=randomUUID();const prefix=`booking-db-${run}`;
const artifact=resolve('docs/evidence/security-review-week1',`booking-db-${run}.json`);
const temp=resolve('scripts',`.booking-db-${run}`);mkdirSync(temp);
const compiled=[];const results=[];const appointments=[];
const actor={userId:`did:test:${run}:patient`,email:`${prefix}-patient@example.test`};
const doctor={userId:`did:test:${run}:doctor`,email:`${prefix}-doctor@example.test`};
const stranger={userId:`did:test:${run}:other`,email:`${prefix}-other@example.test`};
const subjects=[actor,doctor,stranger];
function compile(source,name) {
  let text=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  text=text.replace('"@/lib/prescription-booking"','"./booking.mjs"');
  const path=resolve(temp,name);writeFileSync(path,text);compiled.push(path);return pathToFileURL(path).href;
}
const {preparePrescriptionBooking}=await import(compile('src/lib/prescription-booking.ts','booking.mjs'));
const {createWalletChallenge,completeWalletChallenge}=await import(compile('src/lib/stellar-wallet-binding.ts','binding.mjs'));
const tag=client=>Object.assign(async(strings,...values)=>{
  const query=strings.reduce((a,s,i)=>a+s+(i<values.length?`$${i+1}`:''),'');
  return (await client.query(query,values)).rows;
},{query:async(q,v)=>(await client.query(q,v)).rows});
const sql=tag(pool);
async function check(name,fn){await fn();results.push({name,status:'passed',environment:'real_neon_dev'});}
async function appointment(slot){const r=await pool.query(`INSERT INTO appointments(doctor_email,patient_email,patient_name,date,time_slot,status,started_at)
 VALUES($1,$2,'Synthetic SQL validation',(NOW() AT TIME ZONE 'America/Santiago')::date,$3,'in_progress',NOW()) RETURNING id`,[doctor.email,actor.email,slot]);appointments.push(r.rows[0].id);return r.rows[0].id;}
async function challenge(subject,key,role){const c=await createWalletChallenge(sql,subject,key.publicKey(),role);return {c,signature:key.sign(Buffer.from(c.message)).toString('base64')};}
let failure;let cleanup=false;
try {
  await check('migration tables and enabled protection trigger',async()=>{
    const r=await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1)`,[['stellar_binding_challenges','stellar_verified_bindings','prescription_booking_requests']]);assert.equal(r.rows[0].n,3);
    const t=await pool.query(`SELECT tgenabled FROM pg_trigger WHERE tgname='protect_prescription_appointment' AND tgrelid='appointments'::regclass`);assert.equal(t.rows[0].tgenabled,'O');
  });
  const patientKey=Keypair.random(),doctorKey=Keypair.random();
  await check('same signed challenge concurrent completion has one winner',async()=>{
    const {c,signature}=await challenge(actor,patientKey,'patient');
    const calls=await Promise.allSettled([completeWalletChallenge(sql,actor,c.challengeId,signature),completeWalletChallenge(sql,actor,c.challengeId,signature)]);
    assert.equal(calls.filter(x=>x.status==='fulfilled').length,1);
    const row=(await pool.query('SELECT consumed_at,verified_signature FROM stellar_binding_challenges WHERE id=$1',[c.challengeId])).rows[0];assert.ok(row.consumed_at);assert.equal(row.verified_signature,signature);
  });
  const d=await challenge(doctor,doctorKey,'doctor');await completeWalletChallenge(sql,doctor,d.c.challengeId,d.signature);
  await check('wallet uniqueness rejects another identity atomically',async()=>{
    const {c,signature}=await challenge(stranger,patientKey,'patient');
    await assert.rejects(()=>completeWalletChallenge(sql,stranger,c.challengeId,signature),e=>e.code==='23505');
    assert.equal((await pool.query('SELECT consumed_at FROM stellar_binding_challenges WHERE id=$1',[c.challengeId])).rows[0].consumed_at,null);
  });
  const id=await appointment('fixture-concurrent');
  await check('concurrent preparation returns one stable issuance and expiry',async()=>{
    const values=await Promise.all([preparePrescriptionBooking(sql,actor,id),preparePrescriptionBooking(sql,actor,id)]);
    assert.equal(values[0].issuanceId,values[1].issuanceId);assert.equal(values[0].validUntil,values[1].validUntil);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM prescription_booking_requests WHERE appointment_id=$1',[id])).rows[0].n,1);
  });
  await check('another patient cannot prepare a matching-looking reservation',async()=>{
    await assert.rejects(()=>preparePrescriptionBooking(sql,stranger,id),e=>e.code==='booking_not_eligible');
  });
  await check('legacy update and delete rejected for protected booking',async()=>{
    for(const query of ['UPDATE appointments SET status=\'cancelled\' WHERE id=$1','DELETE FROM appointments WHERE id=$1'])
      await assert.rejects(()=>pool.query(query,[id]),e=>e.code==='23514');
  });
  await check('cancellation preceding preparation prevents eligibility',async()=>{
    const cancelled=await appointment('fixture-cancel-first');
    await pool.query("UPDATE appointments SET status='cancelled' WHERE id=$1",[cancelled]);
    await assert.rejects(()=>preparePrescriptionBooking(sql,actor,cancelled),e=>e.code==='booking_not_eligible');
  });
  await check('waiting legacy mutation sees committed booking and is rejected',async()=>{
    const locked=await appointment('fixture-lock-race');const first=await pool.connect(),second=await pool.connect();
    try {
      await first.query('BEGIN');await first.query('SELECT id FROM appointments WHERE id=$1 FOR UPDATE',[locked]);
      await preparePrescriptionBooking(tag(first),actor,locked);
      let finished=false;const update=second.query("UPDATE appointments SET status='cancelled' WHERE id=$1",[locked]).then(()=>({ok:true}),e=>({ok:false,code:e.code})).finally(()=>{finished=true;});
      await new Promise(r=>setTimeout(r,150));assert.equal(finished,false);
      await first.query('COMMIT');const outcome=await update;assert.deepEqual(outcome,{ok:false,code:'23514'});
    }finally{await first.query('ROLLBACK');first.release();second.release();}
  });
}catch(error){failure={name:error?.name??'Error',code:error?.code??'validation_failed'};}
finally {
  try {
    // Exact IDs + exact synthetic participants; never delete by broad prefix.
    await pool.query('DELETE FROM prescription_booking_requests WHERE appointment_id=ANY($1::int[]) AND patient_email=$2 AND doctor_email=$3',[appointments,actor.email,doctor.email]);
    await pool.query('DELETE FROM appointments WHERE id=ANY($1::int[]) AND patient_email=$2 AND doctor_email=$3',[appointments,actor.email,doctor.email]);
    await pool.query('DELETE FROM stellar_verified_bindings WHERE user_id=ANY($1::text[])',[subjects.map(x=>x.userId)]);
    await pool.query('DELETE FROM stellar_binding_challenges WHERE user_id=ANY($1::text[])',[subjects.map(x=>x.userId)]);
    const remaining=(await pool.query(`SELECT (SELECT count(*) FROM appointments WHERE id=ANY($1::int[])) +
      (SELECT count(*) FROM stellar_verified_bindings WHERE user_id=ANY($2::text[])) +
      (SELECT count(*) FROM stellar_binding_challenges WHERE user_id=ANY($2::text[])) AS n`,[appointments,subjects.map(x=>x.userId)])).rows[0];
    assert.equal(Number(remaining.n),0);cleanup=true;
  }catch(error){failure??={name:'CleanupFailure',code:error?.code??'cleanup_failed'};}
  await pool.end();for(const file of compiled)unlinkSync(file);rmdirSync(temp);
}
const report={run,recordedAt:new Date().toISOString(),devHostVerified:true,stellarTransactions:0,results,cleanupVerified:cleanup,failure:failure??null};
mkdirSync(resolve('docs/evidence/security-review-week1'),{recursive:true});writeFileSync(artifact,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:results.length,cleanupVerified:cleanup,failure:failure??null,evidence:artifact}));
if(failure)process.exitCode=1;
