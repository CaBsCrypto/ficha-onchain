// Explicit Testnet/dev database validation. Contains synthetic identities only.
import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
import { commitmentFor, encryptDossier, decryptDossier } from './lib/private-doctor-dossier.mjs';

for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m=line.match(/^([A-Z_]+)=(.*)$/);
  if(m && !process.env[m[1]]) process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
}
const mode=process.argv[2];
if(!['prepare','submit','verify'].includes(mode)) throw Error('Use prepare, submit or verify');
const dbUrl=process.env.DATABASE_URL;
if(!dbUrl || !new URL(dbUrl).hostname.startsWith('ep-lingering-water-ahzh89z5')) throw Error('Only the approved dev database is allowed');
const key=process.env.TRUSTLEAF_DATA_KEY;
if(!/^[a-fA-F0-9]{64}$/.test(key??'')) throw Error('Dossier encryption key unavailable');
const sql=neon(dbUrl);
const root='docs/evidence/testnet-generation-2026-09-07/';
const deployment=JSON.parse(fs.readFileSync(root+'private-registry.json','utf8'));
if(deployment.network!=='testnet'|| !/^C[A-Z2-7]{55}$/.test(deployment.contractId??'')) throw Error('Verified Testnet deployment required');
const publicFile=root+'private-dossier-validation.json';
const invocation=['contract','invoke','--id',deployment.contractId,'--network','testnet','--config-dir','C:\\Users\\MGC\\.config\\stellar'];
function save(e) { fs.writeFileSync(publicFile,JSON.stringify(e,null,2)+'\n'); }
function call(fn,args,send=false) {
  const r=spawnSync('stellar',[...invocation,'--source-account',send?'trustleaf-testnet-admin-20260907':deployment.admin,'--send',send?'yes':'no','--',fn,...args],{encoding:'utf8',windowsHide:true});
  return r;
}
async function receipt(hash) {
  const r=await fetch('https://soroban-testnet.stellar.org',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:{hash}})});
  const data=await r.json();if(!r.ok||data.result?.status!=='SUCCESS') throw Error('Receipt not confirmed');return data.result;
}

if(mode==='prepare') {
  if(fs.existsSync(publicFile)) throw Error('Prepared evidence already exists; inspect rather than overwrite');
  const doctors=JSON.parse(fs.readFileSync(root+'three-test-doctors.json','utf8'));
  const evidence={network:'testnet',contractId:deployment.contractId,syntheticOnly:true,entries:[]};
  for(const [i,d] of doctors.entries()) {
    const id=randomUUID(),validUntil=Math.floor(Date.now()/1000)+30*86400;
    const dossier={schemaVersion:1,network:'testnet',contractId:deployment.contractId,wallet:d.wallet,version:1,validUntil,
      fullName:d.full_name,license:d.license_id,specialty:'TEST ONLY',verificationSource:'Synthetic fixture, no real professional validation',
      reviewedBy:'TrustLeaf Testnet validation',reviewedAt:new Date().toISOString(),blinding:randomBytes(32).toString('hex')};
    const commitment=commitmentFor(dossier);
    const encrypted=encryptDossier(dossier,key,id);
    await sql`INSERT INTO doctor_private_dossiers (id,network,contract_id,wallet,version,valid_until,commitment,encrypted_dossier,status)
      VALUES (${id},'testnet',${deployment.contractId},${d.wallet},1,${validUntil},${commitment},${encrypted},'prepared')`;
    evidence.entries.push({label:`Test doctor ${i+1}`,id,wallet:d.wallet,commitment,validUntil,status:'prepared'});save(evidence);
  }
  console.log('Three encrypted dossiers prepared in dev database. No private contents written to evidence.');
} else {
  const evidence=JSON.parse(fs.readFileSync(publicFile,'utf8'));
  for(const entry of evidence.entries) {
    const rows=await sql`SELECT * FROM doctor_private_dossiers WHERE id=${entry.id}`;
    if(rows.length!==1)throw Error('Dossier missing');const row=rows[0];
    const d=decryptDossier(row.encrypted_dossier,key,entry.id);
    const digest=commitmentFor(d);
    if(row.wallet!==d.wallet || row.contract_id!==d.contractId || row.network!==d.network || Number(row.version)!==d.version || Number(row.schema_version)!==d.schemaVersion || Number(row.valid_until)!==d.validUntil) throw Error('Database metadata mismatch');
    if(digest!==entry.commitment||digest!==row.commitment||d.wallet!==entry.wallet||d.contractId!==deployment.contractId||d.network!=='testnet'||d.version!==1||d.validUntil!==entry.validUntil)throw Error('Private/public preparation mismatch');
    if(mode==='submit') {
      if(entry.status!=='prepared'||row.status!=='prepared')throw Error('Already attempted; reconcile before retry');
      // Persist attempt first. A timeout must be reconciled, never blindly retried.
      entry.status='submission_pending';save(evidence);
      const r=call('authorize_doctor',['--wallet',entry.wallet,'--commitment',entry.commitment,'--valid_until',String(entry.validUntil)],true);
      const log=(r.stderr??'')+'\n'+(r.stdout??'');const tx=log.match(/Signing transaction: ([a-f0-9]{64})/);
      if(tx)entry.transaction=tx[1];save(evidence);
      fs.writeFileSync(root+entry.id+'-authorization.log',log);
      if(r.status!==0||!entry.transaction)throw Error('Submission uncertain; inspect public log and network');
      await sql`UPDATE doctor_private_dossiers SET status='submitted',transaction_hash=${entry.transaction} WHERE id=${entry.id}`;
      entry.status='submitted';save(evidence);
    } else {
      if(!entry.transaction)throw Error('No transaction to verify');
      entry.receipt=await receipt(entry.transaction);
      const r=call('get_authorization',['--wallet',entry.wallet]);
      if(r.status!==0)throw Error('On-chain read failed');const a=JSON.parse(r.stdout);
      if(a.commitment!==digest||a.version!==d.version||a.schema_version!==d.schemaVersion||Number(a.valid_until)!==d.validUntil||a.revoked!==false)throw Error('On-chain dossier binding mismatch');
      const active=call('is_authorized',['--wallet',entry.wallet]);
      if(active.status!==0||JSON.parse(active.stdout)!==true)throw Error('Doctor not authorized');
      // Demonstrate altered private content cannot match the approved commitment.
      if(commitmentFor({...d,license:d.license+'-changed'})===a.commitment)throw Error('Tampering test failed');
      entry.verification={ciphertextStored:true,decryptionSuccessful:true,commitmentMatches:true,metadataMatches:true,authorized:true,changedDossierRejected:true,checkedAt:new Date().toISOString()};
      entry.status='confirmed';
      await sql`UPDATE doctor_private_dossiers SET status='confirmed' WHERE id=${entry.id}`;save(evidence);
      console.log(JSON.stringify({doctor:entry.label,transaction:'SUCCESS',databaseToChainMatch:true,authorized:true}));
    }
  }
}
