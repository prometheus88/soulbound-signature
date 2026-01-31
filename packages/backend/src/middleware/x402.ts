import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import type { PaymentRequirements, PaymentPayload } from '../types/index.js';

// Build payment requirements for the signature service
export function buildPaymentRequirements(): PaymentRequirements {
  return {
    scheme: 'exact',
    network: config.x402.network,
    amount: config.x402.priceAtomic,
    asset: config.x402.usdcAssetAddress,
    payTo: config.x402.paymentRecipientAddress,
    maxTimeoutSeconds: 300, // 5 minutes
    extra: {
      sponsored: true, // Facilitator pays gas
    },
  };
}

// Build the 402 Payment Required response
export function buildPaymentRequired(requestUrl: string) {
  const requirements = buildPaymentRequirements();

  return {
    x402Version: 2,
    error: 'PAYMENT-SIGNATURE header is required',
    resource: {
      url: requestUrl,
      description: `Soulbound Signature Service - ${config.x402.signaturePriceUsdc} USDC`,
      mimeType: 'application/json',
    },
    accepts: [requirements],
  };
}

// Verify payment with the facilitator
async function verifyPayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<{ isValid: boolean; payer?: string; invalidReason?: string }> {
  try {
    const url = `${config.x402.facilitatorUrl}/verify`;
    console.log('🌐 Calling facilitator verify:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    const responseText = await response.text();
    console.log('📥 Facilitator response status:', response.status);
    console.log('📥 Facilitator response:', responseText);

    try {
      const result = JSON.parse(responseText) as { isValid: boolean; payer?: string; invalidReason?: string };
      return result;
    } catch {
      return { isValid: false, invalidReason: `Invalid response: ${responseText}` };
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    return { isValid: false, invalidReason: 'Verification request failed' };
  }
}

// Settle payment with the facilitator
async function settlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements
): Promise<{ success: boolean; transaction?: string; payer?: string; errorReason?: string }> {
  try {
    const response = await fetch(`${config.x402.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
    });

    const result = (await response.json()) as { success: boolean; transaction?: string; payer?: string; errorReason?: string };
    return result;
  } catch (error) {
    console.error('Payment settlement error:', error);
    return { success: false, errorReason: 'Settlement request failed' };
  }
}

// Express middleware for x402 payment protection
export function x402PaymentMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const handlePayment = async () => {
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Check for payment signature header
    const paymentSignature = req.headers['payment-signature'] as string | undefined;

    if (!paymentSignature) {
      // No payment - return 402 with payment requirements
      const paymentRequired = buildPaymentRequired(requestUrl);
      const paymentRequiredB64 = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');

      console.log('💳 Returning 402 Payment Required');
      res
        .status(402)
        .set('PAYMENT-REQUIRED', paymentRequiredB64)
        .json({ error: 'Payment required', x402Version: 2 });
      return;
    }

    try {
      // Decode the payment payload
      const paymentPayload: PaymentPayload = JSON.parse(
        Buffer.from(paymentSignature, 'base64').toString('utf-8')
      );

      // DEBUG: Log received payload structure
      console.log('📦 Received payment payload:');
      console.log('  x402Version:', paymentPayload.x402Version);
      console.log('  resource:', JSON.stringify(paymentPayload.resource));
      console.log('  accepted keys:', Object.keys(paymentPayload.accepted || {}));
      if (paymentPayload.payload) {
        const txPayload = paymentPayload.payload as any;
        if (typeof txPayload.transaction === 'string') {
          console.log('  payload.transaction: (base64 string, length:', txPayload.transaction.length, ')');
          try {
            const innerPayload = JSON.parse(Buffer.from(txPayload.transaction, 'base64').toString('utf-8'));
            console.log('  inner transaction keys:', Object.keys(innerPayload));
            console.log('  inner transaction bytes length:', innerPayload.transaction?.length);
            console.log('  inner senderAuthenticator bytes length:', innerPayload.senderAuthenticator?.length);
          } catch (e) {
            console.log('  could not decode inner payload');
          }
        } else if (Array.isArray(txPayload.transaction)) {
          console.log('  payload.transaction: (byte array, length:', txPayload.transaction.length, ')');
        }
      }

      const paymentRequirements = buildPaymentRequirements();
      console.log('📋 Payment requirements:', JSON.stringify(paymentRequirements, null, 2));

      // Step 1: Verify the payment
      console.log('🔍 Verifying payment with facilitator...');
      const verifyResult = await verifyPayment(paymentPayload, paymentRequirements);

      if (!verifyResult.isValid) {
        console.log('❌ Payment verification failed:', verifyResult.invalidReason);
        res.status(402).json({
          error: 'Payment verification failed',
          reason: verifyResult.invalidReason,
        });
        return;
      }

      console.log('✅ Payment verified!');

      // Step 2: Settle the payment
      console.log('💰 Settling payment...');
      const settleResult = await settlePayment(paymentPayload, paymentRequirements);

      if (!settleResult.success) {
        console.log('❌ Settlement failed:', settleResult.errorReason);
        res.status(402).json({
          error: 'Payment settlement failed',
          reason: settleResult.errorReason,
        });
        return;
      }

      console.log('✅ Payment settled! Transaction:', settleResult.transaction);

      // Attach payment info to request for downstream handlers
      (req as any).paymentInfo = {
        transactionHash: settleResult.transaction,
        payer: verifyResult.payer || settleResult.payer,
        amount: paymentRequirements.amount,
        network: paymentRequirements.network,
      };

      // Continue to the route handler
      next();
    } catch (error) {
      console.error('❌ Error processing payment:', error);
      res.status(500).json({ error: 'Internal server error processing payment' });
    }
  };

  handlePayment();
}

// Helper to attach payment response header to successful responses
export function attachPaymentResponseHeader(
  res: Response,
  transactionHash: string,
  payer: string
): void {
  const settlementResponse = {
    success: true,
    transaction: transactionHash,
    network: config.x402.network,
    payer,
  };
  const paymentResponseB64 = Buffer.from(JSON.stringify(settlementResponse)).toString('base64');
  res.set('PAYMENT-RESPONSE', paymentResponseB64);
}
