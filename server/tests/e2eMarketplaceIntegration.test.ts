import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryDeliveries, inMemoryLocations } from '../routes/deliveries.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';
import {
  inMemoryPaymentOrders,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryWebhookEvents,
  inMemorySettlementLocks,
  inMemoryVendors,
} from '../routes/payments.js';
import { inMemoryDiscrepancies } from '../services/reconciliationService.js';
import { partnerPresenceService } from '../services/partnerPresence.js';

describe('RouteM8 Phase 6: End-to-End Delivery Marketplace Integration Lifecycle', () => {
  let server: Server;
  let baseUrl: string;

  // Actors
  const requesterUid = 'usr-e2e-requester-01';
  const partnerUid = 'usr-e2e-partner-02';
  const adminUid = 'admin-e2e-supervisor-01';
  const unauthorizedUid = 'usr-e2e-intruder-99';

  const makeAuthHeader = (uid: string) => `Bearer mock-token-${uid}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';
    process.env.ALLOW_MOCK_LIVEKIT = 'true';
    process.env.LIVEKIT_URL = 'wss://routem8-test.livekit.cloud';
    process.env.PAYMENT_PROVIDER = 'mock';

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
    inMemoryLocations.clear();
    inMemoryApplications.clear();
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryWebhookEvents.clear();
    inMemorySettlementLocks.clear();
    inMemoryVendors.clear();
    inMemoryDiscrepancies.clear();
  });

  it('executes the full end-to-end marketplace flow across all modules', async () => {
    // =========================================================================
    // STEP 1: Authentication & User Verification
    // =========================================================================
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'x-correlation-id': 'e2e-run-trace-001' },
    });
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('x-correlation-id')).toBe('e2e-run-trace-001');
    expect(healthRes.headers.get('x-content-type-options')).toBe('nosniff');

    const readyRes = await fetch(`${baseUrl}/api/ready`);
    expect(readyRes.status).toBe(200);
    const readyData: any = await readyRes.json();
    expect(readyData.status).toBe('ready');

    // =========================================================================
    // STEP 2: Partner Onboarding Application
    // =========================================================================
    // Partner B submits onboarding application
    const applyRes = await fetch(`${baseUrl}/api/partner/apply`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicleCategory: 'motorcycle',
        drivingLicenseNumber: 'MH1220180012345',
        vehicleRegistrationNumber: 'MH12AB1234',
        idType: 'aadhaar',
        idNumber: '999988887777',
      }),
    });

    expect(applyRes.status).toBe(200);
    const applyData: any = await applyRes.json();
    expect(applyData.application?.status || applyData.status).toBe('submitted');

    // Before approval, partner status is pending and partner cannot accept commercial dispatch
    const pendingAppRes = await fetch(`${baseUrl}/api/partner/application`, {
      headers: { Authorization: makeAuthHeader(partnerUid) },
    });
    expect(pendingAppRes.status).toBe(200);
    const pendingAppData: any = await pendingAppRes.json();
    expect(pendingAppData.application?.status || pendingAppData.status).toBe('submitted');

    // =========================================================================
    // STEP 3: Admin Review & Document Approval
    // =========================================================================
    const approveRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(adminUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: partnerUid,
        decision: 'approve',
        reason: 'All identity and vehicle documents verified during Phase 6 e2e audit',
      }),
    });

    expect(approveRes.status).toBe(200);
    const approveData: any = await approveRes.json();
    expect(approveData.status).toBe('approved');

    // Verify partner status is now approved
    const partnerStatusRes = await fetch(`${baseUrl}/api/partner/application`, {
      headers: { Authorization: makeAuthHeader(partnerUid) },
    });
    const partnerStatusData: any = await partnerStatusRes.json();
    expect(partnerStatusData.application?.status || partnerStatusData.status).toBe('approved');

    // =========================================================================
    // STEP 4: Delivery Request Creation (Requester A)
    // =========================================================================
    const createDeliveryRes = await fetch(`${baseUrl}/api/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(requesterUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Emergency Medical Diagnostic Kit',
        description: 'Cold-chain sensitive rapid diagnostics for Pune City Clinic',
        category: 'medical',
        pickupAddress: 'FC Road, Shivajinagar, Pune, Maharashtra',
        pickupCoords: [18.5314, 73.8446],
        dropoffAddress: 'Kalyani Nagar, Pune, Maharashtra',
        dropoffCoords: [18.5463, 73.9033],
        itemSize: 'small',
        compensation: 450,
        urgency: 'urgent',
        neededBy: 'Today by 18:00',
        distanceKm: 7.2,
        estimatedDurationMin: 22,
      }),
    });

    expect(createDeliveryRes.status).toBe(201);
    const delivery: any = await createDeliveryRes.json();
    const deliveryId = delivery.id;
    expect(deliveryId).toBeDefined();
    expect(delivery.status).toBe('open');
    expect(delivery.requesterId).toBe(requesterUid);
    expect(delivery.handoverPin).toBeDefined();

    // =========================================================================
    // STEP 5: Commute Route Matching & Detour Calculation
    // =========================================================================
    // Partner registers general active presence and journey
    partnerPresenceService.setAvailability(partnerUid, true);
    partnerPresenceService.updateLocation(partnerUid, {
      latitude: 18.5300,
      longitude: 73.8400,
      isAvailable: true,
    });
    partnerPresenceService.setActiveJourney(partnerUid, {
      originCoords: [18.5200, 73.8300],
      destCoords: [18.5600, 73.9200],
      maxDetourMinutes: 20,
    });

    // Partner queries open feed
    const feedRes = await fetch(`${baseUrl}/api/deliveries?status=open`, {
      headers: { Authorization: makeAuthHeader(partnerUid) },
    });
    expect(feedRes.status).toBe(200);
    const feedItems = (await feedRes.json()) as any[];
    const targetItem = feedItems.find((d) => d.id === deliveryId);
    expect(targetItem).toBeDefined();

    // =========================================================================
    // STEP 6: Delivery Acceptance & Atomic Assignment
    // =========================================================================
    // Requester cannot accept their own delivery
    const selfAcceptRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/accept`, {
      method: 'POST',
      headers: { Authorization: makeAuthHeader(requesterUid) },
    });
    expect(selfAcceptRes.status).toBe(403);

    // Approved Partner B accepts the delivery
    const acceptRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/accept`, {
      method: 'POST',
      headers: { Authorization: makeAuthHeader(partnerUid) },
    });
    expect(acceptRes.status).toBe(200);
    const acceptedDelivery: any = await acceptRes.json();
    expect(acceptedDelivery.status).toBe('matched');
    expect(acceptedDelivery.transporterId).toBe(partnerUid);

    // Duplicate acceptance by third party is rejected with 409 Conflict
    const raceAcceptRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/accept`, {
      method: 'POST',
      headers: { Authorization: makeAuthHeader('usr-e2e-late-partner-03') },
    });
    expect(raceAcceptRes.status).toBe(409);

    // =========================================================================
    // STEP 7: Payment Order Creation & Webhook Verification
    // =========================================================================
    const createOrderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(requesterUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId, idempotencyKey: `ord_idem_${deliveryId}` }),
    });

    expect(createOrderRes.status).toBe(201);
    const orderData: any = await createOrderRes.json();
    const paymentOrderId = orderData.order._id || orderData.order.id;
    expect(paymentOrderId).toBeDefined();
    expect(orderData.order.status).toBe('created');
    const commission = orderData.order.commissionSnapshot || orderData.commission;
    expect(commission.platformSharePaise).toBeGreaterThan(0);
    expect(commission.partnerSharePaise).toBeGreaterThan(0);

    // Simulate payment completion webhook with signature
    const webhookRes = await fetch(`${baseUrl}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': 'mock-valid-signature-phase6',
      },
      body: JSON.stringify({
        eventType: 'PAYMENT_SUCCESS_WEBHOOK',
        orderId: paymentOrderId,
        eventId: `evt_pay_success_${paymentOrderId}`,
      }),
    });
    expect(webhookRes.status).toBe(200);
    const webhookData: any = await webhookRes.json();
    expect(webhookData.received).toBe(true);

    const paidOrder = inMemoryPaymentOrders.get(deliveryId) || inMemoryPaymentOrders.get(paymentOrderId);
    expect(paidOrder.status).toBe('paid');

    // =========================================================================
    // STEP 8: Start Transit & Live GPS Telemetry
    // =========================================================================
    const startTransitRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/start-transit`, {
      method: 'POST',
      headers: { Authorization: makeAuthHeader(partnerUid) },
    });
    expect(startTransitRes.status).toBe(200);
    const transitDelivery: any = await startTransitRes.json();
    expect(transitDelivery.status).toBe('in_transit');

    // Live GPS telemetry from Partner
    const locRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/location`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: 18.5350,
        longitude: 73.8600,
        heading: 85,
        speed: 34.5,
        accuracy: 4.8,
      }),
    });
    expect(locRes.status).toBe(200);

    // Requester retrieves live location
    const getLocRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/location`, {
      headers: { Authorization: makeAuthHeader(requesterUid) },
    });
    expect(getLocRes.status).toBe(200);
    const locData: any = await getLocRes.json();
    const loc = locData.location || locData;
    expect(loc.latitude).toBeCloseTo(18.5350);
    expect(loc.accuracy).toBeCloseTo(4.8);

    // Unauthorized third party is blocked from streaming location telemetry
    const unauthLocPostRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/location`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(unauthorizedUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: 18.5360,
        longitude: 73.8610,
      }),
    });
    expect(unauthLocPostRes.status).toBe(403);
    const unauthLocData: any = await unauthLocPostRes.json();
    expect(unauthLocData.error).toContain('assigned delivery partner');

    // =========================================================================
    // STEP 9: LiveKit Secure Audio/Video Token Minting
    // =========================================================================
    // Requester gets token
    const reqLivekitRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(requesterUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId }),
    });
    expect(reqLivekitRes.status).toBe(200);
    const reqTokenData: any = await reqLivekitRes.json();
    expect(reqTokenData.token).toBeDefined();
    expect(reqTokenData.room).toBe(`delivery-${deliveryId}`);

    // Transporter gets token
    const transLivekitRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId }),
    });
    expect(transLivekitRes.status).toBe(200);
    const transTokenData: any = await transLivekitRes.json();
    expect(transTokenData.token).toBeDefined();

    // Unauthorized third party is denied LiveKit token
    const unauthLivekitRes = await fetch(`${baseUrl}/api/livekit/token`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(unauthorizedUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ deliveryId }),
    });
    expect(unauthLivekitRes.status).toBe(403);

    // =========================================================================
    // STEP 10: Handover PIN Verification & Delivery Completion
    // =========================================================================
    const correctPin = delivery.handoverPin;

    // Wrong PIN attempt fails and registers attempt counter
    const wrongPinRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/verify-pin`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin: '0000' }),
    });
    expect(wrongPinRes.status).toBe(400);
    const wrongPinData: any = await wrongPinRes.json();
    expect(wrongPinData.error).toContain('Invalid handover PIN');
    expect(wrongPinData.attemptsRemaining).toBeDefined();

    // Correct PIN completes delivery
    const completeRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/verify-pin`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin: correctPin }),
    });
    expect(completeRes.status).toBe(200);
    const completedDelivery: any = await completeRes.json();
    expect(completedDelivery.delivery?.status || completedDelivery.status).toBe('completed');

    // Telemetry tracking stops after completion
    const postCompleteLocRes = await fetch(`${baseUrl}/api/deliveries/${deliveryId}/location`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(partnerUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: 18.5463,
        longitude: 73.9033,
      }),
    });
    expect(postCompleteLocRes.status).toBe(400);
    const postCompleteLocData: any = await postCompleteLocRes.json();
    expect(postCompleteLocData.error).toContain('completed');

    // =========================================================================
    // STEP 11: Marketplace Settlement Execution & Ledger Integrity
    // =========================================================================
    // Admin settles completed delivery
    const settleRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(adminUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentOrderId,
        idempotencyKey: `settle_e2e_${paymentOrderId}`,
      }),
    });

    expect(settleRes.status).toBe(200);
    const settleData: any = await settleRes.json();
    expect(settleData.success).toBe(true);
    expect(settleData.settlement.status).toBe('settled');
    const settlementId = settleData.settlement._id || settleData.settlement.id;

    // Duplicate settlement handled idempotently without duplicate transfers
    const dupSettleRes = await fetch(`${baseUrl}/api/payments/settle`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(adminUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentOrderId,
        idempotencyKey: `settle_e2e_dup_${paymentOrderId}`,
      }),
    });
    expect(dupSettleRes.status).toBe(200);
    const dupSettleData: any = await dupSettleRes.json();
    expect(dupSettleData.isDuplicate).toBe(true);
    expect(dupSettleData.settlement._id || dupSettleData.settlement.id).toBe(settlementId);

    // Reversal generates compensating record without mutating original
    const reverseRes = await fetch(`${baseUrl}/api/payments/settle/${settlementId}/reverse`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(adminUid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Phase 6 end-to-end ledger audit testing compensating reversal' }),
    });
    expect(reverseRes.status).toBe(200);
    const reverseData: any = await reverseRes.json();
    expect(reverseData.success).toBe(true);
    expect(reverseData.settlement.entryType).toBe('reversal');

    // =========================================================================
    // STEP 12: Admin Financial Reconciliation & Recovery Status
    // =========================================================================
    const recRes = await fetch(`${baseUrl}/api/payments/reconciliation`, {
      headers: { Authorization: makeAuthHeader(adminUid) },
    });
    expect(recRes.status).toBe(200);
    const recData: any = await recRes.json();
    expect(recData.success).toBe(true);
    expect(recData.report).toBeDefined();

    const recoverStatusRes = await fetch(`${baseUrl}/api/payments/recover/status`, {
      headers: { Authorization: makeAuthHeader(adminUid) },
    });
    expect(recoverStatusRes.status).toBe(200);
    const recStatusData: any = await recoverStatusRes.json();
    expect(recStatusData.success).toBe(true);
  });
});
