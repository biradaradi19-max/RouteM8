/**
 * RouteM8 Authoritative Pricing Engine
 * 
 * Strict Business Rules:
 * - Rate: ₹7.00 per kilometer (700 paise / km).
 * - Minimum Fare: ₹7.00 (700 paise) for sub-kilometre or zero-distance deliveries.
 * - Distance precision: 2 decimal places (fractional kilometres rounded to nearest 0.01 km).
 * - Currency calculations strictly in integer paise (no floating point currency rounding drift).
 * 
 * Official Reference Examples:
 * - 10.00 km -> ₹70.00 total (7,000 paise)
 *   - Commission (12%): ₹8.40 (840 paise)
 *   - Transporter share (88%): ₹61.60 (6,160 paise)
 * - 25.00 km -> ₹175.00 total (17,500 paise)
 *   - Commission (12%): ₹21.00 (2,100 paise)
 *   - Transporter share (88%): ₹154.00 (15,400 paise)
 */

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

/**
 * Calculates authoritative delivery pricing based strictly on distance.
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

