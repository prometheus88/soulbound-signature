'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { api, type SigningSession, type KYCVerifiedIdentity } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SignatureCanvas } from '@/components/SignatureCanvas';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { getApiUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';

// Set worker source - use CDN with correct version
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const API_URL = getApiUrl();

type SignatureMode = 'draw' | 'type' | 'wallet' | 'kyc';

// Compute SHA-256 hash of document
async function computeDocumentHash(pdfBase64: string): Promise<string> {
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface FieldSignature {
  type: 'wallet' | 'kyc' | 'typed' | 'drawn' | null;
  typedSignature?: string | null;
  signatureImage?: string | null;
  kycVerifiedName?: string | null;
  kycNftAddress?: string | null;
  walletSignature?: string | null;
  walletAddress?: string | null;
  documentHash?: string | null;
  signedAt?: string;
}

interface Field {
  id: string;
  field_type: string;
  page: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  value: string | null;
  signed: boolean;
  signature?: FieldSignature | null;
}

export default function SignPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { account, connected, signMessage } = useWallet();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SigningSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);

  // Signing state
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('wallet');
  const [documentHash, setDocumentHash] = useState<string | null>(null);
  const [walletSignature, setWalletSignature] = useState<string | null>(null);
  const [typedSignature, setTypedSignature] = useState('');
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [selectedKYCName, setSelectedKYCName] = useState<KYCVerifiedIdentity | null>(null);
  const [signing, setSigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Load signing session
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true);
        const walletAddress = connected && account?.address ? account.address.toString() : undefined;
        const data = await api.getSigningSession(token, walletAddress);
        setSession(data);

        // Load PDF preview and compute hash
        const pdfResponse = await fetch(`${API_URL}/api/documents/${data.document.id}/preview`);
        if (pdfResponse.ok) {
          const pdfBlob = await pdfResponse.blob();
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            setPdfBase64(base64);
            // Compute document hash for cryptographic signing
            const hash = await computeDocumentHash(base64);
            setDocumentHash(hash);
          };
          reader.readAsDataURL(pdfBlob);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load signing session');
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [token, connected, account?.address]);

  // Sign document hash with wallet
  const signWithWallet = async (): Promise<{ signature: string; walletAddress: string } | null> => {
    if (!connected || !account?.address || !documentHash || !signMessage) {
      toast({
        variant: 'destructive',
        title: 'Wallet Required',
        description: 'Please connect your wallet to sign cryptographically.',
      });
      return null;
    }

    try {
      // Create the message to sign
      const message = `I am signing document with hash: ${documentHash}\n\nTimestamp: ${new Date().toISOString()}\nDocument: ${session?.document.title || 'Unknown'}`;
      
      // Sign with wallet
      const response = await signMessage({ message, nonce: documentHash.slice(0, 16) });
      
      console.log('Raw wallet signMessage response:', response);
      console.log('Response type:', typeof response);
      if (response && typeof response === 'object') {
        console.log('Response keys:', Object.keys(response));
      }
      
      // Extract signature from Aptos wallet response
      // The response is AptosSignMessageOutput: { signature, fullMessage, prefix, message, nonce }
      // signature is an Ed25519Signature object with toUint8Array() method
      let signatureStr: string = '';
      
      if (response && typeof response === 'object') {
        const resp = response as unknown as {
          signature?: {
            toUint8Array?: () => Uint8Array;
            data?: Uint8Array | number[];
            value?: { data?: number[] };
            toString?: () => string;
          } | string;
          fullMessage?: string;
        };
        
        // Handle the signature object from Aptos wallet
        if (resp.signature) {
          if (typeof resp.signature === 'string') {
            // Already a string
            signatureStr = resp.signature;
          } else if (typeof resp.signature.toUint8Array === 'function') {
            // Ed25519Signature object with toUint8Array method
            const bytes = resp.signature.toUint8Array();
            signatureStr = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('Extracted signature from toUint8Array:', signatureStr.slice(0, 50) + '...');
          } else if (resp.signature.data) {
            // Direct data property (Uint8Array or array)
            const data = resp.signature.data;
            const bytes = Array.isArray(data) ? data : Array.from(data);
            signatureStr = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('Extracted signature from data property:', signatureStr.slice(0, 50) + '...');
          } else if (resp.signature.value && resp.signature.value.data) {
            // Nested value.data (some wallet formats)
            const bytes = resp.signature.value.data;
            signatureStr = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('Extracted signature from value.data:', signatureStr.slice(0, 50) + '...');
          } else if (typeof resp.signature.toString === 'function') {
            // Try toString as fallback
            const strVal = resp.signature.toString();
            if (strVal && strVal !== '[object Object]') {
              signatureStr = strVal;
              console.log('Extracted signature from toString:', signatureStr.slice(0, 50) + '...');
            }
          }
          
          // If still no signature, try to serialize the signature object
          if (!signatureStr) {
            try {
              // Check if it's an object with numeric keys (Uint8Array-like)
              const sigObj = resp.signature as Record<string, unknown>;
              const keys = Object.keys(sigObj).filter(k => !isNaN(Number(k)));
              if (keys.length > 0) {
                const bytes = keys.sort((a, b) => Number(a) - Number(b)).map(k => Number(sigObj[k]));
                signatureStr = '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
                console.log('Extracted signature from numeric keys:', signatureStr.slice(0, 50) + '...');
              }
            } catch (e) {
              console.error('Failed to extract signature from object:', e);
            }
          }
        }
      }
      
      // If still no signature, log error
      if (!signatureStr) {
        console.error('Could not extract signature. Response structure:', JSON.stringify(response, (key, value) => {
          if (value instanceof Uint8Array) return Array.from(value);
          if (typeof value === 'function') return '[Function]';
          return value;
        }, 2));
      }

      console.log('Final extracted signature:', signatureStr ? signatureStr.slice(0, 66) + '...' : 'EMPTY');

      if (!signatureStr) {
        console.error('Could not extract signature from wallet response');
        return null;
      }

      return {
        signature: signatureStr,
        walletAddress: account.address.toString(),
      };
    } catch (err) {
      console.error('Wallet signing error:', err);
      toast({
        variant: 'destructive',
        title: 'Signing Failed',
        description: 'Failed to sign with wallet. Please try again.',
      });
      return null;
    }
  };

  const handleSignField = async () => {
    if (!selectedField) return;

    try {
      setSigning(true);

      let signData: any = {};

      if (isSignatureField(selectedField.field_type)) {
        if (signatureMode === 'wallet') {
          // Cryptographic wallet signature
          const walletSig = await signWithWallet();
          if (!walletSig) {
            setSigning(false);
            return;
          }
          
          signData = {
            walletSignature: walletSig.signature,
            walletAddress: walletSig.walletAddress,
            documentHash,
          };
          setWalletSignature(walletSig.signature);
        } else if (signatureMode === 'draw' && drawnSignature) {
          signData = { signatureImage: drawnSignature };
        } else if (signatureMode === 'type' && typedSignature) {
          signData = { typedSignature };
        } else if (signatureMode === 'kyc' && selectedKYCName) {
          // KYC mode: Also require wallet signature for cryptographic proof
          if (!connected || !account?.address) {
            toast({
              variant: 'destructive',
              title: 'Wallet Required',
              description: 'Please connect your wallet to sign with KYC verification.',
            });
            setSigning(false);
            return;
          }

          toast({
            title: 'Wallet Signature Required',
            description: 'Please sign the document hash with your wallet to complete KYC signing.',
          });

          const walletSig = await signWithWallet();
          console.log('KYC mode - wallet signature result:', walletSig);
          
          if (!walletSig) {
            toast({
              variant: 'destructive',
              title: 'Signature Required',
              description: 'Wallet signature is required for KYC signing. Please approve the signature request.',
            });
            setSigning(false);
            return;
          }

          if (!walletSig.signature) {
            console.error('Wallet signature object missing signature field:', walletSig);
            toast({
              variant: 'destructive',
              title: 'Signature Error',
              description: 'Failed to extract wallet signature. Please try again.',
            });
            setSigning(false);
            return;
          }

          signData = {
            kycNftAddress: selectedKYCName.nftAddress,
            verifiedName: selectedKYCName.fullName,
            // Also include wallet signature for KYC-verified signatures
            walletSignature: walletSig.signature,
            walletAddress: walletSig.walletAddress,
            documentHash,
          };
          
          console.log('KYC signing data being sent:', {
            ...signData,
            walletSignature: signData.walletSignature ? `${signData.walletSignature.slice(0, 20)}...` : 'MISSING',
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Please provide a signature',
          });
          setSigning(false);
          return;
        }
      } else {
        // Other field types
        signData = { value: typedSignature };
      }

      await api.signField(token, selectedField.id, signData);

      // Refresh session
      const walletAddress = connected && account?.address ? account.address.toString() : undefined;
      const data = await api.getSigningSession(token, walletAddress);
      setSession(data);

      toast({
        title: 'Field Signed',
        description: signatureMode === 'wallet' || signatureMode === 'kyc'
          ? 'Document cryptographically signed with your wallet!' 
          : 'Field has been signed successfully.',
      });

      // Reset state
      setSelectedField(null);
      setTypedSignature('');
      setDrawnSignature(null);
      setSelectedKYCName(null);
      setWalletSignature(null);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to sign field',
      });
    } finally {
      setSigning(false);
    }
  };

  const handleComplete = async () => {
    try {
      setCompleting(true);
      const result = await api.completeSigning(token);

      toast({
        title: 'Signing Complete!',
        description: 'Thank you for signing the document.',
      });

      // If document is fully completed, update the session state directly instead of refreshing
      // (refreshing would fail since the document is completed)
      if (result.documentCompleted) {
        // Update session to show completed state
        if (session) {
          setSession({
            ...session,
            recipient: {
              ...session.recipient,
              signingStatus: 'signed',
            },
          });
        }
      } else {
        // Multiple signers - refresh to show updated state
        const walletAddress = connected && account?.address ? account.address.toString() : undefined;
        const data = await api.getSigningSession(token, walletAddress);
        setSession(data);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to complete signing',
      });
    } finally {
      setCompleting(false);
    }
  };

  // Unsign a field to allow re-signing
  const handleUnsignField = async (fieldId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/sign/${token}/field/${fieldId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unsign field');
      }

      toast({
        title: 'Field Cleared',
        description: 'You can now re-sign this field.',
      });

      // Refresh session
      const walletAddress = connected && account?.address ? account.address.toString() : undefined;
      const data = await api.getSigningSession(token, walletAddress);
      setSession(data);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to unsign field',
      });
    }
  };

  // Render the field content based on its signature data
  const renderFieldContent = (field: Field) => {
    if (!field.signed || !field.signature) {
      return <span className="text-yellow-700">Click to sign</span>;
    }

    const sig = field.signature;

    if (sig.type === 'drawn' && sig.signatureImage) {
      return (
        <img 
          src={sig.signatureImage} 
          alt="Signature" 
          className="max-w-full max-h-full object-contain"
        />
      );
    }

    if (sig.type === 'wallet') {
      const shortAddr = sig.walletAddress 
        ? `${sig.walletAddress.slice(0, 6)}...${sig.walletAddress.slice(-4)}`
        : '';
      return (
        <div className="text-center p-1">
          <span className="text-green-700 font-medium text-xs">🔐 Wallet Signed</span>
          <div className="text-[10px] text-gray-500">{shortAddr}</div>
        </div>
      );
    }

    if (sig.type === 'kyc' && sig.kycVerifiedName) {
      return (
        <div className="text-center p-1">
          <span className="text-green-700 font-medium text-sm">✓ {sig.kycVerifiedName}</span>
          <div className="text-[10px] text-gray-500">KYC Verified</div>
        </div>
      );
    }

    if (sig.type === 'typed' && sig.typedSignature) {
      return (
        <span className="font-cursive text-lg text-gray-800">{sig.typedSignature}</span>
      );
    }

    // Fallback for field value
    if (field.value) {
      return <span className="text-gray-800 text-sm">{field.value}</span>;
    }

    return <span className="text-green-700">✓ Signed</span>;
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const isSignatureField = (type: string) => ['signature', 'free-signature', 'initial'].includes(type);

  const currentPageFields = session?.fields.filter(f => f.page === currentPage) || [];

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading document...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Invalid Signing Link</h2>
            <p className="text-gray-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) return null;

  // Download document
  const handleDownload = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${session.document.id}/download`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session.document.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({ title: 'Downloaded', description: 'Document downloaded successfully.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'Document may still be processing. Try again shortly.' });
    }
  };

  // Check if already completed
  if (session.recipient.signingStatus === 'signed') {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2 text-green-600">Signing Complete</h2>
            <p className="text-gray-500 mb-6">
              You signed this document on {new Date(session.recipient.signedAt!).toLocaleString()}
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={handleDownload}>
                Download Signed Document
              </Button>
              <Button variant="outline" asChild>
                <a href="/documents">View All Documents</a>
              </Button>
            </div>
            <p className="text-sm text-gray-400 mt-4">
              The final document includes a signature confirmation page with all signer details.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{session.document.title}</h1>
          <p className="text-gray-500 mt-1">
            Signing as: <span className="font-medium">{session.recipient.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm text-gray-500">
              {session.signedFields} of {session.totalFields} fields signed
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowExitConfirm(true)}
            >
              Exit
            </Button>
            {session.allFieldsSigned && (
              <Button onClick={handleComplete} disabled={completing}>
                {completing ? 'Completing...' : 'Complete Signing'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* PDF Viewer */}
        <div className="flex-1">
          <Card className="overflow-hidden">
            {/* Page Controls */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
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
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setScale(Math.max(0.5, scale - 0.1))}>−</Button>
                <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
                <Button size="sm" variant="outline" onClick={() => setScale(Math.min(2, scale + 0.1))}>+</Button>
              </div>
            </div>

            {/* Document */}
            <div className="overflow-auto p-4 bg-gray-100 flex justify-center">
              {pdfBase64 ? (
                <div className="relative bg-white shadow-lg">
                  <Document
                    file={`data:application/pdf;base64,${pdfBase64}`}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="w-[612px] h-[792px] flex items-center justify-center bg-gray-100">
                        <span className="text-gray-500">Loading PDF...</span>
                      </div>
                    }
                  >
                    <Page pageNumber={currentPage} scale={scale} renderTextLayer={true} renderAnnotationLayer={true} />
                  </Document>

                  {/* Field Overlays */}
                  {currentPageFields.map((field) => (
                    <div
                      key={field.id}
                      onClick={() => {
                        if (!field.signed) {
                          setSelectedField(field);
                        }
                      }}
                      className={cn(
                        'absolute border-2 rounded transition-all overflow-hidden group',
                        field.signed 
                          ? 'bg-green-50/80 border-green-500 cursor-pointer hover:border-green-600' 
                          : 'bg-yellow-100 border-yellow-500 hover:bg-yellow-200 cursor-pointer',
                        selectedField?.id === field.id && 'ring-2 ring-primary'
                      )}
                      style={{
                        left: `${field.position_x}%`,
                        top: `${field.position_y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-xs">
                        {renderFieldContent(field)}
                      </div>
                      {/* Edit button for signed fields - always visible */}
                      {field.signed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnsignField(field.id);
                          }}
                          className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-2 py-1 rounded-bl hover:bg-blue-700 font-medium shadow-sm"
                          title="Click to edit this field"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-[612px] h-[792px] flex items-center justify-center bg-gray-200">
                  <span className="text-gray-500">Document preview not available</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Signing Panel */}
        <div className="lg:w-80 space-y-4">
          {/* Fields to Sign */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Fields to Sign</CardTitle>
              <CardDescription className="text-xs">
                Click a field to sign it. Hover over signed fields to edit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {session.fields.length === 0 ? (
                <p className="text-sm text-gray-500">No fields assigned to you</p>
              ) : (
                session.fields.map((field) => (
                  <div
                    key={field.id}
                    className={cn(
                      'relative p-2 rounded text-sm',
                      field.signed 
                        ? 'bg-green-50' 
                        : selectedField?.id === field.id
                          ? 'bg-primary/10 border border-primary'
                          : 'bg-gray-50 hover:bg-gray-100'
                    )}
                  >
                    <button
                      onClick={() => {
                        if (!field.signed) {
                          setSelectedField(field);
                          setCurrentPage(field.page);
                        } else {
                          // Just navigate to the page
                          setCurrentPage(field.page);
                        }
                      }}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div>
                        <span className={field.signed ? 'text-green-700' : ''}>
                          {field.field_type} (Page {field.page})
                        </span>
                        {field.signed && field.signature && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {field.signature.type === 'wallet' && '🔐 Wallet signed'}
                            {field.signature.type === 'kyc' && `✓ ${field.signature.kycVerifiedName}`}
                            {field.signature.type === 'typed' && field.signature.typedSignature}
                            {field.signature.type === 'drawn' && '✏️ Drawn signature'}
                          </div>
                        )}
                      </div>
                      {field.signed ? <span className="text-green-600">✓</span> : <span>→</span>}
                    </button>
                    {field.signed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsignField(field.id);
                        }}
                        className="absolute top-1.5 right-1.5 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 rounded font-medium"
                        title="Edit this field"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Signature Input */}
          {selectedField && !selectedField.signed && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  Sign: {selectedField.field_type}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSignatureField(selectedField.field_type) ? (
                  <>
                    {/* Mode Selector */}
                    <div className="grid grid-cols-2 gap-2">
                      {connected && (
                        <Button
                          size="sm"
                          variant={signatureMode === 'wallet' ? 'default' : 'outline'}
                          onClick={() => setSignatureMode('wallet')}
                          className="col-span-2"
                        >
                          🔐 Sign with Wallet
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={signatureMode === 'draw' ? 'default' : 'outline'}
                        onClick={() => setSignatureMode('draw')}
                      >
                        ✏️ Draw
                      </Button>
                      <Button
                        size="sm"
                        variant={signatureMode === 'type' ? 'default' : 'outline'}
                        onClick={() => setSignatureMode('type')}
                      >
                        ⌨️ Type
                      </Button>
                      {session.hasKYC && (
                        <Button
                          size="sm"
                          variant={signatureMode === 'kyc' ? 'default' : 'outline'}
                          onClick={() => setSignatureMode('kyc')}
                          className="col-span-2"
                        >
                          ✓ KYC Verified Name
                        </Button>
                      )}
                    </div>

                    {signatureMode === 'wallet' && (
                      <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-blue-800">Cryptographic Signature</p>
                          <p className="text-xs text-blue-600 mt-1">
                            Sign the document hash with your wallet. This creates a verifiable on-chain signature.
                          </p>
                        </div>
                        {documentHash && (
                          <div className="bg-gray-50 rounded p-2">
                            <p className="text-xs text-gray-500">Document Hash (SHA-256):</p>
                            <code className="text-xs break-all text-gray-700">
                              {documentHash.slice(0, 32)}...{documentHash.slice(-8)}
                            </code>
                          </div>
                        )}
                        {connected ? (
                          <p className="text-xs text-green-600">
                            ✓ Connected: {account?.address?.toString().slice(0, 8)}...
                          </p>
                        ) : (
                          <p className="text-xs text-yellow-600">
                            Connect your wallet to sign cryptographically
                          </p>
                        )}
                      </div>
                    )}

                    {signatureMode === 'draw' && (
                      <div>
                        <SignatureCanvas
                          onSave={(data) => setDrawnSignature(data)}
                          width={260}
                          height={100}
                        />
                        {drawnSignature && (
                          <p className="text-xs text-green-600 mt-1">Signature captured</p>
                        )}
                      </div>
                    )}

                    {signatureMode === 'type' && (
                      <div>
                        <Input
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          placeholder="Type your full name"
                          className="font-cursive text-xl"
                        />
                        {typedSignature && (
                          <div className="mt-2 p-3 bg-gray-50 rounded border text-center">
                            <span className="font-cursive text-2xl">{typedSignature}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {signatureMode === 'kyc' && (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          Sign with your KYC-verified identity:
                        </p>
                        {session.kycVerifiedNames.map((name) => (
                          <button
                            key={name.nftAddress}
                            onClick={() => setSelectedKYCName(name)}
                            className={cn(
                              'w-full p-3 rounded border text-left',
                              selectedKYCName?.nftAddress === name.nftAddress
                                ? 'bg-primary/10 border-primary'
                                : 'bg-gray-50 hover:bg-gray-100'
                            )}
                          >
                            <p className="font-medium">{name.fullName}</p>
                            <p className="text-xs text-gray-500">
                              Verified: {name.country} • NFT: {name.nftAddress.slice(0, 10)}...
                            </p>
                          </button>
                        ))}
                        {selectedKYCName && (
                          <>
                            <p className="text-xs text-green-600">
                              ✓ Will sign as: {selectedKYCName.fullName}
                            </p>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                              <p className="text-xs text-blue-700">
                                🔐 You'll also sign the document hash with your wallet for cryptographic proof.
                              </p>
                            </div>
                          </>
                        )}
                        {!connected && (
                          <p className="text-xs text-yellow-600">
                            ⚠️ Connect your wallet to use KYC signing
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <Input
                      value={typedSignature}
                      onChange={(e) => setTypedSignature(e.target.value)}
                      placeholder={`Enter ${selectedField.field_type}`}
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedField(null);
                      setTypedSignature('');
                      setDrawnSignature(null);
                      setSelectedKYCName(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSignField}
                    disabled={signing}
                    className="flex-1"
                  >
                    {signing ? 'Signing...' : 'Sign Field'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* KYC Info */}
          {connected && session.hasKYC && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-green-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="font-medium">KYC Verified</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  You can sign with your verified identity.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Exit Confirmation Modal */}
      <ConfirmationModal
        open={showExitConfirm}
        onOpenChange={setShowExitConfirm}
        title="Exit Signing?"
        description="Any fields you've already signed will be saved. You can return later using the same link to complete signing."
        confirmLabel="Exit"
        cancelLabel="Continue Signing"
        variant="default"
        onConfirm={() => router.push('/documents')}
      />
    </div>
  );
}
