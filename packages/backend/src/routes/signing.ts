import { Router, Request, Response } from 'express';
import * as db from '../db/schema.js';
import * as documentService from '../services/document.js';
import { getKYCVerifiedNames, verifyKYCName } from '../services/kyc-lookup.js';
import type { SignFieldRequest } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /api/sign/{token}:
 *   get:
 *     summary: Get signing session
 *     description: |
 *       Retrieve document, fields, and recipient info for signing.
 *       If a wallet address is provided, also returns KYC-verified names.
 *     tags: [Signing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique signing token for this recipient
 *       - in: query
 *         name: walletAddress
 *         required: false
 *         schema:
 *           type: string
 *         description: Connected wallet address for KYC lookup
 *     responses:
 *       200:
 *         description: Signing session data
 *       404:
 *         description: Invalid or expired signing token
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { walletAddress } = req.query;

    // Get recipient by token
    const recipient = await db.getRecipientByToken(token);
    if (!recipient) {
      res.status(404).json({ error: 'Invalid signing token' });
      return;
    }

    // Get document and fields
    const doc = await documentService.getDocument(recipient.package_id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Check document status
    if (doc.package.status === 'cancelled') {
      res.status(400).json({ error: 'This document has been cancelled' });
      return;
    }

    if (doc.package.status === 'completed') {
      res.status(400).json({ error: 'This document has already been completed' });
      return;
    }

    // Get fields for this recipient
    const recipientFields = doc.fields.filter(f => f.recipient_id === recipient.id);

    // Get existing signatures for these fields
    const fieldsWithSignatures = await Promise.all(
      recipientFields.map(async (field) => {
        const signature = await db.getSignatureByField(field.id);
        
        // Determine signature type
        let signatureType: 'wallet' | 'kyc' | 'typed' | 'drawn' | null = null;
        if (signature) {
          if (signature.wallet_signature) {
            signatureType = 'wallet';
          } else if (signature.kyc_verified_name) {
            signatureType = 'kyc';
          } else if (signature.typed_signature) {
            signatureType = 'typed';
          } else if (signature.signature_image) {
            signatureType = 'drawn';
          }
        }

        return {
          ...field,
          signed: !!signature,
          signature: signature ? {
            type: signatureType,
            typedSignature: signature.typed_signature,
            signatureImage: signature.signature_image,
            kycVerifiedName: signature.kyc_verified_name,
            kycNftAddress: signature.kyc_nft_address,
            walletSignature: signature.wallet_signature,
            walletAddress: signature.wallet_address,
            documentHash: signature.document_hash,
            signedAt: signature.signed_at,
          } : null,
        };
      })
    );

    // Log document view
    await db.createAuditLog(recipient.package_id, 'document_viewed', {
      userWallet: walletAddress as string | undefined,
      userEmail: recipient.email || undefined,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || undefined,
    });

    // If wallet connected, get KYC verified names
    let kycVerifiedNames = null;
    if (walletAddress) {
      kycVerifiedNames = await getKYCVerifiedNames(walletAddress as string);
    }

    res.json({
      document: {
        id: doc.package.id,
        title: doc.package.title,
        status: doc.package.status,
        createdAt: doc.package.created_at,
      },
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        walletAddress: recipient.wallet_address,
        role: recipient.role,
        signingStatus: recipient.signing_status,
        signedAt: recipient.signed_at,
      },
      fields: fieldsWithSignatures,
      totalFields: recipientFields.length,
      signedFields: fieldsWithSignatures.filter(f => f.signed).length,
      allFieldsSigned: fieldsWithSignatures.every(f => f.signed || !isRequiredField(f)),
      kycVerifiedNames: kycVerifiedNames || [],
      hasKYC: !!kycVerifiedNames && kycVerifiedNames.length > 0,
    });
  } catch (error) {
    console.error('Error getting signing session:', error);
    res.status(500).json({ error: 'Failed to get signing session' });
  }
});

/**
 * @openapi
 * /api/sign/{token}/field/{fieldId}:
 *   post:
 *     summary: Sign a specific field
 *     description: |
 *       Sign a field with one of three methods:
 *       - KYC-verified: Provide kycNftAddress and verifiedName
 *       - Typed: Provide typedSignature
 *       - Drawn: Provide signatureImage (base64)
 *       
 *       For non-signature fields, provide the value directly.
 *     tags: [Signing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SignFieldRequest'
 *     responses:
 *       200:
 *         description: Field signed successfully
 *       400:
 *         description: Invalid request or KYC verification failed
 *       404:
 *         description: Token or field not found
 */
