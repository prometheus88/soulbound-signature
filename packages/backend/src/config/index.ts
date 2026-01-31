import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || process.env.BACKEND_PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://soulbound:soulbound@localhost:5432/soulbound_signature',
  
  // Aptos Network
  aptosNetwork: process.env.APTOS_NETWORK || 'testnet',
  
  // x402 Payment Configuration
  x402: {
    facilitatorUrl: process.env.FACILITATOR_URL || 'https://x402-navy.vercel.app/facilitator',
    paymentRecipientAddress: process.env.PAYMENT_RECIPIENT_ADDRESS || '0xe180ab508e40206c6d9ca9e18296178dad1c2fa47d500b02a5b36cd0a26273eb',
    signaturePriceUsdc: parseFloat(process.env.SIGNATURE_PRICE_USDC || '1'),
    priceAtomic: (parseFloat(process.env.SIGNATURE_PRICE_USDC || '1') * 1_000_000).toString(),
    usdcAssetAddress: process.env.USDC_ASSET_ADDRESS || '0x69091fbab5f7d635ee7ac5098cf0c1efbe31d68fec0f2cd565e8d168daf52832',
    // aptos:2 = testnet, aptos:1 = mainnet (x402 facilitator format)
    get network() {
      const aptosNetwork = process.env.APTOS_NETWORK || 'testnet';
      return aptosNetwork === 'testnet' ? 'aptos:2' : 'aptos:1';
    },
  },
  
  // Soulbound KYC NFT Configuration
  kyc: {
    collectionAddress: process.env.KYC_COLLECTION_ADDRESS || '',
    moduleAddress: process.env.KYC_MODULE_ADDRESS || '',
  },
  
  // File Storage
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: process.env.MAX_FILE_SIZE || '50mb',
  
  // Frontend URL (for CORS and links)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};

export function validateConfig(): void {
  const requiredVars: string[] = [];
  
  // In production, require payment recipient address
  if (config.nodeEnv === 'production') {
    if (!config.x402.paymentRecipientAddress) {
      requiredVars.push('PAYMENT_RECIPIENT_ADDRESS');
    }
  }
  
  if (requiredVars.length > 0) {
    console.error('Missing required environment variables:', requiredVars.join(', '));
    process.exit(1);
  }
}
