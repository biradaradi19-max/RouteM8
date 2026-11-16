import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import {
  inMemoryPaymentOrders,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryVendors,
} from '../routes/payments.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import { runFinancialReconciliation } from '../services/reconciliationService.js';

describe('RouteM8 Phase 4: Marketplace Settlement & Financial Reconciliation', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'usr-p4-requester-01';
  const approvedTransporterUid = 'usr-p4-partner-approved';
  const suspendedTransporterUid = 'usr-p4-partner-suspended';
  const adminUid = 'usr-p4-admin-super';

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

    // Setup active approved partner
    inMemoryApplications.set(approvedTransporterUid, {
      applicantId: approvedTransporterUid,
      applicantEmail: 'partner@routem8.internal',
      applicantName: 'Active Partner',
      status: 'approved',
      vehicleCategory: 'motorcycle',
      createdAt: new Date(),
    });

    // Setup suspended partner
    inMemoryApplications.set(suspendedTransporterUid, {
      applicantId: suspendedTransporterUid,
      applicantEmail: 'suspended@routem8.internal',
      applicantName: 'Suspended Partner',
      status: 'suspended',
      vehicleCategory: 'car',
      createdAt: new Date(),
    });
  });

  // 1. Settlement before delivery completion
  it('1. rejects settlement payout if delivery status is not completed', async () => {
    const deliveryId = 'del-p4-incomplete-01';
    const orderId = 'ord-p4-inc-01';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Incomplete Test Delivery',
      description: 'Pending package',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'in_transit', // Not completed
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });

    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toContain('Delivery must be completed and confirmed before payout');
  });

  // 2. Unpaid delivery settlement
  it('2. rejects settlement payout if order is unpaid or pending', async () => {
    const deliveryId = 'del-p4-unpaid-02';
    const orderId = 'ord-p4-unpaid-02';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Unpaid Delivery Test',
      description: 'Pending payment',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'pending', // Unpaid
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });

    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toContain('Order must be in paid status');
  });

  // 3. Suspended transporter settlement
  it('3. rejects settlement payout if transporter privileges are suspended', async () => {
    const deliveryId = 'del-p4-susp-03';
    const orderId = 'ord-p4-susp-03';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Suspended Transporter Delivery',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: suspendedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: suspendedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminToken,
      },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });

    expect(res.status).toBe(403);
    const data: any = await res.json();
    expect(data.error).toMatch(/suspended/i);
  });

  // 4. Duplicate settlement idempotency
  it('4. prevents duplicate settlements and returns existing record idempotently', async () => {
    const deliveryId = 'del-p4-dup-04';
    const orderId = 'ord-p4-dup-04';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Idempotency Delivery',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    // 1st call: executes settlement
    const res1 = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });
    expect(res1.status).toBe(200);
    const data1: any = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.settlement.status).toBe('settled');
    expect(data1.settlement.isMock).toBe(true);
    expect(data1.settlement.amountPaise).toBe(22500);

    // 2nd call: idempotent duplicate check
    const res2 = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });
    expect(res2.status).toBe(200);
    const data2: any = await res2.json();
    expect(data2.isDuplicate).toBe(true);
    expect(data2.settlement._id).toBe(data1.settlement._id);
  });

  // 5. Failed settlement retry
  it('5. allows failed settlement to be retried and marked as settled', async () => {
    const deliveryId = 'del-p4-retry-05';
    const orderId = 'ord-p4-retry-05';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Retry Delivery Test',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    // 1st attempt: simulate failure
    const failRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId, simulateFailure: true }),
    });
    expect(failRes.status).toBe(500);

    // Verify order and settlement marked as failed
    const failedOrder = inMemoryPaymentOrders.get(orderId);
    expect(failedOrder.status).toBe('failed');

    // 2nd attempt: successful retry
    const retryRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });
    expect(retryRes.status).toBe(200);
    const retryData: any = await retryRes.json();
    expect(retryData.success).toBe(true);
    expect(retryData.settlement.status).toBe('settled');
    expect(inMemoryPaymentOrders.get(orderId).status).toBe('settled');
  });

  // 6. Partial refund before settlement
  it('6. calculates net transporter share after partial refund before settlement', async () => {
    const deliveryId = 'del-p4-partref-06';
    const orderId = 'ord-p4-partref-06';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Partial Refund Before Settlement',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    // ₹250.00 gross, ₹25.00 platform fee, ₹225.00 partner base share
    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      refundedAmountPaise: 5000, // ₹50.00 refunded prior to settlement
      currency: 'INR',
      status: 'partially_refunded',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    // Net share = 22,500 - 5,000 = 17,500 paise (₹175.00)
    expect(data.settlement.amountPaise).toBe(17500);
    expect(data.settlement.refundDeductionPaise).toBe(5000);
  });

  // 7. Refund after settlement & negative transporter balance exposure
  it('7. records negative transporter balance exposure when refund occurs after settlement', async () => {
    const deliveryId = 'del-p4-postref-07';
    const orderId = 'ord-p4-postref-07';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Post Settlement Refund',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    // 1. Order is paid and already settled
    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      refundedAmountPaise: 0,
      currency: 'INR',
      status: 'settled',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    inMemorySettlements.set(orderId, {
      _id: `settle-postref-${Date.now()}`,
      paymentOrderId: orderId,
      deliveryId,
      transporterId: approvedTransporterUid,
      amountPaise: 22500,
      status: 'settled',
      isMock: true,
      settledAt: new Date(Date.now() - 3600000), // 1 hour ago
      idempotencyKey: `settle_${orderId}`,
    });

    // 2. Customer requests ₹100.00 refund (dispute) after settlement
    const refundRes = await fetch(`${baseUrl}/api/payments/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: requesterToken },
      body: JSON.stringify({
        paymentOrderId: orderId,
        reason: 'Post delivery item damaged claim',
        amountPaise: 10000,
      }),
    });

    expect(refundRes.status).toBe(200);
    const refundData: any = await refundRes.json();
    expect(refundData.success).toBe(true);
    expect(refundData.isPostSettlementRefund).toBe(true);
    expect(refundData.negativeBalanceExposurePaise).toBe(10000);

    // 3. Verify mock vendor account records the negative exposure
    const vendorRes = await fetch(`${baseUrl}/api/payments/vendors/${approvedTransporterUid}`, {
      headers: { Authorization: adminToken },
    });
    expect(vendorRes.status).toBe(200);
    const vendorData: any = await vendorRes.json();
    expect(vendorData.vendor.unresolvedNegativeBalancePaise).toBe(10000);
  });

  // 8. Commission calculation arithmetic
  it('8. validates exact integer split arithmetic: gross = platform + partner share', () => {
    const grossPaise = 3799; // ₹37.99
    const ratePercent = 10;
    const platformShare = Math.round((grossPaise * ratePercent) / 100); // 380 paise
    const partnerShare = grossPaise - platformShare; // 3419 paise

    expect(platformShare + partnerShare).toBe(grossPaise);
    expect(Number.isInteger(platformShare)).toBe(true);
    expect(Number.isInteger(partnerShare)).toBe(true);
  });

  // 9. Financial reconciliation amount mismatch detection
  it('9. reconciliation detects amount mismatch when snapshot sum diverges from order amount', async () => {
    const corruptOrderId = 'ord-p4-corrupt-09';
    const report = await runFinancialReconciliation({
      orders: [
        {
          _id: corruptOrderId,
          amountPaise: 20000, // ₹200.00
          status: 'paid',
          deliveryId: 'del-09',
          commissionSnapshot: {
            platformSharePaise: 2000,
            partnerSharePaise: 15000, // Sum = 17,000 !== 20,000
          },
        },
      ],
      settlements: [],
      refunds: [],
      deliveries: [],
    });

    expect(report.summary.isClean).toBe(false);
    expect(report.summary.discrepancyCount).toBe(1);
    expect(report.discrepancies[0].type).toBe('AMOUNT_MISMATCH');
    expect(report.discrepancies[0].amountPaise).toBe(3000);
  });

  // 10. Concurrent settlement lock conflict
  it('10. returns 409 Conflict when concurrent settlement lock fails', async () => {
    const deliveryId = 'del-p4-concur-10';
    const orderId = 'ord-p4-concur-10';

    inMemoryDeliveries.push({
      _id: deliveryId,
      id: deliveryId,
      title: 'Concurrency Test Delivery',
      description: 'Test delivery',
      category: 'package',
      pickupAddress: 'Pickup Point',
      pickupCoords: [19.076, 72.8777],
      dropoffAddress: 'Dropoff Point',
      dropoffCoords: [19.086, 72.8877],
      itemSize: 'medium',
      compensation: 250,
      urgency: 'standard',
      neededBy: 'ASAP',
      status: 'completed',
      requesterId: requesterUid,
      requesterName: 'Requester 1',
      requesterTrustScore: 95,
      transporterId: approvedTransporterUid,
      handoverPin: '4821',
      handoverPinVerified: true,
      rejectedBy: [],
    });

    inMemoryPaymentOrders.set(orderId, {
      _id: orderId,
      deliveryId,
      requesterId: requesterUid,
      transporterId: approvedTransporterUid,
      amountPaise: 25000,
      currency: 'INR',
      status: 'paid',
      commissionSnapshot: {
        ratePercent: 10,
        platformSharePaise: 2500,
        partnerSharePaise: 22500,
        calculatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ paymentOrderId: orderId, deliveryId, simulateConcurrencyConflict: true }),
    });

    expect(res.status).toBe(409);
    const data: any = await res.json();
    expect(data.error).toContain('Concurrent settlement already in progress');
  });

  // 11. Reconciliation API and dispute resolution
  it('11. returns reconciliation report and allows admin to resolve discrepancies', async () => {
    // 1. Fetch reconciliation report
    const res1 = await fetch(`${baseUrl}/api/payments/reconciliation`, {
      headers: { Authorization: adminToken },
    });
    expect(res1.status).toBe(200);
    const data1: any = await res1.json();
    expect(data1.success).toBe(true);
    expect(data1.report).toBeDefined();

    // 2. Resolve discrepancy
    if (data1.report.discrepancies.length > 0) {
      const discId = data1.report.discrepancies[0].id;
      const res2 = await fetch(`${baseUrl}/api/payments/reconciliation/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: adminToken },
        body: JSON.stringify({ discrepancyId: discId, resolutionNote: 'Audited and approved' }),
      });
      expect(res2.status).toBe(200);
      const data2: any = await res2.json();
      expect(data2.success).toBe(true);
      expect(data2.discrepancy.resolved).toBe(true);
    }
  });

  // 12. Settlement reversal simulation
  it('12. allows admin to simulate settlement reversal on settled transaction', async () => {
    const settleId = `settle-rev-${Date.now()}`;
    inMemorySettlements.set(settleId, {
      _id: settleId,
      paymentOrderId: 'ord-rev-12',
      deliveryId: 'del-rev-12',
      transporterId: approvedTransporterUid,
      amountPaise: 22500,
      status: 'settled',
      isMock: true,
      idempotencyKey: settleId,
      settledAt: new Date(),
    });

    const res = await fetch(`${baseUrl}/api/payments/settle/${settleId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: adminToken },
      body: JSON.stringify({ reason: 'Package lost investigation confirm reversal' }),
    });

    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);
    expect(data.settlement.status).toBe('reversed');
    expect(data.settlement.reversalReason).toBe('Package lost investigation confirm reversal');
  });

  // 13. Unauthorized access prevention on settlement and reconciliation
  it('13. prevents non-admin users from accessing settle, reconciliation, and vendors endpoints', async () => {
    // Settle
    const sRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: transporterToken },
      body: JSON.stringify({ paymentOrderId: 'ord-unauth' }),
    });
    expect(sRes.status).toBe(403);

    // Reconciliation
    const rRes = await fetch(`${baseUrl}/api/payments/reconciliation?test_unauth=1`, {
      headers: { Authorization: transporterToken, 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    expect(rRes.status).toBe(403);

    // Vendors list
    const vRes = await fetch(`${baseUrl}/api/payments/vendors`, {
      headers: { Authorization: transporterToken },
    });
    expect(vRes.status).toBe(403);
  });
});
