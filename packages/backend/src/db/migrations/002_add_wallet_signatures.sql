-- Add wallet signature columns to signatures table
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS wallet_signature TEXT;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(66);
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS document_hash VARCHAR(64);

-- Add index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_signatures_wallet ON signatures(wallet_address);

COMMENT ON COLUMN signatures.wallet_signature IS 'Cryptographic signature from wallet signing the document hash';
COMMENT ON COLUMN signatures.wallet_address IS 'Wallet address that created the signature';
COMMENT ON COLUMN signatures.document_hash IS 'SHA-256 hash of the document that was signed';
