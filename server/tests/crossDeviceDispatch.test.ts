import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';

describe('Cross-Device Delivery Visibility, Commute-Independent Matching & Atomic Dispatch', () => {
  let server: Server;
  let baseUrl: string;

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
    // Clear out inMemoryDeliveries and seed with known state
    inMemoryDeliveries.length = 0;
  });

  it('Device A (Customer) posts request -> Device B (Partner without commute) immediately lists it in feed', async () => {
    // 1. Device A creates request as User A ('usr-customer-device-a')
    const createRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-customer-device-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Chemistry Lab Samples & Glassware',
        description: 'Urgent transfer from chemistry building to biology lab',
        category: 'campus-supplies',
        pickupAddress: 'Stanford Chemistry Dept, Stanford, CA',
        pickupCoords: [37.429, -122.171],
        dropoffAddress: 'Stanford Biology Dept, Stanford, CA',
        dropoffCoords: [37.432, -122.175],
        itemSize: 'small',
        compensation: 25.0,
        urgency: 'urgent',
        neededBy: 'Today by 16:00',
        distanceKm: 1.8,
        estimatedDurationMin: 7,
      }),
    });

    expect(createRes.status).toBe(201);
    const created: any = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.status).toBe('open');
    expect(created.requesterId).toBe('usr-customer-device-a');

    // 2. Device B (Partner B 'partner-device-b', who has NO published commute) fetches open deliveries
    const partnerRes = await fetch(`${baseUrl}/api/deliveries?status=open&excludeRejectedBy=partner-device-b`, {
      headers: {
        Authorization: 'Bearer mock-token-partner-device-b',
      },
    });

    expect(partnerRes.status).toBe(200);
    const partnerFeed = (await partnerRes.json()) as any[];

    // Verify User A's request is returned and visible to Partner B
    const found = partnerFeed.find((d) => d.id === created.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('Chemistry Lab Samples & Glassware');
    expect(found.compensation).toBe(25.0);
    expect(found.status).toBe('open');
    expect(found.distanceKm).toBe(1.8);
  });

  it('Customer cannot accept their own request; returns 403 Forbidden', async () => {
    // 1. User A creates request
    const createRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-customer-alice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Documents to City Hall',
        description: 'Sealed permit documents',
        category: 'documents',
        pickupAddress: '100 University Ave, Palo Alto, CA',
        pickupCoords: [37.444, -122.163],
        dropoffAddress: '250 Hamilton Ave, Palo Alto, CA',
        dropoffCoords: [37.445, -122.161],
        itemSize: 'small',
        compensation: 15.0,
      }),
    });
    const created: any = await createRes.json();

    // 2. User A attempts to accept their own request
    const acceptRes = await fetch(`${baseUrl}/api/deliveries/${created.id}/accept`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-customer-alice',
        'Content-Type': 'application/json',
      },
    });

    expect(acceptRes.status).toBe(403);
    const data: any = await acceptRes.json();
    expect(data.error).toContain('cannot accept your own delivery');
  });

  it('Decline/Reject hides request for declining partner only, while remaining open for others', async () => {
    // 1. Customer creates request
    const createRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-requester-sam',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Hardware Tools Box',
        pickupAddress: 'Menlo Park, CA',
        pickupCoords: [37.453, -122.181],
        dropoffAddress: 'Palo Alto, CA',
        dropoffCoords: [37.441, -122.160],
        compensation: 20.0,
      }),
    });
    const created: any = await createRes.json();

    // 2. Partner 1 declines/dismisses it
    const rejectRes = await fetch(`${baseUrl}/api/deliveries/${created.id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
      },
    });
    expect(rejectRes.status).toBe(200);

    // 3. Partner 1 queries open requests with excludeRejectedBy
    const partner1Res = await fetch(`${baseUrl}/api/deliveries?status=open&excludeRejectedBy=partner-1`, {
      headers: { Authorization: 'Bearer mock-token-partner-1' },
    });
    const partner1Feed = (await partner1Res.json()) as any[];
    expect(partner1Feed.some((d) => d.id === created.id)).toBe(false);

    // 4. Partner 2 queries open requests - MUST still see the request!
    const partner2Res = await fetch(`${baseUrl}/api/deliveries?status=open&excludeRejectedBy=partner-2`, {
      headers: { Authorization: 'Bearer mock-token-partner-2' },
    });
    const partner2Feed = (await partner2Res.json()) as any[];
    const partner2Item = partner2Feed.find((d) => d.id === created.id);
    expect(partner2Item).toBeDefined();
    expect(partner2Item.status).toBe('open');
  });

  it('Guarantees atomic assignment: only one partner wins, second receives 409 conflict', async () => {
    // 1. Customer creates request
    const createRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-customer-urgent',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'High-Value Prototype',
        pickupAddress: 'Palo Alto, CA',
        pickupCoords: [37.44, -122.16],
        dropoffAddress: 'Mountain View, CA',
        dropoffCoords: [37.38, -122.08],
        compensation: 35.0,
      }),
    });
    const created: any = await createRes.json();

    // 2. Partner A and Partner B attempt to accept concurrently
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/deliveries/${created.id}/accept`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-fast-a',
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${baseUrl}/api/deliveries/${created.id}/accept`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-slow-b',
          'Content-Type': 'application/json',
        },
      }),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Verify delivery state in-memory / db
    const finalRes = await fetch(`${baseUrl}/api/deliveries/${created.id}`);
    const finalDoc: any = await finalRes.json();
    expect(finalDoc.status).toBe('matched');
    expect(['partner-fast-a', 'partner-slow-b']).toContain(finalDoc.transporterId);
  });
});
