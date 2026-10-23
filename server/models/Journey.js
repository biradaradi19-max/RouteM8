import mongoose, { Schema } from 'mongoose';
const JourneySchema = new Schema({
    transporterId: {
        type: String,
        required: true,
        index: true,
    },
    transporterName: {
        type: String,
        required: true,
    },
    transporterAvatar: {
        type: String,
    },
    transporterTrustScore: {
        type: Number,
        default: 85,
    },
    vehicle: {
        type: String,
        required: true,
        trim: true,
    },
    originAddress: {
        type: String,
        required: true,
    },
    originCoords: {
        type: [Number],
        required: true,
        validate: {
            validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
            message: 'Invalid origin coordinates [lat, lng]',
        },
    },
    destAddress: {
        type: String,
        required: true,
    },
    destCoords: {
        type: [Number],
        required: true,
        validate: {
            validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
            message: 'Invalid destination coordinates [lat, lng]',
        },
    },
    departureTime: {
        type: String,
        required: true,
    },
    maxDetourMinutes: {
        type: Number,
        default: 10,
        min: 1,
        max: 60,
    },
    capacity: {
        type: String,
        enum: ['small', 'medium', 'large'],
        default: 'medium',
    },
    recurringDays: {
        type: [String],
        default: [],
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    notes: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});
export const Journey = mongoose.models.Journey || mongoose.model('Journey', JourneySchema);
