import puppeteer, { Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

// Get or create browser instance
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
  }
  return browserInstance;
}

// Close browser on shutdown
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Interface for field positions extracted during rendering
 */
export interface ExtractedFieldPosition {
  index: number;
  type: string;
  recipient: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  attributes: Record<string, string>;
}

/**
 * Result of HTML to PDF rendering
 */
export interface RenderResult {
  pdfBuffer: Buffer;
  fieldPositions: ExtractedFieldPosition[];
  pageCount: number;
}

/**
 * Render HTML with <sig-field> elements to PDF
 * 
 * The <sig-field> elements are replaced with placeholder divs during rendering,
 * and their positions are captured for later field creation.
 */
export async function renderHtmlToPdf(html: string): Promise<RenderResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Inject script to transform sig-field elements and capture positions
    const transformedHtml = transformSigFields(html);

    // Set content
    await page.setContent(transformedHtml, {
      waitUntil: 'networkidle0',
    });

    // Set page size to US Letter
    await page.setViewport({
      width: 816, // 8.5 inches at 96 DPI
      height: 1056, // 11 inches at 96 DPI
    });

  // Extract field positions before converting to PDF
  const fieldPositions = await page.evaluate(() => {
    interface ExtractedField {
      index: number;
      type: string;
      recipient: number;
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      attributes: Record<string, string>;
    }
    
    const fields: ExtractedField[] = [];
    const fieldElements = document.querySelectorAll('.sig-field-placeholder');

    fieldElements.forEach((el: Element, index: number) => {
      const rect = el.getBoundingClientRect();
      const attributes: Record<string, string> = {};
      
      // Get all data attributes
      Array.from(el.attributes).forEach((attr: Attr) => {
        if (attr.name.startsWith('data-')) {
          attributes[attr.name.replace('data-', '')] = attr.value;
        }
      });

      // Calculate which page the field is on (assuming 1056px per page)
      const pageHeight = 1056;
      const pageNum = Math.floor(rect.top / pageHeight) + 1;
      const yOnPage = rect.top % pageHeight;

      fields.push({
        index,
        type: el.getAttribute('data-type') || 'signature',
        recipient: parseInt(el.getAttribute('data-recipient') || '1', 10),
        page: pageNum,
        x: rect.left,
        y: yOnPage,
        width: rect.width || 200,
        height: rect.height || 60,
        attributes,
      });
    });

    return fields;
  }) as ExtractedFieldPosition[];

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
    });

    // Get page count
    const pageCount = await page.evaluate(() => {
      const body = document.body as HTMLBodyElement;
      const totalHeight = Math.max(body.scrollHeight, body.offsetHeight);
      return Math.ceil(totalHeight / 1056);
    }) as number;

    await page.close();

    return {
      pdfBuffer: Buffer.from(pdfBuffer),
      fieldPositions,
      pageCount: Math.max(pageCount, 1),
    };
  } catch (error) {
    await page.close();
    throw error;
  }
}

/**
 * Transform <sig-field> elements into styled placeholder divs
 * that can be positioned and measured during rendering
 */
function transformSigFields(html: string): string {
  let fieldIndex = 0;

  // Replace <sig-field> elements with styled placeholders
  const transformed = html.replace(
    /<sig-field\s+([^>]*)\/?\s*>/gi,
    (match, attributesStr) => {
      const attrs = parseAttributes(attributesStr);
      const type = attrs.type || 'signature';
      const recipient = attrs.recipient || '1';
      const width = attrs.width || '200';
      const height = attrs.height || '60';

      // Build data attributes for position extraction
      const dataAttrs = Object.entries(attrs)
        .map(([k, v]) => `data-${k}="${escapeHtml(v)}"`)
        .join(' ');

      // Create placeholder with appropriate styling
      const placeholder = `
        <div class="sig-field-placeholder" 
             data-index="${fieldIndex++}"
             data-type="${type}"
             data-recipient="${recipient}"
             ${dataAttrs}
             style="
               display: inline-block;
               width: ${width}px;
               height: ${height}px;
               border: 1px dashed #ccc;
               background: rgba(100, 149, 237, 0.1);
               position: relative;
               vertical-align: middle;
             ">
          <span style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 10px;
            color: #666;
            white-space: nowrap;
          ">${getFieldLabel(type)}</span>
        </div>
      `;

      return placeholder;
    }
  );

  // Add base styles to head
  const stylesInjection = `
    <style>
      .sig-field-placeholder {
        page-break-inside: avoid;
      }
      @media print {
        .sig-field-placeholder {
          border: 1px dashed #999 !important;
          background: transparent !important;
        }
      }
    </style>
  `;

  // Inject styles
  if (transformed.includes('</head>')) {
    return transformed.replace('</head>', `${stylesInjection}</head>`);
  } else if (transformed.includes('<body')) {
    return transformed.replace('<body', `<head>${stylesInjection}</head><body`);
  } else {
    return `<!DOCTYPE html><html><head>${stylesInjection}</head><body>${transformed}</body></html>`;
  }
}

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFieldLabel(type: string): string {
  const labels: Record<string, string> = {
    'signature': '✍️ Signature',
    'free-signature': '✍️ Free Sign',
    'initial': 'AB Initials',
    'name': '👤 Name',
    'email': '📧 Email',
    'date': '📅 Date',
    'text': '📝 Text',
    'number': '🔢 Number',
    'checkbox': '☑️ Checkbox',
    'radio': '◉ Radio',
    'dropdown': '▼ Select',
  };
  return labels[type] || type;
}

/**
 * Render a simple preview HTML for a document
 */
export async function generatePreviewHtml(
  originalHtml: string,
  fields: Array<{
    type: string;
    recipient: number;
    value?: string;
    signatureImage?: string;
  }>
): Promise<string> {
  // Replace sig-field elements with their values
  let previewHtml = originalHtml;
  let fieldIndex = 0;

  previewHtml = previewHtml.replace(
    /<sig-field\s+([^>]*)\/?\s*>/gi,
    (match) => {
      const field = fields[fieldIndex++];
      if (!field) return match;

      if (field.signatureImage) {
        return `<img src="${field.signatureImage}" style="max-width: 200px; max-height: 60px;" />`;
      } else if (field.value) {
        return `<span style="font-style: italic;">${escapeHtml(field.value)}</span>`;
      }

      return `<span style="color: #999;">[${field.type} - Recipient ${field.recipient}]</span>`;
    }
  );

  return previewHtml;
}