router.post('/:token/field/:fieldId', async (req: Request, res: Response) => {
  try {
    const { token, fieldId } = req.params;
    const body = req.body as SignFieldRequest;

    // Get recipient
    const recipient = await db.getRecipientByToken(token);
    if (!recipient) {
      res.status(404).json({ error: 'Invalid signing token' });
      return;
    }

    // Get field
    const field = await db.getFieldById(fieldId);
    if (!field) {
      res.status(404).json({ error: 'Field not found' });
      return;
    }

    // Verify field belongs to this recipient
    if (field.recipient_id !== recipient.id) {
      res.status(403).json({ error: 'Field does not belong to this recipient' });
      return;
    }

    // Check if already signed
    const existingSignature = await db.getSignatureByField(fieldId);
    if (existingSignature) {
      res.status(400).json({ error: 'Field has already been signed' });
      return;
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Handle based on field type
    if (isSignatureField(field.field_type)) {
      // Signature fields require signature data
      if (body.kycNftAddress && body.verifiedName) {
        // KYC-verified signature (may also include wallet signature)
        console.log('KYC signing request received:', {
          kycNftAddress: body.kycNftAddress,
          verifiedName: body.verifiedName,
          hasWalletSignature: !!body.walletSignature,
          walletAddress: body.walletAddress,
          hasDocumentHash: !!body.documentHash,
        });

        // Verify the name belongs to a KYC NFT
        const verification = await verifyKYCName(
          recipient.wallet_address || body.walletAddress || '',
          body.verifiedName,
          body.kycNftAddress
        );

        if (!verification.verified) {
          res.status(400).json({ 
            error: 'KYC verification failed',
            reason: verification.error 
          });
          return;
        }

        // Create signature record with both KYC and wallet data if provided
        const signatureData = {
          kycVerifiedName: body.verifiedName,
          kycNftAddress: body.kycNftAddress,
          walletSignature: body.walletSignature || undefined,
          walletAddress: body.walletAddress || undefined,
          documentHash: body.documentHash || undefined,
        };
        console.log('Creating KYC signature with data:', signatureData);
        
        await db.createSignature(fieldId, recipient.id, signatureData);

        // Update field value
        await db.updateFieldValue(fieldId, `[KYC: ${body.verifiedName}]`);

      } else if (body.walletSignature && body.walletAddress && body.documentHash) {
        // Cryptographic wallet signature (without KYC)
        await db.createSignature(fieldId, recipient.id, {
          walletSignature: body.walletSignature,
          walletAddress: body.walletAddress,
          documentHash: body.documentHash,
        });

        // Update field value with wallet info
        const shortAddr = `${body.walletAddress.slice(0, 6)}...${body.walletAddress.slice(-4)}`;
        await db.updateFieldValue(fieldId, `[Wallet: ${shortAddr}]`);

      } else if (body.typedSignature) {
        // Typed signature
        await db.createSignature(fieldId, recipient.id, {
          typedSignature: body.typedSignature,
        });
        await db.updateFieldValue(fieldId, body.typedSignature);

      } else if (body.signatureImage) {
        // Drawn signature
        await db.createSignature(fieldId, recipient.id, {
          signatureImage: body.signatureImage,
        });
        await db.updateFieldValue(fieldId, '[signature image]');

      } else {
        res.status(400).json({ 
          error: 'Signature field requires walletSignature, signatureImage, typedSignature, or kycNftAddress+verifiedName' 
        });
        return;
      }
    } else {
      // Non-signature fields (text, number, checkbox, etc.)
      if (body.value === undefined) {
        res.status(400).json({ error: 'value is required for this field type' });
        return;
      }

      await db.updateFieldValue(fieldId, body.value);
      
      // Create a signature record for audit trail
      await db.createSignature(fieldId, recipient.id, {
        typedSignature: String(body.value),
      });
    }

    // Create audit log
    await db.createAuditLog(recipient.package_id, 'field_signed', {
      userWallet: recipient.wallet_address || undefined,
      userEmail: recipient.email || undefined,
      ipAddress,
      userAgent,
      metadata: {
        fieldId,
        fieldType: field.field_type,
        isKYC: !!(body.kycNftAddress && body.verifiedName),
      },
    });

    res.json({
      success: true,
      fieldId,
      message: 'Field signed successfully',
    });
  } catch (error) {
    console.error('Error signing field:', error);
    res.status(500).json({ error: 'Failed to sign field' });
  }
});

/**
 * @openapi
 * /api/sign/{token}/field/{fieldId}:
 *   delete:
 *     summary: Unsign/remove a field signature
 *     description: Remove a signature from a field so it can be re-signed. Only works before completing the signing session.
 *     tags: [Signing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: fieldId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Field unsigned successfully
 *       400:
 *         description: Cannot unsign after completing
 *       404:
 *         description: Token or field not found
 */
router.delete('/:token/field/:fieldId', async (req: Request, res: Response) => {
  try {
    const { token, fieldId } = req.params;

    // Get recipient
    const recipient = await db.getRecipientByToken(token);
    if (!recipient) {
      res.status(404).json({ error: 'Invalid signing token' });
      return;
    }

    // Cannot unsign after completing
    if (recipient.signing_status === 'signed') {
      res.status(400).json({ error: 'Cannot unsign after completing the signing session' });
      return;
    }

    // Get field
    const field = await db.getFieldById(fieldId);
    if (!field) {
      res.status(404).json({ error: 'Field not found' });
      return;
    }

    // Verify field belongs to this recipient
    if (field.recipient_id !== recipient.id) {
      res.status(403).json({ error: 'Field does not belong to this recipient' });
      return;
    }

    // Delete the signature
    await db.deleteSignatureByField(fieldId);
    
    // Clear the field value
    await db.clearFieldValue(fieldId);

    // Create audit log
    await db.createAuditLog(recipient.package_id, 'field_signed', {
      userWallet: recipient.wallet_address || undefined,
      userEmail: recipient.email || undefined,
      metadata: {
        fieldId,
        fieldType: field.field_type,
        action: 'unsigned',
      },
    });

    res.json({
      success: true,
      fieldId,
      message: 'Field unsigned successfully',
    });
  } catch (error) {
    console.error('Error unsigning field:', error);
    res.status(500).json({ error: 'Failed to unsign field' });
  }
});

/**
 * @openapi
 * /api/sign/{token}/complete:
 *   post:
 *     summary: Complete signing session
 *     description: Mark recipient's signing as complete after all required fields are signed
 *     tags: [Signing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Signing completed
 *       400:
 *         description: Not all required fields are signed
 */
router.post('/:token/complete', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Get recipient
    const recipient = await db.getRecipientByToken(token);
    if (!recipient) {
      res.status(404).json({ error: 'Invalid signing token' });
      return;
    }

    // Get recipient's fields
    const fields = await db.getFieldsByRecipient(recipient.id);

    // Check all required fields are signed
    const unsignedRequired = [];
    for (const field of fields) {
      if (isRequiredField(field)) {
        const signature = await db.getSignatureByField(field.id);
        if (!signature) {
          unsignedRequired.push(field);
        }
      }
    }

    if (unsignedRequired.length > 0) {
      res.status(400).json({
        error: 'Not all required fields are signed',
        unsignedFields: unsignedRequired.map(f => ({
          id: f.id,
          type: f.field_type,
        })),
      });
      return;
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';

    // Update recipient status
    await db.updateRecipientStatus(recipient.id, 'signed', ipAddress, userAgent);

    // Create audit log
    await db.createAuditLog(recipient.package_id, 'signing_completed', {
      userWallet: recipient.wallet_address || undefined,
      userEmail: recipient.email || undefined,
      ipAddress,
      userAgent,
      metadata: {
        recipientName: recipient.name,
        signedAt: new Date().toISOString(),
      },
    });

    // Check if all recipients have signed
    const documentCompleted = await documentService.checkAndCompleteDocument(recipient.package_id);

    res.json({
      success: true,
      message: 'Signing completed successfully',
      recipientStatus: 'signed',
      documentCompleted,
      signedAt: new Date().toISOString(),
      ipAddress,
    });
  } catch (error) {
    console.error('Error completing signing:', error);
    res.status(500).json({ error: 'Failed to complete signing' });
  }
});

// Helper functions

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isSignatureField(fieldType: string): boolean {
  return ['signature', 'free-signature', 'initial'].includes(fieldType);
}

function isRequiredField(field: { field_type: string; field_meta?: unknown }): boolean {
  // Signature fields are always required
  if (isSignatureField(field.field_type)) {
    return true;
  }

  // Check field meta for required flag
  const meta = field.field_meta as { required?: boolean } | null;
  return meta?.required === true;
}

export default router;
