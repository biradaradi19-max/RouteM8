/**
 * RouteM8 Authoritative Pricing & Dynamic Surcharge Engine
 * 
 * Strict Business Rules:
 * - Base Rate: ₹7.00 per kilometer (700 paise / km).
 * - Minimum Fare: ₹7.00 (700 paise) for sub-kilometre or zero-distance deliveries.
 * - Distance precision: 2 decimal places (fractional kilometres rounded to nearest 0.01 km).
 * - Currency calculations strictly in integer paise (no floating point currency rounding drift).
 * - Platform commission: strictly 12.0%.
 * - Transporter share: strictly 88.0% (remainder to avoid 1-paise rounding discrepancies).
 * - Currency: INR (₹).
 * 
 * Dynamic Pricing:
 * - Base Fare = Actual Road Distance × ₹7
 * - Weather Surcharge = Applicable only during verified heavy rain (Open-Meteo).
 * - Traffic Surcharge = Applicable only during verified heavy traffic (Google Maps / TomTom).
 * - Combination Policy: Additive with conservative combined cap (25% / ₹50 max).
 * - Final Customer Fare = Base Fare + Eligible Surcharges.
 */

import { calculateHaversineDistance } from './matchingEngine.js';
import { checkRouteWeather, type RouteWeatherReport } from './weatherService.js';
import { checkRouteTraffic, type RouteTrafficReport } from './trafficService.js';
import { getActivePricingPolicy, type PricingPolicyConfig } from '../models/DynamicPricingPolicy.js';

export const RATE_PER_KM_INR = 7.0;
export const RATE_PER_KM_PAISE = 700;
export const MIN_FARE_INR = 7.0;
export const MIN_FARE_PAISE = 700;

export interface AuthoritativePriceBreakdown {
  distanceKm: number;
  amountPaise: number;
  amountRupees: number;
  ratePerKmInr: number;
  isMinimumFareApplied: boolean;
}

export interface PricingSnapshot {
  distanceKm: number;
  baseFarePaise: number;
  baseFareRupees: number;
  weatherSurchargePaise: number;
  weatherSurchargeRupees: number;
  weatherReason?: string;
  trafficSurchargePaise: number;
  trafficSurchargeRupees: number;
  trafficReason?: string;
  totalSurchargePaise: number;
  totalSurchargeRupees: number;
  finalFarePaise: number;
  finalFareRupees: number;
  platformCommissionPaise: number;
  platformCommissionRupees: number;
  transporterEarningsPaise: number;
  transporterEarningsRupees: number;
  currency: string;
  currencySymbol: string;
  pricingVersion: string;
  calculatedAt: string;
  explanation: string;
  evidence?: {
    weather?: RouteWeatherReport;
    traffic?: RouteTrafficReport;
  };
}

export interface DynamicPricingInput {
  pickupCoords: [number, number];
  dropoffCoords: [number, number];
  distanceKm?: number;
  skipLiveChecks?: boolean;
  mockWeather?: RouteWeatherReport;
  mockTraffic?: RouteTrafficReport;
}

/**
 * Calculates authoritative delivery base pricing based strictly on distance.
 * Fractional-km rounding: distanceKm rounded to 2 decimal places.
 * Calculation: Math.round(distanceKm * 700) paise, floored at MIN_FARE_PAISE (700 paise / ₹7.00).
 */
export function calculateAuthoritativeDeliveryPrice(distanceKm: number): AuthoritativePriceBreakdown {
  if (typeof distanceKm !== 'number' || isNaN(distanceKm) || distanceKm < 0) {
    throw new Error('distanceKm must be a non-negative number');
  }

  // Fractional-km rounding to 2 decimal places
  const roundedDistanceKm = Math.round(distanceKm * 100) / 100;
  const rawPaise = Math.round(roundedDistanceKm * RATE_PER_KM_PAISE);
  const isMinimumFareApplied = rawPaise < MIN_FARE_PAISE;
  const amountPaise = isMinimumFareApplied ? MIN_FARE_PAISE : rawPaise;
  const amountRupees = amountPaise / 100;

  return {
    distanceKm: roundedDistanceKm,
    amountPaise,
    amountRupees,
    ratePerKmInr: RATE_PER_KM_INR,
    isMinimumFareApplied,
  };
}

/**
 * Resolves authoritative distance (km), accepting legitimate road distance from verified routing engines
 * while rejecting spoofed or manipulated values that violate physical geometric boundaries.
 */
export function resolveAuthoritativeDistance(
  straightLineDistanceKm: number,
  clientSubmittedDistanceKm?: number
): number {
  if (
    typeof clientSubmittedDistanceKm === 'number' &&
    !isNaN(clientSubmittedDistanceKm) &&
    clientSubmittedDistanceKm > 0
  ) {
    const rounded = Math.round(clientSubmittedDistanceKm * 100) / 100;
    const minThreshold = straightLineDistanceKm * 0.95;
    const maxThreshold = Math.max(5.0, straightLineDistanceKm * 3.5);
    if (rounded >= minThreshold && rounded <= maxThreshold) {
      return rounded;
    }
  }
  return Math.round(straightLineDistanceKm * 100) / 100;
}

