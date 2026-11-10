import mongoose, { Schema, type Document } from 'mongoose';

export interface IMessage extends Document {
  deliveryId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    deliveryId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ deliveryId: 1, createdAt: 1 });

export const Message = mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);

