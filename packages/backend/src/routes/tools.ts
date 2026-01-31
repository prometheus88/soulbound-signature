import { Router } from 'express';
import { convertPdfToHtml } from '../services/pdf-converter.js';

const router = Router();

/**
 * @openapi
 * /api/tools/pdf-to-html:
 *   post:
 *     summary: Convert PDF to editable HTML
 *     description: |
 *       Upload a PDF and receive an editable HTML representation.
 *       You can then add <sig-field> elements to the HTML and submit
 *       it to POST /api/documents/create.
 *       
 *       This is a free endpoint - no payment required.
 *     tags: [Agentic]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pdfBase64
 *             properties:
 *               pdfBase64:
 *                 type: string
 *                 description: Base64-encoded PDF content
 *     responses:
 *       200:
 *         description: Converted HTML
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 html:
 *                   type: string
 *                 pageCount:
 *                   type: integer
 *                 instructions:
 *                   type: string
 *                 fieldTypesUrl:
 *                   type: string
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Conversion failed
 */
router.post('/pdf-to-html', async (req, res) => {
  try {
    const { pdfBase64 } = req.body;

    if (!pdfBase64) {
      res.status(400).json({ 
        success: false,
        error: 'pdfBase64 is required' 
      });
      return;
    }

    // Validate it looks like base64
    if (!/^[A-Za-z0-9+/]+=*$/.test(pdfBase64.substring(0, 100))) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid base64 encoding' 
      });
      return;
    }

    // Convert PDF to HTML
    const result = await convertPdfToHtml(pdfBase64);

    res.json({
      success: true,
      html: result.html,
      pageCount: result.pageCount,
      instructions: `
Modify the HTML above to add <sig-field> elements where you need signature fields.

Steps:
1. Review the converted HTML structure
2. Find locations where signatures, initials, or other fields are needed
3. Add <sig-field> elements with appropriate types and recipient numbers
4. Submit the modified HTML to POST /api/documents/create with format='html'

Example fields to add:
- <sig-field type="signature" recipient="1" width="200" height="60" />
- <sig-field type="name" recipient="1" />
- <sig-field type="date" recipient="1" />
- <sig-field type="text" recipient="2" placeholder="Title" />

Use recipient="1" for the first signer, recipient="2" for the second, etc.
`.trim(),
      fieldTypesUrl: '/api/docs/field-types',
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('PDF to HTML conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
    });
  }
});

/**
 * @openapi
 * /api/tools/validate-html:
 *   post:
 *     summary: Validate HTML document with sig-fields
 *     description: Check if HTML is valid and all sig-field elements are properly formatted
 *     tags: [Agentic]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               html:
 *                 type: string
 *               recipientCount:
 *                 type: integer
 *                 description: Expected number of recipients
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate-html', (req, res) => {
  try {
    const { html, recipientCount } = req.body;

    if (!html) {
      res.status(400).json({ valid: false, error: 'html is required' });
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const fields: Array<{ type: string; recipient: number; attributes: Record<string, string> }> = [];

    // Parse sig-field elements
    const sigFieldRegex = /<sig-field\s+([^>]*)\/?\s*>/gi;
    let match;
    let fieldIndex = 0;

    while ((match = sigFieldRegex.exec(html)) !== null) {
      const attrs = parseAttributes(match[1]);
      fieldIndex++;

      // Validate type
      const validTypes = [
        'signature', 'free-signature', 'initial',
        'name', 'email', 'date',
        'text', 'number',
        'checkbox', 'radio', 'dropdown'
      ];

      if (!attrs.type) {
        errors.push(`Field #${fieldIndex}: missing required "type" attribute`);
      } else if (!validTypes.includes(attrs.type)) {
        errors.push(`Field #${fieldIndex}: invalid type "${attrs.type}". Valid types: ${validTypes.join(', ')}`);
      }

      // Validate recipient
      if (!attrs.recipient) {
        errors.push(`Field #${fieldIndex}: missing required "recipient" attribute`);
      } else {
        const recipientNum = parseInt(attrs.recipient, 10);
        if (isNaN(recipientNum) || recipientNum < 1) {
          errors.push(`Field #${fieldIndex}: recipient must be a positive number`);
        } else if (recipientCount && recipientNum > recipientCount) {
          warnings.push(`Field #${fieldIndex}: recipient ${recipientNum} exceeds expected recipient count (${recipientCount})`);
        }
      }

      // Validate selection field values
      if (['checkbox', 'radio', 'dropdown'].includes(attrs.type) && !attrs.values) {
        errors.push(`Field #${fieldIndex}: ${attrs.type} fields require a "values" attribute`);
      } else if (attrs.values) {
        try {
          const values = JSON.parse(attrs.values);
          if (!Array.isArray(values)) {
            errors.push(`Field #${fieldIndex}: values must be a JSON array`);
          }
        } catch (e) {
          errors.push(`Field #${fieldIndex}: invalid JSON in values attribute`);
        }
      }

      fields.push({
        type: attrs.type || 'unknown',
        recipient: parseInt(attrs.recipient || '0', 10),
        attributes: attrs,
      });
    }

    // Check for at least one signature field
    const signatureFields = fields.filter(f => 
      ['signature', 'free-signature', 'initial'].includes(f.type)
    );
    if (signatureFields.length === 0) {
      warnings.push('No signature fields found. Most documents need at least one signature.');
    }

    // Summary by recipient
    const recipientSummary: Record<number, string[]> = {};
    for (const field of fields) {
      if (!recipientSummary[field.recipient]) {
        recipientSummary[field.recipient] = [];
      }
      recipientSummary[field.recipient].push(field.type);
    }

    res.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalFields: fields.length,
        fieldsByType: fields.reduce((acc, f) => {
          acc[f.type] = (acc[f.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        fieldsByRecipient: recipientSummary,
      },
      fields,
    });
  } catch (error) {
    console.error('HTML validation error:', error);
    res.status(500).json({ valid: false, error: 'Validation failed' });
  }
});

function parseAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+(?:-\w+)?)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(str)) !== null) {
    const name = match[1];
    const value = match[2] || match[3] || match[4];
    attrs[name] = value;
  }

  return attrs;
}

export default router;
