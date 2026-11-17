/**
 * RouteM8 Client Pricing & Quote Service
 * 
 * Fetches authoritative server-calculated dynamic pricing quotes
 * or computes deterministic ₹7/km fallback when offline.
 */

import type { PricingSnapshot } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface QuoteRequestParams {
  pickupCoords: [number, number];
  dropoffCoords: [number, number];
  distanceKm?: number;
}

/**
 * Deterministic offline fallback calculation strictly adhering to ₹7/km base and 12% commission
 */
export function calculateFallbackPricing(distanceKm: number = 1.0): PricingSnapshot {
  const roundedKm = Math.max(0.1, Math.round(distanceKm * 100) / 100);
  const rawPaise = Math.round(roundedKm * 700);
  const baseFarePaise = Math.max(700, rawPaise);
  const finalFarePaise = baseFarePaise;
  const platformCommissionPaise = Math.round((finalFarePaise * 12) / 100);
  const transporterEarningsPaise = finalFarePaise - platformCommissionPaise;

  return {
    distanceKm: roundedKm,
    baseFarePaise,
    baseFareRupees: baseFarePaise / 100,
    weatherSurchargePaise: 0,
    weatherSurchargeRupees: 0,
    trafficSurchargePaise: 0,
    trafficSurchargeRupees: 0,
    totalSurchargePaise: 0,
    totalSurchargeRupees: 0,
    finalFarePaise,
    finalFareRupees: finalFarePaise / 100,
    platformCommissionPaise,
    platformCommissionRupees: platformCommissionPaise / 100,
    transporterEarningsPaise,
    transporterEarningsRupees: transporterEarningsPaise / 100,
    currency: 'INR',
    currencySymbol: '₹',
    pricingVersion: '1.0.0-fallback',
    calculatedAt: new Date().toISOString(),
    explanation: 'Fare calculated automatically based on road distance.',
  };
}

/**
 * Requests an authoritative pricing quote from the backend API.
 */
export async function fetchPricingQuote(params: QuoteRequestParams): Promise<PricingSnapshot> {
  const { pickupCoords, dropoffCoords, distanceKm } = params;

  try {
    const res = await fetch(`${API_BASE}/api/deliveries/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pickupCoords,
        dropoffCoords,
        distanceKm,
      }),
    });

    if (res.ok) {
      const data: PricingSnapshot = await res.json();
      return data;
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn('[Pricing Quote API Notice] Backend quote endpoint unavailable, using standard ₹7/km formula:', err);
    }
  }

  // Graceful fallback to client ₹7/km formula
  return calculateFallbackPricing(distanceKm ?? 1.0);
}
