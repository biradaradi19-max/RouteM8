import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries, inMemoryLocations } from '../routes/deliveries.js';
import { inMemoryUsers } from '../routes/auth.js';

describe('60-Minute Emergency Production Readiness Sprint Regression Tests', () => {
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

  describe('P1. Delivery Creation & Persistence Verification', () => {
    it('rejects delivery creation when missing required fields', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-requester-99',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Incomplete Request',
          // missing coordinates and addresses
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Missing required delivery fields');
    });

    it('persists a valid delivery and masks handover PIN for non-requesters', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-requester-99',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Camera Equipment Bag',
          description: 'Fragile lens set in padded case',
          category: 'electronics',
          pickupAddress: 'Stanford Photo Lab, Stanford, CA',
          pickupCoords: [37.4275, -122.1697],
          dropoffAddress: 'Palo Alto Center, CA',
          dropoffCoords: [37.4418, -122.1601],
          itemSize: 'medium',
          compensation: 25.0,
          urgency: 'standard',
          neededBy: 'Today by 18:00',
        }),
      });

      expect(res.status).toBe(201);
      const created: any = await res.json();
      expect(created.id).toBeDefined();
      expect(created.requesterId).toBe('requester-99');
      // Requester who created it DOES receive the handoverPin
      expect(created.handoverPin).toBeDefined();

      // Retrieve via GET as a different partner user: handoverPin MUST be hidden
      const partnerRes = await fetch(`${baseUrl}/api/deliveries/${created.id}`, {
        headers: {
          Authorization: 'Bearer mock-token-partner-diff',
        },
      });
      expect(partnerRes.status).toBe(200);
      const partnerView: any = await partnerRes.json();
      expect(partnerView.handoverPin).toBeUndefined();
    });
  });

  describe('P2. Audio Calling (LiveKit) Route & Fallback', () => {
    it('denies LiveKit token to unauthorized third party', async () => {
      const res = await fetch(`${baseUrl}/api/livekit/token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-unauthorized-caller',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: '6712b001a1b2c3d4e5f60001',
        }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('generates LiveKit token for authorized delivery partner when active', async () => {
      const target = inMemoryDeliveries.find((d) => d.id === '6712b001a1b2c3d4e5f60001');
      if (target) {
        target.status = 'in_transit';
        target.transporterId = 'partner-livekit-1';
        target.requesterId = 'requester-livekit-1';
      }

      const res = await fetch(`${baseUrl}/api/livekit/token`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-livekit-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: '6712b001a1b2c3d4e5f60001',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.token).toBeDefined();
      expect(data.room).toBe('delivery-6712b001a1b2c3d4e5f60001');
      expect(data.role).toBe('Transporter');
    });
  });

  describe('P3. Partner Identity / Face Verification Route', () => {
    it('requires explicit consent before capturing/submitting verification selfie', async () => {
      const res = await fetch(`${baseUrl}/api/auth/partner-verification/selfie`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-verify-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consentGiven: false,
          selfieBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Explicit consent is required');
    });

    it('rejects invalid image data for selfie verification', async () => {
      const res = await fetch(`${baseUrl}/api/auth/partner-verification/selfie`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-verify-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consentGiven: true,
          selfieBase64: 'not-an-image',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('valid image snapshot is required');
    });

    it('records consent-based selfie and transitions verification status to pending_review', async () => {
      const res = await fetch(`${baseUrl}/api/auth/partner-verification/selfie`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock-token-partner-verify-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consentGiven: true,
          selfieBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('pending_review');
      expect(data.verificationStatus).toBe('pending_review');

      // Verify user profile reflects pending_review state
      const profile = inMemoryUsers.get('partner-verify-1');
      expect(profile?.verificationStatus).toBe('pending_review');
    });
  });
});
