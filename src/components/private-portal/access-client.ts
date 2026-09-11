import { authedFetch } from '@/lib/auth/authed-fetch';
import { portalErrorMessage } from './errors';

export class AccessError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly reference?: string) {
    super(status === 401 ? 'Tu sesión venció. Vuelve a ingresar con Privy.' :
      status === 403 ? 'Esta cuenta no tiene permiso para acceder.' :
      status === 409 ? (['wallet_invalid', 'wallet_creation_required'].includes(code)
        ? 'No pudimos verificar la asociación de tu cuenta Stellar. Vuelve a consultar; si persiste, solicita su revisión.'
        : portalErrorMessage(code, status)) :
      'No pudimos verificar el acceso en este momento. Puedes volver a consultar sin cambiar de cuenta.');
  }
}

/** Access gates retain the response category and safe support reference. */
export async function accessApi<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await authedFetch(path, { cache: 'no-store', ...init }); }
  catch { throw new AccessError(0, 'network_unavailable', 'ACCESS-NETWORK'); }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const reference = typeof body?.reference === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(body.reference) ? body.reference : undefined;
    throw new AccessError(response.ok ? 503 : response.status, typeof body?.error === 'string' ? body.error : 'access_unavailable', reference);
  }
  return body as T;
}

export function accessFailure(error: unknown): AccessError {
  return error instanceof AccessError ? error : new AccessError(503, 'access_unavailable', 'ACCESS-UNAVAILABLE');
}
