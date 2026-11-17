import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccountView } from './AccountView';
import * as AuthContextModule from '../../context/AuthContext';
import * as AppContextModule from '../../context/AppContext';

describe('AccountView Component — Flipkart-Inspired Account Management', () => {
  const mockUpdateProfile = vi.fn();
  const mockResetPassword = vi.fn();
  const mockOpenPhoneVerificationModal = vi.fn();
  const mockSignOut = vi.fn();
  const mockSetCurrentView = vi.fn();
  const mockSetActiveRoleMode = vi.fn();
  const mockSetPartnerAvailable = vi.fn();
  const mockOnBack = vi.fn();
  const mockOnOpenAuth = vi.fn();

  const mockUserRequester = {
    id: 'user-req-123',
    fullName: 'Aditya Biradar',
    email: 'aditya@example.com',
    phone: '+91 98765 43210',
    isPhoneVerified: true,
    role: 'requester' as const,
    trustScore: 98,
    organization: 'Tech Hub Mumbai',
    bio: 'Frequent parcel sender between Pune and Kolhapur',
    completedDeliveries: 14,
    completedCommutes: 0,
    rating: 4.9,
    verificationStatus: 'verified' as const,
  };

  const mockUserTransporter = {
    id: 'user-trans-456',
    fullName: 'Ramesh Patil',
    email: 'ramesh@example.com',
    phone: '+91 91234 56789',
    isPhoneVerified: true,
    role: 'transporter' as const,
    trustScore: 95,
    organization: 'Kolhapur Commuters',
    bio: 'Daily commuter on NH166 between Atigre and Sangli',
    commuteVehicle: 'Maruti Suzuki Swift (White)',
    completedDeliveries: 38,
    completedCommutes: 52,
    rating: 4.95,
    verificationStatus: 'verified' as const,
  };

  const mockUserAdmin = {
    ...mockUserRequester,
    id: 'user-admin-789',
    role: 'both' as const,
  };

  const mockRequests = [
    {
      id: 'del-1',
      title: 'Lab Electronics Box',
      description: 'Carefully packaged circuit boards',
      category: 'electronics' as const,
      pickupAddress: 'Shivaji University, Kolhapur',
      pickupCoords: [16.678, 74.255] as [number, number],
      dropoffAddress: 'Atigre Bus Stop, NH166',
      dropoffCoords: [16.744, 74.360] as [number, number],
      itemSize: 'medium' as const,
      compensation: 350,
      urgency: 'flexible' as const,
      neededBy: '2026-11-20',
      status: 'completed' as const,
      requesterId: 'user-req-123',
      requesterName: 'Aditya Biradar',
      transporterId: 'user-trans-456',
      transporterName: 'Ramesh Patil',
      createdAt: '2026-11-15T10:00:00Z',
    },
    {
      id: 'del-2',
      title: 'Urgent Document Envelope',
      description: 'Transcripts for verification',
      category: 'documents' as const,
      pickupAddress: 'Sanjay Ghodawat University, Atigre',
      pickupCoords: [16.744, 74.383] as [number, number],
      dropoffAddress: 'Sangli City Post Office',
      dropoffCoords: [16.850, 74.594] as [number, number],
      itemSize: 'small' as const,
      compensation: 210,
      urgency: 'high' as const,
      neededBy: '2026-11-18',
      status: 'in_transit' as const,
      requesterId: 'user-req-123',
      requesterName: 'Aditya Biradar',
      transporterId: 'user-trans-456',
      transporterName: 'Ramesh Patil',
      createdAt: '2026-11-16T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const setupMocks = (user: any, activeRoleMode: 'requester' | 'transporter' = 'requester') => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user,
      isAuthenticated: Boolean(user),
      isLoading: false,
      isFirebaseConnected: true,
      isSupabaseConnected: false,
      error: null,
      clearError: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      signOut: mockSignOut,
      resetPassword: mockResetPassword.mockResolvedValue({ success: true, message: 'Password reset link sent' }),
      updateProfile: mockUpdateProfile.mockResolvedValue(true),
      submitVerificationRequest: vi.fn(),
      verifyStudentOrWork: vi.fn(),
      isPhoneVerificationModalOpen: false,
      openPhoneVerificationModal: mockOpenPhoneVerificationModal,
      closePhoneVerificationModal: vi.fn(),
      recordPhoneVerificationSuccess: vi.fn(),
      refreshIdToken: vi.fn(),
    });

    vi.spyOn(AppContextModule, 'useApp').mockReturnValue({
      theme: 'light',
      toggleTheme: vi.fn(),
      currentView: 'account',
      setCurrentView: mockSetCurrentView,
      activeRoleFilter: 'all',
      setActiveRoleFilter: vi.fn(),
      activeRoleMode,
      setActiveRoleMode: mockSetActiveRoleMode,
      partnerAvailable: true,
      setPartnerAvailable: mockSetPartnerAvailable,
      requests: mockRequests as any,
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

  describe('1. Unauthenticated Guest Handling', () => {
    it('should display sign in prompt and handle sign-in / back triggers', () => {
      setupMocks(null);
      render(<AccountView onBack={mockOnBack} onOpenAuth={mockOnOpenAuth} />);

      expect(screen.getByText(/Sign In to Access My Account/i)).toBeTruthy();
      expect(screen.getByText(/Sign In \/ Register/i)).toBeTruthy();

      fireEvent.click(screen.getByText(/Sign In \/ Register/i));
      expect(mockOnOpenAuth).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText(/Back to Dashboard/i));
      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Requester Account Experience', () => {
    it('should render user personal info, trust score, and requester-specific tabs', () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      // Profile Header Card
      expect(screen.getAllByText('Aditya Biradar').length).toBeGreaterThan(0);
      expect(screen.getByText(/Trust 98%/i)).toBeTruthy();

      // Requester Tabs
      expect(screen.getAllByText('Personal Information').length).toBeGreaterThan(0);
      expect(screen.getByText('Manage Addresses')).toBeTruthy();
      expect(screen.getByText('My Deliveries')).toBeTruthy();
      expect(screen.getByText('Payments & Transactions')).toBeTruthy();
      expect(screen.getByText('Notifications')).toBeTruthy();
      expect(screen.getByText('Login & Security')).toBeTruthy();
      expect(screen.getByText('Help & Support')).toBeTruthy();

      // Transporter tabs should NOT appear in Requester mode
      expect(screen.queryByText('Vehicle Information')).toBeNull();
      expect(screen.queryByText('Verification Documents')).toBeNull();
      expect(screen.queryByText('Availability Settings')).toBeNull();
      expect(screen.queryByText('Earnings & Payouts')).toBeNull();
    });

    it('should allow editing and saving personal profile information', async () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      // Click Edit Profile
      fireEvent.click(screen.getByText('Edit Profile'));

      // Form inputs should appear
      const nameInput = screen.getByDisplayValue('Aditya Biradar');
      fireEvent.change(nameInput, { target: { value: 'Aditya S. Biradar' } });

      const bioInput = screen.getByDisplayValue('Frequent parcel sender between Pune and Kolhapur');
      fireEvent.change(bioInput, { target: { value: 'Updated bio for testing' } });

      // Click Save Changes
      fireEvent.click(screen.getByText('Save Changes'));

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: 'Aditya S. Biradar',
            bio: 'Updated bio for testing',
          })
        );
      });
    });

    it('should switch to Manage Addresses tab and allow adding new address', () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Manage Addresses'));

      expect(screen.getByText(/Manage Saved Addresses/i)).toBeTruthy();
      expect(screen.getByText(/Add New Address/i)).toBeTruthy();

      // Click Add New Address
      fireEvent.click(screen.getByText(/Add New Address/i));

      expect(screen.getByText('Add New Delivery Address')).toBeTruthy();
      expect(screen.getByText(/Save Address/i)).toBeTruthy();
    });

    it('should switch to My Deliveries tab and show user deliveries in INR', () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('My Deliveries'));

      expect(screen.getByText(/Lab Electronics Box/i)).toBeTruthy();
      expect(screen.getByText(/Urgent Document Envelope/i)).toBeTruthy();
      expect(screen.getByText(/₹350/i)).toBeTruthy();
      expect(screen.getByText(/₹210/i)).toBeTruthy();
    });

    it('should trigger password reset email from Login & Security tab', async () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Login & Security'));

      expect(screen.getByText(/Send Password Reset Email/i)).toBeTruthy();
      fireEvent.click(screen.getByText(/Send Password Reset Email/i));

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith('aditya@example.com');
      });
    });
  });

  describe('3. Transporter (Delivery Partner) Account Experience', () => {
    it('should render Transporter tabs including Vehicle, Documents, Availability, and Earnings', () => {
      setupMocks(mockUserTransporter, 'transporter');
      render(<AccountView onBack={mockOnBack} />);

      expect(screen.getAllByText('Ramesh Patil').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Personal Information').length).toBeGreaterThan(0);
      expect(screen.getByText('Vehicle Information')).toBeTruthy();
      expect(screen.getByText('Verification Documents')).toBeTruthy();
      expect(screen.getByText('Availability Settings')).toBeTruthy();
      expect(screen.getByText('Delivery History')).toBeTruthy();
      expect(screen.getByText('Earnings & Payouts')).toBeTruthy();

      // Requester specific tabs should not appear
      expect(screen.queryByText('Manage Addresses')).toBeNull();
    });

    it('should view and edit Vehicle Information', async () => {
      setupMocks(mockUserTransporter, 'transporter');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Vehicle Information'));

      expect(screen.getByText('Maruti Suzuki Swift (White)')).toBeTruthy();

      fireEvent.click(screen.getByText('Edit Vehicle'));

      const vehicleInput = screen.getByDisplayValue('Maruti Suzuki Swift (White)');
      fireEvent.change(vehicleInput, { target: { value: 'Tata Nexon EV (Dark)' } });

      fireEvent.click(screen.getByText('Save Vehicle'));

      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({
          commuteVehicle: 'Tata Nexon EV (Dark)',
        });
      });
    });

    it('should toggle partner availability in Availability Settings', () => {
      setupMocks(mockUserTransporter, 'transporter');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Availability Settings'));

      expect(screen.getByText(/Active & Available for Deliveries/i)).toBeTruthy();
      const toggleBtn = screen.getByText('Go Offline');
      fireEvent.click(toggleBtn);

      expect(mockSetPartnerAvailable).toHaveBeenCalledWith(false);
    });

    it('should calculate gross earnings, 12% commission, and net earnings accurately in INR', () => {
      setupMocks(mockUserTransporter, 'transporter');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Earnings & Payouts'));

      // del-1 compensation is 350 (completed). del-2 is in_transit (not yet completed).
      // Gross = ₹350, 12% commission = ₹42, Net = ₹308
      expect(screen.getByText(/Gross Fares Earned/i)).toBeTruthy();
      expect(screen.getByText(/₹350/i)).toBeTruthy();
      expect(screen.getByText(/Platform Commission \(12%\)/i)).toBeTruthy();
      expect(screen.getByText(/₹42/i)).toBeTruthy();
      expect(screen.getByText(/Net Commuter Payout/i)).toBeTruthy();
      expect(screen.getByText(/₹308/i)).toBeTruthy();
    });
  });

  describe('4. Admin Console Access & Role Switching', () => {
    it('should render Admin Console quick link for privileged users', () => {
      setupMocks(mockUserAdmin, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      const adminBtn = screen.getByText('Admin Console');
      expect(adminBtn).toBeTruthy();

      fireEvent.click(adminBtn);
      expect(mockSetCurrentView).toHaveBeenCalledWith('admin');
    });

    it('should support switching between Requester and Partner view modes', () => {
      setupMocks(mockUserAdmin, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      const partnerViewBtn = screen.getByText('Partner View');
      fireEvent.click(partnerViewBtn);

      expect(mockSetActiveRoleMode).toHaveBeenCalledWith('transporter');
    });

    it('should trigger Back to Dashboard callback', () => {
      setupMocks(mockUserRequester, 'requester');
      render(<AccountView onBack={mockOnBack} />);

      fireEvent.click(screen.getByText('Back to Dashboard'));
      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });
  });
});
