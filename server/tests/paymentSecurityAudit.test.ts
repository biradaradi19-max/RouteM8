import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import {
  inMemoryPaymentOrders,
  inMemoryWebhookEvents,
  inMemorySettlements,
  inMemoryRefunds,
  getPaymentProvider,
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { CashfreePaymentAdapter } from '../services/payment/CashfreePaymentAdapter.js';
import { RazorpayPaymentAdapter } from '../services/payment/RazorpayPaymentAdapter.js';
import { MockPaymentProvider } from '../services/payment/MockPaymentProvider.js';
import { calculateCommission } from '../services/commissionEngine.js';

describe('RouteM8 Phase 3A.1: Financial Integrity & Payment Security Audit', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'usr-audit-req-001';
  const partnerUid = 'partner-audit-active-001';
  const suspendedPartnerUid = 'partner-audit-suspended-001';
  const rejectedPartnerUid = 'partner-audit-rejected-001';
  const adminUid = 'usr-audit-admin-001';

  const requesterToken = `Bearer mock-token-${requesterUid}`;
  const partnerToken = `Bearer mock-token-${partnerUid}`;
  const adminToken = `Bearer mock-token-${adminUid}`;

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

    // Register active approved partner
    inMemoryApplications.set(partnerUid, {
      applicantId: partnerUid,
      status: 'approved',
      vehicleCategory: 'motorcycle',
    });

    // Register suspended partner
    inMemoryApplications.set(suspendedPartnerUid, {
      applicantId: suspendedPartnerUid,
      status: 'suspended',
      vehicleCategory: 'motorcycle',
    });

    // Register rejected partner
    inMemoryApplications.set(rejectedPartnerUid, {
      applicantId: rejectedPartnerUid,
      status: 'rejected',
      vehicleCategory: 'car',
    });
  });

  // =========================================================================
  // 1. PROVIDER SIGNATURE VERIFICATION (CASHFREE & RAZORPAY SPECS)
  // =========================================================================
  describe('1. Provider Webhook Signature Verification Specifications', () => {
    const cashfreeSecret = 'test_cf_secret_key_1234567890abcdef';
    const razorpaySecret = 'test_rzp_secret_key_1234567890abcdef';

    it('Cashfree adapter validates authentic HMAC-SHA256 signature with fresh timestamp', async () => {
      process.env.CASHFREE_APP_ID = 'test_app_id';
      process.env.CASHFREE_SECRET_KEY = cashfreeSecret;

      const adapter = new CashfreePaymentAdapter();
      const rawPayload = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'cf_ord_999' } } });
      const currentTimestamp = Math.floor(Date.now() / 1000).toString();

      // Compute exact signature per Cashfree spec: HMAC-SHA256(timestamp + rawBody, secret) -> base64
      const validSig = crypto
        .createHmac('sha256', cashfreeSecret)
        .update(`${currentTimestamp}${rawPayload}`)
        .digest('base64');

      const result = await adapter.verifyWebhookSignature(rawPayload, validSig, currentTimestamp);
      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('PAYMENT_SUCCESS_WEBHOOK');
    });

    it('Cashfree adapter rejects expired timestamp to prevent replay attacks (> 5 minutes)', async () => {
      process.env.CASHFREE_APP_ID = 'test_app_id';
      process.env.CASHFREE_SECRET_KEY = cashfreeSecret;

      const adapter = new CashfreePaymentAdapter();
      const rawPayload = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
      // 10 minutes old timestamp
      const expiredTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();

      const sig = crypto
        .createHmac('sha256', cashfreeSecret)
        .update(`${expiredTimestamp}${rawPayload}`)
        .digest('base64');

      const result = await adapter.verifyWebhookSignature(rawPayload, sig, expiredTimestamp);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('timestamp expired or invalid');
    });

    it('Cashfree adapter rejects forged or corrupted signatures', async () => {
      process.env.CASHFREE_APP_ID = 'test_app_id';
      process.env.CASHFREE_SECRET_KEY = cashfreeSecret;

      const adapter = new CashfreePaymentAdapter();
      const rawPayload = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
      const currentTimestamp = Math.floor(Date.now() / 1000).toString();

      const result = await adapter.verifyWebhookSignature(rawPayload, 'forged_base64_signature==', currentTimestamp);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid Cashfree webhook HMAC signature');
    });

    it('Razorpay adapter validates authentic HMAC-SHA256 signature on raw request body', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
      process.env.RAZORPAY_KEY_SECRET = razorpaySecret;
      process.env.RAZORPAY_WEBHOOK_SECRET = razorpaySecret;

      const adapter = new RazorpayPaymentAdapter();
      const rawPayload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_999' } } } });

      // Compute exact signature per Razorpay spec: HMAC-SHA256(rawBody, secret) -> hex
      const validSig = crypto
        .createHmac('sha256', razorpaySecret)
        .update(rawPayload)
        .digest('hex');

      const result = await adapter.verifyWebhookSignature(rawPayload, validSig);
      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('payment.captured');
    });

    it('Razorpay adapter rejects forged signatures or missing headers', async () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
      process.env.RAZORPAY_KEY_SECRET = razorpaySecret;

      const adapter = new RazorpayPaymentAdapter();
      const rawPayload = JSON.stringify({ event: 'payment.captured' });

      const missingRes = await adapter.verifyWebhookSignature(rawPayload, '');
      expect(missingRes.isValid).toBe(false);
      expect(missingRes.error).toContain('Missing Razorpay webhook signature header');

      const forgedRes = await adapter.verifyWebhookSignature(rawPayload, 'abcdef0123456789abcdef0123456789');
      expect(forgedRes.isValid).toBe(false);
      expect(forgedRes.error).toContain('Invalid Razorpay webhook HMAC signature');
    });

    it('Strictly forbids MockPaymentProvider execution in production mode', async () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const mockProvider = new MockPaymentProvider();

        await expect(
          mockProvider.createOrder({ deliveryId: 'd1', requesterId: 'r1', requesterEmail: 'r1@test.com', amountPaise: 5000, idempotencyKey: 'k1' })
        ).rejects.toThrow('SECURITY VIOLATION: MockPaymentProvider is strictly forbidden in production');

        await expect(
          mockProvider.verifyWebhookSignature('{}', 'sig')
        ).rejects.toThrow('SECURITY VIOLATION: MockPaymentProvider is strictly forbidden in production');

        expect(() => getPaymentProvider('mock')).toThrow('SECURITY VIOLATION: MockPaymentProvider cannot execute in production');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // =========================================================================
  // 2. SETTLEMENT AUTHORIZATION & GATEKEEPERS
  // =========================================================================
  describe('2. Settlement Authorization & Strict Payout Gatekeepers', () => {
    const deliveryId = 'del-audit-settle-001';
    const orderId = 'pay-audit-settle-001';

    beforeEach(() => {
      inMemoryDeliveries.push({
        _id: deliveryId,
        id: deliveryId,
        requesterId: requesterUid,
        transporterId: partnerUid,
        status: 'completed',
        compensation: 60,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      inMemoryPaymentOrders.set(deliveryId, {
        _id: orderId,
        deliveryId,
        requesterId: requesterUid,
        transporterId: partnerUid,
        amountPaise: 6000,
        status: 'paid',
        commissionSnapshot: { ratePercent: 10, platformSharePaise: 600, partnerSharePaise: 5400, calculatedAt: new Date() },
      });
    });

    it('blocks ordinary requesters and transporters from triggering settlements (403 Forbidden)', async () => {
      const reqRes = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
      });
      expect(reqRes.status).toBe(403);

      const partRes = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: partnerToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
      });
      expect(partRes.status).toBe(403);
    });

    it('blocks settlement when delivery is not completed (status: in_transit) with 400 Bad Request', async () => {
      const del = inMemoryDeliveries.find((d) => d._id === deliveryId);
      if (del) del.status = 'in_transit';

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Delivery must be completed and confirmed before payout');
    });

    it('blocks settlement to suspended or rejected delivery partner with 403 Forbidden', async () => {
      // Reassign to suspended partner
      const ord = inMemoryPaymentOrders.get(deliveryId);
      ord.transporterId = suspendedPartnerUid;

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('suspended');
    });

    it('prevents settlement on refunded or cancelled orders with 400 Bad Request', async () => {
      const ord = inMemoryPaymentOrders.get(deliveryId);
      ord.status = 'refunded';

      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Order must be in paid status');
    });

    it('allows successful settlement and guarantees idempotency on duplicate retry', async () => {
      const payload = {
        paymentOrderId: orderId,
        deliveryId,
        idempotencyKey: 'idemp_audit_settle_unique_1',
      };

      const res1 = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res1.status).toBe(200);
      const data1: any = await res1.json();
      expect(data1.success).toBe(true);

      const ord = inMemoryPaymentOrders.get(deliveryId);
      expect(ord.status).toBe('settled');

      // Duplicate retry
      const res2 = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { Authorization: adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.isDuplicate).toBe(true);
    });
  });

  // =========================================================================
  // 3. CONCURRENT REFUND PROTECTION & BALANCE GUARDS
  // =========================================================================
  describe('3. Concurrent Refund Protection & Cumulative Balance Controls', () => {
    const refundDeliveryId = 'del-audit-refund-concur-001';
    const refundOrderId = 'pay-audit-refund-concur-001';

    beforeEach(() => {
      inMemoryPaymentOrders.set(refundDeliveryId, {
        _id: refundOrderId,
        deliveryId: refundDeliveryId,
        requesterId: requesterUid,
        amountPaise: 5000, // ₹50.00
        refundedAmountPaise: 0,
        status: 'paid',
        commissionSnapshot: { ratePercent: 10, platformSharePaise: 500, partnerSharePaise: 4500, calculatedAt: new Date() },
      });
    });

    it('prevents simultaneous concurrent refunds from exceeding original captured amount', async () => {
      // Two simultaneous requests of ₹35.00 each on a ₹50.00 order (Total ₹70.00 > ₹50.00)
      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/api/payments/refund`, {
          method: 'POST',
          headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentOrderId: refundOrderId, amountPaise: 3500, reason: 'Parallel refund request A', idempotencyKey: 'par_ref_A' }),
        }),
        fetch(`${baseUrl}/api/payments/refund`, {
          method: 'POST',
          headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentOrderId: refundOrderId, amountPaise: 3500, reason: 'Parallel refund request B', idempotencyKey: 'par_ref_B' }),
        }),
      ]);

      const statuses = [resA.status, resB.status];
      // Exactly one must succeed (200) and one must be rejected (400)
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.refundedAmountPaise).toBe(3500);
      expect(ord.status).toBe('partially_refunded');
    });

    it('restores refundable balance if a refund fails during processing', async () => {
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: refundOrderId,
          amountPaise: 2000,
          reason: 'Test balance restoration simulate_failure',
          idempotencyKey: 'fail_ref_1',
        }),
      });

      expect(res.status).toBe(500);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      // Balance must NOT be reduced by failed refund
      expect(ord.refundedAmountPaise).toBe(0);
      expect(ord.status).toBe('paid');
    });
  });

  // =========================================================================
  // 4. COMMISSION & ORDER IMMUTABILITY
  // =========================================================================
  describe('4. Commission and Order Immutability', () => {
    it('ignores client attempts to alter amount or commission parameters in order creation', async () => {
      inMemoryDeliveries.push({
        _id: 'del-tamper-check-1',
        id: 'del-tamper-check-1',
        requesterId: requesterUid,
        compensation: 50, // ₹50.00 = 5000 paise
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryId: 'del-tamper-check-1',
          amountPaise: 100, // malicious attempt to pay ₹1 instead of ₹50
          commissionRate: 0, // malicious attempt to bypass fee
        }),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      // Server derived exact compensation from DeliveryRequest
      expect(data.order.amountPaise).toBe(5000);
      expect(data.order.commissionSnapshot.platformSharePaise).toBe(600);
    });

    it('retains 100% partner + platform distribution without integer rounding drift on odd paise amounts', async () => {
      // Test odd paise amounts across varied rates
      const testCases = [
        { amount: 3333, rate: 10 },
        { amount: 7777, rate: 7.5 },
        { amount: 101, rate: 12.3 },
      ];

      for (const tc of testCases) {
        const res = await calculateCommission(tc.amount, tc.rate);
        expect(res.snapshot.platformSharePaise + res.snapshot.partnerSharePaise).toBe(tc.amount);
        expect(Number.isInteger(res.snapshot.platformSharePaise)).toBe(true);
        expect(Number.isInteger(res.snapshot.partnerSharePaise)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 5. PAYMENT LIFECYCLE & STATE TRANSITIONS
  // =========================================================================
  describe('5. Payment Lifecycle State Transitions', () => {
    it('rejects payment verification on a cancelled or refunded order with 400 Bad Request', async () => {
      inMemoryPaymentOrders.set('del-cancel-test', {
        _id: 'pay-cancel-test',
        deliveryId: 'del-cancel-test',
        providerOrderId: 'mock_ord_cancelled',
        status: 'cancelled',
        amountPaise: 3000,
      });

      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerOrderId: 'mock_ord_cancelled', providerPaymentId: 'pay_123' }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Cannot mark order as paid from terminal');
    });

    it('safely handles duplicate payment verification without double-charging or errors', async () => {
      inMemoryPaymentOrders.set('del-dup-verify', {
        _id: 'pay-dup-verify',
        deliveryId: 'del-dup-verify',
        providerOrderId: 'mock_ord_dup',
        status: 'paid',
        amountPaise: 2500,
      });

      const res = await fetch(`${baseUrl}/api/payments/verify`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerOrderId: 'mock_ord_dup', providerPaymentId: 'pay_duplicate_1' }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.alreadyPaid).toBe(true);
    });
  });
});
