import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryPaymentOrders, inMemorySettlements, inMemoryRefunds, inMemoryWebhookEvents } from '../routes/payments.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { calculateCommission } from '../services/commissionEngine.js';

describe('RouteM8 Phase 3A: Payment Orchestration & Sandbox Foundation', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'requester-usr-888';
  const requesterToken = 'Bearer mock-token-requester-usr-888';
  const otherRequesterToken = 'Bearer mock-token-unrelated-intruder';
  const transporterUid = 'transporter-usr-999';
  const adminToken = 'Bearer mock-token-admin-finance';

  const testDeliveryId = 'del-lifecycle-test-001';
  const compensationPaise = 5000; // ₹50.00 = 5000 paise

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';

    // Reset all test in-memory state
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryWebhookEvents.clear();
    inMemoryDeliveries.length = 0;
    inMemoryApplications.clear();

    // Seed test delivery
    inMemoryDeliveries.push({
      _id: testDeliveryId,
      id: testDeliveryId,
      requesterId: requesterUid,
      transporterId: transporterUid,
      pickupAddress: 'Hiranandani Estate, Thane',
      dropoffAddress: 'Bandra Kurla Complex, Mumbai',
      pickupCoords: [19.25, 72.97],
      dropoffCoords: [19.06, 72.86],
      category: 'package',
      packageSize: 'medium',
      status: 'matched', // initially matched, not completed yet
      compensation: 50,
      handoverPin: '4321',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Seed approved transporter application
    inMemoryApplications.set(transporterUid, {
      _id: `app-${transporterUid}`,
      applicantId: transporterUid,
      vehicleCategory: 'motorcycle',
      status: 'approved',
    });

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

  // =========================================================================
  // 1. ORDER CREATION, OWNERSHIP & IDEMPOTENCY
  // =========================================================================
  describe('1. Payment Order Creation & Ownership Security', () => {
    it('blocks unauthenticated requests with 401', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId: testDeliveryId }),
      });
      expect(res.status).toBe(401);
    });

    it('blocks non-requester from creating payment order with 403', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: otherRequesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deliveryId: testDeliveryId }),
      });
      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Only the delivery requester can create payment order');
    });

    it('creates payment order with immutable integer paise commission snapshot', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testDeliveryId,
          idempotencyKey: 'idemp_order_001',
        }),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.order).toBeDefined();
      expect(data.order.status).toBe('created');
      expect(data.order.amountPaise).toBe(compensationPaise);
      expect(data.order.transporterId).toBe(transporterUid);
      expect(data.order.commissionSnapshot).toBeDefined();
      expect(data.order.commissionSnapshot.platformSharePaise + data.order.commissionSnapshot.partnerSharePaise).toBe(compensationPaise);
    });

    it('enforces idempotency on duplicate order creation attempts', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testDeliveryId,
          idempotencyKey: 'idemp_order_001',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.isDuplicate).toBe(true);
      expect(data.order.deliveryId).toBe(testDeliveryId);
    });
  });

  // =========================================================================
  // 2. PAYMENT VERIFICATION & DUPLICATE PROTECTION
  // =========================================================================
  describe('2. Payment Verification & Transition Guards', () => {
    let providerOrderId: string;

    beforeAll(() => {
      const ord = inMemoryPaymentOrders.get(testDeliveryId);
      providerOrderId = ord.providerOrderId;
    });

    it('rejects verification if providerOrderId is missing with 400', async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('successfully verifies payment and transitions order to "paid"', async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerOrderId,
          providerPaymentId: 'mock_pay_success_123',
          paymentSignature: 'mock_valid_signature_sha256',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.order.status).toBe('paid');

      const updated = inMemoryPaymentOrders.get(testDeliveryId);
      expect(updated.status).toBe('paid');
    });

    it('safely handles duplicate payment verification without double-charging or error', async () => {
      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerOrderId,
          providerPaymentId: 'mock_pay_success_123',
          paymentSignature: 'mock_valid_signature_sha256',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.alreadyPaid).toBe(true);
      expect(data.order.status).toBe('paid');
    });
  });

  // =========================================================================
  // 3. CRYPTOGRAPHIC WEBHOOK & REPLAY PROTECTION
  // =========================================================================
  describe('3. Cryptographic Webhook & Replay Protection', () => {
    it('rejects webhooks with invalid or missing HMAC signatures with 401', async () => {
      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'invalid_forged_sig',
        },
        body: JSON.stringify({ type: 'payment.captured', id: 'evt_101' }),
      });
      expect(res.status).toBe(401);
    });

    it('accepts valid signed webhook and records event', async () => {
      const eventId = 'evt_valid_market_001';
      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock_valid_hmac_signature_ok',
        },
        body: JSON.stringify({
          type: 'payment.captured',
          id: eventId,
          data: { orderId: 'ord_123' },
        }),
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.received).toBe(true);
      expect(inMemoryWebhookEvents.has(eventId)).toBe(true);
    });

    it('rejects webhook replays idempotently without re-execution', async () => {
      const eventId = 'evt_valid_market_001';
      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock_valid_hmac_signature_ok',
        },
        body: JSON.stringify({
          type: 'payment.captured',
          id: eventId,
          data: { orderId: 'ord_123' },
        }),
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 4. COMMISSION ENGINE: BETA (0%) & PERCENTAGE WITH INTEGER INTEGRITY
  // =========================================================================
  describe('4. Commission Engine & Integer Paise Arithmetic', () => {
    it('guarantees 100% partner compensation retention when beta commission is 0%', async () => {
      const result = await calculateCommission(7500, 0.0);
      expect(result.commissionRatePercent).toBe(0);
      expect(result.platformSharePaise).toBe(0);
      expect(result.partnerSharePaise).toBe(7500);
    });

    it('calculates standard commission without rounding drift across odd paise amounts', async () => {
      const testCases = [999, 1250, 3333, 4999, 10000];
      for (const amount of testCases) {
        const result = await calculateCommission(amount, 10.0);
        expect(result.platformSharePaise + result.partnerSharePaise).toBe(amount);
      }
    });

    it('rejects invalid or negative commission inputs', async () => {
      await expect(calculateCommission(-500)).rejects.toThrow();
      await expect(calculateCommission(2500, -5)).rejects.toThrow();
      await expect(calculateCommission(2500, 75)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 5. CUMULATIVE PARTIAL REFUNDS & BALANCE LIMITS
  // =========================================================================
  describe('5. Multiple Partial Refunds & Cumulative Balance Guards', () => {
    const refundDeliveryId = 'del-partial-refund-001';
    let paymentOrderId: string;

    beforeAll(() => {
      // Seed a ₹50.00 (5000 paise) paid order
      paymentOrderId = `pay-${refundDeliveryId}`;
      inMemoryPaymentOrders.set(refundDeliveryId, {
        _id: paymentOrderId,
        deliveryId: refundDeliveryId,
        requesterId: requesterUid,
        currency: 'INR',
        amountPaise: 5000,
        commissionSnapshot: { ratePercent: 10, platformSharePaise: 500, partnerSharePaise: 4500, calculatedAt: new Date() },
        provider: 'mock',
        providerOrderId: `mock_order_${refundDeliveryId}`,
        idempotencyKey: `idemp_${refundDeliveryId}`,
        status: 'paid',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('processes first partial refund and updates status to partially_refunded', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId,
          amountPaise: 1500, // ₹15.00
          reason: 'Item slightly damaged in transit',
          idempotencyKey: 'refund_part_1',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.remainingBalance).toBe(3500);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.status).toBe('partially_refunded');
    });

    it('processes second partial refund from remaining balance', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId,
          amountPaise: 2000, // ₹20.00
          reason: 'Additional delay discount agreement',
          idempotencyKey: 'refund_part_2',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.remainingBalance).toBe(1500);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.status).toBe('partially_refunded');
    });

    it('rejects refund attempt exceeding remaining balance with 400', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId,
          amountPaise: 2000, // Exceeds remaining 1500 paise!
          reason: 'Excessive refund claim',
          idempotencyKey: 'refund_part_overflow',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('exceeds remaining refundable balance');
    });

    it('completes final refund of remaining balance and transitions status to refunded', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId,
          amountPaise: 1500, // Exact remaining balance
          reason: 'Full cancellation of remainder',
          idempotencyKey: 'refund_part_final',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.remainingBalance).toBe(0);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.status).toBe('refunded');
    });

    it('rejects refund on fully refunded order with 400', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId,
          amountPaise: 100,
          reason: 'Impossible extra refund',
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 6. SETTLEMENT LIFECYCLE & DISPATCH GUARDS
  // =========================================================================
  describe('6. Split Settlement Gatekeepers & Payout Rules', () => {
    it('blocks non-admin users from executing settlement with 403', async () => {
      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deliveryId: testDeliveryId }),
      });
      expect(res.status).toBe(403);
    });

    it('refuses settlement when delivery is not yet completed with 400', async () => {
      // testDeliveryId is currently 'matched', not completed
      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deliveryId: testDeliveryId }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Delivery must be completed and confirmed before payout');
    });

    it('refuses settlement when transporter account is suspended with 403', async () => {
      // Mark delivery completed
      const delivery = inMemoryDeliveries.find((d) => d._id === testDeliveryId);
      if (delivery) delivery.status = 'completed';

      // Suspend the transporter in memory
      inMemoryApplications.set(transporterUid, {
        _id: `app-${transporterUid}`,
        applicantId: transporterUid,
        status: 'suspended',
      });

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deliveryId: testDeliveryId }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Partner privileges have been suspended');
    });

    it('successfully settles payment when delivery is completed and partner active', async () => {
      // Restore transporter to approved
      inMemoryApplications.set(transporterUid, {
        _id: `app-${transporterUid}`,
        applicantId: transporterUid,
        status: 'approved',
      });

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testDeliveryId,
          idempotencyKey: 'settle_test_001',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.settlement).toBeDefined();
      expect(data.settlement.status).toBe('settled');

      const ord = inMemoryPaymentOrders.get(testDeliveryId);
      expect(ord.status).toBe('settled');
    });

    it('handles duplicate settlement requests idempotently', async () => {
      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testDeliveryId,
          idempotencyKey: 'settle_test_001',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.isDuplicate).toBe(true);
    });
  });

  // =========================================================================
  // 7. FINANCIAL ADMINISTRATION OVERVIEW
  // =========================================================================
  describe('7. Financial Administration Ledger & Queries', () => {
    it('blocks unauthorized non-admin from accessing financial overview with 403', async () => {
      const res = await fetch(`${baseUrl}/api/payments/admin/overview`, {
        headers: { Authorization: requesterToken },
      });
      expect(res.status).toBe(403);
    });

    it('returns aggregated financial figures for admin with zero demo hardcoding', async () => {
      const res = await fetch(`${baseUrl}/api/payments/admin/overview`, {
        headers: { Authorization: adminToken },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.totalVolumePaise).toBeGreaterThan(0);
      expect(data.platformCommissionPaise).toBeGreaterThanOrEqual(0);
      expect(data.transporterPayablePaise).toBeGreaterThan(0);
      expect(data.totalOrdersCount).toBeGreaterThanOrEqual(2);
      expect(data.totalRefundedPaise).toBe(5000); // from the partial refunds test!
      expect(data.recentOrders).toBeDefined();
    });
  });
});

