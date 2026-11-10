import mongoose, { Schema, type Document } from 'mongoose';

export interface IReview extends Document {
  deliveryId: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reviewerId: {
      type: String,
      required: true,
      index: true,
    },
    reviewerName: {
      type: String,
      required: true,
    },
    revieweeId: {
      type: String,
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

ReviewSchema.index({ revieweeId: 1, rating: -1 });

export const Review = mongoose.models.Review || mongoose.model<IReview>('Review', ReviewSchema);

