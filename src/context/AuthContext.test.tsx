import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import * as supabaseModule from '../services/supabase';

// Mock Supabase service
vi.mock('../services/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof supabaseModule>();
  return {
    ...actual,
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        resetPasswordForEmail: vi.fn(),
      },
      from: vi.fn(),
    },
  };
});

describe('Route M8 AuthContext — Audited Security & Authorization Suite', () => {
  const mockSupabase = supabaseModule.supabase as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseModule as any).isSupabaseConfigured = true;

    // Default authListener mock
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    // Default session: no user
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('1. should start in an unauthenticated state with user as null and no demo user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('2. should reject login when password is missing and set an error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.signIn('elena@stanford.edu', '');
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Password is required to sign in.');
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('3. should handle failed login from Supabase with invalid credentials', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let success = false;
    await act(async () => {
      success = await result.current.signIn('elena@stanford.edu', 'wrong-pass');
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Invalid login credentials');
  });

  it('4. should show clear error when Supabase is not configured and never authenticate mock user', async () => {
    (supabaseModule as any).isSupabaseConfigured = false;

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginOk = false;
    await act(async () => {
      loginOk = await result.current.signIn('guest@stanford.edu', 'somePassword123');
    });

    expect(loginOk).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toContain('Supabase backend is not configured');

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp('guest@stanford.edu', 'somePassword123', 'Guest User', 'both');
    });

    expect(signupRes.success).toBe(false);
    expect(signupRes.requiresEmailConfirmation).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('5. should successfully log in and load the user profile from Supabase profiles table', async () => {
    const mockUser = { id: 'usr-456', email: 'elena@stanford.edu' };
    const mockDbProfile = {
      id: 'usr-456',
      email: 'elena@stanford.edu',
      full_name: 'Elena Rostova',
      avatar_url: 'https://example.com/avatar.jpg',
      role: 'both',
      verification_status: 'student_verified',
      account_status: 'active',
      organization: 'Stanford University',
      trust_score: 98,
      completed_deliveries: 12,
      completed_commutes: 24,
      phone: '+15551234567',
      bio: 'Daily Bay Area commuter',
      commute_vehicle: 'Volvo EX30',
      rating: 4.95,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginOk = false;
    await act(async () => {
      loginOk = await result.current.signIn('elena@stanford.edu', 'SecurePassword123');
    });

    expect(loginOk).toBe(true);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: 'usr-456',
      email: 'elena@stanford.edu',
      fullName: 'Elena Rostova',
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'both',
      verificationStatus: 'student_verified',
      accountStatus: 'active',
      organization: 'Stanford University',
      trustScore: 98,
      completedDeliveries: 12,
      completedCommutes: 24,
      phone: '+15551234567',
      bio: 'Daily Bay Area commuter',
      commuteVehicle: 'Volvo EX30',
      rating: 4.95,
    });
    expect(result.current.error).toBeNull();
  });

  it('6. should handle signup requiring email verification without prematurely creating a session', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: {
        user: { id: 'usr-pending-verification', email: 'jordan@mit.edu' },
        session: null, // Email verification required!
      },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp(
        'jordan@mit.edu',
        'StrongPassword99',
        'Jordan Hayes',
        'transporter',
        'MIT'
      );
    });

    expect(signupRes.success).toBe(true);
    expect(signupRes.requiresEmailConfirmation).toBe(true);
    expect(signupRes.message).toContain('Please check your email inbox to confirm');
    // User must NOT be logged in yet
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('7. should handle missing profiles without fabricating profile data or granting unauthorized access', async () => {
    const sessionUser = {
      id: 'usr-missing-profile',
      email: 'ghost@stanford.edu',
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: { user: sessionUser },
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null, // Profile row does not exist
            error: { message: 'Row not found' },
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Access must NOT be granted based on fabricated data
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toMatch(/not found|missing|could not be loaded/i);
  });

  it('8. should never trust manipulated user_metadata and enforce safe role defaults', async () => {
    // Malicious user injected admin/elevated role into raw auth user_metadata
    const sessionUser = {
      id: 'usr-attacker',
      email: 'attacker@evil.com',
      user_metadata: {
        role: 'admin',
        is_admin: true,
        trust_score: 100,
        verification_status: 'gov_id_verified',
      },
    };

    // The database profile table has the authoritative role and metrics
    const mockDbProfile = {
      id: 'usr-attacker',
      email: 'attacker@evil.com',
      full_name: 'Attacker Attempt',
      role: 'invalid_role_attempt', // Not 'requester' or 'transporter'
      verification_status: 'unverified', // Safe default
      account_status: 'active',
      trust_score: 50, // Safe default, not 100
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: sessionUser } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    // The user's role MUST be sanitized to 'both', never 'admin'
    expect(result.current.user?.role).toBe('both');
    expect((result.current.user as any).is_admin).toBeUndefined();
    // Trust score must remain 50, not 100 from user_metadata
    expect(result.current.user?.trustScore).toBe(50);
    expect(result.current.user?.verificationStatus).toBe('unverified');
  });

  it('9. should reject attempted role escalation and unauthorized field tampering', async () => {
    const mockDbProfile = {
      id: 'usr-escalate-test',
      email: 'member@routem8.com',
      full_name: 'Standard Member',
      role: 'requester',
      verification_status: 'unverified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'usr-escalate-test', email: 'member@routem8.com' } } },
      error: null,
    });

    const updateMock = vi.fn();
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
      update: updateMock,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    // 1. Attempt to escalate role
    let ok = false;
    await act(async () => {
      ok = await result.current.updateProfile({
        role: 'admin',
      } as any);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toContain('Security violation');
    expect(result.current.user?.role).toBe('requester');

    // 2. Attempt to alter accountStatus
    await act(async () => {
      ok = await result.current.updateProfile({
        accountStatus: 'suspended',
      } as any);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toContain('Security violation');

    // 3. Attempt to alter trustScore
    await act(async () => {
      ok = await result.current.updateProfile({
        trustScore: 99,
      } as any);
    });

    expect(ok).toBe(false);
    expect(result.current.error).toContain('Security violation');

    // Database update must NOT be called for any forbidden update
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('10. should block suspended accounts from accessing the application', async () => {
    const mockSuspendedProfile = {
      id: 'usr-suspended-user',
      email: 'banned@routem8.com',
      full_name: 'Suspended Account',
      role: 'both',
      verification_status: 'unverified',
      account_status: 'suspended', // Account is suspended
      trust_score: 30,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 3.5,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'usr-suspended-user', email: 'banned@routem8.com' } } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockSuspendedProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Access must be blocked
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toContain('Account is suspended');
  });

  it('11. should allow safe profile updates and map them to database columns', async () => {
    const mockDbProfile = {
      id: 'usr-safe-update',
      email: 'safe@routem8.com',
      full_name: 'Safe User',
      role: 'both',
      verification_status: 'unverified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
      bio: 'Old bio',
      commute_vehicle: 'Bicycle',
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'usr-safe-update', email: 'safe@routem8.com' } } },
      error: null,
    });

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
      update: updateMock,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.updateProfile({
        bio: 'Updated commuter notes for Palo Alto corridor',
        commuteVehicle: 'Tesla Model Y',
      });
    });

    expect(ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      bio: 'Updated commuter notes for Palo Alto corridor',
      commute_vehicle: 'Tesla Model Y',
    });
    expect(result.current.user?.bio).toBe('Updated commuter notes for Palo Alto corridor');
    expect(result.current.user?.commuteVehicle).toBe('Tesla Model Y');
  });

  it('12. should submit verification requests strictly with pending_review status without client trust escalation', async () => {
    const mockDbProfile = {
      id: 'usr-verifier',
      email: 'student@stanford.edu',
      full_name: 'Stanford Student',
      role: 'both',
      verification_status: 'unverified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'usr-verifier', email: 'student@stanford.edu' } } },
      error: null,
    });

    const insertMock = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockDbProfile,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'verification_requests') {
        return {
          insert: insertMock,
        };
      }
      return {};
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).not.toBeNull();
    });

    let res: any;
    await act(async () => {
      res = await result.current.submitVerificationRequest({
        verificationType: 'student',
        organizationName: 'Stanford University',
        evidenceDomainOrId: 'stanford.edu',
        notes: 'Undergraduate student verification request',
      });
    });

    expect(res.success).toBe(true);
    expect(res.message).toContain('pending administrative review');
    expect(insertMock).toHaveBeenCalledWith([
      {
        user_id: 'usr-verifier',
        verification_type: 'student',
        organization_name: 'Stanford University',
        evidence_domain_or_id: 'stanford.edu',
        notes: 'Undergraduate student verification request',
        status: 'pending_review',
      },
    ]);

    // Ensure trustScore and verificationStatus were NOT directly escalated on client
    expect(result.current.user?.trustScore).toBe(50);
    expect(result.current.user?.verificationStatus).toBe('unverified');
  });

  it('13. should call resetPasswordForEmail with actual application route as redirectTo and handle errors honestly', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let resetRes: any;
    await act(async () => {
      resetRes = await result.current.resetPassword('commuter@stanford.edu');
    });

    expect(resetRes.success).toBe(true);
    expect(resetRes.message).toContain('Password reset instructions have been dispatched');
    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'commuter@stanford.edu',
      expect.objectContaining({
        redirectTo: expect.stringMatching(/^https?:\/\//),
      })
    );

    // Error case: server returns an error
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'User not found or rate limit exceeded' },
    });

    let failRes: any;
    await act(async () => {
      failRes = await result.current.resetPassword('commuter@stanford.edu');
    });

    expect(failRes.success).toBe(false);
    expect(failRes.message).toBe('User not found or rate limit exceeded');
    expect(result.current.error).toBe('User not found or rate limit exceeded');
  });

  it('14. should honestly report server signOut errors and not claim success when server signOut fails', async () => {
    const mockUser = { id: 'usr-logged-in', email: 'active@stanford.edu' };
    const mockDbProfile = {
      id: 'usr-logged-in',
      email: 'active@stanford.edu',
      full_name: 'Active User',
      role: 'both',
      verification_status: 'unverified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('active@stanford.edu', 'ValidPassword123');
    });

    expect(result.current.user).not.toBeNull();

    // Server signOut fails with 500 / Network Error
    mockSupabase.auth.signOut.mockResolvedValue({
      error: { message: 'Server session revocation failed: Network Timeout' },
    });

    let signoutSuccess = true;
    await act(async () => {
      signoutSuccess = await result.current.signOut();
    });

    // Must report failure honestly
    expect(signoutSuccess).toBe(false);
    expect(result.current.error).toBe('Server session revocation failed: Network Timeout');
    expect(result.current.isLoading).toBe(false);
  });

  it('15. should successfully signOut and clear session when server signOut succeeds', async () => {
    const mockUser = { id: 'usr-logged-in-2', email: 'active2@stanford.edu' };
    const mockDbProfile = {
      id: 'usr-logged-in-2',
      email: 'active2@stanford.edu',
      full_name: 'Active User 2',
      role: 'both',
      verification_status: 'unverified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('active2@stanford.edu', 'ValidPassword123');
    });

    expect(result.current.user).not.toBeNull();

    mockSupabase.auth.signOut.mockResolvedValue({
      error: null,
    });

    let signoutSuccess = false;
    await act(async () => {
      signoutSuccess = await result.current.signOut();
    });

    expect(signoutSuccess).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('16. should prevent stale asynchronous profile results from overwriting newer signed-out state', async () => {
    let capturedAuthCallback: any = null;
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb: any) => {
      capturedAuthCallback = cb;
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    });

    // Delayed profile resolution
    let resolveProfileQuery: any;
    const profilePromise = new Promise((resolve) => {
      resolveProfileQuery = resolve;
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockReturnValue(profilePromise),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate SIGNED_IN event from auth listener
    await act(async () => {
      capturedAuthCallback?.('SIGNED_IN', {
        user: { id: 'usr-slow-profile', email: 'slow@stanford.edu' },
      });
    });

    // User triggers signOut before slow profile fetch completes
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });
    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();

    // Now slow profile finally resolves
    await act(async () => {
      resolveProfileQuery({
        data: {
          id: 'usr-slow-profile',
          email: 'slow@stanford.edu',
          full_name: 'Slow User',
          role: 'both',
          verification_status: 'unverified',
          account_status: 'active',
          trust_score: 50,
          completed_deliveries: 0,
          completed_commutes: 0,
          rating: 5.0,
        },
        error: null,
      });
    });

    // Crucial: The stale profile MUST NOT resurrect the signed-out user!
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('17. should maintain active user on TOKEN_REFRESHED without flashing loading or clearing profile', async () => {
    let capturedAuthCallback: any = null;
    mockSupabase.auth.onAuthStateChange.mockImplementation((cb: any) => {
      capturedAuthCallback = cb;
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    });

    const mockUser = { id: 'usr-refresh-test', email: 'refresh@stanford.edu' };
    const mockDbProfile = {
      id: 'usr-refresh-test',
      email: 'refresh@stanford.edu',
      full_name: 'Refresh Test User',
      role: 'both',
      verification_status: 'student_verified',
      account_status: 'active',
      trust_score: 95,
      completed_deliveries: 4,
      completed_commutes: 8,
      rating: 4.9,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn('refresh@stanford.edu', 'ValidPassword123');
    });

    expect(result.current.user?.id).toBe('usr-refresh-test');

    // Fire TOKEN_REFRESHED
    await act(async () => {
      capturedAuthCallback?.('TOKEN_REFRESHED', {
        user: { id: 'usr-refresh-test', email: 'refresh@stanford.edu' },
      });
    });

    // Active user profile must be preserved and loading must be false
    expect(result.current.user?.id).toBe('usr-refresh-test');
    expect(result.current.user?.fullName).toBe('Refresh Test User');
    expect(result.current.isLoading).toBe(false);
  });

  it('18. should accept a valid username during signup and pass it to user metadata', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: {
        user: { id: 'usr-new-user-1', email: 'jordan@stanford.edu' },
        session: { user: { id: 'usr-new-user-1', email: 'jordan@stanford.edu' } },
      },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'usr-new-user-1',
              email: 'jordan@stanford.edu',
              username: 'jordan_h',
              full_name: 'Jordan Hayes',
              role: 'both',
              verification_status: 'unverified',
              trust_score: 50,
              completed_deliveries: 0,
              completed_commutes: 0,
              rating: 5.0,
            },
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp(
        'jordan@stanford.edu',
        'StrongPassword99',
        'Jordan Hayes',
        'both',
        'Stanford University',
        'jordan_h'
      );
    });

    expect(signupRes.success).toBe(true);
    expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
      email: 'jordan@stanford.edu',
      password: 'StrongPassword99',
      options: {
        data: {
          full_name: 'Jordan Hayes',
          role: 'both',
          organization: 'Stanford University',
          username: 'jordan_h',
        },
      },
    });
    expect(result.current.user?.username).toBe('jordan_h');
  });

  it('19. should reject invalid username formats on signup (short length, spaces, or illegal symbols)', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // 1. Too short (< 3 chars)
    let res: any;
    await act(async () => {
      res = await result.current.signUp(
        'test@stanford.edu',
        'StrongPassword99',
        'Test User',
        'both',
        undefined,
        'ab'
      );
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Username must be between 3 and 30 characters');

    // 2. Spaces in username
    await act(async () => {
      res = await result.current.signUp(
        'test@stanford.edu',
        'StrongPassword99',
        'Test User',
        'both',
        undefined,
        'bad user'
      );
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Username can only contain letters, numbers, and underscores');

    // 3. Illegal symbols
    await act(async () => {
      res = await result.current.signUp(
        'test@stanford.edu',
        'StrongPassword99',
        'Test User',
        'both',
        undefined,
        'user@name!'
      );
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Username can only contain letters, numbers, and underscores');
  });

  it('20. should provide clear user-friendly error when duplicate account email or username is registered', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let signupRes: any;
    await act(async () => {
      signupRes = await result.current.signUp(
        'duplicate@stanford.edu',
        'Password123',
        'Duplicate User',
        'both',
        undefined,
        'duplicate_user'
      );
    });

    expect(signupRes.success).toBe(false);
    expect(signupRes.message).toContain('An account with this email address already exists. Please sign in instead.');
  });

  it('21. should provide clear user-friendly error when unconfirmed email attempts login', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email not confirmed' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginOk = false;
    await act(async () => {
      loginOk = await result.current.signIn('unconfirmed@stanford.edu', 'ValidPassword123');
    });

    expect(loginOk).toBe(false);
    expect(result.current.error).toContain('Please confirm your email address before signing in');
  });

  it('22. should record a login audit event upon successful sign-in', async () => {
    const mockUser = { id: 'usr-audit-1', email: 'audited@stanford.edu' };
    const mockDbProfile = {
      id: 'usr-audit-1',
      email: 'audited@stanford.edu',
      username: 'audit_user',
      full_name: 'Audited User',
      role: 'both',
      verification_status: 'email_verified',
      account_status: 'active',
      trust_score: 50,
      completed_deliveries: 0,
      completed_commutes: 0,
      rating: 5.0,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const mockRpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
    mockSupabase.rpc = mockRpc;

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: mockDbProfile,
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginOk = false;
    await act(async () => {
      loginOk = await result.current.signIn('audited@stanford.edu', 'SecurePassword123');
    });

    expect(loginOk).toBe(true);
    // Verifies audit logging RPC was called with login_success
    expect(mockRpc).toHaveBeenCalledWith('record_login_event', expect.objectContaining({
      p_event_type: 'login_success',
    }));
  });

  it('23. should handle expired session and prompt user to sign in again', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'JWT expired' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toContain('Your session has expired. Please sign in again.');
  });

  describe('SignUp Flow & Error Handling', () => {
    it('24. should successfully sign up a new user requiring email confirmation', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: {
          user: { id: 'usr-new-1', email: 'newuser@stanford.edu' },
          session: null, // session null implies confirmation needed
        },
        error: null,
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp(
          'newuser@stanford.edu',
          'Password123!',
          'New User',
          'requester',
          'Stanford University',
          'new_user'
        );
      });

      expect(res.success).toBe(true);
      expect(res.requiresEmailConfirmation).toBe(true);
      expect(result.current.error).toBeNull();
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@stanford.edu',
        password: 'Password123!',
        options: {
          data: {
            full_name: 'New User',
            role: 'requester',
            organization: 'Stanford University',
            username: 'new_user',
          },
        },
      });
    });

    it('25. should handle signup error when email already exists', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp(
          'existing@stanford.edu',
          'Password123!',
          'Existing User',
          'both'
        );
      });

      expect(res.success).toBe(false);
      expect(result.current.error).toContain('already exists');
    });

    it('26. should handle signup error when username is already taken', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'duplicate key value violates unique constraint "profiles_username_lower_idx"' },
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp(
          'taken@stanford.edu',
          'Password123!',
          'Taken User',
          'both',
          undefined,
          'taken_username'
        );
      });

      expect(res.success).toBe(false);
      expect(result.current.error).toContain('This username is already taken');
    });

    it('27. should handle signup database update error and set user-friendly error message', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Database error updating user', status: 500 },
      });

      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp(
          'error@stanford.edu',
          'Password123!',
          'Error User',
          'both'
        );
      });

      expect(res.success).toBe(false);
      expect(result.current.error).toBe('Database error updating user');
    });

    it('28. should validate username format before submitting signup', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      let res: any;
      await act(async () => {
        res = await result.current.signUp(
          'invalid@stanford.edu',
          'Password123!',
          'Invalid User',
          'both',
          undefined,
          'ab' // Too short (< 3)
        );
      });

      expect(res.success).toBe(false);
      expect(result.current.error).toContain('between 3 and 30 characters');
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
    });
  });
});

