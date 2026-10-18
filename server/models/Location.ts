import mongoose, { Schema, type Document } from 'mongoose';

export interface ILocation extends Document {
  deliveryId: string;
  transporterId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  createdAt: Date;
  updatedAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    deliveryId: {
      type: String,
      required: true,
      index: true,
    },
    transporterId: {
      type: String,
      required: true,
      index: true,
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    heading: {
      type: Number,
      min: 0,
      max: 360,
    },
    speed: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize for fetching the latest location for a delivery
LocationSchema.index({ deliveryId: 1, updatedAt: -1 });

export const Location = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema);
