import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.js';
import { connectDB } from '../server/config/db.js';

let appPromise: Promise<any> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      try {
        await connectDB();
      } catch (err: any) {
        console.warn('[Vercel Serverless] MongoDB connect attempt:', err.message);
      }
      return createApp();
    })();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getApp();
    return new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err) => reject(err));
      app(req, res);
    });
  } catch (err: any) {
    console.error('[Vercel Serverless Fatal]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: err?.message || 'Serverless Invocation Exception',
          stack: err?.stack,
        })
      );
    }
  }
}

