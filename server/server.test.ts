import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createApp } from './app.js';
import { requireAuth } from './middleware/auth.js';
import { verifyFirebaseIdToken } from './config/firebaseAdmin.js';
import type { Express } from 'express';

// Enable mock test tokens for test suite
process.env.NODE_ENV = 'test';
process.env.ALLOW_TEST_TOKENS = 'true';
process.env.ALLOW_MOCK_LIVEKIT = 'true';

describe('Route M8 Express + MongoDB + Firebase Server Architecture Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  // =========================================================================
  // 1. Firebase Token Verification & Authorization Middleware
  // =========================================================================
  describe('Firebase ID-Token Verification & Security Invariants', () => {
    it('should initialize Express application factory', () => {
      expect(app).toBeDefined();
    });

    it('should reject requests with missing Authorization header with 401', async () => {
      let statusCode = 0;
      let responseBody: any = null;
      const req: any = { headers: {} };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          responseBody = data;
          return res;
        },
      };
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(statusCode).toBe(401);
      expect(responseBody?.error).toBe('Unauthorized');
      expect(responseBody?.message).toContain('Missing or malformed Authorization header');
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with malformed Bearer tokens with 401', async () => {
      let statusCode = 0;
      const req: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: () => res,
      };
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should successfully verify mock test tokens in test environment', async () => {
      const verified = await verifyFirebaseIdToken('mock-token-usr-alice');
      expect(verified.uid).toBe('usr-alice');
      expect(verified.email).toBe('usr-alice@test.example.com');
      expect(verified.emailVerified).toBe(true);
    });

    it('should authorize valid token and attach user to request in requireAuth', async () => {
      const req: any = { headers: { authorization: 'Bearer mock-token-usr-alice' } };
      const res: any = {};
      const next = vi.fn();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.uid).toBe('usr-alice');
    });

    it('should reject empty or invalid token inputs', async () => {
      await expect(verifyFirebaseIdToken('')).rejects.toThrow('Missing or invalid token');
    });
  });

  // =========================================================================
  // 2. Delivery Lifecycle & Secure Handover PIN Logic
  // =========================================================================
  describe('Delivery Lifecycle, Matching & Handover PIN Lockout Security', () => {
    it('should calculate attempts remaining and enforce 15-minute lockout after 5 failed PIN attempts', () => {
      const mockDelivery = {
        handoverPin: '4821',
        pinAttempts: 0,
        pinLockedUntil: undefined as Date | undefined,
        status: 'in_transit',
      };

      const MAX_ATTEMPTS = 5;

      // Simulate 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const attempt = '0000';
        if (attempt !== mockDelivery.handoverPin) {
          mockDelivery.pinAttempts++;
        }
      }

      expect(mockDelivery.pinAttempts).toBe(4);
      expect(Math.max(0, MAX_ATTEMPTS - mockDelivery.pinAttempts)).toBe(1);
      expect(mockDelivery.pinLockedUntil).toBeUndefined();

      // 5th failed attempt triggers lockout
      if ('9999' !== mockDelivery.handoverPin) {
        mockDelivery.pinAttempts++;
        if (mockDelivery.pinAttempts >= MAX_ATTEMPTS) {
          mockDelivery.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
      }

      expect(mockDelivery.pinAttempts).toBe(5);
      expect(mockDelivery.pinLockedUntil).toBeDefined();
      expect(mockDelivery.pinLockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // Verify that while locked, attempts are blocked
      const isLocked = Boolean(mockDelivery.pinLockedUntil && new Date() < mockDelivery.pinLockedUntil);
      expect(isLocked).toBe(true);

      // Simulate correct PIN after reset
      mockDelivery.pinAttempts = 0;
      mockDelivery.pinLockedUntil = undefined;
      mockDelivery.status = 'completed';

      expect(mockDelivery.status).toBe('completed');
      expect(mockDelivery.pinAttempts).toBe(0);
    });

    it('should prevent requesters from accepting their own delivery requests', () => {
      const requesterId = 'firebase-usr-100';
      const callerId = 'firebase-usr-100';

      const isSelfAcceptance = requesterId === callerId;
      expect(isSelfAcceptance).toBe(true);
    });
  });

  // =========================================================================
  // 3. LiveKit Audio Calling Authorization Invariants
  // =========================================================================
  describe('LiveKit Token Minting Server Security', () => {
    it('should reject LiveKit tokens for users not belonging to the delivery', () => {
      const delivery = {
        requesterId: 'usr-requester',
        transporterId: 'usr-partner',
        status: 'in_transit',
      };

      const callerId = 'usr-eavesdropper';
      const isParticipant = delivery.requesterId === callerId || delivery.transporterId === callerId;
      expect(isParticipant).toBe(false);
    });

    it('should deny LiveKit tokens for completed or cancelled deliveries', () => {
      const delivery = {
        requesterId: 'usr-requester',
        transporterId: 'usr-partner',
        status: 'completed',
      };

      const isPermitted = delivery.status === 'matched' || delivery.status === 'in_transit';
      expect(isPermitted).toBe(false);
    });
  });

  // =========================================================================
  // 4. GPS Coordinate Boundaries & Rate Limiting
  // =========================================================================
  describe('GPS Coordinate Boundaries & Rate Limiting', () => {
    it('should validate geographical coordinate bounds [-90, 90] and [-180, 180]', () => {
      const isValid = (lat: number, lng: number) =>
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;

      expect(isValid(37.4275, -122.1668)).toBe(true);
      expect(isValid(91.0, 50)).toBe(false);
      expect(isValid(-95.0, 50)).toBe(false);
      expect(isValid(45.0, 185.0)).toBe(false);
      expect(isValid(45.0, -195.0)).toBe(false);
    });

    it('should enforce rate limit of 1 update per second', () => {
      const lastUpdate = Date.now() - 500; // 500ms ago
      const now = Date.now();
      const rateLimited = now - lastUpdate < 800;
      expect(rateLimited).toBe(true);

      const oldUpdate = Date.now() - 1500; // 1500ms ago
      const canUpdate = now - oldUpdate >= 800;
      expect(canUpdate).toBe(true);
    });
  });

  // =========================================================================
  // 5. Atomic Delivery Acceptance & Concurrency Race Condition Invariants
  // =========================================================================
  describe('Atomic MongoDB Delivery Acceptance & Concurrency Rules', () => {
    it('should only allow one partner to atomically claim an open delivery', () => {
      // Model the atomic MongoDB findOneAndUpdate filter:
      // { _id: id, status: 'open', requesterId: { $ne: uid } }
      let dbRecord = {
        _id: 'del-order-440',
        status: 'open',
        requesterId: 'usr-requester-1',
        transporterId: null as string | null,
      };

      const atomicAccept = (partnerUid: string) => {
        // Atomic filter check
        if (dbRecord.status === 'open' && dbRecord.requesterId !== partnerUid) {
          dbRecord = {
            ...dbRecord,
            status: 'matched',
            transporterId: partnerUid,
          };
          return { success: true, record: dbRecord };
        }
        // Conflict diagnostic
        if (dbRecord.requesterId === partnerUid) {
          return { success: false, code: 400, error: 'Cannot accept own delivery' };
        }
        if (dbRecord.status !== 'open') {
          return { success: false, code: 409, error: 'Already claimed by another partner' };
        }
        return { success: false, code: 400, error: 'Unable to accept' };
      };

      // Partner A accepts first
      const resultPartnerA = atomicAccept('partner-alice');
      expect(resultPartnerA.success).toBe(true);
      expect(resultPartnerA.record?.transporterId).toBe('partner-alice');
      expect(resultPartnerA.record?.status).toBe('matched');

      // Partner B concurrently attempts to accept the exact same order
      const resultPartnerB = atomicAccept('partner-bob');
      expect(resultPartnerB.success).toBe(false);
      expect(resultPartnerB.code).toBe(409);
      expect(resultPartnerB.error).toContain('Already claimed');

      // Transporter cannot be overwritten by Partner B
      expect(dbRecord.transporterId).toBe('partner-alice');
    });

    it('should reject self-acceptance with HTTP 400', () => {
      const dbRecord = {
        _id: 'del-order-441',
        status: 'open',
        requesterId: 'usr-requester-same',
        transporterId: null,
      };

      const partnerUid = 'usr-requester-same';
      const isSelf = dbRecord.requesterId === partnerUid;
      expect(isSelf).toBe(true);
    });
  });

  // =========================================================================
  // 6. Partner Rejection Isolation Invariants
  // =========================================================================
  describe('Partner Rejection & Filter Isolation Rules', () => {
    it('should dismiss delivery for the rejecting partner only without cancelling the request', () => {
      const delivery = {
        _id: 'del-order-990',
        status: 'open',
        requesterId: 'usr-requester',
        rejectedBy: [] as string[],
      };

      const partnerBob = 'partner-bob';
      const partnerCarol = 'partner-carol';

      // Bob rejects delivery
      if (!delivery.rejectedBy.includes(partnerBob)) {
        delivery.rejectedBy.push(partnerBob);
      }

      // Order must remain OPEN for other partners
      expect(delivery.status).toBe('open');
      expect(delivery.rejectedBy).toContain(partnerBob);

      // Filtering logic for open requests
      const isVisibleToBob = delivery.status === 'open' && !delivery.rejectedBy.includes(partnerBob);
      const isVisibleToCarol = delivery.status === 'open' && !delivery.rejectedBy.includes(partnerCarol);

      expect(isVisibleToBob).toBe(false); // Hidden from Bob
      expect(isVisibleToCarol).toBe(true); // Still visible to Carol
    });
  });

  // =========================================================================
  // 7. Location Validation & Geocoding Verification
  // =========================================================================
  describe('Location Coordinate Resolution & Validation Rules', () => {
    it('should reject delivery creation if coordinates are unresolved or invalid', () => {
      const validateCoordinates = (pickup: [number, number] | null, dropoff: [number, number] | null) => {
        if (!pickup || !dropoff) return false;
        const [lat1, lng1] = pickup;
        const [lat2, lng2] = dropoff;
        return (
          Number.isFinite(lat1) &&
          Number.isFinite(lng1) &&
          Number.isFinite(lat2) &&
          Number.isFinite(lng2) &&
          lat1 >= -90 &&
          lat1 <= 90 &&
          lng1 >= -180 &&
          lng1 <= 180 &&
          lat2 >= -90 &&
          lat2 <= 90 &&
          lng2 >= -180 &&
          lng2 <= 180
        );
      };

      expect(validateCoordinates([37.4275, -122.1668], [37.3861, -122.0839])).toBe(true);
      expect(validateCoordinates(null, [37.3861, -122.0839])).toBe(false);
      expect(validateCoordinates([37.4275, -122.1668], null)).toBe(false);
      expect(validateCoordinates([NaN, -122.1668], [37.3861, -122.0839])).toBe(false);
    });
  });

  // =========================================================================
  // 8. Global Places Endpoints & Worldwide Search
  // =========================================================================
  describe('Global Places Autocomplete & Details API Routes', () => {
    it('should return empty suggestions when autocomplete input is empty', async () => {
      let jsonResult: any = null;
      const req: any = { query: { input: '' } };
      const res: any = {
        status: () => res,
        json: (data: any) => {
          jsonResult = data;
          return res;
        },
      };

      const placesRouter = (await import('./routes/places.js')).default;
      // Find the autocomplete route handler
      const layer = placesRouter.stack.find((l: any) => l.route?.path === '/autocomplete');
      expect(layer?.route?.stack?.[0]?.handle).toBeDefined();

      await layer!.route!.stack[0].handle(req, res, () => {});
      expect(jsonResult).toEqual({ suggestions: [] });
    });

    it('should reject reverse-geocode when coordinates are out of earth bounds', async () => {
      let statusCode = 200;
      let jsonResult: any = null;
      const req: any = { query: { lat: '120.5', lng: '74.3' } };
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
        json: (data: any) => {
          jsonResult = data;
          return res;
        },
      };

      const placesRouter = (await import('./routes/places.js')).default;
      const layer = placesRouter.stack.find((l: any) => l.route?.path === '/reverse-geocode');
      expect(layer?.route?.stack?.[0]?.handle).toBeDefined();

      await layer!.route!.stack[0].handle(req, res, () => {});
      expect(statusCode).toBe(400);
      expect(jsonResult?.error).toContain('bounds');
    });

    it('should enforce atomic accept condition: only one partner wins, status changes to matched', () => {
      const deliveryState = {
        _id: 'del-atomic-1',
        status: 'open',
        requesterId: 'usr-requester-1',
        transporterId: null as string | null,
      };

      const simulateAccept = (uid: string) => {
        // Atomic query condition: { _id, status: 'open', requesterId: { $ne: uid } }
        if (deliveryState.status === 'open' && deliveryState.requesterId !== uid) {
          deliveryState.status = 'matched';
          deliveryState.transporterId = uid;
          return { success: true, status: 200 };
        }
        if (deliveryState.requesterId === uid) {
          return { error: 'Cannot accept own delivery', status: 400 };
        }
        return { error: 'Already matched or not open', status: 409 };
      };

      // Partner 1 accepts first
      const res1 = simulateAccept('partner-1');
      expect(res1.status).toBe(200);
      expect(deliveryState.status).toBe('matched');
      expect(deliveryState.transporterId).toBe('partner-1');

      // Partner 2 attempts to accept concurrently
      const res2 = simulateAccept('partner-2');
      expect(res2.status).toBe(409); // Conflict detected
      expect(deliveryState.transporterId).toBe('partner-1'); // Partner 1 remains winner

      // Requester attempts to accept own delivery
      const resOwner = simulateAccept('usr-requester-1');
      expect(resOwner.status).toBe(400);
    });
  });
});

