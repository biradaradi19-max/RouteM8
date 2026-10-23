import mongoose, { Schema } from 'mongoose';
const ActivitySchema = new Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['request_created', 'journey_published', 'match_found', 'in_transit', 'delivered'],
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    relatedId: {
        type: String,
        index: true,
    },
    status: {
        type: String,
        enum: ['open', 'matched', 'in_transit', 'completed', 'cancelled'],
    },
}, {
    timestamps: true,
});
ActivitySchema.index({ userId: 1, createdAt: -1 });
export const Activity = mongoose.models.Activity || mongoose.model('Activity', ActivitySchema);
