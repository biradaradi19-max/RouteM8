/**
 * Firestore Shared Persistence Service for Route M8
 * Provides reliable cross-container persistence for Vercel Serverless
 * and distributed environments when MongoDB is disconnected.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'routem8-36895';
const BASE_FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export function toFirestoreValue(val: any): any {
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
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFirestoreValue(fieldVal: any): any {
  if (!fieldVal || typeof fieldVal !== 'object') return undefined;

  if ('nullValue' in fieldVal) return null;
  if ('booleanValue' in fieldVal) return Boolean(fieldVal.booleanValue);
  if ('integerValue' in fieldVal) return parseInt(fieldVal.integerValue, 10);
  if ('doubleValue' in fieldVal) return Number(fieldVal.doubleValue);
  if ('stringValue' in fieldVal) return String(fieldVal.stringValue);
  if ('timestampValue' in fieldVal) return new Date(fieldVal.timestampValue);
  if ('arrayValue' in fieldVal) {
    const values = fieldVal.arrayValue?.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in fieldVal) {
    const fields = fieldVal.mapValue?.fields || {};
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return undefined;
}

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFirestoreValue(v);
    }
  }
  return fields;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

class FirestorePersistenceService {
  private isAvailable = true;

  async saveDelivery(delivery: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
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
    } catch (err: any) {
      console.warn('[Firestore] saveDelivery failed:', err.message);
      return false;
    }
  }

  async getDelivery(id: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;
    try {
      const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;

      const data: any = await res.json();
      if (!data?.fields) return null;

      const parsed = fromFirestoreFields(data.fields);
      parsed._id = parsed._id || id;
      parsed.id = parsed.id || id;
      return parsed;
    } catch (err: any) {
      console.warn('[Firestore] getDelivery failed:', err.message);
      return null;
    }
  }

  async listDeliveries(limit = 100): Promise<any[]> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return [];
    try {
      const url = `${BASE_FIRESTORE_URL}/deliveries?pageSize=${limit}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];

      const data: any = await res.json();
      const docs = data.documents || [];
      return docs
        .map((d: any) => {
          if (!d.fields) return null;
          const parsed = fromFirestoreFields(d.fields);
          const nameParts = d.name ? d.name.split('/') : [];
          const docId = nameParts[nameParts.length - 1];
          parsed._id = parsed._id || docId;
          parsed.id = parsed.id || docId;
          return parsed;
        })
        .filter(Boolean);
    } catch (err: any) {
      console.warn('[Firestore] listDeliveries failed:', err.message);
      return [];
    }
  }

  async updateDelivery(id: string, updates: Record<string, any>): Promise<any | null> {
    const existing = await this.getDelivery(id);
    if (!existing) return null;

    const merged = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    const success = await this.saveDelivery(merged);
    return success ? merged : null;
  }

  async deleteDelivery(id: string): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    try {
      const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
      return res.ok;
    } catch (err: any) {
      console.warn('[Firestore] deleteDelivery failed:', err.message);
      return false;
    }
  }

  async saveLocation(deliveryId: string, locationPayload: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
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
    } catch (err: any) {
      console.warn('[Firestore] saveLocation failed:', err.message);
      return false;
    }
  }

  async getLatestLocation(deliveryId: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;
    try {
      const url = `${BASE_FIRESTORE_URL}/locations/${encodeURIComponent(deliveryId)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;

      const data: any = await res.json();
      if (!data?.fields) return null;

      return fromFirestoreFields(data.fields);
    } catch (err: any) {
      console.warn('[Firestore] getLatestLocation failed:', err.message);
      return null;
    }
  }

  async saveJourney(journey: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
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
    } catch (err: any) {
      console.warn('[Firestore] saveJourney failed:', err.message);
      return false;
    }
  }

  async listJourneys(limit = 100): Promise<any[]> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return [];
    try {
      const url = `${BASE_FIRESTORE_URL}/journeys?pageSize=${limit}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];

      const data: any = await res.json();
      const docs = data.documents || [];
      return docs
        .map((d: any) => {
          if (!d.fields) return null;
          const parsed = fromFirestoreFields(d.fields);
          const nameParts = d.name ? d.name.split('/') : [];
          const docId = nameParts[nameParts.length - 1];
          parsed._id = parsed._id || docId;
          parsed.id = parsed.id || docId;
          return parsed;
        })
        .filter(Boolean);
    } catch (err: any) {
      console.warn('[Firestore] listJourneys failed:', err.message);
      return [];
    }
  }

  async deleteJourney(id: string): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    try {
      const url = `${BASE_FIRESTORE_URL}/journeys/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
      return res.ok;
    } catch (err: any) {
      console.warn('[Firestore] deleteJourney failed:', err.message);
      return false;
    }
  }

  async saveUser(user: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
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
    } catch (err: any) {
      console.warn('[Firestore] saveUser failed:', err.message);
      return false;
    }
  }

  async getUser(firebaseUid: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;
    try {
      const url = `${BASE_FIRESTORE_URL}/users/${encodeURIComponent(firebaseUid)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return null;

      const data: any = await res.json();
      if (!data?.fields) return null;

      return fromFirestoreFields(data.fields);
    } catch (err: any) {
      console.warn('[Firestore] getUser failed:', err.message);
      return null;
    }
  }
}

export const firestorePersistence = new FirestorePersistenceService();
