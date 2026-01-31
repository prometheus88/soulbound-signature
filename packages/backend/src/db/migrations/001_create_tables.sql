-- Soulbound Signature Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- Document Packages
-- ==========================================
CREATE TABLE IF NOT EXISTS signature_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'completed', 'cancelled')),
    owner_wallet_address VARCHAR(66) NOT NULL,
    payment_tx_hash VARCHAR(66),
    document_data TEXT, -- Base64 PDF or file path
    document_html TEXT, -- Original HTML if created from HTML
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_packages_owner ON signature_packages(owner_wallet_address);
CREATE INDEX idx_packages_status ON signature_packages(status);
CREATE INDEX idx_packages_created ON signature_packages(created_at DESC);

-- ==========================================
-- Recipients/Signers
-- ==========================================
CREATE TABLE IF NOT EXISTS recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES signature_packages(id) ON DELETE CASCADE,
    wallet_address VARCHAR(66),           -- Aptos wallet address (optional)
    email VARCHAR(255),                   -- Email address (optional)
    name VARCHAR(255) NOT NULL,           -- Display name
    role VARCHAR(50) DEFAULT 'signer' CHECK (role IN ('signer', 'viewer', 'cc')),
    signing_order INT,
    signing_status VARCHAR(50) DEFAULT 'pending' CHECK (signing_status IN ('pending', 'signed', 'rejected')),
    signed_at TIMESTAMP WITH TIME ZONE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    token VARCHAR(255) UNIQUE NOT NULL,   -- Unique signing link token
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT recipient_identifier CHECK (wallet_address IS NOT NULL OR email IS NOT NULL)
);

-- Index for wallet-based inbox queries
CREATE INDEX idx_recipients_wallet ON recipients(wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX idx_recipients_email ON recipients(email) WHERE email IS NOT NULL;
CREATE INDEX idx_recipients_token ON recipients(token);
CREATE INDEX idx_recipients_package ON recipients(package_id);
CREATE INDEX idx_recipients_status ON recipients(signing_status);

-- ==========================================
-- Signature Fields
-- ==========================================
CREATE TABLE IF NOT EXISTS signature_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES signature_packages(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN (
        'signature', 'free-signature', 'initial',
        'name', 'email', 'date',
        'text', 'number',
        'checkbox', 'radio', 'dropdown'
    )),
    page INT NOT NULL DEFAULT 1,
    position_x DECIMAL(10, 4) NOT NULL DEFAULT 0,
    position_y DECIMAL(10, 4) NOT NULL DEFAULT 0,
    width DECIMAL(10, 4) NOT NULL DEFAULT 200,
    height DECIMAL(10, 4) NOT NULL DEFAULT 60,
    value TEXT,                           -- Filled value
    field_meta JSONB,                     -- Additional field configuration
    inserted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fields_package ON signature_fields(package_id);
CREATE INDEX idx_fields_recipient ON signature_fields(recipient_id);
CREATE INDEX idx_fields_type ON signature_fields(field_type);

-- ==========================================
-- Signatures
-- ==========================================
CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    field_id UUID NOT NULL REFERENCES signature_fields(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    signature_image TEXT,                 -- Base64-encoded signature image
    typed_signature VARCHAR(255),         -- Typed signature text
    kyc_verified_name VARCHAR(255),       -- Name from KYC NFT
    kyc_nft_address VARCHAR(66),          -- Address of KYC NFT used
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_signatures_field ON signatures(field_id);
CREATE INDEX idx_signatures_recipient ON signatures(recipient_id);

-- ==========================================
-- Audit Logs
-- ==========================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID REFERENCES signature_packages(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    user_wallet VARCHAR(66),
    user_email VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_package ON audit_logs(package_id);
CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ==========================================
-- Document Files (for storing uploaded PDFs)
-- ==========================================
CREATE TABLE IF NOT EXISTS document_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES signature_packages(id) ON DELETE CASCADE,
    file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('original', 'preview', 'signed', 'certificate')),
    file_path VARCHAR(500),               -- Path to file on disk
    file_data TEXT,                       -- Or base64 data for small files
    mime_type VARCHAR(100) DEFAULT 'application/pdf',
    file_size INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_files_package ON document_files(package_id);
CREATE INDEX idx_files_type ON document_files(file_type);

-- ==========================================
-- Functions
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for signature_packages
DROP TRIGGER IF EXISTS update_signature_packages_updated_at ON signature_packages;
CREATE TRIGGER update_signature_packages_updated_at
    BEFORE UPDATE ON signature_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- Comments
-- ==========================================
COMMENT ON TABLE signature_packages IS 'Document packages containing documents to be signed';
COMMENT ON TABLE recipients IS 'Recipients/signers for document packages';
COMMENT ON TABLE signature_fields IS 'Fields placed on documents (signature, text, checkbox, etc.)';
COMMENT ON TABLE signatures IS 'Actual signature data for signed fields';
COMMENT ON TABLE audit_logs IS 'Audit trail for all document actions';
COMMENT ON TABLE document_files IS 'Stored document files (original, preview, signed versions)';
