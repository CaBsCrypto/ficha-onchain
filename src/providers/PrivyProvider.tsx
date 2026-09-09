'use client';
import { PrivyProvider } from '@privy-io/react-auth';

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  return <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{
    loginMethods: ['email', 'google'],
    appearance: { theme: 'light', accentColor: '#0ea5e9', walletList: [], loginMessage: 'Accede a TrustLeaf con tu correo. Tu cuenta utiliza Stellar.' },
    embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'off' } },
  }} >{children}</PrivyProvider>;
}
