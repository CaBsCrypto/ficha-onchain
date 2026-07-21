'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { useRouter, usePathname } from 'next/navigation';

export function AppPrivyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      onSuccess={() => {
        // Stay in the section the user signed in from — an admin or doctor login
        // must NOT be bounced to the patient portal. Everywhere else (landing,
        // patient pages) defaults to /patient.
        if (pathname?.startsWith('/admin') || pathname?.startsWith('/doctor')) return;
        router.push('/patient');
      }}
      config={{
        loginMethods: ['email', 'google'],
        appearance: {
          theme: 'light',
          accentColor: '#0ea5e9',
        },
        embeddedWallets: {
          createOnLogin: 'all-users',
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
