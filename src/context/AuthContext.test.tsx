import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import * as firebaseService from '../services/firebase';

// Mock Firebase service
vi.mock('../services/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof firebaseService>();
  return {
    ...actual,
    isFirebaseConfigured: vi.fn(() => true),
    signInWithFirebaseEmail: vi.fn(),
    signUpWithFirebaseEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOutFromFirebase: vi.fn(),
    sendFirebasePasswordReset: vi.fn(),
    updateFirebaseUserProfile: vi.fn(),
    onAuthStateChanged: vi.fn((_auth, callback) => {
      // Default: no user
      callback(null);
      return vi.fn(); // unsubscribe
    }),
  };
});

describe('Route M8 AuthContext — Firebase Authentication Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('1. should start in an unauthenticated state with user as null', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isFirebaseConnected).toBe(true);
  });

  it('2. should reject login when password is missing and set an error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let success: boolean = true;
    await act(async () => {
      success = await result.current.signIn('user@example.com', '');
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toContain('Password is required');
  });

  it('3. should reject login when email is missing and set an error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let success: boolean = true;
    await act(async () => {
      success = await result.current.signIn('', 'password123');
    });

    expect(success).toBe(false);
    expect(result.current.error).toContain('Email address is required');
  });

  it('4. should reject signup when email is missing', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp('', 'password123', 'Jordan Hayes', 'both');
    });

    expect(signupRes.success).toBe(false);
    expect(result.current.error).toContain('Email address is required');
  });

  it('5. should reject signup when full name is missing', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp('jordan@example.com', 'password123', '', 'both');
    });

    expect(signupRes.success).toBe(false);
    expect(result.current.error).toContain('Full legal name is required');
  });

  it('6. should reject signup when password is too short', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp('jordan@example.com', '123', 'Jordan Hayes', 'both');
    });

    expect(signupRes.success).toBe(false);
    expect(result.current.error).toContain('at least 6 characters');
  });

  it('7. should reject signup when username has invalid characters', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp('jordan@example.com', 'ValidPassword123', 'Jordan Hayes', 'both', undefined, 'invalid handle!');
    });

    expect(signupRes.success).toBe(false);
    expect(result.current.error).toContain('letters, numbers, and underscores');
  });

  it('8. should successfully sign up a new user via Firebase Auth', async () => {
    const mockUser = {
      uid: 'fb-user-123',
      email: 'jordan@stanford.edu',
      displayName: null,
      photoURL: null,
      emailVerified: true,
    };

    (firebaseService.signUpWithFirebaseEmail as any).mockResolvedValue({
      user: mockUser,
    });
    (firebaseService.updateFirebaseUserProfile as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp(
        'jordan@stanford.edu',
        'ValidPassword123',
        'Jordan Hayes',
        'both',
        'Stanford University',
        'jordan_h'
      );
    });

    expect(signupRes.success).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('fb-user-123');
    expect(result.current.user?.fullName).toBe('Jordan Hayes');
    expect(result.current.user?.username).toBe('jordan_h');
    expect(result.current.user?.organization).toBe('Stanford University');
    expect(result.current.user?.trustScore).toBe(85);
  });

  it('9. should successfully sign in with email and password via Firebase Auth', async () => {
    const mockUser = {
      uid: 'fb-login-456',
      email: 'commuter@gmail.com',
      displayName: 'Alex Commuter',
      photoURL: 'https://example.com/avatar.jpg',
      emailVerified: true,
    };

    (firebaseService.signInWithFirebaseEmail as any).mockResolvedValue({
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let loginOk: boolean = false;
    await act(async () => {
      loginOk = await result.current.signIn('commuter@gmail.com', 'ValidPassword123');
    });

    expect(loginOk).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('fb-login-456');
    expect(result.current.user?.email).toBe('commuter@gmail.com');
    expect(result.current.user?.fullName).toBe('Alex Commuter');
  });

  it('10. should successfully sign in with Google via Firebase Auth', async () => {
    const mockUser = {
      uid: 'fb-google-789',
      email: 'googleuser@stanford.edu',
      displayName: 'Google Member',
      photoURL: 'https://lh3.googleusercontent.com/photo.jpg',
      emailVerified: true,
    };

    (firebaseService.signInWithGoogle as any).mockResolvedValue({
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let googleOk: boolean = false;
    await act(async () => {
      googleOk = await result.current.signInWithGoogle();
    });

    expect(googleOk).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe('fb-google-789');
    expect(result.current.user?.organization).toBe('stanford.edu');
  });

  it('11. should successfully signOut and clear active user session', async () => {
    const mockUser = {
      uid: 'fb-logout-test',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null,
      emailVerified: true,
    };

    (firebaseService.signInWithFirebaseEmail as any).mockResolvedValue({
      user: mockUser,
    });
    (firebaseService.signOutFromFirebase as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('test@example.com', 'Password123');
    });

    expect(result.current.isAuthenticated).toBe(true);

    let signoutOk: boolean = false;
    await act(async () => {
      signoutOk = await result.current.signOut();
    });

    expect(signoutOk).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('12. should send password reset email via Firebase Auth', async () => {
    (firebaseService.sendFirebasePasswordReset as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    let resetRes: any;
    await act(async () => {
      resetRes = await result.current.resetPassword('reset@example.com');
    });

    expect(resetRes.success).toBe(true);
    expect(resetRes.message).toContain('reset instructions have been dispatched');
  });

  it('13. should reject forbidden profile updates directly tampering with trust score', async () => {
    const mockUser = {
      uid: 'fb-security-test',
      email: 'security@example.com',
      displayName: 'Security Tester',
    };

    (firebaseService.signInWithFirebaseEmail as any).mockResolvedValue({
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('security@example.com', 'Password123');
    });

    let updateOk: boolean = true;
    await act(async () => {
      updateOk = await result.current.updateProfile({ trustScore: 100 } as any);
    });

    expect(updateOk).toBe(false);
    expect(result.current.error).toContain('Security violation');
  });

  it('14. should successfully submit verification request and update trust score', async () => {
    const mockUser = {
      uid: 'fb-verify-test',
      email: 'student@stanford.edu',
      displayName: 'Stanford Student',
    };

    (firebaseService.signInWithFirebaseEmail as any).mockResolvedValue({
      user: mockUser,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('student@stanford.edu', 'Password123');
    });

    const initialScore = result.current.user?.trustScore || 85;

    let verifyRes: any;
    await act(async () => {
      verifyRes = await result.current.submitVerificationRequest({
        verificationType: 'student',
        organizationName: 'Stanford University',
        evidenceDomainOrId: 'stanford.edu',
      });
    });

    expect(verifyRes.success).toBe(true);
    expect(result.current.user?.organization).toBe('Stanford University');
    expect(result.current.user?.verificationStatus).toBe('student_verified');
    expect(result.current.user?.trustScore).toBeGreaterThanOrEqual(initialScore);
  });

  it('15. should clear errors when clearError is invoked', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('', '');
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
