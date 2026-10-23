import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries, type InMemDelivery } from '../routes/deliveries.js';

describe('Delivery Coordinate Validation & Concurrent Acceptance', () => {
  let server: Server;
  let baseUrl: string;

  const partner1Token = 'Bearer mock-token-partner-1';
  const partner1Uid = 'partner-1';
  const partner2Token = 'Bearer mock-token-partner-2';
  const partner2Uid = 'partner-2';
  const customerToken = 'Bearer mock-token-customer-99';
  const customerUid = 'customer-99';

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
  });

  describe('Strict Coordinate Validation on Creation (POST /api/deliveries)', () => {
    it('rejects creation when pickupCoords is missing or not a 2-element array', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: customerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Books Handover',
          description: 'Calculus textbook',
          category: 'campus-supplies',
          pickupAddress: 'Stanford Library',
          pickupCoords: [37.4275], // Invalid length
          dropoffAddress: 'Palo Alto',
          dropoffCoords: [37.4400, -122.1600],
          itemSize: 'small',
          compensation: 15.0,
          urgency: 'standard',
          neededBy: 'Today by 18:00',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toMatch(/coordinates/i);
    });

    it('rejects creation when pickupCoords latitude or longitude is out of range', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: customerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Books Handover',
          description: 'Calculus textbook',
          category: 'campus-supplies',
          pickupAddress: 'Stanford Library',
          pickupCoords: [120, -122.1697], // Lat 120 is out of [-90, 90]
          dropoffAddress: 'Palo Alto',
          dropoffCoords: [37.4400, -122.1600],
          itemSize: 'small',
          compensation: 15.0,
          urgency: 'standard',
          neededBy: 'Today by 18:00',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toMatch(/coordinates/i);
    });
  });

  describe('Atomic Concurrent Acceptance (POST /api/deliveries/:id/accept)', () => {
    it('allows only one partner to accept a delivery and returns 409 for concurrent attempts', async () => {
      // Seed a delivery
      const testDelivery: InMemDelivery = {
        _id: 'del-race-condition-1',
        id: 'del-race-condition-1',
        title: 'Rare Camera Lens',
        description: 'Fragile lens in protective case',
        category: 'electronics',
        pickupAddress: 'Stanford Bookstore',
        pickupCoords: [37.4241, -122.1700],
        dropoffAddress: 'Palo Alto Art Center',
        dropoffCoords: [37.4400, -122.1400],
        itemSize: 'small',
        compensation: 25.0,
        urgency: 'urgent',
        neededBy: 'Today by 19:00',
        status: 'open',
        requesterId: customerUid,
        requesterName: 'Alice Customer',
        requesterTrustScore: 98,
        handoverPin: '9999',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(testDelivery);

      // Two partners simultaneously accept the exact same delivery
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/deliveries/del-race-condition-1/accept`, {
          method: 'POST',
          headers: { Authorization: partner1Token },
        }),
        fetch(`${baseUrl}/api/deliveries/del-race-condition-1/accept`, {
          method: 'POST',
          headers: { Authorization: partner2Token },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must be 200 OK and the other must be 409 Conflict
      expect(statuses).toEqual([200, 409]);

      // Verify the final delivery in memory is matched to the winning partner
      const updated = inMemoryDeliveries.find((d) => d.id === 'del-race-condition-1');
      expect(updated?.status).toBe('matched');
      expect([partner1Uid, partner2Uid]).toContain(updated?.transporterId);
    });

    it('forbids the customer who created the delivery from accepting it', async () => {
      const testDelivery: InMemDelivery = {
        _id: 'del-own-accept-test',
        id: 'del-own-accept-test',
        title: 'Customer Self Delivery',
        description: 'Package',
        category: 'other',
        pickupAddress: 'Origin',
        pickupCoords: [37.4241, -122.1700],
        dropoffAddress: 'Dest',
        dropoffCoords: [37.4400, -122.1400],
        itemSize: 'small',
        compensation: 10.0,
        urgency: 'standard',
        neededBy: 'Today',
        status: 'open',
        requesterId: customerUid,
        requesterName: 'Alice Customer',
        requesterTrustScore: 98,
        handoverPin: '1234',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryDeliveries.push(testDelivery);

      const res = await fetch(`${baseUrl}/api/deliveries/del-own-accept-test/accept`, {
        method: 'POST',
        headers: { Authorization: customerToken },
      });

      expect(res.status).toBe(403);
    });
  });
});
