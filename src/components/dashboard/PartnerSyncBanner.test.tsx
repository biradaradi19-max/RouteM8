import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartnerDashboard } from './PartnerDashboard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney, UserProfile } from '../../types';

describe('PartnerDashboard — Corridors Synchronization & Error Banners', () => {
  const mockOnOpenPublishJourney = vi.fn();
  const mockOnInspectMatch = vi.fn();
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);

  const mockPartnerUser: UserProfile = {
    id: 'driver-uid-1',
    email: 'driver@routem8.com',
    fullName: 'Ravi Verma',
    role: 'both',
    verificationStatus: 'gov_id_verified',
    trustScore: 99,
    rating: 4.98,
    completedDeliveries: 28,
    completedCommutes: 40,
    commuteVehicle: 'Hyundai Ioniq 5',
  };

  const defaultMockAppContext = {
    requests: [] as DeliveryRequest[],
    journeys: [] as PublishedJourney[],
    activities: [],
    partnerAvailable: true,
    setPartnerAvailable: vi.fn(),
    acceptDeliveryMatch: vi.fn(),
    rejectDelivery: vi.fn(),
    acceptError: null,
    updateRequestStatus: vi.fn(),
    backendError: null,
    isLoadingData: false,
    refreshData: mockRefreshData,
    theme: 'light' as const,
    toggleTheme: vi.fn(),
    currentView: 'dashboard' as const,
    setCurrentView: vi.fn(),
    activeRoleFilter: 'all' as const,
    setActiveRoleFilter: vi.fn(),
    activeRoleMode: 'transporter' as const,
    setActiveRoleMode: vi.fn(),
    supabaseStatus: 'connected' as const,
    backendStatus: 'connected' as const,
    selectedRequest: null,
    selectedJourney: null,
    activeMatch: null,
    isMatchComputing: false,
    selectRequestAndJourney: vi.fn(),
    createRequest: vi.fn(),
    publishJourney: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockPartnerUser,
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
    });
  });

  it('1. displays the synchronizing banner while isLoadingData is true and backendError is null', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...defaultMockAppContext,
      isLoadingData: true,
      backendError: null,
    });

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    expect(screen.getByText('Synchronizing community corridors with database...')).toBeDefined();
  });

  it('2. hides the synchronizing banner once isLoadingData becomes false', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...defaultMockAppContext,
      isLoadingData: false,
      backendError: null,
    });

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    expect(screen.queryByText('Synchronizing community corridors with database...')).toBeNull();
  });

  it('3. replaces synchronizing banner with actionable error banner when backend sync fails', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...defaultMockAppContext,
      isLoadingData: false,
      backendError: 'Failed to connect to backend corridor database.',
    });

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    // Banner should NOT be stuck in "Synchronizing..."
    expect(screen.queryByText('Synchronizing community corridors with database...')).toBeNull();

    // Clear actionable error notice should be displayed
    expect(screen.getByText('Failed to connect to backend corridor database.')).toBeDefined();
    expect(screen.getByRole('button', { name: /retry sync/i })).toBeDefined();
  });

  it('4. clicking "Retry Sync" executes refreshData() to reattempt database synchronization', () => {
    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      ...defaultMockAppContext,
      isLoadingData: false,
      backendError: 'Database connection timeout',
      refreshData: mockRefreshData,
    });

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const retryBtn = screen.getByRole('button', { name: /retry sync/i });
    fireEvent.click(retryBtn);

    expect(mockRefreshData).toHaveBeenCalledTimes(1);
  });
});
