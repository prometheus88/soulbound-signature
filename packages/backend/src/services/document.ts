import { config } from '../config/index.js';
import * as db from '../db/schema.js';
import type {
  CreateDocumentRequest,
  CreateDocumentResponse,
  SignaturePackage,
  Recipient,
  SignatureField,
  FieldType,
  FieldMeta,
  PaymentInfo,
} from '../types/index.js';

// ==========================================
// Document Creation
// ==========================================

export async function createDocument(
  request: CreateDocumentRequest,
  paymentInfo: PaymentInfo
): Promise<CreateDocumentResponse & { recipients: Array<{ id: string; name: string }> }> {
  // Create the package
  const pkg = await db.createPackage(
    request.title,
    paymentInfo.payer,
    paymentInfo.transactionHash,
    request.format === 'pdf' ? request.pdfBase64 : undefined,
    request.format === 'html' ? request.content : undefined
  );

  // Create recipients and collect signing links
  const signingLinks: Record<string, string> = {};
  const recipientMap: Map<number, string> = new Map(); // recipient number -> recipient ID
  const recipients: Array<{ id: string; name: string }> = [];

  for (let i = 0; i < request.recipients.length; i++) {
    const recipientInput = request.recipients[i];
    const recipient = await db.createRecipient(pkg.id, {
      ...recipientInput,
      signingOrder: recipientInput.signingOrder ?? i + 1,
    });

    // Map recipient number (1-indexed) to recipient ID
    recipientMap.set(i + 1, recipient.id);
    recipients.push({ id: recipient.id, name: recipient.name });

    // Generate signing link
    const baseUrl = config.frontendUrl;
    signingLinks[`recipient_${i + 1}`] = `${baseUrl}/sign/${recipient.token}`;
  }

  // If HTML format, parse and create fields from <sig-field> elements
  if (request.format === 'html' && request.content) {
    await parseAndCreateFieldsFromHtml(pkg.id, request.content, recipientMap);
  }

  // Create audit log
  await db.createAuditLog(pkg.id, 'document_created', {
    userWallet: paymentInfo.payer,
    metadata: {
      title: request.title,
      format: request.format,
      recipientCount: request.recipients.length,
      paymentTxHash: paymentInfo.transactionHash,
    },
  });

  // Generate preview URL
  const previewUrl = `${config.frontendUrl.replace(':3000', ':4000')}/api/documents/${pkg.id}/preview`;

  return {
    documentId: pkg.id,
    status: pkg.status,
    signingLinks,
    previewUrl,
    recipients,
  };
}

// ==========================================
// Field Parsing from HTML
// ==========================================

interface ParsedField {
  type: FieldType;
  recipient: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  meta?: FieldMeta;
}

async function parseAndCreateFieldsFromHtml(
  packageId: string,
  html: string,
  recipientMap: Map<number, string>
): Promise<void> {
  // Parse <sig-field> elements from HTML
  // This is a simplified parser - in production, use a proper HTML parser
  const sigFieldRegex = /<sig-field\s+([^>]*)\/?\s*>/gi;
  let match;
  let fieldIndex = 0;

  while ((match = sigFieldRegex.exec(html)) !== null) {
    const attributesStr = match[1];
    const attributes = parseAttributes(attributesStr);

    const fieldType = attributes.type as FieldType;
    const recipientNum = parseInt(attributes.recipient || '1', 10);
    const recipientId = recipientMap.get(recipientNum);

    if (!recipientId) {
      console.warn(`No recipient found for number ${recipientNum}`);
      continue;
    }

    // Parse field metadata
    const fieldMeta: FieldMeta = {};
    if (attributes.placeholder) fieldMeta.placeholder = attributes.placeholder;
    if (attributes.required === 'true') fieldMeta.required = true;
    if (attributes['text-align']) fieldMeta.textAlign = attributes['text-align'] as 'left' | 'center' | 'right';
    if (attributes['character-limit']) fieldMeta.characterLimit = parseInt(attributes['character-limit'], 10);
    if (attributes.min) fieldMeta.min = parseFloat(attributes.min);
    if (attributes.max) fieldMeta.max = parseFloat(attributes.max);
    if (attributes.format) fieldMeta.format = attributes.format;
    if (attributes.direction) fieldMeta.direction = attributes.direction as 'vertical' | 'horizontal';
    if (attributes.default) fieldMeta.defaultValue = attributes.default;
    if (attributes.values) {
      try {
        fieldMeta.values = JSON.parse(attributes.values);
      } catch (e) {
        console.warn('Failed to parse values attribute:', attributes.values);
      }
    }

    // Create the field
    // Position will be determined during PDF rendering
    // For now, use placeholder positions based on field index
    await db.createField(
      packageId,
      recipientId,
      fieldType,
      1, // page
      0, // x - will be set during rendering
      fieldIndex * 80, // y - temporary positioning
      parseFloat(attributes.width || '200'),
      parseFloat(attributes.height || '60'),
      Object.keys(fieldMeta).length > 0 ? fieldMeta : undefined
    );

    fieldIndex++;
  }
}

