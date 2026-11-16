import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ICommissionConfig extends Document {
  ratePercent: number; // e.g. 10.0 means 10%
  minCommissionPaise: number;
  maxCommissionPaise?: number;
  isActive: boolean;
  effectiveFrom: Date;
  updatedBy: string; // Admin UID
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionConfigSchema = new Schema<ICommissionConfig>(
  {
    ratePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 50,
      default: 12.0,
    },
    minCommissionPaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxCommissionPaise: {
      type: Number,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

export const CommissionConfig: Model<ICommissionConfig> =
  (mongoose.models.CommissionConfig as Model<ICommissionConfig>) ||
  mongoose.model<ICommissionConfig>('CommissionConfig', CommissionConfigSchema);

