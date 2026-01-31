'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { DocumentEditor } from '@/components/DocumentEditor';
import { getApiUrl, formatDate } from '@/lib/utils';

// Set worker source
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

const API_URL = getApiUrl();

interface Recipient {
  id: string;
  name: string;
  email: string | null;
  walletAddress: string | null;
  role: string;
  signingStatus: string;
  signedAt: string | null;
}

interface DocumentDetail {
  document: {
    id: string;
    title: string;
    status: 'draft' | 'pending' | 'completed' | 'cancelled';
    owner_wallet_address: string;
    created_at: string;
    completed_at: string | null;
    document_data: string | null;
  };
  recipients: Recipient[];
  fields: any[];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { account, connected } = useWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1);

  const documentId = params.id as string;

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  // Memoize the PDF file for completed documents
  const pdfFile = useMemo(() => {
    if (!data?.document.document_data) return null;
    try {
      const binaryString = atob(data.document.document_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes };
    } catch (e) {
      console.error('Error converting PDF data:', e);
      return null;
    }
  }, [data?.document.document_data]);

  useEffect(() => {
    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  const loadDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/documents/${documentId}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Document not found');
        } else {
          throw new Error('Failed to load document');
        }
        return;
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!data) return;
    try {
      const response = await fetch(`${API_URL}/api/documents/${documentId}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.document.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Downloaded', description: 'Document downloaded successfully.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to download document.' });
    }
  };

  const handleConfirmAction = async () => {
    if (!data || !confirmAction) return;

    setActionLoading(confirmAction);
    try {
      if (confirmAction === 'cancel') {
        const response = await fetch(`${API_URL}/api/documents/${documentId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: account?.address }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to cancel document');
        }

        toast({ title: 'Document Cancelled', description: 'The document has been cancelled.' });
        await loadDocument();
        setConfirmAction(null);
      } else if (confirmAction === 'delete') {
        const response = await fetch(`${API_URL}/api/documents/${documentId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: account?.address }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to delete document');
        }

        toast({ title: 'Document Deleted', description: 'The document has been deleted.' });
        router.push('/documents');
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : `Failed to ${confirmAction} document`,
      });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
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
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] || styles.draft}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getSigningStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      signed: 'bg-green-100 text-green-700',
      declined: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const isOwner = useMemo(() => {
    return connected && account?.address && data?.document.owner_wallet_address === account.address;
  }, [connected, account?.address, data?.document.owner_wallet_address]);

  const canCancel = isOwner && data?.document.status === 'pending';
  const canDelete = isOwner && (data?.document.status === 'draft' || data?.document.status === 'cancelled');

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">{error || 'Document not found'}</h2>
            <p className="text-gray-500 mb-6">The document you're looking for could not be loaded.</p>
            <Link href="/documents">
              <Button>Back to Documents</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { document: docInfo, recipients, fields } = data;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/documents" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Documents
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{docInfo.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            {getStatusBadge(docInfo.status)}
            <span className="text-gray-500">Created {formatDate(docInfo.created_at)}</span>
            {docInfo.completed_at && (
              <span className="text-gray-500">• Completed {formatDate(docInfo.completed_at)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {docInfo.status === 'completed' && (
            <Button onClick={handleDownload}>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => setConfirmAction('cancel')}
              disabled={actionLoading === 'cancel'}
              className="text-orange-600 border-orange-600 hover:bg-orange-50"
            >
              Cancel Document
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setConfirmAction('delete')}
              disabled={actionLoading === 'delete'}
              className="text-red-600 border-red-600 hover:bg-red-50"
            >
              Delete Document
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recipients */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recipients</CardTitle>
              <CardDescription>Signers and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recipients.map((recipient, index) => (
                  <div key={recipient.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'][index % 5]
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{recipient.name}</p>
                      {recipient.email && (
                        <p className="text-sm text-gray-500 truncate">{recipient.email}</p>
                      )}
                      {recipient.walletAddress && (
                        <p className="text-xs text-gray-400 truncate">
                          {recipient.walletAddress.slice(0, 8)}...{recipient.walletAddress.slice(-6)}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        {getSigningStatusBadge(recipient.signingStatus)}
                        {recipient.signedAt && (
                          <span className="text-xs text-gray-500">{formatDate(recipient.signedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Document Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Document Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Document ID</p>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded block overflow-x-auto">{docInfo.id}</code>
              </div>
              <div>
                <p className="text-sm text-gray-500">Owner</p>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded block overflow-x-auto">
                  {docInfo.owner_wallet_address.slice(0, 10)}...{docInfo.owner_wallet_address.slice(-8)}
                </code>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fields</p>
                <p className="text-sm font-medium">{fields.length} signature field(s)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Document Preview */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Document Preview</CardTitle>
                {docInfo.status === 'completed' && numPages > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                    >
                      ←
                    </Button>
                    <span className="text-sm">Page {currentPage} of {numPages}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                      disabled={currentPage >= numPages}
                    >
                      →
                    </Button>
                    <div className="ml-2 flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                      >
                        −
                      </Button>
                      <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setScale(Math.min(2, scale + 0.1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {docInfo.document_data ? (
                docInfo.status === 'completed' ? (
                  // For completed documents, show the finalized PDF with rendered fields
                  <div className="bg-gray-100 rounded overflow-auto flex justify-center p-4" style={{ maxHeight: '700px' }}>
                    {pdfFile && (
                      <Document
                        file={pdfFile}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                          <div className="w-[612px] h-[792px] flex items-center justify-center bg-white">
                            <span className="text-gray-500">Loading document...</span>
                          </div>
                        }
                      >
                        <Page 
                          pageNumber={currentPage} 
                          scale={scale}
                          renderTextLayer={true}
                          renderAnnotationLayer={true}
                          className="shadow-lg"
                        />
                      </Document>
                    )}
                  </div>
                ) : (
                  // For non-completed documents, show DocumentEditor with field overlays
                  <div className="h-[600px]">
                    <DocumentEditor
                      pdfData={docInfo.document_data}
                      recipients={recipients.map(r => ({ name: r.name, email: r.email || undefined, walletAddress: r.walletAddress || undefined }))}
                      fields={fields.map((f) => ({
                        id: f.id,
                        type: f.field_type,
                        recipientIndex: recipients.findIndex(r => r.id === f.recipient_id),
                        page: f.page,
                        x: f.position_x,
                        y: f.position_y,
                        width: f.width,
                        height: f.height,
                      }))}
                      onFieldsChange={() => {}}
                      readOnly={true}
                    />
                  </div>
                )
              ) : (
                <div className="h-[400px] bg-gray-100 rounded flex items-center justify-center">
                  <p className="text-gray-500">No preview available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction === 'cancel' ? 'Cancel Document' : 'Delete Document'}
        description={
          confirmAction === 'cancel'
            ? `Are you sure you want to cancel "${data?.document.title}"? Recipients will no longer be able to sign this document.`
            : `Are you sure you want to permanently delete "${data?.document.title}"? This action cannot be undone.`
        }
        confirmLabel={confirmAction === 'cancel' ? 'Cancel Document' : 'Delete Document'}
        cancelLabel="Go Back"
        onConfirm={handleConfirmAction}
        variant={confirmAction === 'cancel' ? 'warning' : 'danger'}
        icon={confirmAction === 'cancel' ? 'cancel' : 'delete'}
        loading={actionLoading !== null}
      />
    </div>
  );
}
