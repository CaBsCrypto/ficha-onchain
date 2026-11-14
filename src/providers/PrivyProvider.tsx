'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { usePortalLanguage } from '@/hooks/useLanguage';

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  const english = usePortalLanguage() === 'en';
  return <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{
    loginMethods: ['email', 'google'],
    appearance: { theme: 'light', accentColor: '#0ea5e9', walletList: [], loginMessage: english ? 'Sign in to TrustLeaf with your email. Your account uses Stellar.' : 'Accede a TrustLeaf con tu correo. Tu cuenta utiliza Stellar.' },
    embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'off' } },
  }} >{children}</PrivyProvider>;
}
