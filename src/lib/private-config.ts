import { PRIVATE_REGISTRY_ID } from '../../scripts/lib/private-registry.mjs';

export const REGISTRY_PRIVATE = PRIVATE_REGISTRY_ID;
export const RX_PRIVATE = 'CDUN6FXFX6OYLP6DS3W7RC72GBVMS3TFJ7LFTB3LGVPF6PWMR6FCZSYE';
export const PRIVY_APP = 'cmrix722m03d30clewd1fuffq';
export const PRIVATE_ADMIN = 'GBK4WWTIWXWTYNXDFOYPV2ZZKTBAJKG7NHZOSLLX7ZDLCXBXE7T7VVAO';
export class PrivateFlowError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function assertPrivateEnvironment() {
  const e = process.env;
  let host = '';
  let protocol = '';
  try {
    const database = new URL(e.DATABASE_URL ?? '');
    host = database.hostname; protocol = database.protocol;
  } catch { /* rejected below */ }
  const localDev = /^ep-lingering-water-ahzh89z5(?:-pooler)?\.c-3\.us-east-1\.aws\.neon\.tech$/.test(host);
  if (!['local', 'preview', 'test'].includes(e.TRUSTLEAF_ENV ?? '') || !e.TRUSTLEAF_DB_HOST || host !== e.TRUSTLEAF_DB_HOST ||
      !['postgres:', 'postgresql:'].includes(protocol) || !/^[a-z0-9.-]+\.neon\.tech$/.test(host) ||
      host.includes('ep-rapid-shadow-ahq94785') ||
      (e.TRUSTLEAF_ENV === 'local' && !localDev) ||
      (e.TRUSTLEAF_ENV !== 'local' && localDev) ||
      (e.VERCEL_ENV === 'preview' && e.TRUSTLEAF_ENV !== 'preview') ||
      (e.VERCEL_ENV === 'production' && e.TRUSTLEAF_ENV !== 'test')) {
    throw new PrivateFlowError('private_environment_mismatch', 503);
  }
  if (e.PRIVY_APP_ID !== PRIVY_APP || e.NEXT_PUBLIC_PRIVY_APP_ID !== PRIVY_APP ||
      e.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID !== REGISTRY_PRIVATE || e.PRESCRIPTION_PRIVATE_CONTRACT_ID !== RX_PRIVATE ||
      e.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY !== PRIVATE_ADMIN || e.BOOKING_AUTHORITY_PUBLIC_KEY !== PRIVATE_ADMIN ||
      e.NEXT_PUBLIC_STELLAR_NETWORK !== 'testnet' ||
      !['https://soroban-testnet.stellar.org', 'https://soroban-testnet.stellar.org/'].includes(e.NEXT_PUBLIC_SOROBAN_RPC_URL ?? '')) {
    throw new PrivateFlowError('private_configuration_mismatch', 503);
  }
}
export function assertPrivateWrites() {
  assertPrivateEnvironment();
  if (process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED !== 'true') throw new PrivateFlowError('private_writes_paused', 503);
}
