import mongoose, { Schema, type Document } from 'mongoose';

export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';

export interface IDispute extends Document {
  deliveryId: string;
  initiatorId: string;
  respondentId: string;
  reason: string;
  status: DisputeStatus;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>(
  {
    deliveryId: {
      type: String,
      required: true,
      index: true,
    },
    initiatorId: {
      type: String,
      required: true,
      index: true,
    },
    respondentId: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved', 'dismissed'],
      default: 'open',
      index: true,
    },
    resolutionNote: {
      type: String,
    },
    resolvedBy: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Dispute = mongoose.models.Dispute || mongoose.model<IDispute>('Dispute', DisputeSchema);

