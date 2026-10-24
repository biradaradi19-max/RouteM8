/**
 * Shared Cloud Persistence Service for Route M8
 * Provides reliable cross-container persistence for Vercel Serverless
 * and distributed environments when MongoDB is disconnected.
 * Uses Firebase Realtime Database with Firestore fallback.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'routem8-36895';
const RTDB_URL = process.env.FIREBASE_RTDB_URL || `https://${PROJECT_ID}-default-rtdb.firebaseio.com`;
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
    const docId = String(delivery._id || delivery.id);
    const payload = {
      ...delivery,
      _id: docId,
      id: docId,
      updatedAt: delivery.updatedAt || new Date().toISOString(),
      createdAt: delivery.createdAt || new Date().toISOString(),
    };

    // 1. Try Firebase Realtime Database
    try {
      const rtdbRes = await fetch(`${RTDB_URL}/deliveries/${encodeURIComponent(docId)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });

      if (rtdbRes.ok) return true;
    } catch (err: any) {
      console.warn('[Persistence] RTDB saveDelivery failed:', err.message);
    }

    // 2. Fallback to Firestore REST API
    try {
      const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(docId)}`;
      const fields = toFirestoreFields(payload);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(4000),
      });

      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] Firestore saveDelivery fallback failed:', err.message);
      return false;
    }
  }

  async getDelivery(id: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;

    // 1. Try Firebase Realtime Database
    try {
      const rtdbRes = await fetch(`${RTDB_URL}/deliveries/${encodeURIComponent(id)}.json`, {
        signal: AbortSignal.timeout(3500),
      });
      if (rtdbRes.ok) {
        const data: any = await rtdbRes.json();
        if (data && typeof data === 'object' && (data.id || data._id || data.title)) {
          data._id = data._id || id;
          data.id = data.id || id;
          return data;
        }
      }
    } catch (err: any) {
      console.warn('[Persistence] RTDB getDelivery failed:', err.message);
    }

    // 2. Fallback to Firestore REST API
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
      console.warn('[Persistence] Firestore getDelivery fallback failed:', err.message);
      return null;
    }
  }

  async listDeliveries(limit = 100): Promise<any[]> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return [];

    // 1. Try Firebase Realtime Database
    try {
      const rtdbRes = await fetch(`${RTDB_URL}/deliveries.json`, {
        signal: AbortSignal.timeout(4000),
      });
      if (rtdbRes.ok) {
        const data = await rtdbRes.json();
        if (data && typeof data === 'object') {
          const list = Object.entries(data)
            .map(([key, val]: [string, any]) => {
              if (!val || typeof val !== 'object') return null;
              return {
                ...val,
                _id: val._id || val.id || key,
                id: val.id || val._id || key,
              };
            })
            .filter(Boolean) as any[];

          list.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime());
          return list.slice(0, limit);
        }
      }
    } catch (err: any) {
      console.warn('[Persistence] RTDB listDeliveries failed:', err.message);
    }

    // 2. Fallback to Firestore REST API
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
      console.warn('[Persistence] Firestore listDeliveries fallback failed:', err.message);
      return [];
    }
  }

  async updateDelivery(id: string, updates: Record<string, any>): Promise<any | null> {
    const existing = await this.getDelivery(id);
    if (!existing) return null;

    const merged = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const success = await this.saveDelivery(merged);
    return success ? merged : null;
  }

  async deleteDelivery(id: string): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    try {
      await fetch(`${RTDB_URL}/deliveries/${encodeURIComponent(id)}.json`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
    } catch {}

    try {
      const url = `${BASE_FIRESTORE_URL}/deliveries/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] deleteDelivery failed:', err.message);
      return false;
    }
  }

  async saveLocation(deliveryId: string, locationPayload: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    const payload = {
      ...locationPayload,
      deliveryId,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${RTDB_URL}/locations/${encodeURIComponent(deliveryId)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) return true;
    } catch {}

    try {
      const url = `${BASE_FIRESTORE_URL}/locations/${encodeURIComponent(deliveryId)}`;
      const fields = toFirestoreFields(payload);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(3500),
      });

      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] saveLocation failed:', err.message);
      return false;
    }
  }

  async getLatestLocation(deliveryId: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;

    try {
      const res = await fetch(`${RTDB_URL}/locations/${encodeURIComponent(deliveryId)}.json`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') return data;
      }
    } catch {}

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
      console.warn('[Persistence] getLatestLocation failed:', err.message);
      return null;
    }
  }

  async saveJourney(journey: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    const docId = String(journey._id || journey.id);
    const payload = {
      ...journey,
      _id: docId,
      id: docId,
      updatedAt: journey.updatedAt || new Date().toISOString(),
      createdAt: journey.createdAt || new Date().toISOString(),
    };

    try {
      const res = await fetch(`${RTDB_URL}/journeys/${encodeURIComponent(docId)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) return true;
    } catch {}

    try {
      const url = `${BASE_FIRESTORE_URL}/journeys/${encodeURIComponent(docId)}`;
      const fields = toFirestoreFields(payload);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(3500),
      });

      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] saveJourney failed:', err.message);
      return false;
    }
  }

  async listJourneys(limit = 100): Promise<any[]> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return [];

    try {
      const res = await fetch(`${RTDB_URL}/journeys.json`, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const list = Object.entries(data)
            .map(([key, val]: [string, any]) => {
              if (!val || typeof val !== 'object') return null;
              return {
                ...val,
                _id: val._id || val.id || key,
                id: val.id || val._id || key,
              };
            })
            .filter(Boolean) as any[];

          list.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime());
          return list.slice(0, limit);
        }
      }
    } catch {}

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
      console.warn('[Persistence] listJourneys failed:', err.message);
      return [];
    }
  }

  async deleteJourney(id: string): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    try {
      await fetch(`${RTDB_URL}/journeys/${encodeURIComponent(id)}.json`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
    } catch {}

    try {
      const url = `${BASE_FIRESTORE_URL}/journeys/${encodeURIComponent(id)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3500),
      });
      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] deleteJourney failed:', err.message);
      return false;
    }
  }

  async saveUser(user: any): Promise<boolean> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return true;
    const uid = String(user.firebaseUid || user.id || user._id);
    const payload = {
      ...user,
      firebaseUid: uid,
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${RTDB_URL}/users/${encodeURIComponent(uid)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) return true;
    } catch {}

    try {
      const url = `${BASE_FIRESTORE_URL}/users/${encodeURIComponent(uid)}`;
      const fields = toFirestoreFields(payload);

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(3500),
      });

      return res.ok;
    } catch (err: any) {
      console.warn('[Persistence] saveUser failed:', err.message);
      return false;
    }
  }

  async getUser(firebaseUid: string): Promise<any | null> {
    if (!this.isAvailable || (process.env.NODE_ENV === 'test' && !process.env.ENABLE_FIRESTORE_TESTS)) return null;

    try {
      const res = await fetch(`${RTDB_URL}/users/${encodeURIComponent(firebaseUid)}.json`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') return data;
      }
    } catch {}

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
      console.warn('[Persistence] getUser failed:', err.message);
      return null;
    }
  }
}

export const firestorePersistence = new FirestorePersistenceService();
