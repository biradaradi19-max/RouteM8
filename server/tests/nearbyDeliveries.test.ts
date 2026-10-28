import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries, type InMemDelivery } from '../routes/deliveries.js';

describe('Location-Based Nearby Delivery Discovery API (GET /api/deliveries/nearby)', () => {
  let server: Server;
  let baseUrl: string;

  // Partner location at Stanford University Main Quad: [37.4275, -122.1697]
  const partnerLat = 37.4275;
  const partnerLng = -122.1697;
  const partnerToken = 'Bearer mock-token-partner-test-123';
  const partnerUid = 'partner-test-123';

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
    // Clear out inMemoryDeliveries and populate with controlled test data
    inMemoryDeliveries.length = 0;

    const testItems: InMemDelivery[] = [
      // Delivery 1: ~1.2 km from partner (Palo Alto University Ave)
      {
        _id: 'del-nearby-1',
        id: 'del-nearby-1',
        title: 'Study Notes Handover',
        description: 'Class notes folder',
        category: 'campus-supplies',
        pickupAddress: 'Stanford Bookstore, Stanford, CA',
        pickupCoords: [37.4241, -122.1700], // ~0.38 km
        dropoffAddress: 'Palo Alto High School',
        dropoffCoords: [37.4350, -122.1550],
        itemSize: 'small',
        compensation: 12.0,
        urgency: 'standard',
        neededBy: 'Today by 18:00',
        status: 'open',
        requesterId: 'usr-requester-99',
        requesterName: 'Alice Student',
        requesterTrustScore: 98,
        handoverPin: '1111',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 2: ~3.1 km from partner (El Camino Real Palo Alto)
      {
        _id: 'del-nearby-2',
        id: 'del-nearby-2',
        title: 'Pharmacy Prescription',
        description: 'Sealed pharmacy bag',
        category: 'pharmacy',
        pickupAddress: 'Walgreens, 4170 El Camino Real, Palo Alto, CA',
        pickupCoords: [37.4124, -122.1287], // ~3.98 km
        dropoffAddress: 'Stanford Medical Center',
        dropoffCoords: [37.4340, -122.1750],
        itemSize: 'small',
        compensation: 18.0,
        urgency: 'urgent',
        neededBy: 'Today by 16:00',
        status: 'open',
        requesterId: 'usr-requester-98',
        requesterName: 'Bob Elder',
        requesterTrustScore: 95,
        handoverPin: '2222',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 3: ~8.8 km from partner (Mountain View Downtown) -> Inside 10 km, Outside 5 km
      {
        _id: 'del-nearby-3',
        id: 'del-nearby-3',
        title: 'Tech Hardware Dongle',
        description: 'USB-C adapter',
        category: 'electronics',
        pickupAddress: 'Castro St, Mountain View, CA',
        pickupCoords: [37.3861, -122.0839], // ~8.85 km
        dropoffAddress: 'Stanford Gates Computer Science',
        dropoffCoords: [37.4300, -122.1730],
        itemSize: 'small',
        compensation: 22.0,
        urgency: 'flexible',
        neededBy: 'Today by 20:00',
        status: 'open',
        requesterId: 'usr-requester-97',
        requesterName: 'Charlie Dev',
        requesterTrustScore: 92,
        handoverPin: '3333',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 4: ~13.5 km from partner (Sunnyvale Downtown) -> Inside 15 km, Outside 10 km
      {
        _id: 'del-nearby-4',
        id: 'del-nearby-4',
        title: 'Art Blueprint Tube',
        description: 'Large drawings tube',
        category: 'other',
        pickupAddress: 'Historic Murphy Ave, Sunnyvale, CA',
        pickupCoords: [37.3770, -122.0300], // ~13.5 km
        dropoffAddress: 'Palo Alto Art Center',
        dropoffCoords: [37.4400, -122.1400],
        itemSize: 'medium',
        compensation: 30.0,
        urgency: 'standard',
        neededBy: 'Today by 21:00',
        status: 'open',
        requesterId: 'usr-requester-96',
        requesterName: 'Diana Architect',
        requesterTrustScore: 99,
        handoverPin: '4444',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 5: Inside 5 km (~1.5 km), BUT created by the calling partner (requesterId === partnerUid)
      {
        _id: 'del-own-request',
        id: 'del-own-request',
        title: 'My Own Grocery Bag',
        description: 'Apples and bread',
        category: 'groceries',
        pickupAddress: 'Trader Joes, Palo Alto, CA',
        pickupCoords: [37.4330, -122.1600], // ~1.05 km
        dropoffAddress: 'My Dorm',
        dropoffCoords: [37.4275, -122.1697],
        itemSize: 'medium',
        compensation: 15.0,
        urgency: 'standard',
        neededBy: 'Today by 19:00',
        status: 'open',
        requesterId: partnerUid, // MUST BE EXCLUDED!
        requesterName: 'Self Partner',
        requesterTrustScore: 100,
        handoverPin: '5555',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 6: Inside 5 km (~2.0 km), BUT declined by this partner (rejectedBy includes partnerUid)
      {
        _id: 'del-rejected-request',
        id: 'del-rejected-request',
        title: 'Heavy Gym Weights',
        description: 'Iron dumbbells',
        category: 'other',
        pickupAddress: 'Arrillaga Center, Stanford, CA',
        pickupCoords: [37.4260, -122.1600],
        dropoffAddress: 'Oak Creek Apartments',
        dropoffCoords: [37.4380, -122.1800],
        itemSize: 'large',
        compensation: 25.0,
        urgency: 'standard',
        neededBy: 'Today by 18:00',
        status: 'open',
        requesterId: 'usr-requester-95',
        requesterName: 'Eve Lifter',
        requesterTrustScore: 90,
        handoverPin: '6666',
        pinAttempts: 0,
        rejectedBy: [partnerUid], // MUST BE EXCLUDED!
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 7: Inside 5 km (~1.0 km), BUT status is 'matched' (already assigned)
      {
        _id: 'del-matched-request',
        id: 'del-matched-request',
        title: 'Camera Lens Repair',
        description: 'DSLR lens',
        category: 'electronics',
        pickupAddress: 'Keeble & Shuchat, Palo Alto',
        pickupCoords: [37.4270, -122.1650],
        dropoffAddress: 'Menlo Park',
        dropoffCoords: [37.4500, -122.1800],
        itemSize: 'small',
        compensation: 20.0,
        urgency: 'standard',
        neededBy: 'Today by 18:00',
        status: 'matched', // MUST BE EXCLUDED!
        requesterId: 'usr-requester-94',
        requesterName: 'Frank Photo',
        requesterTrustScore: 94,
        handoverPin: '7777',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Delivery 8: Inside 5 km, BUT has invalid/missing coordinates
      {
        _id: 'del-invalid-coords',
        id: 'del-invalid-coords',
        title: 'Corrupted Coordinates Request',
        description: 'Invalid GPS',
        category: 'other',
        pickupAddress: 'Unknown location',
        pickupCoords: [999, -999] as any, // Invalid coords! MUST BE EXCLUDED!
        dropoffAddress: 'Destination',
        dropoffCoords: [37.4275, -122.1697],
        itemSize: 'small',
        compensation: 10.0,
        urgency: 'standard',
        neededBy: 'Today',
        status: 'open',
        requesterId: 'usr-requester-93',
        requesterName: 'George Missing',
        requesterTrustScore: 80,
        handoverPin: '8888',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    inMemoryDeliveries.push(...testItems);
  });

  // 1. Authentication & Parameter Validation
  describe('Authentication & Query Validation', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}`);
      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 400 when lat or lng query param is missing', async () => {
      const res1 = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}`, {
        headers: { Authorization: partnerToken },
      });
      expect(res1.status).toBe(400);

      const res2 = await fetch(`${baseUrl}/api/deliveries/nearby?lng=${partnerLng}`, {
        headers: { Authorization: partnerToken },
      });
      expect(res2.status).toBe(400);
    });

    it('returns 400 when lat or lng is out of valid GPS range', async () => {
      const resInvalidLat = await fetch(`${baseUrl}/api/deliveries/nearby?lat=95&lng=0`, {
        headers: { Authorization: partnerToken },
      });
      expect(resInvalidLat.status).toBe(400);

      const resInvalidLng = await fetch(`${baseUrl}/api/deliveries/nearby?lat=0&lng=190`, {
        headers: { Authorization: partnerToken },
      });
      expect(resInvalidLng.status).toBe(400);
    });

    it('returns 400 when radiusKm is negative or exceeds upper limit', async () => {
      const resNegative = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=-5`, {
        headers: { Authorization: partnerToken },
      });
      expect(resNegative.status).toBe(400);

      const resExcessive = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=200`, {
        headers: { Authorization: partnerToken },
      });
      expect(resExcessive.status).toBe(400);
    });
  });

  // 2. Proximity Matching & Radius Filtering
  describe('Proximity Matching & Radius Filtering', () => {
    it('filters deliveries strictly within the default 5 km radius', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&_t=1`, {
        headers: { Authorization: partnerToken },
      });
      expect(res.status).toBe(200);
      const data: any[] = await res.json();

      // Only del-nearby-1 (~0.38km) and del-nearby-2 (~3.98km) should be returned
      const ids = data.map((d) => d.id);
      expect(ids).toContain('del-nearby-1');
      expect(ids).toContain('del-nearby-2');
      expect(ids).not.toContain('del-nearby-3'); // 8.85 km -> excluded at 5 km
      expect(ids).not.toContain('del-nearby-4'); // 13.5 km -> excluded at 5 km
    });

    it('sorts matching requests by nearest pickup first', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&_t=2`, {
        headers: { Authorization: partnerToken },
      });
      expect(res.status).toBe(200);
      const data: any[] = await res.json();

      expect(data.length).toBeGreaterThanOrEqual(2);
      // del-nearby-1 is closer than del-nearby-2
      expect(data[0].id).toBe('del-nearby-1');
      expect(data[1].id).toBe('del-nearby-2');
      expect(data[0].pickupDistanceKm).toBeLessThan(data[1].pickupDistanceKm);
    });

    it('expands search radius to 10 km and includes del-nearby-3', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=10`, {
        headers: { Authorization: partnerToken },
      });
      expect(res.status).toBe(200);
      const data: any[] = await res.json();

      const ids = data.map((d) => d.id);
      expect(ids).toContain('del-nearby-1');
      expect(ids).toContain('del-nearby-2');
      expect(ids).toContain('del-nearby-3'); // Included in 10 km
      expect(ids).not.toContain('del-nearby-4'); // 13.5 km -> excluded in 10 km
    });

    it('expands search radius to 15 km and includes del-nearby-4', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=15`, {
        headers: { Authorization: partnerToken },
      });
      expect(res.status).toBe(200);
      const data: any[] = await res.json();

      const ids = data.map((d) => d.id);
      expect(ids).toContain('del-nearby-1');
      expect(ids).toContain('del-nearby-2');
      expect(ids).toContain('del-nearby-3');
      expect(ids).toContain('del-nearby-4'); // Included in 15 km
    });
  });

  // 3. Security, Ineligible Requests & Role Constraints
  describe('Ineligible Requests & Security Exclusion', () => {
    it('excludes the calling partner\'s own delivery requests', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=15`, {
        headers: { Authorization: partnerToken },
      });
      const data: any[] = await res.json();
      const ids = data.map((d) => d.id);
      expect(ids).not.toContain('del-own-request');
    });

    it('excludes requests that this partner previously declined (rejectedBy)', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=15`, {
        headers: { Authorization: partnerToken },
      });
      const data: any[] = await res.json();
      const ids = data.map((d) => d.id);
      expect(ids).not.toContain('del-rejected-request');
    });

    it('excludes non-open requests (matched, in_transit, cancelled)', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=15`, {
        headers: { Authorization: partnerToken },
      });
      const data: any[] = await res.json();
      const ids = data.map((d) => d.id);
      expect(ids).not.toContain('del-matched-request');
    });

    it('excludes requests with invalid or missing pickup coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nearby?lat=${partnerLat}&lng=${partnerLng}&radiusKm=15`, {
        headers: { Authorization: partnerToken },
      });
      const data: any[] = await res.json();
      const ids = data.map((d) => d.id);
      expect(ids).not.toContain('del-invalid-coords');
    });
  });
});
