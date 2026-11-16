import { CommissionConfig } from '../models/CommissionConfig.js';
import { isDbConnected } from '../config/db.js';
import type { ICommissionSnapshot } from '../models/PaymentOrder.js';

export const DEFAULT_COMMISSION_RATE_PERCENT = 12.0;

export interface CommissionCalculationResult {
  amountPaise: number;
  commissionRatePercent: number;
  platformSharePaise: number;
  partnerSharePaise: number;
  snapshot: ICommissionSnapshot;
}

/**
 * Calculates marketplace platform commission and partner payout share
 * using strict integer paise arithmetic (no floating point currency rounding issues).
 */
export async function calculateCommission(
  amountPaise: number,
  customRatePercent?: number
): Promise<CommissionCalculationResult> {
  if (!Number.isInteger(amountPaise) || amountPaise < 0) {
    throw new Error('amountPaise must be a non-negative integer representing paise');
  }

  let ratePercent = DEFAULT_COMMISSION_RATE_PERCENT;

  if (customRatePercent !== undefined) {
    ratePercent = customRatePercent;
  } else if (isDbConnected()) {
    try {
      const activeConfig = await CommissionConfig.findOne({ isActive: true }).sort({ effectiveFrom: -1 });
      if (activeConfig && typeof activeConfig.ratePercent === 'number') {
        ratePercent = activeConfig.ratePercent;
      }
    } catch {
      ratePercent = DEFAULT_COMMISSION_RATE_PERCENT; // Default fallback to 12.0%
    }
  }

  if (ratePercent < 0 || ratePercent > 50) {
    throw new Error('Commission rate must be between 0% and 50%');
  }

  // Integer arithmetic: Calculate platform share rounded to nearest paise
  const platformSharePaise = Math.round((amountPaise * ratePercent) / 100);

  // Remainder to partner guarantees platformShare + partnerShare === amountPaise exactly
  const partnerSharePaise = amountPaise - platformSharePaise;

  const now = new Date();
  const snapshot: ICommissionSnapshot = {
    ratePercent,
    platformSharePaise,
    partnerSharePaise,
    calculatedAt: now,
  };

  return {
    amountPaise,
    commissionRatePercent: ratePercent,
    platformSharePaise,
    partnerSharePaise,
    snapshot,
  };
}

/**
 * Synchronous version for performance-critical inline computations where commission rate is known
 */
export function calculateCommissionSync(
  amountPaise: number,
  ratePercent: number = DEFAULT_COMMISSION_RATE_PERCENT
): CommissionCalculationResult {
  if (!Number.isInteger(amountPaise) || amountPaise < 0) {
    throw new Error('amountPaise must be a non-negative integer representing paise');
  }

  if (ratePercent < 0 || ratePercent > 50) {
    throw new Error('Commission rate must be between 0% and 50%');
  }

  const platformSharePaise = Math.round((amountPaise * ratePercent) / 100);
  const partnerSharePaise = amountPaise - platformSharePaise;

  const now = new Date();
  return {
    amountPaise,
    commissionRatePercent: ratePercent,
    platformSharePaise,
    partnerSharePaise,
    snapshot: {
      ratePercent,
      platformSharePaise,
      partnerSharePaise,
      calculatedAt: now,
    },
  };
}
