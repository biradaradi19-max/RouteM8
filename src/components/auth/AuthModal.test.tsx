import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from './AuthModal';
import * as AuthContextModule from '../../context/AuthContext';

describe('AuthModal Component — Firebase Google Auth Integration', () => {
  const mockSignInWithGoogle = vi.fn();
  const mockSignIn = vi.fn();
  const mockSignUp = vi.fn();
  const mockClearError = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isSupabaseConnected: true,
      error: null,
      clearError: mockClearError,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signInWithGoogle: mockSignInWithGoogle,
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      updateProfile: vi.fn(),
      submitVerificationRequest: vi.fn(),
      verifyStudentOrWork: vi.fn(),
    });
  });

  it('renders "Continue with Google" button in signin mode', () => {
    render(<AuthModal isOpen={true} initialMode="signin" onClose={mockOnClose} />);

    const googleBtn = screen.getByRole('button', { name: /continue with google/i });
    expect(googleBtn).toBeDefined();
  });

  it('renders "Continue with Google" button in signup mode', () => {
    render(<AuthModal isOpen={true} initialMode="signup" onClose={mockOnClose} />);

    const googleBtn = screen.getByRole('button', { name: /continue with google/i });
    expect(googleBtn).toBeDefined();
  });

  it('calls signInWithGoogle and closes modal on success', async () => {
    mockSignInWithGoogle.mockResolvedValue(true);

    render(<AuthModal isOpen={true} initialMode="signin" onClose={mockOnClose} />);

    const googleBtn = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(googleBtn);

    expect(mockClearError).toHaveBeenCalled();
    expect(mockSignInWithGoogle).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('does not close modal if signInWithGoogle fails', async () => {
    mockSignInWithGoogle.mockResolvedValue(false);

    render(<AuthModal isOpen={true} initialMode="signin" onClose={mockOnClose} />);

    const googleBtn = screen.getByRole('button', { name: /continue with google/i });
    fireEvent.click(googleBtn);

    expect(mockSignInWithGoogle).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });
});
