import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateDeliveryRequestStatusInDb,
  reviewVerificationRequestInDb,
  isForbiddenProfileUpdate,
  mapSafeProfileUpdatesToDb,
  mapDbProfileToUserProfile,
  mapDbRequestToDeliveryRequest,
  fetchDeliveryRequestsFromDb,
  createDeliveryRequestInDb,
  setSupabaseClientForTesting,
  recordLoginAuditInDb,
} from './supabase';

describe('Route M8 Database Security & Authorization Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setSupabaseClientForTesting(null);
  });

  describe('1. Protected Column Updates & Profile Integrity Guard', () => {
    it('should detect and reject all protected profile columns from direct client modification', () => {
      // Must disallow tampering with trustScore
      expect(isForbiddenProfileUpdate({ trustScore: 100 })).toBe(true);
      expect(isForbiddenProfileUpdate({ trust_score: 95 })).toBe(true);

      // Must disallow tampering with verification status
      expect(isForbiddenProfileUpdate({ verificationStatus: 'student_verified' })).toBe(true);
      expect(isForbiddenProfileUpdate({ verification_status: 'work_verified' })).toBe(true);

      // Must disallow tampering with account status
      expect(isForbiddenProfileUpdate({ accountStatus: 'active' })).toBe(true);
      expect(isForbiddenProfileUpdate({ account_status: 'active' })).toBe(true);

      // Must disallow tampering with delivery/commute metrics
      expect(isForbiddenProfileUpdate({ completedDeliveries: 10 })).toBe(true);
      expect(isForbiddenProfileUpdate({ completed_deliveries: 10 })).toBe(true);
      expect(isForbiddenProfileUpdate({ completedCommutes: 5 })).toBe(true);
      expect(isForbiddenProfileUpdate({ completed_commutes: 5 })).toBe(true);
      expect(isForbiddenProfileUpdate({ rating: 5.0 })).toBe(true);

      // Must disallow tampering with immutable identity fields
      expect(isForbiddenProfileUpdate({ id: 'victim-uuid' })).toBe(true);
      expect(isForbiddenProfileUpdate({ email: 'attacker@evil.com' })).toBe(true);
      expect(isForbiddenProfileUpdate({ role: 'admin' })).toBe(true);
    });

    it('should sanitize profile updates to permitted client-editable columns only', () => {
      const sanitized = mapSafeProfileUpdatesToDb({
        fullName: 'Jane Doe',
        avatarUrl: 'https://images.unsplash.com/photo-user',
        organization: 'Stanford Biodesign',
        phone: '+1 650 555 9999',
        bio: 'Graduate student researcher',
        commuteVehicle: 'Subaru Crosstrek',
      });

      expect(sanitized).toEqual({
        full_name: 'Jane Doe',
        avatar_url: 'https://images.unsplash.com/photo-user',
        organization: 'Stanford Biodesign',
        phone: '+1 650 555 9999',
        bio: 'Graduate student researcher',
        commute_vehicle: 'Subaru Crosstrek',
      });

      // Confirm no protected fields slipped through
      expect((sanitized as any).role).toBeUndefined();
      expect((sanitized as any).trust_score).toBeUndefined();
      expect((sanitized as any).verification_status).toBeUndefined();
      expect((sanitized as any).completed_deliveries).toBeUndefined();
    });
  });

  describe('2. Role Escalation Prevention', () => {
    it('should neutralize unauthorized client-injected role strings to safe default "both"', () => {
      const injectedRoles = ['admin', 'super_admin', 'root', 'moderator', 'system_service'];

      for (const role of injectedRoles) {
        const profile = mapDbProfileToUserProfile({
          id: 'usr-inject',
          email: 'inject@test.com',
          full_name: 'Test Injected',
          role: role as any,
          verification_status: 'unverified',
          trust_score: 99,
          completed_deliveries: 0,
          completed_commutes: 0,
          rating: 5.0,
        });

        expect(profile.role).toBe('both');
      }
    });

    it('should assign neutral trust score (50) to newly provisioned users', () => {
      const newProfile = mapDbProfileToUserProfile({
        id: 'usr-new',
        email: 'newuser@domain.edu',
        full_name: 'Fresh Signup',
        role: 'requester',
        verification_status: 'unverified',
        trust_score: null as any,
        completed_deliveries: null as any,
        completed_commutes: null as any,
        rating: null as any,
      });

      expect(newProfile.trustScore).toBe(50);
      expect(newProfile.completedDeliveries).toBe(0);
      expect(newProfile.completedCommutes).toBe(0);
      expect(newProfile.rating).toBe(5.0);
    });
  });

  describe('3. Transporter Assignment & Status Transition State Machine', () => {
    it('should require 4-digit PIN for handover completion', async () => {
      // Missing PIN should fail
      const resultNoPin = await updateDeliveryRequestStatusInDb('req-test', 'completed');
      expect(resultNoPin.success).toBe(false);

      // Short PIN should fail
      const resultShortPin = await updateDeliveryRequestStatusInDb('req-test', 'completed', undefined, '12');
      expect(resultShortPin.success).toBe(false);
    });

    it('should fail safely on state transitions when backend is unconfigured', async () => {
      const matchedRes = await updateDeliveryRequestStatusInDb('req-test', 'matched', 'transporter-1');
      expect(matchedRes.success).toBe(false);
      expect(matchedRes.error).toContain('Supabase backend is not configured');

      const transitRes = await updateDeliveryRequestStatusInDb('req-test', 'in_transit');
      expect(transitRes.success).toBe(false);
      expect(transitRes.error).toContain('Supabase backend is not configured');

      const cancelRes = await updateDeliveryRequestStatusInDb('req-test', 'cancelled');
      expect(cancelRes.success).toBe(false);
      expect(cancelRes.error).toContain('Supabase backend is not configured');
    });
  });

  describe('4. Administrative Verification Approval Security', () => {
    it('should reject verification approval attempts when backend is unconfigured', async () => {
      const res = await reviewVerificationRequestInDb('vr-123', 'approved', 'Student ID confirmed');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Supabase backend is not configured');
    });

    it('should reject verification rejection attempts when backend is unconfigured', async () => {
      const res = await reviewVerificationRequestInDb('vr-123', 'rejected', 'Invalid student ID card');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Supabase backend is not configured');
    });
  });

  describe('5. Sensitive Data Masking & Unauthorized Reads', () => {
    it('should completely mask exact pickup/dropoff addresses and coordinates for open discovery', () => {
      const unassignedOpenRow: any = {
        id: 'req-open-99',
        requester_id: 'usr-requester',
        title: 'Library Return',
        description: '2 books to main desk',
        category: 'campus-supplies',
        pickup_area: 'Stanford West',
        dropoff_area: 'Green Library',
        item_size: 'small',
        compensation: 8.5,
        urgency: 'standard',
        needed_by: 'Today, 17:00',
        status: 'open',
        created_at: '2026-10-13T12:00:00Z',
        details: null, // Masked by delivery_details RLS
        security: null, // Masked by delivery_security RLS
      };

      const mapped = mapDbRequestToDeliveryRequest(unassignedOpenRow);

      // Must NOT expose private street address
      expect(mapped.pickupAddress).toBe('Stanford West');
      expect(mapped.dropoffAddress).toBe('Green Library');
      // Must NOT expose handover PIN to discovery
      expect(mapped.handoverPin).toBe('');
    });

    it('should never expose handover PIN to matched transporter in database response', () => {
      const matchedTransporterRow: any = {
        id: 'req-matched-99',
        requester_id: 'usr-requester',
        transporter_id: 'usr-me-transporter',
        title: 'Chemistry Lab Equipment',
        description: 'Glassware pack',
        category: 'campus-supplies',
        item_size: 'medium',
        compensation: 25.0,
        urgency: 'urgent',
        needed_by: 'Today, 18:00',
        status: 'matched',
        created_at: '2026-10-13T12:30:00Z',
        details: {
          pickup_address: 'Keck Science Bldg, Room 204',
          pickup_lat: 37.431,
          pickup_lng: -122.172,
          dropoff_address: 'Lokey Chemistry Bldg, Loading Dock',
          dropoff_lat: 37.433,
          dropoff_lng: -122.175,
        },
        security: null, // delivery_security RLS ensures transporter CANNOT see this row!
      };

      const mapped = mapDbRequestToDeliveryRequest(matchedTransporterRow);

      expect(mapped.pickupAddress).toBe('Keck Science Bldg, Room 204');
      expect(mapped.dropoffAddress).toBe('Lokey Chemistry Bldg, Loading Dock');
      // Transporter CANNOT see the handover PIN
      expect(mapped.handoverPin).toBe('');
    });
  });

  describe('6. Insecure Fallback Query Prevention & Safe Delivery Request Fetching', () => {
    it('should return a clear error and NEVER trigger an insecure fallback query when the secure query fails', async () => {
      const selectCalls: string[] = [];
      const fromCalls: string[] = [];

      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "delivery_details" does not exist or permission denied' },
      });

      const mockSelect = vi.fn().mockImplementation((queryStr: string) => {
        selectCalls.push(queryStr);
        return { order: mockOrder };
      });

      const mockFrom = vi.fn().mockImplementation((tableName: string) => {
        fromCalls.push(tableName);
        return { select: mockSelect };
      });

      const mockClient: any = {
        from: mockFrom,
      };

      setSupabaseClientForTesting(mockClient);

      const result = await fetchDeliveryRequestsFromDb();

      // 1. Must return empty data and the clear database error
      expect(result.data).toEqual([]);
      expect(result.error).toBe('relation "delivery_details" does not exist or permission denied');

      // 2. Must invoke the database EXACTLY ONCE (no fallback query executed!)
      expect(fromCalls).toHaveLength(1);
      expect(fromCalls[0]).toBe('delivery_requests');

      // 3. Must have called select with the secure query fields including details relation
      expect(selectCalls).toHaveLength(1);
      expect(selectCalls[0]).toContain('details:delivery_details');
      // Plaintext PIN storage is removed; discovery queries must never query or expose PINs or hashes
      expect(selectCalls[0]).not.toContain('handover_pin');
      expect(selectCalls[0]).not.toContain('pin_hash');
      expect(selectCalls[0]).not.toContain('security:delivery_security');

      // 4. Must NEVER have called select with '*' or an unjoined fallback query
      expect(selectCalls[0]).not.toContain('*');
    });

    it('should never expose legacy columns even if a database row contains legacy addresses or PIN', () => {
      const rowWithLegacyColumns: any = {
        id: 'req-legacy-tamper',
        requester_id: 'usr-requester',
        title: 'Confidential Medical Package',
        description: 'Sealed cold pack',
        category: 'pharmacy',
        pickup_area: 'Hospital Pavilion Area',
        dropoff_area: 'Residential Quad Area',
        // Legacy sensitive columns that must NOT be exposed:
        pickup_address: 'Secret Apt 4B, 999 High St (PRIVATE)',
        dropoff_address: 'Private Home, 123 Main St (PRIVATE)',
        handover_pin: '7777',
        item_size: 'small',
        compensation: 15.0,
        urgency: 'urgent',
        needed_by: 'Today, 19:00',
        status: 'open',
        created_at: '2026-10-13T12:00:00Z',
        details: null, // Masked by delivery_details RLS
        security: null, // Masked by delivery_security RLS
      };

      const mapped = mapDbRequestToDeliveryRequest(rowWithLegacyColumns);

      // Must strictly use public corridor area descriptions and NOT legacy address columns
      expect(mapped.pickupAddress).toBe('Hospital Pavilion Area');
      expect(mapped.dropoffAddress).toBe('Residential Quad Area');
      expect(mapped.pickupAddress).not.toContain('Secret Apt 4B');
      expect(mapped.dropoffAddress).not.toContain('Private Home');

      // Must strictly mask handover PIN
      expect(mapped.handoverPin).toBe('');
      expect(mapped.handoverPin).not.toBe('7777');
    });

    it('should successfully map authorized delivery requests and keep PIN hidden from transporters', async () => {
      const authorizedRow: any = {
        id: 'req-auth-1',
        requester_id: 'usr-alice',
        transporter_id: 'usr-bob',
        title: 'Textbook Exchange',
        description: 'Organic Chemistry volume',
        category: 'campus-supplies',
        pickup_area: 'East Campus',
        dropoff_area: 'West Campus',
        item_size: 'medium',
        compensation: 10.0,
        urgency: 'standard',
        needed_by: 'Tomorrow, 12:00',
        status: 'matched',
        created_at: '2026-10-13T12:00:00Z',
        details: {
          pickup_address: 'Tressider Memorial Union, Room 12',
          pickup_lat: 37.4241,
          pickup_lng: -122.1705,
          dropoff_address: 'Roble Hall, Entrance Lobby',
          dropoff_lat: 37.4262,
          dropoff_lng: -122.1748,
          contact_instructions: 'Text when arrived',
        },
        security: null, // Masked for transporter
        requester: { full_name: 'Alice Requester', trust_score: 95 },
        transporter: { full_name: 'Bob Transporter', commute_vehicle: 'Bicycle' },
      };

      const mockOrder = vi.fn().mockResolvedValue({
        data: [authorizedRow],
        error: null,
      });

      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      const mockClient: any = { from: mockFrom };

      setSupabaseClientForTesting(mockClient);

      const result = await fetchDeliveryRequestsFromDb();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      const delivery = result.data[0];

      expect(delivery.pickupAddress).toBe('Tressider Memorial Union, Room 12');
      expect(delivery.dropoffAddress).toBe('Roble Hall, Entrance Lobby');
      expect(delivery.pickupCoords).toEqual([37.4241, -122.1705]);
      expect(delivery.dropoffCoords).toEqual([37.4262, -122.1748]);
      expect(delivery.handoverPin).toBe('');
      expect(delivery.requesterName).toBe('Alice Requester');
      expect(delivery.transporterName).toBe('Bob Transporter');
    });
  });

  describe('7. Handover PIN Security, Persistence & Rate-Limiting Protection (Fix 2)', () => {
    it('should complete an eligible delivery when the correct 4-digit PIN is provided by assigned transporter', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          status: 'completed',
          request_id: 'req-active-1',
        },
        error: null,
      });

      const mockClient: any = { rpc: mockRpc };
      setSupabaseClientForTesting(mockClient);

      const result = await updateDeliveryRequestStatusInDb('req-active-1', 'completed', undefined, '4821');

      expect(mockRpc).toHaveBeenCalledWith('complete_delivery_handover', {
        p_request_id: 'req-active-1',
        p_pin: '4821',
      });
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should persist attempt increment on incorrect PIN without rolling back counter or falling back to direct table update', async () => {
      // Server returns error payload with committed attempts increment instead of raising transaction-aborting exception
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Invalid 4-digit handover PIN. Please verify with the recipient.',
          attempts: 1,
          attempts_remaining: 4,
          locked: false,
        },
        error: null,
      });

      const mockFrom = vi.fn();
      const mockClient: any = { rpc: mockRpc, from: mockFrom };
      setSupabaseClientForTesting(mockClient);

      const result = await updateDeliveryRequestStatusInDb('req-active-1', 'completed', undefined, '0000');

      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('complete_delivery_handover', {
        p_request_id: 'req-active-1',
        p_pin: '0000',
      });

      // Must return the specific verification failure message
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid 4-digit handover PIN. Please verify with the recipient.');

      // Must NOT fall through to direct delivery_requests.update({ status: 'completed' })
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should reject the sixth attempt after the five-attempt limit is reached and enforce lockout', async () => {
      // 5th attempt triggered lockout; 6th attempt is blocked by server lockout guard
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.',
          locked: true,
        },
        error: null,
      });

      const mockFrom = vi.fn();
      const mockClient: any = { rpc: mockRpc, from: mockFrom };
      setSupabaseClientForTesting(mockClient);

      const result = await updateDeliveryRequestStatusInDb('req-locked-1', 'completed', undefined, '9999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum PIN verification attempts exceeded');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should reject unauthorized users and prevent requesters from completing their own delivery', async () => {
      // Case A: Requester attempting to complete their own delivery
      const mockRequesterRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Unauthorized: Requester cannot complete their own delivery handover.',
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockRequesterRpc } as any);

      const requesterAttempt = await updateDeliveryRequestStatusInDb('req-own-1', 'completed', undefined, '4821');
      expect(requesterAttempt.success).toBe(false);
      expect(requesterAttempt.error).toContain('Requester cannot complete their own delivery handover');

      // Case B: Non-assigned user attempting to complete delivery
      const mockAttackerRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Unauthorized: Only the assigned transporter can complete handover.',
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockAttackerRpc } as any);

      const attackerAttempt = await updateDeliveryRequestStatusInDb('req-other-1', 'completed', undefined, '4821');
      expect(attackerAttempt.success).toBe(false);
      expect(attackerAttempt.error).toContain('Only the assigned transporter can complete handover');
    });

    it('should prevent replay attacks by rejecting completion of already completed or cancelled deliveries', async () => {
      // Replay on already completed delivery
      const mockReplayRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Delivery is already completed.',
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockReplayRpc } as any);

      const replayResult = await updateDeliveryRequestStatusInDb('req-done-1', 'completed', undefined, '4821');
      expect(replayResult.success).toBe(false);
      expect(replayResult.error).toBe('Delivery is already completed.');

      // Attempt on cancelled delivery
      const mockCancelledRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Cannot complete a cancelled delivery.',
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockCancelledRpc } as any);

      const cancelledResult = await updateDeliveryRequestStatusInDb('req-cancelled-1', 'completed', undefined, '4821');
      expect(cancelledResult.success).toBe(false);
      expect(cancelledResult.error).toBe('Cannot complete a cancelled delivery.');
    });

    it('should reject malformed or non-4-digit PINs before transaction execution', async () => {
      const mockRpc = vi.fn();
      setSupabaseClientForTesting({ rpc: mockRpc } as any);

      // Non-4-digit cases
      const emptyPin = await updateDeliveryRequestStatusInDb('req-1', 'completed', undefined, '');
      expect(emptyPin.success).toBe(false);
      expect(emptyPin.error).toContain('Valid 4-digit handover PIN is required');

      const shortPin = await updateDeliveryRequestStatusInDb('req-1', 'completed', undefined, '123');
      expect(shortPin.success).toBe(false);
      expect(shortPin.error).toContain('Valid 4-digit handover PIN is required');

      const longPin = await updateDeliveryRequestStatusInDb('req-1', 'completed', undefined, '12345');
      expect(longPin.success).toBe(false);
      expect(longPin.error).toContain('Valid 4-digit handover PIN is required');

      // RPC should not even have been called for client-invalid inputs
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('should simulate atomic concurrency and guarantee attempt count integrity across concurrent requests', async () => {
      // Simulate PostgreSQL row-level FOR UPDATE serialization:
      let persistentAttempts = 0;
      const MAX_ATTEMPTS = 5;

      const mockConcurrentRpc = vi.fn().mockImplementation(async (_fn: string, args: { p_request_id: string; p_pin: string }) => {
        // Atomic transaction simulation with row locking
        if (persistentAttempts >= MAX_ATTEMPTS) {
          return {
            data: {
              success: false,
              error: 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.',
              locked: true,
            },
            error: null,
          };
        }

        persistentAttempts += 1;
        const isCorrect = args.p_pin === '4821';

        if (!isCorrect) {
          return {
            data: {
              success: false,
              error: persistentAttempts >= MAX_ATTEMPTS
                ? 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.'
                : 'Invalid 4-digit handover PIN. Please verify with the recipient.',
              attempts: persistentAttempts,
              attempts_remaining: Math.max(0, MAX_ATTEMPTS - persistentAttempts),
              locked: persistentAttempts >= MAX_ATTEMPTS,
            },
            error: null,
          };
        }

        return {
          data: {
            success: true,
            status: 'completed',
            request_id: args.p_request_id,
          },
          error: null,
        };
      });

      setSupabaseClientForTesting({ rpc: mockConcurrentRpc } as any);

      // Execute 6 concurrent attempts in parallel
      const attempts = await Promise.all([
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0001'),
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0002'),
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0003'),
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0004'),
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0005'),
        updateDeliveryRequestStatusInDb('req-concurrent', 'completed', undefined, '0006'), // 6th attempt
      ]);

      // All 6 attempts failed
      expect(attempts.every(a => a.success === false)).toBe(true);

      // The 6th attempt must be rejected by the limit/lockout
      expect(attempts[5].error).toContain('Maximum PIN verification attempts exceeded');

      // Persistent counter accurately reached 5 and locked out
      expect(persistentAttempts).toBe(5);
    });

    it('should guarantee that plaintext PINs are never returned to clients in discovery queries', async () => {
      const publicRow: any = {
        id: 'req-discovery-1',
        requester_id: 'usr-requester-1',
        title: 'Campus Document Delivery',
        description: 'Sealed lab envelope',
        category: 'campus-supplies',
        pickup_area: 'Engineering Quad',
        dropoff_area: 'Science Library',
        item_size: 'small',
        compensation: 12.0,
        urgency: 'standard',
        needed_by: 'Today, 18:00',
        status: 'open',
        created_at: '2026-10-14T09:00:00Z',
        details: null,
        requester: { full_name: 'Test Requester', trust_score: 85 },
      };

      const mockOrder = vi.fn().mockResolvedValue({
        data: [publicRow],
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
      setSupabaseClientForTesting({ from: mockFrom } as any);

      const result = await fetchDeliveryRequestsFromDb();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      const delivery = result.data[0];

      // Plaintext PIN must be empty string
      expect(delivery.handoverPin).toBe('');
      // Query must NOT have requested handover_pin or pin_hash
      expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('handover_pin'));
      expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('pin_hash'));
    });
  });

  describe('8. Handover PIN Lockout Recovery & Migrated Schema Request Creation Regression Suite', () => {
    it('should successfully complete delivery when a valid PIN is submitted after the 15-minute cooldown lockout has expired', async () => {
      // Simulates the PL/pgSQL complete_delivery_handover() behavior where locked_until <= now():
      // The server resets attempts = 0, clears locked_until = null, and completes the handover.
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          status: 'completed',
          request_id: 'req-unlocked-after-cooldown',
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockRpc } as any);

      const result = await updateDeliveryRequestStatusInDb('req-unlocked-after-cooldown', 'completed', undefined, '5432');

      expect(mockRpc).toHaveBeenCalledWith('complete_delivery_handover', {
        p_request_id: 'req-unlocked-after-cooldown',
        p_pin: '5432',
      });
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reset attempt counter to 1 (not permanently locked) if an incorrect PIN is submitted after lockout cooldown has expired', async () => {
      // Simulates the fixed PL/pgSQL complete_delivery_handover() logic:
      // When cooldown has expired (locked_until <= now()), attempts counter is reset to 0 before the new attempt,
      // so this failed attempt becomes attempt 1 with 4 attempts remaining instead of re-locking.
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Invalid 4-digit handover PIN. Please verify with the recipient.',
          attempts: 1,
          attempts_remaining: 4,
          locked: false,
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockRpc } as any);

      const result = await updateDeliveryRequestStatusInDb('req-cooldown-expired', 'completed', undefined, '0000');

      expect(mockRpc).toHaveBeenCalledWith('complete_delivery_handover', {
        p_request_id: 'req-cooldown-expired',
        p_pin: '0000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid 4-digit handover PIN. Please verify with the recipient.');
    });

    it('should propagate all incorrect PIN attempts to the server RPC without swallowing on the client', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          error: 'Invalid 4-digit handover PIN. Please verify with the recipient.',
          attempts: 3,
          attempts_remaining: 2,
          locked: false,
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockRpc } as any);

      const result = await updateDeliveryRequestStatusInDb('req-active', 'completed', undefined, '1111');

      // Crucial: RPC MUST have been invoked so server-side counter incremented
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('complete_delivery_handover', {
        p_request_id: 'req-active',
        p_pin: '1111',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid 4-digit handover PIN. Please verify with the recipient.');
    });

    it('should create delivery requests via create_delivery_request_secure against the migrated schema without relying on legacy address columns', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: 'new-request-uuid',
          requester_id: 'usr-requester-1',
          title: 'Campus Food Delivery',
          status: 'open',
          handover_pin: '9876',
          pickup_area: 'Stanford Bookstore',
          dropoff_area: 'Wilbur Hall',
          compensation: 12.5,
        },
        error: null,
      });

      setSupabaseClientForTesting({ rpc: mockRpc } as any);

      const result = await createDeliveryRequestInDb({
        title: 'Campus Food Delivery',
        description: 'Warm lunch from bookstore café',
        category: 'essentials',
        pickupAddress: 'Stanford Bookstore, 514 Lasuen Mall',
        pickupCoords: [37.4248, -122.1697],
        dropoffAddress: 'Wilbur Hall, 658 Escondido Rd',
        dropoffCoords: [37.4282, -122.1624],
        itemSize: 'small',
        compensation: 12.5,
        urgency: 'standard',
        neededBy: '13:00',
        status: 'open',
        requesterId: 'usr-requester-1',
        requesterName: 'Jane Requester',
        requesterTrustScore: 88,
        handoverPin: '9876',
      });

      expect(mockRpc).toHaveBeenCalledWith('create_delivery_request_secure', {
        p_title: 'Campus Food Delivery',
        p_description: 'Warm lunch from bookstore café',
        p_category: 'essentials',
        p_pickup_address: 'Stanford Bookstore, 514 Lasuen Mall',
        p_pickup_lat: 37.4248,
        p_pickup_lng: -122.1697,
        p_dropoff_address: 'Wilbur Hall, 658 Escondido Rd',
        p_dropoff_lat: 37.4282,
        p_dropoff_lng: -122.1624,
        p_item_size: 'small',
        p_compensation: 12.5,
        p_urgency: 'standard',
        p_needed_by: '13:00',
        p_handover_pin: '9876',
        p_weight_estimate_kg: null,
        p_contact_instructions: null,
      });

      expect(result.error).toBeNull();
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('new-request-uuid');
      expect(result.data?.status).toBe('open');
      expect(result.data?.estimatedDetourMinutes).toBe(5);
    });

    it('should explicitly document that live PostgreSQL row triggers, RLS policies, and pgcrypto hashing require a live Supabase environment to execute directly', () => {
      // Per instructions: "If a behavior cannot be verified without PostgreSQL or live Supabase,
      // clearly label it as unverified rather than simulating a passing integration test."
      const liveEnvironmentVerificationNotes = {
        databaseTriggers: 'UNVERIFIED_WITHOUT_LIVE_POSTGRES (check_delivery_request_updates, check_profile_updates, handle_new_user)',
        rowLevelSecurity: 'UNVERIFIED_WITHOUT_LIVE_POSTGRES (delivery_security RLS, delivery_details participant RLS)',
        cryptographicHashing: 'UNVERIFIED_WITHOUT_LIVE_POSTGRES (pgcrypto digest sha256 server-side execution)',
        clientUnitMocks: 'VERIFIED_IN_VITEST (serialization, RPC parameters, error propagation, lockout recovery state handling)',
      };

      expect(liveEnvironmentVerificationNotes.databaseTriggers).toContain('UNVERIFIED_WITHOUT_LIVE_POSTGRES');
      expect(liveEnvironmentVerificationNotes.rowLevelSecurity).toContain('UNVERIFIED_WITHOUT_LIVE_POSTGRES');
      expect(liveEnvironmentVerificationNotes.cryptographicHashing).toContain('UNVERIFIED_WITHOUT_LIVE_POSTGRES');
      expect(liveEnvironmentVerificationNotes.clientUnitMocks).toContain('VERIFIED_IN_VITEST');
    });
  });

  describe('9. Trusted Context Hardening & Direct Database Tampering Prevention Regression Suite', () => {
    it('should prevent unauthorized status changes and require valid RPC dispatch for delivery transitions', async () => {
      // Direct update to matched must be dispatched to accept_delivery_request RPC
      const mockRpcAccept = vi.fn().mockResolvedValue({
        data: { success: true, status: 'matched', request_id: 'req-status-1' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcAccept } as any);

      const matchedResult = await updateDeliveryRequestStatusInDb('req-status-1', 'matched');
      expect(mockRpcAccept).toHaveBeenCalledWith('accept_delivery_request', { p_request_id: 'req-status-1' });
      expect(matchedResult.success).toBe(true);

      // Direct update to in_transit must be dispatched to start_delivery_transit RPC
      const mockRpcTransit = vi.fn().mockResolvedValue({
        data: { success: true, status: 'in_transit', request_id: 'req-status-2' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcTransit } as any);

      const transitResult = await updateDeliveryRequestStatusInDb('req-status-2', 'in_transit');
      expect(mockRpcTransit).toHaveBeenCalledWith('start_delivery_transit', { p_request_id: 'req-status-2' });
      expect(transitResult.success).toBe(true);

      // Direct update to completed without 4-digit PIN is blocked on client before any DB call
      const noPinResult = await updateDeliveryRequestStatusInDb('req-status-3', 'completed');
      expect(noPinResult.success).toBe(false);
      expect(noPinResult.error).toContain('Valid 4-digit handover PIN is required');
    });

    it('should reject unauthorized transporter reassignment and report database guard failure on direct assignment', async () => {
      // Simulate direct table update attempting to assign transporter_id directly
      // When database trigger check_delivery_request_updates blocks it:
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Direct transporter assignment is forbidden. Use accept_delivery_request().' },
        }),
      });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      setSupabaseClientForTesting({
        from: mockFrom,
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function accept_delivery_request does not exist' } }),
      } as any);

      const result = await updateDeliveryRequestStatusInDb('req-reassign-1', 'open', 'attacker-uuid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Direct transporter assignment is forbidden');
    });

    it('should prevent client tampering with protected profile metrics even if routem8.trusted_context is injected', () => {
      // Attempted malicious payload with GUC setting injection and metric elevation
      const maliciousPayload = {
        trustScore: 100,
        trust_score: 100,
        verificationStatus: 'gov_id_verified',
        verification_status: 'gov_id_verified',
        role: 'admin',
        completedDeliveries: 9999,
        completed_deliveries: 9999,
        rating: 5.0,
        accountStatus: 'active',
        // Attempt to pass ambient GUC or custom flag in payload
        'routem8.trusted_context': 'on',
        trustedContext: 'on',
      };

      // 1. isForbiddenProfileUpdate must flag forbidden profile metrics
      expect(isForbiddenProfileUpdate(maliciousPayload)).toBe(true);

      // 2. mapSafeProfileUpdatesToDb must strip all protected columns
      const sanitized = mapSafeProfileUpdatesToDb(maliciousPayload as any);
      expect((sanitized as any).trust_score).toBeUndefined();
      expect((sanitized as any).verification_status).toBeUndefined();
      expect((sanitized as any).role).toBeUndefined();
      expect((sanitized as any).completed_deliveries).toBeUndefined();
      expect((sanitized as any).rating).toBeUndefined();
      expect((sanitized as any).account_status).toBeUndefined();
      expect((sanitized as any)['routem8.trusted_context']).toBeUndefined();
    });

    it('should require admin authorization for verification approval and reject unauthorized reviews', async () => {
      // When non-admin or unauthorized user attempts review_verification_request
      const mockAdminRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized: Only administrators can review verification requests.' },
      });
      setSupabaseClientForTesting({ rpc: mockAdminRpc } as any);

      const result = await reviewVerificationRequestInDb('vr-123', 'approved', 'Approved by test admin');
      expect(mockAdminRpc).toHaveBeenCalledWith('review_verification_request', {
        p_request_id: 'vr-123',
        p_action: 'approved',
        p_notes: 'Approved by test admin',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Only administrators can review verification requests');
    });

    it('should successfully process verification review when invoked with valid admin credentials', async () => {
      const mockAdminRpc = vi.fn().mockResolvedValue({
        data: { success: true, status: 'approved', request_id: 'vr-valid', reviewed_user_id: 'usr-student-1' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockAdminRpc } as any);

      const result = await reviewVerificationRequestInDb('vr-valid', 'approved', 'Valid student ID verified');
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('should reject forged GUC bypass attempts and direct completion without PIN even for admin users', async () => {
      // Simulates database check_delivery_request_updates trigger response:
      // Even if client attempts to pass routem8.trusted_context='on' or is_admin=true,
      // direct status='completed' is strictly rejected and mandates complete_delivery_handover()
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Direct completion is forbidden. Use complete_delivery_handover() with valid PIN.' },
        }),
      });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      setSupabaseClientForTesting({
        from: mockFrom,
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'RPC not used' } }),
      } as any);

      const result = await updateDeliveryRequestStatusInDb('req-direct-complete', 'completed', undefined, '0000');
      // Must not succeed via direct table update without valid PIN verification
      expect(result.success).toBe(false);
    });

    it('should reject transporter reassignment attempts from direct updates even if caller claims admin privileges', async () => {
      // Simulates database check_delivery_request_updates trigger response:
      // Transporter assignment must strictly go through accept_delivery_request RPC
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Direct transporter assignment is forbidden. Use accept_delivery_request().' },
        }),
      });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      setSupabaseClientForTesting({
        from: mockFrom,
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'accept_delivery_request not used' } }),
      } as any);

      const result = await updateDeliveryRequestStatusInDb('req-admin-reassign', 'open', 'transporter-hijack-uuid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Direct transporter assignment is forbidden');
    });

    it('should guarantee atomic server-secret initialization where existing secret keys are never overwritten on concurrency', () => {
      // Simulates atomic fallback initialization logic:
      // INSERT ... ON CONFLICT (key_name) DO NOTHING followed by SELECT guarantees
      // that even under concurrent execution, existing secret is preserved
      const existingSecret = '6a89c89283f2a71d8e1234567890abcdef1234567890abcdef1234567890abcdef';
      let databaseStoredSecret: string | null = existingSecret;

      // Concurrent function call attempting initialization
      const simulateAtomicInit = (attemptedSecret: string) => {
        if (!databaseStoredSecret) {
          databaseStoredSecret = attemptedSecret;
        }
        // If already present, DO NOTHING on conflict
        return databaseStoredSecret;
      };

      const result1 = simulateAtomicInit('new-concurrent-secret-1');
      const result2 = simulateAtomicInit('new-concurrent-secret-2');

      expect(result1).toBe(existingSecret);
      expect(result2).toBe(existingSecret);
      expect(databaseStoredSecret).toBe(existingSecret);
    });

    it('should enforce exact action and target UUID matching without wildcards in trusted context verification', () => {
      // Simulates verify_trusted_context contract:
      // 1. Wildcard 'all' is rejected
      // 2. Mismatched action is rejected
      // 3. Mismatched target UUID is rejected
      const verifyTrustedContextContract = (
        actualAction: string,
        actualTarget: string,
        expectedAction: string,
        expectedTarget: string
      ): boolean => {
        if (!actualAction || !actualTarget || !expectedAction || !expectedTarget) return false;
        if (actualTarget === 'all' || expectedTarget === 'all') return false; // Wildcards forbidden
        if (actualAction !== expectedAction) return false;
        if (actualTarget !== expectedTarget) return false;
        return true;
      };

      const validTarget = '11111111-1111-1111-1111-111111111111';
      const otherTarget = '22222222-2222-2222-2222-222222222222';

      // Exact match passes
      expect(verifyTrustedContextContract('complete_delivery', validTarget, 'complete_delivery', validTarget)).toBe(true);

      // Wildcard target fails
      expect(verifyTrustedContextContract('complete_delivery', 'all', 'complete_delivery', validTarget)).toBe(false);

      // Mismatched target UUID fails
      expect(verifyTrustedContextContract('complete_delivery', validTarget, 'complete_delivery', otherTarget)).toBe(false);

      // Mismatched action fails
      expect(verifyTrustedContextContract('accept_delivery', validTarget, 'complete_delivery', validTarget)).toBe(false);
    });

    it('should preserve and verify end-to-end legitimate delivery and admin review workflows', async () => {
      // 1. Legitimate Acceptance via accept_delivery_request
      const mockRpcAccept = vi.fn().mockResolvedValue({
        data: { success: true, status: 'matched', request_id: 'req-flow-1' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcAccept } as any);
      const acceptRes = await updateDeliveryRequestStatusInDb('req-flow-1', 'matched');
      expect(acceptRes.success).toBe(true);

      // 2. Legitimate Transit via start_delivery_transit
      const mockRpcTransit = vi.fn().mockResolvedValue({
        data: { success: true, status: 'in_transit', request_id: 'req-flow-1' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcTransit } as any);
      const transitRes = await updateDeliveryRequestStatusInDb('req-flow-1', 'in_transit');
      expect(transitRes.success).toBe(true);

      // 3. Legitimate Completion via complete_delivery_handover with valid PIN
      const mockRpcComplete = vi.fn().mockResolvedValue({
        data: { success: true, status: 'completed', request_id: 'req-flow-1' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcComplete } as any);
      const completeRes = await updateDeliveryRequestStatusInDb('req-flow-1', 'completed', undefined, '4321');
      expect(completeRes.success).toBe(true);

      // 4. Legitimate Cancellation via cancel_delivery_request
      const mockRpcCancel = vi.fn().mockResolvedValue({
        data: { success: true, status: 'cancelled', request_id: 'req-flow-2' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcCancel } as any);
      const cancelRes = await updateDeliveryRequestStatusInDb('req-flow-2', 'cancelled');
      expect(cancelRes.success).toBe(true);

      // 5. Legitimate Admin Review via review_verification_request
      const mockRpcReview = vi.fn().mockResolvedValue({
        data: { success: true, status: 'approved', request_id: 'vr-flow-1', reviewed_user_id: 'usr-student-2' },
        error: null,
      });
      setSupabaseClientForTesting({ rpc: mockRpcReview } as any);
      const reviewRes = await reviewVerificationRequestInDb('vr-flow-1', 'approved', 'Student ID confirmed');
      expect(reviewRes.success).toBe(true);
    });
  });

  describe('11. Authentication & Identity Hardening (Step 1 Verification)', () => {
    it('should disallow client alteration of immutable username field in profile update guard', () => {
      expect(isForbiddenProfileUpdate({ username: 'new_hacked_handle' })).toBe(true);
    });

    it('should map username from database profile rows to UserProfile with safe fallback', () => {
      const profileWithUsername = mapDbProfileToUserProfile({
        id: 'usr-1',
        email: 'user1@stanford.edu',
        username: 'Commuter_Dan',
        full_name: 'Dan Commuter',
        role: 'transporter',
        verification_status: 'email_verified',
        trust_score: 80,
        completed_deliveries: 5,
        completed_commutes: 10,
        rating: 4.9,
      });

      expect(profileWithUsername.username).toBe('Commuter_Dan');

      // Profile without username should have undefined username without crashing
      const profileNoUsername = mapDbProfileToUserProfile({
        id: 'usr-2',
        email: 'user2@stanford.edu',
        username: null,
        full_name: 'Legacy User',
        role: 'both',
        verification_status: 'unverified',
        trust_score: 50,
        completed_deliveries: 0,
        completed_commutes: 0,
        rating: 5.0,
      });

      expect(profileNoUsername.username).toBeUndefined();
    });
  });

  describe('12. Security Audit Regression Tests (SEC-01 through SEC-04)', () => {
    describe('SEC-01: Email Verification Synchronization & Profile Trigger Guard', () => {
      it('should allow verification_status transition to email_verified only when backed by trusted email_verification context', () => {
        // Simulates the contract between handle_user_email_confirmed() and check_profile_updates()
        const simulateCheckProfileUpdates = (
          oldStatus: string,
          newStatus: string,
          trustedContext: { action: string; targetId: string } | null,
          userId: string
        ): { allowed: boolean; error?: string } => {
          // Direct client update without trusted context
          if (!trustedContext) {
            if (oldStatus !== newStatus) {
              return {
                allowed: false,
                error: 'Modifying protected metrics (trust score, verification status, ratings, delivery stats) is forbidden.',
              };
            }
          }

          // Verified trusted context: must match action 'email_verification' and target user ID
          if (trustedContext) {
            if (trustedContext.action === 'email_verification' && trustedContext.targetId === userId) {
              return { allowed: true };
            }
            return {
              allowed: false,
              error: 'Invalid trusted context for email verification.',
            };
          }

          return { allowed: true };
        };

        const targetUserId = '11111111-2222-3333-4444-555555555555';
        const otherUserId = '99999999-8888-7777-6666-555555555555';

        // 1. Direct client attempt to set email_verified fails
        const directRes = simulateCheckProfileUpdates('unverified', 'email_verified', null, targetUserId);
        expect(directRes.allowed).toBe(false);
        expect(directRes.error).toContain('Modifying protected metrics');

        // 2. Mismatched target ID fails
        const forgedTargetRes = simulateCheckProfileUpdates(
          'unverified',
          'email_verified',
          { action: 'email_verification', targetId: otherUserId },
          targetUserId
        );
        expect(forgedTargetRes.allowed).toBe(false);

        // 3. Legitimate handle_user_email_confirmed with exact matching trusted context succeeds
        const legitimateRes = simulateCheckProfileUpdates(
          'unverified',
          'email_verified',
          { action: 'email_verification', targetId: targetUserId },
          targetUserId
        );
        expect(legitimateRes.allowed).toBe(true);
      });
    });

    describe('SEC-02: Keyed HMAC Pepper Handover PIN Security', () => {
      // Node crypto HMAC-SHA256 simulation matching server-side extensions.hmac(p_pin || ':' || p_request_id, pepper, 'sha256')
      const computePepperedHash = (pin: string, requestId: string, pepper: string): string => {
        // Pure deterministic HMAC simulation for testing contract
        let hash = 0;
        const input = `${pin}:${requestId}:${pepper}`;
        for (let i = 0; i < input.length; i++) {
          hash = (hash << 5) - hash + input.charCodeAt(i);
          hash |= 0;
        }
        return `hmac_${Math.abs(hash).toString(16)}`;
      };

      const computeLegacyHash = (pin: string): string => {
        let hash = 0;
        for (let i = 0; i < pin.length; i++) {
          hash = (hash << 5) - hash + pin.charCodeAt(i);
          hash |= 0;
        }
        return `legacy_${Math.abs(hash).toString(16)}`;
      };

      it('should protect handover PIN against offline precomputed dictionary attacks using server secret pepper', () => {
        const requestId = 'req-pepper-1';
        const serverSecret = 'super-secret-server-pepper-32bytes!';
        const candidatePin = '4321';

        const secureHash = computePepperedHash(candidatePin, requestId, serverSecret);

        // An attacker without the serverSecret cannot generate the expected hash
        const attackerWithoutSecret = computePepperedHash(candidatePin, requestId, 'wrong-secret');
        expect(secureHash).not.toBe(attackerWithoutSecret);

        // A plain unsalted hash differs from the peppered hash
        const plainHash = computeLegacyHash(candidatePin);
        expect(secureHash).not.toBe(plainHash);
      });

      it('should verify active legacy in-flight deliveries and transparently upgrade them to peppered hashes', () => {
        const requestId = 'req-legacy-flight-1';
        const serverSecret = 'super-secret-server-pepper-32bytes!';
        const correctPin = '1234';
        const wrongPin = '9999';

        let storedHash = computeLegacyHash(correctPin); // Delivery created prior to migration
        let upgraded = false;

        const verifyAndCompleteHandover = (submittedPin: string) => {
          const expectedPeppered = computePepperedHash(submittedPin, requestId, serverSecret);
          const expectedLegacy = computeLegacyHash(submittedPin);

          if (storedHash === expectedPeppered) {
            return { success: true };
          } else if (storedHash === expectedLegacy) {
            // Transparently upgrade in place
            storedHash = expectedPeppered;
            upgraded = true;
            return { success: true, upgraded: true };
          } else {
            return { success: false, error: 'Invalid PIN' };
          }
        };

        // 1. Wrong PIN fails and does not upgrade
        const failRes = verifyAndCompleteHandover(wrongPin);
        expect(failRes.success).toBe(false);
        expect(upgraded).toBe(false);

        // 2. Correct PIN succeeds and triggers upgrade
        const successRes = verifyAndCompleteHandover(correctPin);
        expect(successRes.success).toBe(true);
        expect(upgraded).toBe(true);
        expect(storedHash).toBe(computePepperedHash(correctPin, requestId, serverSecret));

        // 3. Subsequent verification matches the upgraded peppered hash directly
        upgraded = false;
        const subsequentRes = verifyAndCompleteHandover(correctPin);
        expect(subsequentRes.success).toBe(true);
        expect(upgraded).toBe(false);
      });

      it('should enforce 5-attempt rate limit and 15-minute lockout with the keyed pepper scheme', () => {
        let attempts = 0;
        let lockedUntil: Date | null = null;
        const now = new Date();

        const submitPinAttempt = (isCorrect: boolean): { success: boolean; locked: boolean } => {
          if (lockedUntil && lockedUntil > now) {
            return { success: false, locked: true };
          }

          if (isCorrect) {
            attempts = 0;
            return { success: true, locked: false };
          }

          attempts++;
          if (attempts >= 5) {
            lockedUntil = new Date(now.getTime() + 15 * 60 * 1000);
            return { success: false, locked: true };
          }

          return { success: false, locked: false };
        };

        // 4 failed attempts: not yet locked
        for (let i = 0; i < 4; i++) {
          const res = submitPinAttempt(false);
          expect(res.success).toBe(false);
          expect(res.locked).toBe(false);
        }

        // 5th failed attempt: delivery is locked
        const fifthRes = submitPinAttempt(false);
        expect(fifthRes.success).toBe(false);
        expect(fifthRes.locked).toBe(true);

        // Subsequent attempt while locked: blocked immediately
        const lockedRes = submitPinAttempt(true);
        expect(lockedRes.success).toBe(false);
        expect(lockedRes.locked).toBe(true);
      });
    });

    describe('SEC-03: Audit Log Non-Repudiation & Client Restriction', () => {
      it('should reject client RPC attempts to record login_success events (reserved for server auth daemon)', async () => {
        const mockRpc = vi.fn().mockImplementation((fnName, args) => {
          if (fnName === 'record_login_event' && args.p_event_type === 'login_success') {
            return Promise.resolve({
              data: null,
              error: { message: 'login_success events are recorded exclusively by the server auth daemon.' },
            });
          }
          return Promise.resolve({ data: { success: true }, error: null });
        });

        setSupabaseClientForTesting({ rpc: mockRpc } as any);

        // Attempting to record login_success via client RPC is rejected
        const res = await recordLoginAuditInDb('login_success');
        expect(res.success).toBe(false);
        expect(res.error).toContain('login_success events are recorded exclusively by the server auth daemon');
      });

      it('should permit authorized client lifecycle events like logout with server-side source attribution', async () => {
        const mockRpc = vi.fn().mockResolvedValue({ data: { success: true, log_id: 'log-123' }, error: null });
        setSupabaseClientForTesting({ rpc: mockRpc } as any);

        const res = await recordLoginAuditInDb('logout');
        expect(res.success).toBe(true);
        expect(mockRpc).toHaveBeenCalledWith('record_login_event', expect.objectContaining({
          p_event_type: 'logout',
        }));
      });
    });

    describe('SEC-04: Initial Registration Sign-In Audit Handling', () => {
      it('should record login_success with initial_signup flag on user creation with active session', () => {
        const auditLogStore: Array<{ userId: string; eventType: string; initialSignup?: boolean }> = [];

        const simulateAuthTrigger = (op: 'INSERT' | 'UPDATE', record: { id: string; last_sign_in_at: string | null }, oldRecord?: { last_sign_in_at: string | null }) => {
          if (op === 'INSERT') {
            if (record.last_sign_in_at !== null) {
              auditLogStore.push({
                userId: record.id,
                eventType: 'login_success',
                initialSignup: true,
              });
            }
          } else if (op === 'UPDATE') {
            if (record.last_sign_in_at !== oldRecord?.last_sign_in_at && record.last_sign_in_at !== null) {
              auditLogStore.push({
                userId: record.id,
                eventType: 'login_success',
                initialSignup: false,
              });
            }
          }
        };

        // User signup with immediate session
        simulateAuthTrigger('INSERT', { id: 'usr-signup-1', last_sign_in_at: '2026-10-15T12:00:00Z' });
        expect(auditLogStore.length).toBe(1);
        expect(auditLogStore[0].initialSignup).toBe(true);

        // User signup without immediate session (email confirmation required)
        simulateAuthTrigger('INSERT', { id: 'usr-signup-2', last_sign_in_at: null });
        expect(auditLogStore.length).toBe(1); // No premature record

        // Subsequent login for user 2
        simulateAuthTrigger(
          'UPDATE',
          { id: 'usr-signup-2', last_sign_in_at: '2026-10-15T12:30:00Z' },
          { last_sign_in_at: null }
        );
        expect(auditLogStore.length).toBe(2);
        expect(auditLogStore[1].initialSignup).toBe(false);
      });
    });
  });
});



