import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { config, validateConfig } from './config/index.js';
import { swaggerSpec } from './config/swagger.js';
import { testConnection, initializeDatabase, closeDatabase } from './db/index.js';

import healthRouter from './routes/health.js';
import discoveryRouter from './routes/discovery.js';
import documentsRouter from './routes/documents.js';
import signingRouter from './routes/signing.js';
import inboxRouter from './routes/inbox.js';
import kycRouter from './routes/kyc.js';
import docsRouter from './routes/docs.js';
import toolsRouter from './routes/tools.js';
import { closeBrowser } from './services/html-renderer.js';

// Validate configuration
validateConfig();

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for Swagger UI
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Allow configured frontend URL, fly.dev domains, and common development origins
    const allowedOrigins = [
      config.frontendUrl,
      'http://localhost:3000',
      'http://localhost:4000',
      'https://soulbound-signature-web.fly.dev',
    ].filter(Boolean);
    
    // Also allow any *.fly.dev subdomain for flexibility
    if (origin.endsWith('.fly.dev')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    
    callback(null, false);
  },
  credentials: true,
  exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'], // x402 headers
}));

// Parse JSON with large limit for base64 documents
app.use(express.json({
  limit: config.maxFileSize,
  verify: (req: express.Request, _res, buf) => {
    // Store raw body for webhook signature verification if needed
    (req as any).rawBody = buf.toString();
  },
}));
app.use(morgan('dev'));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Soulbound Signature API',
}));

// Swagger spec endpoint
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/health', healthRouter);
app.use('/discovery', discoveryRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/sign', signingRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/kyc', kycRouter);
app.use('/api/docs', docsRouter);
app.use('/api/tools', toolsRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Soulbound Signature API',
    version: '1.0.0',
    description: 'x402-powered e-signature service with KYC-verified wallet signing on Aptos',
    documentation: '/api-docs',
    discovery: '/discovery/resources',
    health: '/health',
    endpoints: {
      documents: '/api/documents',
      signing: '/api/sign/:token',
      inbox: '/api/inbox/:walletAddress',
      kyc: '/api/kyc/names/:walletAddress',
      agenticDocs: '/api/docs/field-types',
      tools: '/api/tools/pdf-to-html',
    },
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   SOULBOUND SIGNATURE API                      ║
╠════════════════════════════════════════════════════════════════╣
║  x402-powered e-signature with KYC-verified wallet signing     ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('⚠️  Database not connected. Some features may not work.');
  } else {
    await initializeDatabase();
  }

  app.listen(config.port, () => {
    console.log(`
┌────────────────────────────────────────────────────────────────┐
│  Server running on port ${config.port}                              │
├────────────────────────────────────────────────────────────────┤
│  📚 API Docs:     http://localhost:${config.port}/api-docs            │
│  🔍 Discovery:    http://localhost:${config.port}/discovery/resources │
│  ❤️  Health:       http://localhost:${config.port}/health              │
├────────────────────────────────────────────────────────────────┤
│  Network:         ${config.aptosNetwork.padEnd(42)}│
│  Price:           ${(config.x402.signaturePriceUsdc + ' USDC').padEnd(42)}│
└────────────────────────────────────────────────────────────────┘
`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await closeBrowser();
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await closeBrowser();
  await closeDatabase();
  process.exit(0);
});

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
