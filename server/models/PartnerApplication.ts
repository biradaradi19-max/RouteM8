import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type PartnerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'verification_pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type VehicleCategory = 'bicycle' | 'motorcycle' | 'scooter' | 'car' | 'ev' | 'van' | 'none';

export interface IPartnerApplication extends Document {
  applicantId: string; // Firebase UID
  applicantEmail: string;
  applicantName: string;
  phone?: string;
  status: PartnerApplicationStatus;
  vehicleCategory: VehicleCategory;
  identityVerificationId?: string;
  vehicleVerificationId?: string;
  rejectionReason?: string;
  suspensionReason?: string;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerApplicationSchema = new Schema<IPartnerApplication>(
  {
    applicantId: {
      type: String,
      required: true,
    },
    applicantEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    applicantName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'verification_pending',
        'under_review',
        'approved',
        'rejected',
        'suspended',
      ],
      default: 'draft',
    },
    vehicleCategory: {
      type: String,
      enum: ['bicycle', 'motorcycle', 'scooter', 'car', 'ev', 'van', 'none'],
      default: 'motorcycle',
    },
    identityVerificationId: {
      type: String,
    },
    vehicleVerificationId: {
      type: String,
    },
    rejectionReason: {
      type: String,
      maxlength: 1000,
    },
    suspensionReason: {
      type: String,
      maxlength: 1000,
    },
    notes: {
      type: String,
      maxlength: 2000,
    },
    reviewedBy: {
      type: String,
    },
    reviewedAt: {
      type: Date,
    },
    submittedAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// High-efficiency composite index for operations queries and uniqueness per applicant
PartnerApplicationSchema.index({ applicantId: 1, createdAt: -1 });
PartnerApplicationSchema.index({ status: 1, createdAt: -1 });

export const PartnerApplication: Model<IPartnerApplication> =
  (mongoose.models.PartnerApplication as Model<IPartnerApplication>) ||
  mongoose.model<IPartnerApplication>('PartnerApplication', PartnerApplicationSchema);

