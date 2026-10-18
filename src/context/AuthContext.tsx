import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { 
  UserProfile, 
  SafeProfileUpdates, 
  VerificationSubmission,
  VerificationType
} from '../types';
import {
  auth as firebaseAuth,
  signInWithGoogle as firebaseSignInWithGoogle,
  signInWithFirebaseEmail,
  signUpWithFirebaseEmail,
  signOutFromFirebase,
  sendFirebasePasswordReset,
  updateFirebaseUserProfile,
  getFirebaseAuthErrorMessage,
  isFirebaseConfigured,
  onAuthStateChanged as onFirebaseAuthStateChanged,
} from '../services/firebase';

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
  isFirebaseConnected: boolean;
  isSupabaseConnected: boolean; // Retained as false for backward compatibility
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
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: SafeProfileUpdates | Record<string, any>) => Promise<boolean>;
  submitVerificationRequest: (submission: VerificationSubmission) => Promise<VerificationResult>;
  verifyStudentOrWork: (organization: string, type: 'student' | 'work') => Promise<VerificationResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_STORAGE_PREFIX = 'routem8_profile_';

function getStoredProfile(uid: string): Partial<UserProfile> | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function saveStoredProfile(uid: string, profile: Partial<UserProfile>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const existing = getStoredProfile(uid) || {};
    localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${uid}`, JSON.stringify({ ...existing, ...profile }));
  } catch {
    // Ignore storage write error
  }
}

function buildUserProfile(fbUser: any, custom?: Partial<UserProfile>): UserProfile {
  const stored = getStoredProfile(fbUser.uid) || {};
  return {
    id: fbUser.uid,
    email: fbUser.email || '',
    username: custom?.username || stored.username || (fbUser.email ? fbUser.email.split('@')[0] : 'member'),
    fullName: custom?.fullName || fbUser.displayName || stored.fullName || 'Community Member',
    avatarUrl: fbUser.photoURL || stored.avatarUrl || undefined,
    role: custom?.role || stored.role || 'both',
    verificationStatus: stored.verificationStatus || (fbUser.emailVerified ? 'email_verified' : 'unverified'),
    accountStatus: 'active',
    organization: custom?.organization || stored.organization || (fbUser.email?.endsWith('.edu') ? fbUser.email.split('@')[1] : undefined),
    trustScore: stored.trustScore ?? 85,
    completedDeliveries: stored.completedDeliveries ?? 0,
    completedCommutes: stored.completedCommutes ?? 0,
    rating: stored.rating ?? 5.0,
    bio: custom?.bio || stored.bio,
    phone: custom?.phone || stored.phone,
    commuteVehicle: custom?.commuteVehicle || stored.commuteVehicle,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeProfileLoadSeqRef = useRef<number>(0);
  const clearError = useCallback(() => setError(null), []);

  // Synchronize active Firebase Auth listener
  useEffect(() => {
    let isMounted = true;

    try {
      const unsubscribe = onFirebaseAuthStateChanged(firebaseAuth, (fbUser) => {
        if (!isMounted) return;
        if (fbUser) {
          const profile = buildUserProfile(fbUser);
          setUser(profile);
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });

      return () => {
        isMounted = false;
        unsubscribe();
      };
    } catch {
      if (isMounted) {
        setIsLoading(false);
      }
      return () => {
        isMounted = false;
      };
    }
  }, []);

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

    try {
      const cred = await signInWithFirebaseEmail(cleanEmail, password);
      const profile = buildUserProfile(cred.user);
      setUser(profile);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = getFirebaseAuthErrorMessage(err);
      setError(msg);
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

    try {
      const cred = await signUpWithFirebaseEmail(cleanEmail, password);
      await updateFirebaseUserProfile({ displayName: cleanName }).catch(() => {});

      const newProfileData: Partial<UserProfile> = {
        username: cleanUsername || undefined,
        fullName: cleanName,
        role,
        organization: organization?.trim() || undefined,
        trustScore: 85,
        verificationStatus: 'email_verified',
        accountStatus: 'active',
        completedDeliveries: 0,
        completedCommutes: 0,
        rating: 5.0,
      };

      saveStoredProfile(cred.user.uid, newProfileData);
      const profile = buildUserProfile(cred.user, newProfileData);
      setUser(profile);
      setIsLoading(false);

      return {
        success: true,
        requiresEmailConfirmation: false,
        message: 'Account registered successfully.',
      };
    } catch (err: unknown) {
      const msg = getFirebaseAuthErrorMessage(err);
      setError(msg);
      setIsLoading(false);
      return { success: false, requiresEmailConfirmation: false, message: msg };
    }
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    activeProfileLoadSeqRef.current++;

    try {
      const cred = await firebaseSignInWithGoogle();
      const profile = buildUserProfile(cred.user);
      saveStoredProfile(cred.user.uid, profile);
      setUser(profile);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = getFirebaseAuthErrorMessage(err);
      setError(msg);
      setIsLoading(false);
      return false;
    }
  };

  const signOut = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    activeProfileLoadSeqRef.current++;

    try {
      await signOutFromFirebase();
      setUser(null);
      setError(null);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = getFirebaseAuthErrorMessage(err);
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

    try {
      await sendFirebasePasswordReset(cleanEmail);
      return {
        success: true,
        message: `Password reset instructions have been dispatched to ${cleanEmail}. Check your inbox.`,
      };
    } catch (err: unknown) {
      const msg = getFirebaseAuthErrorMessage(err);
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

    // Security check: Protect direct modification of trust score or delivery stats
    const forbidden = ['trustScore', 'verificationStatus', 'completedDeliveries', 'completedCommutes', 'rating', 'accountStatus'];
    const hasForbidden = Object.keys(updates).some(k => forbidden.includes(k));
    if (hasForbidden) {
      setError('Security violation: Direct modification of protected profile fields is forbidden.');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (updates.fullName) {
        await updateFirebaseUserProfile({ displayName: updates.fullName }).catch(() => {});
      }

      const updatedProfile: UserProfile = {
        ...user,
        fullName: updates.fullName !== undefined ? updates.fullName : user.fullName,
        avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatarUrl,
        organization: updates.organization !== undefined ? updates.organization : user.organization,
        phone: updates.phone !== undefined ? updates.phone : user.phone,
        bio: updates.bio !== undefined ? updates.bio : user.bio,
        commuteVehicle: updates.commuteVehicle !== undefined ? updates.commuteVehicle : user.commuteVehicle,
        role: updates.role !== undefined ? updates.role : user.role,
      };

      saveStoredProfile(user.id, updatedProfile);
      setUser(updatedProfile);
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
      const statusType = submission.verificationType === 'student' ? 'student_verified' : 'work_verified';
      const updatedUser: UserProfile = {
        ...user,
        organization: submission.organizationName.trim(),
        verificationStatus: statusType,
        trustScore: Math.min(100, user.trustScore + 10),
      };

      saveStoredProfile(user.id, updatedUser);
      setUser(updatedUser);

      return {
        success: true,
        message: 'Your verification request has been approved! Trust score and badge have been updated.',
      };
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit verification request.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  };

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
        isFirebaseConnected: isFirebaseConfigured(),
        isSupabaseConnected: false,
        error,
        clearError,
        signIn,
        signUp,
        signInWithGoogle,
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
