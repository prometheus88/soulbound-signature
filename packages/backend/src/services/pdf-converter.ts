// @ts-ignore - pdf-parse doesn't have type definitions
import pdf from 'pdf-parse';

/**
 * Convert PDF to HTML for editing
 * 
 * This is a simplified converter that extracts text content from PDF.
 * For complex PDFs with images and formatting, a more sophisticated
 * solution would be needed (like pdf2htmlEX or similar).
 */
export async function convertPdfToHtml(pdfBase64: string): Promise<{
  html: string;
  pageCount: number;
  warnings: string[];
}> {
  const warnings: string[] = [];

  try {
    // Decode base64 PDF
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Parse PDF
    const data = await pdf(pdfBuffer);

    // Build HTML from extracted text
    const html = buildHtmlFromPdfText(data.text, data.numpages);

    if (data.numpages > 10) {
      warnings.push('Large documents may have conversion artifacts. Review carefully.');
    }

    return {
      html,
      pageCount: data.numpages,
      warnings: [
        ...warnings,
        'PDF conversion is best-effort. Complex layouts may not convert perfectly.',
        'Images from the PDF are not preserved in this basic conversion.',
        'Review the HTML structure before adding signature fields.',
        'Consider the positions of <sig-field> elements carefully.',
      ],
    };
  } catch (error) {
    console.error('PDF conversion error:', error);
    throw new Error('Failed to convert PDF. Ensure the file is a valid PDF.');
  }
}

/**
 * Build HTML document from extracted PDF text
 */
function buildHtmlFromPdfText(text: string, pageCount: number): string {
  // Split text into paragraphs
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Try to identify structure
  const formattedParagraphs = paragraphs.map(p => {
    // Check if it looks like a heading (short, possibly all caps or numbered)
    const isHeading = p.length < 100 && (
      /^[A-Z\s]+$/.test(p) ||
      /^\d+\.\s/.test(p) ||
      /^[IVX]+\.\s/.test(p) ||
      /^Article\s/i.test(p) ||
      /^Section\s/i.test(p)
    );

    if (isHeading) {
      return `<h2>${escapeHtml(p)}</h2>`;
    }

    // Check for list items
    if (/^[\-\•\*]\s/.test(p) || /^\d+\)\s/.test(p) || /^[a-z]\)\s/.test(p)) {
      return `<li>${escapeHtml(p.replace(/^[\-\•\*\d\)a-z]+\s*/, ''))}</li>`;
    }

    return `<p>${escapeHtml(p)}</p>`;
  });

  // Wrap consecutive list items in <ul>
  const content = wrapListItems(formattedParagraphs);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Converted Document</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      margin: 1in;
      color: #333;
    }
    
    h1 {
      font-size: 18pt;
      text-align: center;
      margin-bottom: 24px;
    }
    
    h2 {
      font-size: 14pt;
      margin-top: 24px;
      margin-bottom: 12px;
      color: #222;
    }
    
    p {
      margin-bottom: 12px;
      text-align: justify;
    }
    
    ul, ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    .signature-section {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    
    .signature-block {
      display: inline-block;
      width: 45%;
      margin: 20px 2%;
      text-align: center;
      vertical-align: top;
    }
    
    .signature-line {
      border-top: 1px solid #000;
      margin-top: 50px;
      padding-top: 8px;
    }
    
    /* Add your own styles as needed */
  </style>
</head>
<body>

  <!-- 
    CONVERTED FROM PDF
    ==================
    This HTML was automatically generated from a PDF document.
    
    TO ADD SIGNATURE FIELDS:
    1. Find where signatures are needed in the document below
    2. Add <sig-field> elements at those locations
    3. Use recipient="1" for the first signer, recipient="2" for the second, etc.
    
    EXAMPLE SIGNATURE FIELDS:
    <sig-field type="signature" recipient="1" width="200" height="60" />
    <sig-field type="name" recipient="1" />
    <sig-field type="date" recipient="1" />
    
    See /api/docs/field-types for all available field types.
  -->

  <h1>Document Title</h1>
  <!-- Replace the above with your document's actual title -->

${content}

  <!-- 
    SIGNATURE SECTION
    =================
    Add signature blocks here. Example:
  -->
  <div class="signature-section">
    <h2>Signatures</h2>
    
    <div class="signature-block">
      <!-- ADD SIGNATURE FIELD HERE -->
      <!-- <sig-field type="signature" recipient="1" width="200" height="60" /> -->
      <div class="signature-line">
        <!-- <sig-field type="name" recipient="1" /> -->
        <br>Signatory 1
        <br>Date: <!-- <sig-field type="date" recipient="1" /> -->
      </div>
    </div>
    
    <div class="signature-block">
      <!-- ADD SIGNATURE FIELD HERE -->
      <!-- <sig-field type="signature" recipient="2" width="200" height="60" /> -->
      <div class="signature-line">
        <!-- <sig-field type="name" recipient="2" /> -->
        <br>Signatory 2
        <br>Date: <!-- <sig-field type="date" recipient="2" /> -->
      </div>
    </div>
  </div>

  <!-- 
    Page count from original PDF: ${pageCount}
  -->

</body>
</html>`;
}

/**
 * Wrap consecutive <li> elements in <ul> tags
 */
function wrapListItems(elements: string[]): string {
  const result: string[] = [];
  let inList = false;

  for (const el of elements) {
    if (el.startsWith('<li>')) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`  ${el}`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(el);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.map(el => `  ${el}`).join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
