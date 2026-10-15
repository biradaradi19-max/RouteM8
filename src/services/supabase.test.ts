import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSupabaseConfigured,
  fetchDeliveryRequestsFromDb,
  fetchPublishedJourneysFromDb,
  createDeliveryRequestInDb,
  createPublishedJourneyInDb,
  updateDeliveryRequestStatusInDb,
  reviewVerificationRequestInDb,
  mapDbProfileToUserProfile,
  mapDbRequestToDeliveryRequest,
  mapDbJourneyToPublishedJourney,
  isForbiddenProfileUpdate,
  mapSafeProfileUpdatesToDb,
  updateTransporterLocationInDb,
  fetchTransporterLocationFromDb,
  subscribeToTransporterLocation,
  mapDbLocationToTransporterLocation,
} from './supabase';

describe('Route M8 Supabase Service — Security, Error Handling & Empty Dataset Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Unconfigured Backend Resilience (Fail-Safe Checks)', () => {
    it('should reflect unconfigured status in default test environment', () => {
      expect(isSupabaseConfigured).toBe(false);
    });

    it('should fail safely when fetching requests with unconfigured backend', async () => {
      const result = await fetchDeliveryRequestsFromDb();

      expect(result.data).toEqual([]);
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should fail safely when fetching journeys with unconfigured backend', async () => {
      const result = await fetchPublishedJourneysFromDb();

      expect(result.data).toEqual([]);
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should reject request creation and never fabricate records when unconfigured', async () => {
      const result = await createDeliveryRequestInDb({
        title: 'Urgent Lab Sample',
        description: 'Need delivery to Chem Lab',
        category: 'campus-supplies',
        pickupAddress: 'Stanford Medical Center',
        pickupCoords: [37.4328, -122.1742],
        dropoffAddress: 'Sapp Center',
        dropoffCoords: [37.4298, -122.1698],
        itemSize: 'small',
        compensation: 12.0,
        urgency: 'urgent',
        neededBy: '18:00',
        status: 'open',
        requesterId: 'usr-123',
        requesterName: 'Alice Researcher',
        requesterTrustScore: 90,
        handoverPin: '4821',
      });

      expect(result.data).toBeNull();
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should reject journey publication and never fabricate records when unconfigured', async () => {
      const result = await createPublishedJourneyInDb({
        transporterId: 'usr-456',
        transporterName: 'Bob Commuter',
        transporterTrustScore: 85,
        vehicle: 'Prius Prime',
        originAddress: 'Palo Alto',
        originCoords: [37.4419, -122.143],
        destAddress: 'Mountain View',
        destCoords: [37.3861, -122.0839],
        departureTime: '17:30',
        maxDetourMinutes: 10,
        capacity: 'medium',
        isActive: true,
      });

      expect(result.data).toBeNull();
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should reject delivery status updates when unconfigured', async () => {
      const result = await updateDeliveryRequestStatusInDb('req-999', 'completed');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should reject administrative verification reviews when unconfigured', async () => {
      const result = await reviewVerificationRequestInDb('vr-123', 'approved');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Supabase backend is not configured');
    });
  });

  describe('2. Unauthorized Reads & Sensitive Location/PIN Data Protection', () => {
    it('should shield exact addresses and coordinates when details are omitted (unauthorized public read)', () => {
      const publicRow: any = {
        id: 'req-open-1',
        requester_id: 'usr-other',
        title: 'Weekly Farm Box',
        description: 'Fresh organic greens',
        category: 'groceries',
        pickup_area: 'Palo Alto - Farmers Market',
        dropoff_area: 'Mountain View - Castro',
        item_size: 'medium',
        compensation: 18.0,
        urgency: 'standard',
        needed_by: 'Today, 18:30',
        status: 'open',
        created_at: '2026-10-13T10:00:00Z',
        details: null, // RLS masked for non-authorized users
        security: null, // RLS masked for all non-requester users
        requester: {
          full_name: 'David Requester',
          trust_score: 92,
        },
      };

      const mapped = mapDbRequestToDeliveryRequest(publicRow);

      // Verify exact private street addresses are shielded with public corridor area
      expect(mapped.pickupAddress).toBe('Palo Alto - Farmers Market');
      expect(mapped.dropoffAddress).toBe('Mountain View - Castro');
      // Verify handover PIN is completely masked/empty for unauthorized viewer
      expect(mapped.handoverPin).toBe('');
      expect(mapped.requesterName).toBe('David Requester');
      expect(mapped.compensation).toBe(18.0);
    });

    it('should reveal exact addresses to assigned participants while keeping PIN hidden from transporter', () => {
      const assignedRow: any = {
        id: 'req-matched-1',
        requester_id: 'usr-owner',
        transporter_id: 'usr-transporter-me',
        title: 'Hardware Components',
        description: 'Microcontroller pack',
        category: 'electronics',
        item_size: 'small',
        compensation: 22.0,
        urgency: 'urgent',
        needed_by: 'Today, 19:00',
        status: 'matched',
        created_at: '2026-10-13T11:00:00Z',
        details: {
          pickup_address: '450 Jane Stanford Way, Bldg 520, Room 102',
          pickup_lat: 37.4282,
          pickup_lng: -122.1691,
          dropoff_address: '1600 Amphitheatre Pkwy, Bldg 43, Desk 12',
          dropoff_lat: 37.4224,
          dropoff_lng: -122.0844,
          contact_instructions: 'Call on arrival at security gate',
        },
        security: null, // Transporter CANNOT view the handover PIN
        requester: { full_name: 'Alice Stanford', trust_score: 95 },
        transporter: { full_name: 'Bob Transporter', commute_vehicle: 'Nissan Leaf' },
      };

      const mapped = mapDbRequestToDeliveryRequest(assignedRow);

      // Transporter receives exact addresses & coordinates for route execution
      expect(mapped.pickupAddress).toBe('450 Jane Stanford Way, Bldg 520, Room 102');
      expect(mapped.pickupCoords).toEqual([37.4282, -122.1691]);
      expect(mapped.dropoffAddress).toBe('1600 Amphitheatre Pkwy, Bldg 43, Desk 12');
      expect(mapped.dropoffCoords).toEqual([37.4224, -122.0844]);

      // BUT handover PIN remains strictly hidden from the transporter!
      expect(mapped.handoverPin).toBe('');
    });

    it('should reveal handover PIN exclusively to the authorized requester', () => {
      const requesterRow: any = {
        id: 'req-my-request-1',
        requester_id: 'usr-me',
        title: 'Prescription Pickup',
        description: 'Pharmacy refill',
        category: 'pharmacy',
        item_size: 'small',
        compensation: 15.0,
        urgency: 'standard',
        needed_by: 'Today, 21:00',
        status: 'matched',
        created_at: '2026-10-13T11:30:00Z',
        details: {
          pickup_address: 'Walgreens, 4170 El Camino Real',
          pickup_lat: 37.4095,
          pickup_lng: -122.1278,
          dropoff_address: 'Rains Houses, 704 Campus Dr',
          dropoff_lat: 37.426,
          dropoff_lng: -122.158,
        },
        security: {
          handover_pin: '8314', // Returned by RLS only for requester
        },
        requester: { full_name: 'My Profile', trust_score: 98 },
      };

      const mapped = mapDbRequestToDeliveryRequest(requesterRow);

      expect(mapped.handoverPin).toBe('8314');
      expect(mapped.pickupAddress).toBe('Walgreens, 4170 El Camino Real');
    });
  });

  describe('3. Safe Profile Mapping & Role Escalation Prevention', () => {
    it('should sanitize unknown or elevated roles to safe default role "both"', () => {
      const maliciousRow: any = {
        id: 'usr-bad-1',
        email: 'attacker@example.com',
        full_name: 'Privilege Escalation Attempt',
        role: 'super_admin', // client injection
        verification_status: 'unverified',
        account_status: 'active',
        trust_score: 99,
        completed_deliveries: 0,
        completed_commutes: 0,
        rating: 5.0,
      };

      const mapped = mapDbProfileToUserProfile(maliciousRow);
      expect(mapped.role).toBe('both');
    });

    it('should preserve valid standard roles ("requester" or "transporter")', () => {
      const requesterRow: any = {
        id: 'usr-1',
        email: 'req@stanford.edu',
        full_name: 'Sarah Requester',
        role: 'requester',
        verification_status: 'student_verified',
        trust_score: 88,
      };

      const mapped = mapDbProfileToUserProfile(requesterRow);
      expect(mapped.role).toBe('requester');
      expect(mapped.verificationStatus).toBe('student_verified');
    });

    it('should provide safe default trust score (50) if missing or invalid', () => {
      const uncalibratedRow: any = {
        id: 'usr-2',
        email: 'new@example.com',
        full_name: 'New Participant',
        role: 'both',
        trust_score: null,
      };

      const mapped = mapDbProfileToUserProfile(uncalibratedRow);
      expect(mapped.trustScore).toBe(50);
      expect(mapped.completedDeliveries).toBe(0);
      expect(mapped.completedCommutes).toBe(0);
    });
  });

  describe('4. Profile Update Sanitization & Security Guards', () => {
    it('should detect forbidden fields in profile update attempts', () => {
      expect(isForbiddenProfileUpdate({ trustScore: 100 })).toBe(true);
      expect(isForbiddenProfileUpdate({ trust_score: 99 })).toBe(true);
      expect(isForbiddenProfileUpdate({ role: 'admin' })).toBe(true);
      expect(isForbiddenProfileUpdate({ verificationStatus: 'gov_id_verified' })).toBe(true);
      expect(isForbiddenProfileUpdate({ accountStatus: 'active' })).toBe(true);
      expect(isForbiddenProfileUpdate({ completedDeliveries: 50 })).toBe(true);
      expect(isForbiddenProfileUpdate({ id: 'other-user' })).toBe(true);
      expect(isForbiddenProfileUpdate({ email: 'newemail@target.com' })).toBe(true);
    });

    it('should allow legitimate user-editable fields', () => {
      expect(isForbiddenProfileUpdate({ fullName: 'Elena R.' })).toBe(false);
      expect(isForbiddenProfileUpdate({ bio: 'Stanford student commuter' })).toBe(false);
      expect(isForbiddenProfileUpdate({ commuteVehicle: 'Honda Civic' })).toBe(false);
      expect(isForbiddenProfileUpdate({ phone: '+1 650 555 0199' })).toBe(false);
    });

    it('should map safe camelCase fields to snake_case database columns', () => {
      const dbUpdates = mapSafeProfileUpdatesToDb({
        fullName: 'Elena Rostova',
        avatarUrl: 'https://images.unsplash.com/photo-elena',
        organization: 'Stanford University',
        bio: 'Daily commuter between campus and Mountain View.',
        commuteVehicle: 'Volvo EX30',
        phone: '+1 650 555 1234',
      });

      expect(dbUpdates).toEqual({
        full_name: 'Elena Rostova',
        avatar_url: 'https://images.unsplash.com/photo-elena',
        organization: 'Stanford University',
        bio: 'Daily commuter between campus and Mountain View.',
        commute_vehicle: 'Volvo EX30',
        phone: '+1 650 555 1234',
      });
    });
  });

  describe('5. Published Journeys & Corridor Protection', () => {
    it('should accurately map published journey database rows with joined profiles', () => {
      const dbRow: any = {
        id: 'jrn-uuid-1',
        transporter_id: 'usr-uuid-2',
        vehicle: 'Tesla Model Y',
        origin_address: 'Stanford Campus',
        origin_lat: 37.43,
        origin_lng: -122.17,
        dest_address: 'Googleplex',
        dest_lat: 37.422,
        dest_lng: -122.084,
        departure_time: '17:30',
        max_detour_minutes: 12,
        capacity: 'medium',
        recurring_days: ['Mon', 'Wed', 'Fri'],
        is_active: true,
        notes: 'Can carry standard parcels',
        created_at: '2026-10-13T09:00:00Z',
        transporter: {
          full_name: 'Elena Rostova',
          avatar_url: 'https://example.com/elena.jpg',
          trust_score: 98,
        },
      };

      const mapped = mapDbJourneyToPublishedJourney(dbRow);
      expect(mapped.id).toBe('jrn-uuid-1');
      expect(mapped.vehicle).toBe('Tesla Model Y');
      expect(mapped.transporterName).toBe('Elena Rostova');
      expect(mapped.transporterTrustScore).toBe(98);
      expect(mapped.maxDetourMinutes).toBe(12);
      expect(mapped.recurringDays).toEqual(['Mon', 'Wed', 'Fri']);
    });
  });

  describe('6. Transporter Live Location Tracking & Realtime Updates', () => {
    it('should fail safely when updating location with unconfigured backend', async () => {
      const result = await updateTransporterLocationInDb('del-123', {
        latitude: 37.4275,
        longitude: -122.1668,
        heading: 90,
        speed: 12.5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should fail safely when fetching location with unconfigured backend', async () => {
      const result = await fetchTransporterLocationFromDb('del-123');

      expect(result.data).toBeNull();
      expect(result.error).toContain('Supabase backend is not configured');
    });

    it('should accurately map database location row to application model', () => {
      const dbLocation = {
        delivery_id: 'del-uuid-456',
        transporter_id: 'usr-uuid-789',
        latitude: 37.4419,
        longitude: -122.143,
        heading: 180.5,
        speed: 15.2,
        updated_at: '2026-10-15T08:30:00Z',
      };

      const mapped = mapDbLocationToTransporterLocation(dbLocation);
      expect(mapped.deliveryId).toBe('del-uuid-456');
      expect(mapped.transporterId).toBe('usr-uuid-789');
      expect(mapped.latitude).toBe(37.4419);
      expect(mapped.longitude).toBe(-122.143);
      expect(mapped.heading).toBe(180.5);
      expect(mapped.speed).toBe(15.2);
      expect(mapped.updatedAt).toBe('2026-10-15T08:30:00Z');
    });

    it('should handle location subscription without crashing when unconfigured', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToTransporterLocation('del-123', callback);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(callback).not.toHaveBeenCalled();
    });

    it('should invoke RPC update when client is provided and report success', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, delivery_id: 'del-123' },
        error: null,
      });

      const mockClient = {
        rpc: mockRpc,
      } as any;

      const result = await updateTransporterLocationInDb('del-123', {
        latitude: 37.4275,
        longitude: -122.1668,
      }, mockClient);

      expect(mockRpc).toHaveBeenCalledWith('update_transporter_location', {
        p_delivery_id: 'del-123',
        p_latitude: 37.4275,
        p_longitude: -122.1668,
        p_heading: null,
        p_speed: null,
      });
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });
  });
});

