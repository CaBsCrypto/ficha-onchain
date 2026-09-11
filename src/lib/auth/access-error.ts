import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export type AccessCategory = 'authentication' | 'authorization' | 'configuration' | 'database' | 'auth_provider' | 'wallet_provider' | 'wallet_binding';
export type AccessErrorCode = 'unauthorized' | 'forbidden' | 'auth_configuration_missing' | 'auth_configuration_invalid' |
  'auth_service_unavailable' | 'private_environment_mismatch' | 'private_configuration_mismatch' |
  'database_unavailable' | 'wallet_service_unavailable' | 'wallet_binding_changed' | 'wallet_binding_ambiguous' |
  'wallet_creation_pending' | 'wallet_creation_required' | 'wallet_invalid';

/** Contains only a closed diagnostic code. Never retain a provider response or secret as a cause. */
export class AccessServiceError extends Error {
  constructor(public readonly code: AccessErrorCode, public readonly category: AccessCategory) { super(code); }
}

export function accessErrorResponse(code: AccessErrorCode, status: number, category: AccessCategory) {
  const reference = randomUUID();
  // Deliberately exclude request headers, provider error objects, wallets and connection strings.
  console.warn('[private-access]', { reference, category, code });
  return NextResponse.json({ error: code, reference }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function accessServiceResponse(error: AccessServiceError) {
  return accessErrorResponse(error.code, 503, error.category);
}
