import mongoose, { Schema, type Document } from 'mongoose';

export type UserRole = 'customer' | 'requester' | 'transporter' | 'both' | 'admin';
export type VerificationStatus =
  | 'unverified'
  | 'email_verified'
  | 'pending_review'
  | 'verified'
  | 'student_verified'
  | 'work_verified'
  | 'gov_id_verified';
export type AccountStatus = 'active' | 'suspended' | 'pending_approval';

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  username?: string;
  fullName: string;
  role: UserRole;
  verificationStatus: VerificationStatus;
  accountStatus: AccountStatus;
  organization?: string;
  commuteVehicle?: string;
  phone?: string;
  isPhoneVerified: boolean;
  phoneVerifiedAt?: Date;
  isAdmin: boolean;
  trustScore: number;
  completedDeliveries: number;
  completedCommutes: number;
  rating: number;
  avatarUrl?: string;
  bio?: string;
  partnerAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_]+$/,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['customer', 'requester', 'transporter', 'both', 'admin'],
      default: 'both',
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: [
        'unverified',
        'email_verified',
        'pending_review',
        'verified',
        'student_verified',
        'work_verified',
        'gov_id_verified',
      ],
      default: 'unverified',
      index: true,
    },
    accountStatus: {
      type: String,
      enum: ['active', 'suspended', 'pending_approval'],
      default: 'active',
      index: true,
    },
    organization: {
      type: String,
      trim: true,
    },
    commuteVehicle: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerifiedAt: {
      type: Date,
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    trustScore: {
      type: Number,
      default: 85,
      min: 0,
      max: 100,
    },
    completedDeliveries: {
      type: Number,
      default: 0,
    },
    completedCommutes: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 1,
      max: 5,
    },
    avatarUrl: {
      type: String,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    partnerAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
