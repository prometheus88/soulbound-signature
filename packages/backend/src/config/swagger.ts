import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index.js';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Soulbound Signature API',
    version: '1.0.0',
    description: `
x402-powered e-signature service with KYC-verified wallet signing on Aptos.

## Overview
This API provides document signing capabilities with support for:
- Traditional e-signatures (draw/type)
- KYC-verified wallet signatures using Soulbound KYC NFTs
- 11 field types including signature, initials, text, checkbox, dropdown, and more

## Authentication
Document creation requires x402 payment authentication. Include a \`PAYMENT-SIGNATURE\` header with a base64-encoded signed payment transaction.

## Workflow

### For Human Users (UI)
1. **Upload PDF** - Upload your document via the frontend
2. **Add Fields** - Place signature fields on the document
3. **Add Recipients** - Specify signers by wallet address or email
4. **Distribute** - Send document for signing

### For Agentic Users (API)
1. **Learn API** - Call \`GET /api/docs/field-types\` to understand field options
2. **Create Document** - Submit HTML with \`<sig-field>\` elements to \`POST /api/documents/create\`
3. **Get Signing Links** - Distribute the returned signing links to recipients

### Signing
1. **Open Document** - Via token link or wallet inbox
2. **Connect Wallet** - If using KYC-verified signature
3. **Sign Fields** - Complete all required fields
4. **Confirmation** - View final confirmation page with all signatures
    `,
    contact: {
      name: 'Soulbound Signature',
      url: 'https://github.com/soulbound-signature',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server',
    },
  ],
  tags: [
    {
      name: 'Documents',
      description: 'Document creation and management (x402 payment required)',
    },
    {
      name: 'Signing',
      description: 'Document signing endpoints (free for recipients)',
    },
    {
      name: 'Inbox',
      description: 'Wallet-based document inbox',
    },
    {
      name: 'KYC',
      description: 'KYC NFT verification for wallet signing',
    },
    {
      name: 'Agentic',
      description: 'Documentation and tools for programmatic users',
    },
    {
      name: 'Discovery',
      description: 'x402 Bazaar-compatible discovery',
    },
    {
      name: 'Health',
      description: 'Service health checks',
    },
  ],
  components: {
    securitySchemes: {
      x402Payment: {
        type: 'apiKey',
        in: 'header',
        name: 'PAYMENT-SIGNATURE',
        description: 'Base64-encoded x402 payment signature',
      },
    },
    schemas: {
      CreateDocumentRequest: {
        type: 'object',
        required: ['title', 'format', 'recipients'],
        properties: {
          title: {
            type: 'string',
            description: 'Document title',
            example: 'Service Agreement',
          },
          format: {
            type: 'string',
            enum: ['html', 'pdf'],
            description: 'Document format',
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
              $ref: '#/components/schemas/RecipientInput',
            },
          },
        },
      },
      RecipientInput: {
        type: 'object',
        required: ['name'],
        properties: {
          walletAddress: {
            type: 'string',
            description: 'Aptos wallet address',
            example: '0x1234...',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address',
          },
          name: {
            type: 'string',
            description: 'Display name',
          },
          role: {
            type: 'string',
            enum: ['signer', 'viewer', 'cc'],
            default: 'signer',
          },
          signingOrder: {
            type: 'integer',
            description: 'Order for sequential signing',
          },
        },
      },
      CreateDocumentResponse: {
        type: 'object',
        properties: {
          documentId: {
            type: 'string',
            format: 'uuid',
          },
          status: {
            type: 'string',
            enum: ['draft', 'pending', 'completed', 'cancelled'],
          },
          signingLinks: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              format: 'uri',
            },
          },
          previewUrl: {
            type: 'string',
            format: 'uri',
          },
        },
      },
      SignFieldRequest: {
        type: 'object',
        properties: {
          signatureImage: {
            type: 'string',
            description: 'Base64-encoded signature image',
          },
          typedSignature: {
            type: 'string',
            description: 'Typed signature text',
          },
          kycNftAddress: {
            type: 'string',
            description: 'Address of KYC NFT for verified signing',
          },
          verifiedName: {
            type: 'string',
            description: 'KYC-verified name to use',
          },
          value: {
            type: 'string',
            description: 'Value for non-signature fields',
          },
        },
      },
      KYCVerifiedIdentity: {
        type: 'object',
        properties: {
          nftAddress: {
            type: 'string',
          },
          fullName: {
            type: 'string',
          },
          country: {
            type: 'string',
          },
          verificationDate: {
            type: 'integer',
          },
        },
      },
      DiscoveryResource: {
        type: 'object',
        properties: {
          resource: {
            type: 'string',
          },
          type: {
            type: 'string',
            example: 'http',
          },
          x402Version: {
            type: 'integer',
            example: 2,
          },
          accepts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                scheme: { type: 'string' },
                network: { type: 'string' },
                amount: { type: 'string' },
                asset: { type: 'string' },
                payTo: { type: 'string' },
              },
            },
          },
          lastUpdated: {
            type: 'string',
            format: 'date-time',
          },
          metadata: {
            type: 'object',
          },
        },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
