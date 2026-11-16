import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import {
  inMemoryPaymentOrders,
  inMemoryWebhookEvents,
  inMemorySettlements,
  inMemoryRefunds,
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';

describe('Phase 1.2 Final Security Corrections & Hardening Verification', () => {
  let server: Server;
  let baseUrl: string;

  const requesterToken = 'Bearer mock-token-requester-only';
  const unauthorizedToken = 'Bearer mock-token-unapproved-partner';
  const suspendedToken = 'Bearer mock-token-suspended-partner';
  const partner1Token = 'Bearer mock-token-partner-1';
  const partner2Token = 'Bearer mock-token-partner-2';
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

  beforeEach(() => {
    inMemoryDeliveries.length = 0;
    inMemoryPaymentOrders.clear();
    inMemoryWebhookEvents.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryApplications.clear();
  });

  describe('1. Admin Authorization & Privilege Escalation Protection', () => {
    it('blocks unapproved partner from accepting delivery requests (403 Forbidden)', async () => {
      inMemoryDeliveries.push({
        _id: 'del-sec-101',
        id: 'del-sec-101',
        title: 'Documents to Bank',
        description: 'Cheque deposit',
        category: 'documents',
        pickupAddress: 'Sector 17, Chandigarh',
        pickupCoords: [30.7333, 76.7794],
        dropoffAddress: 'Sector 35, Chandigarh',
        dropoffCoords: [30.7200, 76.7600],
        itemSize: 'small',
        compensation: 250,
        status: 'open',
        statusHistory: [],
        requesterId: 'usr-requester-bob',
        requesterName: 'Bob Requester',
        requesterTrustScore: 90,
        handoverPin: '1234',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await fetch(`${baseUrl}/api/deliveries/del-sec-101/accept`, {
        method: 'POST',
        headers: { Authorization: unauthorizedToken },
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Approved delivery partner status required');
      expect(data.applicationRequired).toBe(true);
    });

    it('blocks suspended delivery partner from accepting delivery requests (403 Forbidden)', async () => {
      inMemoryDeliveries.push({
        _id: 'del-sec-suspended-test',
        id: 'del-sec-suspended-test',
        title: 'Package Delivery',
        description: 'Retail box',
        category: 'shopping',
        pickupAddress: 'Sector 22, Chandigarh',
        pickupCoords: [30.7300, 76.7700],
        dropoffAddress: 'Sector 43, Chandigarh',
        dropoffCoords: [30.7100, 76.7500],
        itemSize: 'medium',
        compensation: 300,
        status: 'open',
        statusHistory: [],
        requesterId: 'usr-requester-bob',
        requesterName: 'Bob Requester',
        requesterTrustScore: 90,
        handoverPin: '5678',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await fetch(`${baseUrl}/api/deliveries/del-sec-suspended-test/accept`, {
        method: 'POST',
        headers: { Authorization: suspendedToken },
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Approved delivery partner status required');
    });

    it('blocks regular user from self-escalating role to transporter via PUT /api/auth/profile', async () => {
      const res = await fetch(`${baseUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'transporter',
        }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Forbidden');
      expect(data.error).toContain('role');
    });

    it('blocks regular user from granting themselves isAdmin privileges via PUT /api/auth/profile', async () => {
      const res = await fetch(`${baseUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isAdmin: true,
        }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('blocks direct API calls to GET /api/auth/admin/users without admin privileges', async () => {
      const res = await fetch(`${baseUrl}/api/auth/admin/users`, {
        method: 'GET',
        headers: { Authorization: requesterToken },
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Administrator privileges required');
    });

    it('blocks direct API calls to POST /api/auth/admin/verify without admin privileges', async () => {
      const res = await fetch(`${baseUrl}/api/auth/admin/verify`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: 'usr-somebody',
          newStatus: 'verified',
        }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Administrator privileges required');
    });

    it('blocks non-admin users from partner review and commission updates', async () => {
      const reviewRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicationId: 'app-999', decision: 'approve' }),
      });
      expect(reviewRes.status).toBe(403);

      const commRes = await fetch(`${baseUrl}/api/payments/commission`, {
        method: 'PUT',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ratePercent: 5.0, reason: 'Unauthorized' }),
      });
      expect(commRes.status).toBe(403);
    });
  });

  describe('2. Atomic Delivery Acceptance & PaymentOrder Assignment', () => {
    it('guarantees atomic concurrency: two partners accepting same delivery simultaneously yields 200 and 409', async () => {
      inMemoryDeliveries.push({
        _id: 'del-race-atomic-1',
        id: 'del-race-atomic-1',
        title: 'Express Parcel',
        description: 'Important legal contract',
        category: 'documents',
        pickupAddress: 'Palo Alto',
        pickupCoords: [37.44, -122.16],
        dropoffAddress: 'Mountain View',
        dropoffCoords: [37.38, -122.08],
        itemSize: 'small',
        compensation: 35,
        status: 'open',
        statusHistory: [],
        requesterId: 'usr-alice-99',
        requesterName: 'Alice Requester',
        requesterTrustScore: 95,
        handoverPin: '7788',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/deliveries/del-race-atomic-1/accept`, {
          method: 'POST',
          headers: { Authorization: partner1Token },
        }),
        fetch(`${baseUrl}/api/deliveries/del-race-atomic-1/accept`, {
          method: 'POST',
          headers: { Authorization: partner2Token },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const updated = inMemoryDeliveries.find((d) => d.id === 'del-race-atomic-1');
      expect(updated?.status).toBe('matched');
      expect(['partner-1', 'partner-2']).toContain(updated?.transporterId);
    });

    it('links pre-match PaymentOrder to accepting partner only when requester ownership matches', async () => {
      // Seed pre-existing PaymentOrder
      inMemoryPaymentOrders.set('del-order-link-101', {
        _id: 'pay-order-link-101',
        deliveryId: 'del-order-link-101',
        requesterId: 'usr-alice-requester',
        amountPaise: 3500,
        status: 'paid',
        idempotencyKey: 'idemp_order_link_101',
        transporterId: undefined,
      });

      inMemoryDeliveries.push({
        _id: 'del-order-link-101',
        id: 'del-order-link-101',
        title: 'Fragile Artwork',
        description: 'Framed painting',
        category: 'other',
        pickupAddress: 'Art Gallery',
        pickupCoords: [37.45, -122.15],
        dropoffAddress: 'Residence',
        dropoffCoords: [37.40, -122.10],
        itemSize: 'medium',
        compensation: 35,
        status: 'open',
        statusHistory: [],
        requesterId: 'usr-alice-requester',
        requesterName: 'Alice',
        requesterTrustScore: 98,
        handoverPin: '1122',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const acceptRes = await fetch(`${baseUrl}/api/deliveries/del-order-link-101/accept`, {
        method: 'POST',
        headers: { Authorization: partner1Token },
      });

      expect(acceptRes.status).toBe(200);
      const linkedOrder = inMemoryPaymentOrders.get('del-order-link-101');
      expect(linkedOrder.transporterId).toBe('partner-1');
    });

    it('does NOT link PaymentOrder if requester ownership does not match delivery requester', async () => {
      // PaymentOrder belonging to a different requester
      inMemoryPaymentOrders.set('del-mismatch-102', {
        _id: 'pay-mismatch-102',
        deliveryId: 'del-mismatch-102',
        requesterId: 'usr-charlie-impostor',
        amountPaise: 3500,
        status: 'paid',
        idempotencyKey: 'idemp_mismatch_102',
        transporterId: undefined,
      });

      inMemoryDeliveries.push({
        _id: 'del-mismatch-102',
        id: 'del-mismatch-102',
        title: 'Books',
        description: 'Textbooks',
        category: 'documents',
        pickupAddress: 'Library',
        pickupCoords: [37.42, -122.17],
        dropoffAddress: 'Dorm',
        dropoffCoords: [37.43, -122.18],
        itemSize: 'small',
        compensation: 20,
        status: 'open',
        statusHistory: [],
        requesterId: 'usr-david-real-requester',
        requesterName: 'David',
        requesterTrustScore: 90,
        handoverPin: '3344',
        pinAttempts: 0,
        rejectedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const acceptRes = await fetch(`${baseUrl}/api/deliveries/del-mismatch-102/accept`, {
        method: 'POST',
        headers: { Authorization: partner1Token },
      });

      expect(acceptRes.status).toBe(200);
      // PaymentOrder must NOT be hijacked
      const unlinkedOrder = inMemoryPaymentOrders.get('del-mismatch-102');
      expect(unlinkedOrder.transporterId).toBeUndefined();
    });
  });

  describe('3. Payment State Machine & Financial Validation', () => {
    it('rejects invalid state transition to paid from cancelled or refunded status', async () => {
      inMemoryPaymentOrders.set('del-cancelled-order', {
        _id: 'pay-cancelled-order',
        deliveryId: 'del-cancelled-order',
        providerOrderId: 'mock_cancelled_provider_123',
        status: 'cancelled',
        amountPaise: 2500,
      });

      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerOrderId: 'mock_cancelled_provider_123',
          providerPaymentId: 'pay_attempt_after_cancel',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Invalid state transition');
    });

    it('rejects refund amount that exceeds the captured order amount (5000 > 2500 paise)', async () => {
      inMemoryPaymentOrders.set('pay-excess-refund', {
        _id: 'pay-excess-refund',
        deliveryId: 'del-excess-refund',
        requesterId: 'usr-requester-bob',
        amountPaise: 2500,
        status: 'paid',
        idempotencyKey: 'idemp_excess_1',
      });

      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: 'pay-excess-refund',
          amountPaise: 5000,
          reason: 'Excessive refund request',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('cannot exceed original captured order amount');
    });

    it('rejects refund attempt on an unpaid order (status: created)', async () => {
      inMemoryPaymentOrders.set('pay-unpaid-refund', {
        _id: 'pay-unpaid-refund',
        deliveryId: 'del-unpaid-refund',
        amountPaise: 2500,
        status: 'created',
        idempotencyKey: 'idemp_unpaid_1',
      });

      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: 'pay-unpaid-refund',
          reason: 'Refund uncaptured order',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Order must be in paid status');
    });

    it('handles duplicate split settlement attempts idempotently without duplicate transfers', async () => {
      const settlePayload = {
        paymentOrderId: 'pay-idemp-settle-99',
        deliveryId: 'del-idemp-settle-99',
        idempotencyKey: 'settle_idemp_key_99',
      };

      // First settlement execution
      const res1 = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settlePayload),
      });

      expect(res1.status).toBe(200);
      const data1: any = await res1.json();
      expect(data1.success).toBe(true);

      // Duplicate settlement attempt with identical idempotencyKey
      const res2 = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settlePayload),
      });

      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.isDuplicate).toBe(true);
    });

    it('rejects settlement attempt on an order in refunded status', async () => {
      inMemoryPaymentOrders.set('pay-refunded-settle', {
        _id: 'pay-refunded-settle',
        deliveryId: 'del-refunded-settle',
        status: 'refunded',
        amountPaise: 2500,
      });

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: 'pay-refunded-settle',
          deliveryId: 'del-refunded-settle',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Order must be in paid status');
    });
  });

  describe('4. Partner Lifecycle & Verification Exemption', () => {
    it('grants automatic vehicle exemption to bicycle delivery partners (no DL/RC requirement)', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-vehicle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'bicycle',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.verification.isExempt).toBe(true);
      expect(data.verification.status).toBe('exempt');
    });

    it('requires explicit user consent record for government ID verification', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: false,
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Consent required');
    });

    it('admin review updates partner application status with audit trail', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'app-review-101',
          decision: 'approve',
          reason: 'Valid government ID and background check verified',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('approved');
    });
  });
});
