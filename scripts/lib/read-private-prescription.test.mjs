import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptPrescription, prescriptionCommitment} from './private-prescription.mjs';
import {readPrivatePrescription} from './read-private-prescription.mjs';

function fixture() {
  const key='a'.repeat(64);
  const doc={schemaVersion:1, network:'testnet',contractId:'contract-fixture',doctor:'doctor-fixture',
    patient:'patient-fixture',issuanceId:'1'.repeat(64),expiresAt:100,document:{medication:'SYNTHETIC ONLY'},blinding:'2'.repeat(64)};
  const row={id:'private-id',network:doc.network,contractId:doc.contractId,patient:doc.patient,doctor:doc.doctor,
    issuanceId:doc.issuanceId,expiresAt:100,commitment:prescriptionCommitment(doc),state:'confirmed',rxId:'1'};
  row.ciphertext=encryptPrescription(doc,key,JSON.stringify(['TrustLeaf/PrivatePrescriptionStorage/v1',row.id,row.network,row.contractId]));
  const binding={user_id:'verified-patient',email:'synthetic@example.test',wallet:doc.patient,role:'patient',
    revoked_at:null,verified_at:new Date(Date.now()-1000).toISOString(),verification_reference:'signed-challenge'};
  const rx={id:1n,patient:row.patient,doctor:row.doctor,schema_version:1,expires_at:100n,commitment:Buffer.from(row.commitment,'hex')};
  let loads=0;
  const adapters={key,authenticate:async token=>token==='valid'?{userId:binding.user_id,email:binding.email}:null,
    findBinding:async()=>binding,loadRecord:async(id,wallet)=>{loads++;assert.equal(wallet,binding.wallet);return row;},
    readChain:async()=>rx};
  return {row,rx,binding,adapters,loads:()=>loads};
}
const request={credential:'valid',id:'private-id'};
test('patient retrieves only clinical document after private/public integrity verification',async()=>{
  const f=fixture();const result=await readPrivatePrescription(request,f.adapters);
  assert.deepEqual(result,{id:'private-id',rxId:'1',document:{medication:'SYNTHETIC ONLY'}});
  assert.equal(f.loads(),1);
});
test('invalid credential and revoked or mismatched identity stop before reading ciphertext',async()=>{
  for(const mutation of [f=>f.adapters.authenticate=async()=>null,f=>f.binding.revoked_at=new Date(),
    f=>f.adapters.authenticate=async()=>({userId:'other',email:f.binding.email}),f=>f.binding.role='doctor',
    f=>f.binding.verified_at='invalid',f=>f.binding.verification_reference='']) {
    const f=fixture();mutation(f);await assert.rejects(()=>readPrivatePrescription(request,f.adapters));assert.equal(f.loads(),0);
  }
});
test('wrong recipient, swapped chain context, unconfirmed issuance and altered ciphertext fail closed',async()=>{
  for(const mutation of [f=>f.row.patient='other',f=>f.rx.patient='other',f=>f.rx.doctor='other',
    f=>f.rx.id=2n,f=>f.rx.commitment=Buffer.alloc(32),f=>f.row.state='prepared',
    f=>f.row.network='mainnet',f=>f.row.contractId='other',f=>f.row.issuanceId='3'.repeat(64),
    f=>f.row.ciphertext='invalid',f=>f.adapters.key=undefined]) {
    const f=fixture();mutation(f);await assert.rejects(()=>readPrivatePrescription(request,f.adapters),/private_prescription_unavailable/);
  }
});
