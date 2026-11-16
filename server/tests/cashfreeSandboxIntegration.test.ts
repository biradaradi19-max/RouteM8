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
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { CashfreePaymentAdapter } from '../services/payment/CashfreePaymentAdapter.js';

describe('RouteM8 Phase 3B: Cashfree Sandbox Integration & Refund Safety', () => {
  let server: Server;
  let baseUrl: string;

  const testAppId = 'test_cf_app_998877';
  const testSecretKey = 'test_cf_secret_abcdef1234567890';
  const requesterUid = 'usr-cf-requester-001';
  const transporterUid = 'partner-cf-transporter-001';
  const adminUid = 'admin-cf-finance-001';

  const requesterToken = `Bearer mock-token-${requesterUid}`;
  const adminToken = `Bearer mock-token-${adminUid}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';
    process.env.CASHFREE_APP_ID = testAppId;
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    process.env.CASHFREE_ENV = 'sandbox';

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

    inMemoryApplications.set(transporterUid, {
      applicantId: transporterUid,
      status: 'approved',
      vehicleCategory: 'motorcycle',
    });
  });

  // =========================================================================
  // 1. CASHFREE SANDBOX ADAPTER SPECIFICATION & MOCK TRANSPORT
  // =========================================================================
  describe('1. Cashfree Sandbox Adapter PG Endpoints', () => {
    it('generates sandbox order with payment session id and valid INR float format', async () => {
      // Mock fetch transport for Cashfree PG /orders endpoint
      const mockFetch = async (url: any, opts: any) => {
        expect(url).toContain('/orders');
        expect(opts.method).toBe('POST');
        expect(opts.headers['x-client-id']).toBe(testAppId);
        expect(opts.headers['x-client-secret']).toBe(testSecretKey);

        const body = JSON.parse(opts.body);
        expect(body.order_amount).toBe(50.0); // ₹50.00 from 5000 paise
        expect(body.order_currency).toBe('INR');
        expect(body.customer_details.customer_id).toBe(requesterUid);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            cf_order_id: 'cf_ord_sandbox_12345',
            order_id: body.order_id,
            order_amount: 50.0,
            order_currency: 'INR',
            order_status: 'ACTIVE',
            payment_session_id: 'session_sandbox_token_abc999',
          }),
        } as any;
      };

      const adapter = new CashfreePaymentAdapter({
        appId: testAppId,
        secretKey: testSecretKey,
        fetchFn: mockFetch as any,
      });

      const res = await adapter.createOrder({
        deliveryId: 'del-cf-sandbox-01',
        requesterId: requesterUid,
        requesterEmail: 'test@example.com',
        amountPaise: 5000,
        currency: 'INR',
        idempotencyKey: 'idemp_cf_01',
      });

      expect(res.provider).toBe('cashfree');
      expect(res.providerOrderId).toBeDefined();
      expect(res.paymentSessionId).toBe('session_sandbox_token_abc999');
      expect(res.amountPaise).toBe(5000);
    });

    it('verifies payment server-side against Cashfree /orders/{order_id}/payments', async () => {
      const mockFetch = async (url: any) => {
        expect(url).toContain('/orders/ord_cf_verify_01/payments');
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              cf_payment_id: 'cf_pay_998877',
              order_id: 'ord_cf_verify_01',
              payment_status: 'SUCCESS',
              payment_amount: 50.0,
              payment_completion_time: '2026-11-11T12:00:00Z',
            },
          ],
        } as any;
      };

      const adapter = new CashfreePaymentAdapter({
        appId: testAppId,
        secretKey: testSecretKey,
        fetchFn: mockFetch as any,
      });

      const result = await adapter.verifyPayment({
        providerOrderId: 'ord_cf_verify_01',
      });

      expect(result.isValid).toBe(true);
      expect(result.status).toBe('paid');
      expect(result.amountPaise).toBe(5000);
    });

    it('rejects verification if transaction failed or was abandoned', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            cf_payment_id: 'cf_pay_fail_01',
            order_id: 'ord_cf_verify_fail',
            payment_status: 'USER_DROPPED',
            payment_amount: 50.0,
          },
        ],
      });

      const adapter = new CashfreePaymentAdapter({
        appId: testAppId,
        secretKey: testSecretKey,
        fetchFn: mockFetch as any,
      });

      const result = await adapter.verifyPayment({
        providerOrderId: 'ord_cf_verify_fail',
      });

      expect(result.isValid).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.failureReason).toContain('USER_DROPPED');
    });
  });

  // =========================================================================
  // 2. CASHFREE WEBHOOK SECURITY & RELIABILITY
  // =========================================================================
  describe('2. Cashfree Webhook Signature & Replay Protection', () => {
    it('accepts legitimate Cashfree webhook with valid HMAC-SHA256 and fresh timestamp', async () => {
      const rawPayload = JSON.stringify({
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_time: '2026-11-11T18:00:00Z',
        data: {
          order: { order_id: 'cf_ord_webhook_01' },
          payment: { cf_payment_id: 1234567, payment_status: 'SUCCESS' },
        },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Compute exact signature: base64(HMAC-SHA256(timestamp + rawBody, secret))
      const signature = crypto
        .createHmac('sha256', testSecretKey)
        .update(`${timestamp}${rawPayload}`)
        .digest('base64');

      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        body: rawPayload,
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.received).toBe(true);
    });

    it('rejects webhooks with expired timestamp (> 5 minutes) as replay attempts', async () => {
      const rawPayload = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
      // 10 minutes ago
      const expiredTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
      const signature = crypto
        .createHmac('sha256', testSecretKey)
        .update(`${expiredTimestamp}${rawPayload}`)
        .digest('base64');

      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': expiredTimestamp,
        },
        body: rawPayload,
      });

      expect(res.status).toBe(401);
      const data: any = await res.json();
      expect(data.details).toContain('timestamp expired or invalid');
    });

    it('idempotently handles duplicate webhooks without duplicate processing', async () => {
      const eventId = 'cf_unique_evt_778899';
      const rawPayload = JSON.stringify({
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        event_id: eventId,
        data: { order: { order_id: 'cf_ord_dup_01' } },
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = crypto
        .createHmac('sha256', testSecretKey)
        .update(`${timestamp}${rawPayload}`)
        .digest('base64');

      // First webhook post
      const res1 = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        body: rawPayload,
      });
      expect(res1.status).toBe(200);

      // Duplicate webhook delivery
      const res2 = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
          'x-webhook-timestamp': timestamp,
        },
        body: rawPayload,
      });
      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 3. REFUND TIMEOUT SAFETY & RECONCILIATION LIFECYCLE
  // =========================================================================
  describe('3. Refund Timeout Safety & Pending Reconciliation', () => {
    const refundDeliveryId = 'del-cf-refund-safety-01';
    const refundOrderId = 'pay-cf-refund-safety-01';

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

    it('NEVER releases atomic refund reservation merely because a request timed out', async () => {
      // Simulate network timeout / socket hangup
      const res = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: refundOrderId,
          amountPaise: 2500,
          reason: 'Item damaged in transit network_timeout_occurred',
          idempotencyKey: 'idemp_timeout_safe_01',
        }),
      });

      expect(res.status).toBe(202);
      const data: any = await res.json();
      expect(data.status).toBe('processing');
      expect(data.requiresReconciliation).toBe(true);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      // Critical check: Reservation MUST NOT be released!
      expect(ord.refundedAmountPaise).toBe(2500);
      expect(ord.status).toBe('partially_refunded');
    });

    it('successfully reconciles pending refund when provider subsequently confirms processing', async () => {
      // First initiate timeout refund
      const initRes = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: refundOrderId,
          amountPaise: 2000,
          reason: 'Network timeout test timeout_resolved_success',
          idempotencyKey: 'idemp_reconcile_success_01',
        }),
      });
      expect(initRes.status).toBe(202);

      // Admin reconciles refund
      const reconRes = await fetch(`${baseUrl}/api/payments/refund/idemp_reconcile_success_01/reconcile`, {
        method: 'POST',
        headers: { Authorization: adminToken },
      });

      expect(reconRes.status).toBe(200);
      const reconData: any = await reconRes.json();
      expect(reconData.status).toBe('processed');

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.refundedAmountPaise).toBe(2000);
    });

    it('releases atomic reservation when reconciliation confirms provider actually rejected/failed refund', async () => {
      // Initiate timeout refund with simulated failed provider outcome
      const initRes = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentOrderId: refundOrderId,
          amountPaise: 3000,
          reason: 'Network timeout test timeout_resolved_failed',
          idempotencyKey: 'idemp_reconcile_fail_01',
        }),
      });
      expect(initRes.status).toBe(202);

      const ord = inMemoryPaymentOrders.get(refundDeliveryId);
      expect(ord.refundedAmountPaise).toBe(3000);

      // Admin reconciles refund and provider confirms refund failed
      const reconRes = await fetch(`${baseUrl}/api/payments/refund/idemp_reconcile_fail_01/reconcile`, {
        method: 'POST',
        headers: { Authorization: adminToken },
      });

      expect(reconRes.status).toBe(200);
      const reconData: any = await reconRes.json();
      expect(reconData.status).toBe('failed');

      // Reservation released back to refundable balance
      expect(ord.refundedAmountPaise).toBe(0);
      expect(ord.status).toBe('paid');
    });

    it('rejects duplicate refund requests with identical idempotencyKey', async () => {
      const payload = {
        paymentOrderId: refundOrderId,
        amountPaise: 1500,
        reason: 'Duplicate refund test',
        idempotencyKey: 'idemp_dup_refund_001',
      };

      const res1 = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res1.status).toBe(200);

      const res2 = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { Authorization: requesterToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.isDuplicate).toBe(true);
    });
  });
});

