// Contract-level synthetic Testnet evidence, not an end-to-end appointment API test.
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, nativeToScVal, rpc, scValToNative, TransactionBuilder, xdr } from '@stellar/stellar-sdk';
if(!process.argv.includes('--run'))throw Error('Explicit --run required; Testnet writes');
const dir='docs/evidence/testnet-generation-2026-09-07';
const deployment=JSON.parse(fs.readFileSync(dir+'/prescription-booking-deployment.json','utf8'));
if(deployment.network!=='testnet'||!/^C[A-Z2-7]{55}$/.test(deployment.contractId??''))throw Error('Testnet deployment required');
const config={};for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){
 const m=line.match(/^(DEMO_PATIENT_SECRET|RELAYER_SECRET)=(.*)$/);if(m)config[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');
}
const patient=Keypair.fromSecret(config.DEMO_PATIENT_SECRET),relayer=Keypair.fromSecret(config.RELAYER_SECRET);
const fixture=JSON.parse(fs.readFileSync(dir+'/three-test-doctors.json','utf8'))[0];
const server=new rpc.Server('https://soroban-testnet.stellar.org');const contract=new Contract(deployment.contractId);
const file=dir+'/prescription-booking-verification.json';
const evidence=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{network:'testnet',contractId:deployment.contractId,doctor:fixture.wallet,patient:patient.publicKey(),feeSource:relayer.publicKey(),scope:'contract-only synthetic booking attestation, no appointment API evidence',nonce:randomBytes(32).toString('hex'),cancelNonce:randomBytes(32).toString('hex'),commitment:randomBytes(32).toString('hex'),expiry:Math.floor(Date.now()/1000)+3600,transactions:{},checks:{}};
if(evidence.contractId!==deployment.contractId)throw Error('Evidence deployment mismatch');
const save=()=>fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n');
const addr=a=>new Address(a).toScVal(),bytes=h=>xdr.ScVal.scvBytes(Buffer.from(h,'hex')),num=n=>nativeToScVal(BigInt(n),{type:'u64'});
const args=n=>[addr(fixture.wallet),addr(patient.publicKey()),bytes(n),bytes(evidence.commitment),num(evidence.expiry)];
function check(name,passed){if(!passed)throw Error('Failed check: '+name);evidence.checks[name]={passed:true,at:new Date().toISOString()};save();console.log('PASS '+name);}
async function simulate(method,a=[]){const tx=new TransactionBuilder(new Account(fixture.wallet,'0'),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(contract.call(method,...a)).setTimeout(60).build();return server.simulateTransaction(tx);}
async function read(method,a=[]){const s=await simulate(method,a);if(rpc.Api.isSimulationError(s))throw Error('Read failed '+method);return scValToNative(s.result.retval);}
async function reject(name,nonce,code){const s=await simulate('mint_prescription',args(nonce));check(name,rpc.Api.isSimulationError(s)&&s.error.includes('#'+code));evidence.checks[name].kind='RPC simulation rejection, not submitted transaction';save();}
async function send(name,method,a,actor){
 let hash=evidence.transactions[name]?.hash;
 if(!hash){
  const source=actor==='patient'?patient.publicKey():actor==='doctor'?fixture.wallet:deployment.admin;
  const unsigned=new TransactionBuilder(await server.getAccount(source),{fee:BASE_FEE,networkPassphrase:Networks.TESTNET}).addOperation(contract.call(method,...a)).setTimeout(180).build();
  let prepared=await server.prepareTransaction(unsigned);
  if(actor==='patient')prepared.sign(patient);
  else {const alias=actor==='doctor'?fixture.alias:'trustleaf-testnet-admin-20260907';const signed=spawnSync('stellar',['tx','sign','--network','testnet','--config-dir','C:\\Users\\MGC\\.config\\stellar','--sign-with-key',alias],{input:prepared.toXDR(),encoding:'utf8',windowsHide:true});if(signed.status!==0)throw Error('Secure-store signing failed');prepared=TransactionBuilder.fromXDR(signed.stdout.trim(),Networks.TESTNET);}
  const bumped=TransactionBuilder.buildFeeBumpTransaction(relayer,'2000000',prepared,Networks.TESTNET);bumped.sign(relayer);hash=bumped.hash().toString('hex');
  evidence.transactions[name]={hash,method,status:'SUBMITTING',source,feeSource:relayer.publicKey()};save();
  const response=await server.sendTransaction(bumped);if(response.status==='ERROR')throw Error('Submission rejected; reconcile saved hash');
 }
 for(let i=0;i<30;i++){
  const result=await server.getTransaction(hash);
  if(result.status==='SUCCESS'){
   const envelope=TransactionBuilder.fromXDR(result.envelopeXdr,Networks.TESTNET);
   if(envelope.feeSource!==relayer.publicKey())throw Error('Fee source mismatch');
   evidence.transactions[name].status='SUCCESS';evidence.transactions[name].ledger=result.ledger;
   evidence.transactions[name].envelopeXdr=result.envelopeXdr.toXDR('base64');
   const value=scValToNative(result.returnValue);evidence.transactions[name].result=typeof value==='bigint'?value.toString():value;save();return value;
  }
  if(result.status==='FAILED')throw Error('Failed transaction');await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('Uncertain result; keep saved transaction hash');
}
save();
check('interface_v2',await read('interface_version')===2);
check('explicit_booking_authority',await read('get_booking_authority')===deployment.bookingAuthority);
const consent=n=>[addr(patient.publicKey()),addr(fixture.wallet),bytes(n),num(evidence.expiry)];
const attestation=n=>[addr(fixture.wallet),addr(patient.publicKey()),bytes(n),num(evidence.expiry)];
await send('consent','authorize_prescriber',consent(evidence.nonce),'patient');
if(!evidence.transactions.attest)await reject('no_booking_rejected',evidence.nonce,8);
await send('attest','attest_booking',attestation(evidence.nonce),'authority');
const id=await send('mint','mint_prescription',args(evidence.nonce),'doctor');
const rx=await read('get_prescription',[num(id)]);
check('correct_issuer_and_recipient',rx.doctor===fixture.wallet&&rx.patient===patient.publicKey());
check('private_commitment_matches',Buffer.from(rx.commitment).toString('hex')===evidence.commitment);
check('booking_consumed',(await read('get_booking',[bytes(evidence.nonce)])).status[0]==='Consumed');
await reject('duplicate_rejected',evidence.nonce,4);
await send('cancelConsent','authorize_prescriber',consent(evidence.cancelNonce),'patient');
await send('cancelAttest','attest_booking',attestation(evidence.cancelNonce),'authority');
await send('cancelBooking','revoke_booking',[bytes(evidence.cancelNonce)],'authority');
// Different commitment prevents document duplicate check from hiding reservation rejection.
const oldCommitment=evidence.commitment;evidence.commitment=randomBytes(32).toString('hex');
try{await reject('revoked_booking_rejected',evidence.cancelNonce,8);}finally{evidence.commitment=oldCommitment;save();}
