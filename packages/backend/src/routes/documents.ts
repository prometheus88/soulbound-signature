import { Router, Request, Response } from 'express';
import { x402PaymentMiddleware, attachPaymentResponseHeader } from '../middleware/x402.js';
import * as documentService from '../services/document.js';
import * as db from '../db/schema.js';
import type { CreateDocumentRequest, PaymentInfo } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /api/documents/create:
 *   post:
 *     summary: Create a new signature package
 *     description: |
 *       Create a new document for signing. Requires x402 payment.
 *       
 *       **For HTML format (agentic):** Submit HTML with `<sig-field>` elements.
 *       **For PDF format (UI):** Submit base64-encoded PDF, then add fields via PUT endpoints.
 *     tags: [Documents]
 *     security:
 *       - x402Payment: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDocumentRequest'
 *     responses:
 *       200:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateDocumentResponse'
 *       402:
 *         description: Payment required
 *       400:
 *         description: Invalid request
 */
router.post('/create', x402PaymentMiddleware, async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateDocumentRequest;
    const paymentInfo = (req as any).paymentInfo as PaymentInfo;

    // Validate required fields
    if (!body.title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    if (!body.format || !['html', 'pdf'].includes(body.format)) {
      res.status(400).json({ error: 'format must be "html" or "pdf"' });
      return;
    }

    if (body.format === 'html' && !body.content) {
      res.status(400).json({ error: 'content is required for HTML format' });
      return;
    }

    if (body.format === 'pdf' && !body.pdfBase64) {
      res.status(400).json({ error: 'pdfBase64 is required for PDF format' });
      return;
    }

    if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: 'at least one recipient is required' });
      return;
    }

    // Validate recipients have at least wallet or email
    for (const recipient of body.recipients) {
      if (!recipient.walletAddress && !recipient.email) {
        res.status(400).json({ 
          error: 'Each recipient must have walletAddress and/or email',
          recipient 
        });
        return;
      }
      if (!recipient.name) {
        res.status(400).json({ error: 'Each recipient must have a name' });
        return;
      }
    }

    // Create the document
    const result = await documentService.createDocument(body, paymentInfo);

    // Attach payment response header
    attachPaymentResponseHeader(res, paymentInfo.transactionHash, paymentInfo.payer);

    res.json(result);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

/**
 * @openapi
 * /api/documents/{id}:
 *   get:
 *     summary: Get document details
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document details
 *       404:
 *         description: Document not found
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await documentService.getDocument(id);

    if (!result) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({
      document: result.package,
      recipients: result.recipients.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        walletAddress: r.wallet_address,
        role: r.role,
        signingStatus: r.signing_status,
        signedAt: r.signed_at,
      })),
      fields: result.fields,
    });
  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/fields:
 *   put:
 *     summary: Add or update fields on a document
 *     description: Add signature fields to a document (for PDF format documents)
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     recipientId:
 *                       type: string
 *                     fieldType:
 *                       type: string
 *                     page:
 *                       type: integer
 *                     positionX:
 *                       type: number
 *                     positionY:
 *                       type: number
 *                     width:
 *                       type: number
 *                     height:
 *                       type: number
 *                     fieldMeta:
 *                       type: object
 *     responses:
 *       200:
 *         description: Fields added successfully
 *       404:
 *         description: Document not found
 */
