import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IPaymentEvent extends Document {
  eventId: string;
  provider: string;
  eventType: string;
  payload: Record<string, any>;
  signature: string;
  isSignatureVerified: boolean;
  processed: boolean;
  processedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    provider: {
      type: String,
      required: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    signature: {
      type: String,
      required: true,
    },
    isSignatureVerified: {
      type: Boolean,
      required: true,
      index: true,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

PaymentEventSchema.index({ provider: 1, createdAt: -1 });

export const PaymentEvent: Model<IPaymentEvent> =
  (mongoose.models.PaymentEvent as Model<IPaymentEvent>) || mongoose.model<IPaymentEvent>('PaymentEvent', PaymentEventSchema);

