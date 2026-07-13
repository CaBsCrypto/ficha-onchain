import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

const privy = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

export async function GET(req: NextRequest) {
  try {
    // Auth token from client
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);

    // Verify and extract userId
    const claims = await privy.verifyAuthToken(token);
    const userId = claims.userId;

    // Check if user already has a Stellar wallet in linkedAccounts
    const user = await privy.getUser(userId);
    const existing = (user.linkedAccounts ?? []).find(
      (a) =>
        a.type === 'wallet' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a as any).chainType === 'stellar',
    );

    if (existing) {
      return NextResponse.json({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        address: (existing as any).address as string,
        created: false,
      });
    }

    // No Stellar wallet yet — create one
    // Note: use privy.walletApi (property), not privy.wallets() (does not exist)
    const wallet = await privy.walletApi.createWallet({
      chainType: 'stellar',
      owner: { userId },
    });

    return NextResponse.json({
      address: wallet.address,
      walletId: wallet.id,
      created: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stellar-wallet] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
