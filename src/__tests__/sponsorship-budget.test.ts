import { describe, expect, it, vi } from 'vitest';
import { Account, BASE_FEE, Contract, Keypair, Networks, SorobanDataBuilder, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ getDbConnection: vi.fn(() => { throw Error('No real SQL in tests'); }) }));
import { assertSponsorshipPath, loadSponsorshipConfig } from '@/lib/sponsorship/config';
import { bucketKeys, quoteExpiresAt, quoteDigest, sha256, stroops, utcDay, verifySponsorshipPrincipal, type Reservation, type SponsorshipBinding, type SponsorshipPolicy } from '@/lib/sponsorship/domain';
import { quoteSponsorship } from '@/lib/sponsorship/quote';
import { createSponsorshipService } from '@/lib/sponsorship/service';
import { MemorySponsorshipStore } from '@/lib/sponsorship/memory-store';
import { SqlSponsorshipStore, type SponsorshipConnection } from '@/lib/sponsorship/sql-store';
import { SPONSORSHIP_SCHEMA_SQL } from '@/lib/sponsorship/schema';
const source = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 40)), sponsor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 41));
const patient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 42)).publicKey();
const otherPatient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 43)).publicKey();
const contractId = 'CCI3KHWKIVGURS2LAI5VJ5C7EHL6O76MHNCWCVDZWWRIEBXHSLLG4L4U';
const start = Date.parse('2026-10-26T10:00:00Z') / 1000;
const id = (i=1) => '00000000-0000-4000-8000-' + i.toString().padStart(12,'0');
const policy: SponsorshipPolicy = { enabled:true,sponsorDailyLimitStroops:'10000',patientDailyLimitStroops:'10000',maxFeeStroops:'5000' };
async function fixture(i=1, binding:Partial<SponsorshipBinding>={}, preparedAt=start, resource='1000', clinicalWindow=false, maxTime=preparedAt+300) {
  const action=binding.action ?? 'append_version';
  const operation = new Contract(contractId).call(action);
  const tx = new TransactionBuilder(new Account(source.publicKey(),String(100+i)),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .addOperation(operation).setSorobanData(new SorobanDataBuilder().setResourceFee(resource).build()).setTimebounds(0,maxTime).build();
  const principal = await verifySponsorshipPrincipal(async()=>({requestId:id(i),network:'testnet',sourceAddress:source.publicKey(),
    sponsorAddress:sponsor.publicKey(),patientAddress:patient,actorId:'did:privy:synthetic',walletId:'synthetic-wallet',contractId,action,
    operationFingerprint:sha256(operation.body().invokeHostFunctionOp().hostFunction().toXDR('base64')),...binding}));
  const quote=quoteSponsorship(principal,{unsignedXdr:tx.toXDR(),sponsorBaseFeeStroops:'100',preparedAt,now:preparedAt,...(clinicalWindow?{validUntil:Math.min(preparedAt+300,maxTime)}:{})});
  tx.sign(source);
  return {principal,quote,signed:tx.toXDR()};
}
function setup(p:SponsorshipPolicy|null=policy) {
  const store=new MemorySponsorshipStore(),clock={now:start};
  const service=createSponsorshipService({store,policy:p,now:()=>clock.now});
  return {store,clock,service};
}
describe('verified quotes and fail-closed policy',()=>{
  it('requires integer stroops, exact SDK fees, verified server entities and quote provenance',async()=>{
    for(const value of ['1.0','01','-1','1e7',1,1n,'9223372036854775808']) expect(()=>stroops(value)).toThrow('sponsorship_invalid_amount');
    const f=await fixture(),{service}=setup();
    expect(f.quote.offeredFeeStroops).toBe('1200');expect(f.quote.resourceFeeStroops).toBe('1000');
    await expect(service.reserve({...f.principal} as any,f.quote)).rejects.toThrow('sponsorship_unverified_principal');
    await expect(service.reserve(f.principal,{...f.quote} as any)).rejects.toThrow('sponsorship_unverified_quote');
    await expect(setup(null).service.reserve(f.principal,f.quote)).rejects.toThrow('sponsorship_disabled');
  });
  it('rejects changed invocation, wallet, contract and client-supplied fingerprint',async()=>{
    const f=await fixture();
    for(const patch of [{operationFingerprint:'ab'.repeat(32)},{sourceAddress:patient},{contractId:'CAA'},{intent:'revoke'}]) {
      try {
        const principal=await verifySponsorshipPrincipal(async()=>({...f.principal,...patch} as any));
        expect(()=>quoteSponsorship(principal,{unsignedXdr:new Transaction(f.signed,Networks.TESTNET).toXDR(),sponsorBaseFeeStroops:'100',preparedAt:start,now:start})).toThrow();
      } catch(error) { expect((error as Error).message).toMatch(/^sponsorship_/); }
    }
  });
  it('blocks price above server ceiling before reserving any funds',async()=>{
    const f=await fixture(1,{},start,'5000'),{store,service}=setup();
    await expect(service.reserve(f.principal,f.quote)).rejects.toThrow('sponsorship_price_blocked');
    expect(store.inspectBuckets()).toEqual([]);
  });
  it('uses strict90seconds and rejects clock reversal before fresh signing',async()=>{
    const f=await fixture(),{service,clock}=setup();await service.reserve(f.principal,f.quote);
    clock.now=start+89;await expect(service.assertReady(f.principal,'sign')).resolves.toMatchObject({state:'reserved'});
    clock.now=start+90;await expect(service.assertReady(f.principal,'sign')).rejects.toThrow('sponsorship_quote_expired');
    clock.now=start-1;await expect(service.assertReady(f.principal,'sign')).rejects.toThrow('sponsorship_quote_expired');
  });
  it('default config blocks all spending but historical reconciliation remains readable',()=>{
    const config=loadSponsorshipConfig({});
    expect(config.policy).toBeNull();
    expect(()=>assertSponsorshipPath('/api/relay',{method:'POST',purpose:'spend'},config)).toThrow('sponsorship_disabled');
    expect(()=>assertSponsorshipPath('/api/private-operations/[id]',{method:'GET',purpose:'reconcile_read'},config)).not.toThrow();
    expect(()=>assertSponsorshipPath('/api/relay',{method:'POST',purpose:'reconcile_read'},config)).toThrow('sponsorship_path_disabled');
    const configured=loadSponsorshipConfig({TRUSTLEAF_SPONSORSHIP_ENABLED:'true',TRUSTLEAF_SPONSORSHIP_SPONSOR_DAILY_LIMIT_STROOPS:'10000',
      TRUSTLEAF_SPONSORSHIP_PATIENT_DAILY_LIMIT_STROOPS:'5000',TRUSTLEAF_SPONSORSHIP_MAX_FEE_STROOPS:'2000',
      TRUSTLEAF_SPONSORSHIP_EMERGENCY_RESERVE_STROOPS:'1000',TRUSTLEAF_SPONSORSHIP_ENTRY_LIMIT_STROOPS:'3000',
      TRUSTLEAF_SPONSORSHIP_PATHS:'/api/private-clinical-operations'});
    expect(()=>assertSponsorshipPath('/api/private-clinical-operations',{method:'POST',purpose:'spend'},configured)).not.toThrow();
    expect(()=>assertSponsorshipPath('/api/relay',{method:'POST',purpose:'spend'},configured)).toThrow('sponsorship_path_disabled');
  });
});
describe('atomic persistent accounting',()=>{
  it('concurrent requests share sponsor capacity and a single request is idempotent',async()=>{
    const {service,store}=setup({...policy,sponsorDailyLimitStroops:'2400'});
    const fs=await Promise.all(Array.from({length:8},(_,i)=>fixture(i+1,{patientAddress:i%2?otherPatient:patient})));
    const results=await Promise.allSettled(fs.map(f=>service.reserve(f.principal,f.quote)));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(2);
    expect(store.inspectBuckets().find(b=>b.key.startsWith('sponsor:'))?.reservedStroops).toBe('2400');
    const accepted=fs[results.findIndex(r=>r.status==='fulfilled')];
    await Promise.all(Array.from({length:8},()=>service.reserve(accepted.principal,accepted.quote)));
    expect(store.inspectBuckets().find(b=>b.key.startsWith('sponsor:'))?.reservedStroops).toBe('2400');
  });
  it('enforces patient cap across different sponsors, not just within one sponsor',async()=>{
    const {service,store}=setup({...policy,patientDailyLimitStroops:'1500'}),a=await fixture(),b=await fixture(2,{sponsorAddress:otherPatient});
    await service.reserve(a.principal,a.quote);await expect(service.reserve(b.principal,b.quote)).rejects.toThrow('sponsorship_daily_limit');
    expect(store.inspectBuckets().find(b=>b.key==='patient:'+patient)?.reservedStroops).toBe('1200');
  });
  it('preserves UTC origin day across midnight without resetting a reservation',async()=>{
    const at=Date.parse('2026-10-26T23:59:50Z')/1000,f=await fixture(1,{},at),{service,clock,store}=setup();
    clock.now=at;await service.reserve(f.principal,f.quote);clock.now=at+20;await service.reserve(f.principal,f.quote);
    expect((await store.get(f.principal.requestId))?.day).toBe('2026-10-26');
    expect(utcDay(at+20)).toBe('2026-10-27');
    expect(store.inspectBuckets().every(b=>b.day==='2026-10-26')).toBe(true);
  });
  it('encounter allowance lasts across UTC days and is scoped to its patient',async()=>{
    const encounterId='ac'.repeat(32),{service,clock,store}=setup({...policy,encounterLimitStroops:'2000'});
    const a=await fixture(1,{encounterId}),b=await fixture(2,{encounterId},start+86400);
    await service.reserve(a.principal,a.quote);clock.now=start+86400;
    await expect(service.reserve(b.principal,b.quote)).rejects.toThrow('sponsorship_daily_limit');
    const c=await fixture(3,{encounterId,patientAddress:otherPatient},clock.now);await service.reserve(c.principal,c.quote);
    expect(store.inspectBuckets().filter(b=>b.key.startsWith('encounter:')).map(b=>b.day)).toEqual(['1970-01-01','1970-01-01']);
    const missing=await fixture(4,{},clock.now);await expect(service.reserve(missing.principal,missing.quote)).rejects.toThrow('sponsorship_encounter_required');
  });
  it('keeps an emergency floor for new normal work while allowing verified revocation',async()=>{
    const {service,store}=setup({...policy,sponsorDailyLimitStroops:'3000',emergencyReserveStroops:'1000'});
    const normal=await fixture(),next=await fixture(2),revoke=await fixture(3,{action:'set_permissions',intent:'revoke'});
    await service.reserve(normal.principal,normal.quote);await expect(service.reserve(next.principal,next.quote)).rejects.toThrow('sponsorship_daily_limit');
    await service.reserve(revoke.principal,revoke.quote);
    await expect(service.assertReady(normal.principal,'sign')).resolves.toMatchObject({state:'reserved'});
    expect(store.inspectBuckets().find(b=>b.key.startsWith('sponsor:'))?.reservedStroops).toBe('2400');
  });
  it('rejects same request with changed binding or reanchored quote rather than allocating again',async()=>{
    const a=await fixture(),{service,store}=setup();await service.reserve(a.principal,a.quote);
    const b=await fixture(1,{patientAddress:otherPatient});
    await expect(service.reserve(b.principal,b.quote)).rejects.toThrow('sponsorship_idempotency_conflict');
    expect(store.inspectBuckets()).toHaveLength(2);
  });
});
describe('signing, one canonical hash and settlement',()=>{
  it('pins signed payload and hash before broadcast, rejecting changed signatures/hash',async()=>{
    const f=await fixture(),{service,store}=setup();await service.reserve(f.principal,f.quote);
    await expect(service.assertReady(f.principal,'submit')).rejects.toThrow('sponsorship_signature_missing');
    await service.markSigned(f.principal,f.signed);const submission=await service.bindSubmission(f.principal,f.signed);
    expect((await store.get(f.principal.requestId))?.transactionHash).toBe(submission.transactionHash);
    expect(await service.bindSubmission(f.principal,f.signed)).toEqual(submission);
    const changed=new Transaction(f.signed,Networks.TESTNET);changed.sign(sponsor);
    await expect(service.bindSubmission(f.principal,changed.toXDR())).rejects.toThrow('sponsorship_hash_conflict');
    await expect(service.cancelUnsigned(f.principal)).rejects.toThrow('sponsorship_signed_reservation');
  });
  it('recovers the same signed envelope after quote90s until envelope expiry, never a new signature',async()=>{
    const f=await fixture(),{service,clock}=setup();await service.reserve(f.principal,f.quote);
    clock.now=start+89;await service.markSigned(f.principal,f.signed);clock.now=start+150;
    await expect(service.assertReady(f.principal,'sign')).rejects.toThrow();
    await expect(service.bindSubmission(f.principal,f.signed)).resolves.toHaveProperty('transactionHash');
    clock.now=start+300;await expect(service.bindSubmission(f.principal,f.signed)).rejects.toThrow('sponsorship_envelope_expired');
  });
  it('uses server signature acceptance time when recovering a committed clinical row after90s',async()=>{
    const f=await fixture(),{service,clock}=setup();await service.reserve(f.principal,f.quote);clock.now=start+100;
    await expect(service.bindSubmission(f.principal,f.signed)).rejects.toThrow('sponsorship_quote_expired');
    await expect(service.bindSubmission(f.principal,f.signed,{signedAt:start+89})).resolves.toHaveProperty('transactionHash');
    const other=await fixture(2),setup2=setup();await setup2.service.reserve(other.principal,other.quote);setup2.clock.now=start+100;
    await expect(setup2.service.bindSubmission(other.principal,other.signed,{signedAt:start+90})).rejects.toThrow('sponsorship_quote_expired');
  });
  it.each(['UNKNOWN','NOT_FOUND'] as const)('holds all funds for%s even after the envelope expires',async status=>{
    const f=await fixture(),{service,store,clock}=setup();await service.reserve(f.principal,f.quote);
    const {transactionHash}=await service.bindSubmission(f.principal,f.signed);clock.now=start+1000;
    await service.reconcile(f.principal.requestId,async()=>({status,transactionHash}));
    expect(store.inspectBuckets().every(b=>b.reservedStroops==='1200'&&b.spentStroops==='0')).toBe(true);
  });
  it.each(['SUCCESS','FAILED'] as const)('counts canonical%s charges once and releases the offered remainder',async status=>{
    const f=await fixture(),{service,store}=setup();await service.reserve(f.principal,f.quote);
    const {transactionHash}=await service.bindSubmission(f.principal,f.signed);
    const read=vi.fn(async()=>({status,transactionHash,feeChargedStroops:'700',ledger:123}));
    await Promise.all([service.reconcile(f.principal.requestId,read),service.reconcile(f.principal.requestId,read)]);
    expect(store.inspectBuckets().every(b=>b.reservedStroops==='0'&&b.spentStroops==='700')).toBe(true);
    await expect(service.reconcile(f.principal.requestId,async()=>({status,transactionHash,feeChargedStroops:'701',ledger:123}))).rejects.toThrow('sponsorship_receipt_mismatch');
  });
  it('rejects another hash, impossible charges and raw provider errors without releasing funds',async()=>{
    const f=await fixture(),{service,store}=setup();await service.reserve(f.principal,f.quote);
    const {transactionHash}=await service.bindSubmission(f.principal,f.signed);
    await expect(service.reconcile(f.principal.requestId,async()=>({status:'SUCCESS',transactionHash:'ef'.repeat(32),feeChargedStroops:'1',ledger:123}))).rejects.toThrow('sponsorship_receipt_mismatch');
    await expect(service.reconcile(f.principal.requestId,async()=>({status:'FAILED',transactionHash,feeChargedStroops:'1201',ledger:123}))).rejects.toThrow('sponsorship_receipt_mismatch');
    await expect(service.reconcile(f.principal.requestId,async()=>{throw Error('private RPC credential');})).rejects.toThrow('sponsorship_receipt_unavailable');
    expect(store.inspectBuckets().every(b=>b.reservedStroops==='1200')).toBe(true);
  });
  it('unsigned cancellation is idempotent and available while disabled; historical rows need no reservation',async()=>{
    const f=await fixture(),{service,store}=setup();await service.reserve(f.principal,f.quote);
    const disabled=createSponsorshipService({store,policy:null});await disabled.cancelUnsigned(f.principal);await disabled.cancelUnsigned(f.principal);
    expect(store.inspectBuckets().every(b=>b.reservedStroops==='0')).toBe(true);
    const receipt=vi.fn();expect(await disabled.reconcile(id(99),receipt)).toBeNull();expect(receipt).not.toHaveBeenCalled();
  });
});

/** Local transaction emulator exercises actual adapter SQL/parameters without a remote database. */
class LocalSql {
  rows=new Map<string,any>();buckets=new Map<string,any>();calls:{sql:string;values:unknown[]}[]=[];inTransaction=false;releases=0;
  connect=async():Promise<SponsorshipConnection>=>({query:this.query,release:()=>{this.releases++;}});
  snapshot:{rows:Map<string,any>;buckets:Map<string,any>}|null=null;
  query=async(sql:string,values:unknown[]=[]):Promise<{rows:any[]}>=>{
    this.calls.push({sql,values});const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
    if(sql==='BEGIN'){this.inTransaction=true;this.snapshot={rows:new Map(copy([...this.rows])),buckets:new Map(copy([...this.buckets]))};return {rows:[]};}
    if(sql==='COMMIT'){this.inTransaction=false;this.snapshot=null;return {rows:[]};}
    if(sql==='ROLLBACK'){if(this.snapshot){this.rows=this.snapshot.rows;this.buckets=this.snapshot.buckets;}this.snapshot=null;this.inTransaction=false;return {rows:[]};}
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.startsWith('SELECT request_id')){const row=this.rows.get(String(values[0]));return {rows:row?[copy(row)]:[]};}
    const key=[values[0],values[1],values[2]].join('|');
    if(sql.startsWith('INSERT INTO sponsorship_daily_buckets')){
      if(!this.buckets.has(key))this.buckets.set(key,{bucket_key:values[1],utc_day:values[2],limit_stroops:values[3],reserved_stroops:'0',spent_stroops:'0'});
      return {rows:[]};
    }
    if(sql.includes('FROM sponsorship_daily_buckets'))return {rows:this.buckets.has(key)?[copy(this.buckets.get(key))]:[]};
    if(sql.startsWith('UPDATE sponsorship_daily_buckets')){const b=this.buckets.get(key);b.reserved_stroops=values[3];b.spent_stroops=values[4];return {rows:[]};}
    if(sql.startsWith('INSERT INTO sponsorship_reservations')){
      const payload=JSON.parse(String(values[5]));this.rows.set(String(values[0]),{request_id:values[0],network:values[1],utc_day:values[2],state:values[3],transaction_hash:values[4],payload});
      return {rows:[]};
    }
    if(sql.startsWith('UPDATE sponsorship_reservations')){
      const row=this.rows.get(String(values[0]));row.state=values[1];row.transaction_hash=values[2];row.payload=JSON.parse(String(values[3]));return {rows:[]};
    }
    throw Error('Unexpected local SQL');
  };
}
describe('SQL adapter invariants',()=>{
  it('locks request then ordered buckets, parameterizes amounts and preserves JSONB key-order independence',async()=>{
    const db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),f=await fixture(1,{encounterId:'ab'.repeat(32)});
    const service=createSponsorshipService({store,policy:{...policy,encounterLimitStroops:'5000'},now:()=>start});
    await service.reserve(f.principal,f.quote);
    const lock=db.calls.findIndex(c=>c.sql.includes('pg_advisory_xact_lock'));
    expect(db.calls[0].sql).toBe('BEGIN');expect(lock).toBe(1);
    const keys=db.calls.filter(c=>c.sql.includes('FROM sponsorship_daily_buckets')).map(c=>c.values[1]);
    expect(keys).toEqual(bucketKeys(f.principal));expect(db.calls.at(-1)?.sql).toBe('COMMIT');
    expect(db.calls.filter(c=>c.sql.startsWith('INSERT INTO sponsorship_daily_buckets'))[0].values[2]).toBe('1970-01-01');
    expect([...db.buckets.values()].find(b=>String(b.bucket_key).startsWith('encounter:')).reserved_stroops).toBe('1200');
    const row=db.rows.get(f.principal.requestId);
    row.payload.quote=Object.fromEntries(Object.entries(row.payload.quote).sort(([a],[b])=>a.localeCompare(b)));
    expect((await store.get(f.principal.requestId))?.quote.quoteId).toBe(f.quote.quoteId);
    await service.assertReady(f.principal,'sign');expect(db.inTransaction).toBe(false);expect(db.releases).toBe(3);
  });
  it('rolls back bucket creation/counters and releases connection on cap rejection',async()=>{
    const db=new LocalSql(),service=createSponsorshipService({store:new SqlSponsorshipStore(db.connect),policy:{...policy,sponsorDailyLimitStroops:'1000'},now:()=>start});
    const f=await fixture();await expect(service.reserve(f.principal,f.quote)).rejects.toThrow('sponsorship_daily_limit');
    expect(db.rows.size).toBe(0);expect(db.buckets.size).toBe(0);expect(db.calls.at(-1)?.sql).toBe('ROLLBACK');expect(db.releases).toBe(1);
  });
  it('runs canonical RPC outside every SQL lock and settles its original UTC buckets',async()=>{
    const db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),clock={now:start};
    const service=createSponsorshipService({store,policy,now:()=>clock.now}),f=await fixture();await service.reserve(f.principal,f.quote);
    const {transactionHash}=await service.bindSubmission(f.principal,f.signed);clock.now=start+86400;
    await service.reconcile(f.principal.requestId,async hash=>{
      expect(db.inTransaction).toBe(false);expect(hash).toBe(transactionHash);
      return {status:'SUCCESS',transactionHash:hash,ledger:555,feeChargedStroops:'800'};
    });
    expect([...db.buckets.values()].every(b=>b.utc_day==='2026-10-26'&&b.reserved_stroops==='0'&&b.spent_stroops==='800')).toBe(true);
    expect(db.inTransaction).toBe(false);
  });
  it('fails closed on corrupt stored fee or quoted binding and hides connector diagnostics',async()=>{
    const db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),service=createSponsorshipService({store,policy,now:()=>start}),f=await fixture();
    await service.reserve(f.principal,f.quote);db.rows.get(f.principal.requestId).payload.quote.offeredFeeStroops='1';
    await expect(store.get(f.principal.requestId)).rejects.toThrow('sponsorship_accounting_unavailable');
    const broken=new SqlSponsorshipStore(async()=>{throw Error('database credentials must stay private');});
    await expect(broken.get(f.principal.requestId)).rejects.toThrow('sponsorship_accounting_unavailable');
  });
  it('declares migration only, with no request-time DDL or implicit execution',()=>{
    expect(SPONSORSHIP_SCHEMA_SQL).toHaveLength(3);
    expect(SPONSORSHIP_SCHEMA_SQL.join(' ')).toContain('PRIMARY KEY(network,bucket_key,utc_day)');
    expect(SPONSORSHIP_SCHEMA_SQL.join(' ')).toContain('transaction_hash TEXT UNIQUE');
  });
});

