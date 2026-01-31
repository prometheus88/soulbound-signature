'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  const { connected } = useWallet();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          Sign Documents with Your Verified Identity
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          x402-powered e-signatures with KYC-verified wallet signing on Aptos
        </p>
        
        <div className="flex items-center justify-center gap-4">
          <Link href="/create">
            <Button size="lg">Create Document</Button>
          </Link>
          {connected && (
            <Link href="/inbox">
              <Button variant="outline" size="lg">View Inbox</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">KYC-Verified Signing</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Users with Soulbound KYC NFTs can sign using their verified legal names, 
              providing an extra layer of trust and compliance.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">x402 Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Pay just 1 USDC per document using the x402 payment protocol on Aptos.
              No subscriptions, pay only for what you use.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agentic API</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Full API support for programmatic users. Create documents with HTML,
              use our tools to convert PDFs, and integrate with any workflow.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* How It Works */}
      <Card className="mb-12">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <h3 className="font-medium mb-1">Create Document</h3>
              <p className="text-sm text-muted-foreground">
                Upload PDF or create from HTML with signature fields
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">2</span>
              </div>
              <h3 className="font-medium mb-1">Add Recipients</h3>
              <p className="text-sm text-muted-foreground">
                Identify signers by wallet address or email
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">3</span>
              </div>
              <h3 className="font-medium mb-1">Collect Signatures</h3>
              <p className="text-sm text-muted-foreground">
                Recipients sign via link or wallet inbox
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-primary">4</span>
              </div>
              <h3 className="font-medium mb-1">Download Signed PDF</h3>
              <p className="text-sm text-muted-foreground">
                Get complete document with signature confirmation page
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Verification Info */}
      <Card>
        <CardHeader>
          <CardTitle>KYC-Verified Wallet Signing</CardTitle>
          <CardDescription>
            An extra layer of trust for important documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            <div className="flex-1">
              <h4 className="font-medium mb-2">What is it?</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Users who have completed KYC verification through Soulbound KYC receive an NFT 
                containing their verified legal name. When signing documents, they can use this 
                verified name instead of entering it manually.
              </p>
              
              <h4 className="font-medium mb-2">Benefits</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Verified identity backed by on-chain proof</li>
                <li>• Name automatically retrieved from KYC NFT</li>
                <li>• NFT address included in signature confirmation</li>
                <li>• Higher trust level for compliance-sensitive documents</li>
              </ul>
            </div>
            
            <div className="w-64 bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Signature Confirmation Shows:</p>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>✓ Verified Name: John Doe</p>
                <p>✓ KYC NFT: 0x1234...abcd</p>
                <p>✓ Signed: Jan 31, 2026 2:30 PM</p>
                <p>✓ IP: 192.168.1.1</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
