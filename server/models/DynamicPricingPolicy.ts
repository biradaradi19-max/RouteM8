import mongoose, { Schema, type Document, type Model } from 'mongoose';
import { isDbConnected } from '../config/db.js';

export interface IDynamicPricingPolicy extends Document {
  version: string;
  isActive: boolean;
  ratePerKmInr: number;
  minFarePaise: number;
  weatherSurchargeEnabled: boolean;
  weatherSurchargeRatePercent: number;
  weatherSurchargeCapPaise: number;
  trafficSurchargeEnabled: boolean;
  trafficSurchargeRatePercent: number;
  trafficSurchargeCapPaise: number;
  combinationPolicy: 'additive_capped';
  maxCombinedSurchargePercent: number;
  maxCombinedSurchargeCapPaise: number;
  updatedBy: string;
  approvedBy?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingPolicyConfig {
  version: string;
  isActive: boolean;
  ratePerKmInr: number;
  minFarePaise: number;
  weatherSurchargeEnabled: boolean;
  weatherSurchargeRatePercent: number;
  weatherSurchargeCapPaise: number;
  trafficSurchargeEnabled: boolean;
  trafficSurchargeRatePercent: number;
  trafficSurchargeCapPaise: number;
  combinationPolicy: 'additive_capped';
  maxCombinedSurchargePercent: number;
  maxCombinedSurchargeCapPaise: number;
  updatedBy: string;
  approvedBy?: string;
  notes?: string;
}

export const DEFAULT_PRICING_POLICY: PricingPolicyConfig = {
  version: '1.0.0',
  isActive: true,
  ratePerKmInr: 7.0,
  minFarePaise: 700, // ₹7.00
  weatherSurchargeEnabled: true,
  weatherSurchargeRatePercent: 15.0, // 15% surge for heavy rain
  weatherSurchargeCapPaise: 3500, // ₹35.00 maximum weather surge
  trafficSurchargeEnabled: true,
  trafficSurchargeRatePercent: 15.0, // 15% surge for heavy congestion
  trafficSurchargeCapPaise: 3500, // ₹35.00 maximum traffic surge
  combinationPolicy: 'additive_capped',
  maxCombinedSurchargePercent: 25.0, // 25% max surge when both rain + traffic occur
  maxCombinedSurchargeCapPaise: 5000, // ₹50.00 max surge when both occur
  updatedBy: 'system-initialization',
  approvedBy: 'system-administrator',
  notes: 'Approved authoritative pricing policy: ₹7/km base, conservative dynamic surcharges capped at 25% / ₹50.',
};

// In-memory fallback policy (used during tests or offline modes)
let inMemoryActivePolicy: PricingPolicyConfig = { ...DEFAULT_PRICING_POLICY };

export function resetInMemoryPricingPolicy(): void {
  inMemoryActivePolicy = { ...DEFAULT_PRICING_POLICY };
}

export function setInMemoryPricingPolicy(override: Partial<PricingPolicyConfig>): void {
  inMemoryActivePolicy = { ...inMemoryActivePolicy, ...override };
}

const DynamicPricingPolicySchema = new Schema<IDynamicPricingPolicy>(
  {
    version: {
      type: String,
      required: true,
      default: '1.0.0',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    ratePerKmInr: {
      type: Number,
      default: 7.0,
      min: 1.0,
      max: 50.0,
    },
    minFarePaise: {
      type: Number,
      default: 700,
      min: 100,
    },
    weatherSurchargeEnabled: {
      type: Boolean,
      default: true,
    },
    weatherSurchargeRatePercent: {
      type: Number,
      default: 15.0,
      min: 0,
      max: 30.0,
    },
    weatherSurchargeCapPaise: {
      type: Number,
      default: 3500,
      min: 0,
      max: 10000,
    },
    trafficSurchargeEnabled: {
      type: Boolean,
      default: true,
    },
    trafficSurchargeRatePercent: {
      type: Number,
      default: 15.0,
      min: 0,
      max: 30.0,
    },
    trafficSurchargeCapPaise: {
      type: Number,
      default: 3500,
      min: 0,
      max: 10000,
    },
    combinationPolicy: {
      type: String,
      enum: ['additive_capped'],
      default: 'additive_capped',
    },
    maxCombinedSurchargePercent: {
      type: Number,
      default: 25.0,
      min: 0,
      max: 40.0,
    },
    maxCombinedSurchargeCapPaise: {
      type: Number,
      default: 5000,
      min: 0,
      max: 15000,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    approvedBy: {
      type: String,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

DynamicPricingPolicySchema.index({ isActive: 1, updatedAt: -1 });

export const DynamicPricingPolicy: Model<IDynamicPricingPolicy> =
  (mongoose.models.DynamicPricingPolicy as Model<IDynamicPricingPolicy>) ||
  mongoose.model<IDynamicPricingPolicy>('DynamicPricingPolicy', DynamicPricingPolicySchema);

/**
 * Returns the currently active pricing policy configuration.
 */
export async function getActivePricingPolicy(): Promise<PricingPolicyConfig> {
  if (isDbConnected()) {
    try {
      const active = await DynamicPricingPolicy.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
      if (active) {
        return {
          version: active.version,
          isActive: active.isActive,
          ratePerKmInr: active.ratePerKmInr,
          minFarePaise: active.minFarePaise,
          weatherSurchargeEnabled: active.weatherSurchargeEnabled,
          weatherSurchargeRatePercent: active.weatherSurchargeRatePercent,
          weatherSurchargeCapPaise: active.weatherSurchargeCapPaise,
          trafficSurchargeEnabled: active.trafficSurchargeEnabled,
          trafficSurchargeRatePercent: active.trafficSurchargeRatePercent,
          trafficSurchargeCapPaise: active.trafficSurchargeCapPaise,
          combinationPolicy: active.combinationPolicy,
          maxCombinedSurchargePercent: active.maxCombinedSurchargePercent,
          maxCombinedSurchargeCapPaise: active.maxCombinedSurchargeCapPaise,
          updatedBy: active.updatedBy,
          approvedBy: active.approvedBy,
          notes: active.notes,
        };
      }
    } catch {
      // Fall through to memory
    }
  }
  return { ...inMemoryActivePolicy };
}
