import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type RateType = 'benchmark' | 'live' | 'fixed';

export interface IConversionQuote extends Document {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinorUnits: number; // Integer minor units
  targetAmountMinorUnits: number; // Integer minor units
  exchangeRate: number;
  rateType: RateType;
  source: string;
  signature: string;
  isUsed: boolean;
  usedAt?: Date;
  usedInOrderId?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversionQuoteSchema = new Schema<IConversionQuote>(
  {
    quoteId: { type: String, required: true, unique: true, index: true },
    sourceCurrency: { type: String, required: true, uppercase: true, trim: true },
    targetCurrency: { type: String, required: true, uppercase: true, trim: true },
    sourceAmountMinorUnits: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer minor unit',
      },
    },
    targetAmountMinorUnits: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer minor unit',
      },
    },
    exchangeRate: { type: Number, required: true },
    rateType: {
      type: String,
      enum: ['benchmark', 'live', 'fixed'],
      default: 'benchmark',
    },
    source: { type: String, default: 'benchmark_inr_v1' },
    signature: { type: String, required: true },
    isUsed: { type: Boolean, default: false, index: true },
    usedAt: { type: Date },
    usedInOrderId: { type: String },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  {
    timestamps: true,
  }
);

export const ConversionQuote: Model<IConversionQuote> =
  mongoose.models.ConversionQuote || mongoose.model<IConversionQuote>('ConversionQuote', conversionQuoteSchema);

