import { Router } from 'express';
import { testConnection } from '../db/index.js';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 database:
 *                   type: string
 *                   enum: [connected, disconnected]
 */
router.get('/', async (_req, res) => {
  const dbConnected = await testConnection();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    service: 'soulbound-signature',
    version: '1.0.0',
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (_req, res) => {
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    res.status(503).json({
      status: 'not ready',
      reason: 'Database not connected',
    });
    return;
  }
  
  res.json({ status: 'ready' });
});

export default router;
