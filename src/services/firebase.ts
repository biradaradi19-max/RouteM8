/**
 * ============================================================================
 * ROUTE M8 — FIREBASE CONFIGURATION & INITIALIZATION
 * Connects Firebase App, Auth & Analytics with safe browser and SSR/test support.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser,
  type UserCredential,
} from 'firebase/auth';

/**
 * Default Firebase configuration for Route M8.
 * Environment variables (VITE_FIREBASE_*) override these when provided.
 */
export const DEFAULT_FIREBASE_CONFIG: FirebaseOptions = {
  apiKey: "AIzaSyCxPYT1biGr5-pqmbKSTzD4ZJs-RQ4lFBs",
  authDomain: "routem8-36895.firebaseapp.com",
  projectId: "routem8-36895",
  storageBucket: "routem8-36895.firebasestorage.app",
  messagingSenderId: "236126555492",
  appId: "1:236126555492:web:7b117e8ec53972bc86be71",
  measurementId: "G-4GGKRSS4G9"
};

/**
 * Resolves current Firebase configuration from Vite env or default config.
 */
export function getFirebaseConfig(): FirebaseOptions {
  return {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey || '').trim(),
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain || '').trim(),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId || '').trim(),
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket || '').trim(),
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId || '').trim(),
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId || '').trim(),
    measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId || '').trim(),
  };
}

export const firebaseConfig: FirebaseOptions = getFirebaseConfig();

/**
 * Initialize Firebase App singleton.
 * Prevents "Firebase App named '[DEFAULT]' already exists" during HMR / Vitest runs.
 */
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Firebase Auth instance
 */
export const auth: Auth = getAuth(app);

/**
 * Google Auth Provider configured for account selection
 */
export const googleAuthProvider: GoogleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in using Google OAuth Popup via Firebase Auth
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleAuthProvider);
}

/**
 * Sign in with Email and Password via Firebase Auth
 */
export async function signInWithFirebaseEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Register with Email and Password via Firebase Auth
 */
export async function signUpWithFirebaseEmail(email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out from Firebase Auth
 */
export async function signOutFromFirebase(): Promise<void> {
  return firebaseSignOut(auth);
}

/**
 * Update current Firebase user display name and photo URL
 */
export async function updateFirebaseUserProfile(profile: { displayName?: string; photoURL?: string }): Promise<void> {
  if (auth.currentUser) {
    const { updateProfile } = await import('firebase/auth');
    await updateProfile(auth.currentUser, profile);
  }
}

/**
 * Send password reset email via Firebase Auth
 */
export async function sendFirebasePasswordReset(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Map Firebase Auth error codes to user-friendly messages
 */
export function getFirebaseAuthErrorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string } | null;
  const code = err?.code || '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'The current domain is not authorized in Firebase Console. Please add "localhost" under Authentication > Settings > Authorized Domains.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing authorization.';
    case 'auth/cancelled-popup-request':
      return 'Only one popup request allowed at a time.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by the browser. Please allow popups for this site.';
    case 'auth/email-already-in-use':
      return 'This email address is already registered. Please sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      return err?.message || 'Authentication error occurred.';
  }
}

/**
 * Firebase Analytics instance.
 * IndexedDB is required for analytics, so this is initialized safely when supported.
 */
export let analytics: Analytics | null = null;

/**
 * Initializes and returns the Firebase Analytics instance safely.
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (analytics) return analytics;

  try {
    if (typeof window !== 'undefined' && (await isSupported())) {
      analytics = getAnalytics(app);
      return analytics;
    }
  } catch {
    // Analytics is unsupported or blocked in current environment (e.g. adblocker, test env)
  }
  return null;
}

// Automatically initialize analytics when in browser
if (typeof window !== 'undefined') {
  void initAnalytics();
}

/**
 * Check if Firebase is properly configured.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

/**
 * Helper to log custom analytics events safely without throwing errors.
 */
export async function logFirebaseEvent(
  eventName: string,
  eventParams?: { [key: string]: unknown }
): Promise<void> {
  try {
    const instance = analytics || (await initAnalytics());
    if (instance) {
      const { logEvent } = await import('firebase/analytics');
      logEvent(instance, eventName, eventParams);
    }
  } catch {
    // Graceful no-op
  }
}

export { initializeApp, getAnalytics, onAuthStateChanged, type FirebaseUser, type UserCredential };
