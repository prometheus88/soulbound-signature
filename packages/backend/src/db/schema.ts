import { pool } from './index.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  SignaturePackage,
  DocumentStatus,
  Recipient,
  RecipientInput,
  RecipientRole,
  SigningStatus,
  SignatureField,
  FieldType,
  FieldMeta,
  Signature,
  AuditLog,
  AuditEventType,
} from '../types/index.js';

// ==========================================
// Signature Packages
// ==========================================

export async function createPackage(
  title: string,
  ownerWalletAddress: string,
  paymentTxHash: string | null,
  documentData?: string,
  documentHtml?: string
): Promise<SignaturePackage> {
  const result = await pool.query<SignaturePackage>(
    `INSERT INTO signature_packages (title, owner_wallet_address, payment_tx_hash, document_data, document_html, status)
     VALUES ($1, $2, $3, $4, $5, 'draft')
     RETURNING *`,
    [title, ownerWalletAddress, paymentTxHash, documentData, documentHtml]
  );
  return result.rows[0];
}

export async function getPackageById(id: string): Promise<SignaturePackage | null> {
  const result = await pool.query<SignaturePackage>(
    'SELECT * FROM signature_packages WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function updatePackageStatus(
  id: string,
  status: DocumentStatus
): Promise<SignaturePackage | null> {
  const completedAt = status === 'completed' ? new Date() : null;
  const result = await pool.query<SignaturePackage>(
    `UPDATE signature_packages 
     SET status = $2, completed_at = $3
     WHERE id = $1
     RETURNING *`,
    [id, status, completedAt]
  );
  return result.rows[0] || null;
}

export async function updatePackageDocument(
  id: string,
  documentData: string
): Promise<SignaturePackage | null> {
  const result = await pool.query<SignaturePackage>(
    `UPDATE signature_packages 
     SET document_data = $2
     WHERE id = $1
     RETURNING *`,
    [id, documentData]
  );
  return result.rows[0] || null;
}

export async function getPackagesByOwner(ownerWalletAddress: string): Promise<SignaturePackage[]> {
  const result = await pool.query<SignaturePackage>(
    'SELECT * FROM signature_packages WHERE owner_wallet_address = $1 ORDER BY created_at DESC',
    [ownerWalletAddress]
  );
  return result.rows;
}

// ==========================================
// Recipients
// ==========================================

export async function createRecipient(
  packageId: string,
  input: RecipientInput
): Promise<Recipient> {
  const token = uuidv4();
  const result = await pool.query<Recipient>(
    `INSERT INTO recipients (package_id, wallet_address, email, name, role, signing_order, token)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      packageId,
      input.walletAddress || null,
      input.email || null,
      input.name,
      input.role || 'signer',
      input.signingOrder || null,
      token,
    ]
  );
  return result.rows[0];
}

export async function getRecipientByToken(token: string): Promise<Recipient | null> {
  const result = await pool.query<Recipient>(
    'SELECT * FROM recipients WHERE token = $1',
    [token]
  );
  return result.rows[0] || null;
}

export async function getRecipientById(id: string): Promise<Recipient | null> {
  const result = await pool.query<Recipient>(
    'SELECT * FROM recipients WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getRecipientsByPackage(packageId: string): Promise<Recipient[]> {
  const result = await pool.query<Recipient>(
    'SELECT * FROM recipients WHERE package_id = $1 ORDER BY signing_order ASC NULLS LAST, created_at ASC',
    [packageId]
  );
  return result.rows;
}

export async function getRecipientsByWallet(walletAddress: string): Promise<Recipient[]> {
  const result = await pool.query<Recipient>(
    `SELECT r.*, p.title as package_title, p.status as package_status, p.owner_wallet_address, p.created_at as package_created_at
     FROM recipients r
     JOIN signature_packages p ON r.package_id = p.id
     WHERE r.wallet_address = $1 AND r.signing_status = 'pending' AND p.status = 'pending'
     ORDER BY p.created_at DESC`,
    [walletAddress]
  );
  return result.rows;
}

export async function updateRecipientStatus(
  id: string,
  status: SigningStatus,
  ipAddress?: string,
  userAgent?: string
): Promise<Recipient | null> {
  const signedAt = status === 'signed' ? new Date() : null;
  const result = await pool.query<Recipient>(
    `UPDATE recipients 
     SET signing_status = $2, signed_at = $3, ip_address = $4, user_agent = $5
     WHERE id = $1
     RETURNING *`,
    [id, status, signedAt, ipAddress, userAgent]
  );
  return result.rows[0] || null;
}

// ==========================================
// Signature Fields
// ==========================================

export async function createField(
  packageId: string,
  recipientId: string,
  fieldType: FieldType,
  page: number,
  positionX: number,
  positionY: number,
  width: number,
  height: number,
  fieldMeta?: FieldMeta
): Promise<SignatureField> {
  const result = await pool.query<SignatureField>(
    `INSERT INTO signature_fields (package_id, recipient_id, field_type, page, position_x, position_y, width, height, field_meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [packageId, recipientId, fieldType, page, positionX, positionY, width, height, fieldMeta ? JSON.stringify(fieldMeta) : null]
  );
  return result.rows[0];
}

export async function getFieldById(id: string): Promise<SignatureField | null> {
  const result = await pool.query<SignatureField>(
    'SELECT * FROM signature_fields WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getFieldsByPackage(packageId: string): Promise<SignatureField[]> {
  const result = await pool.query<SignatureField>(
    'SELECT * FROM signature_fields WHERE package_id = $1 ORDER BY page ASC, position_y ASC',
    [packageId]
  );
  return result.rows;
}

export async function getFieldsByRecipient(recipientId: string): Promise<SignatureField[]> {
  const result = await pool.query<SignatureField>(
    'SELECT * FROM signature_fields WHERE recipient_id = $1 ORDER BY page ASC, position_y ASC',
    [recipientId]
  );
  return result.rows;
}

export async function updateFieldValue(
  id: string,
  value: string
): Promise<SignatureField | null> {
  const result = await pool.query<SignatureField>(
    `UPDATE signature_fields 
     SET value = $2, inserted = TRUE
     WHERE id = $1
     RETURNING *`,
    [id, value]
  );
  return result.rows[0] || null;
}

export async function clearFieldValue(id: string): Promise<SignatureField | null> {
  const result = await pool.query<SignatureField>(
    `UPDATE signature_fields 
     SET value = NULL, inserted = FALSE
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

// ==========================================
// Signatures
// ==========================================

export async function createSignature(
  fieldId: string,
  recipientId: string,
  data: {
    signatureImage?: string;
    typedSignature?: string;
    kycVerifiedName?: string;
    kycNftAddress?: string;
    walletSignature?: string;
    walletAddress?: string;
    documentHash?: string;
  }
): Promise<Signature> {
  const result = await pool.query<Signature>(
    `INSERT INTO signatures (field_id, recipient_id, signature_image, typed_signature, kyc_verified_name, kyc_nft_address, wallet_signature, wallet_address, document_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fieldId,
      recipientId,
      data.signatureImage || null,
      data.typedSignature || null,
      data.kycVerifiedName || null,
      data.kycNftAddress || null,
      data.walletSignature || null,
      data.walletAddress || null,
      data.documentHash || null,
    ]
  );
  return result.rows[0];
}

export async function getSignatureByField(fieldId: string): Promise<Signature | null> {
  const result = await pool.query<Signature>(
    'SELECT * FROM signatures WHERE field_id = $1',
    [fieldId]
  );
  return result.rows[0] || null;
}

export async function deleteSignatureByField(fieldId: string): Promise<void> {
  await pool.query('DELETE FROM signatures WHERE field_id = $1', [fieldId]);
}

export async function getSignaturesByPackage(packageId: string): Promise<Signature[]> {
  const result = await pool.query<Signature>(
    `SELECT s.* FROM signatures s
     JOIN signature_fields f ON s.field_id = f.id
     WHERE f.package_id = $1`,
    [packageId]
  );
  return result.rows;
}

// ==========================================
// Audit Logs
// ==========================================

export async function createAuditLog(
  packageId: string | null,
  eventType: AuditEventType,
  data: {
    userWallet?: string;
    userEmail?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<AuditLog> {
  const result = await pool.query<AuditLog>(
    `INSERT INTO audit_logs (package_id, event_type, user_wallet, user_email, ip_address, user_agent, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      packageId,
      eventType,
      data.userWallet || null,
      data.userEmail || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.metadata ? JSON.stringify(data.metadata) : '{}',
    ]
  );
  return result.rows[0];
}

export async function getAuditLogsByPackage(packageId: string): Promise<AuditLog[]> {
  const result = await pool.query<AuditLog>(
    'SELECT * FROM audit_logs WHERE package_id = $1 ORDER BY created_at ASC',
    [packageId]
  );
  return result.rows;
}

// ==========================================
// Helper Functions
// ==========================================

export async function checkAllRecipientsSigned(packageId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT COUNT(*) as total, 
            COUNT(*) FILTER (WHERE signing_status = 'signed') as signed
     FROM recipients 
     WHERE package_id = $1 AND role = 'signer'`,
    [packageId]
  );
  
  const { total, signed } = result.rows[0];
  return parseInt(total) > 0 && parseInt(total) === parseInt(signed);
}

export async function getPackageWithRecipients(packageId: string): Promise<{
  package: SignaturePackage;
  recipients: Recipient[];
  fields: SignatureField[];
} | null> {
  const pkg = await getPackageById(packageId);
  if (!pkg) return null;
  
  const recipients = await getRecipientsByPackage(packageId);
  const fields = await getFieldsByPackage(packageId);
  
  return { package: pkg, recipients, fields };
}

// ==========================================
// Deletion Functions
// ==========================================

export async function deletePackage(packageId: string): Promise<void> {
  await pool.query('DELETE FROM signature_packages WHERE id = $1', [packageId]);
}

export async function deleteRecipientsByPackage(packageId: string): Promise<void> {
  await pool.query('DELETE FROM recipients WHERE package_id = $1', [packageId]);
}

export async function deleteFieldsByPackage(packageId: string): Promise<void> {
  await pool.query('DELETE FROM signature_fields WHERE package_id = $1', [packageId]);
}

export async function deleteSignaturesByPackage(packageId: string): Promise<void> {
  await pool.query(
    `DELETE FROM signatures 
     WHERE field_id IN (SELECT id FROM signature_fields WHERE package_id = $1)`,
    [packageId]
  );
}

export async function deleteAuditLogsByPackage(packageId: string): Promise<void> {
  await pool.query('DELETE FROM audit_logs WHERE package_id = $1', [packageId]);
}
