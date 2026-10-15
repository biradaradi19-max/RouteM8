import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { 
  UserProfile, 
  SafeProfileUpdates, 
  VerificationSubmission,
  VerificationType
} from '../types';
import { 
  supabase, 
  isSupabaseConfigured, 
  mapDbProfileToUserProfile, 
  mapSafeProfileUpdatesToDb,
  isForbiddenProfileUpdate,
  type DatabaseProfileRow 
} from '../services/supabase';

export interface SignUpResult {
  success: boolean;
  requiresEmailConfirmation: boolean;
  message?: string;
}

export interface VerificationResult {
  success: boolean;
  message: string;
}

export interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSupabaseConnected: boolean;
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password?: string) => Promise<boolean>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: 'both' | 'requester' | 'transporter',
    organization?: string,
    username?: string
  ) => Promise<SignUpResult>;
  signOut: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: SafeProfileUpdates | Record<string, any>) => Promise<boolean>;
  submitVerificationRequest: (submission: VerificationSubmission) => Promise<VerificationResult>;
  verifyStudentOrWork: (organization: string, type: 'student' | 'work') => Promise<VerificationResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(isSupabaseConfigured));
  const [error, setError] = useState<string | null>(null);

  // Monotonically increasing sequence ID to avoid race conditions and prevent
  // stale asynchronous profile fetch results from overwriting a newer session.
  const activeProfileLoadSeqRef = useRef<number>(0);
  const currentUserIdRef = useRef<string | null>(null);

  // Synchronize current user ID ref
  useEffect(() => {
    currentUserIdRef.current = user?.id || null;
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  // Helper to fetch profile for authenticated user strictly from database
  const fetchProfileForUser = useCallback(async (
    authUser: { id: string; email?: string }
  ): Promise<{ profile: UserProfile | null; error?: string }> => {
    const client = supabase;
    if (!client) return { profile: null, error: 'Supabase client is not connected.' };

    try {
      const { data: profile, error: profileErr } = await client
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile && !profileErr) {
        const dbRow = profile as DatabaseProfileRow;
        // Verify account status: block suspended or inactive accounts
        if (dbRow.account_status && dbRow.account_status !== 'active') {
          return {
            profile: null,
            error: `Account is ${dbRow.account_status}. Please contact Route M8 support.`,
          };
        }
        return { profile: mapDbProfileToUserProfile(dbRow) };
      }

      // Profile is missing unexpectedly: NEVER fabricate profile data on client
      return {
        profile: null,
        error: profileErr?.message || 'User account profile record is missing in database. Please contact support.',
      };
    } catch (err: any) {
      return {
        profile: null,
        error: err?.message || 'Error loading profile from database.',
      };
    }
  }, []);

  // Safe deferred profile loading that executes outside the synchronous onAuthStateChange stack
  // to prevent Supabase auth-lock or deadlocks, while discarding stale asynchronous responses.
  const loadProfileDeferred = useCallback((
    authUser: { id: string; email?: string } | null,
    options?: { showLoading?: boolean }
  ) => {
    const seq = ++activeProfileLoadSeqRef.current;

    if (!authUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (options?.showLoading !== false) {
      setIsLoading(true);
    }

    // Defer execution using setTimeout(..., 0) so the Supabase auth listener unwinds immediately
    setTimeout(async () => {
      if (activeProfileLoadSeqRef.current !== seq) {
        // Newer session or sign-out was initiated while this query was queued
        return;
      }

      const { profile, error: pErr } = await fetchProfileForUser(authUser);

      if (activeProfileLoadSeqRef.current !== seq) {
        // Session changed while query was in-flight; discard stale profile
        return;
      }

      if (profile) {
        setUser(profile);
        setError(null);
      } else {
        setUser(null);
        setError(pErr || 'Account authenticated, but profile could not be loaded.');
      }
      setIsLoading(false);
    }, 0);
  }, [fetchProfileForUser]);

  // Listen to Supabase Auth state and restore active sessions
  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client) {
      return;
    }

    let isMounted = true;

    // 1. Initial Session Restoration & URL Hash Error Handling
    const restoreInitialSession = async () => {
      // Check for Supabase Auth redirect errors in URL hash (e.g. expired confirmation links)
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashStr = window.location.hash.startsWith('#')
            ? window.location.hash.substring(1)
            : window.location.hash;
          const params = new URLSearchParams(hashStr);
          const hashError = params.get('error');
          const errorCode = params.get('error_code');
          const errorDesc = params.get('error_description');

          if (hashError || errorCode || errorDesc) {
            let msg = errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Authentication error occurred.';
            if (errorCode === 'otp_expired' || msg.toLowerCase().includes('expired')) {
              msg = 'Your email confirmation link has expired or has already been used. Please sign in directly or request a new confirmation email.';
            }
            if (isMounted) {
              setError(msg);
            }
            // Clean up the URL hash so error is not permanently stuck in address bar
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } catch {
          // Ignore URL parsing errors
        }
      }

      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;

        if (session?.user) {
          loadProfileDeferred(session.user, { showLoading: true });
        } else {
          if (isMounted) {
            activeProfileLoadSeqRef.current++;
            setUser(null);
            setIsLoading(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          activeProfileLoadSeqRef.current++;
          setUser(null);
          const raw = (err?.message || '').toLowerCase();
          if (raw.includes('jwt expired') || raw.includes('session expired') || raw.includes('invalid claim')) {
            setError('Your session has expired. Please sign in again.');
          } else {
            setError(err?.message || 'Error restoring session.');
          }
          setIsLoading(false);
        }
      }
    };

    restoreInitialSession();

    // 2. Auth State Change Listener (Synchronous callback to avoid auth-lock or deadlocks)
    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session?.user) {
        // Invalidate in-flight profile loads and immediately clear user
        activeProfileLoadSeqRef.current++;
        setUser(null);
        setIsLoading(false);
      } else if (event === 'SIGNED_IN') {
        loadProfileDeferred(session.user, { showLoading: true });
      } else if (event === 'TOKEN_REFRESHED') {
        // On token refresh, maintain existing user state without flashing a loading screen
        if (!currentUserIdRef.current) {
          loadProfileDeferred(session.user, { showLoading: false });
        }
      } else if (event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') {
        loadProfileDeferred(session.user, { showLoading: false });
      }
    });

    const cancelInFlight = () => {
      activeProfileLoadSeqRef.current++;
    };

    return () => {
      isMounted = false;
      cancelInFlight();
      authListener?.subscription?.unsubscribe();
    };
  }, [loadProfileDeferred]);

  const signIn = async (email: string, password?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const cleanEmail = email?.trim();
    if (!cleanEmail) {
      setError('Email address is required.');
      setIsLoading(false);
      return false;
    }

    if (!password || !password.trim()) {
      setError('Password is required to sign in.');
      setIsLoading(false);
      return false;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase backend is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable authentication.');
      setIsLoading(false);
      return false;
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError) {
        const raw = (authError.message || '').toLowerCase();
        if (raw.includes('email not confirmed')) {
          setError('Please confirm your email address before signing in. Check your inbox for the verification link.');
        } else {
          setError(authError.message || 'Invalid email or password.');
        }
        setIsLoading(false);
        return false;
      }

      if (data?.user) {
        // Claim sequence ownership so background events do not conflict
        const seq = ++activeProfileLoadSeqRef.current;
        const { profile, error: pErr } = await fetchProfileForUser(data.user);

        if (activeProfileLoadSeqRef.current !== seq) {
          return false;
        }

        if (profile) {
          setUser(profile);
          setError(null);
          setIsLoading(false);

          // Record login audit event using trusted server-side RPC mechanism
          try {
            await (supabase as any).rpc?.('record_login_event', {
              p_event_type: 'login_success',
              p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            });
          } catch {
            // Non-blocking telemetry
          }

          return true;
        } else {
          setUser(null);
          setError(pErr || 'User logged in, but profile record is missing from database.');
          setIsLoading(false);
          return false;
        }
      }

      setIsLoading(false);
      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to sign in. Please check your credentials.');
      setIsLoading(false);
      return false;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: 'both' | 'requester' | 'transporter',
    organization?: string,
    username?: string
  ): Promise<SignUpResult> => {
    setIsLoading(true);
    setError(null);

    const cleanEmail = email?.trim();
    const cleanName = fullName?.trim();
    const cleanUsername = username?.trim();

    if (!cleanEmail) {
      const msg = 'Email address is required.';
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }

    if (!cleanName) {
      const msg = 'Full legal name is required.';
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }

    if (cleanUsername !== undefined && cleanUsername !== '') {
      if (cleanUsername.length < 3 || cleanUsername.length > 30) {
        const msg = 'Username must be between 3 and 30 characters long.';
        setError(msg);
        setIsLoading(false);
        return { success: false, requiresEmailConfirmation: false, message: msg };
      }
      if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
        const msg = 'Username can only contain letters, numbers, and underscores.';
        setError(msg);
        setIsLoading(false);
        return { success: false, requiresEmailConfirmation: false, message: msg };
      }
    }

    if (!password || password.length < 6) {
      const msg = 'Password must be at least 6 characters long.';
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }

    if (!isSupabaseConfigured || !supabase) {
      const msg = 'Supabase backend is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to register.';
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }

    // Strictly sanitize role to non-privileged mobility participant roles
    const sanitizedRole: 'both' | 'requester' | 'transporter' = 
      (role === 'requester' || role === 'transporter') ? role : 'both';

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            role: sanitizedRole,
            organization: organization?.trim() || null,
            username: cleanUsername || undefined,
          },
        },
      });

      if (authError) {
        const raw = (authError.message || '').toLowerCase();
        let userFacingMsg = authError.message;
        if (raw.includes('already registered') || raw.includes('already in use')) {
          userFacingMsg = 'An account with this email address already exists. Please sign in instead.';
        } else if (raw.includes('profiles_username_lower_idx') || raw.includes('username already')) {
          userFacingMsg = 'This username is already taken. Please choose another username.';
        }
        setError(userFacingMsg);
        setIsLoading(false);
        return { success: false, requiresEmailConfirmation: false, message: userFacingMsg };
      }

      // Check if Supabase requires email verification
      const requiresEmailConfirmation = Boolean(data.user && !data.session);
      if (requiresEmailConfirmation) {
        activeProfileLoadSeqRef.current++;
        setUser(null);
        setIsLoading(false);
        return {
          success: true,
          requiresEmailConfirmation: true,
          message: 'Account created! Please check your email inbox to confirm your address before logging in.',
        };
      }

      if (data.user && data.session) {
        const seq = ++activeProfileLoadSeqRef.current;
        const { profile, error: pErr } = await fetchProfileForUser(data.user);
        if (activeProfileLoadSeqRef.current === seq) {
          if (profile) {
            setUser(profile);
            setError(null);
          } else {
            setUser(null);
            setError(pErr || 'Account registered, but profile record is pending database provisioning. Please sign in to verify.');
          }
        }
      }

      setIsLoading(false);
      return {
        success: true,
        requiresEmailConfirmation: false,
        message: 'Account registered successfully.',
      };
    } catch (err: any) {
      const msg = err?.message || 'Account registration failed. Please verify your email and password.';
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }
  };

  const signOut = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    // Invalidate in-flight loads
    activeProfileLoadSeqRef.current++;

    try {
      if (isSupabaseConfigured && supabase) {
        const { error: signOutErr } = await supabase.auth.signOut();
        if (signOutErr) {
          setError(signOutErr.message || 'Failed to sign out from server.');
          setIsLoading(false);
          return false;
        }
      }

      setUser(null);
      setError(null);
      setIsLoading(false);
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Error signing out from server.';
      setError(msg);
      setIsLoading(false);
      return false;
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    setError(null);

    const cleanEmail = email?.trim();
    if (!cleanEmail) {
      const msg = 'Email address is required.';
      setError(msg);
      setIsLoading(false);
      return { success: false, message: msg };
    }

    if (!isSupabaseConfigured || !supabase) {
      const msg = 'Supabase backend is not configured. Password recovery is unavailable.';
      setError(msg);
      setIsLoading(false);
      return { success: false, message: msg };
    }

    // Determine the application's actual recovery redirect URL
    // Route M8 is a client SPA. We use the origin + application path as the redirect URL.
    const getRecoveryRedirectUrl = (): string => {
      if (typeof window === 'undefined') return 'http://localhost:5173';
      const origin = window.location.origin;
      const pathname = window.location.pathname || '/';
      return `${origin}${pathname}`;
    };

    const redirectUrl = getRecoveryRedirectUrl();

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (resetErr) {
        setError(resetErr.message);
        return { success: false, message: resetErr.message };
      }

      return {
        success: true,
        message: `Password reset instructions have been dispatched to ${cleanEmail}. Check your inbox.`,
      };
    } catch (err: any) {
      const msg = err?.message || 'Unable to send password recovery email.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: SafeProfileUpdates | Record<string, any>): Promise<boolean> => {
    if (!user) {
      setError('You must be signed in to update your profile.');
      return false;
    }

    // Security check: Reject forbidden profile field modifications
    if (isForbiddenProfileUpdate(updates)) {
      const msg = 'Security violation: Direct modification of protected profile fields (trust score, verification status, delivery stats) is forbidden.';
      setError(msg);
      return false;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase backend is not configured. Profile changes cannot be saved.');
      return false;
    }

    const dbUpdates = mapSafeProfileUpdatesToDb(updates as SafeProfileUpdates);
    if (Object.keys(dbUpdates).length === 0) {
      return true;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', user.id);

      if (dbError) {
        setError(dbError.message || 'Failed to update profile settings.');
        return false;
      }

      // Update in-memory user only with the allowed safe updates
      setUser(prev => {
        if (!prev) return null;
        return {
          ...prev,
          fullName: updates.fullName !== undefined ? updates.fullName : prev.fullName,
          avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : prev.avatarUrl,
          organization: updates.organization !== undefined ? updates.organization : prev.organization,
          phone: updates.phone !== undefined ? updates.phone : prev.phone,
          bio: updates.bio !== undefined ? updates.bio : prev.bio,
          commuteVehicle: updates.commuteVehicle !== undefined ? updates.commuteVehicle : prev.commuteVehicle,
        };
      });

      return true;
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile settings.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const submitVerificationRequest = async (
    submission: VerificationSubmission
  ): Promise<VerificationResult> => {
    if (!user) {
      const msg = 'You must be signed in to submit a verification request.';
      setError(msg);
      return { success: false, message: msg };
    }

    if (!isSupabaseConfigured || !supabase) {
      const msg = 'Supabase backend is not configured. Verification requests cannot be processed.';
      setError(msg);
      return { success: false, message: msg };
    }

    if (!submission.organizationName?.trim() || !submission.evidenceDomainOrId?.trim()) {
      const msg = 'Organization name and verification evidence are required.';
      setError(msg);
      return { success: false, message: msg };
    }

    const validTypes: VerificationType[] = ['student', 'work', 'gov_id'];
    if (!validTypes.includes(submission.verificationType)) {
      const msg = 'Invalid verification type. Must be student, work, or gov_id.';
      setError(msg);
      return { success: false, message: msg };
    }

    setIsLoading(true);
    setError(null);

    try {
      const { error: reqErr } = await supabase
        .from('verification_requests')
        .insert([{
          user_id: user.id,
          verification_type: submission.verificationType,
          organization_name: submission.organizationName.trim(),
          evidence_domain_or_id: submission.evidenceDomainOrId.trim(),
          notes: submission.notes?.trim() || null,
          status: 'pending_review',
        }]);

      if (reqErr) {
        setError(reqErr.message || 'Failed to submit verification request.');
        return { success: false, message: reqErr.message || 'Failed to submit verification request.' };
      }

      return {
        success: true,
        message: 'Your verification request has been submitted and is pending administrative review. Trust score and badge will update upon approval.',
      };
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit verification request.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  };

  // Backward-compatible method that delegates to submitVerificationRequest without mutating trustScore
  const verifyStudentOrWork = async (
    organization: string, 
    type: 'student' | 'work'
  ): Promise<VerificationResult> => {
    return submitVerificationRequest({
      verificationType: type,
      organizationName: organization,
      evidenceDomainOrId: organization,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        isSupabaseConnected: isSupabaseConfigured,
        error,
        clearError,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
        submitVerificationRequest,
        verifyStudentOrWork,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
