import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import authRouter from './routes/auth.js';
import deliveriesRouter from './routes/deliveries.js';
import journeysRouter from './routes/journeys.js';
import livekitRouter from './routes/livekit.js';
import activitiesRouter from './routes/activities.js';
import placesRouter from './routes/places.js';
import partnerRouter from './routes/partnerApplication.js';
import paymentsRouter from './routes/payments.js';
import { isDbConnected, connectDB, getLastDbError } from './config/db.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // Correlation ID middleware
  app.use((req, res, next) => {
    const incomingId = req.headers['x-correlation-id'];
    const correlationId =
      typeof incomingId === 'string' && incomingId.trim()
        ? incomingId.trim()
        : `req_${crypto.randomUUID()}`;
    (req as any).correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    next();
  });

  // Security Headers middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Secure CORS origin resolution
  const isTest = process.env.NODE_ENV === 'test';
  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5000',
    'https://route-m8.vercel.app',
  ];
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : defaultAllowedOrigins;

  app.use(
    cors({
      origin: isTest
        ? true
        : (origin, callback) => {
            if (!origin || configuredOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
              callback(null, true);
            } else {
              callback(new Error(`CORS blocked for origin: ${origin}`));
            }
          },
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static uploads serving for delivery-proof photos
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const uploadsPath = isServerless ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Health check (supports both /api/health and /health)
  const healthHandler = async (_req: express.Request, res: express.Response) => {
    if (!isDbConnected()) {
      try {
        await connectDB();
      } catch {
        // Handled inside connectDB
      }
    }
    const connected = isDbConnected();
    res.json({
      status: 'ok',
      service: 'RouteM8 Express API',
      database: connected ? 'connected' : 'disconnected',
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      dbError: connected ? null : getLastDbError(),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/api/health', healthHandler);
  app.get('/health', healthHandler);

  // Readiness check (supports both /api/ready and /ready)
  const readyHandler = async (_req: express.Request, res: express.Response) => {
    if (!isDbConnected()) {
      try {
        await connectDB();
      } catch {
        // Handled inside connectDB
      }
    }
    const connected = isDbConnected();
    const isProd = process.env.NODE_ENV === 'production';

    if (isProd && !connected) {
      res.status(503).json({
        status: 'not_ready',
        service: 'RouteM8 Express API',
        database: 'disconnected',
        error: getLastDbError() || 'MongoDB is disconnected in production',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      status: 'ready',
      service: 'RouteM8 Express API',
      database: connected ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/api/ready', readyHandler);
  app.get('/ready', readyHandler);



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

  app.use('/api/partner', partnerRouter);
  app.use('/partner', partnerRouter);

  app.use('/api/payments', paymentsRouter);
  app.use('/payments', paymentsRouter);

  // Global 404 handler for API routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global 500 error handler returning correlation ID and sanitized message in production
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const correlationId = (req as any).correlationId || 'unknown';
    logger.error('Unhandled request error', { correlationId, path: req.path, method: req.method }, err);
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error:
        process.env.NODE_ENV === 'production' && statusCode === 500
          ? 'Internal Server Error'
          : err.message || 'Internal Server Error',
      correlationId,
    });
  });

  return app;
}
