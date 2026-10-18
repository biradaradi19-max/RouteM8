import express from 'express';
import cors from 'cors';
import path from 'node:path';
import authRouter from './routes/auth.js';
import deliveriesRouter from './routes/deliveries.js';
import journeysRouter from './routes/journeys.js';
import livekitRouter from './routes/livekit.js';
import activitiesRouter from './routes/activities.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static uploads serving for delivery-proof photos
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'RouteM8 Express API',
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/deliveries', deliveriesRouter);
  app.use('/api/journeys', journeysRouter);
  app.use('/api/livekit', livekitRouter);
  app.use('/api/activities', activitiesRouter);

  // Global 404 handler for API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}