function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match attribute="value" or attribute='value' or attribute=value
  const attrRegex = /(\w+(?:-\w+)?)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(str)) !== null) {
    const name = match[1];
    const value = match[2] || match[3] || match[4];
    attrs[name] = value;
  }

  return attrs;
}

// ==========================================
// Document Management
// ==========================================

export async function getDocument(documentId: string): Promise<{
  package: SignaturePackage;
  recipients: Recipient[];
  fields: SignatureField[];
} | null> {
  return db.getPackageWithRecipients(documentId);
}

export async function getDocumentsByOwner(walletAddress: string): Promise<SignaturePackage[]> {
  return db.getPackagesByOwner(walletAddress);
}

export async function distributeDocument(documentId: string): Promise<SignaturePackage | null> {
  // Update status to pending
  const pkg = await db.updatePackageStatus(documentId, 'pending');
  
  if (pkg) {
    await db.createAuditLog(documentId, 'document_distributed', {
      userWallet: pkg.owner_wallet_address,
      metadata: { distributedAt: new Date().toISOString() },
    });
  }

  return pkg;
}

export async function addFieldToDocument(
  documentId: string,
  recipientId: string,
  fieldType: FieldType,
  page: number,
  positionX: number,
  positionY: number,
  width: number,
  height: number,
  fieldMeta?: FieldMeta
): Promise<SignatureField> {
  return db.createField(
    documentId,
    recipientId,
    fieldType,
    page,
    positionX,
    positionY,
    width,
    height,
    fieldMeta
  );
}

export async function updateDocumentPdf(
  documentId: string,
  pdfBase64: string
): Promise<SignaturePackage | null> {
  return db.updatePackageDocument(documentId, pdfBase64);
}

// ==========================================
// Document Completion
// ==========================================

export async function checkAndCompleteDocument(documentId: string): Promise<boolean> {
  const allSigned = await db.checkAllRecipientsSigned(documentId);
  
  if (allSigned) {
    // Generate and append the confirmation page
    await generateFinalDocument(documentId);
    
    await db.updatePackageStatus(documentId, 'completed');
    await db.createAuditLog(documentId, 'document_completed', {
      metadata: { completedAt: new Date().toISOString() },
    });
    return true;
  }
  
  return false;
}

/**
 * Generate the final signed document with rendered fields and confirmation page
 */
async function generateFinalDocument(documentId: string): Promise<void> {
  const { appendConfirmationPage, renderFieldsOnPdf } = await import('./certificate.js');
  
  const doc = await db.getPackageById(documentId);
  if (!doc || !doc.document_data) {
    console.log('No document data to finalize');
    return;
  }

  try {
    // Decode original PDF
    const originalPdfBytes = new Uint8Array(Buffer.from(doc.document_data, 'base64'));
    
    // Step 1: Render all field values onto the PDF
    console.log('Rendering field values onto PDF...');
    const renderedPdfBytes = await renderFieldsOnPdf(originalPdfBytes, documentId);
    
    // Step 2: Append confirmation page
    console.log('Appending confirmation page...');
    const finalPdfBytes = await appendConfirmationPage(
      new Uint8Array(renderedPdfBytes),
      documentId,
      doc.title
    );
    
    // Save back to database
    const finalPdfBase64 = Buffer.from(finalPdfBytes).toString('base64');
    await db.updatePackageDocument(documentId, finalPdfBase64);
    
    console.log('Final document with fields and confirmation page generated');
  } catch (error) {
    console.error('Error generating final document:', error);
    // Don't fail the completion if document generation fails
  }
}

/**
 * Get the final signed document for download
 */
export async function getSignedDocument(documentId: string): Promise<{
  pdfBytes: Buffer;
  filename: string;
  title: string;
} | null> {
  const doc = await db.getPackageById(documentId);
  if (!doc) return null;

  if (!doc.document_data) {
    return null;
  }

  const pdfBytes = Buffer.from(doc.document_data, 'base64');
  const filename = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}_signed.pdf`;

  return {
    pdfBytes,
    filename,
    title: doc.title,
  };
}

// ==========================================
// Document Cancellation
// ==========================================

export async function cancelDocument(documentId: string): Promise<SignaturePackage | null> {
  const pkg = await db.updatePackageStatus(documentId, 'cancelled');
  
  if (pkg) {
    await db.createAuditLog(documentId, 'document_cancelled', {
      userWallet: pkg.owner_wallet_address,
      metadata: { cancelledAt: new Date().toISOString() },
    });
  }

  return pkg;
}

// ==========================================
// Document Deletion
// ==========================================

export async function deleteDocument(documentId: string): Promise<void> {
  // Get the document first for audit purposes
  const doc = await db.getPackageById(documentId);
  
  // Delete in order: signatures -> fields -> recipients -> audit_logs -> package
  await db.deleteSignaturesByPackage(documentId);
  await db.deleteFieldsByPackage(documentId);
  await db.deleteRecipientsByPackage(documentId);
  await db.deleteAuditLogsByPackage(documentId);
  await db.deletePackage(documentId);
}
