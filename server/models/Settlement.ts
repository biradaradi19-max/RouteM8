import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type SettlementStatus = 'pending' | 'queued' | 'processing' | 'settled' | 'failed' | 'reversed';
export type SettlementEntryType = 'settlement' | 'reversal';

export interface ISettlement extends Document {
  paymentOrderId: string;
  deliveryId: string;
  transporterId: string;
  vendorId?: string;
  provider: 'mock' | 'cashfree' | 'razorpay';
  providerVendorId: string;
  providerTransferId?: string;
  amountPaise: number; // Integer paise
  grossOrderAmountPaise?: number;
  platformCommissionPaise?: number;
  refundDeductionPaise?: number;
  negativeBalanceOffsetPaise?: number; // Integer paise offset to recover debt
  payoutAmountPaise?: number; // Actual disbursed paise after offset
  currency?: string;
  currencyCode?: string;
  amountMinorUnits?: number;
  originalAmountMinorUnits?: number;
  originalCurrencyCode?: string;
  exchangeRate?: number;
  conversionQuoteId?: string;
  entryType: SettlementEntryType;
  originalSettlementId?: string; // Links compensating reversal to original settlement
  reversalLedgerId?: string; // Links original settlement to its compensating entry
  isReversed?: boolean;
  actorId?: string;
  actorEmail?: string;
  status: SettlementStatus;
  isMock: boolean;
  recoveredRealMoney?: boolean;
  settledAt?: Date;
  failureReason?: string;
  reversalReason?: string;
  reversedAt?: Date;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    paymentOrderId: {
      type: String,
      required: true,
    },
    deliveryId: {
      type: String,
      required: true,
      index: true,
    },
    transporterId: {
      type: String,
      required: true,
      index: true,
    },
    vendorId: {
      type: String,
      sparse: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['mock', 'cashfree', 'razorpay'],
      default: 'mock',
    },
    providerVendorId: {
      type: String,
      required: true,
    },
    providerTransferId: {
      type: String,
      index: true,
      sparse: true,
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
    exchangeRate: {
      type: Number,
    },
    conversionQuoteId: {
      type: String,
      trim: true,
    },
    grossOrderAmountPaise: {
      type: Number,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'grossOrderAmountPaise must be an integer in paise',
      },
    },
    platformCommissionPaise: {
      type: Number,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'platformCommissionPaise must be an integer in paise',
      },
    },
    refundDeductionPaise: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'refundDeductionPaise must be an integer in paise',
      },
    },
    negativeBalanceOffsetPaise: {
      type: Number,
      default: 0,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'negativeBalanceOffsetPaise must be an integer in paise',
      },
    },
    payoutAmountPaise: {
      type: Number,
      validate: {
        validator: (v: number) => v === undefined || Number.isInteger(v),
        message: 'payoutAmountPaise must be an integer in paise',
      },
    },
    entryType: {
      type: String,
      enum: ['settlement', 'reversal'],
      default: 'settlement',
      index: true,
    },
    originalSettlementId: {
      type: String,
    },
    reversalLedgerId: {
      type: String,
      sparse: true,
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    actorId: {
      type: String,
    },
    actorEmail: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'queued', 'processing', 'settled', 'failed', 'reversed'],
      default: 'pending',
      index: true,
    },
    isMock: {
      type: Boolean,
      default: true,
    },
    recoveredRealMoney: {
      type: Boolean,
      default: false,
    },
    settledAt: {
      type: Date,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    reversalReason: {
      type: String,
      maxlength: 500,
    },
    reversedAt: {
      type: Date,
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

// Database-level unique constraint: exactly one primary settlement per paymentOrder
SettlementSchema.index(
  { paymentOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { entryType: 'settlement' },
  }
);
SettlementSchema.index({ transporterId: 1, status: 1 });
SettlementSchema.index({ paymentOrderId: 1, status: 1 });
SettlementSchema.index({ originalSettlementId: 1 }, { sparse: true });

export const Settlement: Model<ISettlement> =
  (mongoose.models.Settlement as Model<ISettlement>) || mongoose.model<ISettlement>('Settlement', SettlementSchema);
