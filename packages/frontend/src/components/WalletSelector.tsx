'use client';

import { useWallet, WalletName } from '@aptos-labs/wallet-adapter-react';
import { Copy, LogOut, Wallet } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useToast } from './ui/use-toast';
import { truncateAddress } from '@/lib/utils';

export function WalletSelector() {
  const { account, connected, disconnect, wallets, connect } = useWallet();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!account?.address) return;
    try {
      await navigator.clipboard.writeText(account.address.toString());
      toast({
        title: 'Copied!',
        description: 'Wallet address copied to clipboard.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to copy address.',
      });
    }
  }, [account?.address, toast]);

  const handleConnect = useCallback(
    async (walletName: WalletName) => {
      setIsConnecting(true);
      try {
        await connect(walletName);
        toast({
          title: 'Connected!',
          description: 'Wallet connected successfully.',
        });
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Connection Failed',
          description: error instanceof Error ? error.message : 'Failed to connect wallet',
        });
      } finally {
        setIsConnecting(false);
      }
    },
    [connect, toast]
  );

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    toast({
      title: 'Disconnected',
      description: 'Wallet disconnected.',
    });
  }, [disconnect, toast]);

  if (connected && account) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {truncateAddress(account.address?.toString())}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={copyAddress} className="gap-2 cursor-pointer">
            <Copy className="h-4 w-4" />
            Copy address
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDisconnect} className="gap-2 cursor-pointer text-red-500">
            <LogOut className="h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Show available wallets - only Petra
  const availableWallets = (wallets ?? []).filter(
    (w) => w.readyState === 'Installed' && w.name.toLowerCase().includes('petra')
  );

  if (availableWallets.length === 0) {
    return (
      <Button variant="outline" asChild>
        <a
          href="https://petra.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="gap-2"
        >
          <Wallet className="h-4 w-4" />
          Install Petra Wallet
        </a>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isConnecting} className="gap-2">
          <Wallet className="h-4 w-4" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {availableWallets.map((wallet) => (
          <DropdownMenuItem
            key={wallet.name}
            onClick={() => handleConnect(wallet.name)}
            className="gap-2 cursor-pointer"
          >
            {wallet.icon && (
              <img src={wallet.icon} alt={wallet.name} className="h-5 w-5" />
            )}
            {wallet.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
