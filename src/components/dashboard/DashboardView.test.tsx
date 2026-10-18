import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardView } from './DashboardView';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney, UserProfile } from '../../types';

describe('DashboardView Component — Separate Requester and Delivery Partner Experiences', () => {
  const mockOnOpenCreateRequest = vi.fn();
  const mockOnOpenPublishJourney = vi.fn();
  const mockOnInspectMatch = vi.fn();
  const mockUpdateRequestStatus = vi.fn();
  const mockAcceptDeliveryMatch = vi.fn();
  const mockSetPartnerAvailable = vi.fn();

  const mockUser: UserProfile = {
    id: 'user-1',
    email: 'alex@example.com',
    fullName: 'Alex Morgan',
    role: 'both',
    verificationStatus: 'student_verified',
    organization: 'Stanford Commuter Club',
    trustScore: 99,
    completedDeliveries: 12,
    completedCommutes: 24,
    rating: 4.98,
    commuteVehicle: 'Tesla Model 3',
  };

  const mockRequests: DeliveryRequest[] = [
    {
      id: 'req-1',
      requesterId: 'user-1',
      requesterName: 'Alex Morgan',
      requesterTrustScore: 99,
      title: 'Chemistry Lab Manual & Notes',
      description: 'Urgent pickup from Science Library',
      category: 'campus-supplies',
      itemSize: 'small',
      weightEstimateKg: 0.8,
      compensation: 18.0,
      pickupAddress: 'Stanford Science Library, Stanford, CA',
      pickupCoords: [37.4275, -122.1697],
      dropoffAddress: 'Palo Alto Caltrain Station, Palo Alto, CA',
      dropoffCoords: [37.4436, -122.1649],
      urgency: 'urgent',
      neededBy: 'Today by 5:00 PM',
      handoverPin: '4821',
      status: 'matched',
      transporterId: 'user-2',
      transporterName: 'Sarah Jenkins',
      transporterVehicle: 'Honda Civic',
      createdAt: '2026-10-18T10:00:00Z',
      estimatedDetourMinutes: 4,
    },
    {
      id: 'req-2',
      requesterId: 'user-3',
      requesterName: 'Marcus Chen',
      requesterTrustScore: 92,
      title: 'Architectural Scale Model Blueprint',
      description: 'Fragile foam-board packaging',
      category: 'other',
      itemSize: 'medium',
      weightEstimateKg: 2.2,
      compensation: 24.5,
      pickupAddress: 'Design School Studio A',
      pickupCoords: [37.43, -122.17],
      dropoffAddress: 'Downtown Coworking Hub',
      dropoffCoords: [37.45, -122.16],
      urgency: 'standard',
      neededBy: 'Tomorrow by 11:00 AM',
      handoverPin: '7103',
      status: 'open',
      createdAt: '2026-10-18T11:00:00Z',
      estimatedDetourMinutes: 6,
    },
  ];

  const mockJourneys: PublishedJourney[] = [
    {
      id: 'jrn-1',
      transporterId: 'user-1',
      transporterName: 'Alex Morgan',
      transporterTrustScore: 99,
      vehicle: 'Tesla Model 3',
      originAddress: 'Stanford Campus',
      originCoords: [37.4275, -122.1697],
      destAddress: 'San Francisco Financial District',
      destCoords: [37.7946, -122.3999],
      departureTime: 'Today at 5:30 PM',
      maxDetourMinutes: 10,
      capacity: 'medium',
      recurringDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      isActive: true,
      createdAt: '2026-10-18T08:00:00Z',
    },
  ];

  const setupMocks = (activeRoleMode: 'requester' | 'transporter' = 'requester') => {
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
      activeRoleMode,
      setActiveRoleMode: vi.fn(),
      partnerAvailable: true,
      setPartnerAvailable: mockSetPartnerAvailable,
      requests: mockRequests,
      journeys: mockJourneys,
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
      updateRequestStatus: mockUpdateRequestStatus,
      acceptDeliveryMatch: mockAcceptDeliveryMatch,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks('requester');
  });

  describe('Requester Experience (activeRoleMode = requester)', () => {
    it('renders Requester Portal banner with user greeting and trust score', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      expect(screen.getByText(/Requester Portal/i)).toBeDefined();
      expect(screen.getByText(/Alex/)).toBeDefined();
      expect(screen.getByText(/Stanford Commuter Club/i)).toBeDefined();
      expect(screen.getByText(/99% Trust Score/i)).toBeDefined();
    });

    it('renders requester KPI cards with .kpi-card class and requester metrics', () => {
      const { container } = render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const kpiCards = container.querySelectorAll('.kpi-card');
      expect(kpiCards.length).toBe(4);

      expect(screen.getByText('Active Requests')).toBeDefined();
      expect(screen.getByText('Completed Deliveries')).toBeDefined();
      expect(screen.getByText('Compensation Spent')).toBeDefined();
      expect(screen.getByText('Carbon Prevented')).toBeDefined();
    });

    it('prominently displays "Request a Delivery" and does not show "Publish My Journey" in requester view', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const requestBtn = screen.getByRole('button', { name: /request a delivery/i });
      expect(requestBtn).toBeDefined();
      fireEvent.click(requestBtn);
      expect(mockOnOpenCreateRequest).toHaveBeenCalledTimes(1);

      // Requesters must NOT see publisher CTA as primary workflow
      expect(screen.queryByRole('button', { name: /publish my journey/i })).toBeNull();
    });

    it('renders active delivery tracking with 4-digit handover PIN and Call Transporter button', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      expect(screen.getByText('Active Delivery Tracking & Handover')).toBeDefined();
      expect(screen.getAllByText('Chemistry Lab Manual & Notes').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('4821')).toBeDefined(); // Handover PIN
      expect(screen.getByRole('button', { name: /call transporter/i })).toBeDefined();
    });

    it('filters requester requests list based on search input', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search requests...');
      fireEvent.change(searchInput, { target: { value: 'Chemistry' } });

      expect(screen.getAllByText('Chemistry Lab Manual & Notes').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Delivery Partner Experience (activeRoleMode = transporter)', () => {
    beforeEach(() => {
      setupMocks('transporter');
    });

    it('renders Delivery Partner banner with partner availability indicator', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      expect(screen.getByText(/Delivery Partner Portal/i)).toBeDefined();
      expect(screen.getByText(/Online • Accepting Jobs/i)).toBeDefined();
    });

    it('renders partner KPI cards with .kpi-card class and partner metrics', () => {
      const { container } = render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const kpiCards = container.querySelectorAll('.kpi-card');
      expect(kpiCards.length).toBe(4);

      expect(screen.getByText('Active Deliveries')).toBeDefined();
      expect(screen.getByText('Published Corridors')).toBeDefined();
      expect(screen.getByText('Total Earnings')).toBeDefined();
      expect(screen.getByText('Detour Efficiency')).toBeDefined();
    });

    it('renders "Publish My Journey" CTA for delivery partners', () => {
      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const publishBtn = screen.getByRole('button', { name: /publish my journey/i });
      expect(publishBtn).toBeDefined();
      fireEvent.click(publishBtn);
      expect(mockOnOpenPublishJourney).toHaveBeenCalledTimes(1);
    });

    it('allows partner to verify recipient PIN and complete handover', async () => {
      mockUpdateRequestStatus.mockResolvedValue({ success: true });

      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      const verifyBtn = screen.getByRole('button', { name: /verify handover pin/i });
      fireEvent.click(verifyBtn);

      const pinInput = screen.getByPlaceholderText('e.g. 9421');
      fireEvent.change(pinInput, { target: { value: '4821' } });

      const confirmBtn = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockUpdateRequestStatus).toHaveBeenCalledWith('req-1', 'completed', '4821');
      });
    });

    it('shows corridor opportunities and allows accepting a delivery request', async () => {
      mockAcceptDeliveryMatch.mockResolvedValue(true);

      render(
        <DashboardView
          onOpenCreateRequest={mockOnOpenCreateRequest}
          onOpenPublishJourney={mockOnOpenPublishJourney}
          onInspectMatch={mockOnInspectMatch}
        />
      );

      expect(screen.getByText('Find Delivery Requests (Corridor Opportunities)')).toBeDefined();
      expect(screen.getByText('Architectural Scale Model Blueprint')).toBeDefined();

      const acceptBtn = screen.getByRole('button', { name: /accept job/i });
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(mockAcceptDeliveryMatch).toHaveBeenCalledWith('req-2', 'jrn-1');
      });
    });
  });
});