/**
 * Synchronous computation of the complete pricing breakdown given distance, policy, and conditions.
 */
export function computePricingBreakdownSync(
  distanceKm: number,
  policy: PricingPolicyConfig,
  weatherReport?: RouteWeatherReport,
  trafficReport?: RouteTrafficReport
): PricingSnapshot {
  const baseBreakdown = calculateAuthoritativeDeliveryPrice(distanceKm);
  const baseFarePaise = baseBreakdown.amountPaise;

  let weatherSurchargePaise = 0;
  let weatherReason: string | undefined;
  if (policy.weatherSurchargeEnabled && weatherReport?.isHeavyRain) {
    const rawWeather = Math.round((baseFarePaise * policy.weatherSurchargeRatePercent) / 100);
    weatherSurchargePaise = Math.min(rawWeather, policy.weatherSurchargeCapPaise);
    weatherReason = weatherReport.reason || 'Additional charge: Heavy rain along your delivery route.';
  }

  let trafficSurchargePaise = 0;
  let trafficReason: string | undefined;
  if (policy.trafficSurchargeEnabled && trafficReport?.isHeavyTraffic) {
    const rawTraffic = Math.round((baseFarePaise * policy.trafficSurchargeRatePercent) / 100);
    trafficSurchargePaise = Math.min(rawTraffic, policy.trafficSurchargeCapPaise);
    trafficReason = trafficReport.reason || 'Additional charge: Heavy traffic along your delivery route.';
  }

  // Combination policy: Additive with conservative combined cap
  const combinedRawSurchargePaise = weatherSurchargePaise + trafficSurchargePaise;
  const maxAllowedCombinedPaise = Math.min(
    Math.round((baseFarePaise * policy.maxCombinedSurchargePercent) / 100),
    policy.maxCombinedSurchargeCapPaise
  );
  const totalSurchargePaise = Math.min(combinedRawSurchargePaise, maxAllowedCombinedPaise);

  const finalFarePaise = baseFarePaise + totalSurchargePaise;
  const finalFareRupees = finalFarePaise / 100;

  // Platform commission strictly 12%, transporter earnings strictly 88%
  const platformCommissionPaise = Math.round((finalFarePaise * 12) / 100);
  const transporterEarningsPaise = finalFarePaise - platformCommissionPaise;

  let explanation = 'Fare calculated automatically based on road distance.';
  if (weatherSurchargePaise > 0 && trafficSurchargePaise > 0) {
    explanation = 'Additional charge: Heavy rain and heavy traffic along your delivery route.';
  } else if (weatherSurchargePaise > 0) {
    explanation = weatherReason || 'Additional charge: Heavy rain along your delivery route.';
  } else if (trafficSurchargePaise > 0) {
    explanation = trafficReason || 'Additional charge: Heavy traffic along your delivery route.';
  }

  return {
    distanceKm: baseBreakdown.distanceKm,
    baseFarePaise,
    baseFareRupees: baseBreakdown.amountRupees,
    weatherSurchargePaise,
    weatherSurchargeRupees: weatherSurchargePaise / 100,
    weatherReason,
    trafficSurchargePaise,
    trafficSurchargeRupees: trafficSurchargePaise / 100,
    trafficReason,
    totalSurchargePaise,
    totalSurchargeRupees: totalSurchargePaise / 100,
    finalFarePaise,
    finalFareRupees,
    platformCommissionPaise,
    platformCommissionRupees: platformCommissionPaise / 100,
    transporterEarningsPaise,
    transporterEarningsRupees: transporterEarningsPaise / 100,
    currency: 'INR',
    currencySymbol: '₹',
    pricingVersion: policy.version,
    calculatedAt: new Date().toISOString(),
    explanation,
    evidence: {
      weather: weatherReport,
      traffic: trafficReport,
    },
  };
}

/**
 * Calculates authoritative dynamic delivery pricing including live route distance,
 * verified weather condition check, and traffic delay verification.
 */
export async function calculateDynamicDeliveryPricing(
  input: DynamicPricingInput
): Promise<PricingSnapshot> {
  const { pickupCoords, dropoffCoords, distanceKm, skipLiveChecks, mockWeather, mockTraffic } = input;
  const straightLineDistanceKm = calculateHaversineDistance(pickupCoords, dropoffCoords);
  const authoritativeDistanceKm = resolveAuthoritativeDistance(straightLineDistanceKm, distanceKm);

  const policy = await getActivePricingPolicy();

  let weatherReport: RouteWeatherReport | undefined = mockWeather;
  let trafficReport: RouteTrafficReport | undefined = mockTraffic;

  if (!skipLiveChecks && !weatherReport && process.env.NODE_ENV !== 'test') {
    weatherReport = await checkRouteWeather(pickupCoords, dropoffCoords);
  }
  if (!skipLiveChecks && !trafficReport && process.env.NODE_ENV !== 'test') {
    trafficReport = await checkRouteTraffic(pickupCoords, dropoffCoords);
  }

  return computePricingBreakdownSync(authoritativeDistanceKm, policy, weatherReport, trafficReport);
}
