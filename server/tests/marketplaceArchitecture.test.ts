import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';

describe('RouteM8 Marketplace & Security Foundation Integration Suite', () => {
  let server: Server;
  let baseUrl: string;

  const requesterToken = 'Bearer mock-token-requester-99';
  const partnerToken = 'Bearer mock-token-partner-1';
  const adminToken = 'Bearer mock-token-admin-root';

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

  describe('1. Partner Application Workflow', () => {
    it('allows an authenticated requester to submit a partner application', async () => {
      const res = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
          phone: '+919876543210',
          notes: 'Daily commuter on route',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.application).toBeDefined();
      expect(data.application.status).toBe('submitted');
      expect(data.application.vehicleCategory).toBe('motorcycle');
    });

    it('enforces informed consent before initiating identity verification', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: false, // Omitted or false
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toMatch(/consent required/i);
    });

    it('successfully initiates identity verification when consent is recorded and returns masked ID', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: true,
          consentVersion: 'v1.0-2026',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.referenceId).toMatch(/^mock_ref_/);
      expect(data.maskedId).toBe('XXXXXXXX8901');
    });

    it('exempts non-motorized vehicles (bicycle) from driving licence requirement', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-vehicle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'bicycle',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.verification.status).toBe('exempt');
      expect(data.verification.isExempt).toBe(true);
    });

    it('restricts admin review endpoints to administrators only', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken, // Regular requester tries to review
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'app-1',
          decision: 'approve',
        }),
      });

      expect(res.status).toBe(403);

      // Verify admin token succeeds
      const adminRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'app-1',
          decision: 'approve',
          reason: 'Verified credentials',
        }),
      });
      expect(adminRes.status).toBe(200);

      // Verify partner application status retrieval
      const statusRes = await fetch(`${baseUrl}/api/partner/application`, {
        headers: { Authorization: partnerToken },
      });
      expect(statusRes.status).toBe(200);
    });
  });

  describe('2. Payment Gateway & Order Creation', () => {
    it('creates a payment order with integer paise and immutable commission snapshot', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: 'del-mock-999',
        }),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.order).toBeDefined();
      expect(Number.isInteger(data.order.amountPaise)).toBe(true);
      expect(data.order.commissionSnapshot.platformSharePaise).toBeGreaterThan(0);
      expect(
        data.order.commissionSnapshot.platformSharePaise + data.order.commissionSnapshot.partnerSharePaise
      ).toBe(data.order.amountPaise);
    });

    it('rejects webhooks with missing or invalid signature headers', async () => {
      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No signature header
        },
        body: JSON.stringify({
          type: 'payment.success',
          id: 'evt_123',
        }),
      });

      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.error).toMatch(/signature/i);
    });

    it('accepts webhooks with valid mock signature header', async () => {
      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'sha256_mock_valid_signature_12345',
        },
        body: JSON.stringify({
          type: 'payment.success',
          id: 'evt_123',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.received).toBe(true);
    });
  });
});

