import type { IncomingMessage, ServerResponse } from 'node:http';

let appInstance: any = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!appInstance) {
      try {
        const { connectDB } = await import('../server/config/db.js');
        await connectDB();
      } catch (dbErr: any) {
        console.warn('[Vercel Serverless] DB connection skipped or failed:', dbErr?.message || dbErr);
      }
      const { createApp } = await import('../server/app.js');
      appInstance = createApp();
    } else {
      try {
        const { isDbConnected, connectDB } = await import('../server/config/db.js');
        if (!isDbConnected()) {
          await connectDB();
        }
      } catch {
        // Fall back gracefully
      }
    }

    return new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err) => reject(err));
      appInstance(req, res);
    });
  } catch (err: any) {
    console.error('[Vercel Serverless Fatal]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: err?.message || 'Serverless Invocation Exception',
          name: err?.name,
          code: err?.code,
          stack: err?.stack,
        })
      );
    }
  }
}

