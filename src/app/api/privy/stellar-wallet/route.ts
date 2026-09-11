import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';
import { getDb } from '@/lib/db';
import { isSameOrigin } from '@/lib/auth/same-origin';
import { resolveStellarWallet, WalletBindingError } from '@/lib/stellar/privy-wallet-binding';
import { assertPrivateEnvironment } from '@/lib/private-config';

async function handle(req: NextRequest, allowCreate: boolean) {
  if (allowCreate && !isSameOrigin(req)) return NextResponse.json({error:'forbidden'}, {status:403});
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({error:'unauthorized'}, {status:401});
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmrix722m03d30clewd1fuffq';
  const secret = process.env.PRIVY_APP_SECRET;
  if (!secret) return NextResponse.json({error:'configuration_missing'}, {status:503});
  const privy = new PrivyClient(appId, secret);
  let userId: string;
  try { userId = (await privy.verifyAuthToken(token)).userId; }
  catch { return NextResponse.json({error:'unauthorized'}, {status:401}); }
  try {
    assertPrivateEnvironment();
    const provider = { getUser: (id: string) => privy.getUser(id), walletApi: privy.walletApi };
    return NextResponse.json(await resolveStellarWallet(getDb(), provider, appId, userId, allowCreate), {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return NextResponse.json({error:error instanceof WalletBindingError ? error.message : 'wallet_service_unavailable'}, {status:error instanceof WalletBindingError ? 409 : 503});
  }
}
// GET cannot create a provider wallet. POST takes a durable creation claim.
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
