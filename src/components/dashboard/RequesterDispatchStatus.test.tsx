import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequesterDashboard } from './RequesterDashboard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, UserProfile } from '../../types';

describe('RequesterDashboard Dispatch Status View', () => {
  const mockUser: UserProfile = {
    id: 'usr-customer-1',
    email: 'marcus@test.com',
    fullName: 'Marcus Vance',
    role: 'requester',
    verificationStatus: 'email_verified',
    trustScore: 95,
    rating: 5.0,
    completedDeliveries: 3,
    completedCommutes: 0,
  };

  const mockOpenRequest: DeliveryRequest = {
    id: 'req-open-search',
    title: 'Chemistry Glassware',
    description: 'Fragile lab equipment',
    pickupAddress: 'Stanford Science Library',
    dropoffAddress: 'Castro St, Mountain View',
    pickupCoords: [37.4275, -122.1697],
    dropoffCoords: [37.3861, -122.0839],
    compensation: 22.5,
    urgency: 'urgent',
    status: 'open',
    dispatchStatus: 'searching_partner',
    category: 'campus-supplies',
    itemSize: 'small',
    neededBy: 'Today by 19:00',
    requesterId: 'usr-customer-1',
    requesterName: 'Marcus Vance',
    handoverPin: '4821',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
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

    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      requests: [mockOpenRequest],
      journeys: [],
      isLoadingData: false,
      backendError: null,
      partnerAvailable: true,
      setPartnerAvailable: vi.fn(),
      acceptDeliveryMatch: vi.fn(),
      rejectDelivery: vi.fn(),
      updateRequestStatus: vi.fn(),
      acceptError: null,
      activeRoleMode: 'requester',
      activities: [],
      theme: 'dark',
      toggleTheme: vi.fn(),
      currentView: 'dashboard',
      setCurrentView: vi.fn(),
      activeRoleFilter: 'all',
      setActiveRoleFilter: vi.fn(),
      setActiveRoleMode: vi.fn(),
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
    });
  });

  it('displays progressive search indicator when delivery status is open', () => {
    render(
      <RequesterDashboard onOpenCreateRequest={vi.fn()} onInspectMatch={vi.fn()} />
    );

    expect(screen.getByText('Chemistry Glassware')).toBeDefined();
    const searchBadges = screen.getAllByText(/Searching for a partner/i);
    expect(searchBadges.length).toBeGreaterThanOrEqual(1);
  });
});
