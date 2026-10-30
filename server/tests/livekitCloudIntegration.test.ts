import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';

describe('LiveKit Cloud Integration & Server Token Minting Flows', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';
    process.env.ALLOW_MOCK_LIVEKIT = 'true';
    process.env.LIVEKIT_URL = 'wss://routem8-5l64i76u.livekit.cloud';

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

  const testDeliveryId = '6712b001a1b2c3d4e5f60001';

  it('1. rejects token request with 401 when Authorization header is missing', async () => {
    const res = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryId: testDeliveryId }),
    });

    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('2. rejects token request with 400 when deliveryId is omitted', async () => {
    const res = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toBe('deliveryId is required');
  });

  it('3. rejects token request with 404 when deliveryId does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: 'non-existent-del-999' }),
    });

    expect(res.status).toBe(404);
    const data: any = await res.json();
    expect(data.error).toBe('Delivery request not found');
  });

  it('4. rejects token request with 403 when an unrelated third party attempts to join the room', async () => {
    // Delivery 6712b001a1b2c3d4e5f60001 has requester usr-marcus-10 and transporter partner-1
    const res = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-eavesdropper-999',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId }),
    });

    expect(res.status).toBe(403);
    const data: any = await res.json();
    expect(data.error).toContain('Forbidden');
  });

  it('5. rejects token request with 400 when delivery status is open (unassigned)', async () => {
    const target = inMemoryDeliveries.find((d) => d.id === testDeliveryId);
    if (target) target.status = 'open';

    const res = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-marcus-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId }),
    });

    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toContain('Calling is not available for deliveries in \'open\' status');
  });

  it('6. generates token and assigns identical unique room for both requester and transporter when matched', async () => {
    const target = inMemoryDeliveries.find((d) => d.id === testDeliveryId);
    if (target) {
      target.status = 'matched';
      target.requesterId = 'usr-marcus-10';
      target.transporterId = 'partner-1';
      target.requesterName = 'Marcus Vance';
      target.transporterName = 'Ravi Delivery Partner';
    }

    // A. Requester requests call token
    const reqRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-usr-marcus-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId, callType: 'video' }),
    });

    expect(reqRes.status).toBe(200);
    const reqData: any = await reqRes.json();
    expect(reqData.token).toBeDefined();
    expect(reqData.room).toBe(`delivery-${testDeliveryId}`);
    expect(reqData.role).toBe('Customer');
    expect(reqData.participantIdentity).toBe('usr-marcus-10');
    expect(reqData.serverUrl).toBe('wss://routem8-5l64i76u.livekit.cloud');

    // B. Delivery partner requests call token
    const partnerRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId, callType: 'video' }),
    });

    expect(partnerRes.status).toBe(200);
    const partnerData: any = await partnerRes.json();
    expect(partnerData.token).toBeDefined();
    // Invariant: Both parties join the EXACT same room
    expect(partnerData.room).toBe(reqData.room);
    expect(partnerData.role).toBe('Transporter');
    expect(partnerData.participantIdentity).toBe('partner-1');
    expect(partnerData.serverUrl).toBe('wss://routem8-5l64i76u.livekit.cloud');
  });

  it('7. permits call token during in_transit status and blocks tokens once delivery is completed', async () => {
    const target = inMemoryDeliveries.find((d) => d.id === testDeliveryId);
    if (target) {
      target.status = 'in_transit';
    }

    // Successful in transit
    const transitRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId }),
    });
    expect(transitRes.status).toBe(200);

    // Transition to completed (e.g. after successful PIN verification)
    if (target) {
      target.status = 'completed';
    }

    // Blocked once completed
    const completedRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer mock-token-partner-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId: testDeliveryId }),
    });

    expect(completedRes.status).toBe(400);
    const completedData: any = await completedRes.json();
    expect(completedData.error).toContain('Calling is not available for deliveries in \'completed\' status');
  });
});

