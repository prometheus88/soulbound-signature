'use client';

import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import type { AnyRawTransaction } from '@aptos-labs/wallet-adapter-react';
import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentEditor, type PlacedField } from '@/components/DocumentEditor';
import { getApiUrl } from '@/lib/utils';

type Step = 'upload' | 'recipients' | 'fields' | 'review' | 'payment' | 'complete';

interface Recipient {
  name: string;
  email: string;
  walletAddress: string;
}

const API_URL = getApiUrl();
const SIGNATURE_PRICE_USDC = 1;
const USDC_ASSET = '0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832';
const PAYMENT_RECIPIENT = process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT || '0xe180ab508e40206c6d9ca9e18296178dad1c2fa47d500b02a5b36cd0a26273eb';

export default function CreatePage() {
  const { account, connected, signTransaction } = useWallet();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [title, setTitle] = useState('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([
    { name: '', email: '', walletAddress: '' }
  ]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [recipientIds, setRecipientIds] = useState<Record<number, string>>({});
  const [result, setResult] = useState<any>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setPdfBase64(base64);
      setPdfFileName(file.name);
      if (!title) {
        setTitle(file.name.replace('.pdf', ''));
      }
    };
    reader.readAsDataURL(file);
  };

  const addRecipient = () => {
    setRecipients([...recipients, { name: '', email: '', walletAddress: '' }]);
  };

  const updateRecipient = (index: number, field: keyof Recipient, value: string) => {
    const updated = [...recipients];
    updated[index] = { ...updated[index], [field]: value };
    setRecipients(updated);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter((_, i) => i !== index));
      setFields(fields.filter(f => f.recipientIndex !== index).map(f => ({
        ...f,
        recipientIndex: f.recipientIndex > index ? f.recipientIndex - 1 : f.recipientIndex
      })));
    }
  };

  const handleFieldsChange = useCallback((newFields: PlacedField[]) => {
    setFields(newFields);
  }, []);

  // Build and sign payment transaction
  const signPaymentTransaction = useCallback(async () => {
    if (!account?.address) throw new Error('Wallet not connected');

    const aptosConfig = new AptosConfig({ network: Network.TESTNET });
    const aptos = new Aptos(aptosConfig);

    // Build the payment transaction (USDC fungible asset transfer)
    const transaction = await aptos.transaction.build.simple({
      sender: account.address,
      withFeePayer: true, // Sponsored transaction
      data: {
        function: '0x1::primary_fungible_store::transfer',
        typeArguments: ['0x1::fungible_asset::Metadata'],
        functionArguments: [
          USDC_ASSET,
          PAYMENT_RECIPIENT,
          Math.floor(SIGNATURE_PRICE_USDC * 1_000_000).toString(),
        ],
      },
    });

    // Sign the transaction
    const signedTxn = await signTransaction(transaction as unknown as AnyRawTransaction);
    
    // Serialize for x402 payload
    const transactionBytes = transaction.bcsToBytes();
    const authenticatorBytes = signedTxn.bcsToBytes();

    const payload = {
      transaction: Array.from(transactionBytes),
      senderAuthenticator: Array.from(authenticatorBytes),
    };

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }, [account, signTransaction]);

  // Create document with x402 payment flow
  const handleCreateWithPayment = async () => {
    if (!connected || !account) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please connect your wallet' });
      return;
    }

    setLoading(true);
    setStep('payment');

    try {
      const requestBody = {
        title,
        format: 'pdf',
        pdfBase64,
        recipients: recipients.map(r => ({
          name: r.name,
          email: r.email || undefined,
          walletAddress: r.walletAddress || undefined,
          role: 'signer',
        })),
      };

      // Step 1: Make initial request to get payment requirements
      toast({
        title: 'Initiating Payment',
        description: 'Getting payment requirements...',
      });

      const initialResponse = await fetch(`${API_URL}/api/documents/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (initialResponse.status !== 402) {
        // Unexpected response - maybe payment was already processed or error
        if (initialResponse.ok) {
          const data = await initialResponse.json();
          handleCreateSuccess(data);
          return;
        }
        const error = await initialResponse.json();
        throw new Error(error.error || 'Unexpected response from server');
      }

      // Step 2: Show payment prompt and sign transaction
      toast({
        title: 'Payment Required',
        description: `Please sign the ${SIGNATURE_PRICE_USDC} USDC payment transaction in your wallet`,
      });

      const transactionB64 = await signPaymentTransaction();

      // Step 3: Build x402 payment payload
      const paymentRequiredHeader = initialResponse.headers.get('payment-required');
      if (!paymentRequiredHeader) throw new Error('Missing payment requirements from server');

      const paymentRequired = JSON.parse(
        Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8')
      );

      const paymentPayload = {
        x402Version: 2,
        resource: paymentRequired.resource,
        accepted: paymentRequired.accepts[0],
        payload: {
          transaction: transactionB64,
        },
      };

      const paymentSignature = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

      // Step 4: Retry with payment
      toast({
        title: 'Processing Payment',
        description: 'Submitting payment to the network...',
      });

      const paidResponse = await fetch(`${API_URL}/api/documents/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentSignature,
        },
        body: JSON.stringify(requestBody),
      });

      if (!paidResponse.ok) {
        const error = await paidResponse.json();
        throw new Error(error.error || error.reason || 'Payment failed');
      }

      const data = await paidResponse.json();
      handleCreateSuccess(data);

    } catch (err) {
      console.error('Payment error:', err);
      toast({
        variant: 'destructive',
        title: 'Payment Failed',
        description: err instanceof Error ? err.message : 'Failed to process payment',
      });
      setStep('review'); // Go back to review step on failure
    } finally {
      setLoading(false);
    }
  };

  // Handle successful document creation
  const handleCreateSuccess = (data: any) => {
    setDocumentId(data.documentId);
    
    // Map recipient IDs
    const recipientMap: Record<number, string> = {};
    if (data.recipients) {
      data.recipients.forEach((r: any, i: number) => {
        recipientMap[i] = r.id;
      });
    }
    setRecipientIds(recipientMap);

    toast({
      title: 'Payment Successful!',
      description: 'Document created. Now add signature fields.',
    });

    setStep('fields');
  };

  // Save fields to document
  const handleSaveFields = async () => {
    if (!documentId || fields.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please add at least one field to the document.',
      });
      return;
    }

    try {
      setLoading(true);

      const apiFields = fields.map(f => ({
        recipientId: recipientIds[f.recipientIndex],
        fieldType: f.type,
        page: f.page,
        positionX: f.x,
        positionY: f.y,
        width: f.width,
        height: f.height,
      }));

      const response = await fetch(`${API_URL}/api/documents/${documentId}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: apiFields }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save fields');
      }

      toast({
        title: 'Fields Saved',
        description: 'Ready to distribute your document.',
      });

      // Auto-distribute
      await handleDistribute();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save fields',
      });
    } finally {
      setLoading(false);
    }
  };

  // Distribute document
  const handleDistribute = async () => {
    if (!documentId) return;

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/documents/${documentId}/distribute`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to distribute document');
      }

      const data = await response.json();
      setResult(data);
      setStep('complete');

      toast({
        title: 'Document Distributed!',
        description: 'Share the signing links with your recipients.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to distribute document',
      });
    } finally {
      setLoading(false);
    }
  };

  const canContinueFromUpload = title && pdfBase64;
  const canContinueFromRecipients = recipients.every(r => 
    r.name && (r.email || r.walletAddress)
  );
  const recipientFieldCounts = recipients.map((_, i) => 
    fields.filter(f => f.recipientIndex === i).length
  );
  const canContinueFromFields = fields.length > 0 && recipientFieldCounts.every(count => count > 0);

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-gray-500 mb-6">
              Connect your Petra wallet to create signature packages.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Create Document for Signing</h1>
        <p className="text-gray-500 mt-2">Upload a document, add recipients, place signature fields, and distribute.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8 overflow-x-auto">
        {['Upload', 'Recipients', 'Payment', 'Add Fields', 'Complete'].map((label, i) => {
          const stepKeys: Step[] = ['upload', 'recipients', 'payment', 'fields', 'complete'];
          const isActive = step === stepKeys[i] || (step === 'review' && i === 1);
          const isPast = stepKeys.indexOf(step) > i || (step === 'review' && i < 2);
          
          return (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-primary text-white' : 
                  isPast ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {isPast ? '✓' : i + 1}
                </div>
                <span className={`text-xs mt-1 whitespace-nowrap ${isActive ? 'text-primary font-medium' : 'text-gray-500'}`}>
                  {label}
                </span>
              </div>
              {i < 4 && <div className={`w-8 lg:w-16 h-0.5 mx-1 lg:mx-2 ${isPast ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
            <CardDescription>Upload a PDF document that needs to be signed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Service Agreement"
                className="mt-1"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="pdf">PDF File</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
                <input id="pdf" type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
                <label htmlFor="pdf" className="cursor-pointer">
                  {pdfBase64 ? (
                    <div className="text-green-600">
                      <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium text-lg">{pdfFileName}</p>
                      <p className="text-sm text-gray-500 mt-1">Click to replace</p>
                    </div>
                  ) : (
                    <div className="text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="font-medium text-lg">Click to upload PDF</p>
                      <p className="text-sm mt-1">or drag and drop</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep('recipients')} disabled={!canContinueFromUpload}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Recipients */}
      {(step === 'recipients' || step === 'review') && (
        <Card>
          <CardHeader>
            <CardTitle>Add Recipients</CardTitle>
            <CardDescription>Who needs to sign this document?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recipients.map((recipient, index) => (
              <div key={index} className="p-4 border rounded-lg space-y-4 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'][index % 5]
                    }`}>
                      {index + 1}
                    </div>
                    <span className="font-medium text-gray-900">Signer {index + 1}</span>
                  </div>
                  {recipients.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeRecipient(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      Remove
                    </Button>
                  )}
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Name *</Label>
                    <Input value={recipient.name} onChange={(e) => updateRecipient(index, 'name', e.target.value)} placeholder="John Doe" className="mt-1" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={recipient.email} onChange={(e) => updateRecipient(index, 'email', e.target.value)} placeholder="john@example.com" className="mt-1" />
                  </div>
                  <div>
                    <Label>Wallet Address</Label>
                    <Input value={recipient.walletAddress} onChange={(e) => updateRecipient(index, 'walletAddress', e.target.value)} placeholder="0x..." className="mt-1" />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addRecipient} className="w-full">+ Add Another Signer</Button>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="font-medium">Cost: {SIGNATURE_PRICE_USDC} USDC</span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                You will be prompted to sign a USDC payment transaction with your wallet.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={handleCreateWithPayment} disabled={!canContinueFromRecipients || loading} className="flex-1">
                {loading ? 'Processing...' : `Pay ${SIGNATURE_PRICE_USDC} USDC & Create Document`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Payment (loading state) */}
      {step === 'payment' && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Processing Payment</h2>
            <p className="text-gray-500">
              Please confirm the transaction in your Petra wallet...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Add Fields */}
      {step === 'fields' && pdfBase64 && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Add Signature Fields</h2>
                <p className="text-sm text-gray-500">
                  Select a field type, choose a signer, then click on the document to place it.
                </p>
              </div>
              <Button onClick={handleSaveFields} disabled={!canContinueFromFields || loading}>
                {loading ? 'Saving...' : 'Save & Distribute'}
              </Button>
            </div>
            
            {!canContinueFromFields && fields.length > 0 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                Each signer must have at least one field assigned.
                {recipientFieldCounts.map((count, i) => count === 0 && (
                  <span key={i} className="block">• {recipients[i].name || `Signer ${i+1}`} has no fields</span>
                ))}
              </div>
            )}
          </Card>

          <div className="h-[700px]">
            <DocumentEditor
              pdfData={pdfBase64}
              recipients={recipients}
              fields={fields}
              onFieldsChange={handleFieldsChange}
            />
          </div>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && result && (
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle className="text-green-600">Document Distributed!</CardTitle>
            <CardDescription>Share the signing links with your recipients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">Document ID</p>
              <code className="text-sm bg-white px-2 py-1 rounded border block overflow-x-auto">{documentId}</code>
            </div>

            <div>
              <h4 className="font-medium mb-3">Signing Links</h4>
              <div className="space-y-3">
                {result.signingLinks && Object.entries(result.signingLinks).map(([key, url], i) => (
                  <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'][i % 5]
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{recipients[i]?.name || key}</p>
                      <code className="text-xs text-gray-500 truncate block">{url as string}</code>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(url as string);
                        toast({ title: 'Copied!', description: 'Link copied to clipboard.' });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button 
              onClick={() => {
                setStep('upload');
                setTitle('');
                setPdfBase64(null);
                setPdfFileName('');
                setRecipients([{ name: '', email: '', walletAddress: '' }]);
                setFields([]);
                setDocumentId(null);
                setRecipientIds({});
                setResult(null);
              }}
              className="w-full"
              variant="outline"
            >
              Create Another Document
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
