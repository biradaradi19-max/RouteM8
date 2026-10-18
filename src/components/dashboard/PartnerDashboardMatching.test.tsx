import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartnerDashboard } from './PartnerDashboard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, UserProfile } from '../../types';

describe('PartnerDashboard Dispatch Matching UI', () => {
  const mockAccept = vi.fn().mockResolvedValue(true);
  const mockReject = vi.fn().mockResolvedValue(true);
  const mockSetPartnerAvailable = vi.fn();
  const mockUpdateRequestStatus = vi.fn();

  const mockUser: UserProfile = {
    id: 'partner-active',
    email: 'partner@test.com',
    fullName: 'Bob Partner',
    role: 'transporter',
    verificationStatus: 'gov_id_verified',
    trustScore: 98,
    rating: 4.95,
    completedDeliveries: 15,
    completedCommutes: 20,
  };

  const mockOpportunity: DeliveryRequest = {
    id: 'req-disp-1',
    title: 'Urgent Medical Supplies',
    description: 'Prescription medication package from pharmacy',
    pickupAddress: '4170 El Camino Real, Palo Alto',
    dropoffAddress: 'California Ave, Palo Alto',
    pickupCoords: [37.4124, -122.1287],
    dropoffCoords: [37.4285, -122.1432],
    compensation: 28.5,
    urgency: 'urgent',
    status: 'open',
    category: 'pharmacy',
    itemSize: 'small',
    neededBy: 'ASAP',
    requesterId: 'usr-customer-99',
    requesterName: 'Alice Patient',
    handoverPin: '1234',
    distanceKm: 3.2,
    matchType: 'nearby',
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
      requests: [mockOpportunity],
      journeys: [],
      partnerAvailable: true,
      setPartnerAvailable: mockSetPartnerAvailable,
      acceptDeliveryMatch: mockAccept,
      rejectDelivery: mockReject,
      updateRequestStatus: mockUpdateRequestStatus,
      isLoadingData: false,
      backendError: null,
      acceptError: null,
      activeRoleMode: 'transporter',
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

  it('renders live dispatch opportunity with match tags and triggers accept', async () => {
    render(
      <PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />
    );

    expect(screen.getByText('Urgent Medical Supplies')).toBeDefined();

    const acceptBtn = screen.getByTestId('accept-delivery-button');
    expect(acceptBtn).toBeDefined();
    expect(acceptBtn.textContent).toContain('Accept Delivery');

    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockAccept).toHaveBeenCalledWith('req-disp-1', undefined);
    });
  });

  it('triggers rejectDelivery when partner clicks Decline button', async () => {
    render(
      <PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />
    );

    const declineBtn = screen.getByTestId('reject-delivery-button');
    expect(declineBtn).toBeDefined();

    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('req-disp-1');
    });
  });
});
