import { Router, Request, Response } from 'express';
import * as db from '../db/schema.js';
import * as documentService from '../services/document.js';
import { getKYCVerifiedNames } from '../services/kyc-lookup.js';

const router = Router();

/**
 * @openapi
 * /api/inbox/{walletAddress}:
 *   get:
 *     summary: Get wallet's pending documents
 *     description: |
 *       Retrieve all documents pending signature for this wallet.
 *       Returns documents where the wallet address matches a recipient.
 *     tags: [Inbox]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: Aptos wallet address
 *     responses:
 *       200:
 *         description: List of pending documents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletAddress:
 *                   type: string
 *                 pendingCount:
 *                   type: integer
 *                 documents:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       status:
 *                         type: string
 *                       ownerWallet:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                       signingToken:
 *                         type: string
 */
router.get('/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    // Validate wallet address
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      res.status(400).json({ error: 'Invalid wallet address format' });
      return;
    }

    // Get recipients for this wallet with pending status
    const recipients = await db.getRecipientsByWallet(walletAddress);

    // Build response with document info
    const documents = recipients.map((r: any) => ({
      id: r.package_id,
      title: r.package_title,
      status: r.package_status,
      ownerWallet: r.owner_wallet_address,
      createdAt: r.package_created_at,
      recipientRole: r.role,
      signingStatus: r.signing_status,
      signingToken: r.token,
      signingUrl: `/sign/${r.token}`,
    }));

    // Get KYC info for the wallet
    const kycNames = await getKYCVerifiedNames(walletAddress);

    res.json({
      walletAddress,
      hasKYC: kycNames.length > 0,
      kycVerifiedNames: kycNames,
      pendingCount: documents.length,
      documents,
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

/**
 * @openapi
 * /api/inbox/{walletAddress}/{documentId}:
 *   get:
 *     summary: Get specific document for wallet signing
 *     description: |
 *       Validates that the wallet is a recipient on this document
 *       and returns full document details for signing.
 *     tags: [Inbox]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document details for signing
 *       403:
 *         description: Wallet is not a recipient on this document
 *       404:
 *         description: Document not found
 */
router.get('/:walletAddress/:documentId', async (req: Request, res: Response) => {
  try {
    const { walletAddress, documentId } = req.params;

    // Validate wallet address
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      res.status(400).json({ error: 'Invalid wallet address format' });
      return;
    }

    // Get document
    const doc = await documentService.getDocument(documentId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Find recipient matching this wallet
    const recipient = doc.recipients.find(
      r => r.wallet_address?.toLowerCase() === walletAddress.toLowerCase()
    );

    if (!recipient) {
      res.status(403).json({ 
        error: 'Wallet is not a recipient on this document',
        walletAddress 
      });
      return;
    }

    // Get fields for this recipient
    const recipientFields = doc.fields.filter(f => f.recipient_id === recipient.id);

    // Get signatures
    const fieldsWithSignatures = await Promise.all(
      recipientFields.map(async (field) => {
        const signature = await db.getSignatureByField(field.id);
        return {
          ...field,
          signed: !!signature,
        };
      })
    );

    // Get KYC verified names
    const kycNames = await getKYCVerifiedNames(walletAddress);

    // Log view
    await db.createAuditLog(documentId, 'document_viewed', {
      userWallet: walletAddress,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || undefined,
    });

    res.json({
      document: {
        id: doc.package.id,
        title: doc.package.title,
        status: doc.package.status,
        ownerWallet: doc.package.owner_wallet_address,
        createdAt: doc.package.created_at,
      },
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        signingStatus: recipient.signing_status,
        token: recipient.token,
      },
      fields: fieldsWithSignatures,
      totalFields: recipientFields.length,
      signedFields: fieldsWithSignatures.filter(f => f.signed).length,
      allFieldsSigned: fieldsWithSignatures.every(f => f.signed),
      kycVerifiedNames: kycNames,
      hasKYC: kycNames.length > 0,
      signingUrl: `/sign/${recipient.token}`,
    });
  } catch (error) {
    console.error('Error fetching document for wallet:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Helper function
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export default router;
