import { randomBytes, randomUUID } from 'node:crypto';
import { PrivyClient } from '@privy-io/server-auth';
import type { Sql } from '@/lib/db';
import type { AuthedUser } from '@/lib/auth/privy-auth';
import { resolveStellarWallet } from '@/lib/stellar/privy-wallet-binding';
import { assertPrivateEnvironment, assertPrivateWrites, PrivateFlowError } from '@/lib/private-config';
import { readAuthorization } from '../../scripts/lib/private-registry.mjs';
import { commitmentFor, encryptDossier, decryptDossier, type DoctorDossier } from '../../scripts/lib/private-doctor-dossier.mjs';

export const PRIVATE_REGISTRY = 'CBNY2NFS6I3UHF6GQ3IEQG4OCQD3JHQREDZT2ECDV2OF2TOO5GAGTQH2';
export const REGISTRY_ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
const PRIVY_APP = 'cmrix722m03d30clewd1fuffq';
export class DoctorAuthorizationError extends Error { constructor(message: string, public status = 409) { super(message); } }
export function assertPrivateRegistryConfiguration() {
  try { assertPrivateEnvironment(); }
  catch (error) { throw new DoctorAuthorizationError(error instanceof PrivateFlowError ? error.message : 'private_configuration_mismatch',503); }
}
function provider() {
  assertPrivateRegistryConfiguration();
  if (!process.env.PRIVY_APP_SECRET) throw new DoctorAuthorizationError('configuration_missing', 503);
  return new PrivyClient(PRIVY_APP, process.env.PRIVY_APP_SECRET);
}
export async function verifiedWallet(sql: Sql, userId: string, email: string) {
  const p = provider();
  const user = await p.getUser(userId);
  const actualEmail = (user.email?.address ?? user.google?.email)?.toLowerCase();
  if (actualEmail !== email.toLowerCase()) throw new DoctorAuthorizationError('identity_changed', 403);
  return resolveStellarWallet(sql, { getUser: id => p.getUser(id), walletApi: p.walletApi }, PRIVY_APP, userId);
}
export async function resolveDoctor(sql: Sql, doctorId: number) {
  const [doctor] = await sql`SELECT id,name,email,specialty,status FROM doctors WHERE id=${doctorId}`;
  if (!doctor) throw new DoctorAuthorizationError('doctor_not_found', 404);
  const user = await provider().getUserByEmail(String(doctor.email));
  if (!user) throw new DoctorAuthorizationError('doctor_privy_login_required');
  const wallet = await verifiedWallet(sql, user.id, String(doctor.email));
  return {doctor, userId: user.id, ...wallet};
}
export function readPrivateDoctor(wallet: string) {
  assertPrivateRegistryConfiguration();
  return readAuthorization({wallet,source:REGISTRY_ADMIN,registryId:PRIVATE_REGISTRY,expectedAdmin:REGISTRY_ADMIN});
}
export function authorizationView(result: Awaited<ReturnType<typeof readPrivateDoctor>>) {
  const a = result.authorization;
  const status = !a ? 'unregistered' : a.revoked ? 'revoked' : a.valid_until <= Math.floor(Date.now()/1000) ? 'expired' : result.authorized ? 'authorized' : 'paused';
  return {status,version:a?.version ?? 0,validUntil:a?.valid_until ?? null,commitment:a?.commitment ?? null};
}
const publicRequest = (r: Record<string, unknown> | undefined) => r ? ({id:r.id,state:r.state,action:r.action,method:r.method,transactionHash:r.transaction_hash??null,errorCode:r.error_code??null}) : null;
export async function latestDoctorRequest(sql: Sql, wallet: string) {
  const [r] = await sql`SELECT * FROM doctor_authorization_requests WHERE contract_id=${PRIVATE_REGISTRY} AND wallet=${wallet} ORDER BY created_at DESC LIMIT 1`;
  return publicRequest(r);
}
export function syntheticDossier(): Pick<DoctorDossier,'fullName'|'license'|'specialty'|'verificationSource'> {
  return {fullName:'Médico de prueba TrustLeaf',license:'TEST-STELLAR-REGISTRY',specialty:'Medicina general (prueba)',verificationSource:'Expediente sintético; no acredita habilitación profesional real'};
}
function dataKey() {
  const key=process.env.TRUSTLEAF_DATA_KEY;
  if(!key || !/^[a-fA-F0-9]{64}$/.test(key))throw new DoctorAuthorizationError('dossier_key_missing',503);
  return key;
}
export async function doctorAuthorizationDetails(sql: Sql, doctorId: number) {
  const d=await resolveDoctor(sql,doctorId), chain=await readPrivateDoctor(d.address);
  const [stored]=await sql`SELECT * FROM doctor_private_dossiers WHERE contract_id=${PRIVATE_REGISTRY} AND wallet=${d.address} ORDER BY version DESC LIMIT 1`;
  let dossier: Omit<DoctorDossier,'blinding'> | ReturnType<typeof syntheticDossier> = syntheticDossier();
  if(stored){
    const plain=decryptDossier(stored.encrypted_dossier,dataKey(),stored.id);
    if(commitmentFor(plain)!==stored.commitment || plain.wallet!==d.address || plain.contractId!==PRIVATE_REGISTRY || plain.version!==Number(stored.version))throw new DoctorAuthorizationError('dossier_integrity_error',503);
    const {blinding: _blinding,...safe}=plain; dossier=safe;
  }
  return {doctor:d.doctor,wallet:d.address,authorization:authorizationView(chain),request:await latestDoctorRequest(sql,d.address),dossier,syntheticOnly:true};
}
export function chooseAuthorizationMethod(action: string, chain: Awaited<ReturnType<typeof readPrivateDoctor>>) {
  const a=chain.authorization;
  if(action==='authorize' && !a) return {method:'authorize_doctor',expectedVersion:0,targetVersion:1};
  if(action==='renew' && a){
    if(!a.revoked && a.valid_until>Math.floor(Date.now()/1000) && !chain.authorized)throw new DoctorAuthorizationError('registry_paused');
    return {method:a.revoked||a.valid_until<=Math.floor(Date.now()/1000)?'reauthorize_doctor':'renew_authorization',expectedVersion:a.version,targetVersion:a.version+1};
  }
  if(action==='revoke' && a && !a.revoked)return {method:'revoke_doctor',expectedVersion:a.version,targetVersion:a.version};
  throw new DoctorAuthorizationError('action_does_not_match_registry_state');
}
export async function requestDoctorAuthorization(sql: Sql, actor: AuthedUser, doctorId: number, action: string) {
  try { assertPrivateWrites(); }
  catch (error) { throw new DoctorAuthorizationError(error instanceof PrivateFlowError ? error.message : 'private_configuration_mismatch',503); }
  const d=await resolveDoctor(sql,doctorId);
  const pending=async()=>{const [r]=await sql`SELECT * FROM doctor_authorization_requests WHERE contract_id=${PRIVATE_REGISTRY} AND wallet=${d.address} AND state IN ('pending','submitted') LIMIT 1`;if(r && r.action!==action)throw new DoctorAuthorizationError('another_action_pending');return publicRequest(r);};
  const existing=await pending(); if(existing)return {request:existing};
  const chain=await readPrivateDoctor(d.address), method=chooseAuthorizationMethod(action,chain);
  const id=randomUUID();
  let dossierId: string | null=action==='revoke'?null:randomUUID();
  let validUntil=action==='revoke'?chain.authorization!.valid_until:Math.floor(Date.now()/1000)+30*86400;
  let commitment=chain.authorization?.commitment??'', encrypted='';
  let previousRequestId: string | null = null;
  if(dossierId){
    // Failed unsigned attempts retain their immutable dossier and error history.
    // A fresh request can reuse that evidence, but never an uncertain signature.
    const [stored]=await sql`SELECT ds.id AS dossier_record_id,ds.network AS dossier_network,ds.version AS dossier_version,
      ds.valid_until AS dossier_valid_until,ds.commitment AS dossier_commitment,ds.encrypted_dossier,
      ds.status AS dossier_status,ds.transaction_hash AS dossier_transaction_hash,previous.*,
      EXISTS(SELECT 1 FROM doctor_authorization_requests signed WHERE signed.dossier_id=ds.id
        AND (signed.transaction_hash IS NOT NULL OR signed.prepared_xdr IS NOT NULL)) AS has_signed_attempt
      FROM doctor_private_dossiers ds LEFT JOIN LATERAL (
        SELECT * FROM doctor_authorization_requests r WHERE r.dossier_id=ds.id ORDER BY r.created_at DESC LIMIT 1
      ) previous ON TRUE WHERE ds.network='testnet' AND ds.contract_id=${PRIVATE_REGISTRY}
        AND ds.wallet=${d.address} AND ds.version=${method.targetVersion}`;
    if(stored){
      if(stored.state!=='failed' || stored.has_signed_attempt || stored.transaction_hash || stored.prepared_xdr ||
          stored.dossier_transaction_hash || stored.dossier_status!=='prepared')throw new DoctorAuthorizationError('failed_authorization_requires_reconciliation');
      if(stored.requested_by!==actor.userId || stored.requested_email!==actor.email)throw new DoctorAuthorizationError('retry_requires_original_reviewer',403);
      if(stored.action!==action || stored.method!==method.method || Number(stored.expected_version)!==method.expectedVersion ||
          Number(stored.target_version)!==method.targetVersion || Number(stored.doctor_id)!==doctorId ||
          stored.doctor_user_id!==d.userId || stored.doctor_email!==d.doctor.email || stored.wallet_id!==d.walletId ||
          stored.wallet!==d.address || stored.contract_id!==PRIVATE_REGISTRY || stored.network!=='testnet')throw new DoctorAuthorizationError('failed_authorization_state_changed');
      if(Number(stored.dossier_valid_until)<=Math.floor(Date.now()/1000))throw new DoctorAuthorizationError('failed_dossier_expired');
      let plain: DoctorDossier;
      try{
        plain=decryptDossier(stored.encrypted_dossier,dataKey(),stored.dossier_record_id);
        if(commitmentFor(plain)!==stored.dossier_commitment || plain.wallet!==d.address || plain.contractId!==PRIVATE_REGISTRY ||
            plain.network!=='testnet' || plain.version!==method.targetVersion || plain.validUntil!==Number(stored.dossier_valid_until) ||
            plain.reviewedBy!==actor.userId || stored.commitment!==stored.dossier_commitment ||
            Number(stored.valid_until)!==plain.validUntil || Number(stored.dossier_version)!==plain.version)throw Error();
      }catch{throw new DoctorAuthorizationError('dossier_integrity_error',503);}
      previousRequestId=String(stored.id);dossierId=String(stored.dossier_record_id);
      validUntil=plain.validUntil;commitment=stored.dossier_commitment;encrypted=stored.encrypted_dossier;
    }else{
      const dossier:DoctorDossier={schemaVersion:1,network:'testnet',contractId:PRIVATE_REGISTRY,wallet:d.address,version:method.targetVersion,validUntil,...syntheticDossier(),reviewedBy:actor.userId,reviewedAt:new Date().toISOString(),blinding:randomBytes(32).toString('hex')};
      commitment=commitmentFor(dossier);encrypted=encryptDossier(dossier,dataKey(),dossierId);
    }
  }
  try {
    const parameters=[dossierId,PRIVATE_REGISTRY,d.address,method.targetVersion,validUntil,commitment,encrypted,id,doctorId,actor.userId,actor.email,d.userId,d.doctor.email,d.walletId,action,method.method,method.expectedVersion];
    if(previousRequestId){
      const rows=await sql.query(`WITH retryable AS (
        SELECT ds.id FROM doctor_private_dossiers ds JOIN doctor_authorization_requests r ON r.dossier_id=ds.id
        WHERE r.id=$18::uuid AND ds.id=$1::uuid AND r.state='failed' AND r.prepared_xdr IS NULL AND r.transaction_hash IS NULL
          AND (r.lease_until IS NULL OR r.lease_until<NOW()) AND r.requested_by=$10 AND r.requested_email=$11
          AND r.action=$15 AND r.method=$16 AND r.expected_version=$17 AND r.target_version=$4
          AND ds.status='prepared' AND ds.transaction_hash IS NULL AND ds.commitment=$6 AND ds.encrypted_dossier=$7
          AND ds.valid_until=$5 AND ds.valid_until>EXTRACT(EPOCH FROM NOW())
          AND NOT EXISTS(SELECT 1 FROM doctor_authorization_requests signed WHERE signed.dossier_id=ds.id
            AND (signed.transaction_hash IS NOT NULL OR signed.prepared_xdr IS NOT NULL)) FOR UPDATE OF r,ds
      ) INSERT INTO doctor_authorization_requests(id,doctor_id,requested_by,requested_email,doctor_user_id,doctor_email,wallet_id,wallet,network,contract_id,action,method,expected_version,target_version,commitment,valid_until,dossier_id,state)
        SELECT $8::uuid,$9,$10,$11,$12,$13,$14,$3,'testnet',$2,$15,$16,$17,$4,$6,$5,id,'pending' FROM retryable RETURNING *`,[...parameters,previousRequestId]);
      if(!rows[0])throw new DoctorAuthorizationError('failed_authorization_requires_reconciliation');
      return {request:publicRequest(rows[0])};
    }
    // One statement: a conflicting pending request rolls back its dossier too.
    const rows=await sql.query(`WITH dossier AS (
      INSERT INTO doctor_private_dossiers(id,network,contract_id,wallet,version,valid_until,commitment,encrypted_dossier,status)
      SELECT $1::uuid,'testnet',$2,$3,$4,$5,$6,$7,'prepared' WHERE $1::uuid IS NOT NULL RETURNING id
    ) INSERT INTO doctor_authorization_requests(id,doctor_id,requested_by,requested_email,doctor_user_id,doctor_email,wallet_id,wallet,network,contract_id,action,method,expected_version,target_version,commitment,valid_until,dossier_id,state)
      VALUES($8::uuid,$9,$10,$11,$12,$13,$14,$3,'testnet',$2,$15,$16,$17,$4,$6,$5,(SELECT id FROM dossier),'pending') RETURNING *`,
      parameters);
    return {request:publicRequest(rows[0])};
  }catch(error){const raced=await pending();if(raced)return {request:raced};throw error;}
}
