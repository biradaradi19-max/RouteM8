import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type VendorVerificationStatus = 'verified' | 'unverified' | 'suspended';

export interface IVendorAccount extends Document {
  vendorId: string; // e.g. "vend_mock_<transporterId>"
  transporterId: string; // Firebase UID
  transporterName: string;
  verificationStatus: VendorVerificationStatus;
  bankAccountRef: string; // Masked reference, e.g. "HDFC-****4821"
  ifscCode: string; // e.g. "HDFC0001234"
  isEligibleForSettlement: boolean;
  unresolvedNegativeBalancePaise: number; // Integer paise owed back to platform
  totalNegativeExposureRecoveredPaise: number; // Integer paise recovered from subsequent earnings
  lastRecoveryAt?: Date;
  isMock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorAccountSchema = new Schema<IVendorAccount>(
  {
    vendorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transporterId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    transporterName: {
      type: String,
      required: true,
      trim: true,
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'unverified', 'suspended'],
      default: 'verified',
      index: true,
    },
    bankAccountRef: {
      type: String,
      required: true,
      trim: true,
    },
    ifscCode: {
      type: String,
      required: true,
      default: 'HDFC0001234',
    },
    isEligibleForSettlement: {
      type: Boolean,
      default: true,
    },
    unresolvedNegativeBalancePaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'unresolvedNegativeBalancePaise must be an integer in paise',
      },
    },
    totalNegativeExposureRecoveredPaise: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'totalNegativeExposureRecoveredPaise must be an integer in paise',
      },
    },
    lastRecoveryAt: {
      type: Date,
    },
    isMock: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const VendorAccount: Model<IVendorAccount> =
  (mongoose.models.VendorAccount as Model<IVendorAccount>) || mongoose.model<IVendorAccount>('VendorAccount', VendorAccountSchema);

