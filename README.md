# Soulbound Signature

x402-powered e-signature application with KYC-verified wallet signing on Aptos.

## Features

- **x402 Payment Protocol**: Pay with USDC to create signature packages
- **Wallet Authentication**: Connect Aptos wallets via Petra for signing
- **KYC-Verified Signing**: Users with Soulbound KYC NFTs can sign using their verified legal names
- **11 Field Types**: Signature, initials, name, email, date, text, number, checkbox, radio, dropdown
- **Agentic API**: HTML-based document creation with `<sig-field>` elements
- **PDF-to-HTML Tool**: Convert existing PDFs for programmatic field placement
- **Wallet Inbox**: Connect wallet to see all pending documents for signature
- **Confirmation Page**: Final page with all signers' names, signatures, dates, and IP addresses

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- An Aptos wallet (e.g., Petra)

### Development

1. Clone and install dependencies:
   ```bash
   cd soulbound-signature
   npm install
   ```

2. Copy environment file:
   ```bash
   cp env.example .env
   ```

3. Start PostgreSQL:
   ```bash
   docker-compose up -d postgres
   ```

4. Run development servers:
   ```bash
   npm run dev
   ```

   - Backend: http://localhost:4000
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:4000/api-docs

### Production (Docker)

```bash
docker-compose up -d
```

## API Endpoints

### Discovery
- `GET /discovery/resources` - x402 Bazaar-compatible resource discovery

### Documents (x402 Protected)
- `POST /api/documents/create` - Create signature package (HTML or PDF)
- `GET /api/documents/:id` - Get document details
- `POST /api/documents/:id/distribute` - Send for signing

### Signing (Free)
- `GET /api/sign/:token` - Get signing session
- `POST /api/sign/:token/field/:fieldId` - Sign a field
- `GET /api/inbox/:walletAddress` - Get pending documents for wallet

### Agentic Tools (Free)
- `GET /api/docs/field-types` - Get supported field types
- `GET /api/docs/html-template` - Get HTML template example
- `POST /api/tools/pdf-to-html` - Convert PDF to editable HTML

### KYC Integration
- `GET /api/kyc/names/:walletAddress` - Get verified names from KYC NFTs

## HTML Document Format

For agentic users, create documents using HTML with `<sig-field>` elements:

```html
<sig-field type="signature" recipient="1" width="200" height="60" />
<sig-field type="name" recipient="1" />
<sig-field type="date" recipient="1" />
<sig-field type="checkbox" recipient="2" values='[{"value":"I agree"}]' />
```

## Architecture

```
soulbound-signature/
├── packages/
│   ├── backend/          # Express.js API server
│   │   └── src/
│   │       ├── config/   # Environment & Swagger config
│   │       ├── db/       # PostgreSQL schema & queries
│   │       ├── middleware/  # x402 payment middleware
│   │       ├── routes/   # API routes
│   │       └── services/ # Business logic
│   └── frontend/         # Next.js application
│       └── src/
│           ├── app/      # Pages (create, inbox, sign)
│           ├── components/  # React components
│           └── lib/      # Utilities
└── docker-compose.yml
```

## License

MIT
