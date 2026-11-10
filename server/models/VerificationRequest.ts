import mongoose, { Schema, type Document } from 'mongoose';

export type VerificationType = 'student' | 'work' | 'gov_id';
export type VerificationRequestStatus = 'pending_review' | 'approved' | 'rejected';

export interface IVerificationRequest extends Document {
  userId: string;
  userEmail: string;
  userName: string;
  verificationType: VerificationType;
  organizationName: string;
  evidenceDomainOrId: string;
  status: VerificationRequestStatus;
  selfieBase64Snippet?: string;
  consentGiven: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VerificationRequestSchema = new Schema<IVerificationRequest>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },
    verificationType: {
      type: String,
      enum: ['student', 'work', 'gov_id'],
      default: 'student',
    },
    organizationName: {
      type: String,
      required: true,
    },
    evidenceDomainOrId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
      index: true,
    },
    selfieBase64Snippet: {
      type: String,
    },
    consentGiven: {
      type: Boolean,
      default: true,
    },
    reviewedBy: {
      type: String,
    },
    reviewedAt: {
      type: Date,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const VerificationRequest =
  mongoose.models.VerificationRequest ||
  mongoose.model<IVerificationRequest>('VerificationRequest', VerificationRequestSchema);