router.put('/:id/fields', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fields } = req.body;

    const doc = await documentService.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.package.status !== 'draft') {
      res.status(400).json({ error: 'Cannot modify fields on a non-draft document' });
      return;
    }

    const createdFields = [];
    for (const field of fields) {
      const created = await documentService.addFieldToDocument(
        id,
        field.recipientId,
        field.fieldType,
        field.page || 1,
        field.positionX || 0,
        field.positionY || 0,
        field.width || 200,
        field.height || 60,
        field.fieldMeta
      );
      createdFields.push(created);
    }

    res.json({ fields: createdFields });
  } catch (error) {
    console.error('Error adding fields:', error);
    res.status(500).json({ error: 'Failed to add fields' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/recipients:
 *   put:
 *     summary: Add recipients to a document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipients:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/RecipientInput'
 *     responses:
 *       200:
 *         description: Recipients added
 *       404:
 *         description: Document not found
 */
router.put('/:id/recipients', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recipients } = req.body;

    const doc = await documentService.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.package.status !== 'draft') {
      res.status(400).json({ error: 'Cannot modify recipients on a non-draft document' });
      return;
    }

    const createdRecipients = [];
    for (const recipient of recipients) {
      const created = await db.createRecipient(id, recipient);
      createdRecipients.push(created);
    }

    res.json({ recipients: createdRecipients });
  } catch (error) {
    console.error('Error adding recipients:', error);
    res.status(500).json({ error: 'Failed to add recipients' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/distribute:
 *   post:
 *     summary: Distribute document for signing
 *     description: Change document status to pending and make it available for signing
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document distributed
 *       404:
 *         description: Document not found
 *       400:
 *         description: Document cannot be distributed
 */
router.post('/:id/distribute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const doc = await documentService.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.package.status !== 'draft') {
      res.status(400).json({ error: 'Document has already been distributed' });
      return;
    }

    // Check that there are recipients
    if (doc.recipients.length === 0) {
      res.status(400).json({ error: 'Document must have at least one recipient' });
      return;
    }

    // Check that signers have fields
    const signers = doc.recipients.filter(r => r.role === 'signer');
    for (const signer of signers) {
      const signerFields = doc.fields.filter(f => f.recipient_id === signer.id);
      if (signerFields.length === 0) {
        res.status(400).json({ 
          error: `Signer "${signer.name}" has no fields assigned`,
          recipientId: signer.id 
        });
        return;
      }
    }

    const updated = await documentService.distributeDocument(id);
    
    // Generate signing links
    const signingLinks: Record<string, string> = {};
    doc.recipients.forEach((r, i) => {
      signingLinks[`recipient_${i + 1}`] = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sign/${r.token}`;
    });

    res.json({
      document: updated,
      signingLinks,
      message: 'Document distributed successfully',
    });
  } catch (error) {
    console.error('Error distributing document:', error);
    res.status(500).json({ error: 'Failed to distribute document' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/preview:
 *   get:
 *     summary: Get document preview PDF
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document not found
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await documentService.getDocument(id);

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // If we have PDF data, return it
    if (doc.package.document_data) {
      const pdfBuffer = Buffer.from(doc.package.document_data, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.package.title}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    // If HTML, we need to render it to PDF (handled by html-renderer service)
    res.status(404).json({ error: 'PDF preview not available yet' });
  } catch (error) {
    console.error('Error getting preview:', error);
    res.status(500).json({ error: 'Failed to get preview' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/download:
 *   get:
 *     summary: Download the signed document
 *     description: Downloads the final signed PDF with signature confirmation page
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF document for download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document not found or not yet completed
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await documentService.getSignedDocument(id);

    if (!result) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.pdfBytes.length);
    res.send(result.pdfBytes);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * @openapi
 * /api/documents/owner/{walletAddress}:
 *   get:
 *     summary: Get all documents owned by a wallet
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/owner/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const documents = await documentService.getDocumentsByOwner(walletAddress);

    res.json({ documents });
  } catch (error) {
    console.error('Error getting documents by owner:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

/**
 * @openapi
 * /api/documents/{id}/cancel:
 *   post:
 *     summary: Cancel a pending document
 *     description: Cancel a document that has been sent for signing. Only the owner can cancel.
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: Owner's wallet address
 *     responses:
 *       200:
 *         description: Document cancelled successfully
 *       403:
 *         description: Not authorized to cancel this document
 *       404:
 *         description: Document not found
 *       400:
 *         description: Document cannot be cancelled
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;

    const doc = await documentService.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Verify ownership
    if (doc.package.owner_wallet_address !== walletAddress) {
      res.status(403).json({ error: 'Not authorized to cancel this document' });
      return;
    }

    // Only pending documents can be cancelled
    if (doc.package.status !== 'pending') {
      res.status(400).json({ 
        error: `Cannot cancel a document with status "${doc.package.status}". Only pending documents can be cancelled.` 
      });
      return;
    }

    const updated = await documentService.cancelDocument(id);

    res.json({
      document: updated,
      message: 'Document cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling document:', error);
    res.status(500).json({ error: 'Failed to cancel document' });
  }
});

/**
 * @openapi
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     description: Delete a document. Only draft or cancelled documents can be deleted, and only by the owner.
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               walletAddress:
 *                 type: string
 *                 description: Owner's wallet address
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       403:
 *         description: Not authorized to delete this document
 *       404:
 *         description: Document not found
 *       400:
 *         description: Document cannot be deleted
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { walletAddress } = req.body;

    const doc = await documentService.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Verify ownership
    if (doc.package.owner_wallet_address !== walletAddress) {
      res.status(403).json({ error: 'Not authorized to delete this document' });
      return;
    }

    // Only draft or cancelled documents can be deleted
    if (doc.package.status !== 'draft' && doc.package.status !== 'cancelled') {
      res.status(400).json({ 
        error: `Cannot delete a document with status "${doc.package.status}". Only draft or cancelled documents can be deleted.` 
      });
      return;
    }

    await documentService.deleteDocument(id);

    res.json({
      message: 'Document deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
