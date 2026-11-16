import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IAdminAuditLog extends Document {
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminUserId: {
      type: String,
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
    },
    targetId: {
      type: String,
      required: true,
    },
    previousState: {
      type: Schema.Types.Mixed,
    },
    newState: {
      type: Schema.Types.Mixed,
    },
    reason: {
      type: String,
      maxlength: 1000,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const AdminAuditLog: Model<IAdminAuditLog> =
  (mongoose.models.AdminAuditLog as Model<IAdminAuditLog>) || mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);