it('preserves the patient emergency floor as well as the sponsor floor', async () => {
 const {service}=setup({...policy,patientDailyLimitStroops:'3000',emergencyReserveStroops:'1000'});
 const a=await fixture(100),b=await fixture(101),r=await fixture(102,{action:'set_permissions',intent:'revoke'});
 await service.reserve(a.principal,a.quote);
 await expect(service.reserve(b.principal,b.quote)).rejects.toThrow('sponsorship_daily_limit');
 await expect(service.reserve(r.principal,r.quote)).resolves.toMatchObject({state:'reserved'});
});


describe('persisted clinical quote expiry without renewing legacy reservations',()=>{
  it('preserves the exact legacy digest and90s window even after reading with the new implementation',async()=>{
    const f=await fixture(),q=f.quote;
    expect(q).not.toHaveProperty('validUntil');
    expect(q.quoteId).toBe(sha256(JSON.stringify([q.binding,q.unsignedHash,q.signingHash,q.preparedAt,q.maxTime,q.offeredFeeStroops,q.resourceFeeStroops,q.sponsorBaseFeeStroops])));
    const db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),clock={now:start};
    const service=createSponsorshipService({store,policy,now:()=>clock.now});await service.reserve(f.principal,q);
    clock.now=start+90;const read=await store.get(f.principal.requestId);
    expect(read!.quote).toEqual(q);expect(quoteExpiresAt(read!.quote)).toBe(start+90);
    await expect(service.assertReady(f.principal,'sign')).rejects.toThrow('sponsorship_quote_expired');
    expect((await store.get(f.principal.requestId))!.quote).not.toHaveProperty('validUntil');
  });
  it('persists a new300s absolute expiry, then expires without changing its XDR bound or fee',async()=>{
    const f=await fixture(1,{},start,'1000',true,start+600),db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),clock={now:start};
    const service=createSponsorshipService({store,policy,now:()=>clock.now});await service.reserve(f.principal,f.quote);
    expect(db.rows.get(f.principal.requestId).payload.quote.validUntil).toBe(start+300);
    expect(f.quote.maxTime).toBe(start+600);expect(f.quote.offeredFeeStroops).toBe('1200');
    clock.now=start+299;await expect(service.assertReady(f.principal,'sign')).resolves.toMatchObject({state:'reserved'});
    clock.now=start+300;await expect(service.assertReady(f.principal,'sign')).rejects.toThrow('sponsorship_quote_expired');
    expect((await store.get(f.principal.requestId))!.quote.validUntil).toBe(start+300);
  });
  it('caps the new expiry at the existing envelope boundary',async()=>{
    const f=await fixture(1,{},start,'1000',true,start+170),{service,clock}=setup();await service.reserve(f.principal,f.quote);
    expect(f.quote.validUntil).toBe(start+170);expect(f.quote.maxTime).toBe(start+170);
    clock.now=start+169;await expect(service.assertReady(f.principal,'sign')).resolves.toMatchObject({state:'reserved'});
    clock.now=start+170;await expect(service.assertReady(f.principal,'sign')).rejects.toThrow('sponsorship_quote_expired');
  });
  it('binds the new expiry in the quote digest and rejects malformed or noncanonical stored lifetimes',async()=>{
    const f=await fixture(1,{},start,'1000',true,start+600),db=new LocalSql(),store=new SqlSponsorshipStore(db.connect);
    const service=createSponsorshipService({store,policy,now:()=>start});await service.reserve(f.principal,f.quote);
    const row=db.rows.get(f.principal.requestId),original=JSON.parse(JSON.stringify(row.payload));
    row.payload.quote.validUntil++;await expect(store.get(f.principal.requestId)).rejects.toThrow('sponsorship_accounting_unavailable');
    for(const invalid of [start-1,start+90,start+299,start+301,start+601,start+300.5,String(start+300),null]){
      row.payload=JSON.parse(JSON.stringify(original));row.payload.quote.validUntil=invalid;
      const {quoteId,...data}=row.payload.quote;row.payload.quote.quoteId=quoteDigest(data);
      await expect(store.get(f.principal.requestId)).rejects.toThrow('sponsorship_accounting_unavailable');
    }
    row.payload=original;expect((await store.get(f.principal.requestId))!.quote.validUntil).toBe(start+300);
  });
  it('rejects adding or retiming a persisted expiry during a reservation mutation',async()=>{
    for(const clinicalWindow of [false,true]){
      const f=await fixture(1,{},start,'1000',clinicalWindow,start+600),db=new LocalSql(),store=new SqlSponsorshipStore(db.connect);
      const service=createSponsorshipService({store,policy,now:()=>start});await service.reserve(f.principal,f.quote);
      await expect(store.mutate(f.principal.requestId,null,null,(r)=>{
        const q={...r!.quote,preparedAt:r!.quote.preparedAt+1,validUntil:r!.quote.preparedAt+301};
        const {quoteId,...data}=q;return {...r!,quote:{...q,quoteId:quoteDigest(data)}};
      })).rejects.toThrow('sponsorship_binding_conflict');
      expect((await store.get(f.principal.requestId))!.quote).toEqual(f.quote);
      expect([...db.buckets.values()].every(b=>b.reserved_stroops==='1200'&&b.spent_stroops==='0')).toBe(true);
    }
  });
  it.each(['UNKNOWN','NOT_FOUND'] as const)('preserves the same signed reservation and full charge reserve for%s after expiry',async status=>{
    const f=await fixture(1,{},start,'1000',true,start+600),db=new LocalSql(),store=new SqlSponsorshipStore(db.connect),clock={now:start};
    const service=createSponsorshipService({store,policy,now:()=>clock.now});await service.reserve(f.principal,f.quote);
    clock.now=start+299;await service.markSigned(f.principal,f.signed);
    clock.now=start+400;const {transactionHash}=await service.bindSubmission(f.principal,f.signed);
    clock.now=start+1000;await service.reconcile(f.principal.requestId,async()=>({status,transactionHash}));
    expect((await store.get(f.principal.requestId))!).toMatchObject({state:'submitted',transactionHash,signedAt:start+299,chargedStroops:null,quote:{validUntil:start+300}});
    expect([...db.buckets.values()].every(b=>b.reserved_stroops==='1200'&&b.spent_stroops==='0')).toBe(true);
    await expect(service.cancelUnsigned(f.principal)).rejects.toThrow('sponsorship_signed_reservation');
  });
});
