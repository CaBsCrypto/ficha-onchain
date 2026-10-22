// Independent, read-only completion audit. No transaction submission or DB writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Pool,neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
import {rpc,Networks,TransactionBuilder,Keypair,scValToNative,Address,Account,BASE_FEE,Contract} from '@stellar/stellar-sdk';
import {decryptPrescription,prescriptionCommitment} from './lib/private-prescription.mjs';
import {decryptDossier,commitmentFor} from './lib/private-doctor-dossier.mjs';
import {bytes,u64,address} from './lib/testnet-evidence-chain.mjs';
const dir='docs/evidence/testnet-generation-2026-09-07';
const e=JSON.parse(fs.readFileSync(dir+'/private-flow-verification.json'));
const deployment=JSON.parse(fs.readFileSync(dir+'/prescription-booking-deployment.json'));
const config={};for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){
  const m=line.match(/^(DATABASE_URL|TRUSTLEAF_DATA_KEY)=(.*)$/);if(m)config[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');
}
assert.match(new URL(config.DATABASE_URL).hostname,/^ep-lingering-water-ahzh89z5(?:-pooler)?\./);
assert.equal(e.network,'testnet');assert.equal(e.contractId,deployment.contractId);
neonConfig.webSocketConstructor=ws;const pool=new Pool({connectionString:config.DATABASE_URL});
const server=new rpc.Server('https://soroban-testnet.stellar.org');
const checks=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
async function simulate(method,args,id=e.contractId){
  const tx=new TransactionBuilder(new Account(e.doctor,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET})
    .addOperation(new Contract(id).call(method,...args)).setTimeout(60).build();return server.simulateTransaction(tx);
}
async function read(method,args,id){const r=await simulate(method,args,id);assert.ok(rpc.Api.isSimulationSuccess(r));return scValToNative(r.result.retval);}
const receiptAudit=[];
try {
  const row=(await pool.query('SELECT * FROM private_prescriptions WHERE id=$1',[e.prescription.id])).rows[0];assert.ok(row);
  const booking=(await pool.query('SELECT * FROM prescription_booking_requests WHERE appointment_id=$1',[row.appointment_id])).rows[0];
  const appointment=(await pool.query('SELECT * FROM appointments WHERE id=$1',[row.appointment_id])).rows[0];
  const bindings=(await pool.query('SELECT * FROM stellar_verified_bindings WHERE wallet=ANY($1::text[])',[[e.doctor,e.patient]])).rows;
  check('database_same_issuance_and_participants',row.issuance_id===booking.issuance_id&&row.patient_wallet===booking.patient_wallet&&row.doctor_wallet===booking.doctor_wallet&&row.contract_id===e.contractId&&row.state==='confirmed'&&booking.state==='consumed'&&appointment.patient_email===booking.patient_email&&appointment.doctor_email===booking.doctor_email);
  for(const binding of bindings){
    const c=(await pool.query('SELECT * FROM stellar_binding_challenges WHERE id=$1',[binding.verification_reference])).rows[0];
    check('binding_signature_'+binding.role,Boolean(c?.consumed_at)&&!binding.revoked_at&&c.user_id===binding.user_id&&c.email===binding.email&&c.wallet===binding.wallet&&Keypair.fromPublicKey(binding.wallet).verify(Buffer.from(c.message),Buffer.from(c.verified_signature,'base64')));
  }
  check('both_bindings_present',bindings.length===2);
  const doc=decryptPrescription(row.ciphertext,config.TRUSTLEAF_DATA_KEY,JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1',row.id,row.network,row.contract_id]));
  const rx=await read('get_prescription',[u64(row.rx_id)]);
  check('ciphertext_to_chain_integrity',prescriptionCommitment(doc)===row.commitment&&Buffer.from(rx.commitment).toString('hex')===row.commitment&&rx.patient===doc.patient&&rx.doctor===doc.doctor&&doc.contractId===row.contract_id&&doc.issuanceId===booking.issuance_id);
  const d=(await pool.query('SELECT * FROM doctor_private_dossiers WHERE id=$1',[e.dossierId])).rows[0];
  const authorization=await read('get_authorization',[address(e.doctor)],deployment.registry);
  check('doctor_still_authorized_with_private_dossier',await read('is_authorized',[address(e.doctor)],deployment.registry)===true&&Buffer.from(authorization.commitment).toString('hex')===commitmentFor(decryptDossier(d.encrypted_dossier,config.TRUSTLEAF_DATA_KEY,d.id)));
  const expected=[
    ['doctorApproval',e.transactions.doctorApproval.hash,deployment.admin,deployment.registry,'authorize_doctor',[e.doctor,Buffer.from(d.commitment,'hex'),BigInt(d.valid_until)]],
    ['booking',booking.attestation_hash,deployment.bookingAuthority,e.contractId,'attest_booking',[e.doctor,e.patient,Buffer.from(row.issuance_id,'hex'),BigInt(booking.valid_until)]],
    ['consent',e.transactions.consent.hash,e.patient,e.contractId,'authorize_prescriber',[e.patient,e.doctor,Buffer.from(row.issuance_id,'hex'),BigInt(booking.valid_until)]],
    ['mint',row.transaction_hash,e.doctor,e.contractId,'mint_prescription',[e.doctor,e.patient,Buffer.from(row.issuance_id,'hex'),Buffer.from(row.commitment,'hex'),BigInt(row.expires_at)]],
  ];
  for(const [name,hash,signer,contractId,method,args] of expected){
    const receipt=await server.getTransaction(hash);assert.equal(receipt.status,'SUCCESS');
    const tx=TransactionBuilder.fromXDR(receipt.envelopeXdr,Networks.TESTNET),inner=tx.innerTransaction;
    assert.equal(tx.hash().toString('hex'),hash);assert.equal(inner.source,signer);
    assert.ok(inner.signatures.some(s=>Keypair.fromPublicKey(signer).verify(inner.hash(),s.signature())));
    assert.equal(inner.operations.length,1);const fn=inner.operations[0].func.invokeContract();
    assert.equal(Address.fromScAddress(fn.contractAddress()).toString(),contractId);
    assert.equal(fn.functionName().toString(),method);assert.deepEqual(fn.args().map(scValToNative),args);
    check('confirmed_signature_and_exact_public_arguments_'+name,true);
    receiptAudit.push({name,hash,ledger:receipt.ledger,signer,method,status:'SUCCESS'});
  }
  // Fresh IDs avoid duplicate checks masking authorization failures.
  const nonce='f'.repeat(64),wrong=Keypair.random().publicKey();
  const badDoctor=await simulate('mint_prescription',[address(wrong),address(e.patient),bytes(nonce),bytes(row.commitment),u64(Math.floor(Date.now()/1000)+600)]);
  check('unauthorized_doctor_rejected',rpc.Api.isSimulationError(badDoctor)&&badDoctor.error.includes('#1'));
  const badPatient=await simulate('mint_prescription',[address(e.doctor),address(wrong),bytes(nonce),bytes(row.commitment),u64(Math.floor(Date.now()/1000)+600)]);
  check('patient_without_consent_rejected',rpc.Api.isSimulationError(badPatient)&&badPatient.error.includes('#7'));
  fs.writeFileSync(dir+'/private-flow-completion-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),network:'testnet',syntheticOnly:true,checks,receiptAudit,status:'passed',scope:'Service CLI E2E with synthetic enrollment; not browser/Privy or production readiness'},null,2)+'\n');
} finally {await pool.end();}
