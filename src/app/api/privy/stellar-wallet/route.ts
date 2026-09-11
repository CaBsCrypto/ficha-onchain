import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { getDb, type Sql } from '@/lib/db';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { requirePrivySession } from '@/lib/auth/privy-auth';
import { AccessServiceError, accessErrorResponse, accessServiceResponse, type AccessErrorCode } from '@/lib/auth/access-error';
import { resolveStellarWallet, WalletBindingError, type WalletProvider } from '@/lib/stellar/privy-wallet-binding';
import { assertPrivateEnvironment, PrivateFlowError } from '@/lib/private-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bindingCodes = new Set<AccessErrorCode>(['wallet_binding_changed', 'wallet_binding_ambiguous', 'wallet_creation_pending', 'wallet_creation_required', 'wallet_invalid']);

async function databaseCall<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch { throw new AccessServiceError('database_unavailable', 'database'); }
}
async function walletCall<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch { throw new AccessServiceError('wallet_service_unavailable', 'wallet_provider'); }
}
function diagnosticSql(): Sql {
  let sql: Sql;
  try { sql = getDb(); }
  catch { throw new AccessServiceError('database_unavailable', 'database'); }
  const tagged = <T = Record<string, unknown>>(parts: TemplateStringsArray, ...values: unknown[]) => databaseCall(() => sql<T>(parts, ...values));
  return Object.assign(tagged, { query: <T = Record<string, unknown>>(statement: string, values?: unknown[]) => databaseCall(() => sql.query<T>(statement, values)) });
}

async function handle(req: NextRequest, allowCreate: boolean) {
  if (allowCreate && !isSameOrigin(req)) return accessErrorResponse('forbidden', 403, 'authorization');
  try {
    const session = await requirePrivySession(req);
    if (!session) return accessErrorResponse('unauthorized', 401, 'authentication');
    assertPrivateEnvironment();
    const appId = process.env.PRIVY_APP_ID!;
    const secret = process.env.PRIVY_APP_SECRET;
    if (!secret) throw new AccessServiceError('auth_configuration_missing', 'configuration');
    const privy = new PrivyClient(appId, secret);
    const provider: WalletProvider = {
      getUser: id => walletCall(() => privy.getUser(id)),
      walletApi: {
        getWallet: args => walletCall(() => privy.walletApi.getWallet(args)),
        createWallet: args => walletCall(() => privy.walletApi.createWallet(args)),
      },
    };
    const wallet = await resolveStellarWallet(diagnosticSql(), provider, appId, session.userId, allowCreate);
    return NextResponse.json(wallet, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AccessServiceError) return accessServiceResponse(error);
    if (error instanceof PrivateFlowError) return accessErrorResponse(error.message === 'private_configuration_mismatch'
      ? 'private_configuration_mismatch' : 'private_environment_mismatch', 503, 'configuration');
    if (error instanceof WalletBindingError && bindingCodes.has(error.message as AccessErrorCode)) {
      return accessErrorResponse(error.message as AccessErrorCode, 409, 'wallet_binding');
    }
    return accessErrorResponse('wallet_service_unavailable', 503, 'wallet_provider');
  }
}
// GET cannot create a provider wallet. POST takes a durable creation claim.
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
