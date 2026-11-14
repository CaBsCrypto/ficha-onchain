// Service-to-service E2E with synthetic enrollment, real signatures, Neon dev,
// real Testnet receipts and encrypted custody. Does not claim browser/Privy E2E.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {Pool,neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
import {Keypair,Networks,TransactionBuilder,rpc} from '@stellar/stellar-sdk';
import {secureStoreSigner,createChain,createStore,runOnce} from './worker-prescription-bookings.mjs';
import {testnetEvidenceChain,address,bytes,u64} from './lib/testnet-evidence-chain.mjs';
import {preparePrivatePrescription,privateReadAdapters} from './lib/private-prescription-store.mjs';
import {readPrivatePrescription} from './lib/read-private-prescription.mjs';
import {commitmentFor,encryptDossier,decryptDossier} from './lib/private-doctor-dossier.mjs';

if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const config={};for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) {
  const m=line.match(/^([A-Z_0-9]+)=(.*)$/);if(m)config[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');
}
if(!/^ep-lingering-water-ahzh89z5(?:-pooler)?\./.test(new URL(config.DATABASE_URL).hostname))throw Error('dev_database_required');
if(!/^[0-9a-f]{64}$/i.test(config.TRUSTLEAF_DATA_KEY??''))throw Error('encryption_key_required');
const directory='docs/evidence/testnet-generation-2026-09-07';
const deployment=JSON.parse(fs.readFileSync(directory+'/prescription-booking-deployment.json'));
assert.equal(deployment.network,'testnet');
const doctor=Keypair.fromSecret(config.DEMO_DOCTOR_SECRET),patient=Keypair.fromSecret(config.DEMO_PATIENT_SECRET);
const relayer=Keypair.fromSecret(config.RELAYER_SECRET);
const file=directory+'/private-flow-verification.json';
const evidence=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{run:randomUUID(),network:'testnet',syntheticOnly:true,
  contractId:deployment.contractId,doctor:doctor.publicKey(),patient:patient.publicKey(),transactions:{},checks:{},
  scope:'CLI service E2E; synthetic enrollment; real SQL, Ed25519 and Testnet; no browser or Privy login'};
assert.equal(evidence.contractId,deployment.contractId);assert.equal(evidence.doctor,doctor.publicKey());assert.equal(evidence.patient,patient.publicKey());
const save=()=>fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');save();
const check=(name,ok)=>{assert.ok(ok,name);evidence.checks[name]={passed:true,at:new Date().toISOString()};save();console.log('PASS '+name);};
const actor={userId:'did:test:'+evidence.run+':patient',email:evidence.run+'-patient@example.test'};
const clinician={userId:'did:test:'+evidence.run+':doctor',email:evidence.run+'-doctor@example.test'};
const adminSign=secureStoreSigner({alias:'trustleaf-testnet-admin-20260907',configDir:'C:/Users/MGC/.config/stellar'});
const sign=async(wallet,xdr)=>{
  if(wallet===deployment.admin)return adminSign(xdr);
  const key=[doctor,patient].find(k=>k.publicKey()===wallet);if(!key)throw Error('unknown_fixture');
  const tx=TransactionBuilder.fromXDR(xdr,Networks.TESTNET);tx.sign(key);return tx.toXDR();
};
const chain=testnetEvidenceChain({source:doctor.publicKey(),relayer,sign,transactions:evidence.transactions,save});
neonConfig.webSocketConstructor=ws;
const pool=new Pool({connectionString:config.DATABASE_URL});const client=await pool.connect();
const sql=Object.assign(async(strings,...values)=>(await client.query(strings.reduce((out,s,i)=>out+s+(i<values.length?'$'+(i+1):''),''),values)).rows,
  {query:async(q,v)=>(await client.query(q,v)).rows});
const temp=path.resolve('scripts','.private-flow-'+evidence.run);fs.mkdirSync(temp,{recursive:true});
function compile(source,name){
  let code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code=code.replace('"@/lib/prescription-booking"','"./booking.mjs"');const f=path.join(temp,name);fs.writeFileSync(f,code);return pathToFileURL(f).href;
}
const {preparePrescriptionBooking}=await import(compile('src/lib/prescription-booking.ts','booking.mjs'));
const {createWalletChallenge,completeWalletChallenge}=await import(compile('src/lib/stellar-wallet-binding.ts','binding.mjs'));
process.env.PRESCRIPTION_PRIVATE_CONTRACT_ID=deployment.contractId;
async function bind(subject,key,role){
  const existing=(await client.query('SELECT * FROM stellar_verified_bindings WHERE wallet=$1',[key.publicKey()])).rows[0];
  if(existing){assert.equal(existing.user_id,subject.userId,'Existing wallet binding must not be reassigned');return;}
  const challenge=await createWalletChallenge(sql,subject,key.publicKey(),role);
  await completeWalletChallenge(sql,subject,challenge.challengeId,key.sign(Buffer.from(challenge.message)).toString('base64'));
}
try {
  const lock=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',['trustleaf-booking:'+deployment.bookingAuthority]);
  assert.equal(lock.rows[0].locked,true);
  check('private_contract_configuration',await chain.read(deployment.contractId,'get_registry')===deployment.registry && await chain.read(deployment.contractId,'get_booking_authority')===deployment.bookingAuthority);
  await bind(actor,patient,'patient');await bind(clinician,doctor,'doctor');check('signed_wallet_bindings',true);
  if(!evidence.dossierId){evidence.dossierId=randomUUID();save();}
  let dossier=(await client.query('SELECT * FROM doctor_private_dossiers WHERE id=$1',[evidence.dossierId])).rows[0];
  if(!dossier){
    const d={schemaVersion:1,network:'testnet',contractId:deployment.registry,wallet:doctor.publicKey(),version:1,validUntil:Math.floor(Date.now()/1000)+86400,
      fullName:'SYNTHETIC E2E DOCTOR',license:'TEST ONLY',specialty:'TEST ONLY',verificationSource:'Synthetic fixture reviewed for technical demonstration only',
      reviewedBy:'TrustLeaf Testnet validation',reviewedAt:new Date().toISOString(),blinding:randomBytes(32).toString('hex')};
    const encrypted=encryptDossier(d,config.TRUSTLEAF_DATA_KEY,evidence.dossierId),commitment=commitmentFor(d);
    await client.query(`INSERT INTO doctor_private_dossiers(id,network,contract_id,wallet,version,valid_until,commitment,encrypted_dossier,status)
      VALUES($1,'testnet',$2,$3,1,$4,$5,$6,'prepared')`,[evidence.dossierId,deployment.registry,doctor.publicKey(),d.validUntil,commitment,encrypted]);
    dossier=(await client.query('SELECT * FROM doctor_private_dossiers WHERE id=$1',[evidence.dossierId])).rows[0];
  }
  await chain.send('doctorApproval',deployment.registry,'authorize_doctor',[address(doctor.publicKey()),bytes(dossier.commitment),u64(dossier.valid_until)],deployment.admin);
  const approved=await chain.read(deployment.registry,'get_authorization',[address(doctor.publicKey())]);
  check('trustleaf_signed_encrypted_dossier_matches',Buffer.from(approved.commitment).toString('hex')===commitmentFor(decryptDossier(dossier.encrypted_dossier,config.TRUSTLEAF_DATA_KEY,evidence.dossierId)) && await chain.read(deployment.registry,'is_authorized',[address(doctor.publicKey())])===true);
  await client.query("UPDATE doctor_private_dossiers SET status='confirmed',transaction_hash=$2 WHERE id=$1",[evidence.dossierId,evidence.transactions.doctorApproval.hash]);
  if(!evidence.appointmentId){
    const r=await client.query(`INSERT INTO appointments(doctor_email,patient_email,patient_name,date,time_slot,status,started_at)
      VALUES($1,$2,'SYNTHETIC E2E PATIENT',(NOW() AT TIME ZONE 'America/Santiago')::date,$3,'in_progress',NOW()) RETURNING id`,[clinician.email,actor.email,'e2e-'+evidence.run]);
    evidence.appointmentId=r.rows[0].id;save();
  }
  if(!evidence.booking){evidence.booking=await preparePrescriptionBooking(sql,actor,evidence.appointmentId);save();}
  const other={userId:'did:test:other',email:'other@example.test'};
  await assert.rejects(()=>preparePrescriptionBooking(sql,other,evidence.appointmentId));check('other_patient_cannot_prepare_booking',true);
  // Do not pick up unrelated jobs in the shared database during this fixture run.
  const unrelated=await client.query("SELECT appointment_id FROM prescription_booking_requests WHERE contract_id=$1 AND state IN ('prepared','submitted','cancel_requested') AND appointment_id<>$2",[deployment.contractId,evidence.appointmentId]);
  assert.equal(unrelated.rows.length,0,'Unrelated pending jobs must not be processed');
  const workerChain=createChain({authority:deployment.bookingAuthority,relayer,signXdr:adminSign});
  for(let attempt=0;attempt<20;attempt++) {
    const current=(await client.query('SELECT * FROM prescription_booking_requests WHERE appointment_id=$1',[evidence.appointmentId])).rows[0];
    if(['confirmed','consumed'].includes(current.state)){evidence.attestationHash=current.attestation_hash;save();break;}
    const result=await runOnce({store:createStore(client,deployment.contractId),chain:workerChain});
    if(result.status==='needs_reconciliation')throw Error('worker_requires_reconciliation');
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.ok(evidence.attestationHash);check('database_booking_attested', (await chain.server.getTransaction(evidence.attestationHash)).status==='SUCCESS');
  if(!evidence.prescription){
    const previous=(await client.query('SELECT id FROM private_prescriptions WHERE appointment_id=$1',[evidence.appointmentId])).rows[0];
    assert.ok(!previous,'Prepared document requires explicit reconciliation');
    evidence.prescription=await preparePrivatePrescription(client,{actor:clinician,appointmentId:evidence.appointmentId,
      document:{medication:'SYNTHETIC E2E ONLY',dosage:'TEST DATA - NOT FOR USE',patientLabel:'SYNTHETIC E2E PATIENT'},expiresAt:Math.floor(Date.now()/1000)+3600,key:config.TRUSTLEAF_DATA_KEY});save();
  }
  const p=evidence.prescription,b=evidence.booking;
  const mintArgs=[address(p.doctor),address(p.patient),bytes(p.issuanceId),bytes(p.commitment),u64(p.expiresAt)];
  if(!evidence.transactions.consent){
    const rejected=await chain.simulate(deployment.contractId,'mint_prescription',mintArgs);
    check('missing_consent_rejected',rpc.Api.isSimulationError(rejected)&&rejected.error.includes('#7'));
  }
  await chain.send('consent',deployment.contractId,'authorize_prescriber',[address(p.patient),address(p.doctor),bytes(p.issuanceId),u64(b.validUntil)],patient.publicKey());
  const rxId=await chain.send('mint',deployment.contractId,'mint_prescription',mintArgs,doctor.publicKey());
  const rx=await chain.read(deployment.contractId,'get_prescription',[u64(rxId)]);
  check('issued_to_bound_patient_with_stored_commitment',rx.patient===p.patient&&rx.doctor===p.doctor&&Buffer.from(rx.commitment).toString('hex')===p.commitment);
  await client.query("UPDATE private_prescriptions SET state='confirmed',rx_id=$2,transaction_hash=$3 WHERE id=$1",[p.id,String(rxId),evidence.transactions.mint.hash]);
  const booking=await chain.read(deployment.contractId,'get_booking',[bytes(p.issuanceId)]);
  check('same_booking_consumed',booking.status[0]==='Consumed'&&booking.patient===p.patient&&booking.doctor===p.doctor);
  await client.query("UPDATE prescription_booking_requests SET state='consumed' WHERE appointment_id=$1",[evidence.appointmentId]);
  // Fresh, single-use possession proof for this read. Fixture enrollment maps
  // this wallet to the synthetic actor; it is not a fabricated Privy token.
  const challenge=JSON.stringify({domain:'TrustLeaf/SyntheticPrivateRead/v1',id:p.id,nonce:randomBytes(32).toString('hex')});let used=false;
  const authenticate=async signature=>{
    if(used||!patient.verify(Buffer.from(challenge),Buffer.from(signature,'base64')))return null;used=true;return actor;
  };
  const adapters={...privateReadAdapters(client),authenticate,key:config.TRUSTLEAF_DATA_KEY,
    readChain:(id,rx)=>chain.read(id,'get_prescription',[u64(rx)])};
  const credential=patient.sign(Buffer.from(challenge)).toString('base64');
  const recovered=await readPrivatePrescription({credential,id:p.id},adapters);
  check('patient_decrypts_own_prescription',recovered.document.medication==='SYNTHETIC E2E ONLY');
  await assert.rejects(()=>readPrivatePrescription({credential,id:p.id},adapters));check('read_proof_replay_rejected',true);
  await assert.rejects(()=>readPrivatePrescription({credential:'test',id:p.id},{...adapters,authenticate:async()=>other}));check('unrelated_identity_cannot_read',true);
  const stored=(await client.query('SELECT ciphertext FROM private_prescriptions WHERE id=$1',[p.id])).rows[0].ciphertext;
  check('database_contains_ciphertext',!stored.includes('SYNTHETIC E2E ONLY'));
  const duplicate=await chain.simulate(deployment.contractId,'mint_prescription',mintArgs);
  check('same_issuance_replay_rejected',rpc.Api.isSimulationError(duplicate)&&duplicate.error.includes('#4'));
  evidence.status='service_flow_confirmed';save();
} catch(error) {
  evidence.status='incomplete';evidence.failure={name:error.name,message:error instanceof assert.AssertionError?'assertion_failed':String(error.message).slice(0,100)};save();
  // No provider errors, credentials or clinical payloads in console output.
  console.error('Private flow stopped; inspect redacted evidence and reconcile saved hashes.');process.exitCode=1;
} finally {
  await client.query('SELECT pg_advisory_unlock_all()');client.release();await pool.end();
  for(const name of ['booking.mjs','binding.mjs'])fs.unlinkSync(path.join(temp,name));fs.rmdirSync(temp);
}
