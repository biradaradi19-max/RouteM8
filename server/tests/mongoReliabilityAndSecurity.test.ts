import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries, inMemoryLocations, type InMemDelivery } from '../routes/deliveries.js';
import { inMemoryUsers } from '../routes/auth.js';

describe('MongoDB Reliability, State Transitions & Security Test Suite', () => {
  let server: Server;
  let baseUrl: string;

  const requesterToken = 'Bearer mock-token-cust-alice-1';
  const requesterUid = 'cust-alice-1';

  const transporter1Token = 'Bearer mock-token-trans-bob-1';
  const transporter1Uid = 'trans-bob-1';

  const transporter2Token = 'Bearer mock-token-trans-carol-2';

  const adminToken = 'Bearer mock-token-admin-dave';
  const adminUid = 'admin-dave';

  const attackerToken = 'Bearer mock-token-attacker-eve';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    inMemoryDeliveries.length = 0;
    inMemoryLocations.clear();
    inMemoryUsers.clear();

    // Register admin user in memory
    inMemoryUsers.set(adminUid, {
      _id: `mem-${adminUid}`,
      firebaseUid: adminUid,
      email: `${adminUid}@test.example.com`,
      fullName: 'System Admin Dave',
      role: 'admin',
      isAdmin: true,
      accountStatus: 'active',
      verificationStatus: 'verified',
    });

    // Register transporter 1 in memory
    inMemoryUsers.set(transporter1Uid, {
      _id: `mem-${transporter1Uid}`,
      firebaseUid: transporter1Uid,
      email: `${transporter1Uid}@test.example.com`,
      fullName: 'Transporter Bob',
      role: 'transporter',
      accountStatus: 'active',
      verificationStatus: 'unverified',
    });
  });

  // 1. Firebase Token Validation & Server-Side Authorization
  describe('Firebase ID Token Validation', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthorized item' }),
      });
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('rejects malformed authorization header with 401', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic invalid-credentials',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Malformed auth' }),
      });
      expect(res.status).toBe(401);
    });
  });

  // 2. Customer Ownership & PIN Masking
  describe('Customer Ownership & PIN Privacy', () => {
    it('allows customer to create delivery and returns plaintext PIN only to creator', async () => {
      const payload = {
        title: 'MacBook Pro Charger',
        description: 'Magnetic MagSafe charger from library desk',
        category: 'electronics',
        pickupAddress: 'Stanford Green Library',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Palo Alto Downtown',
        dropoffCoords: [37.4419, -122.1430],
        compensation: 15,
        itemSize: 'small',
      };

      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.id).toBeDefined();
      expect(data.requesterId).toBe(requesterUid);
      expect(data.handoverPin).toBeDefined();
      expect(typeof data.handoverPin).toBe('string');
      expect(data.handoverPin).toMatch(/^\d{4}$/);
    });

    it('masks handover PIN when transporter or 3rd party lists or views the delivery', async () => {
      const createRes = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Sensitive Documents Folder',
          description: 'Passport and visa papers',
          category: 'documents',
          pickupAddress: 'Stanford Post Office',
          pickupCoords: [37.4275, -122.1697],
          dropoffAddress: 'Consulate Palo Alto',
          dropoffCoords: [37.4419, -122.1430],
          compensation: 25,
          itemSize: 'small',
        }),
      });
      const created: any = await createRes.json();
      const testId = created.id;
      const expectedPin = created.handoverPin;

      // Transporter views the delivery
      const res = await fetch(`${baseUrl}/api/deliveries/${testId}`, {
        headers: { Authorization: transporter1Token },
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.handoverPin).toBeUndefined();

      // Creator views their own delivery
      const creatorRes = await fetch(`${baseUrl}/api/deliveries/${testId}?nocache=1`, {
        cache: 'no-store',
        headers: { Authorization: requesterToken },
      });
      expect(creatorRes.status).toBe(200);
      const creatorData: any = await creatorRes.json();
      expect(creatorData.handoverPin).toBe(expectedPin);
    });

    it('prevents unauthorized third party from cancelling someone elses delivery', async () => {
      const del: InMemDelivery = {
        _id: 'del-cancel-auth-test',
        id: 'del-cancel-auth-test',
        title: 'Math Textbook',
        description: 'Calculus textbook',
        category: 'campus-supplies',
        pickupAddress: 'Stanford Bookstore',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Campus Dorms',
        dropoffCoords: [37.4300, -122.1700],
        compensation: 10,
        itemSize: 'small',
        status: 'open',
        requesterId: requesterUid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(del);

      // Attacker tries to cancel
      const res = await fetch(`${baseUrl}/api/deliveries/del-cancel-auth-test/cancel`, {
        method: 'POST',
        headers: { Authorization: attackerToken },
      });
      expect(res.status).toBe(403);

      // Requester cancels their own delivery
      const creatorRes = await fetch(`${baseUrl}/api/deliveries/del-cancel-auth-test/cancel`, {
        method: 'POST',
        headers: { Authorization: requesterToken },
      });
      expect(creatorRes.status).toBe(200);
      const creatorData: any = await creatorRes.json();
      expect(creatorData.delivery.status).toBe('cancelled');
    });
  });

  // 3. Duplicate Delivery Request Protection
  describe('Duplicate Request Protection', () => {
    it('detects and rejects duplicate requests submitted with same title & coordinates', async () => {
      const payload = {
        title: 'Emergency EpiPen Delivery',
        description: 'Sealed package from infirmary',
        category: 'pharmacy',
        pickupAddress: 'Stanford Health Center',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Student Residences',
        dropoffCoords: [37.4350, -122.1750],
        compensation: 20,
        itemSize: 'small',
      };

      // 1st request succeeds
      const res1 = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      expect(res1.status).toBe(201);

      // Immediate duplicate request rejected with 409
      const res2 = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      expect(res2.status).toBe(409);
      const data2: any = await res2.json();
      expect(data2.error).toContain('Duplicate delivery request detected');
    });
  });

  // 4. Atomic Concurrency Lock: Two Transporters Cannot Accept the Same Delivery
  describe('Atomic Delivery Acceptance & Concurrency Lock', () => {
    it('allows first transporter to accept and rejects concurrent acceptance with 409 Conflict', async () => {
      const targetDeliveryId = 'del-concurrency-test-101';
      const del: InMemDelivery = {
        _id: targetDeliveryId,
        id: targetDeliveryId,
        title: 'Vintage Camera Lens',
        description: '50mm prime lens',
        category: 'electronics',
        pickupAddress: 'Stanford Photo Lab',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Downtown Palo Alto',
        dropoffCoords: [37.4419, -122.1430],
        compensation: 30,
        itemSize: 'small',
        status: 'open',
        requesterId: requesterUid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(del);

      // Transporter 1 accepts
      const res1 = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/accept`, {
        method: 'POST',
        headers: { Authorization: transporter1Token },
      });
      expect(res1.status).toBe(200);
      const data1: any = await res1.json();
      const matched = data1.delivery || data1;
      expect(matched.status).toBe('matched');
      expect(matched.transporterId).toBe(transporter1Uid);

      // Transporter 2 tries to accept the now-matched delivery -> 409 Conflict
      const res2 = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/accept`, {
        method: 'POST',
        headers: { Authorization: transporter2Token },
      });
      expect(res2.status).toBe(409);
      const data2: any = await res2.json();
      expect(data2.error).toContain('already been accepted');
    });

    it('rejects acceptance if delivery creator tries to accept their own delivery', async () => {
      const targetDeliveryId = 'del-own-accept-102';
      const del: InMemDelivery = {
        _id: targetDeliveryId,
        id: targetDeliveryId,
        title: 'Own Errand',
        description: 'Self-delivery test',
        category: 'other',
        pickupAddress: 'Point A',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Point B',
        dropoffCoords: [37.4419, -122.1430],
        compensation: 10,
        itemSize: 'small',
        status: 'open',
        requesterId: requesterUid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(del);

      const res = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/accept`, {
        method: 'POST',
        headers: { Authorization: requesterToken }, // Requester tries to accept
      });
      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error.toLowerCase()).toContain('cannot accept your own delivery request');
    });
  });

  // 5. Handover PIN Verification & Rate-Limiting Lockout
  describe('Handover PIN Verification Lifecycle', () => {
    const targetDeliveryId = 'del-pin-verification-lifecycle';

    beforeEach(() => {
      const del: InMemDelivery = {
        _id: targetDeliveryId,
        id: targetDeliveryId,
        title: 'Art Portfolio Cylinder',
        description: 'Final architecture presentation tube',
        category: 'documents',
        pickupAddress: 'Art Building',
        pickupCoords: [37.4275, -122.1697],
        dropoffAddress: 'Exhibition Hall',
        dropoffCoords: [37.4400, -122.1400],
        compensation: 25,
        itemSize: 'medium',
        status: 'in_transit',
        requesterId: requesterUid,
        transporterId: transporter1Uid,
        handoverPin: '6382',
        pinAttempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(del);
    });

    it('returns 400 when invalid PIN is submitted and increments attempts', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: transporter1Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '0000' }), // Incorrect PIN
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Invalid handover PIN');
      expect(data.attemptsRemaining).toBe(4);
    });

    it('enforces lockout after 5 consecutive failed attempts with 429 Too Many Requests', async () => {
      // Burn 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/verify-pin`, {
          method: 'POST',
          headers: {
            Authorization: transporter1Token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pin: '9999' }),
        });
      }

      // 6th attempt must be locked out with 429
      const lockedRes = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: transporter1Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '6382' }), // Even correct PIN is blocked during cooldown
      });

      expect(lockedRes.status).toBe(429);
      const lockedData: any = await lockedRes.json();
      expect(lockedData.isLocked).toBe(true);
      expect(lockedData.error).toContain('locked due to too many failed attempts');
    });

    it('completes delivery on correct PIN verification', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/${targetDeliveryId}/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: transporter1Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '6382' }), // Correct PIN
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.delivery.status).toBe('completed');
    });
  });

  // 6. Admin Permissions & Verification Workflow
  describe('Admin Role-Based Authorization', () => {
    it('denies standard user access to GET /api/auth/admin/users with 403', async () => {
      const res = await fetch(`${baseUrl}/api/auth/admin/users`, {
        headers: { Authorization: requesterToken }, // Non-admin caller
      });
      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Admin access required');
    });

    it('permits admin user to list users and verify partner status', async () => {
      // 1. List users
      const listRes = await fetch(`${baseUrl}/api/auth/admin/users?nocache=admin1`, {
        cache: 'no-store',
        headers: { Authorization: adminToken },
      });
      const listData: any = await listRes.json();
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listData)).toBe(true);

      // 2. Admin verifies transporter1
      const verifyRes = await fetch(`${baseUrl}/api/auth/admin/verify`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: transporter1Uid,
          newStatus: 'verified',
          notes: 'Driver license & student ID verified',
        }),
      });

      expect(verifyRes.status).toBe(200);
      const verifyData: any = await verifyRes.json();
      expect(verifyData.success).toBe(true);
      expect(verifyData.user.verificationStatus).toBe('verified');
    });
  });

  // 7. Cross-Device Live Telemetry Tracking Polling
  describe('Cross-Device Location Telemetry & Polling', () => {
    let activeDeliveryId: string;

    beforeEach(async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Hardware Prototype Board',
          description: 'Fragile PCB board in antistatic pouch',
          category: 'electronics',
          pickupAddress: 'Packard EE Building',
          pickupCoords: [37.4275, -122.1697],
          dropoffAddress: 'Menlo Park Tech Office',
          dropoffCoords: [37.4538, -122.1822],
          compensation: 35,
          itemSize: 'small',
        }),
      });
      const data: any = await res.json();
      activeDeliveryId = data.id;

      // Transporter 1 accepts it
      await fetch(`${baseUrl}/api/deliveries/${activeDeliveryId}/accept`, {
        method: 'POST',
        headers: { Authorization: transporter1Token },
      });

      // Transporter 1 starts transit
      await fetch(`${baseUrl}/api/deliveries/${activeDeliveryId}/start-transit`, {
        method: 'POST',
        headers: { Authorization: transporter1Token },
      });
    });

    it('permits assigned transporter to stream location telemetry and requester to poll it', async () => {
      // Transporter streams position
      const postRes = await fetch(`${baseUrl}/api/deliveries/${activeDeliveryId}/location`, {
        method: 'POST',
        headers: {
          Authorization: transporter1Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: 37.4350,
          longitude: -122.1750,
          accuracy: 8.5,
          speed: 12.0,
          heading: 180,
        }),
      });
      expect(postRes.status).toBe(200);

      // Requester polls location
      const getRes = await fetch(`${baseUrl}/api/deliveries/${activeDeliveryId}/location`, {
        headers: { Authorization: requesterToken },
      });
      expect(getRes.status).toBe(200);
      const locationData: any = await getRes.json();
      expect(locationData.latitude).toBe(37.4350);
      expect(locationData.longitude).toBe(-122.1750);
      expect(locationData.accuracy).toBe(8.5);
    });

    it('denies unrelated user access to private live telemetry with 403', async () => {
      const unauthRes = await fetch(`${baseUrl}/api/deliveries/${activeDeliveryId}/location`, {
        headers: { Authorization: attackerToken },
      });
      expect(unauthRes.status).toBe(403);
    });
  });
});
