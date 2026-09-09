import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prescriptionCommitment,encryptPrescription,decryptPrescription} from './private-prescription.mjs';
test('private clinical document is encrypted and bound to public issuance context',()=>{
  const d={schemaVersion:1,network:'testnet',contractId:'test',doctor:'doctor',patient:'patient',issuanceId:'a'.repeat(64),expiresAt:100,document:{medication:'TEST',dosage:'TEST',quantity:1},blinding:'b'.repeat(64)};
  const hash=prescriptionCommitment(d);
  assert.equal(hash,prescriptionCommitment({...d,document:{quantity:1,dosage:'TEST',medication:'TEST'}}));
  for(const change of [{patient:'other'},{doctor:'other'},{contractId:'other'},{network:'other'},{expiresAt:101},{issuanceId:'c'.repeat(64)},{blinding:'c'.repeat(64)},{document:{...d.document,quantity:2}}])assert.notEqual(hash,prescriptionCommitment({...d,...change}));
  const encrypted=encryptPrescription(d,'1'.repeat(64),'rx-1');assert.deepEqual(decryptPrescription(encrypted,'1'.repeat(64),'rx-1'),d);
  assert.throws(()=>encryptPrescription(d,undefined,'rx-1'));
});
