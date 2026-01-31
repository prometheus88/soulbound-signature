'use client';

import { formatDate, truncateAddress } from '@/lib/utils';

interface SignerInfo {
  name: string;
  email?: string | null;
  walletAddress?: string | null;
  signedAt?: Date | string | null;
  ipAddress?: string | null;
  isKYC: boolean;
  kycNftAddress?: string | null;
  signatureType: 'drawn' | 'typed' | 'kyc';
  signatureValue?: string | null;
  signatureImage?: string | null;
}

interface ConfirmationPageProps {
  documentTitle: string;
  completedAt: Date | string;
  signers: SignerInfo[];
}

export function ConfirmationPage({ 
  documentTitle, 
  completedAt,
  signers 
}: ConfirmationPageProps) {
  return (
    <div className="p-8 bg-white max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b pb-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">SIGNATURE CONFIRMATION</h1>
        <div className="mt-4 text-sm text-gray-600 space-y-1">
          <p><strong>Document:</strong> {documentTitle}</p>
          <p><strong>Completed:</strong> {formatDate(completedAt)} UTC</p>
          <p><strong>Total Signers:</strong> {signers.length}</p>
        </div>
      </div>

      {/* Signers Table */}
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wider">
            <th className="pb-3">Signer</th>
            <th className="pb-3">Signature</th>
            <th className="pb-3">Date</th>
            <th className="pb-3">IP Address</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {signers.map((signer, index) => (
            <tr key={index} className="py-4">
              <td className="py-4 pr-4">
                <div>
                  <p className="font-semibold text-gray-900">{signer.name}</p>
                  {signer.isKYC && (
                    <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      KYC Verified
                    </p>
                  )}
                  {signer.email && (
                    <p className="text-xs text-gray-500 mt-1">{signer.email}</p>
                  )}
                  {signer.walletAddress && (
                    <p className="text-xs text-gray-500">
                      {truncateAddress(signer.walletAddress)}
                    </p>
                  )}
                </div>
              </td>
              
              <td className="py-4 pr-4">
                {signer.signatureType === 'kyc' ? (
                  <div>
                    <p className="text-sm text-gray-900">
                      [KYC: {signer.signatureValue}]
                    </p>
                    {signer.kycNftAddress && (
                      <p className="text-xs text-gray-500 mt-1">
                        NFT: {truncateAddress(signer.kycNftAddress)}
                      </p>
                    )}
                  </div>
                ) : signer.signatureType === 'typed' ? (
                  <p className="text-lg" style={{ fontFamily: 'cursive' }}>
                    {signer.signatureValue}
                  </p>
                ) : signer.signatureImage ? (
                  <img 
                    src={signer.signatureImage} 
                    alt={`${signer.name}'s signature`}
                    className="h-12 max-w-[150px] object-contain"
                  />
                ) : (
                  <span className="text-gray-400">[drawn signature]</span>
                )}
              </td>
              
              <td className="py-4 pr-4">
                <p className="text-sm text-gray-900">
                  {signer.signedAt ? formatDate(signer.signedAt) : 'Not signed'}
                </p>
              </td>
              
              <td className="py-4">
                <p className="text-sm text-gray-600">
                  {signer.ipAddress || 'Unknown'}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t text-xs text-gray-500 space-y-1">
        <p>
          This document was electronically signed using Soulbound Signature.
        </p>
        <p>
          Signatures marked &quot;KYC Verified&quot; were made using verified identities 
          from Soulbound KYC NFTs on Aptos.
        </p>
      </div>
    </div>
  );
}

// Preview component for showing after signing completion
export function ConfirmationPagePreview({ 
  documentTitle,
  signers 
}: { 
  documentTitle: string;
  signers: SignerInfo[];
}) {
  return (
    <div className="bg-gray-100 p-4 rounded-lg">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Confirmation Page Preview
      </h3>
      <div className="bg-white rounded shadow-sm overflow-hidden transform scale-75 origin-top-left">
        <ConfirmationPage
          documentTitle={documentTitle}
          completedAt={new Date()}
          signers={signers}
        />
      </div>
    </div>
  );
}
