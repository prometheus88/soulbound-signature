import { Router } from 'express';
import { getKYCVerifiedNames, verifyKYCName, getKYCDetails } from '../services/kyc-lookup.js';

const router = Router();

/**
 * @openapi
 * /api/kyc/names/{walletAddress}:
 *   get:
 *     summary: Get KYC-verified names for a wallet
 *     description: |
 *       Query the Aptos blockchain for all Soulbound KYC NFTs owned by the wallet
 *       and return the verified names from approved NFTs.
 *       
 *       This is a free endpoint - no payment required.
 *     tags: [KYC]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: Aptos wallet address
 *     responses:
 *       200:
 *         description: List of verified names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 walletAddress:
 *                   type: string
 *                 hasKYC:
 *                   type: boolean
 *                 verifiedNames:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KYCVerifiedIdentity'
 *       400:
 *         description: Invalid wallet address
 */
router.get('/names/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    // Basic validation
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      res.status(400).json({ error: 'Invalid wallet address format' });
      return;
    }

    const verifiedNames = await getKYCVerifiedNames(walletAddress);

    res.json({
      walletAddress,
      hasKYC: verifiedNames.length > 0,
      verifiedNames,
      note: verifiedNames.length === 0 
        ? 'No KYC NFTs found. User can still sign with traditional signatures.'
        : 'User can sign using any of these verified names.',
    });
  } catch (error) {
    console.error('Error fetching KYC names:', error);
    res.status(500).json({ error: 'Failed to fetch KYC information' });
  }
});

/**
 * @openapi
 * /api/kyc/verify/{walletAddress}/{name}:
 *   get:
 *     summary: Verify a specific name belongs to a wallet's KYC NFT
 *     description: Check if the given name matches a verified identity from the wallet's KYC NFTs
 *     tags: [KYC]
 *     parameters:
 *       - in: path
 *         name: walletAddress
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: nftAddress
 *         required: false
 *         schema:
 *           type: string
 *         description: Specific NFT address to verify against
 *     responses:
 *       200:
 *         description: Verification result
 */
router.get('/verify/:walletAddress/:name', async (req, res) => {
  try {
    const { walletAddress, name } = req.params;
    const { nftAddress } = req.query;

    if (!walletAddress || !walletAddress.startsWith('0x')) {
      res.status(400).json({ error: 'Invalid wallet address format' });
      return;
    }

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const result = await verifyKYCName(
      walletAddress,
      decodeURIComponent(name),
      nftAddress as string | undefined
    );

    res.json(result);
  } catch (error) {
    console.error('Error verifying KYC:', error);
    res.status(500).json({ 
      verified: false,
      error: 'Verification failed' 
    });
  }
});

/**
 * @openapi
 * /api/kyc/nft/{nftAddress}:
 *   get:
 *     summary: Get KYC details by NFT address
 *     description: Retrieve the KYC information stored in a specific NFT
 *     tags: [KYC]
 *     parameters:
 *       - in: path
 *         name: nftAddress
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: KYC NFT details
 *       404:
 *         description: NFT not found or not a valid KYC NFT
 */
router.get('/nft/:nftAddress', async (req, res) => {
  try {
    const { nftAddress } = req.params;

    if (!nftAddress || !nftAddress.startsWith('0x')) {
      res.status(400).json({ error: 'Invalid NFT address format' });
      return;
    }

    const details = await getKYCDetails(nftAddress);

    if (!details) {
      res.status(404).json({ error: 'KYC NFT not found or not approved' });
      return;
    }

    res.json(details);
  } catch (error) {
    console.error('Error fetching KYC details:', error);
    res.status(500).json({ error: 'Failed to fetch KYC details' });
  }
});

export default router;
