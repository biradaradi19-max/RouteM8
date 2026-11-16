import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { VehicleCategory } from './PartnerApplication.js';

export type VehicleVerificationStatus = 'pending' | 'verified' | 'failed' | 'exempt';

export interface IVehicleVerification extends Document {
  userId: string;
  partnerApplicationId?: string;
  vehicleCategory: VehicleCategory;
  isExempt: boolean; // True for non-motorized transport (e.g. bicycles)
  drivingLicenceMasked?: string; // e.g. "DL-XXXXXXXX1234"
  drivingLicenceHash?: string;
  registrationNumberMasked?: string; // e.g. "MH-12-XX-XXXX"
  registrationHash?: string;
  provider: 'mock' | 'parivahan' | 'sandbox';
  providerReferenceId?: string;
  status: VehicleVerificationStatus;
  failureReason?: string;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VehicleVerificationSchema = new Schema<IVehicleVerification>(
  {
    userId: {
      type: String,
      required: true,
    },
    partnerApplicationId: {
      type: String,
      index: true,
    },
    vehicleCategory: {
      type: String,
      enum: ['bicycle', 'motorcycle', 'scooter', 'car', 'ev', 'van', 'none'],
      required: true,
    },
    isExempt: {
      type: Boolean,
      default: false,
    },
    drivingLicenceMasked: {
      type: String,
    },
    drivingLicenceHash: {
      type: String,
      index: true,
    },
    registrationNumberMasked: {
      type: String,
    },
    registrationHash: {
      type: String,
      index: true,
    },
    provider: {
      type: String,
      enum: ['mock', 'parivahan', 'sandbox'],
      default: 'mock',
    },
    providerReferenceId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'failed', 'exempt'],
      default: 'pending',
      index: true,
    },
    failureReason: {
      type: String,
      maxlength: 500,
    },
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

VehicleVerificationSchema.index({ userId: 1, status: 1 });

export const VehicleVerification: Model<IVehicleVerification> =
  (mongoose.models.VehicleVerification as Model<IVehicleVerification>) ||
  mongoose.model<IVehicleVerification>('VehicleVerification', VehicleVerificationSchema);

