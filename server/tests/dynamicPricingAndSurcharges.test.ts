import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'http';
import { createApp } from '../app.js';
import {
  computePricingBreakdownSync,
  type PricingSnapshot,
} from '../services/pricingEngine.js';
import { isHeavyRainCondition } from '../services/weatherService.js';
import { isHeavyTrafficCondition } from '../services/trafficService.js';
import {
  DEFAULT_PRICING_POLICY,
  resetInMemoryPricingPolicy,
  type PricingPolicyConfig,
} from '../models/DynamicPricingPolicy.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import { inMemoryPaymentOrders, inMemorySettlements, inMemoryRefunds } from '../routes/payments.js';

describe('RouteM8 Dynamic Pricing & Surcharges System', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'usr-dynamic-requester-01';
  const partnerUid = 'usr-dynamic-partner-01';
  const adminUid = 'usr-dynamic-admin-01';

  const requesterToken = `Bearer mock-token-${requesterUid}`;
  const partnerToken = `Bearer mock-token-${partnerUid}`;
  const adminToken = `Bearer mock-token-${adminUid}`;

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
    resetInMemoryPricingPolicy();
    inMemoryDeliveries.length = 0;
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
  });

  // =========================================================================
  // 1. Weather Intelligence Unit Tests
  // =========================================================================
  describe('1. Weather Intelligence Unit Tests', () => {
    it('does NOT trigger heavy rain for clear or cloudy weather', () => {
      expect(isHeavyRainCondition(0, 0)).toBe(false); // Clear sky
      expect(isHeavyRainCondition(1, 0)).toBe(false); // Mainly clear
      expect(isHeavyRainCondition(3, 0)).toBe(false); // Overcast
    });

    it('does NOT trigger heavy rain for light or moderate rain below threshold', () => {
      expect(isHeavyRainCondition(61, 1.5)).toBe(false); // Slight rain
      expect(isHeavyRainCondition(63, 4.0)).toBe(false); // Moderate rain
      expect(isHeavyRainCondition(80, 2.0)).toBe(false); // Slight shower
      expect(isHeavyRainCondition(81, 4.5)).toBe(false); // Moderate shower
    });

    it('triggers heavy rain for WMO heavy precipitation codes and high rainfall rates', () => {
      expect(isHeavyRainCondition(65, 5.0)).toBe(true); // Continuous heavy rain
      expect(isHeavyRainCondition(82, 6.0)).toBe(true); // Violent rain shower
      expect(isHeavyRainCondition(96, 5.0)).toBe(true); // Thunderstorm with hail
      expect(isHeavyRainCondition(99, 8.0)).toBe(true); // Thunderstorm with heavy hail
      expect(isHeavyRainCondition(61, 8.5)).toBe(true); // Any rain >= 7.5 mm/h is heavy
      expect(isHeavyRainCondition(95, 4.5)).toBe(true); // Thunderstorm with >= 4.0 mm/h
    });
  });

  // =========================================================================
  // 2. Traffic Intelligence Unit Tests
  // =========================================================================
  describe('2. Traffic Intelligence Unit Tests', () => {
    it('does NOT trigger heavy traffic for normal or minor delays', () => {
      expect(isHeavyTrafficCondition(1000, 1100)).toBe(false); // 10% delay, 100s
      expect(isHeavyTrafficCondition(600, 750)).toBe(false); // 25% delay, 150s (<300s)
      expect(isHeavyTrafficCondition(200, 280)).toBe(false); // 40% delay, but only 80s delay
    });

    it('triggers heavy traffic when congestion is >= 35% AND absolute delay >= 300s (5 mins)', () => {
      // Baseline 1000s (16.6 min), traffic 1400s (23.3 min) -> 40% delay, 400s delay
      expect(isHeavyTrafficCondition(1000, 1400)).toBe(true);
      // Baseline 600s (10 min), traffic 950s (15.8 min) -> 58% delay, 350s delay
      expect(isHeavyTrafficCondition(600, 950)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Dynamic Pricing Engine Calculation Scenarios
  // =========================================================================
  describe('3. Dynamic Pricing Engine Scenarios', () => {
    const policy: PricingPolicyConfig = { ...DEFAULT_PRICING_POLICY };

    it('calculates standard fare for normal weather and normal traffic (₹7/km)', () => {
      // 10 km @ ₹7/km = ₹70.00 (7,000 paise)
      const res = computePricingBreakdownSync(10.0, policy, {
        isHeavyRain: false,
        checkedPoints: [],
        source: 'open-meteo',
      }, {
        isHeavyTraffic: false,
        source: 'google-maps',
      });

      expect(res.distanceKm).toBe(10.0);
      expect(res.baseFarePaise).toBe(7000);
      expect(res.baseFareRupees).toBe(70.0);
      expect(res.weatherSurchargePaise).toBe(0);
      expect(res.trafficSurchargePaise).toBe(0);
      expect(res.totalSurchargePaise).toBe(0);
      expect(res.finalFarePaise).toBe(7000);
      expect(res.finalFareRupees).toBe(70.0);
      expect(res.platformCommissionPaise).toBe(840); // 12% of ₹70
      expect(res.transporterEarningsPaise).toBe(6160); // 88% of ₹70
      expect(res.platformCommissionPaise + res.transporterEarningsPaise).toBe(7000);
      expect(res.explanation).toBe('Fare calculated automatically based on road distance.');
    });

    it('applies 15% weather surcharge for verified heavy rain', () => {
      // 10 km @ ₹7/km = 7,000 paise base
      // Weather surge: 15% of 7,000 = 1,050 paise (₹10.50)
      // Total: 8,050 paise (₹80.50)
      const res = computePricingBreakdownSync(10.0, policy, {
        isHeavyRain: true,
        precipitationMmPerHour: 9.5,
        weatherCode: 65,
        reason: 'Additional charge: Heavy rain along your delivery route (9.5 mm/h).',
        checkedPoints: [],
        source: 'open-meteo',
      }, {
        isHeavyTraffic: false,
        source: 'unavailable',
      });

      expect(res.baseFarePaise).toBe(7000);
      expect(res.weatherSurchargePaise).toBe(1050);
      expect(res.weatherSurchargeRupees).toBe(10.50);
      expect(res.trafficSurchargePaise).toBe(0);
      expect(res.totalSurchargePaise).toBe(1050);
      expect(res.finalFarePaise).toBe(8050);
      expect(res.finalFareRupees).toBe(80.50);

      // Commission 12% on total: 8050 * 0.12 = 966 paise
      expect(res.platformCommissionPaise).toBe(966);
      expect(res.transporterEarningsPaise).toBe(7084); // 8050 - 966 = 7084 paise
      expect(res.platformCommissionPaise + res.transporterEarningsPaise).toBe(8050);
      expect(res.explanation).toContain('Heavy rain along your delivery route');
    });

    it('applies 15% traffic surcharge for verified heavy traffic', () => {
      // 10 km @ ₹7/km = 7,000 paise base
      // Traffic surge: 15% of 7,000 = 1,050 paise (₹10.50)
      // Total: 8,050 paise (₹80.50)
      const res = computePricingBreakdownSync(10.0, policy, {
        isHeavyRain: false,
        checkedPoints: [],
        source: 'open-meteo',
      }, {
        isHeavyTraffic: true,
        delayRatio: 1.45,
        delaySec: 420,
        reason: 'Additional charge: Heavy traffic along your delivery route (+7 min delay).',
        source: 'google-maps',
      });

      expect(res.baseFarePaise).toBe(7000);
      expect(res.weatherSurchargePaise).toBe(0);
      expect(res.trafficSurchargePaise).toBe(1050);
      expect(res.trafficSurchargeRupees).toBe(10.50);
      expect(res.totalSurchargePaise).toBe(1050);
      expect(res.finalFarePaise).toBe(8050);
      expect(res.finalFareRupees).toBe(80.50);
      expect(res.platformCommissionPaise).toBe(966);
      expect(res.transporterEarningsPaise).toBe(7084);
      expect(res.platformCommissionPaise + res.transporterEarningsPaise).toBe(8050);
      expect(res.explanation).toContain('Heavy traffic along your delivery route');
    });

    it('applies combined capped surcharge when BOTH heavy rain and heavy traffic occur', () => {
      // 10 km @ ₹7/km = 7,000 paise base
      // Raw Weather: 15% = 1,050 paise
      // Raw Traffic: 15% = 1,050 paise
      // Sum = 2,100 paise (30%)
      // Policy combined cap: 25% of 7,000 = 1,750 paise (₹17.50)
      // Total surcharge is capped at 1,750 paise!
      const res = computePricingBreakdownSync(10.0, policy, {
        isHeavyRain: true,
        weatherCode: 65,
        checkedPoints: [],
        source: 'open-meteo',
      }, {
        isHeavyTraffic: true,
        delayRatio: 1.5,
        delaySec: 500,
        source: 'google-maps',
      });

      expect(res.baseFarePaise).toBe(7000);
      expect(res.weatherSurchargePaise).toBe(1050);
      expect(res.trafficSurchargePaise).toBe(1050);
      expect(res.totalSurchargePaise).toBe(1750); // Capped at 25% of base
      expect(res.totalSurchargeRupees).toBe(17.50);
      expect(res.finalFarePaise).toBe(8750);
      expect(res.finalFareRupees).toBe(87.50);

      // Commission 12% on 8750: 8750 * 0.12 = 1050 paise
      expect(res.platformCommissionPaise).toBe(1050);
      expect(res.transporterEarningsPaise).toBe(7700); // 8750 - 1050 = 7700 paise
      expect(res.platformCommissionPaise + res.transporterEarningsPaise).toBe(8750);
      expect(res.explanation).toBe('Additional charge: Heavy rain and heavy traffic along your delivery route.');
    });

    it('gracefully falls back to normal base fare if weather and traffic APIs are unavailable', () => {
      const res = computePricingBreakdownSync(10.0, policy, {
        isHeavyRain: false,
        checkedPoints: [],
        source: 'unavailable',
      }, {
        isHeavyTraffic: false,
        source: 'unavailable',
      });

      expect(res.baseFarePaise).toBe(7000);
      expect(res.totalSurchargePaise).toBe(0);
      expect(res.finalFarePaise).toBe(7000);
      expect(res.finalFareRupees).toBe(70.0);
      expect(res.explanation).toBe('Fare calculated automatically based on road distance.');
    });
  });

  // =========================================================================
  // 4. API Endpoint Integration Tests: POST /api/deliveries/quote
  // =========================================================================
  describe('4. Quote API Endpoint (POST /api/deliveries/quote)', () => {
    it('returns 200 with authoritative pricing breakdown for valid coordinates', async () => {
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];

      const res = await fetch(`${baseUrl}/api/deliveries/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupCoords: origin,
          dropoffCoords: destination,
          distanceKm: 10.0,
          skipLiveChecks: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as PricingSnapshot;
      expect(data.distanceKm).toBe(10.0);
      expect(data.baseFareRupees).toBe(70.0);
      expect(data.finalFareRupees).toBe(70.0);
      expect(data.platformCommissionRupees).toBe(8.4);
      expect(data.transporterEarningsRupees).toBe(61.6);
      expect(data.currency).toBe('INR');
      expect(data.currencySymbol).toBe('₹');
    });

    it('rejects invalid coordinates with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupCoords: [195.0, 73.8567], // Invalid lat > 90
          dropoffCoords: [18.6104, 73.8567],
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toMatch(/Invalid coordinates/i);
    });

    it('returns weather surcharge when heavy rain is verified along route', async () => {
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];

      const res = await fetch(`${baseUrl}/api/deliveries/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupCoords: origin,
          dropoffCoords: destination,
          distanceKm: 10.0,
          mockWeather: {
            isHeavyRain: true,
            weatherCode: 65,
            precipitationMmPerHour: 8.5,
            reason: 'Additional charge: Heavy rain along your delivery route (8.5 mm/h).',
            checkedPoints: [],
            source: 'open-meteo',
          },
          mockTraffic: {
            isHeavyTraffic: false,
            source: 'unavailable',
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as PricingSnapshot;
      expect(data.weatherSurchargeRupees).toBe(10.50);
      expect(data.finalFareRupees).toBe(80.50);
      expect(data.explanation).toContain('Heavy rain along your delivery route');
    });
  });

  // =========================================================================
  // 5. Delivery Creation Tamper-Proofing & Snapshots (POST /api/deliveries)
  // =========================================================================
  describe('5. Delivery Creation Authoritative Enforcement & Locked Fare', () => {
    it('completely ignores client-submitted compensation and distance overrides', async () => {
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];

      const res = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Tamper-Proofing Delivery Test',
          description: 'Client trying to submit malicious fare and distance',
          category: 'groceries',
          pickupAddress: 'Pune Central',
          pickupCoords: origin,
          dropoffAddress: 'Pune North',
          dropoffCoords: destination,
          itemSize: 'small',
          // Client tampering attempts:
          compensation: 5.0, // Attempting to pay only ₹5
          distanceKm: 0.5,
        }),
      });

      expect(res.status).toBe(201);
      const delivery: any = await res.json();

      // Verified: Server calculated authoritative pricing and attached snapshot
      expect(delivery.compensation).toBeGreaterThan(5.0);
      expect(delivery.distanceKm).toBeGreaterThan(0.5);
      expect(delivery.pricingSnapshot).toBeDefined();
      expect(delivery.pricingSnapshot.pricingVersion).toBeDefined();
      expect(delivery.pricingSnapshot.baseFareRupees).toBeDefined();
      expect(delivery.pricingSnapshot.finalFareRupees).toBe(delivery.compensation);
    });

    it('preserves agreed fare once delivery is accepted and locks modification', async () => {
      // 1. Create delivery
      const origin: [number, number] = [18.5204, 73.8567];
      const destination: [number, number] = [18.6104, 73.8567];

      const createRes = await fetch(`${baseUrl}/api/deliveries`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Locked Fare Delivery',
          description: 'Fare must remain intact after accept',
          category: 'essentials',
          pickupAddress: 'Pune Station',
          pickupCoords: origin,
          dropoffAddress: 'Kalyani Nagar',
          dropoffCoords: destination,
          itemSize: 'medium',
        }),
      });

      expect(createRes.status).toBe(201);
      const created: any = await createRes.json();
      const initialCompensation = created.compensation;
      const initialSnapshot = created.pricingSnapshot;

      // 2. Partner accepts delivery
      const acceptRes = await fetch(`${baseUrl}/api/deliveries/${created.id}/accept`, {
        method: 'POST',
        headers: {
          Authorization: partnerToken,
          'Content-Type': 'application/json',
        },
      });

      expect(acceptRes.status).toBe(200);
      const accepted: any = await acceptRes.json();

      // Verified: Fare remains locked and identical
      expect(accepted.status).toBe('matched');
      expect(accepted.compensation).toBe(initialCompensation);
      expect(accepted.pricingSnapshot).toBeDefined();
      expect(accepted.pricingSnapshot.finalFareRupees).toBe(initialSnapshot.finalFareRupees);
    });
  });

  // =========================================================================
  // 6. Pricing Policy Administration & Security
  // =========================================================================
  describe('6. Pricing Policy Administration & Security', () => {
    it('allows viewing active pricing policy', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/pricing-policy`);
      expect(res.status).toBe(200);
      const policy: any = await res.json();
      expect(policy.ratePerKmInr).toBe(7.0);
      expect(policy.weatherSurchargeRatePercent).toBe(15.0);
      expect(policy.trafficSurchargeRatePercent).toBe(15.0);
      expect(policy.maxCombinedSurchargePercent).toBe(25.0);
    });

    it('rejects policy modification by regular non-admin users (403 Forbidden)', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/pricing-policy`, {
        method: 'PUT',
        headers: {
          Authorization: requesterToken, // Regular user token
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weatherSurchargeRatePercent: 20.0,
        }),
      });

      expect(res.status).toBe(403);
    });

    it('allows authorized administrators to update policy within conservative limits', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/pricing-policy`, {
        method: 'PUT',
        headers: {
          Authorization: adminToken, // Admin token
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weatherSurchargeRatePercent: 18.0,
          trafficSurchargeRatePercent: 12.0,
          notes: 'Admin adjusted surcharge rates for monsoon season',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.policy.weatherSurchargeRatePercent).toBe(18.0);
      expect(data.policy.trafficSurchargeRatePercent).toBe(12.0);
    });

    it('rejects unreasonable surcharge policy values exceeding limits', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/pricing-policy`, {
        method: 'PUT',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weatherSurchargeRatePercent: 50.0, // Max allowed is 30%
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toMatch(/between 0% and 30%/i);
    });
  });
});
