/**
 * Firestore Shared Persistence Service for Route M8
 * Provides reliable cross-container persistence for Vercel Serverless
 * and distributed environments when MongoDB is disconnected.
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'routem8-36895';
const BASE_FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
export function toFirestoreValue(val) {
    if (val === null || val === undefined) {
        return { nullValue: null };
    }
    if (val instanceof Date) {
        return { timestampValue: val.toISOString() };
    }
    if (typeof val === 'boolean') {
        return { booleanValue: val };
    }
    if (typeof val === 'number') {
        if (Number.isInteger(val)) {
            return { integerValue: String(val) };
        }
        return { doubleValue: val };
    }
    if (typeof val === 'string') {
        return { stringValue: val };
    }
    if (Array.isArray(val)) {
        return {
            arrayValue: {
                values: val.map(toFirestoreValue),
            },
        };
    }
    if (typeof val === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) {
                fields[k] = toFirestoreValue(v);
            }
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
}
export function fromFirestoreValue(fieldVal) {
    if (!fieldVal || typeof fieldVal !== 'object')
        return undefined;
    if ('nullValue' in fieldVal)
        return null;
    if ('booleanValue' in fieldVal)
        return Boolean(fieldVal.booleanValue);
    if ('integerValue' in fieldVal)
        return parseInt(fieldVal.integerValue, 10);
    if ('doubleValue' in fieldVal)
        return Number(fieldVal.doubleValue);
    if ('stringValue' in fieldVal)
        return String(fieldVal.stringValue);
    if ('timestampValue' in fieldVal)
        return new Date(fieldVal.timestampValue);
    if ('arrayValue' in fieldVal) {
        const values = fieldVal.arrayValue?.values || [];
        return values.map(fromFirestoreValue);
    }
    if ('mapValue' in fieldVal) {
        const fields = fieldVal.mapValue?.fields || {};
        const res = {};
        for (const [k, v] of Object.entries(fields)) {
            res[k] = fromFirestoreValue(v);
        }
        return res;
    }
    return undefined;
}
export function toFirestoreFields(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            fields[k] = toFirestoreValue(v);
        }
    }
    return fields;
}
export function fromFirestoreFields(fields) {
    const obj = {};
    for (const [k, v] of Object.entries(fields || {})) {
        obj[k] = fromFirestoreValue(v);
    }
    return obj;
}
class FirestorePersistenceService {
    isAvailable = true;
    async saveDelivery(delivery) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return true;
        try {
            const docId = String(delivery._id || delivery.id);
            const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(docId)}`;
            const fields = toFirestoreFields({
                ...delivery,
                _id: docId,
                id: docId,
                updatedAt: delivery.updatedAt || new Date(),
                createdAt: delivery.createdAt || new Date(),
            });
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
                signal: AbortSignal.timeout(4000),
            });
            return res.ok;
        }
        catch (err) {
            console.warn('[Firestore] saveDelivery failed:', err.message);
            return false;
        }
    }
    async getDelivery(id) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return null;
        try {
            const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(id)}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(3500),
            });
            if (!res.ok)
                return null;
            const data = await res.json();
            if (!data?.fields)
                return null;
            const parsed = fromFirestoreFields(data.fields);
            parsed._id = parsed._id || id;
            parsed.id = parsed.id || id;
            return parsed;
        }
        catch (err) {
            console.warn('[Firestore] getDelivery failed:', err.message);
            return null;
        }
    }
    async listDeliveries(limit = 100) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return [];
        try {
            const url = `${BASE_FIRESTORE_URL}/deliveries?pageSize=${limit}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(4000),
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            const docs = data.documents || [];
            return docs
                .map((d) => {
                if (!d.fields)
                    return null;
                const parsed = fromFirestoreFields(d.fields);
                const nameParts = d.name ? d.name.split('/') : [];
                const docId = nameParts[nameParts.length - 1];
                parsed._id = parsed._id || docId;
                parsed.id = parsed.id || docId;
                return parsed;
            })
                .filter(Boolean);
        }
        catch (err) {
            console.warn('[Firestore] listDeliveries failed:', err.message);
            return [];
        }
    }
    async updateDelivery(id, updates) {
        const existing = await this.getDelivery(id);
        if (!existing)
            return null;
        const merged = {
            ...existing,
            ...updates,
            updatedAt: new Date(),
        };
        const success = await this.saveDelivery(merged);
        return success ? merged : null;
    }
    async saveLocation(deliveryId, locationPayload) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return true;
        try {
            const url = `${BASE_FIRESTORE_URL}/locations/${encodeURIComponent(deliveryId)}`;
            const fields = toFirestoreFields({
                ...locationPayload,
                deliveryId,
                updatedAt: new Date(),
            });
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
                signal: AbortSignal.timeout(3500),
            });
            return res.ok;
        }
        catch (err) {
            console.warn('[Firestore] saveLocation failed:', err.message);
            return false;
        }
    }
    async getLatestLocation(deliveryId) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return null;
        try {
            const url = `${BASE_FIRESTORE_URL}/locations/${encodeURIComponent(deliveryId)}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(3500),
            });
            if (!res.ok)
                return null;
            const data = await res.json();
            if (!data?.fields)
                return null;
            return fromFirestoreFields(data.fields);
        }
        catch (err) {
            console.warn('[Firestore] getLatestLocation failed:', err.message);
            return null;
        }
    }
    async saveJourney(journey) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return true;
        try {
            const docId = String(journey._id || journey.id);
            const url = `${BASE_FIRESTORE_URL}/journeys/${encodeURIComponent(docId)}`;
            const fields = toFirestoreFields({
                ...journey,
                _id: docId,
                id: docId,
                updatedAt: journey.updatedAt || new Date(),
                createdAt: journey.createdAt || new Date(),
            });
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
                signal: AbortSignal.timeout(3500),
            });
            return res.ok;
        }
        catch (err) {
            console.warn('[Firestore] saveJourney failed:', err.message);
            return false;
        }
    }
    async listJourneys(limit = 100) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return [];
        try {
            const url = `${BASE_FIRESTORE_URL}/journeys?pageSize=${limit}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(4000),
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            const docs = data.documents || [];
            return docs
                .map((d) => {
                if (!d.fields)
                    return null;
                const parsed = fromFirestoreFields(d.fields);
                const nameParts = d.name ? d.name.split('/') : [];
                const docId = nameParts[nameParts.length - 1];
                parsed._id = parsed._id || docId;
                parsed.id = parsed.id || docId;
                return parsed;
            })
                .filter(Boolean);
        }
        catch (err) {
            console.warn('[Firestore] listJourneys failed:', err.message);
            return [];
        }
    }
    async deleteJourney(id) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return true;
        try {
            const url = `${BASE_FIRESTORE_URL}/journeys/${encodeURIComponent(id)}`;
            const res = await fetch(url, {
                method: 'DELETE',
                signal: AbortSignal.timeout(3500),
            });
            return res.ok;
        }
        catch (err) {
            console.warn('[Firestore] deleteJourney failed:', err.message);
            return false;
        }
    }
    async saveUser(user) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return true;
        try {
            const uid = String(user.firebaseUid || user.id || user._id);
            const url = `${BASE_FIRESTORE_URL}/users/${encodeURIComponent(uid)}`;
            const fields = toFirestoreFields({
                ...user,
                firebaseUid: uid,
                updatedAt: new Date(),
            });
            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields }),
                signal: AbortSignal.timeout(3500),
            });
            return res.ok;
        }
        catch (err) {
            console.warn('[Firestore] saveUser failed:', err.message);
            return false;
        }
    }
    async getUser(firebaseUid) {
        if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS))
            return null;
        try {
            const url = `${BASE_FIRESTORE_URL}/users/${encodeURIComponent(firebaseUid)}`;
            const res = await fetch(url, {
                signal: AbortSignal.timeout(3500),
            });
            if (!res.ok)
                return null;
            const data = await res.json();
            if (!data?.fields)
                return null;
            return fromFirestoreFields(data.fields);
        }
        catch (err) {
            console.warn('[Firestore] getUser failed:', err.message);
            return null;
        }
    }
}
export const firestorePersistence = new FirestorePersistenceService();
