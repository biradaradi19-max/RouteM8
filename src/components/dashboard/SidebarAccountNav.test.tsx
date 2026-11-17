import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { Navbar } from '../common/Navbar';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';

describe('Sidebar & Navbar Account Navigation Tests', () => {
  const mockSetCurrentView = vi.fn();
  const mockCloseMobile = vi.fn();

  const mockUser = {
    id: 'user-777',
    fullName: 'Aditya Biradar',
    email: 'aditya@example.com',
    role: 'both' as const,
    trustScore: 99,
    verificationStatus: 'verified' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupMocks = (currentView: any = 'dashboard') => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser as any,
      isAuthenticated: true,
      isLoading: false,
      isFirebaseConnected: true,
      isSupabaseConnected: false,
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
      isPhoneVerificationModalOpen: false,
      openPhoneVerificationModal: vi.fn(),
      closePhoneVerificationModal: vi.fn(),
      recordPhoneVerificationSuccess: vi.fn(),
      refreshIdToken: vi.fn(),
    });

    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      theme: 'light',
      toggleTheme: vi.fn(),
      currentView,
      setCurrentView: mockSetCurrentView,
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
      backendStatus: 'connected',
      refreshData: vi.fn(),
      selectedRequest: null,
      selectedJourney: null,
      activeMatch: null,
      isMatchComputing: false,
      selectRequestAndJourney: vi.fn(),
      createRequest: vi.fn(),
      publishJourney: vi.fn(),
      acceptDeliveryMatch: vi.fn(),
      rejectDelivery: vi.fn(),
      acceptError: null,
      updateRequestStatus: vi.fn(),
    });
  };

  describe('Sidebar Navigation to My Account', () => {
    it('should navigate to account when clicking the bottom-left profile section button', () => {
      setupMocks('dashboard');
      render(
        <Sidebar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
          onCloseMobile={mockCloseMobile}
        />
      );

      const profileBtn = screen.getByLabelText('View My Account');
      expect(profileBtn).toBeTruthy();

      fireEvent.click(profileBtn);

      expect(mockSetCurrentView).toHaveBeenCalledWith('account');
      expect(mockCloseMobile).toHaveBeenCalledTimes(1);
    });

    it('should navigate to account when clicking My Account item in nav list', () => {
      setupMocks('dashboard');
      render(
        <Sidebar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      );

      const myAccountNav = screen.getByTestId('nav-item-account');
      expect(myAccountNav).toBeTruthy();

      fireEvent.click(myAccountNav);

      expect(mockSetCurrentView).toHaveBeenCalledWith('account');
    });

    it('should apply active highlighting to bottom profile button when on account view', () => {
      setupMocks('account');
      render(
        <Sidebar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      );

      const profileBtn = screen.getByLabelText('View My Account');
      expect(profileBtn.className).toContain('active');
    });

    it('should NOT render Express + MongoDB technical status card in sidebar for ordinary users', () => {
      setupMocks('dashboard');
      render(
        <Sidebar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      );

      // Verify complete absence of technical infrastructure widgets
      expect(screen.queryByText(/express \+ mongodb/i)).toBeNull();
      expect(screen.queryByText(/api & socket\.io active/i)).toBeNull();
      expect(screen.queryByText(/probing backend/i)).toBeNull();
    });

    it('should preserve Privacy Policy, Terms of Service, and user profile at bottom of sidebar', () => {
      setupMocks('dashboard');
      render(
        <Sidebar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      );

      expect(screen.getByText('Privacy Policy')).toBeTruthy();
      expect(screen.getByText('Terms of Service')).toBeTruthy();
      expect(screen.getByLabelText('View My Account')).toBeTruthy();
      expect(screen.getByLabelText('Sign Out')).toBeTruthy();
    });
  });

  describe('Navbar Navigation to My Account', () => {
    it('should navigate to account when clicking user badge in Navbar', () => {
      setupMocks('dashboard');
      render(
        <Navbar
          onOpenCreateRequest={vi.fn()}
          onOpenPublishJourney={vi.fn()}
          onOpenSupabaseConfig={vi.fn()}
          onOpenAuth={vi.fn()}
          onToggleMobileMenu={vi.fn()}
        />
      );

      const navProfileBtn = screen.getByLabelText('View My Account');
      expect(navProfileBtn).toBeTruthy();

      fireEvent.click(navProfileBtn);

      expect(mockSetCurrentView).toHaveBeenCalledWith('account');
    });
  });
});
