#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { StrKey } from '@stellar/stellar-sdk';
import { clinicalLoopbackTarget, createClinicalWebApi, openClinicalWebJournal } from './lib/clinical-web-transport.mjs';
import { createClinicalWebAuditor } from './lib/clinical-web-receipt-audit.mjs';
import { startClinicalLocalAuth } from './lib/clinical-local-auth.mjs';
import { rehearseClinicalWeb } from './lib/clinical-web-rehearsal.mjs';

const help = `Ensayo local del historial clínico por APIs + Privy (Stellar Testnet).

node scripts/validate-clinical-web-testnet.mjs --inspect --patient G... --doctor-id N --doctor-wallet G... --relayer G...
node scripts/validate-clinical-web-testnet.mjs --run --run-id UUID --confirm-synthetic-testnet --patient G... --doctor-id N --doctor-wallet G... --relayer G...

Opciones: --target http://127.0.0.1:3016 --auth-port 3018
Por defecto inspecciona: no prepara, firma ni transmite. Los GET pueden actualizar
el vínculo de wallet o reconciliar intentos en Neon. No usa base ni claves directas.
Para reanudar, conserva el mismo run-id. Nunca sustituye un intento incierto.
Los códigos se introducen únicamente en el modal de Privy del acompañante local.
No acepta JWT, secretos o conexiones de base por argumentos. No admite previews.
`;
export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({args:argv,options:{help:{type:'boolean'},inspect:{type:'boolean'},run:{type:'boolean'},
    'run-id':{type:'string'},'confirm-synthetic-testnet':{type:'boolean'},patient:{type:'string'},'doctor-id':{type:'string'},
    'doctor-wallet':{type:'string'},relayer:{type:'string'},target:{type:'string',default:'http://127.0.0.1:3016'},'auth-port':{type:'string',default:'3018'}},strict:true});
  if (values.help) {process.stdout.write(help);return;}
  if (values.run && (values.inspect || !values['confirm-synthetic-testnet'] || !values['run-id'])) throw Error('rehearsal_explicit_consent_required');
  const target=clinicalLoopbackTarget(values.target),mode=values.run?'execute':'inspect',runId=values['run-id']??randomUUID();
  const patient=values.patient,doctor={id:Number(values['doctor-id']),address:values['doctor-wallet']};
  const port=Number(values['auth-port']);
  if (!StrKey.isValidEd25519PublicKey(patient??'') || !StrKey.isValidEd25519PublicKey(doctor.address??'') ||
      !StrKey.isValidEd25519PublicKey(values.relayer??'') || !Number.isSafeInteger(doctor.id) || doctor.id<1 || !Number.isSafeInteger(port) || port<1024 || port>65535 || port===Number(new URL(target).port)) throw Error('rehearsal_configuration_invalid');
  const base=resolve('.trustleaf-local/clinical-web-rehearsal'),journal=await openClinicalWebJournal({directory:base,runId});
  let auth,api;const abort=new AbortController();
  const stop=()=>abort.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    auth=await startClinicalLocalAuth({appId:'cmrix722m03d30clewd1fuffq',port,mode,runId,target,expectedPatient:patient,signal:abort.signal});
    process.stdout.write(`Run: ${runId}\nModo: ${mode}\nPrivy: ${auth.url}\nIngresa y confirma allí; no pegues códigos en la terminal.\n`);
    const handoff=await auth.waitForAuthorization();
    api=createClinicalWebApi({target,accessToken:handoff.accessToken,signal:abort.signal});handoff.accessToken='';
    const report=await rehearseClinicalWeb({api,audit:createClinicalWebAuditor({relayer:values.relayer}),journal,runId,patient,doctor,mode,
      allowWrites:mode==='execute'&&handoff.confirmedSynthetic===true,evidenceKind:'real_api_testnet_readback',
      onProgress:({step,index,phase})=>process.stdout.write(`Paso ${index}: ${step} · ${phase}\n`),
      sleep:ms=>new Promise((done,reject)=>{
        if(abort.signal.aborted){reject(Error('rehearsal_interrupted'));return;}
        const cancelled=()=>{clearTimeout(timer);reject(Error('rehearsal_interrupted'));};
        const timer=setTimeout(()=>{abort.signal.removeEventListener('abort',cancelled);done();},ms);
        abort.signal.addEventListener('abort',cancelled,{once:true});
      })});
    const publicReport={...report,sourceCommit,runningApplicationCommitVerified:false,target,
      checkedAt:new Date().toISOString(),scope:'patient_week2_api_rehearsal',
      limits:['No acredita interfaz, OTP ni firma mediante un botón de producto.','No acredita identidad civil ni acceso médico de semana 3.',
        'No recomputa independientemente el comprobante cegado del texto: el servidor verifica el documento al leerlo.',
        'No certifica el commit del servidor que está escuchando; reiniciarlo desde la versión revisada.']};
    const output=join(base,runId);await mkdir(output,{recursive:true});await writeFile(join(output,'report.json'),JSON.stringify(publicReport,null,2),{mode:0o600});
    process.stdout.write(`Resultado: ${report.status}\nInforme: ${join(output,'report.json')}\n`);
    if(report.status!=='passed') process.exitCode=2;
  } finally {api?.dispose();await auth?.close();await journal.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if (process.argv[1] && resolve(process.argv[1])===resolve(import.meta.filename)) main().catch(()=>{process.stderr.write('Ensayo detenido. Conserva run-id y journal; revisa configuración, sesión y operaciones pendientes.\n');process.exitCode=1;});
