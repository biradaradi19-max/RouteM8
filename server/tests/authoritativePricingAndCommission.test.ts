import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { createApp } from '../app.js';
import {
  calculateCommission,
  calculateCommissionSync,
  DEFAULT_COMMISSION_RATE_PERCENT,
} from '../services/commissionEngine.js';
import {
  calculateAuthoritativeDeliveryPrice,
  RATE_PER_KM_INR,
  RATE_PER_KM_PAISE,
  MIN_FARE_INR,
  MIN_FARE_PAISE,
} from '../services/pricingEngine.js';
import { calculateHaversineDistance } from '../services/matchingEngine.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import {
  inMemoryPaymentOrders,
  inMemorySettlements,
  inMemoryRefunds,
} from '../routes/payments.js';
import fs from 'fs';
import path from 'path';

describe('Phase 6.2.3: Authoritative Pricing & 12% Commission Enforcement', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'usr-authoritative-requester-01';
  const partnerUid = 'usr-authoritative-partner-01';
  const requesterToken = `Bearer mock-token-${requesterUid}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';
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
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
  });

  // =========================================================================
  // 1. Commission Engine — 12% Platform Fee & 88% Partner Split
  // =========================================================================
  describe('1. Commission Engine — 12% Platform Fee & 88% Partner Split', () => {
    it('uses 12.0% as the safe default commission rate', () => {
      expect(DEFAULT_COMMISSION_RATE_PERCENT).toBe(12.0);
    });

    it('accurately calculates required 10 km example: ₹70 total -> ₹8.40 commission, ₹61.60 partner share', async () => {
      // 10 km @ ₹7/km = ₹70.00 = 7,000 paise
      const amountPaise = 7000;
      const result = await calculateCommission(amountPaise);

      expect(result.commissionRatePercent).toBe(12.0);
      expect(result.amountPaise).toBe(7000);
      expect(result.platformSharePaise).toBe(840); // ₹8.40 (12% of ₹70)
      expect(result.partnerSharePaise).toBe(6160); // ₹61.60 (88% of ₹70)
      expect(result.platformSharePaise + result.partnerSharePaise).toBe(amountPaise);
      expect(Number.isInteger(result.platformSharePaise)).toBe(true);
      expect(Number.isInteger(result.partnerSharePaise)).toBe(true);
    });

    it('accurately calculates required 25 km example: ₹175 total -> ₹21 commission, ₹154 partner share', async () => {
      // 25 km @ ₹7/km = ₹175.00 = 17,500 paise
      const amountPaise = 17500;
      const result = await calculateCommission(amountPaise);

      expect(result.commissionRatePercent).toBe(12.0);
      expect(result.amountPaise).toBe(17500);
      expect(result.platformSharePaise).toBe(2100); // ₹21.00 (12% of ₹175)
      expect(result.partnerSharePaise).toBe(15400); // ₹154.00 (88% of ₹175)
      expect(result.platformSharePaise + result.partnerSharePaise).toBe(amountPaise);
      expect(Number.isInteger(result.platformSharePaise)).toBe(true);
      expect(Number.isInteger(result.partnerSharePaise)).toBe(true);
    });

    it('guarantees 100% total distribution (platform + partner === total) across fractional and odd paise amounts', () => {
      const oddAmounts = [101, 777, 3333, 5005, 9999, 12345, 99999];
      for (const paise of oddAmounts) {
        const syncRes = calculateCommissionSync(paise, 12.0);
        expect(syncRes.platformSharePaise + syncRes.partnerSharePaise).toBe(paise);
        expect(Number.isInteger(syncRes.platformSharePaise)).toBe(true);
        expect(Number.isInteger(syncRes.partnerSharePaise)).toBe(true);
      }
    });

    it('GET /api/payments/commission returns 12.0% active commission rate fallback', async () => {
      const res = await fetch(`${baseUrl}/api/payments/commission`, {
        headers: { Authorization: requesterToken },
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.ratePercent).toBe(12.0);
      expect(data.minCommissionPaise).toBe(0);
    });
  });

  // =========================================================================
  // 2. Authoritative Pricing Engine — ₹7/km and Fractional-km Rounding
  // =========================================================================
  describe('2. Authoritative Pricing Engine — ₹7/km and Fractional-km Rounding', () => {
    it('defines authoritative constants: ₹7/km (700 paise/km) and ₹7 minimum fare', () => {
      expect(RATE_PER_KM_INR).toBe(7.0);
      expect(RATE_PER_KM_PAISE).toBe(700);
      expect(MIN_FARE_INR).toBe(7.0);
      expect(MIN_FARE_PAISE).toBe(700);
    });

    it('calculates 10 km price: ₹70.00 (7,000 paise)', () => {
      const price = calculateAuthoritativeDeliveryPrice(10.0);
      expect(price.distanceKm).toBe(10.0);
      expect(price.amountPaise).toBe(7000);
      expect(price.amountRupees).toBe(70.0);
      expect(price.isMinimumFareApplied).toBe(false);
    });

    it('calculates 25 km price: ₹175.00 (17,500 paise)', () => {
      const price = calculateAuthoritativeDeliveryPrice(25.0);
      expect(price.distanceKm).toBe(25.0);
      expect(price.amountPaise).toBe(17500);
      expect(price.amountRupees).toBe(175.0);
      expect(price.isMinimumFareApplied).toBe(false);
    });

    it('enforces minimum fare of ₹7.00 (700 paise) for sub-kilometre distances', () => {
      const subKmCases = [0.0, 0.1, 0.25, 0.5, 0.85, 0.99];
      for (const dist of subKmCases) {
        const price = calculateAuthoritativeDeliveryPrice(dist);
        expect(price.amountPaise).toBe(700);
        expect(price.amountRupees).toBe(7.0);
        expect(price.isMinimumFareApplied).toBe(true);
      }
    });

    it('handles fractional distances with 2-decimal rounding', () => {
      // 10.55 km @ 700 paise/km = 7385 paise = ₹73.85
      const price = calculateAuthoritativeDeliveryPrice(10.55);
      expect(price.distanceKm).toBe(10.55);
      expect(price.amountPaise).toBe(7385);
      expect(price.amountRupees).toBe(73.85);

      // Verify commission on 7385 paise:
      // 7385 * 0.12 = 886.2 -> 886 paise
      // partner share = 7385 - 886 = 6499 paise
      const comm = calculateCommissionSync(price.amountPaise, 12.0);
      expect(comm.platformSharePaise).toBe(886);
      expect(comm.partnerSharePaise).toBe(6499);
      expect(comm.platformSharePaise + comm.partnerSharePaise).toBe(7385);
    });

    it('rejects invalid, NaN or negative distances', () => {
      expect(() => calculateAuthoritativeDeliveryPrice(-1)).toThrow(/non-negative/i);
      expect(() => calculateAuthoritativeDeliveryPrice(NaN)).toThrow(/non-negative/i);
    });
  });

  // =========================================================================
  // 3. Authoritative Pricing Enforcement in Delivery Creation (POST /api/deliveries)
  // =========================================================================
  describe('3. Delivery Creation Authoritative Enforcement (POST /api/deliveries)', () => {
    it('enforces authoritative distance and price, ignoring client-submitted compensation & distance', async () => {
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];
      const actualDist = calculateHaversineDistance(origin, destination);
      const expectedPricing = calculateAuthoritativeDeliveryPrice(actualDist);

      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Authoritative Pricing Test Errand',
          description: 'Client attempting to spoof distance and compensation',
          category: 'essentials',
          pickupAddress: 'Pune Central, Maharashtra',
          pickupCoords: origin,
          dropoffAddress: 'Pune North, Maharashtra',
          dropoffCoords: destination,
          itemSize: 'small',
          // Client attempts to spoof ₹1.00 compensation and 1 km distance:
          compensation: 1.0,
          distanceKm: 1.0,
          commission: 0,
        }),
      });

      expect(res.status).toBe(201);
      const delivery: any = await res.json();
      expect(delivery.id).toBeDefined();

      // Server derived exact authoritative values:
      expect(delivery.distanceKm).toBe(expectedPricing.distanceKm);
      expect(delivery.compensation).toBe(expectedPricing.amountRupees);
      // Malicious client input was completely overridden:
      expect(delivery.compensation).not.toBe(1.0);
      expect(delivery.distanceKm).not.toBe(1.0);
    });

    it('enforces authoritative price when creating PaymentOrder from DeliveryRequest', async () => {
      // 1. Create a delivery
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];
      const dist = calculateHaversineDistance(origin, destination);
      const expectedPricing = calculateAuthoritativeDeliveryPrice(dist);

      const delRes = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Order Payment Integrity Test',
          description: 'Package to be paid for',
          category: 'groceries',
          pickupAddress: 'Pickup Point',
          pickupCoords: origin,
          dropoffAddress: 'Dropoff Point',
          dropoffCoords: destination,
          itemSize: 'medium',
        }),
      });

      expect(delRes.status).toBe(201);
      const delivery: any = await delRes.json();
      const deliveryId = delivery.id;

      // 2. Request PaymentOrder creation with client tampering attempt
      const orderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId,
          amountPaise: 50, // Client attempting to pay only ₹0.50
          commissionRate: 0, // Client attempting 0% commission
          idempotencyKey: `idem_auth_${deliveryId}`,
        }),
      });

      expect(orderRes.status).toBe(201);
      const orderData: any = await orderRes.json();
      const order = orderData.order;

      // Amount in order matches authoritative delivery compensation:
      expect(order.amountPaise).toBe(expectedPricing.amountPaise);
      expect(order.amountPaise).not.toBe(50);

      // Commission is frozen at 12% authoritative snapshot:
      const snap = order.commissionSnapshot;
      expect(snap.ratePercent).toBe(12.0);
      const expectedPlatformShare = Math.round((expectedPricing.amountPaise * 12) / 100);
      const expectedPartnerShare = expectedPricing.amountPaise - expectedPlatformShare;
      expect(snap.platformSharePaise).toBe(expectedPlatformShare);
      expect(snap.partnerSharePaise).toBe(expectedPartnerShare);
      expect(snap.platformSharePaise + snap.partnerSharePaise).toBe(expectedPricing.amountPaise);
    });
  });

  // =========================================================================
  // 4. Historical Snapshot Immutability
  // =========================================================================
  describe('4. Historical Snapshot Immutability', () => {
    it('preserves historical commission snapshots on existing orders even if commission rate changes', async () => {
      // Historical order created with 10% beta snapshot:
      const historicalOrderId = 'pay_historical_001';
      const historicalDeliveryId = 'del_historical_001';
      const amountPaise = 5000; // ₹50.00

      inMemoryPaymentOrders.set(historicalDeliveryId, {
        _id: historicalOrderId,
        deliveryId: historicalDeliveryId,
        requesterId: requesterUid,
        transporterId: partnerUid,
        amountPaise,
        currency: 'INR',
        currencyCode: 'INR',
        status: 'paid',
        idempotencyKey: 'idem_hist_001',
        commissionSnapshot: {
          ratePercent: 10.0, // Historical 10% snapshot
          platformSharePaise: 500,
          partnerSharePaise: 4500,
          calculatedAt: new Date(Date.now() - 86400000),
        },
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(Date.now() - 86400000),
      });

      // Fetch the order
      const res = await fetch(`${baseUrl}/api/payments/order/${historicalDeliveryId}`, {
        headers: { Authorization: requesterToken },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.order.commissionSnapshot.ratePercent).toBe(10.0);
      expect(data.order.commissionSnapshot.platformSharePaise).toBe(500);
      expect(data.order.commissionSnapshot.partnerSharePaise).toBe(4500);

      // Verify that calculateCommission now produces 12% for new calculations, without affecting historical record:
      const newCalc = await calculateCommission(amountPaise);
      expect(newCalc.commissionRatePercent).toBe(12.0);
      expect(newCalc.platformSharePaise).toBe(600);
      expect(newCalc.partnerSharePaise).toBe(4400);
    });
  });

  // =========================================================================
  // 5. Supabase Developer Configuration UI Cleanliness
  // =========================================================================
  describe('5. Supabase Developer Configuration Cleanliness', () => {
    it('verifies that SupabaseConfigModal.tsx contains NO copyable .env snippets or placeholder secrets', () => {
      const modalFilePath = path.resolve(__dirname, '../../src/components/forms/SupabaseConfigModal.tsx');
      expect(fs.existsSync(modalFilePath)).toBe(true);
      const content = fs.readFileSync(modalFilePath, 'utf-8');

      // Prohibited snippets:
      expect(content).not.toContain('envSnippet');
      expect(content).not.toContain('LIVEKIT_API_SECRET=secret');
      expect(content).not.toContain('cluster0.mongodb.net');
      expect(content).not.toContain('FIREBASE_SERVICE_ACCOUNT_KEY=');
      expect(content).not.toContain('Copy .env Template');
    });
  });
});
