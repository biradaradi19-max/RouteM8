import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type RefundStatus = 'initiated' | 'processing' | 'processed' | 'failed';

export interface IRefund extends Document {
  paymentOrderId: string;
  deliveryId: string;
  requesterId: string;
  amountPaise: number; // Integer paise
  currency?: string;
  currencyCode?: string;
  amountMinorUnits?: number;
  originalAmountMinorUnits?: number;
  originalCurrencyCode?: string;
  reason: string;
  provider: 'mock' | 'cashfree' | 'razorpay';
  providerRefundId?: string;
  status: RefundStatus;
  processedAt?: Date;
  failureReason?: string;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<IRefund>(
  {
    paymentOrderId: {
      type: String,
      required: true,
      index: true,
    },
    deliveryId: {
      type: String,
      required: true,
      index: true,
    },
    requesterId: {
      type: String,
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'amountPaise must be an exact integer',
      },
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    currencyCode: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    amountMinorUnits: {
      type: Number,
      min: 1,
    },
    originalAmountMinorUnits: {
      type: Number,
      min: 1,
    },
    originalCurrencyCode: {
      type: String,
      uppercase: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 500,
    },
    provider: {
      type: String,
      enum: ['mock', 'cashfree', 'razorpay'],
      default: 'mock',
    },
    providerRefundId: {
      type: String,
      index: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['initiated', 'processing', 'processed', 'failed'],
      default: 'initiated',
      index: true,
    },
    processedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

RefundSchema.index({ requesterId: 1, status: 1 });

export const Refund: Model<IRefund> =
  (mongoose.models.Refund as Model<IRefund>) || mongoose.model<IRefund>('Refund', RefundSchema);

