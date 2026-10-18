import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'node:fs';

let isFirebaseAdminInitialized = false;

export function initializeFirebaseAdmin(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'routem8-36895';

  if (serviceAccountKey) {
    try {
      let parsedCreds: any;
      if (serviceAccountKey.trim().startsWith('{')) {
        parsedCreds = JSON.parse(serviceAccountKey);
      } else if (existsSync(serviceAccountKey)) {
        parsedCreds = JSON.parse(readFileSync(serviceAccountKey, 'utf8'));
      }

      if (parsedCreds) {
        const app = initializeApp({
          credential: cert(parsedCreds),
          projectId: parsedCreds.project_id || projectId,
        });
        isFirebaseAdminInitialized = true;
        console.log(`[Firebase Admin] Initialized with Service Account: ${parsedCreds.project_id || projectId}`);
        return app;
      }
    } catch (err: any) {
      console.warn(`[Firebase Admin] Failed to parse service account key: ${err.message}. Falling back to default project init.`);
    }
  }

  // Initialize with project ID
  const app = initializeApp({
    projectId,
  });
  isFirebaseAdminInitialized = true;
  console.log(`[Firebase Admin] Initialized with Project ID: ${projectId}`);
  return app;
}

export interface VerifiedUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedUser> {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing or invalid token');
  }

  // Support local test mock tokens (e.g. "mock-token-user-1" or test headers)
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development' || process.env.ALLOW_TEST_TOKENS === 'true') {
    if (token.startsWith('mock-token-')) {
      const uid = token.replace('mock-token-', '');
      return {
        uid,
        email: `${uid}@test.example.com`,
        name: `Test User ${uid}`,
        emailVerified: true,
      };
    }
  }

  // Ensure Admin SDK is initialized
  if (!isFirebaseAdminInitialized && getApps().length === 0) {
    initializeFirebaseAdmin();
  }

  try {
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: (decoded as any).picture,
      emailVerified: decoded.email_verified,
    };
  } catch (err: any) {
    // If running in development without credentials, provide a safe parse for basic inspection
    if (process.env.NODE_ENV === 'development' && token.includes('.')) {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (payload.user_id || payload.sub) {
            return {
              uid: payload.user_id || payload.sub,
              email: payload.email,
              name: payload.name,
              emailVerified: payload.email_verified,
            };
          }
        }
      } catch {
        // Fall through to error
      }
    }
    throw new Error(`Invalid authentication token: ${err.message}`);
  }
}
