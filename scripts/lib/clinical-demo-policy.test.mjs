import test from 'node:test';
import assert from 'node:assert/strict';
import { requireClinicalDoctorWindow, requireClinicalRunAvailable, requireClinicalBalance } from './clinical-demo-policy.mjs';
import { syntheticClinicalPdf, syntheticClinicalImage } from './clinical-fixtures.mjs';
import { inflateSync } from 'node:zlib';
test('expired, revoked, unknown and short-lived authorizations stop new execution', () => {
  for (const [allowed, record] of [[false, {valid_until:10000,revoked:false}],[true,{valid_until:10000,revoked:true}],
    [true,{valid_until:1899,revoked:false}],[true,{valid_until:'bad',revoked:false}]])
    assert.throws(() => requireClinicalDoctorWindow(allowed, record, 1000), /clinical_doctor_not_ready/);
  assert.doesNotThrow(() => requireClinicalDoctorWindow(true,{valid_until:1900,revoked:false},1000));
});
test('unresolved foreign and unsigned attempts block a new run; only own signed recovery is allowed', () => {
  assert.throws(() => requireClinicalRunAvailable('a',[{run_id:'b',state:'submitted'}],[]));
  assert.throws(() => requireClinicalRunAvailable('a',[{run_id:'a',state:'prepared'}],[]));
  assert.throws(() => requireClinicalRunAvailable('a',[],[{}]));
  assert.doesNotThrow(() => requireClinicalRunAvailable('a',[{run_id:'a',state:'submitted'}],[]));
});
test('wrong account, malformed balances and insufficient funds stop preparation', () => {
  for (const balance of ['NaN', 'Infinity', '-1', '4.9999999', undefined])
    assert.throws(() => requireClinicalBalance({account_id:'doctor',balances:[{asset_type:'native',balance}]},'doctor'));
  assert.throws(() => requireClinicalBalance({account_id:'other',balances:[{asset_type:'native',balance:'1000'}]},'doctor'));
  assert.doesNotThrow(() => requireClinicalBalance({account_id:'doctor',balances:[{asset_type:'native',balance:'5.0000000'}]},'doctor'));
});
test('PDF fixtures have valid object offsets and preserve original/corrected distinct bytes', () => {
  const first=syntheticClinicalPdf(1),second=syntheticClinicalPdf(2);
  assert.notDeepEqual(first,second);assert(first.length<3000000);assert(second.length<3000000);
  const text=second.toString();const offset=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(offset,offset+4),'xref');
  const entries=[...text.matchAll(/(\d{10}) 00000 n/g)].map(m=>Number(m[1]));
  entries.forEach((position,i)=>assert(text.slice(position).startsWith(`${i+1} 0 obj`)));
});
test('image fixture decodes to a legible-sized RGB raster below the upload limit', () => {
  const png=syntheticClinicalImage();assert(png.length<3000000);assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),650);
  let pos=8;const compressed=[];while(pos<png.length){const length=png.readUInt32BE(pos);if(png.toString('ascii',pos+4,pos+8)==='IDAT')compressed.push(png.subarray(pos+8,pos+8+length));pos+=12+length;}
  assert.equal(inflateSync(Buffer.concat(compressed)).length,(1200*3+1)*650);
});
