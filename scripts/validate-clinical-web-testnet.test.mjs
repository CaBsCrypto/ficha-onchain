import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clinicalAuthWaitMs } from './validate-clinical-web-testnet.mjs';
const script=fileURLToPath(new URL('./validate-clinical-web-testnet.mjs',import.meta.url));
const invoke=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
test('CLI help requires no session, configuration or network',()=>{
  const result=invoke(['--help']); assert.equal(result.status,0);
  assert.match(result.stdout,/--inspect/);assert.match(result.stdout,/--confirm-synthetic-testnet/);assert.match(result.stdout,/--auth-wait-minutes/);assert.equal(result.stderr,'');
});

test('authorization wait accepts only whole minutes from 1 to 30',()=>{
  for(const minutes of ['1','5','15','30']) assert.equal(clinicalAuthWaitMs(minutes),Number(minutes)*60_000);
  for(const value of [undefined,null,15,'0','31','-1','1.5','01',' 15','15 ','1e1','Infinity','']) assert.throws(()=>clinicalAuthWaitMs(value),/rehearsal_configuration_invalid/);
  for(const value of ['0','31','1.5']) {
    const result=invoke(['--inspect','--auth-wait-minutes',value]);
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/Ensayo detenido/);
  }
});
test('execution requires both an explicit run ID and synthetic consent before starting',()=>{
  for(const args of [['--run'],['--run','--run-id','01234567-89ab-4cde-8fab-0123456789ab'],['--run','--inspect','--confirm-synthetic-testnet']]) {
    const result=invoke(args);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/Ensayo detenido/);
  }
});
test('CLI refuses secret arguments and remote targets without reflecting input',()=>{
  for(const args of [['--access-token','DO_NOT_REFLECT_THIS_CREDENTIAL'],['--inspect','--target','https://trustleaf-demo.vercel.app']]) {
    const result=invoke(args);assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.equal(result.stderr.includes('DO_NOT_REFLECT'),false);assert.equal(result.stderr.includes('https://trustleaf-demo'),false);
  }
});
