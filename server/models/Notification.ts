import mongoose, { Schema, type Document } from 'mongoose';

export type NotificationType =
  | 'delivery_matched'
  | 'delivery_in_transit'
  | 'delivery_completed'
  | 'delivery_cancelled'
  | 'verification_approved'
  | 'verification_rejected'
  | 'new_message';

export interface INotification extends Document {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedDeliveryId?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    relatedDeliveryId: {
      type: String,
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

