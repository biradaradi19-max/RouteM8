import { createServer } from 'node:http';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { initializeFirebaseAdmin } from './config/firebaseAdmin.js';
import { setupSocketServer } from './socket/index.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  console.log('--- Starting RouteM8 Backend Server ---');

  // 1. Initialize Firebase Admin SDK
  try {
    initializeFirebaseAdmin();
  } catch (err: any) {
    console.warn(`[Bootstrap] Firebase Admin initialization notice: ${err.message}`);
  }

  // 2. Connect to MongoDB
  try {
    await connectDB();
  } catch (err: any) {
    console.warn(`[Bootstrap] MongoDB connection notice: ${err.message}`);
  }

  // 3. Create Express app & HTTP Server
  const app = createApp();
  const httpServer = createServer(app);

  // 4. Setup Socket.IO with real-time GPS & calling signaling
  const io = setupSocketServer(httpServer);
  app.set('io', io);

  // 5. Start listening
  httpServer.listen(PORT, () => {
    console.log(`[RouteM8 Server] Listening on port ${PORT}`);
    console.log(`[RouteM8 Server] API Health: http://localhost:${PORT}/api/health`);
    console.log(`[RouteM8 Server] Socket.IO ready on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[RouteM8 Server] Fatal startup error:', err);
  process.exit(1);
});
