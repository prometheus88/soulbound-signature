import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { config } from '../config/index.js';
import type { KYCVerifiedIdentity } from '../types/index.js';

// Initialize Aptos client
const aptosConfig = new AptosConfig({
  network: config.aptosNetwork === 'mainnet' ? Network.MAINNET : Network.TESTNET,
});
const aptos = new Aptos(aptosConfig);

/**
 * Get all KYC-verified names from Soulbound KYC NFTs for a wallet
 * 
 * This queries the Aptos blockchain for NFTs from the Soulbound KYC collection
 * and returns verified names from approved KYC NFTs.
 */
export async function getKYCVerifiedNames(walletAddress: string): Promise<KYCVerifiedIdentity[]> {
  const verifiedNames: KYCVerifiedIdentity[] = [];

  try {
    // If no KYC collection address configured, return empty
    if (!config.kyc.collectionAddress) {
      console.log('No KYC collection address configured');
      return verifiedNames;
    }

    // Query owned tokens using the digital assets API
    const ownedTokens = await aptos.getOwnedDigitalAssets({
      ownerAddress: walletAddress,
    });

    // Filter for tokens from the KYC collection
    for (const token of ownedTokens) {
      try {
        // Check if this token is from our KYC collection
        // Token structure may vary based on collection setup
        const tokenData = token.current_token_data;
        
        if (!tokenData) continue;

        // Check if it's from the KYC collection
        const collectionId = tokenData.collection_id;
        
        // For soulbound KYC, we need to check the token properties
        // The structure depends on how the collection was created
        const properties = tokenData.token_properties as Record<string, unknown> | undefined;
        
        if (!properties) continue;

        // Check for KYC status
        const kycStatus = properties['kyc_status'] as string | undefined;
        if (kycStatus !== 'approved') continue;

        // Extract verified name
        const fullName = properties['full_name'] as string | undefined;
        if (!fullName) continue;

        // Get optional fields
        const country = properties['country'] as string | undefined;
        const verificationTimestamp = properties['verification_date'] as number | undefined;

        verifiedNames.push({
          nftAddress: token.token_data_id || '',
          fullName,
          country,
          verificationDate: verificationTimestamp || Date.now(),
        });
      } catch (tokenError) {
        // Skip tokens that don't match expected structure
        console.debug('Skipping token:', tokenError);
        continue;
      }
    }

    return verifiedNames;
  } catch (error) {
    console.error('Error fetching KYC NFTs:', error);
    // Return empty array on error - don't fail signing flow
    return verifiedNames;
  }
}

/**
 * Verify that a specific name belongs to a wallet's KYC NFT
 */
export async function verifyKYCName(
  walletAddress: string,
  name: string,
  nftAddress?: string
): Promise<{
  verified: boolean;
  nftAddress?: string;
  fullName?: string;
  error?: string;
}> {
  try {
    const verifiedNames = await getKYCVerifiedNames(walletAddress);

    if (verifiedNames.length === 0) {
      return {
        verified: false,
        error: 'No KYC NFTs found for this wallet',
      };
    }

    // If specific NFT address provided, check that one
    if (nftAddress) {
      const match = verifiedNames.find(
        (v) => v.nftAddress === nftAddress && v.fullName.toLowerCase() === name.toLowerCase()
      );

      if (match) {
        return {
          verified: true,
          nftAddress: match.nftAddress,
          fullName: match.fullName,
        };
      }

      return {
        verified: false,
        error: 'Name does not match the specified KYC NFT',
      };
    }

    // Otherwise, check if name matches any KYC NFT
    const match = verifiedNames.find(
      (v) => v.fullName.toLowerCase() === name.toLowerCase()
    );

    if (match) {
      return {
        verified: true,
        nftAddress: match.nftAddress,
        fullName: match.fullName,
      };
    }

    return {
      verified: false,
      error: `Name "${name}" not found in wallet's KYC NFTs. Available names: ${verifiedNames.map(v => v.fullName).join(', ')}`,
    };
  } catch (error) {
    console.error('KYC verification error:', error);
    return {
      verified: false,
      error: 'Failed to verify KYC status',
    };
  }
}

/**
 * Check if a wallet has any valid KYC NFT
 */
export async function hasValidKYC(walletAddress: string): Promise<boolean> {
  const verifiedNames = await getKYCVerifiedNames(walletAddress);
  return verifiedNames.length > 0;
}

/**
 * Get KYC details by NFT address
 */
export async function getKYCDetails(nftAddress: string): Promise<KYCVerifiedIdentity | null> {
  try {
    // Query specific token
    const tokenData = await aptos.getDigitalAssetData({
      digitalAssetAddress: nftAddress,
    });

    const properties = tokenData.token_properties as Record<string, unknown> | undefined;
    
    if (!properties) return null;

    const kycStatus = properties['kyc_status'] as string | undefined;
    if (kycStatus !== 'approved') return null;

    const fullName = properties['full_name'] as string | undefined;
    if (!fullName) return null;

    return {
      nftAddress,
      fullName,
      country: properties['country'] as string | undefined,
      verificationDate: (properties['verification_date'] as number) || Date.now(),
    };
  } catch (error) {
    console.error('Error getting KYC details:', error);
    return null;
  }
}
