import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { adminBillingRouter } from './routes/admin/billing.js';
import { adminConfigRouter } from './routes/admin/config.js';
import { adminManageRouter } from './routes/admin/manage.js';
import { authRouter, meRouter } from './routes/auth.js';
import { driverRouter } from './routes/driver.js';
import { ownerRouter } from './routes/owner.js';
import { documentsRouter, publicRouter } from './routes/public.js';
import { bookingsRouter, rentalsRouter } from './routes/rentals.js';
import { ridesRouter } from './routes/rides.js';
import { uploadRoot } from './services/uploads.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // Uploaded images are loaded cross-origin by the admin panel and the app.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.use('/uploads', express.static(uploadRoot, { maxAge: '7d', index: false }));

  const api = Router();
  api.use('/', publicRouter);
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/documents', documentsRouter);
  api.use('/rides', ridesRouter);
  api.use('/driver', driverRouter);
  api.use('/rentals', rentalsRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/owner', ownerRouter);

  const admin = Router();
  admin.use(requireAuth, requireAdmin);
  admin.use('/', adminManageRouter);
  admin.use('/', adminConfigRouter);
  admin.use('/billing', adminBillingRouter);
  api.use('/admin', admin);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
