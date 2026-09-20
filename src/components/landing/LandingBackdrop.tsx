'use client';
import { useModalStatus } from '@privy-io/react-auth';
import type { ReactNode } from 'react';

/** Privy's dialog is portaled outside this wrapper and retains its own focus trap. */
export function LandingBackdrop({ children }: { children: ReactNode }) {
  const { isOpen } = useModalStatus();
  return <div inert={isOpen} className={isOpen ? 'blur-sm transition-[filter]' : 'transition-[filter]'}>{children}</div>;
}
