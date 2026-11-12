import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { syntheticPdf } from '../fixtures/clinical-files.mjs';
import { assertClinicalFileStructure, createClinicalFileValidator, CLINICAL_FILE_LIMITS } from './clinical-file-validation.mjs';

const image = async format => sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 220, g: 230, b: 240 } } })[format]().toBuffer();
function pngChunk(type, data) {
  const name=Buffer.from(type),body=Buffer.concat([name,data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
  const length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([length,body,checksum]);
}
function sizedPng(original,size){const length=size-original.length-12;return Buffer.concat([original.subarray(0,-12),pngChunk('tEXt',Buffer.concat([Buffer.from('synthetic\0'),Buffer.alloc(length-10,32)])),original.subarray(-12)]);}
function sizedJpeg(original,size){let remaining=size-original.length;const parts=[original.subarray(0,2)];while(remaining){const total=Math.min(65537,remaining);assert(total>=4);const marker=Buffer.alloc(total,32);marker[0]=255;marker[1]=254;marker.writeUInt16BE(total-2,2);parts.push(marker);remaining-=total;}return Buffer.concat([...parts,original.subarray(2)]);}

for(const format of ['pdf','png','jpeg'])test(`${format}: real decoding preserves originals below and at 3,000,000 bytes; rejects one byte more`,async()=>{
 const type=format==='pdf'?'application/pdf':`image/${format}`;
 const small=format==='pdf'?syntheticPdf():await image(format);
 const exact=format==='pdf'?syntheticPdf('SYNTHETIC SIZE LIMIT',3_000_000):format==='png'?sizedPng(small,3_000_000):sizedJpeg(small,3_000_000);
 for(const content of [small,exact]){const before=Buffer.from(content);await assertClinicalFileStructure({content,mediaType:type});assert.deepEqual(content,before);}
 await assert.rejects(assertClinicalFileStructure({content:Buffer.concat([exact,Buffer.from(' ')]),mediaType:type}),/clinical_file_invalid/);
});
test('framed but structurally corrupt PDF and JPEG are rejected',async()=>{
 for(const [mediaType,content] of [['application/pdf',Buffer.from('%PDF-1.7\nNOT A PDF OBJECT OR PAGE\n%%EOF\n')],['image/jpeg',Buffer.from('ffd8ffe000044a46ffd9','hex')]])
  await assert.rejects(assertClinicalFileStructure({content,mediaType}),/clinical_file_invalid/);
});
test('mismatched declarations and truncated image payloads are rejected',async()=>{
 const png=await image('png'),jpeg=await image('jpeg');
 for(const [mediaType,content] of [['application/pdf',png],['image/png',jpeg],['image/jpeg',png],['image/png',png.subarray(0,-20)],['image/jpeg',jpeg.subarray(0,40)]])
  await assert.rejects(assertClinicalFileStructure({content,mediaType}),/clinical_file_invalid/);
});
test('image exceeding the configured pixel budget is rejected without returning decoded data',async()=>{
 const png=await image('png'),ihdr=Buffer.from(png.subarray(16,29));ihdr.writeUInt32BE(6000,0);ihdr.writeUInt32BE(6000,4);
 const huge=Buffer.concat([png.subarray(0,8),pngChunk('IHDR',ihdr),png.subarray(33)]);
 await assert.rejects(assertClinicalFileStructure({content:huge,mediaType:'image/png'}),/clinical_file_invalid/);
});
test('the already approved PDF remains exactly 964 bytes and is structurally valid',async()=>{
 const content=readFileSync('docs/evidence/sow2-week3-fixtures/aporte-medico-sintetico-v1.pdf');assert.equal(content.length,964);
 await assertClinicalFileStructure({content,mediaType:'application/pdf'});
});
test('worker receives only copied bytes and MIME, empty environment, fixed heap and no inherited exec arguments',async()=>{
 let options;
 const validate=createClinicalFileValidator(value=>{options=value;const worker=new EventEmitter();worker.terminate=async()=>{};queueMicrotask(()=>worker.emit('message',{ok:true}));return worker;});
 const original=syntheticPdf();await validate({content:original,mediaType:'application/pdf'});
 assert.deepEqual(Object.keys(options.workerData).sort(),['content','mediaType']);assert.deepEqual(options.env,{});assert.deepEqual(options.execArgv,[]);
 assert.equal(options.resourceLimits.maxOldGenerationSizeMb,256);assert.equal(original.subarray(0,8).toString(),'%PDF-1.7');
});
test('two slots stay occupied until both workers terminate; a third request cannot start',async()=>{
 const workers=[];const release=[];
 const validate=createClinicalFileValidator(()=>{const w=new EventEmitter();w.terminate=()=>new Promise(ok=>release.push(ok));workers.push(w);return w;});
 const file={content:syntheticPdf(),mediaType:'application/pdf'},one=validate(file),two=validate(file);
 await assert.rejects(validate(file),/clinical_file_validation_busy/);assert.equal(workers.length,2);
 workers[0].emit('message',{ok:true});await Promise.resolve();
 await assert.rejects(validate(file),/clinical_file_validation_busy/);
 release[0]();await one;workers[1].emit('message',{ok:true});await Promise.resolve();release[1]();await two;
});
test('timeout terminates the same worker and recovers its slot',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let terminated=0;
 const validate=createClinicalFileValidator(()=>{const w=new EventEmitter();w.terminate=async()=>{terminated++;};return w;});
 const pending=validate({content:syntheticPdf(),mediaType:'application/pdf'});const result=assert.rejects(pending,/clinical_file_processing_limit/);
 t.mock.timers.tick(CLINICAL_FILE_LIMITS.timeoutMs);await result;assert.equal(terminated,1);
});
test('worker startup failure, crash or malformed reply fails closed and releases its slot',async()=>{
 for(const mode of ['startup','error','exit','reply']){
  const validate=createClinicalFileValidator(()=>{if(mode==='startup')throw Error('synthetic failure');const w=new EventEmitter();w.terminate=async()=>{};
   queueMicrotask(()=>mode==='error'?w.emit('error',Error('PRIVATE DECODER DETAIL')):mode==='exit'?w.emit('exit',0):w.emit('message',{ok:true,content:'PRIVATE'}));return w;});
  for(let repeat=0;repeat<3;repeat++)await assert.rejects(validate({content:syntheticPdf(),mediaType:'application/pdf'}));
 }
});
