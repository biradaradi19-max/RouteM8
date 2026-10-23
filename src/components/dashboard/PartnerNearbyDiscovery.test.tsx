import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartnerDashboard } from './PartnerDashboard';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';
import * as DiscoveryLocationModule from '../../hooks/usePartnerDiscoveryLocation';
import { deliveriesApi } from '../../services/api';
import type { DeliveryRequest, UserProfile } from '../../types';

describe('PartnerDashboard Location-Based Nearby Delivery Discovery', () => {
  const mockAccept = vi.fn().mockResolvedValue(true);
  const mockReject = vi.fn().mockResolvedValue(true);
  const mockSetPartnerAvailable = vi.fn();
  const mockRefreshLocation = vi.fn().mockResolvedValue(undefined);

  const mockPartner: UserProfile = {
    id: 'partner-active-1',
    email: 'partner@example.com',
    fullName: 'David Partner',
    role: 'transporter',
    verificationStatus: 'gov_id_verified',
    trustScore: 99,
    rating: 5.0,
    completedDeliveries: 10,
    completedCommutes: 5,
  };

  const mockNearbyDeliveries: DeliveryRequest[] = [
    {
      id: 'del-nearby-01',
      title: 'Stanford Bookstore Notes Handover',
      description: 'Study notes folder in yellow envelope',
      category: 'campus-supplies',
      pickupAddress: 'Stanford Bookstore, Stanford, CA',
      pickupCoords: [37.4241, -122.1700],
      dropoffAddress: 'Palo Alto High School',
      dropoffCoords: [37.4350, -122.1550],
      itemSize: 'small',
      compensation: 14.5,
      urgency: 'standard',
      neededBy: 'Today by 18:00',
      status: 'open',
      requesterId: 'customer-alice',
      requesterName: 'Alice Student',
      requesterTrustScore: 98,
      handoverPin: '1111',
      pickupDistanceKm: 0.38,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'del-nearby-02',
      title: 'El Camino Pharmacy Prescription',
      description: 'Sealed medication bag from pharmacy',
      category: 'pharmacy',
      pickupAddress: 'Walgreens, 4170 El Camino Real, Palo Alto, CA',
      pickupCoords: [37.4124, -122.1287],
      dropoffAddress: 'Stanford Hospital',
      dropoffCoords: [37.4340, -122.1750],
      itemSize: 'small',
      compensation: 22.0,
      urgency: 'urgent',
      neededBy: 'Today by 16:30',
      status: 'open',
      requesterId: 'customer-bob',
      requesterName: 'Bob Senior',
      requesterTrustScore: 95,
      handoverPin: '2222',
      pickupDistanceKm: 3.98,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockPartner,
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
      requests: [],
      journeys: [],
      partnerAvailable: true,
      setPartnerAvailable: mockSetPartnerAvailable,
      acceptDeliveryMatch: mockAccept,
      rejectDelivery: mockReject,
      updateRequestStatus: vi.fn(),
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

    vi.spyOn(deliveriesApi, 'getNearbyDeliveries').mockResolvedValue(mockNearbyDeliveries);
  });

  it('renders "Getting your location…" while GPS position is being acquired', () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: null,
      locationStatus: 'getting_location',
      errorMessage: null,
      lastUpdated: null,
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Getting your location…',
    });

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    expect(screen.getByText(/Getting your location…/i)).toBeDefined();
    expect(deliveriesApi.getNearbyDeliveries).not.toHaveBeenCalled();
  });

  it('renders "Location permission required" when browser geolocation is denied', () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: null,
      locationStatus: 'permission_denied',
      errorMessage: 'User denied Geolocation',
      lastUpdated: null,
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Location permission required',
    });

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    expect(screen.getByText(/Location permission required/i)).toBeDefined();
    expect(deliveriesApi.getNearbyDeliveries).not.toHaveBeenCalled();
  });

  it('renders "Unable to get location — Retry" on timeout and triggers refreshLocation on click', async () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: null,
      locationStatus: 'timeout',
      errorMessage: 'Location acquisition timed out',
      lastUpdated: null,
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Unable to get location — Retry',
    });

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    expect(screen.getByText(/Unable to get location — Retry/i)).toBeDefined();
    const retryBtn = screen.getByRole('button', { name: /Retry GPS/i });
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);
    expect(mockRefreshLocation).toHaveBeenCalled();
  });

  it('fetches nearby deliveries within 5 km by default and displays distance tags and compensation', async () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: [37.4275, -122.1697],
      locationStatus: 'ready',
      errorMessage: null,
      lastUpdated: new Date(),
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Location acquired',
    });

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    await waitFor(() => {
      expect(deliveriesApi.getNearbyDeliveries).toHaveBeenCalledWith({
        lat: 37.4275,
        lng: -122.1697,
        radiusKm: 5,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Stanford Bookstore Notes Handover/i)).toBeDefined();
      expect(screen.getByText(/El Camino Pharmacy Prescription/i)).toBeDefined();
      expect(screen.getByText(/0.4 km away/i)).toBeDefined();
      expect(screen.getByText(/4.0 km away/i)).toBeDefined();
      expect(screen.getByText(/\$14.50/i)).toBeDefined();
      expect(screen.getByText(/\$22.00/i)).toBeDefined();
    });
  });

  it('allows radius expansion from 5 km to 10 km and 15 km', async () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: [37.4275, -122.1697],
      locationStatus: 'ready',
      errorMessage: null,
      lastUpdated: new Date(),
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Location acquired',
    });

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    await waitFor(() => {
      expect(deliveriesApi.getNearbyDeliveries).toHaveBeenCalledWith({
        lat: 37.4275,
        lng: -122.1697,
        radiusKm: 5,
      });
    });

    // Expand search to 10 km
    const radius10Btn = screen.getByRole('button', { name: /10 km/i });
    fireEvent.click(radius10Btn);

    await waitFor(() => {
      expect(deliveriesApi.getNearbyDeliveries).toHaveBeenCalledWith({
        lat: 37.4275,
        lng: -122.1697,
        radiusKm: 10,
      });
    });

    // Expand search to 15 km
    const radius15Btn = screen.getByRole('button', { name: /15 km/i });
    fireEvent.click(radius15Btn);

    await waitFor(() => {
      expect(deliveriesApi.getNearbyDeliveries).toHaveBeenCalledWith({
        lat: 37.4275,
        lng: -122.1697,
        radiusKm: 15,
      });
    });
  });

  it('renders "No deliveries within 5 km" with an Expand Search button when list is empty', async () => {
    vi.spyOn(DiscoveryLocationModule, 'usePartnerDiscoveryLocation').mockReturnValue({
      coords: [37.4275, -122.1697],
      locationStatus: 'ready',
      errorMessage: null,
      lastUpdated: new Date(),
      refreshLocation: mockRefreshLocation,
      statusLabel: 'Location acquired',
    });

    vi.spyOn(deliveriesApi, 'getNearbyDeliveries').mockResolvedValue([]);

    render(<PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No deliveries within 5 km/i)).toBeDefined();
    });

    const expandBtn = screen.getByRole('button', { name: /Expand Search to 10 km/i });
    expect(expandBtn).toBeDefined();

    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(deliveriesApi.getNearbyDeliveries).toHaveBeenCalledWith({
        lat: 37.4275,
        lng: -122.1697,
        radiusKm: 10,
      });
    });
  });
});
