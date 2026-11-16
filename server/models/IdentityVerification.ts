import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type IdDocumentType = 'aadhaar_offline' | 'pan' | 'voter_id' | 'passport' | 'driving_licence';
export type VerificationProvider = 'mock' | 'cashfree' | 'digilocker' | 'sandbox';
export type VerificationStatus = 'initiated' | 'pending' | 'verified' | 'failed' | 'rejected';

export interface IConsentRecord {
  consentObtained: boolean;
  consentTimestamp: Date;
  consentVersion: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface IIdentityVerification extends Document {
  userId: string;
  partnerApplicationId?: string;
  idType: IdDocumentType;
  provider: VerificationProvider;
  providerReferenceId: string;
  maskedId: string; // Only last 4 characters visible, e.g. "XXXXXXXX1234"
  verificationHash: string; // SHA-256 HMAC for deduplication; never plaintext ID
  consentRecord: IConsentRecord;
  status: VerificationStatus;
  failureReason?: string;
  verifiedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IdentityVerificationSchema = new Schema<IIdentityVerification>(
  {
    userId: {
      type: String,
      required: true,
    },
    partnerApplicationId: {
      type: String,
    },
    idType: {
      type: String,
      enum: ['aadhaar_offline', 'pan', 'voter_id', 'passport', 'driving_licence'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['mock', 'cashfree', 'digilocker', 'sandbox'],
      default: 'mock',
    },
    providerReferenceId: {
      type: String,
      required: true,
      index: true,
    },
    maskedId: {
      type: String,
      required: true,
    },
    verificationHash: {
      type: String,
      required: true,
    },
    consentRecord: {
      consentObtained: { type: Boolean, required: true },
      consentTimestamp: { type: Date, default: Date.now },
      consentVersion: { type: String, required: true },
      ipAddress: { type: String },
      userAgent: { type: String },
    },
    status: {
      type: String,
      enum: ['initiated', 'pending', 'verified', 'failed', 'rejected'],
      default: 'initiated',
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    verifiedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

IdentityVerificationSchema.index({ userId: 1, status: 1 });
IdentityVerificationSchema.index({ verificationHash: 1 });

export const IdentityVerification: Model<IIdentityVerification> =
  (mongoose.models.IdentityVerification as Model<IIdentityVerification>) ||
  mongoose.model<IIdentityVerification>('IdentityVerification', IdentityVerificationSchema);

