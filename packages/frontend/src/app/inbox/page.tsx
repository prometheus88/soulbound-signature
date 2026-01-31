'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type InboxDocument, type KYCVerifiedIdentity } from '@/lib/api';
import { formatDate, truncateAddress } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InboxPage() {
  const { account, connected } = useWallet();
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [kycNames, setKycNames] = useState<KYCVerifiedIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInbox() {
      if (!connected || !account?.address) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const result = await api.getInbox(account.address);
        setDocuments(result.documents);
        setKycNames(result.kycVerifiedNames || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load inbox');
      } finally {
        setLoading(false);
      }
    }

    fetchInbox();
  }, [connected, account?.address]);

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
        <p className="text-muted-foreground mb-6">
          Connect your Aptos wallet to view documents waiting for your signature.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-muted-foreground">Loading inbox...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Inbox</h1>
          <p className="text-muted-foreground">
            Documents waiting for your signature
          </p>
        </div>

        {kycNames.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            <p className="text-sm text-green-800 font-medium">KYC Verified</p>
            <p className="text-xs text-green-600">
              {kycNames.map(k => k.fullName).join(', ')}
            </p>
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No documents waiting for your signature.
            </p>
            <Link href="/create">
              <Button variant="outline">Create a Document</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
                    <CardDescription>
                      From: {truncateAddress(doc.ownerWallet)}
                    </CardDescription>
                  </div>
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                    Pending
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Received: {formatDate(doc.createdAt)}
                  </p>
                  <Link href={`/sign/${doc.signingToken}`}>
                    <Button>Sign Document</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
