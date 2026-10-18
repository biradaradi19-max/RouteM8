import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardView } from './DashboardView';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, PublishedJourney, UserProfile } from '../../types';

describe('DashboardView Component — Production-Ready Mobility & Delivery Dashboard', () => {
  const mockOnOpenCreateRequest = vi.fn();
  const mockOnOpenPublishJourney = vi.fn();
  const mockOnInspectMatch = vi.fn();
  const mockUpdateRequestStatus = vi.fn();

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
  };

  const mockRequests: DeliveryRequest[] = [
    {
      id: 'req-1',
      requesterId: 'user-2',
      requesterName: 'Sarah Jenkins',
      requesterTrustScore: 95,
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
      transporterId: 'user-1',
      transporterName: 'Alex Morgan',
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
      requests: mockRequests,
      journeys: mockJourneys,
      activities: [
        {
          id: 'act-1',
          type: 'match_found',
          title: 'Optimal Corridor Match Found',
          description: 'Corridor match computed with Stanford Commute',
          timestamp: '10m ago',
        },
      ],
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
      acceptDeliveryMatch: vi.fn(),
    });
  });

  it('renders welcome panel with user name, verified badge, and trust score', () => {
    render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    expect(screen.getByText(/Alex/)).toBeDefined();
    expect(screen.getByText(/Stanford Commuter Club/i)).toBeDefined();
    expect(screen.getByText(/99% Trust Score/i)).toBeDefined();
  });

  it('renders KPI cards with .kpi-card class and dynamic values', () => {
    const { container } = render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const kpiCards = container.querySelectorAll('.kpi-card');
    expect(kpiCards.length).toBe(4);

    expect(screen.getByText('Active In-Flight Deliveries')).toBeDefined();
    expect(screen.getByText('Published Commutes')).toBeDefined();
    expect(screen.getByText('Community Balance')).toBeDefined();
    expect(screen.getByText('CO₂ Prevented')).toBeDefined();
  });

  it('triggers quick CTA actions for Create Request and Publish Journey', () => {
    render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const createBtn = screen.getByRole('button', { name: /create request/i });
    fireEvent.click(createBtn);
    expect(mockOnOpenCreateRequest).toHaveBeenCalledTimes(1);

    const publishBtn = screen.getByRole('button', { name: /publish journey/i });
    fireEvent.click(publishBtn);
    expect(mockOnOpenPublishJourney).toHaveBeenCalledTimes(1);
  });

  it('renders active delivery in progress with security PIN and stepper', () => {
    render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    expect(screen.getByText('Active Deliveries in Progress')).toBeDefined();
    expect(screen.getAllByText('Chemistry Lab Manual & Notes').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('4821')).toBeDefined(); // Security PIN
  });

  it('allows opening PIN verification and submitting the 4-digit code', async () => {
    mockUpdateRequestStatus.mockResolvedValue({ success: true });

    render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const verifyBtn = screen.getByRole('button', { name: /verify handover/i });
    fireEvent.click(verifyBtn);

    const pinInput = screen.getByPlaceholderText('e.g. 9312');
    fireEvent.change(pinInput, { target: { value: '4821' } });

    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockUpdateRequestStatus).toHaveBeenCalledWith('req-1', 'completed', '4821');
    });
  });

  it('filters nearby requests based on search input', () => {
    render(
      <DashboardView
        onOpenCreateRequest={mockOnOpenCreateRequest}
        onOpenPublishJourney={mockOnOpenPublishJourney}
        onInspectMatch={mockOnInspectMatch}
      />
    );

    const searchInput = screen.getByPlaceholderText('Filter corridor / title...');
    fireEvent.change(searchInput, { target: { value: 'Blueprint' } });

    expect(screen.getByText('Architectural Scale Model Blueprint')).toBeDefined();
    const inspectRouteButtons = screen.getAllByRole('button', { name: /inspect route/i });
    expect(inspectRouteButtons.length).toBe(1);
  });
});
