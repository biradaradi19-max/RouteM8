import mongoose, { Schema, type Document } from 'mongoose';

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  username?: string;
  fullName: string;
  role: 'both' | 'requester' | 'transporter';
  verificationStatus: string;
  accountStatus: string;
  organization?: string;
  commuteVehicle?: string;
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
      enum: ['both', 'requester', 'transporter'],
      default: 'both',
    },
    verificationStatus: {
      type: String,
      default: 'email_verified',
    },
    accountStatus: {
      type: String,
      default: 'active',
    },
    organization: {
      type: String,
      trim: true,
    },
    commuteVehicle: {
      type: String,
      trim: true,
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
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
