import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartnerDashboard } from './PartnerDashboard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney, UserProfile } from '../../types';

describe('PartnerDashboard — Visible & Responsive Accept / Decline Buttons', () => {
  const mockOnOpenPublishJourney = vi.fn();
  const mockOnInspectMatch = vi.fn();
  const mockAcceptDeliveryMatch = vi.fn();
  const mockRejectDelivery = vi.fn();
  const mockSetPartnerAvailable = vi.fn();
  const mockUpdateRequestStatus = vi.fn();

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

  const mockPendingRequests: DeliveryRequest[] = [
    {
      id: 'req-pending-1',
      requesterId: 'other-user-99',
      requesterName: 'Priya Sharma',
      requesterTrustScore: 96,
      title: 'College Textbooks & Graphic Calculator',
      description: 'Books packed in box, ready at campus library',
      category: 'campus-supplies',
      itemSize: 'medium',
      weightEstimateKg: 3.5,
      compensation: 25.00,
      pickupAddress: 'Main Library, Stanford, CA',
      pickupCoords: [37.428, -122.169],
      dropoffAddress: 'Downtown Mountain View, CA',
      dropoffCoords: [37.389, -122.082],
      urgency: 'urgent',
      neededBy: 'Today by 18:00',
      handoverPin: '9123',
      status: 'open',
      createdAt: '2026-10-18T09:00:00Z',
      distanceKm: 7.2,
      estimatedDurationMin: 12,
      estimatedDetourMinutes: 4,
    },
    {
      id: 'req-pending-2',
      requesterId: 'other-user-88',
      requesterName: 'Marcus Vance',
      requesterTrustScore: 94,
      title: 'Urgent Medical Document Envelope',
      description: 'Confidential envelope, do not bend',
      category: 'documents' as any,
      itemSize: 'small',
      weightEstimateKg: 0.4,
      compensation: 19.50,
      pickupAddress: 'Medical Center, Palo Alto, CA',
      pickupCoords: [37.435, -122.175],
      dropoffAddress: 'Sunnyvale Tech Park, CA',
      dropoffCoords: [37.375, -122.035],
      urgency: 'standard',
      neededBy: 'Today by 20:00',
      handoverPin: '3341',
      status: 'open',
      createdAt: '2026-10-18T10:30:00Z',
      distanceKm: 14.8,
      estimatedDurationMin: 22,
      estimatedDetourMinutes: 6,
    },
  ];

  const mockJourney: PublishedJourney = {
    id: 'jrn-driver-1',
    transporterId: 'driver-uid-1',
    transporterName: 'Ravi Verma',
    transporterTrustScore: 99,
    vehicle: 'Hyundai Ioniq 5',
    originAddress: 'Palo Alto',
    originCoords: [37.44, -122.16],
    destAddress: 'Mountain View',
    destCoords: [37.38, -122.08],
    departureTime: '17:30',
    maxDetourMinutes: 15,
    capacity: 'medium',
    isActive: true,
    createdAt: '2026-10-18T07:00:00Z',
  };

  const setupPartnerMocks = (isAvailable: boolean = true) => {
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

    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      activeRoleMode: 'transporter',
      partnerAvailable: isAvailable,
      setPartnerAvailable: mockSetPartnerAvailable,
      acceptDeliveryMatch: mockAcceptDeliveryMatch,
      rejectDelivery: mockRejectDelivery,
      acceptError: null,
      requests: mockPendingRequests,
      journeys: [mockJourney],
      activities: [],
      currentView: 'dashboard',
      setCurrentView: vi.fn(),
      theme: 'light',
      toggleTheme: vi.fn(),
      activeRoleFilter: 'all',
      setActiveRoleFilter: vi.fn(),
      setActiveRoleMode: vi.fn(),
      selectedRequest: null,
      selectedJourney: null,
      activeMatch: null,
      isMatchComputing: false,
      isLoadingData: false,
      backendError: null,
      backendStatus: 'connected',
      supabaseStatus: 'connected',
      refreshData: vi.fn(),
      selectRequestAndJourney: vi.fn(),
      createRequest: vi.fn(),
      publishJourney: vi.fn(),
      updateRequestStatus: mockUpdateRequestStatus,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all pending delivery requests with pickup, destination, compensation, distance and ETA', () => {
    setupPartnerMocks(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    expect(screen.getByText('College Textbooks & Graphic Calculator')).toBeDefined();
    expect(screen.getByText(/Main Library, Stanford, CA/i)).toBeDefined();
    expect(screen.getByText(/Downtown Mountain View, CA/i)).toBeDefined();
    expect(screen.getByText('$25.00')).toBeDefined();
    expect(screen.getByText('7.2 km')).toBeDefined();
    expect(screen.getByText('~12m')).toBeDefined();

    expect(screen.getByText('Urgent Medical Document Envelope')).toBeDefined();
    expect(screen.getByText('$19.50')).toBeDefined();
  });

  it('renders visible Accept Delivery and Decline / Reject buttons for each pending request', () => {
    setupPartnerMocks(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const acceptButtons = screen.getAllByRole('button', { name: /accept delivery/i });
    expect(acceptButtons.length).toBe(2);

    const declineButtons = screen.getAllByRole('button', { name: /decline|reject/i });
    expect(declineButtons.length).toBe(2);
  });

  it('triggers acceptDeliveryMatch when partner clicks Accept Delivery', async () => {
    setupPartnerMocks(true);
    mockAcceptDeliveryMatch.mockResolvedValue(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const acceptButtons = screen.getAllByRole('button', { name: /accept delivery/i });
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      expect(mockAcceptDeliveryMatch).toHaveBeenCalledWith('req-pending-1', 'jrn-driver-1');
    });
  });

  it('triggers rejectDelivery when partner clicks Decline / Reject', async () => {
    setupPartnerMocks(true);
    mockRejectDelivery.mockResolvedValue(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const declineButtons = screen.getAllByRole('button', { name: /decline|reject/i });
    fireEvent.click(declineButtons[0]);

    await waitFor(() => {
      expect(mockRejectDelivery).toHaveBeenCalledWith('req-pending-1');
    });
  });

  it('exposes data-testid attributes for automated testing and browser verification', () => {
    setupPartnerMocks(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const acceptButtons = screen.getAllByTestId('accept-delivery-button');
    expect(acceptButtons.length).toBe(2);

    const declineButtons = screen.getAllByTestId('reject-delivery-button');
    expect(declineButtons.length).toBe(2);
  });

  it('automatically turns partner availability online when clicking Accept while offline', async () => {
    setupPartnerMocks(false);
    mockAcceptDeliveryMatch.mockResolvedValue(true);

    render(
      <PartnerDashboard
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const acceptButtons = screen.getAllByRole('button', { name: /accept delivery/i });
    fireEvent.click(acceptButtons[0]);

    await waitFor(() => {
      expect(mockSetPartnerAvailable).toHaveBeenCalledWith(true);
      expect(mockAcceptDeliveryMatch).toHaveBeenCalledWith('req-pending-1', 'jrn-driver-1');
    });
  });
});
