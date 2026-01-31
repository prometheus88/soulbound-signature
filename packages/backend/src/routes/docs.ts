import { Router } from 'express';
import { swaggerSpec } from '../config/swagger.js';

const router = Router();

/**
 * @openapi
 * /api/docs/field-types:
 *   get:
 *     summary: Get supported signature field types
 *     description: Returns all 11 supported field types with attributes, categories, and examples for agentic users
 *     tags: [Agentic]
 *     responses:
 *       200:
 *         description: Field type specifications
 */
router.get('/field-types', (_req, res) => {
  const fieldTypes = [
    {
      type: 'signature',
      description: 'Standard signature field (draw, type, or KYC-verified)',
      category: 'signature',
      attributes: {
        width: { type: 'number', default: 200, description: 'Field width in pixels' },
        height: { type: 'number', default: 60, description: 'Field height in pixels' },
      },
      example: '<sig-field type="signature" recipient="1" width="200" height="60" />',
    },
    {
      type: 'free-signature',
      description: 'Free-form signature area without constraints',
      category: 'signature',
      attributes: {
        width: { type: 'number', default: 200 },
        height: { type: 'number', default: 60 },
      },
      example: '<sig-field type="free-signature" recipient="1" width="200" height="60" />',
    },
    {
      type: 'initial',
      description: 'Initials field (typically smaller than full signature)',
      category: 'signature',
      attributes: {
        width: { type: 'number', default: 80 },
        height: { type: 'number', default: 40 },
      },
      example: '<sig-field type="initial" recipient="1" width="80" height="40" />',
    },
    {
      type: 'name',
      description: 'Full name field (auto-filled for KYC-verified signers)',
      category: 'auto-fill',
      attributes: {
        'text-align': { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
      },
      example: '<sig-field type="name" recipient="1" />',
    },
    {
      type: 'email',
      description: 'Email address field (auto-filled from recipient)',
      category: 'auto-fill',
      attributes: {
        'text-align': { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
      },
      example: '<sig-field type="email" recipient="1" />',
    },
    {
      type: 'date',
      description: 'Signing date field (auto-filled with signing timestamp)',
      category: 'auto-fill',
      attributes: {
        'text-align': { type: 'string', enum: ['left', 'center', 'right'], default: 'left' },
      },
      example: '<sig-field type="date" recipient="1" />',
    },
    {
      type: 'text',
      description: 'Free text input field',
      category: 'input',
      attributes: {
        placeholder: { type: 'string', description: 'Placeholder text' },
        required: { type: 'boolean', default: false },
        'character-limit': { type: 'number', description: 'Maximum characters allowed' },
      },
      example: '<sig-field type="text" recipient="1" placeholder="Job Title" required="true" character-limit="100" />',
    },
    {
      type: 'number',
      description: 'Numeric input field with optional validation',
      category: 'input',
      attributes: {
        placeholder: { type: 'string' },
        required: { type: 'boolean', default: false },
        min: { type: 'number', description: 'Minimum value' },
        max: { type: 'number', description: 'Maximum value' },
        format: { type: 'string', enum: ['number', 'currency', 'percentage'], default: 'number' },
      },
      example: '<sig-field type="number" recipient="1" placeholder="Amount" min="0" max="10000" format="currency" />',
    },
    {
      type: 'checkbox',
      description: 'Multi-select checkbox group',
      category: 'selection',
      attributes: {
        values: {
          type: 'array',
          description: 'JSON array of options',
          example: '[{"value":"Option A"},{"value":"Option B"}]',
        },
        required: { type: 'boolean', default: false, description: 'At least one must be checked' },
        direction: { type: 'string', enum: ['vertical', 'horizontal'], default: 'vertical' },
      },
      example: '<sig-field type="checkbox" recipient="1" values=\'[{"value":"I agree to the terms"},{"value":"Subscribe to newsletter"}]\' required="true" />',
    },
    {
      type: 'radio',
      description: 'Single-select radio button group',
      category: 'selection',
      attributes: {
        values: {
          type: 'array',
          description: 'JSON array of options',
        },
        direction: { type: 'string', enum: ['vertical', 'horizontal'], default: 'horizontal' },
      },
      example: '<sig-field type="radio" recipient="1" values=\'[{"value":"Yes"},{"value":"No"}]\' direction="horizontal" />',
    },
    {
      type: 'dropdown',
      description: 'Select dropdown menu',
      category: 'selection',
      attributes: {
        values: {
          type: 'array',
          description: 'JSON array of options',
        },
        default: { type: 'string', description: 'Default selected value' },
      },
      example: '<sig-field type="dropdown" recipient="1" values=\'[{"value":"Option 1"},{"value":"Option 2"},{"value":"Option 3"}]\' default="Option 1" />',
    },
  ];

  const commonAttributes = {
    recipient: {
      required: true,
      type: 'number',
      description: 'Recipient number (1-indexed, corresponds to recipients array order)',
    },
    required: {
      type: 'boolean',
      default: false,
      description: 'Whether the field must be filled before signing completes',
    },
  };

  res.json({
    fieldTypes,
    commonAttributes,
    categories: {
      signature: 'Fields that capture a signature or initials',
      'auto-fill': 'Fields automatically populated during signing (name, email, date)',
      input: 'Free-form text or numeric input fields',
      selection: 'Multiple choice fields (checkbox, radio, dropdown)',
    },
    notes: [
      'All field types support the "recipient" attribute to assign to specific signers',
      'Signature fields support KYC-verified signing when the signer has a Soulbound KYC NFT',
      'Auto-fill fields are populated automatically: name from KYC NFT or typed entry, email from recipient, date from signing time',
      'Selection field "values" must be valid JSON array',
    ],
    detailedSchemaUrl: '/api/docs/api-schema#field-types',
  });
});

/**
 * @openapi
 * /api/docs/html-template:
 *   get:
 *     summary: Get a complete HTML template example
 *     description: Returns a well-commented HTML template that agents can use as a starting point for document creation
 *     tags: [Agentic]
 *     responses:
 *       200:
 *         description: HTML template with examples of all field types
 */
router.get('/html-template', (_req, res) => {
  const template = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Document Title - Replace This</title>
  <style>
    /* 
     * SOULBOUND SIGNATURE HTML TEMPLATE
     * ================================
     * This template demonstrates how to create documents with signature fields
     * for the Soulbound Signature API.
     * 
     * Replace the content below with your actual document.
     * Use <sig-field> elements to place signature and input fields.
     */
    
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.5;
      margin: 1in;
      color: #333;
    }
    
    h1 {
      font-size: 18pt;
      text-align: center;
      margin-bottom: 20px;
    }
    
    h2 {
      font-size: 14pt;
      margin-top: 20px;
      border-bottom: 1px solid #333;
    }
    
    .parties {
      margin: 20px 0;
    }
    
    .signature-block {
      display: inline-block;
      width: 45%;
      margin: 30px 2%;
      vertical-align: top;
      text-align: center;
    }
    
    .signature-line {
      border-top: 1px solid #000;
      margin-top: 60px;
      padding-top: 5px;
    }
    
    .agreement-text {
      margin: 15px 0;
      text-align: justify;
    }
    
    .checkbox-group {
      margin: 15px 0;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    
    /* Page break control */
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>

  <!-- 
    DOCUMENT HEADER
    ===============
    Replace with your document title and any header content
  -->
  <h1>SERVICE AGREEMENT</h1>
  
  <p style="text-align: center;">
    Agreement Number: _______________<br>
    Effective Date: <sig-field type="date" recipient="1" />
  </p>

  <!-- 
    PARTIES SECTION
    ===============
    Use <sig-field type="name"> for auto-filled name fields.
    These will be populated with the signer's name (KYC-verified if available).
  -->
  <h2>1. Parties</h2>
  <div class="parties">
    <p>This Agreement is entered into between:</p>
    
    <p><strong>Service Provider:</strong><br>
    Name: <sig-field type="name" recipient="1" /><br>
    Email: <sig-field type="email" recipient="1" /></p>
    
    <p><strong>Client:</strong><br>
    Name: <sig-field type="name" recipient="2" /><br>
    Email: <sig-field type="email" recipient="2" /></p>
  </div>

  <!-- 
    AGREEMENT TERMS
    ===============
    Your document content goes here
  -->
  <h2>2. Services</h2>
  <div class="agreement-text">
    <p>The Service Provider agrees to provide the following services:</p>
    <p><sig-field type="text" recipient="1" placeholder="Describe services to be provided" required="true" character-limit="500" /></p>
  </div>

  <h2>3. Compensation</h2>
  <div class="agreement-text">
    <p>The Client agrees to pay the Service Provider:</p>
    <p>Amount: $<sig-field type="number" recipient="2" placeholder="0.00" min="0" format="currency" /></p>
  </div>

  <!-- 
    SELECTION FIELDS EXAMPLES
    =========================
    Checkbox, radio, and dropdown examples
  -->
  <h2>4. Terms Acceptance</h2>
  <div class="checkbox-group">
    <p>Please confirm the following:</p>
    <p><sig-field type="checkbox" recipient="2" values='[{"value":"I have read and understand the terms"},{"value":"I agree to the payment schedule"},{"value":"I consent to electronic signatures"}]' required="true" direction="vertical" /></p>
  </div>

  <h2>5. Payment Method</h2>
  <div class="agreement-text">
    <p>Preferred payment method:</p>
    <p><sig-field type="dropdown" recipient="2" values='[{"value":"Bank Transfer"},{"value":"Credit Card"},{"value":"Check"},{"value":"Cryptocurrency"}]' default="Bank Transfer" /></p>
  </div>

  <h2>6. Agreement Duration</h2>
  <div class="agreement-text">
    <p>This agreement shall:</p>
    <p><sig-field type="radio" recipient="1" values='[{"value":"Be effective for 1 year"},{"value":"Be effective for 2 years"},{"value":"Continue until terminated"}]' direction="vertical" /></p>
  </div>

  <!-- 
    SIGNATURE SECTION
    =================
    The most important part! Use signature fields for legally binding signatures.
    
    For KYC-verified signers, the signature will include their verified name and NFT address.
    For non-KYC signers, they can draw or type their signature.
  -->
  <div class="page-break"></div>
  
  <h2>7. Signatures</h2>
  <p>By signing below, the parties agree to all terms and conditions of this Agreement.</p>

  <div style="margin-top: 40px;">
    <div class="signature-block">
      <sig-field type="signature" recipient="1" width="200" height="60" />
      <div class="signature-line">
        <sig-field type="name" recipient="1" /><br>
        <strong>Service Provider</strong><br>
        Date: <sig-field type="date" recipient="1" />
      </div>
    </div>
    
    <div class="signature-block">
      <sig-field type="signature" recipient="2" width="200" height="60" />
      <div class="signature-line">
        <sig-field type="name" recipient="2" /><br>
        <strong>Client</strong><br>
        Date: <sig-field type="date" recipient="2" />
      </div>
    </div>
  </div>

  <!-- 
    INITIALS (Optional)
    ===================
    Use initials for shorter acknowledgments
  -->
  <div style="margin-top: 40px; text-align: center;">
    <p><em>Initial here to acknowledge receipt of a copy:</em></p>
    <p>
      Provider: <sig-field type="initial" recipient="1" width="60" height="30" />
      &nbsp;&nbsp;&nbsp;&nbsp;
      Client: <sig-field type="initial" recipient="2" width="60" height="30" />
    </p>
  </div>

</body>
</html>`;

  res.json({
    template,
    description: 'A complete HTML template demonstrating all field types',
    instructions: [
      '1. Replace the document content with your actual agreement text',
      '2. Keep the <sig-field> elements where you need signatures and inputs',
      '3. Adjust recipient numbers to match your recipients array (1-indexed)',
      '4. Submit to POST /api/documents/create with format="html"',
    ],
    fieldTypesUrl: '/api/docs/field-types',
    createEndpoint: 'POST /api/documents/create',
    exampleRequest: {
      title: 'Service Agreement',
      format: 'html',
      content: '(the HTML template above)',
      recipients: [
        { email: 'provider@example.com', name: 'Service Provider', role: 'signer' },
        { walletAddress: '0x...', name: 'Client', role: 'signer' },
      ],
    },
  });
});

/**
 * @openapi
 * /api/docs/api-schema:
 *   get:
 *     summary: Get OpenAPI schema for all endpoints
 *     description: Returns the full OpenAPI specification for programmatic discovery
 *     tags: [Agentic]
 *     responses:
 *       200:
 *         description: OpenAPI specification
 */
router.get('/api-schema', (_req, res) => {
  res.json(swaggerSpec);
});

/**
 * @openapi
 * /api/docs/workflow:
 *   get:
 *     summary: Get agentic workflow documentation
 *     description: Step-by-step guide for programmatic document creation and signing
 *     tags: [Agentic]
 *     responses:
 *       200:
 *         description: Workflow documentation
 */
router.get('/workflow', (_req, res) => {
  res.json({
    title: 'Agentic Document Signing Workflow',
    overview: 'This guide explains how to programmatically create, distribute, and track signature documents.',
    workflows: {
      createFromScratch: {
        title: 'Create Document from HTML',
        steps: [
          {
            step: 1,
            action: 'Learn field types',
            endpoint: 'GET /api/docs/field-types',
            description: 'Understand available field types and their attributes',
          },
          {
            step: 2,
            action: 'Get template (optional)',
            endpoint: 'GET /api/docs/html-template',
            description: 'Get a starting template with all field types demonstrated',
          },
          {
            step: 3,
            action: 'Create HTML document',
            description: 'Build your HTML with <sig-field> elements where signatures/inputs are needed',
          },
          {
            step: 4,
            action: 'Submit document',
            endpoint: 'POST /api/documents/create',
            description: 'Submit HTML with recipients, receive signing links',
            note: 'Requires x402 payment (1 USDC)',
          },
          {
            step: 5,
            action: 'Distribute signing links',
            description: 'Share the signing links with recipients via email, chat, etc.',
          },
          {
            step: 6,
            action: 'Track status',
            endpoint: 'GET /api/documents/:id',
            description: 'Monitor signing progress',
          },
        ],
      },
      createFromPdf: {
        title: 'Create Document from Existing PDF',
        steps: [
          {
            step: 1,
            action: 'Convert PDF to HTML',
            endpoint: 'POST /api/tools/pdf-to-html',
            description: 'Upload PDF, receive editable HTML',
          },
          {
            step: 2,
            action: 'Add sig-field elements',
            description: 'Insert <sig-field> elements into the HTML where needed',
          },
          {
            step: 3,
            action: 'Submit document',
            endpoint: 'POST /api/documents/create',
            description: 'Submit modified HTML with recipients',
          },
        ],
      },
    },
    paymentInfo: {
      price: '1 USDC per document',
      protocol: 'x402',
      network: 'Aptos (testnet/mainnet)',
      discoveryUrl: '/discovery/resources',
    },
    signingOptions: {
      traditional: 'Draw or type signature',
      kycVerified: 'Sign with KYC-verified name from Soulbound KYC NFT',
      kycEndpoint: 'GET /api/kyc/names/:walletAddress',
    },
  });
});

export default router;
