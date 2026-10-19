import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeliveryCard } from './DeliveryCard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import type { DeliveryRequest, UserProfile } from '../../types';

describe('DeliveryCard — Partner Accept & Decline Delivery Buttons', () => {
  const mockOnInspectMatch = vi.fn();
  const mockOnUpdateStatus = vi.fn();
  const mockAcceptDeliveryMatch = vi.fn();
  const mockRejectDelivery = vi.fn();

  const mockPartnerUser: UserProfile = {
    id: 'partner-user-1',
    email: 'commuter@example.com',
    fullName: 'David Commuter',
    role: 'both',
    verificationStatus: 'gov_id_verified',
    trustScore: 98,
    rating: 4.95,
    completedDeliveries: 15,
    completedCommutes: 30,
    commuteVehicle: 'Toyota Prius',
  };

  const mockOpenRequest: DeliveryRequest = {
    id: 'req-open-99',
    requesterId: 'requester-user-2',
    requesterName: 'Sarah Jenkins',
    requesterTrustScore: 95,
    title: 'Lab Notebook & Circuit Breadboard',
    description: 'Pickup from Science Library and drop at Hacker House',
    category: 'campus-supplies',
    itemSize: 'small',
    weightEstimateKg: 1.0,
    compensation: 22.50,
    pickupAddress: 'Stanford Science Library, Stanford, CA',
    pickupCoords: [37.4275, -122.1697],
    dropoffAddress: 'Castro St & El Camino Real, Mountain View, CA',
    dropoffCoords: [37.3861, -122.0839],
    urgency: 'urgent',
    neededBy: 'Today by 19:00',
    handoverPin: '4821',
    status: 'open',
    createdAt: '2026-10-18T10:00:00Z',
    distanceKm: 8.4,
    estimatedDurationMin: 14,
    estimatedDetourMinutes: 5,
  };

  const setupMocks = (activeRoleMode: 'requester' | 'transporter' = 'transporter') => {
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
      activeRoleMode,
      partnerAvailable: true,
      setPartnerAvailable: vi.fn(),
      acceptDeliveryMatch: mockAcceptDeliveryMatch,
      rejectDelivery: mockRejectDelivery,
      acceptError: null,
      requests: [mockOpenRequest],
      journeys: [],
      activities: [],
      currentView: 'deliveries',
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
      updateRequestStatus: mockOnUpdateStatus,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Accept Delivery and Decline / Reject buttons for open requests in Delivery Partner mode', () => {
    setupMocks('transporter');

    render(
      <DeliveryCard
        request={mockOpenRequest}
        onInspectMatch={mockOnInspectMatch}
        onUpdateStatus={mockOnUpdateStatus}
      />
    );

    const acceptBtn = screen.getByRole('button', { name: /accept delivery/i });
    expect(acceptBtn).toBeDefined();

    const declineBtn = screen.getByRole('button', { name: /decline|reject/i });
    expect(declineBtn).toBeDefined();
  });

  it('calls acceptDeliveryMatch when clicking Accept Delivery button', async () => {
    setupMocks('transporter');
    mockAcceptDeliveryMatch.mockResolvedValue(true);

    render(
      <DeliveryCard
        request={mockOpenRequest}
        onInspectMatch={mockOnInspectMatch}
        onUpdateStatus={mockOnUpdateStatus}
      />
    );

    const acceptBtn = screen.getByRole('button', { name: /accept delivery/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockAcceptDeliveryMatch).toHaveBeenCalledWith('req-open-99');
    });
  });

  it('calls rejectDelivery when clicking Decline / Reject button', async () => {
    setupMocks('transporter');
    mockRejectDelivery.mockResolvedValue(true);

    render(
      <DeliveryCard
        request={mockOpenRequest}
        onInspectMatch={mockOnInspectMatch}
        onUpdateStatus={mockOnUpdateStatus}
      />
    );

    const declineBtn = screen.getByRole('button', { name: /decline|reject/i });
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(mockRejectDelivery).toHaveBeenCalledWith('req-open-99');
    });
  });

  it('does NOT render Accept/Decline buttons when viewing in Requester mode', () => {
    setupMocks('requester');

    render(
      <DeliveryCard
        request={mockOpenRequest}
        onInspectMatch={mockOnInspectMatch}
        onUpdateStatus={mockOnUpdateStatus}
      />
    );

    expect(screen.queryByRole('button', { name: /accept delivery/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /decline|reject/i })).toBeNull();
  });

  describe('Bug 1: Mark In Transit Role Isolation & Execution', () => {
    const mockMatchedRequest: DeliveryRequest = {
      ...mockOpenRequest,
      id: 'req-matched-101',
      status: 'matched',
      transporterId: 'partner-user-1',
      transporterName: 'David Commuter',
    };

    it('renders Mark In Transit button for the assigned delivery partner and triggers onUpdateStatus', async () => {
      setupMocks('transporter');
      mockOnUpdateStatus.mockResolvedValue({ success: true });

      render(
        <DeliveryCard
          request={mockMatchedRequest}
          onInspectMatch={mockOnInspectMatch}
          onUpdateStatus={mockOnUpdateStatus}
        />
      );

      const transitBtn = screen.getByTestId('mark-in-transit-button');
      expect(transitBtn).toBeDefined();
      expect(transitBtn.textContent).toContain('Mark In Transit');

      fireEvent.click(transitBtn);

      await waitFor(() => {
        expect(mockOnUpdateStatus).toHaveBeenCalledWith('req-matched-101', 'in_transit');
      });
    });

    it('displays error banner if Mark In Transit operation fails or is rejected', async () => {
      setupMocks('transporter');
      mockOnUpdateStatus.mockResolvedValue({
        success: false,
        message: 'Only the assigned delivery partner can start transit',
      });

      render(
        <DeliveryCard
          request={mockMatchedRequest}
          onInspectMatch={mockOnInspectMatch}
          onUpdateStatus={mockOnUpdateStatus}
        />
      );

      const transitBtn = screen.getByTestId('mark-in-transit-button');
      fireEvent.click(transitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Only the assigned delivery partner can start transit/i)).toBeDefined();
      });
    });

    it('does NOT render Mark In Transit button for the requester; shows awaiting pickup indicator instead', () => {
      // Current user is the Requester
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'requester-user-2', // Matches mockMatchedRequest.requesterId
          email: 'sarah@example.com',
          fullName: 'Sarah Jenkins',
          role: 'requester',
          verificationStatus: 'email_verified',
          trustScore: 95,
          rating: 5.0,
          completedDeliveries: 2,
          completedCommutes: 0,
        },
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

      render(
        <DeliveryCard
          request={mockMatchedRequest}
          onInspectMatch={mockOnInspectMatch}
          onUpdateStatus={mockOnUpdateStatus}
        />
      );

      // Must NOT show actionable Mark In Transit button to requester
      expect(screen.queryByTestId('mark-in-transit-button')).toBeNull();

      // Must show awaiting pickup status indicator
      const awaitingBadge = screen.getByTestId('awaiting-pickup-badge');
      expect(awaitingBadge).toBeDefined();
      expect(awaitingBadge.textContent).toContain('Partner Assigned — Awaiting Pickup');
    });
  });

  describe('Bug 2: Verify Handover PIN Drawer Flow', () => {
    const mockInTransitRequest: DeliveryRequest = {
      ...mockOpenRequest,
      id: 'req-transit-202',
      status: 'in_transit',
      transporterId: 'partner-user-1',
    };

    it('opens drawer and handles PIN verification gracefully without JSON crash', async () => {
      setupMocks('transporter');
      mockOnUpdateStatus.mockResolvedValue({
        success: true,
        message: 'PIN verified successfully! Handover completed and compensation released.',
      });

      render(
        <DeliveryCard
          request={mockInTransitRequest}
          onInspectMatch={mockOnInspectMatch}
          onUpdateStatus={mockOnUpdateStatus}
        />
      );

      const verifyBtn = screen.getByTestId('verify-handover-pin-button');
      fireEvent.click(verifyBtn);

      const pinInput = screen.getByPlaceholderText(/4-digit PIN/i);
      expect(pinInput).toBeDefined();

      fireEvent.change(pinInput, { target: { value: '4821' } });
      const submitBtn = screen.getByTestId('submit-verify-pin-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockOnUpdateStatus).toHaveBeenCalledWith('req-transit-202', 'completed', '4821');
      });
    });

    it('displays error message gracefully when PIN verification returns an error', async () => {
      setupMocks('transporter');
      mockOnUpdateStatus.mockResolvedValue({
        success: false,
        message: 'Invalid handover PIN. 4 attempts remaining.',
      });

      render(
        <DeliveryCard
          request={mockInTransitRequest}
          onInspectMatch={mockOnInspectMatch}
          onUpdateStatus={mockOnUpdateStatus}
        />
      );

      const verifyBtn = screen.getByTestId('verify-handover-pin-button');
      fireEvent.click(verifyBtn);

      const pinInput = screen.getByPlaceholderText(/4-digit PIN/i);
      fireEvent.change(pinInput, { target: { value: '0000' } });
      const submitBtn = screen.getByTestId('submit-verify-pin-button');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Invalid handover PIN. 4 attempts remaining./i)).toBeDefined();
      });
    });
  });
});
