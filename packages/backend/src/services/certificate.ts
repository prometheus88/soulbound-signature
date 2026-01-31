import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import * as db from '../db/schema.js';
import type { Recipient, Signature, SignatureField } from '../types/index.js';

/**
 * Generate the signature confirmation page
 * 
 * This page is appended to the final signed document and contains:
 * - Document title
 * - Signing summary
 * - Table of all signers with: Name, Signature, Date, IP Address
 * - KYC verification status for applicable signatures
 */
export async function generateConfirmationPage(
  packageId: string,
  documentTitle: string
): Promise<Uint8Array> {
  // Get all recipients and their signatures
  const recipients = await db.getRecipientsByPackage(packageId);
  const signatures = await db.getSignaturesByPackage(packageId);
  const auditLogs = await db.getAuditLogsByPackage(packageId);

  // Build signer data
  const signerData: Array<{
    name: string;
    email: string | null;
    walletAddress: string | null;
    signedAt: Date | null;
    ipAddress: string | null;
    isKYC: boolean;
    isWalletSigned: boolean;
    kycNftAddress: string | null;
    signatureType: 'wallet' | 'drawn' | 'typed' | 'kyc';
    signatureValue: string | null;
    signatureImage: string | null;
    documentHash: string | null;
    walletSignature: string | null;
  }> = [];

  for (const recipient of recipients) {
    if (recipient.role !== 'signer') continue;

    // Get signature data for this recipient
    const recipientSignatures = signatures.filter(s => s.recipient_id === recipient.id);
    
    // Get the primary signature (first signature field)
    const primarySig = recipientSignatures.find(s => 
      s.wallet_signature || s.signature_image || s.typed_signature || s.kyc_verified_name
    );

    // Get IP from signing completion audit log
    const signingLog = auditLogs.find(
      log => log.event_type === 'signing_completed' && 
             (log.user_wallet === recipient.wallet_address || log.user_email === recipient.email)
    );

    // Determine signature type
    let signatureType: 'wallet' | 'drawn' | 'typed' | 'kyc' = 'drawn';
    if (primarySig?.wallet_signature) {
      signatureType = 'wallet';
    } else if (primarySig?.kyc_verified_name) {
      signatureType = 'kyc';
    } else if (primarySig?.typed_signature) {
      signatureType = 'typed';
    }

    signerData.push({
      name: primarySig?.kyc_verified_name || recipient.name,
      email: recipient.email,
      walletAddress: primarySig?.wallet_address || recipient.wallet_address,
      signedAt: recipient.signed_at,
      ipAddress: signingLog?.ip_address || recipient.ip_address,
      isKYC: !!primarySig?.kyc_verified_name,
      isWalletSigned: !!primarySig?.wallet_signature,
      kycNftAddress: primarySig?.kyc_nft_address || null,
      signatureType,
      signatureValue: primarySig?.typed_signature || primarySig?.kyc_verified_name || null,
      signatureImage: primarySig?.signature_image || null,
      documentHash: primarySig?.document_hash || null,
      walletSignature: primarySig?.wallet_signature || null,
    });
  }

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  // Fonts
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Colors
  const darkGray = rgb(0.2, 0.2, 0.2);
  const mediumGray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.8, 0.8, 0.8);
  const green = rgb(0.133, 0.545, 0.133);

  let y = height - 50;

  // Header
  page.drawText('SIGNATURE CONFIRMATION', {
    x: 50,
    y,
    size: 18,
    font: helveticaBold,
    color: darkGray,
  });

  y -= 30;

  // Document info
  page.drawText(`Document: ${documentTitle}`, {
    x: 50,
    y,
    size: 11,
    font: helvetica,
    color: mediumGray,
  });

  y -= 18;
  page.drawText(`Completed: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`, {
    x: 50,
    y,
    size: 11,
    font: helvetica,
    color: mediumGray,
  });

  y -= 18;
  page.drawText(`Total Signers: ${signerData.length}`, {
    x: 50,
    y,
    size: 11,
    font: helvetica,
    color: mediumGray,
  });

  y -= 40;

  // Divider line
  page.drawLine({
    start: { x: 50, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: lightGray,
  });

  y -= 30;

  // Table header
  const columns = {
    name: 50,
    signature: 200,
    date: 380,
    ip: 480,
  };

  page.drawText('SIGNER', {
    x: columns.name,
    y,
    size: 9,
    font: helveticaBold,
    color: mediumGray,
  });

  page.drawText('SIGNATURE', {
    x: columns.signature,
    y,
    size: 9,
    font: helveticaBold,
    color: mediumGray,
  });

  page.drawText('DATE', {
    x: columns.date,
    y,
    size: 9,
    font: helveticaBold,
    color: mediumGray,
  });

  page.drawText('IP ADDRESS', {
    x: columns.ip,
    y,
    size: 9,
    font: helveticaBold,
    color: mediumGray,
  });

  y -= 20;

  // Signer rows
  for (const signer of signerData) {
    // Name column
    page.drawText(signer.name, {
      x: columns.name,
      y,
      size: 10,
      font: helveticaBold,
      color: darkGray,
    });

    // Verification badges
    if (signer.isWalletSigned) {
      y -= 12;
      page.drawText('[Crypto Signature]', {
        x: columns.name,
        y,
        size: 8,
        font: helvetica,
        color: green,
      });
      y += 12;
    } else if (signer.isKYC) {
      y -= 12;
      page.drawText('[KYC Verified]', {
        x: columns.name,
        y,
        size: 8,
        font: helvetica,
        color: green,
      });
      y += 12;
    }

    // Email under name
    if (signer.email) {
      const nameOffset = signer.isKYC ? -24 : -14;
      page.drawText(signer.email, {
        x: columns.name,
        y: y + nameOffset,
        size: 8,
        font: helvetica,
        color: mediumGray,
      });
    }

    // Signature column
    if (signer.signatureType === 'wallet') {
      page.drawText(`[Wallet Signed]`, {
        x: columns.signature,
        y,
        size: 10,
        font: helveticaBold,
        color: green,
      });
      // Show wallet address
      if (signer.walletAddress) {
        page.drawText(`Addr: ${truncateAddress(signer.walletAddress)}`, {
          x: columns.signature,
          y: y - 12,
          size: 7,
          font: helvetica,
          color: mediumGray,
        });
      }
      // Show document hash
      if (signer.documentHash) {
        page.drawText(`Hash: ${signer.documentHash.slice(0, 16)}...`, {
          x: columns.signature,
          y: y - 22,
          size: 6,
          font: helvetica,
          color: mediumGray,
        });
      }
    } else if (signer.signatureType === 'kyc') {
      page.drawText(`[KYC: ${signer.signatureValue}]`, {
        x: columns.signature,
        y,
        size: 10,
        font: helvetica,
        color: darkGray,
      });
      // Show NFT address
      if (signer.kycNftAddress) {
        page.drawText(`NFT: ${truncateAddress(signer.kycNftAddress)}`, {
          x: columns.signature,
          y: y - 12,
          size: 7,
          font: helvetica,
          color: mediumGray,
        });
      }
    } else if (signer.signatureType === 'typed') {
      page.drawText(signer.signatureValue || '[typed]', {
        x: columns.signature,
        y,
        size: 10,
        font: helvetica,
        color: darkGray,
      });
    } else {
      // For drawn signatures, we'd need to embed the image
      // For now, just indicate it exists
      page.drawText('[drawn signature]', {
        x: columns.signature,
        y,
        size: 10,
        font: helvetica,
        color: darkGray,
      });
    }

    // Date column
    const dateStr = signer.signedAt 
      ? formatDate(signer.signedAt)
      : 'Not signed';
    page.drawText(dateStr, {
      x: columns.date,
      y,
      size: 9,
      font: helvetica,
      color: darkGray,
    });

    // IP column
    page.drawText(signer.ipAddress || 'Unknown', {
      x: columns.ip,
      y,
      size: 9,
      font: helvetica,
      color: darkGray,
    });

    // Move to next row (more space for wallet signatures with hash)
    y -= signer.isWalletSigned ? 60 : (signer.isKYC ? 50 : 40);

    // Row divider
    page.drawLine({
      start: { x: 50, y: y + 10 },
      end: { x: width - 50, y: y + 10 },
      thickness: 0.5,
      color: lightGray,
    });

    y -= 10;
  }

  // Footer
  y = 70;
  page.drawText('This document was electronically signed using Soulbound Signature on Aptos.', {
    x: 50,
    y,
    size: 8,
    font: helvetica,
    color: mediumGray,
  });

  y -= 12;
  page.drawText('Cryptographic signatures were made by signing the document SHA-256 hash with the signer\'s wallet.', {
    x: 50,
    y,
    size: 8,
    font: helvetica,
    color: mediumGray,
  });

  y -= 12;
  page.drawText('KYC Verified signatures use verified identities from Soulbound KYC NFTs on Aptos.', {
    x: 50,
    y,
    size: 8,
    font: helvetica,
    color: mediumGray,
  });

  // Serialize PDF
  return pdfDoc.save();
}

