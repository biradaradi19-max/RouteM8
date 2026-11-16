import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type PaymentOrderStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'partially_refunded'
  | 'split_pending'
  | 'settled'
  | 'refunded'
  | 'failed'
  | 'cancelled';

export type PaymentGatewayProvider = 'mock' | 'cashfree' | 'razorpay';

export interface ICommissionSnapshot {
  ratePercent: number;
  platformSharePaise: number; // Integer paise
  partnerSharePaise: number; // Integer paise
  calculatedAt: Date;
}

export interface IPaymentOrder extends Document {
  deliveryId: string;
  requesterId: string;
  transporterId?: string;
  currency: string;
  currencyCode?: string; // Standardized ISO 4217 code
  amountPaise: number; // Always integer paise: e.g. ₹500.00 = 50000 paise (backward compatibility)
  amountMinorUnits?: number; // Integer minor units (paise, cents, pence)
  refundedAmountPaise?: number; // Cumulative refunded integer paise
  originalAmountMinorUnits?: number;
  originalCurrencyCode?: string;
  exchangeRate?: number;
  conversionQuoteId?: string;
  commissionSnapshot: ICommissionSnapshot;
  provider: PaymentGatewayProvider;
  providerOrderId?: string;
  providerPaymentId?: string;
  idempotencyKey: string;
  status: PaymentOrderStatus;
  paidAt?: Date;
  splitAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOrderSchema = new Schema<IPaymentOrder>(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
    },
    requesterId: {
      type: String,
      required: true,
    },
    transporterId: {
      type: String,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
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
    exchangeRate: {
      type: Number,
    },
    conversionQuoteId: {
      type: String,
      trim: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 100, // Minimum ₹1.00
      validate: {
        validator: Number.isInteger,
        message: 'amountPaise must be an exact integer',
      },
    },
    refundedAmountPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'refundedAmountPaise must be an exact integer',
      },
    },
    commissionSnapshot: {
      ratePercent: { type: Number, required: true },
      platformSharePaise: { type: Number, required: true },
      partnerSharePaise: { type: Number, required: true },
      calculatedAt: { type: Date, default: Date.now },
    },
    provider: {
      type: String,
      enum: ['mock', 'cashfree', 'razorpay'],
      default: 'mock',
    },
    providerOrderId: {
      type: String,
      index: true,
      sparse: true,
    },
    providerPaymentId: {
      type: String,
      index: true,
      sparse: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['created', 'pending', 'paid', 'partially_refunded', 'split_pending', 'settled', 'refunded', 'failed', 'cancelled'],
      default: 'created',
      index: true,
    },
    paidAt: {
      type: Date,
    },
    splitAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

PaymentOrderSchema.index({ requesterId: 1, status: 1 });
PaymentOrderSchema.index({ transporterId: 1, status: 1 });

export const PaymentOrder: Model<IPaymentOrder> =
  (mongoose.models.PaymentOrder as Model<IPaymentOrder>) || mongoose.model<IPaymentOrder>('PaymentOrder', PaymentOrderSchema);

