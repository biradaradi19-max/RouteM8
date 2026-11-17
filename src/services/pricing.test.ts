import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateFallbackPricing, fetchPricingQuote } from './pricing';
import type { PricingSnapshot } from '../types';

describe('RouteM8 Client Pricing & Quote Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates deterministic ₹7/km fallback pricing for 10 km', () => {
    const res = calculateFallbackPricing(10.0);
    expect(res.distanceKm).toBe(10.0);
    expect(res.baseFarePaise).toBe(7000);
    expect(res.baseFareRupees).toBe(70.0);
    expect(res.finalFareRupees).toBe(70.0);
    expect(res.platformCommissionRupees).toBe(8.4); // 12%
    expect(res.transporterEarningsRupees).toBe(61.6); // 88%
    expect(res.platformCommissionPaise + res.transporterEarningsPaise).toBe(7000);
    expect(res.currency).toBe('INR');
  });

  it('calculates deterministic ₹7/km fallback pricing for 25 km', () => {
    const res = calculateFallbackPricing(25.0);
    expect(res.distanceKm).toBe(25.0);
    expect(res.baseFarePaise).toBe(17500);
    expect(res.baseFareRupees).toBe(175.0);
    expect(res.finalFareRupees).toBe(175.0);
    expect(res.platformCommissionRupees).toBe(21.0); // 12%
    expect(res.transporterEarningsRupees).toBe(154.0); // 88%
  });

  it('enforces ₹7.00 minimum fare for sub-kilometre distances in fallback', () => {
    const res = calculateFallbackPricing(0.25);
    expect(res.baseFarePaise).toBe(700);
    expect(res.baseFareRupees).toBe(7.0);
    expect(res.finalFareRupees).toBe(7.0);
  });

  it('fetches server pricing quote successfully when API is reachable', async () => {
    const mockSnapshot: PricingSnapshot = {
      distanceKm: 12.0,
      baseFarePaise: 8400,
      baseFareRupees: 84.0,
      weatherSurchargePaise: 1260,
      weatherSurchargeRupees: 12.6,
      weatherReason: 'Heavy rain along route',
      trafficSurchargePaise: 0,
      trafficSurchargeRupees: 0,
      totalSurchargePaise: 1260,
      totalSurchargeRupees: 12.6,
      finalFarePaise: 9660,
      finalFareRupees: 96.6,
      platformCommissionPaise: 1159,
      platformCommissionRupees: 11.59,
      transporterEarningsPaise: 8501,
      transporterEarningsRupees: 85.01,
      currency: 'INR',
      currencySymbol: '₹',
      pricingVersion: '1.0.0',
      calculatedAt: '2026-11-17T10:00:00Z',
      explanation: 'Additional charge: Heavy rain along your delivery route.',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    } as any);

    const quote = await fetchPricingQuote({
      pickupCoords: [18.5204, 73.8567],
      dropoffCoords: [18.6104, 73.8567],
      distanceKm: 12.0,
    });

    expect(quote.distanceKm).toBe(12.0);
    expect(quote.baseFareRupees).toBe(84.0);
    expect(quote.weatherSurchargeRupees).toBe(12.6);
    expect(quote.finalFareRupees).toBe(96.6);
    expect(quote.explanation).toContain('Heavy rain');
  });

  it('gracefully falls back to deterministic client calculation on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    const quote = await fetchPricingQuote({
      pickupCoords: [18.5204, 73.8567],
      dropoffCoords: [18.6104, 73.8567],
      distanceKm: 10.0,
    });

    expect(quote.distanceKm).toBe(10.0);
    expect(quote.baseFareRupees).toBe(70.0);
    expect(quote.totalSurchargeRupees).toBe(0);
    expect(quote.finalFareRupees).toBe(70.0);
  });
});
