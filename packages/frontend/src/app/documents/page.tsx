'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { getApiUrl, formatDate } from '@/lib/utils';

const API_URL = getApiUrl();

interface Document {
  id: string;
  title: string;
  status: 'draft' | 'pending' | 'completed' | 'cancelled';
  owner_wallet_address: string;
  created_at: string;
  completed_at: string | null;
}

interface ConfirmAction {
  type: 'cancel' | 'delete';
  docId: string;
  title: string;
}

export default function DocumentsPage() {
  const { account, connected } = useWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sentDocuments, setSentDocuments] = useState<Document[]>([]);
  const [receivedDocuments, setReceivedDocuments] = useState<any[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (connected && account?.address) {
      loadDocuments();
    }
  }, [connected, account?.address]);

  const loadDocuments = async () => {
    if (!account?.address) return;

    setLoading(true);
    try {
      // Load documents I've sent
      const sentRes = await fetch(`${API_URL}/api/documents/owner/${account.address}`);
      if (sentRes.ok) {
        const data = await sentRes.json();
        setSentDocuments(data.documents || []);
      }

      // Load documents I need to sign (inbox)
      const inboxRes = await fetch(`${API_URL}/api/inbox/${account.address}`);
      if (inboxRes.ok) {
        const data = await inboxRes.json();
        setReceivedDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId: string, title: string) => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Downloaded', description: 'Document downloaded successfully.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to download document.' });
    }
  };

  const handleCancelClick = (docId: string, title: string) => {
    setConfirmAction({ type: 'cancel', docId, title });
  };

  const handleDeleteClick = (docId: string, title: string) => {
    setConfirmAction({ type: 'delete', docId, title });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;

    setActionLoading(true);
    try {
      if (confirmAction.type === 'cancel') {
        const response = await fetch(`${API_URL}/api/documents/${confirmAction.docId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: account?.address }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to cancel document');
        }

        toast({ title: 'Document Cancelled', description: `"${confirmAction.title}" has been cancelled.` });
      } else {
        const response = await fetch(`${API_URL}/api/documents/${confirmAction.docId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: account?.address }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete document');
        }

        toast({ title: 'Document Deleted', description: `"${confirmAction.title}" has been deleted.` });
      }

      loadDocuments();
      setConfirmAction(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : `Failed to ${confirmAction.type} document`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      pending: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-gray-500">Connect your wallet to view your documents.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Documents</h1>
        <p className="text-gray-500 mt-2">View and manage your signature documents.</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading documents...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Sent Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Documents I Sent</CardTitle>
              <CardDescription>Documents you created and sent for signatures</CardDescription>
            </CardHeader>
            <CardContent>
              {sentDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>You haven't sent any documents yet.</p>
                  <Link href="/create">
                    <Button className="mt-4">Create Document</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                        <p className="text-sm text-gray-500">
                          Created: {formatDate(doc.created_at)}
                          {doc.completed_at && ` • Completed: ${formatDate(doc.completed_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(doc.status)}
                        {doc.status === 'completed' && (
                          <Button size="sm" onClick={() => handleDownload(doc.id, doc.title)}>
                            Download
                          </Button>
                        )}
                        {doc.status === 'pending' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleCancelClick(doc.id, doc.title)}
                            className="text-orange-600 border-orange-300 hover:bg-orange-50"
                          >
                            Cancel
                          </Button>
                        )}
                        {(doc.status === 'draft' || doc.status === 'cancelled') && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDeleteClick(doc.id, doc.title)}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Delete
                          </Button>
                        )}
                        <Link href={`/documents/${doc.id}`}>
                          <Button size="sm" variant="outline">View</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Received Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Documents to Sign</CardTitle>
              <CardDescription>Documents where you are a signer</CardDescription>
            </CardHeader>
            <CardContent>
              {receivedDocuments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No documents waiting for your signature.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivedDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{doc.title}</p>
                        <p className="text-sm text-gray-500">
                          From: {doc.ownerWallet?.slice(0, 8)}...{doc.ownerWallet?.slice(-6)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(doc.status)}
                        {doc.status === 'completed' ? (
                          <Button size="sm" onClick={() => handleDownload(doc.id, doc.title)}>
                            Download
                          </Button>
                        ) : (
                          <Link href={doc.signingUrl || `/sign/${doc.signingToken}`}>
                            <Button size="sm">Sign Now</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.type === 'cancel' ? 'Cancel Document' : 'Delete Document'}
        description={
          confirmAction?.type === 'cancel'
            ? `Are you sure you want to cancel "${confirmAction?.title}"? Recipients will no longer be able to sign this document.`
            : `Are you sure you want to permanently delete "${confirmAction?.title}"? This action cannot be undone.`
        }
        confirmLabel={confirmAction?.type === 'cancel' ? 'Cancel Document' : 'Delete Document'}
        cancelLabel="Go Back"
        onConfirm={handleConfirmAction}
        variant={confirmAction?.type === 'cancel' ? 'warning' : 'danger'}
        icon={confirmAction?.type === 'cancel' ? 'cancel' : 'delete'}
        loading={actionLoading}
      />
    </div>
  );
}
