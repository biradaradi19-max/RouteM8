// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import {
  inMemoryPaymentOrders,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryVendors,
  inMemorySettlementLocks,
  inMemoryRefundLocks,
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { inMemoryDiscrepancies, runFinancialReconciliation } from '../services/reconciliationService.js';

describe('RouteM8 Phase 4.1: Financial Ledger Integrity & Concurrency Hardening', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'usr-p41-req-01';
  const approvedTransporterUid = 'usr-p41-partner-approved';
  const adminUid = 'usr-p41-admin-super';

  const requesterToken = `Bearer mock-token-${requesterUid}`;
  const transporterToken = `Bearer mock-token-${approvedTransporterUid}`;
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
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryApplications.clear();
    inMemoryVendors.clear();
    inMemorySettlementLocks.clear();
    inMemoryRefundLocks.clear();
    inMemoryDiscrepancies.clear();

    // Setup active approved partner
    inMemoryApplications.set(approvedTransporterUid, {
      applicantId: approvedTransporterUid,
      applicantEmail: 'partner@routem8.internal',
      applicantName: 'Active Partner 4.1',
      status: 'approved',
      vehicleCategory: 'motorcycle',
      createdAt: new Date(),
    });
  });

  // 1. Two simultaneous settlement requests for one order
  it('1. prevents duplicate settlements during concurrent settlement requests for the same order', async () => {
    const deliveryId = 'del-p41-simul-settle';
    const orderId = 'ord-p41-simul-settle';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Simultaneous Settle Test',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '9988',
      handoverPinVerified: true,
      compensation: 250,
      createdAt: new Date(),
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    // Fire 2 simultaneous settlement requests
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({ paymentOrderId: orderId, idempotencyKey: `idemp-sim-1` }),
      }),
      fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({ paymentOrderId: orderId, idempotencyKey: `idemp-sim-2` }),
      }),
    ]);

    const statuses = [res1.status, res2.status];
    // One must succeed (200), the other either receives 200 duplicate or 409 conflict
    expect(statuses.includes(200)).toBe(true);
    for (const status of statuses) {
      expect([200, 409]).toContain(status);
    }

    // Inspect in-memory settlements: exactly one primary settlement should exist for this order
    const primarySettlements = Array.from(inMemorySettlements.values()).filter(
      (s) => s.paymentOrderId === orderId && s.entryType === 'settlement' && s.status === 'settled'
    );
    expect(primarySettlements.length).toBe(1);
    expect(primarySettlements[0].amountPaise).toBe(22500);
  });

  // 2. Two simultaneous refund requests
  it('2. prevents concurrent over-refunds from exceeding total order balance', async () => {
    const deliveryId = 'del-p41-simul-refund';
    const orderId = 'ord-p41-simul-refund';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Simultaneous Refund Test',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '1122',
      handoverPinVerified: true,
      compensation: 100,
      createdAt: new Date(),
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 10000, // Total captured = ₹100.00
      refundedAmountPaise: 0,
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 1000,
        partnerSharePaise: 9000,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    // Fire 2 concurrent refund requests for 6,000 paise each (6000 + 6000 = 12000 > 10000 balance)
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({ paymentOrderId: orderId, amountPaise: 6000, reason: 'Refund Request A' }),
      }),
      fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({ paymentOrderId: orderId, amountPaise: 6000, reason: 'Refund Request B' }),
      }),
    ]);

    const statuses = [res1.status, res2.status];
    // Exactly one must succeed (200), and the second must be rejected (400 or 409)
    expect(statuses.includes(200)).toBe(true);
    expect(statuses.some((s) => s === 400 || s === 409)).toBe(true);

    const order = inMemoryPaymentOrders.get(orderId);
    expect(order.refundedAmountPaise).toBe(6000); // Must never exceed 10000
    expect(order.status).toBe('partially_refunded');
  });

  // 3. Refund and settlement requests executing concurrently
  it('3. rejects refund with 409 Conflict when order settlement is actively in progress', async () => {
    const deliveryId = 'del-p41-race-settle-ref';
    const orderId = 'ord-p41-race-settle-ref';

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 20000,
      refundedAmountPaise: 0,
      status: 'split_pending', // Actively locked in settlement
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2000,
        partnerSharePaise: 18000,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/payments/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, amountPaise: 5000, reason: 'Raced refund attempt' }),
    });

    expect(res.status).toBe(409);
    const data: any = await res.json();
    expect(data.error).toContain('Settlement is currently in progress for this order');
  });

  // 4. Duplicate reversal attempts
  it('4. prevents duplicate reversal attempts on an already reversed settlement', async () => {
    const settleId = `settle-p41-dup-rev-${Date.now()}`;
    inMemorySettlements.set(settleId, {
      _id: settleId,
      paymentOrderId: 'ord-p41-rev-01',
      deliveryId: 'del-p41-rev-01',
      transporterId: approvedTransporterUid,
      amountPaise: 18000,
      status: 'settled',
      entryType: 'settlement',
      isMock: true,
      idempotencyKey: settleId,
      settledAt: new Date(),
    });

    // First reversal attempt
    const res1 = await fetch(`${baseUrl}/api/payments/settle/${settleId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ reason: 'Legitimate dispute: goods damaged during transport' }),
    });

    expect(res1.status).toBe(200);
    const data1: any = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.reversalEntry).toBeDefined();
    expect(data1.reversalEntry.entryType).toBe('reversal');
    expect(data1.reversalEntry.status).toBe('reversed');
    expect(data1.recoveredRealMoney).toBe(false);

    // Second reversal attempt (must be blocked)
    const res2 = await fetch(`${baseUrl}/api/payments/settle/${settleId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ reason: 'Duplicate second attempt reversal' }),
    });

    expect(res2.status).toBe(400);
    const data2: any = await res2.json();
    expect(data2.error).toContain('already reversed');
  });

  // 5. Repeated reconciliation resolution
  it('5. enforces mandatory meaningful explanation and blocks repeated discrepancy resolutions', async () => {
    const discId = 'disc_test_repeat_res_01';
    inMemoryDiscrepancies.set(discId, {
      id: discId,
      type: 'AMOUNT_MISMATCH',
      severity: 'high',
      amountPaise: 1500,
      description: 'Test discrepancy for resolution audit',
      detectedAt: new Date(),
      resolved: false,
    });

    // Attempt resolution with short/empty explanation
    const shortRes = await fetch(`${baseUrl}/api/payments/reconciliation/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ discrepancyId: discId, resolutionNote: 'short' }),
    });
    expect(shortRes.status).toBe(400);
    const shortData: any = await shortRes.json();
    expect(shortData.error).toContain('meaningful explanation (at least 10 characters)');

    // Attempt resolution with valid explanation
    const validRes = await fetch(`${baseUrl}/api/payments/reconciliation/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({
        discrepancyId: discId,
        resolutionNote: 'Verified partner ledger adjustments manually with finance team',
      }),
    });
    expect(validRes.status).toBe(200);
    const validData: any = await validRes.json();
    expect(validData.success).toBe(true);
    expect(validData.discrepancy.resolved).toBe(true);
    expect(validData.discrepancy.resolvedBy).toBeDefined();

    // Repeated resolution attempt (must be blocked)
    const repeatRes = await fetch(`${baseUrl}/api/payments/reconciliation/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({
        discrepancyId: discId,
        resolutionNote: 'Attempting to overwrite previous resolution note',
      }),
    });
    expect(repeatRes.status).toBe(400);
    const repeatData: any = await repeatRes.json();
    expect(repeatData.error).toContain('Discrepancy is already resolved');
  });

  // 6. Partial negative-exposure recovery
  it('6. recovers transporter negative balance exposure in partial increments from future settlements', async () => {
    // Transporter starts with an unresolved debt of ₹50.00 (5000 paise)
    inMemoryVendors.set(approvedTransporterUid, {
      vendorId: `vend_mock_${approvedTransporterUid}`,
      transporterId: approvedTransporterUid,
      transporterName: 'Active Partner 4.1',
      verificationStatus: 'verified',
      bankAccountRef: 'HDFC-****4821',
      ifscCode: 'HDFC0001234',
      isEligibleForSettlement: true,
      unresolvedNegativeBalancePaise: 5000, // 5000 paise debt
      totalNegativeExposureRecoveredPaise: 0,
      isMock: true,
    });

    // Step A: Order 1 completed with partner share of ₹30.00 (3000 paise)
    // Debt (5000) > Share (3000): Partial recovery!
    const delId1 = 'del-recovery-part-1';
    const ordId1 = 'ord-recovery-part-1';

    inMemoryDeliveries.push({
      _id: delId1,
      id: delId1,
      title: 'Recovery Delivery 1',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '1234',
      handoverPinVerified: true,
      compensation: 33.33,
      createdAt: new Date(),
    });

    inMemoryPaymentOrders.set(ordId1, {
      _id: ordId1,
      deliveryId: delId1,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 3333,
      refundedAmountPaise: 0,
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 333,
        partnerSharePaise: 3000,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    const res1 = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: ordId1 }),
    });

    expect(res1.status).toBe(200);
    const data1: any = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.negativeBalanceOffsetPaise).toBe(3000); // 3000 offset towards debt
    expect(data1.payoutAmountPaise).toBe(0); // Net payout is zero
    expect(data1.remainingNegativeBalancePaise).toBe(2000); // 2000 debt remaining

    const vendorAfter1 = inMemoryVendors.get(approvedTransporterUid);
    expect(vendorAfter1.unresolvedNegativeBalancePaise).toBe(2000);
    expect(vendorAfter1.totalNegativeExposureRecoveredPaise).toBe(3000);

    // Step B: Order 2 completed with partner share of ₹40.00 (4000 paise)
    // Share (4000) > Remaining Debt (2000): Debt fully extinguished, remaining 2000 paid out!
    const delId2 = 'del-recovery-part-2';
    const ordId2 = 'ord-recovery-part-2';

    inMemoryDeliveries.push({
      _id: delId2,
      id: delId2,
      title: 'Recovery Delivery 2',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '5678',
      handoverPinVerified: true,
      compensation: 44.44,
      createdAt: new Date(),
    });

    inMemoryPaymentOrders.set(ordId2, {
      _id: ordId2,
      deliveryId: delId2,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 4444,
      refundedAmountPaise: 0,
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 444,
        partnerSharePaise: 4000,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    const res2 = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: ordId2 }),
    });

    expect(res2.status).toBe(200);
    const data2: any = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.negativeBalanceOffsetPaise).toBe(2000); // Full remaining debt cleared
    expect(data2.payoutAmountPaise).toBe(2000); // 4000 - 2000 = 2000 paid to transporter
    expect(data2.remainingNegativeBalancePaise).toBe(0);

    const vendorAfter2 = inMemoryVendors.get(approvedTransporterUid);
    expect(vendorAfter2.unresolvedNegativeBalancePaise).toBe(0);
    expect(vendorAfter2.totalNegativeExposureRecoveredPaise).toBe(5000);
  });

  // 7. Unauthorized financial operations
  it('7. strictly blocks unauthorized callers on all financial control endpoints', async () => {
    // Non-admin / requester calling settle
    const settleRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: requesterToken },
      body: JSON.stringify({ paymentOrderId: 'ord-unauth' }),
    });
    expect(settleRes.status).toBe(403);

    // Non-admin calling reverse
    const revRes = await fetch(`${baseUrl}/api/payments/settle/settle-1/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: transporterToken },
      body: JSON.stringify({ reason: 'Transporter attempting unauthorized reversal' }),
    });
    expect(revRes.status).toBe(403);

    // Requester attempting to view vendor accounts
    const vendorListRes = await fetch(`${baseUrl}/api/payments/vendors`, {
      headers: { Authorization: requesterToken },
    });
    expect(vendorListRes.status).toBe(403);

    // Requester attempting to view another user's vendor details
    const vendorDetailRes = await fetch(`${baseUrl}/api/payments/vendors/${approvedTransporterUid}`, {
      headers: { Authorization: requesterToken },
    });
    expect(vendorDetailRes.status).toBe(403);

    // Requester attempting to access reconciliation report
    const reconRes = await fetch(`${baseUrl}/api/payments/reconciliation?test_p41_unauth=1`, {
      headers: { Authorization: requesterToken, 'Cache-Control': 'no-cache' },
    });
    expect(reconRes.status).toBe(403);
  });

  // 8. Database failure during a financial operation
  it('8. handles simulated database failure safely without corrupting balances', async () => {
    const deliveryId = 'del-p41-db-fail';
    const orderId = 'ord-p41-db-fail';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Database Fail Test',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '3344',
      handoverPinVerified: true,
      compensation: 250,
      createdAt: new Date(),
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      refundedAmountPaise: 0,
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    // Settle with simulateDatabaseFailure
    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, simulateDatabaseFailure: true }),
    });

    expect(res.status).toBe(500);
    const data: any = await res.json();
    expect(data.error).toContain('Database failure during financial operation');

    // Confirm order is marked 'failed' and no phantom settlement exists
    const order = inMemoryPaymentOrders.get(orderId);
    expect(order.status).toBe('failed');
    expect(inMemorySettlements.has(orderId)).toBe(false);
  });

  // 9. Retry after an interrupted settlement operation
  it('9. allows safe retry after an interrupted or failed settlement', async () => {
    const deliveryId = 'del-p41-interrupted-retry';
    const orderId = 'ord-p41-interrupted-retry';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Interrupted Settle Test',
      status: 'completed',
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      handoverPin: '7788',
      handoverPinVerified: true,
      compensation: 250,
      createdAt: new Date(),
    });

    // Order was left in 'failed' status due to earlier network/timeout interruption
    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      refundedAmountPaise: 0,
      status: 'failed',
      failureReason: 'Interrupted by network disconnect during provider transfer',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
      createdAt: new Date(),
    });

    // Admin retries settlement
    const retryRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, idempotencyKey: `retry_key_${orderId}` }),
    });

    expect(retryRes.status).toBe(200);
    const retryData: any = await retryRes.json();
    expect(retryData.success).toBe(true);
    expect(retryData.settlement).toBeDefined();
    expect(retryData.settlement.status).toBe('settled');
    expect(retryData.settlement.amountPaise).toBe(22500);

    const order = inMemoryPaymentOrders.get(orderId);
    expect(order.status).toBe('settled');
  });

  // 10. Audit 10 discrepancy classes in reconciliation engine
  it('10. detects duplicate reversals, duplicate refunds, and invalid state transitions in reconciliation audit', async () => {
    const report = await runFinancialReconciliation({
      orders: [
        {
          _id: 'ord-disc-1',
          deliveryId: 'del-disc-1',
          transporterId: approvedTransporterUid,
          amountPaise: 10000,
          status: 'settled', // Marked settled without settlement record!
          commissionSnapshot: { platformSharePaise: 1000, partnerSharePaise: 9000 },
        },
        {
          _id: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          transporterId: approvedTransporterUid,
          amountPaise: 10000,
          status: 'paid',
          commissionSnapshot: { platformSharePaise: 1000, partnerSharePaise: 9000 },
        },
      ],
      settlements: [
        {
          _id: 'settle-orig-1',
          paymentOrderId: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          transporterId: approvedTransporterUid,
          amountPaise: 9000,
          status: 'settled',
          entryType: 'settlement',
        },
        {
          _id: 'rev-entry-1',
          paymentOrderId: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          transporterId: approvedTransporterUid,
          amountPaise: 9000,
          status: 'reversed',
          entryType: 'reversal',
          originalSettlementId: 'settle-orig-1',
        },
        {
          _id: 'rev-entry-2',
          paymentOrderId: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          transporterId: approvedTransporterUid,
          amountPaise: 9000,
          status: 'reversed',
          entryType: 'reversal',
          originalSettlementId: 'settle-orig-1', // Duplicate reversal!
        },
      ],
      refunds: [
        {
          _id: 'ref-dup-1',
          paymentOrderId: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          amountPaise: 8000,
          status: 'processed',
        },
        {
          _id: 'ref-dup-2',
          paymentOrderId: 'ord-disc-2',
          deliveryId: 'del-disc-2',
          amountPaise: 4000, // 8000 + 4000 = 12000 > 10000 order amount!
          status: 'processed',
        },
      ],
      deliveries: [
        { _id: 'del-disc-1', status: 'completed' },
        { _id: 'del-disc-2', status: 'completed' },
      ],
      vendors: [],
    });

    expect(report.summary.isClean).toBe(false);
    const types = report.discrepancies.map((d) => d.type);
    expect(types).toContain('INVALID_STATE_TRANSITION');
    expect(types).toContain('DUPLICATE_REVERSAL');
    expect(types).toContain('DUPLICATE_REFUND');
  });
});

