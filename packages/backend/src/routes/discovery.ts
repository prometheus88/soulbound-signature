import { Router } from 'express';
import { config } from '../config/index.js';
import { buildPaymentRequirements } from '../middleware/x402.js';
import type { DiscoveryResource } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /discovery/resources:
 *   get:
 *     summary: x402 Bazaar-compatible discovery endpoint
 *     description: Returns a catalog of available x402-protected resources for AI agent discovery
 *     tags: [Discovery]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           default: http
 *         description: Filter by protocol type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of resources to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: List of discoverable resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 x402Version:
 *                   type: integer
 *                   example: 2
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DiscoveryResource'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 */
router.get('/resources', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const paymentRequirements = buildPaymentRequirements();

  // Define our discoverable resources
  const resources: DiscoveryResource[] = [
    {
      resource: `${baseUrl}/api/documents/create`,
      type: 'http',
      x402Version: 2,
      accepts: [paymentRequirements],
      lastUpdated: new Date().toISOString(),
      metadata: {
        description: `Soulbound Signature Service - Create e-signature packages with KYC-verified wallet signing. Price: ${config.x402.signaturePriceUsdc} USDC`,
        input: {
          schema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Document title',
              },
              format: {
                type: 'string',
                enum: ['html', 'pdf'],
                description: 'Document format - use "html" for agentic creation with <sig-field> elements',
              },
              content: {
                type: 'string',
                description: 'HTML content with <sig-field> elements (for format=html)',
              },
              pdfBase64: {
                type: 'string',
                description: 'Base64-encoded PDF (for format=pdf)',
              },
              recipients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    walletAddress: { type: 'string', description: 'Aptos wallet address' },
                    email: { type: 'string', description: 'Email address' },
                    name: { type: 'string', description: 'Display name' },
                    role: { type: 'string', enum: ['signer', 'viewer', 'cc'] },
                  },
                },
                description: 'Document recipients (must have walletAddress and/or email)',
              },
            },
            required: ['title', 'format', 'recipients'],
          },
        },
        output: {
          example: {
            documentId: 'doc_abc123',
            status: 'pending',
            signingLinks: {
              recipient_1: 'https://app.example.com/sign/token_xyz',
            },
            previewUrl: 'https://api.example.com/documents/doc_abc123/preview.pdf',
          },
          schema: {
            type: 'object',
            properties: {
              documentId: { type: 'string', description: 'Unique document ID' },
              status: { type: 'string', description: 'Document status' },
              signingLinks: { type: 'object', description: 'Signing URLs per recipient' },
              previewUrl: { type: 'string', description: 'PDF preview URL' },
            },
          },
        },
      },
    },
    {
      resource: `${baseUrl}/api/docs/field-types`,
      type: 'http',
      x402Version: 2,
      accepts: [], // Free endpoint
      lastUpdated: new Date().toISOString(),
      metadata: {
        description: 'Get supported signature field types for HTML document creation - No payment required',
        input: {
          schema: {
            type: 'object',
            properties: {},
          },
        },
        output: {
          example: {
            fieldTypes: [
              { type: 'signature', description: 'Standard signature field', category: 'signature' },
              { type: 'name', description: 'Full name field', category: 'auto-fill' },
            ],
          },
          schema: {
            type: 'object',
            properties: {
              fieldTypes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    description: { type: 'string' },
                    category: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      resource: `${baseUrl}/api/tools/pdf-to-html`,
      type: 'http',
      x402Version: 2,
      accepts: [], // Free endpoint
      lastUpdated: new Date().toISOString(),
      metadata: {
        description: 'Convert PDF to editable HTML for adding signature fields - No payment required',
        input: {
          schema: {
            type: 'object',
            properties: {
              pdfBase64: {
                type: 'string',
                description: 'Base64-encoded PDF to convert',
              },
            },
            required: ['pdfBase64'],
          },
        },
        output: {
          example: {
            success: true,
            html: '<!DOCTYPE html>...',
            instructions: 'Add <sig-field> elements and submit to /api/documents/create',
          },
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              html: { type: 'string' },
              instructions: { type: 'string' },
            },
          },
        },
      },
    },
    {
      resource: `${baseUrl}/api/kyc/names/{walletAddress}`,
      type: 'http',
      x402Version: 2,
      accepts: [], // Free endpoint
      lastUpdated: new Date().toISOString(),
      metadata: {
        description: 'Get KYC-verified names from Soulbound KYC NFTs for a wallet - No payment required',
        input: {
          schema: {
            type: 'object',
            properties: {
              walletAddress: {
                type: 'string',
                description: 'Aptos wallet address to check',
              },
            },
            required: ['walletAddress'],
          },
        },
        output: {
          example: {
            walletAddress: '0x123...',
            verifiedNames: [
              { nftAddress: '0xabc...', fullName: 'John Doe', country: 'USA', verificationDate: 1704067200 },
            ],
          },
          schema: {
            type: 'object',
            properties: {
              walletAddress: { type: 'string' },
              verifiedNames: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    nftAddress: { type: 'string' },
                    fullName: { type: 'string' },
                    country: { type: 'string' },
                    verificationDate: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  ];

  // Apply pagination
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const paginatedResources = resources.slice(offset, offset + limit);

  res.json({
    x402Version: 2,
    items: paginatedResources,
    pagination: {
      limit,
      offset,
      total: resources.length,
    },
  });
});

export default router;
