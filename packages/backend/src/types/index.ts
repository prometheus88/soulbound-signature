// ==========================================
// Payment Types (x402)
// ==========================================

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    sponsored?: boolean;
  };
}

export interface PaymentPayload {
  x402Version: number;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepted: PaymentRequirements;
  payload: {
    transaction: string;
    senderAuthenticator?: string;
  };
}

export interface PaymentInfo {
  transactionHash: string;
  payer: string;
  amount: string;
  network: string;
}

// ==========================================
// Document Types
// ==========================================

export type DocumentStatus = 'draft' | 'pending' | 'completed' | 'cancelled';

export interface SignaturePackage {
  id: string;
  title: string;
  status: DocumentStatus;
  owner_wallet_address: string;
  payment_tx_hash: string | null;
  document_data: string | null; // Base64 PDF or path
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateDocumentRequest {
  title: string;
  format: 'html' | 'pdf';
  content?: string; // HTML content
  pdfBase64?: string; // PDF content
  recipients: RecipientInput[];
}

// ==========================================
// Recipient Types
// ==========================================

export type RecipientRole = 'signer' | 'viewer' | 'cc';
export type SigningStatus = 'pending' | 'signed' | 'rejected';

export interface RecipientInput {
  walletAddress?: string;
  email?: string;
  name: string;
  role?: RecipientRole;
  signingOrder?: number;
}

export interface Recipient {
  id: string;
  package_id: string;
  wallet_address: string | null;
  email: string | null;
  name: string;
  role: RecipientRole;
  signing_order: number | null;
  signing_status: SigningStatus;
  signed_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  token: string;
}

// ==========================================
// Field Types
// ==========================================

export type FieldType = 
  | 'signature'
  | 'free-signature'
  | 'initial'
  | 'name'
  | 'email'
  | 'date'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'radio'
  | 'dropdown';

export interface SignatureField {
  id: string;
  package_id: string;
  recipient_id: string;
  field_type: FieldType;
  page: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  value: string | null;
  field_meta: FieldMeta | null;
  inserted: boolean;
}

export interface FieldMeta {
  placeholder?: string;
  required?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  characterLimit?: number;
  min?: number;
  max?: number;
  format?: string;
  values?: Array<{ id?: number; value: string; checked?: boolean }>;
  direction?: 'vertical' | 'horizontal';
  defaultValue?: string;
}

// ==========================================
// Signature Types
// ==========================================

export interface Signature {
  id: string;
  field_id: string;
  recipient_id: string;
  signature_image: string | null;
  typed_signature: string | null;
  kyc_verified_name: string | null;
  kyc_nft_address: string | null;
  wallet_signature: string | null;
  wallet_address: string | null;
  document_hash: string | null;
  signed_at: Date;
}

export interface SignFieldRequest {
  signatureImage?: string; // Base64 image
  typedSignature?: string;
  kycNftAddress?: string;
  verifiedName?: string;
  walletSignature?: string; // Cryptographic signature from wallet
  walletAddress?: string;   // Wallet address that signed
  documentHash?: string;    // SHA-256 hash of document
  value?: string; // For non-signature fields
}

// ==========================================
// KYC Types
// ==========================================

export interface KYCVerifiedIdentity {
  nftAddress: string;
  fullName: string;
  country?: string;
  verificationDate: number;
}

// ==========================================
// Audit Log Types
// ==========================================

export type AuditEventType = 
  | 'document_created'
  | 'document_distributed'
  | 'document_viewed'
  | 'field_signed'
  | 'signing_completed'
  | 'document_completed'
  | 'document_cancelled';

export interface AuditLog {
  id: string;
  package_id: string;
  event_type: AuditEventType;
  user_wallet: string | null;
  user_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  data: Record<string, unknown>;
  created_at: Date;
}

// ==========================================
// Discovery Types
// ==========================================

export interface DiscoveryResource {
  resource: string;
  type: string;
  x402Version: number;
  accepts: PaymentRequirements[];
  lastUpdated: string;
  metadata: {
    description: string;
    input?: {
      schema: Record<string, unknown>;
    };
    output?: {
      example: Record<string, unknown>;
      schema: Record<string, unknown>;
    };
  };
}

// ==========================================
// API Response Types
// ==========================================

export interface CreateDocumentResponse {
  documentId: string;
  status: DocumentStatus;
  signingLinks: Record<string, string>;
  previewUrl: string;
}

export interface SigningSession {
  document: SignaturePackage;
  recipient: Recipient;
  fields: SignatureField[];
  kycVerifiedNames?: KYCVerifiedIdentity[];
}

export interface InboxDocument {
  id: string;
  title: string;
  status: DocumentStatus;
  ownerWallet: string;
  createdAt: Date;
  recipientStatus: SigningStatus;
}
