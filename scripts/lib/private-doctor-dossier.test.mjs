import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitmentFor, encryptDossier, decryptDossier } from './private-doctor-dossier.mjs';
const d={schemaVersion:1,network:'testnet',contractId:'contract',wallet:'wallet',version:1,validUntil:100,fullName:'TEST',license:'TEST',specialty:'TEST',verificationSource:'test',reviewedBy:'test',reviewedAt:'test',blinding:'a'.repeat(64)};
test('commitment binds every approved field and its domain',()=>{
  const expected=commitmentFor(d);
  assert.throws(()=>commitmentFor({...d,uncommittedField:'hidden'}));
  for(const k of Object.keys(d).filter(k=>k!=='schemaVersion')) {
    const changed={...d,[k]:typeof d[k]==='number'?d[k]+1:k==='blinding'?'b'.repeat(64):d[k]+'x'};
    assert.notEqual(commitmentFor(changed),expected,k);
  }
});
test('encrypted dossier roundtrip; rejects missing key and swapped context',()=>{
  const key='1'.repeat(64);const encrypted=encryptDossier(d,key,'row-1');
  assert.deepEqual(decryptDossier(encrypted,key,'row-1'),d);
  assert.throws(()=>encryptDossier(d,undefined,'row-1'));
  assert.throws(()=>decryptDossier(encrypted,key,'row-2'));
  assert.throws(()=>decryptDossier(encrypted,'2'.repeat(64),'row-1'));
  const parts=encrypted.split(':');const bytes=Buffer.from(parts[4],'base64');bytes[0]^=1;parts[4]=bytes.toString('base64');
  assert.throws(()=>decryptDossier(parts.join(':'),key,'row-1'));
});
