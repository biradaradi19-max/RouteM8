import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';

describe('Delivery Transit & Handover PIN Verification API Flows', () => {
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
    // Reset test delivery in inMemoryDeliveries
    const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
    if (target) {
      target.status = 'matched';
      target.requesterId = 'usr-marcus-10';
      target.transporterId = 'partner-1';
      target.handoverPin = '4821';
      target.pinAttempts = 0;
      target.pinLockedUntil = undefined;
    }
  });

  // =========================================================================
  // Bug 1: Start Transit State Transitions & Authorization
  // =========================================================================
  describe('POST /api/deliveries/:id/start-transit', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/start-transit`, {
        method: 'POST',
      });
      const data: any = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when requester attempts to mark in transit (only assigned transporter permitted)', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/start-transit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-usr-marcus-10', // The Requester, NOT transporter
        },
      });
      const data: any = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only the assigned delivery partner can start transit');
    });

    it('returns 403 when an unrelated third party attempts to start transit', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/start-transit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-unauthorized-random',
        },
      });
      const data: any = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only the assigned delivery partner can start transit');
    });

    it('returns 400 if delivery status is not matched (e.g. open)', async () => {
      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      if (target) target.status = 'open';

      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/start-transit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
        },
      });
      const data: any = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Cannot start transit');
    });

    it('successfully transitions delivery to in_transit when assigned partner calls start-transit', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/start-transit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1', // The assigned transporter
        },
      });
      const data: any = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('in_transit');
      expect(data.id).toBe('6712b001a1b2c3d4e5f60001');

      // Verify in-memory state was updated
      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      expect(target?.status).toBe('in_transit');
    });

    it('returns 404 if delivery ID does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/nonexistent-id-999/start-transit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
        },
      });
      const data: any = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Delivery not found');
    });
  });

  // =========================================================================
  // Bug 2: Handover PIN Verification & Response Invariants
  // =========================================================================
  describe('POST /api/deliveries/:id/verify-pin', () => {
    it('returns 401 when Authorization is missing', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '4821' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when non-participant tries to verify PIN', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-intruder-999',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '4821' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Only participants in this delivery can verify handover');
    });

    it('returns 400 when PIN is missing or invalid format', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '12' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('4-digit handover PIN');
    });

    it('returns 400 and increments attempts when PIN is incorrect', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '0000' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Invalid handover PIN');
      expect(data.attemptsRemaining).toBe(4);
      expect(data.isLocked).toBe(false);
    });

    it('enforces lockout after 5 consecutive failed attempts', async () => {
      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      if (target) target.pinAttempts = 4;

      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '0000' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(400);
      expect(data.attemptsRemaining).toBe(0);
      expect(data.isLocked).toBe(true);
      expect(target?.pinLockedUntil).toBeDefined();

      // Subsequent attempt must receive 429 Too Many Requests
      const lockedRes = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '4821' }),
      });
      const lockedData: any = await lockedRes.json();

      expect(lockedRes.status).toBe(429);
      expect(lockedData.error).toContain('PIN verification locked');
      expect(lockedData.isLocked).toBe(true);
    });

    it('returns consistent success JSON and transitions to completed on correct PIN', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '4821' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Handover verified and delivery completed');
      expect(data.delivery).toBeDefined();
      expect(data.delivery.status).toBe('completed');

      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      expect(target?.status).toBe('completed');
    });

    it('returns 400 when attempting to verify an already completed delivery', async () => {
      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      if (target) target.status = 'completed';

      const res = await fetch(`${baseUrl}/api/deliveries/6712b001a1b2c3d4e5f60001/verify-pin`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin: '4821' }),
      });
      const data: any = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Delivery is already completed');
    });
  });
});
