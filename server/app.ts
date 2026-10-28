import express from 'express';
import cors from 'cors';
import path from 'node:path';
import authRouter from './routes/auth.js';
import deliveriesRouter from './routes/deliveries.js';
import journeysRouter from './routes/journeys.js';
import livekitRouter from './routes/livekit.js';
import activitiesRouter from './routes/activities.js';
import placesRouter from './routes/places.js';
import { isDbConnected, ATLAS_URI } from './config/db.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static uploads serving for delivery-proof photos
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const uploadsPath = isServerless ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Health check (supports both /api/health and /health)
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      service: 'RouteM8 Express API',
      database: isDbConnected() ? 'connected' : 'disconnected',
      hasMongoUri: Boolean(process.env.MONGODB_URI || ATLAS_URI),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // API Routes (mounted with both /api/* and /* for transparent serverless compatibility)
  app.use('/api/auth', authRouter);
  app.use('/auth', authRouter);

  app.use('/api/deliveries', deliveriesRouter);
  app.use('/deliveries', deliveriesRouter);

  app.use('/api/journeys', journeysRouter);
  app.use('/journeys', journeysRouter);

  app.use('/api/livekit', livekitRouter);
  app.use('/livekit', livekitRouter);

  app.use('/api/activities', activitiesRouter);
  app.use('/activities', activitiesRouter);

  app.use('/api/places', placesRouter);
  app.use('/places', placesRouter);

  // Global 404 handler for API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });


  return app;
}

