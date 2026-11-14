import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { pool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import { categories, suppliers, warehouses } from './routes/catalog.js';
import productRoutes from './routes/products.js';
import stockRoutes from './routes/stock.js';
import purchaseOrderRoutes from './routes/purchaseOrders.js';
import salesOrderRoutes from './routes/salesOrders.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'db_unavailable' }); }
  });

  app.use('/api/auth', authRoutes);

  // Everything below requires a valid session. Role checks live inside each router.
  const api = express.Router();
  api.use(authenticate);
  api.use('/users', userRoutes);
  api.use('/categories', categories);
  api.use('/suppliers', suppliers);
  api.use('/warehouses', warehouses);
  api.use('/products', productRoutes);
  api.use('/stock', stockRoutes);
  api.use('/purchase-orders', purchaseOrderRoutes);
  api.use('/sales-orders', salesOrderRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/reports', reportRoutes);
  api.use('/audit', auditRoutes);
  app.use('/api', api);
  app.use('/api', notFoundHandler);

  // Serve the built React app in production (single-service deploy)
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
