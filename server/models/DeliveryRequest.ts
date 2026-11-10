import mongoose, { Schema, type Document } from 'mongoose';

export type DeliveryStatus = 'open' | 'matched' | 'in_transit' | 'completed' | 'cancelled';
export type ItemSize = 'small' | 'medium' | 'large';
export type RequestUrgency = 'standard' | 'flexible' | 'urgent';
export type RequestCategory = 'groceries' | 'campus-supplies' | 'essentials' | 'pharmacy' | 'electronics' | 'other';

export interface IDeliveryStatusHistory {
  status: DeliveryStatus;
  changedAt: Date;
  changedBy: string;
  note?: string;
}

export interface IDeliveryRequest extends Document {
  _id: any;
  title: string;
  description: string;
  category: RequestCategory;
  pickupAddress: string;
  pickupCoords: [number, number]; // [lat, lng]
  pickupPlaceId?: string;
  dropoffAddress: string;
  dropoffCoords: [number, number]; // [lat, lng]
  dropoffPlaceId?: string;
  itemSize: ItemSize;
  weightEstimateKg?: number;
  compensation: number;
  urgency: RequestUrgency;
  neededBy: string;
  status: DeliveryStatus;
  statusHistory: IDeliveryStatusHistory[];
  requesterId: string;
  requesterName: string;
  requesterTrustScore: number;
  requesterAvatar?: string;
  transporterId?: string;
  transporterName?: string;
  transporterAvatar?: string;
  transporterVehicle?: string;
  handoverPin: string;
  handoverPinHash?: string;
  handoverPinSalt?: string;
  pinAttempts: number;
  pinLockedUntil?: Date;
  proofPhotoUrl?: string;
  proofPhotoMetadata?: {
    size?: number;
    mimeType?: string;
    uploadedAt?: Date;
  };
  rejectedBy: string[];
  distanceKm?: number;
  estimatedDurationMin?: number;
  estimatedDetourMinutes?: number;
  lastKnownLocation?: {
    deliveryId: string;
    transporterId: string;
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    updatedAt: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryRequestSchema = new Schema<IDeliveryRequest>(
  {
    _id: {
      type: Schema.Types.Mixed,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['groceries', 'campus-supplies', 'essentials', 'pharmacy', 'electronics', 'other'],
      default: 'other',
    },
    pickupAddress: {
      type: String,
      required: true,
    },
    pickupCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: 'Invalid pickup coordinates [lat, lng]',
      },
    },
    pickupPlaceId: {
      type: String,
      trim: true,
    },
    dropoffAddress: {
      type: String,
      required: true,
    },
    dropoffCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: 'Invalid dropoff coordinates [lat, lng]',
      },
    },
    dropoffPlaceId: {
      type: String,
      trim: true,
    },
    itemSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },
    weightEstimateKg: {
      type: Number,
      min: 0,
    },
    compensation: {
      type: Number,
      required: true,
      min: 0,
    },
    urgency: {
      type: String,
      enum: ['standard', 'flexible', 'urgent'],
      default: 'standard',
    },
    neededBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'matched', 'in_transit', 'completed', 'cancelled'],
      default: 'open',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String, required: true },
        note: { type: String },
      },
    ],
    requesterId: {
      type: String,
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      required: true,
    },
    requesterTrustScore: {
      type: Number,
      default: 90,
    },
    requesterAvatar: {
      type: String,
    },
    transporterId: {
      type: String,
      index: true,
    },
    transporterName: {
      type: String,
    },
    transporterAvatar: {
      type: String,
    },
    transporterVehicle: {
      type: String,
    },
    handoverPin: {
      type: String,
      required: true,
    },
    handoverPinHash: {
      type: String,
      index: true,
    },
    handoverPinSalt: {
      type: String,
    },
    pinAttempts: {
      type: Number,
      default: 0,
    },
    pinLockedUntil: {
      type: Date,
    },
    proofPhotoUrl: {
      type: String,
    },
    proofPhotoMetadata: {
      size: Number,
      mimeType: String,
      uploadedAt: Date,
    },
    rejectedBy: {
      type: [String],
      default: [],
      index: true,
    },
    distanceKm: {
      type: Number,
    },
    estimatedDurationMin: {
      type: Number,
    },
    estimatedDetourMinutes: {
      type: Number,
      default: 5,
    },
    lastKnownLocation: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

DeliveryRequestSchema.index({ status: 1, createdAt: -1 });
DeliveryRequestSchema.index({ requesterId: 1, createdAt: -1 });
DeliveryRequestSchema.index({ transporterId: 1, status: 1 });

export const DeliveryRequest =
  mongoose.models.DeliveryRequest || mongoose.model<IDeliveryRequest>('DeliveryRequest', DeliveryRequestSchema);
