'use client';

import { WalletProvider } from '@/components/WalletProvider';
import { PropsWithChildren } from 'react';

export function Providers({ children }: PropsWithChildren) {
  return <WalletProvider>{children}</WalletProvider>;
}
