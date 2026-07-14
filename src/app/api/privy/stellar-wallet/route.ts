import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

const privy = new PrivyClient(
  (process.env.PRIVY_APP_ID ?? process.env.NEXT_PUBLIC_PRIVY_APP_ID)!,
  process.env.PRIVY_APP_SECRET!,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);

    const claims = await privy.verifyAuthToken(token);
    const userId = claims.userId;

    // Check existing Stellar wallet (with retry for new users — Privy may need a moment)
    let existing: { address?: string } | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const user = await privy.getUser(userId);
      existing = (user.linkedAccounts ?? []).find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a) => a.type === 'wallet' && (a as any).chainType === 'stellar',
      ) as { address?: string } | undefined;
      if (existing) break;
      if (attempt < 2) await sleep(1500); // wait for Privy to finish setting up new user
    }

    if (existing?.address) {
      return NextResponse.json({ address: existing.address, created: false });
    }

    // No Stellar wallet yet — create one (with retry)
    let wallet: { address: string; id: string } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        wallet = await privy.walletApi.createWallet({
          chainType: 'stellar',
          owner: { userId },
        }) as { address: string; id: string };
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await sleep(1500 * (attempt + 1));
      }
    }

    if (!wallet) throw new Error('Wallet creation failed after retries');

    return NextResponse.json({ address: wallet.address, walletId: wallet.id, created: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stellar-wallet] error:', message);
    return NextResponse.json({ error: 'Could not provision Stellar wallet' }, { status: 500 });
  }
}