/**
 * Append confirmation page to a signed document
 */
export async function appendConfirmationPage(
  originalPdfBytes: Uint8Array,
  packageId: string,
  documentTitle: string
): Promise<Uint8Array> {
  // Generate confirmation page
  const confirmationPdf = await generateConfirmationPage(packageId, documentTitle);

  // Load both PDFs
  const originalDoc = await PDFDocument.load(originalPdfBytes);
  const confirmationDoc = await PDFDocument.load(confirmationPdf);

  // Copy confirmation page to original document
  const [confirmationPage] = await originalDoc.copyPages(confirmationDoc, [0]);
  originalDoc.addPage(confirmationPage);

  // Return merged document
  return originalDoc.save();
}

/**
 * Render all field values onto the PDF document
 */
export async function renderFieldsOnPdf(
  pdfBytes: Uint8Array,
  packageId: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const fields = await db.getFieldsByPackage(packageId);
  const signatures = await db.getSignaturesByPackage(packageId);
  
  // Create a map of field ID to signature
  const signatureMap = new Map<string, Signature>();
  for (const sig of signatures) {
    signatureMap.set(sig.field_id, sig);
  }

  // Load fonts
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const field of fields) {
    if (!field.inserted && !field.value) continue;

    const signature = signatureMap.get(field.id);
    const page = pdfDoc.getPage(field.page - 1);
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // Convert percentage positions to actual coordinates
    // Note: PDF coordinate system has origin at bottom-left
    const fieldX = (field.position_x / 100) * pageWidth;
    const fieldY = pageHeight - ((field.position_y / 100) * pageHeight) - ((field.height / 100) * pageHeight);
    const fieldWidth = (field.width / 100) * pageWidth;
    const fieldHeight = (field.height / 100) * pageHeight;

    // Draw based on signature type
    if (signature?.signature_image) {
      // Drawn signature - embed the image
      try {
        const imageData = signature.signature_image;
        let image;
        
        if (imageData.includes('data:image/png')) {
          const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
          image = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'));
        } else if (imageData.includes('data:image/jpeg') || imageData.includes('data:image/jpg')) {
          const base64Data = imageData.replace(/^data:image\/jpe?g;base64,/, '');
          image = await pdfDoc.embedJpg(Buffer.from(base64Data, 'base64'));
        } else {
          // Assume PNG if no prefix
          const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
          try {
            image = await pdfDoc.embedPng(Buffer.from(base64Data, 'base64'));
          } catch {
            // If PNG fails, try to just write text
            image = null;
          }
        }

        if (image) {
          // Scale image to fit field while maintaining aspect ratio
          const imgDims = image.scale(1);
          const scale = Math.min(
            fieldWidth / imgDims.width,
            fieldHeight / imgDims.height,
            1
          );
          const scaledWidth = imgDims.width * scale;
          const scaledHeight = imgDims.height * scale;
          
          // Center the image in the field
          const imgX = fieldX + (fieldWidth - scaledWidth) / 2;
          const imgY = fieldY + (fieldHeight - scaledHeight) / 2;

          page.drawImage(image, {
            x: imgX,
            y: imgY,
            width: scaledWidth,
            height: scaledHeight,
          });
        }
      } catch (err) {
        console.error('Error embedding signature image:', err);
        // Fall back to text
        page.drawText('[Signature]', {
          x: fieldX + 5,
          y: fieldY + fieldHeight / 2 - 5,
          size: 10,
          font: helvetica,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
    } else if (signature?.wallet_signature) {
      // Wallet signature - show full cryptographic proof details with word wrap
      const baseFontSize = 5;
      const lineHeight = baseFontSize + 1.5;
      const padding = 4;
      const charWidth = baseFontSize * 0.52; // Approximate character width for Helvetica
      const maxWidth = fieldWidth - (padding * 2);
      const charsPerLine = Math.floor(maxWidth / charWidth);
      
      // Helper to wrap text into lines
      const wrapText = (text: string, maxChars: number): string[] => {
        const lines: string[] = [];
        for (let i = 0; i < text.length; i += maxChars) {
          lines.push(text.slice(i, i + maxChars));
        }
        return lines;
      };
      
      // Calculate required height
      const walletLines = signature.wallet_address ? wrapText(`Wallet: ${signature.wallet_address}`, charsPerLine) : [];
      const hashLines = signature.document_hash ? wrapText(`Hash: ${signature.document_hash}`, charsPerLine) : [];
      const sigLines = wrapText(`Sig: ${signature.wallet_signature}`, charsPerLine);
      
      const totalLines = 1 + walletLines.length + hashLines.length + sigLines.length; // +1 for header
      const requiredHeight = (totalLines * lineHeight) + (padding * 2) + 4;
      const boxHeight = Math.max(fieldHeight, requiredHeight);
      
      // Adjust Y position if box is taller (expand downward)
      const boxY = fieldY + fieldHeight - boxHeight;
      
      // Draw a border with light background
      page.drawRectangle({
        x: fieldX,
        y: boxY,
        width: fieldWidth,
        height: boxHeight,
        borderColor: rgb(0.2, 0.4, 0.8),
        borderWidth: 1,
        color: rgb(0.95, 0.97, 1), // Light blue background
      });

      let yOffset = boxY + boxHeight - lineHeight - padding;

      // Header
      page.drawText('CRYPTOGRAPHIC SIGNATURE', {
        x: fieldX + padding,
        y: yOffset,
        size: baseFontSize + 1,
        font: helveticaBold,
        color: rgb(0.2, 0.4, 0.8),
      });
      yOffset -= lineHeight + 2;

      // Full wallet address (wrapped)
      for (const line of walletLines) {
        page.drawText(line, {
          x: fieldX + padding,
          y: yOffset,
          size: baseFontSize,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });
        yOffset -= lineHeight;
      }

      // Full document hash (wrapped)
      for (const line of hashLines) {
        page.drawText(line, {
          x: fieldX + padding,
          y: yOffset,
          size: baseFontSize,
          font: helvetica,
          color: rgb(0.3, 0.3, 0.3),
        });
        yOffset -= lineHeight;
      }

      // Full wallet signature (wrapped)
      for (const line of sigLines) {
        page.drawText(line, {
          x: fieldX + padding,
          y: yOffset,
          size: baseFontSize,
          font: helvetica,
          color: rgb(0.4, 0.4, 0.4),
        });
        yOffset -= lineHeight;
      }
    } else if (signature?.kyc_verified_name) {
      // KYC verified signature - show cryptographic details with word wrap
      const baseFontSize = 5;
      const lineHeight = baseFontSize + 1.5;
      const padding = 4;
      const charWidth = baseFontSize * 0.52;
      const maxWidth = fieldWidth - (padding * 2);
      const charsPerLine = Math.floor(maxWidth / charWidth);
      
      // Helper to wrap text into lines
      const wrapText = (text: string, maxChars: number): string[] => {
        const lines: string[] = [];
        for (let i = 0; i < text.length; i += maxChars) {
          lines.push(text.slice(i, i + maxChars));
        }
        return lines;
      };
      
      // Calculate required height
      const signerLines = wrapText(`Signer: ${signature.kyc_verified_name}`, charsPerLine);
      let contentLines = signerLines.length;
      
      let walletLines: string[] = [];
      let hashLines: string[] = [];
      let sigLines: string[] = [];
      let nftLines: string[] = [];
      
      if (signature.wallet_signature && signature.wallet_address) {
        walletLines = wrapText(`Wallet: ${signature.wallet_address}`, charsPerLine);
        hashLines = signature.document_hash ? wrapText(`Hash: ${signature.document_hash}`, charsPerLine) : [];
        sigLines = wrapText(`Sig: ${signature.wallet_signature}`, charsPerLine);
        contentLines += walletLines.length + hashLines.length + sigLines.length;
      } else {
        nftLines = signature.kyc_nft_address ? wrapText(`KYC NFT: ${signature.kyc_nft_address}`, charsPerLine) : [];
        contentLines += nftLines.length + 1; // +1 for warning message
      }
      
      const requiredHeight = (contentLines * lineHeight) + (padding * 2) + 6;
      const boxHeight = Math.max(fieldHeight, requiredHeight);
      const boxY = fieldY + fieldHeight - boxHeight;
      
      // Draw border
      page.drawRectangle({
        x: fieldX,
        y: boxY,
        width: fieldWidth,
        height: boxHeight,
        borderColor: rgb(0.133, 0.545, 0.133),
        borderWidth: 1,
        color: rgb(0.95, 1, 0.95), // Light green background
      });

      let yOffset = boxY + boxHeight - lineHeight - padding;

      // Show the verified name (wrapped)
      for (let i = 0; i < signerLines.length; i++) {
        page.drawText(signerLines[i], {
          x: fieldX + padding,
          y: yOffset,
          size: i === 0 ? baseFontSize + 1 : baseFontSize,
          font: i === 0 ? helveticaBold : helvetica,
          color: rgb(0.1, 0.3, 0.1),
        });
        yOffset -= lineHeight;
      }
      yOffset -= 2;

      // Show wallet signature details if available (KYC + crypto signed)
      if (signature.wallet_signature && signature.wallet_address) {
        // Full wallet address (wrapped)
        for (const line of walletLines) {
          page.drawText(line, {
            x: fieldX + padding,
            y: yOffset,
            size: baseFontSize,
            font: helvetica,
            color: rgb(0.3, 0.3, 0.3),
          });
          yOffset -= lineHeight;
        }

        // Full document hash (wrapped)
        for (const line of hashLines) {
          page.drawText(line, {
            x: fieldX + padding,
            y: yOffset,
            size: baseFontSize,
            font: helvetica,
            color: rgb(0.3, 0.3, 0.3),
          });
          yOffset -= lineHeight;
        }

        // Full wallet signature (wrapped)
        for (const line of sigLines) {
          page.drawText(line, {
            x: fieldX + padding,
            y: yOffset,
            size: baseFontSize,
            font: helvetica,
            color: rgb(0.4, 0.4, 0.4),
          });
          yOffset -= lineHeight;
        }
      } else {
        // No wallet signature - show KYC NFT address (wrapped)
        for (const line of nftLines) {
          page.drawText(line, {
            x: fieldX + padding,
            y: yOffset,
            size: baseFontSize,
            font: helvetica,
            color: rgb(0.3, 0.3, 0.3),
          });
          yOffset -= lineHeight;
        }
        page.drawText('[KYC Verified - No Crypto Signature]', {
          x: fieldX + padding,
          y: yOffset,
          size: baseFontSize,
          font: helvetica,
          color: rgb(0.6, 0.4, 0.1),
        });
      }
    } else if (signature?.typed_signature || field.value) {
      // Typed signature or text value
      const text = signature?.typed_signature || field.value || '';
      const fontSize = Math.min(16, fieldHeight * 0.7);
      
      // For signature fields, use cursive-like styling
      if (['signature', 'free-signature', 'initial'].includes(field.field_type)) {
        page.drawText(text, {
          x: fieldX + 5,
          y: fieldY + fieldHeight / 2 - fontSize / 2,
          size: fontSize,
          font: helvetica, // Would use a cursive font if available
          color: rgb(0.1, 0.1, 0.4),
        });
      } else {
        // Regular text fields
        page.drawText(text, {
          x: fieldX + 5,
          y: fieldY + fieldHeight / 2 - fontSize / 2,
          size: Math.min(12, fontSize),
          font: helvetica,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
    }
  }

  return pdfDoc.save();
}

// Helper functions

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}
