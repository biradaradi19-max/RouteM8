import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import {
  inMemoryPaymentOrders,
  inMemoryWebhookEvents,
  inMemorySettlements,
  inMemoryRefunds,
  inMemorySettlementLocks,
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import { runInterruptedOperationsRecovery } from '../services/recoveryService.js';

describe('RouteM8 Phase 5: Production Reliability, Recovery & Operations', () => {
  let server: Server;
  let baseUrl: string;
  const adminUid = 'admin-ops-phase5';
  const requesterUid = 'user-req-phase5';
  const transporterUid = 'partner-trans-phase5';
  const testSecretKey = 'test_webhook_secret_key_12345';

  const makeAuthHeader = (uid: string, _email?: string, _role?: string) => {
    return `Bearer mock-token-${uid}`;
  };

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENT_PROVIDER = 'mock';
    process.env.CASHFREE_SECRET_KEY = testSecretKey;
    process.env.CASHFREE_APP_ID = 'test_app_id';

    inMemoryDeliveries.length = 0;
    inMemoryPaymentOrders.clear();
    inMemoryWebhookEvents.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryApplications.clear();
    inMemorySettlementLocks.clear();

    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // =========================================================================
  // 1. INTERRUPTED OPERATION RECOVERY
  // =========================================================================
  describe('1. Interrupted Operation Recovery Engine', () => {
    it('synchronizes stuck split_pending order when settlement is already confirmed', async () => {
      const orderId = 'ord_stuck_01';
      inMemoryPaymentOrders.set(orderId, {
        _id: orderId,
        id: orderId,
        deliveryId: 'del_01',
        requesterId: requesterUid,
        transporterId: transporterUid,
        amountPaise: 50000,
        currency: 'INR',
        status: 'split_pending',
        provider: 'mock',
        refundedAmountPaise: 0,
      });

      inMemorySettlements.set(`set_${orderId}`, {
        _id: `set_${orderId}`,
        paymentOrderId: orderId,
        deliveryId: 'del_01',
        transporterId: transporterUid,
        amountPaise: 40000,
        status: 'settled',
        entryType: 'settlement',
        settledAt: new Date(),
      });

      const report = await runInterruptedOperationsRecovery({ targetOrderId: orderId });
      expect(report.recoveredItemsCount).toBeGreaterThan(0);
      expect(report.summary.stuckSplitPendingCount).toBe(1);

      const recoveredOrder = inMemoryPaymentOrders.get(orderId);
      expect(recoveredOrder.status).toBe('settled');
    });

    it('releases split_pending lock back to paid when settlement never completed', async () => {
      const orderId = 'ord_stuck_uncompleted_02';
      inMemoryPaymentOrders.set(orderId, {
        _id: orderId,
        id: orderId,
        deliveryId: 'del_02',
        requesterId: requesterUid,
        transporterId: transporterUid,
        amountPaise: 60000,
        currency: 'INR',
        status: 'split_pending',
        provider: 'mock',
        refundedAmountPaise: 0,
      });
      inMemorySettlementLocks.add(orderId);

      const report = await runInterruptedOperationsRecovery({ targetOrderId: orderId });
      expect(report.recoveredItemsCount).toBeGreaterThan(0);

      const recoveredOrder = inMemoryPaymentOrders.get(orderId);
      expect(recoveredOrder.status).toBe('paid');
      expect(recoveredOrder.failureReason).toContain('Recovered from interrupted split_pending');
      expect(inMemorySettlementLocks.has(orderId)).toBe(false);
    });

    it('reconciles indeterminate processing refund to processed', async () => {
      const refundId = 'ref_indeterminate_03';
      inMemoryRefunds.set(refundId, {
        _id: refundId,
        paymentOrderId: 'ord_03',
        deliveryId: 'del_03',
        requesterId: requesterUid,
        amountPaise: 25000,
        status: 'processing',
        idempotencyKey: 'key_ref_03',
        createdAt: new Date(),
      });

      const report = await runInterruptedOperationsRecovery();
      expect(report.summary.stuckProcessingRefundsCount).toBe(1);

      const recoveredRefund = inMemoryRefunds.get(refundId);
      expect(recoveredRefund.status).toBe('processed');
    });
  });

  // =========================================================================
  // 2. WEBHOOK RELIABILITY & OUT-OF-ORDER PROTECTION
  // =========================================================================
  describe('2. Webhook Out-of-Order & Duplicate Protection', () => {
    it('advances pending order to paid on payment success webhook', async () => {
      const orderId = 'ord_wh_success_10';
      inMemoryPaymentOrders.set(orderId, {
        _id: orderId,
        id: orderId,
        providerOrderId: orderId,
        deliveryId: 'del_10',
        amountPaise: 30000,
        status: 'pending',
        provider: 'mock',
      });

      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock-valid-signature-12345',
        },
        body: JSON.stringify({
          eventType: 'PAYMENT_SUCCESS_WEBHOOK',
          orderId,
          eventId: 'evt_wh_success_10',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.received).toBe(true);

      const order = inMemoryPaymentOrders.get(orderId);
      expect(order.status).toBe('paid');
    });

    it('protects already settled/paid order from being downgraded by out-of-order failure webhook', async () => {
      const orderId = 'ord_wh_settled_11';
      inMemoryPaymentOrders.set(orderId, {
        _id: orderId,
        id: orderId,
        providerOrderId: orderId,
        deliveryId: 'del_11',
        amountPaise: 45000,
        status: 'settled',
        provider: 'mock',
      });

      const res = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock-valid-signature-12345',
        },
        body: JSON.stringify({
          eventType: 'PAYMENT_FAILED_WEBHOOK',
          orderId,
          eventId: 'evt_out_of_order_fail_11',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.received).toBe(true);
      expect(data.ignoredOutOfOrder).toBe(true);

      // Crucial: Status must REMAIN settled, never downgraded to failed
      const order = inMemoryPaymentOrders.get(orderId);
      expect(order.status).toBe('settled');
    });

    it('idempotently handles duplicate webhook delivery', async () => {
      const eventId = 'evt_duplicate_wh_12';
      const payload = {
        eventType: 'PAYMENT_SUCCESS_WEBHOOK',
        orderId: 'ord_wh_12',
        eventId,
      };

      const res1 = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock-valid-signature-12345',
        },
        body: JSON.stringify(payload),
      });
      expect(res1.status).toBe(200);

      const res2 = await fetch(`${baseUrl}/api/payments/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': 'mock-valid-signature-12345',
        },
        body: JSON.stringify(payload),
      });
      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.duplicate).toBe(true);
    });
  });

  // =========================================================================
  // 3. OBSERVABILITY, CORRELATION IDS & SECURITY HEADERS
  // =========================================================================
  describe('3. Observability, Correlation IDs & Security Headers', () => {
    it('echoes back incoming x-correlation-id in response headers', async () => {
      const customCorrelationId = 'client-trace-abc-12345';
      const res = await fetch(`${baseUrl}/api/health`, {
        headers: { 'x-correlation-id': customCorrelationId },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-correlation-id')).toBe(customCorrelationId);
    });

    it('generates a new x-correlation-id if not provided by client', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.status).toBe(200);
      const generatedId = res.headers.get('x-correlation-id');
      expect(generatedId).toBeDefined();
      expect(generatedId).toMatch(/^req_/);
    });

    it('sets standard security headers on all responses', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    it('returns 200 and operational health metadata on GET /api/health and GET /api/ready', async () => {
      const resHealth = await fetch(`${baseUrl}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData: any = await resHealth.json();
      expect(healthData.status).toBe('ok');
      expect(healthData.service).toContain('RouteM8');

      const resReady = await fetch(`${baseUrl}/api/ready`);
      expect(resReady.status).toBe(200);
      const readyData: any = await resReady.json();
      expect(readyData.status).toBe('ready');
      expect(readyData.uptimeSeconds).toBeDefined();
      expect(readyData.memoryUsageMb).toBeDefined();
    });
  });

  // =========================================================================
  // 4. ADMIN RECOVERY API & RBAC
  // =========================================================================
  describe('4. Admin Recovery Endpoints & Role Authorization', () => {
    it('allows admin to inspect recovery status', async () => {
      inMemoryPaymentOrders.set('stuck_inspect_01', {
        _id: 'stuck_inspect_01',
        status: 'split_pending',
      });
      inMemoryRefunds.set('ref_inspect_01', {
        _id: 'ref_inspect_01',
        status: 'processing',
      });

      const res = await fetch(`${baseUrl}/api/payments/recover/status`, {
        headers: { Authorization: makeAuthHeader(adminUid, 'admin@routem8.internal', 'admin') },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.stuckSplitPendingCount).toBe(1);
      expect(data.stuckProcessingRefundsCount).toBe(1);
      expect(data.needsRecovery).toBe(true);
    });

    it('executes recovery sweep via POST /api/payments/recover', async () => {
      inMemoryPaymentOrders.set('stuck_exec_01', {
        _id: 'stuck_exec_01',
        id: 'stuck_exec_01',
        status: 'split_pending',
      });

      const res = await fetch(`${baseUrl}/api/payments/recover`, {
        method: 'POST',
        headers: {
          Authorization: makeAuthHeader(adminUid, 'admin@routem8.internal', 'admin'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetOrderId: 'stuck_exec_01' }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.report).toBeDefined();
      expect(data.report.recoveredItemsCount).toBe(1);
    });

    it('rejects unauthenticated and non-admin requests to recovery endpoints', async () => {
      // Unauthenticated
      const resUnauth = await fetch(`${baseUrl}/api/payments/recover/status`);
      expect(resUnauth.status).toBe(401);

      // Non-admin requester
      const resNonAdmin = await fetch(`${baseUrl}/api/payments/recover/status`, {
        headers: { Authorization: makeAuthHeader(requesterUid, 'user@test.local', 'requester') },
      });
      expect(resNonAdmin.status).toBe(403);
    });
  });
});
