import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Navbar } from './Navbar';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { UserProfile } from '../../types';

describe('Navbar Component — Clean Supabase Architecture & No Firebase Pills', () => {
  const mockOnOpenAuth = vi.fn();
  const mockOnOpenCreateRequest = vi.fn();
  const mockOnOpenPublishJourney = vi.fn();
  const mockOnOpenSupabaseConfig = vi.fn();
  const mockOnToggleMobileMenu = vi.fn();

  const mockUser: UserProfile = {
    id: 'user-1',
    email: 'alex@example.com',
    fullName: 'Alex Morgan',
    role: 'both',
    verificationStatus: 'student_verified',
    organization: 'Stanford Commuter Club',
    trustScore: 98,
    completedDeliveries: 12,
    completedCommutes: 24,
    rating: 4.98,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      isFirebaseConnected: true,
      isSupabaseConnected: true,
      error: null,
      clearError: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      updateProfile: vi.fn(),
      submitVerificationRequest: vi.fn(),
      verifyStudentOrWork: vi.fn(),
    });

    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      theme: 'light',
      toggleTheme: vi.fn(),
      currentView: 'dashboard',
      setCurrentView: vi.fn(),
      activeRoleFilter: 'all',
      setActiveRoleFilter: vi.fn(),
      activeRoleMode: 'requester',
      setActiveRoleMode: vi.fn(),
      partnerAvailable: true,
      setPartnerAvailable: vi.fn(),
      requests: [],
      journeys: [],
      activities: [],
      isLoadingData: false,
      backendError: null,
      supabaseStatus: 'connected',
      refreshData: vi.fn(),
      selectedRequest: null,
      selectedJourney: null,
      activeMatch: null,
      isMatchComputing: false,
      selectRequestAndJourney: vi.fn(),
      createRequest: vi.fn(),
      publishJourney: vi.fn(),
      updateRequestStatus: vi.fn(),
      acceptDeliveryMatch: vi.fn(),
    });
  });

  it('renders Route M8 brand logo and wordmark', () => {
    render(
      <Navbar
        onOpenAuth={mockOnOpenAuth}
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onOpenSupabaseConfig={mockOnOpenSupabaseConfig}
        onToggleMobileMenu={mockOnToggleMobileMenu}
      />
    );

    expect(screen.getByText('Route M8')).toBeDefined();
  });

  it('does NOT render any Firebase Active or Offline status pill in the navbar', () => {
    render(
      <Navbar
        onOpenAuth={mockOnOpenAuth}
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onOpenSupabaseConfig={mockOnOpenSupabaseConfig}
        onToggleMobileMenu={mockOnToggleMobileMenu}
      />
    );

    // Verify completely that no Firebase status pill is rendered
    expect(screen.queryByText(/firebase active/i)).toBeNull();
    expect(screen.queryByText(/firebase offline/i)).toBeNull();
    expect(screen.queryByText(/firebase/i)).toBeNull();
  });

  it('renders discreet Supabase infrastructure / backend settings button', () => {
    render(
      <Navbar
        onOpenAuth={mockOnOpenAuth}
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onOpenSupabaseConfig={mockOnOpenSupabaseConfig}
        onToggleMobileMenu={mockOnToggleMobileMenu}
      />
    );

    const configBtn = screen.getByLabelText(/database & infrastructure settings/i);
    expect(configBtn).toBeDefined();

    fireEvent.click(configBtn);
    expect(mockOnOpenSupabaseConfig).toHaveBeenCalledTimes(1);
  });

  it('renders primary CTA "Request Item" and triggers callback', () => {
    render(
      <Navbar
        onOpenAuth={mockOnOpenAuth}
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onOpenSupabaseConfig={mockOnOpenSupabaseConfig}
        onToggleMobileMenu={mockOnToggleMobileMenu}
      />
    );

    const requestBtn = screen.getByRole('button', { name: /request item/i });
    expect(requestBtn).toBeDefined();

    fireEvent.click(requestBtn);
    expect(mockOnOpenCreateRequest).toHaveBeenCalledTimes(1);
  });
});
