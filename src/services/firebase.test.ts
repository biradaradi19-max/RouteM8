import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  app,
  auth,
  googleAuthProvider,
  firebaseConfig,
  getFirebaseConfig,
  isFirebaseConfigured,
  initAnalytics,
  logFirebaseEvent,
  getFirebaseAuthErrorMessage,
  DEFAULT_FIREBASE_CONFIG
} from './firebase';

describe('Firebase Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exports an initialized Firebase App instance', () => {
    expect(app).toBeDefined();
    expect(app.name).toBe('[DEFAULT]');
    expect(app.options.projectId).toBe('routem8-36895');
  });

  it('exports initialized Firebase Auth and GoogleAuthProvider', () => {
    expect(auth).toBeDefined();
    expect(auth.app).toBe(app);
    expect(googleAuthProvider).toBeDefined();
    expect(googleAuthProvider.providerId).toBe('google.com');
  });

  it('provides the correct Firebase project configuration', () => {
    expect(firebaseConfig.projectId).toBe('routem8-36895');
    const config = getFirebaseConfig();
    expect(config.projectId).toBe('routem8-36895');
    expect(config.apiKey).toBe('AIzaSyCxPYT1biGr5-pqmbKSTzD4ZJs-RQ4lFBs');
    expect(config.authDomain).toBe('routem8-36895.firebaseapp.com');
    expect(config.storageBucket).toBe('routem8-36895.firebasestorage.app');
    expect(config.messagingSenderId).toBe('236126555492');
    expect(config.appId).toBe('1:236126555492:web:7b117e8ec53972bc86be71');
    expect(config.measurementId).toBe('G-4GGKRSS4G9');
  });

  it('confirms Firebase is configured', () => {
    expect(isFirebaseConfigured()).toBe(true);
  });

  it('handles analytics gracefully when IndexedDB is not supported', async () => {
    const analytics = await initAnalytics();
    expect(analytics === null || typeof analytics === 'object').toBe(true);
  });

  it('handles logFirebaseEvent without throwing even if analytics is unavailable', async () => {
    await expect(logFirebaseEvent('test_event', { page: 'home' })).resolves.not.toThrow();
  });

  it('maps known Firebase Auth error codes to user-friendly messages', () => {
    expect(getFirebaseAuthErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('Authorized Domains');
    expect(getFirebaseAuthErrorMessage({ code: 'auth/popup-closed-by-user' })).toContain('closed');
    expect(getFirebaseAuthErrorMessage({ code: 'auth/email-already-in-use' })).toContain('already registered');
    expect(getFirebaseAuthErrorMessage({ code: 'auth/weak-password' })).toContain('6 characters');
    expect(getFirebaseAuthErrorMessage({ code: 'auth/invalid-email' })).toContain('valid email');
    expect(getFirebaseAuthErrorMessage({ code: 'unknown', message: 'Something went wrong' })).toBe('Something went wrong');
  });

  it('retains default fallback values in DEFAULT_FIREBASE_CONFIG', () => {
    expect(DEFAULT_FIREBASE_CONFIG.projectId).toBe('routem8-36895');
    expect(DEFAULT_FIREBASE_CONFIG.apiKey).toBe('AIzaSyCxPYT1biGr5-pqmbKSTzD4ZJs-RQ4lFBs');
  });
});
