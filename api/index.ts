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
  const app = await getApp();
  return app(req, res);
}
