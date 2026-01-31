import { getApiUrl } from './utils';

const API_URL = getApiUrl();

// Types
export interface CreateDocumentRequest {
  title: string;
  format: 'html' | 'pdf';
  content?: string;
  pdfBase64?: string;
  recipients: RecipientInput[];
}

export interface RecipientInput {
  walletAddress?: string;
  email?: string;
  name: string;
  role?: 'signer' | 'viewer' | 'cc';
  signingOrder?: number;
}

export interface CreateDocumentResponse {
  documentId: string;
  status: string;
  signingLinks: Record<string, string>;
  previewUrl: string;
}

export interface SigningSession {
  document: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  };
  recipient: {
    id: string;
    name: string;
    email: string | null;
    walletAddress: string | null;
    role: string;
    signingStatus: string;
    signedAt: string | null;
  };
  fields: Array<{
    id: string;
    field_type: string;
    page: number;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    value: string | null;
    signed: boolean;
    signature?: {
      type: 'wallet' | 'kyc' | 'typed' | 'drawn' | null;
      typedSignature?: string | null;
      signatureImage?: string | null;
      kycVerifiedName?: string | null;
      kycNftAddress?: string | null;
      walletSignature?: string | null;
      walletAddress?: string | null;
      documentHash?: string | null;
      signedAt?: string;
    } | null;
  }>;
  totalFields: number;
  signedFields: number;
  allFieldsSigned: boolean;
  kycVerifiedNames: KYCVerifiedIdentity[];
  hasKYC: boolean;
}

export interface KYCVerifiedIdentity {
  nftAddress: string;
  fullName: string;
  country?: string;
  verificationDate: number;
}

export interface InboxDocument {
  id: string;
  title: string;
  status: string;
  ownerWallet: string;
  createdAt: string;
  signingToken: string;
  signingUrl: string;
}

// API Client
export const api = {
  // Documents
  async createDocument(data: CreateDocumentRequest, paymentSignature: string): Promise<CreateDocumentResponse> {
    const response = await fetch(`${API_URL}/api/documents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-SIGNATURE': paymentSignature,
      },
      body: JSON.stringify(data),
    });

    if (response.status === 402) {
      const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
      throw new Error(`Payment required: ${paymentRequired}`);
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create document');
    }

    return response.json();
  },

  async getDocument(id: string) {
    const response = await fetch(`${API_URL}/api/documents/${id}`);
    if (!response.ok) {
      throw new Error('Document not found');
    }
    return response.json();
  },

  async distributeDocument(id: string) {
    const response = await fetch(`${API_URL}/api/documents/${id}/distribute`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to distribute document');
    }
    return response.json();
  },

  // Signing
  async getSigningSession(token: string, walletAddress?: string): Promise<SigningSession> {
    const url = walletAddress
      ? `${API_URL}/api/sign/${token}?walletAddress=${walletAddress}`
      : `${API_URL}/api/sign/${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get signing session');
    }
    return response.json();
  },

  async signField(
    token: string,
    fieldId: string,
    data: {
      signatureImage?: string;
      typedSignature?: string;
      kycNftAddress?: string;
      verifiedName?: string;
      value?: string;
    }
  ) {
    const response = await fetch(`${API_URL}/api/sign/${token}/field/${fieldId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to sign field');
    }
    return response.json();
  },

  async completeSigning(token: string): Promise<{
    success: boolean;
    message: string;
    recipientStatus: string;
    documentCompleted: boolean;
    signedAt: string;
  }> {
    const response = await fetch(`${API_URL}/api/sign/${token}/complete`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to complete signing');
    }
    return response.json();
  },

  async unsignField(token: string, fieldId: string) {
    const response = await fetch(`${API_URL}/api/sign/${token}/field/${fieldId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unsign field');
    }
    return response.json();
  },

  // Inbox
  async getInbox(walletAddress: string): Promise<{
    documents: InboxDocument[];
    pendingCount: number;
    kycVerifiedNames: KYCVerifiedIdentity[];
    hasKYC: boolean;
  }> {
    const response = await fetch(`${API_URL}/api/inbox/${walletAddress}`);
    if (!response.ok) {
      throw new Error('Failed to fetch inbox');
    }
    return response.json();
  },

  // KYC
  async getKYCNames(walletAddress: string): Promise<{
    walletAddress: string;
    hasKYC: boolean;
    verifiedNames: KYCVerifiedIdentity[];
  }> {
    const response = await fetch(`${API_URL}/api/kyc/names/${walletAddress}`);
    if (!response.ok) {
      throw new Error('Failed to fetch KYC names');
    }
    return response.json();
  },

  // Tools
  async convertPdfToHtml(pdfBase64: string): Promise<{
    success: boolean;
    html: string;
    pageCount: number;
    instructions: string;
    warnings: string[];
  }> {
    const response = await fetch(`${API_URL}/api/tools/pdf-to-html`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdfBase64 }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to convert PDF');
    }
    return response.json();
  },

  // Discovery
  async getDiscoveryResources() {
    const response = await fetch(`${API_URL}/discovery/resources`);
    return response.json();
  },

  // Payment helpers
  async getPaymentRequirements() {
    const response = await fetch(`${API_URL}/api/documents/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.status === 402) {
      const paymentRequired = response.headers.get('PAYMENT-REQUIRED');
      if (paymentRequired) {
        return JSON.parse(atob(paymentRequired));
      }
    }
    throw new Error('Could not get payment requirements');
  },
};
