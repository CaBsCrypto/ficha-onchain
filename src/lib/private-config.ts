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
  try { host = new URL(e.DATABASE_URL ?? '').hostname; } catch { /* rejected below */ }
  if (!host || (e.TRUSTLEAF_DB_HOST && host !== e.TRUSTLEAF_DB_HOST)) {
    throw new PrivateFlowError('private_environment_mismatch', 503);
  }

  const appId = e.PRIVY_APP_ID || PRIVY_APP;
  const clientAppId = e.NEXT_PUBLIC_PRIVY_APP_ID || PRIVY_APP;
  const registryPrivate = e.DOCTOR_REGISTRY_PRIVATE_CONTRACT_ID || REGISTRY_PRIVATE;
  const rxPrivate = e.PRESCRIPTION_PRIVATE_CONTRACT_ID || RX_PRIVATE;
  const registryAdmin = e.DOCTOR_REGISTRY_ADMIN_PUBLIC_KEY || PRIVATE_ADMIN;
  const bookingAuth = e.BOOKING_AUTHORITY_PUBLIC_KEY || PRIVATE_ADMIN;

  if (appId !== PRIVY_APP || clientAppId !== PRIVY_APP || registryPrivate !== REGISTRY_PRIVATE || rxPrivate !== RX_PRIVATE ||
      registryAdmin !== PRIVATE_ADMIN || bookingAuth !== PRIVATE_ADMIN) {
    throw new PrivateFlowError('private_configuration_mismatch', 503);
  }
}
export function assertPrivateWrites() {
  assertPrivateEnvironment();
  if (process.env.TRUSTLEAF_PRIVATE_WRITES_ENABLED === 'false') throw new PrivateFlowError('private_writes_paused', 503);
}
