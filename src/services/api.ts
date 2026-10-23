import { auth } from './firebase';
import type { DeliveryRequest, PublishedJourney, SafeProfileUpdates, UserProfile } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '') : '') + '/api';

/**
 * Helper to safely extract JSON from a response, handling empty bodies and non-JSON payloads gracefully.
 */
export async function safeReadJson<T = any>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  let data: any = null;
  const text = await res.text();
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errorMsg =
      data?.error ||
      data?.message ||
      (res.statusText ? `${res.statusText} (${res.status})` : `Request failed with status ${res.status}`);
    return { ok: false, status: res.status, data, error: errorMsg };
  }

  return { ok: true, status: res.status, data, error: null };
}

/**
 * Helper to execute authenticated HTTP requests with the current Firebase ID token.
 */
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // Retrieve Firebase ID token if user is signed in
  if (auth?.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`);
      }
    } catch (err) {
      console.warn('[API] Could not get Firebase ID token:', err);
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export const authApi = {
  async getMe(): Promise<{ user: UserProfile } | null> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/me`);
      const parsed = await safeReadJson<{ user: UserProfile }>(res);
      return parsed.ok ? parsed.data : null;
    } catch {
      return null;
    }
  },

  async updateProfile(updates: SafeProfileUpdates): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to update profile' };
      return { success: true, user: parsed.data?.user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async checkUsername(username: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/check-username/${encodeURIComponent(username)}`);
      const parsed = await safeReadJson<any>(res);
      return Boolean(parsed.data?.available);
    } catch {
      return true;
    }
  },

  async getUser(id: string): Promise<Partial<UserProfile> | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(id)}`);
      const parsed = await safeReadJson<any>(res);
      return parsed.ok ? parsed.data : null;
    } catch {
      return null;
    }
  },
};

export const deliveriesApi = {
  async getDeliveries(params?: {
    status?: string;
    requesterId?: string;
    transporterId?: string;
    category?: string;
    excludeRejectedBy?: string;
  }): Promise<DeliveryRequest[]> {
    try {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.requesterId) query.set('requesterId', params.requesterId);
      if (params?.transporterId) query.set('transporterId', params.transporterId);
      if (params?.category) query.set('category', params.category);
      if (params?.excludeRejectedBy) query.set('excludeRejectedBy', params.excludeRejectedBy);

      const qs = query.toString();
      const res = await fetchWithAuth(`${API_BASE}/deliveries${qs ? `?${qs}` : ''}`);
      const parsed = await safeReadJson<DeliveryRequest[]>(res);
      return parsed.ok && Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  },

  async getDelivery(id: string): Promise<DeliveryRequest | null> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}`);
      const parsed = await safeReadJson<DeliveryRequest>(res);
      return parsed.ok ? parsed.data : null;
    } catch {
      return null;
    }
  },

  async createDelivery(data: Partial<DeliveryRequest>): Promise<{ data: DeliveryRequest | null; error: string | null }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const parsed = await safeReadJson<DeliveryRequest>(res);
      if (!parsed.ok) return { data: null, error: parsed.error || 'Failed to create delivery' };
      return { data: parsed.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async acceptDelivery(id: string): Promise<{ data: DeliveryRequest | null; error: string | null }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
      });
      const parsed = await safeReadJson<DeliveryRequest>(res);
      if (!parsed.ok) return { data: null, error: parsed.error || 'Failed to accept delivery' };
      return { data: parsed.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  },

  async rejectDelivery(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
      });
      const parsed = await safeReadJson(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to dismiss delivery' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async startTransit(id: string): Promise<{ data: DeliveryRequest | null; error: string | null }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/start-transit`, {
        method: 'POST',
      });
      const parsed = await safeReadJson<DeliveryRequest>(res);
      if (!parsed.ok) return { data: null, error: parsed.error || 'Failed to start transit' };
      return { data: parsed.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  },

  async verifyPin(
    id: string,
    pin: string
  ): Promise<{
    success: boolean;
    error?: string;
    delivery?: DeliveryRequest;
    attemptsRemaining?: number;
    isLocked?: boolean;
    lockedUntil?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) {
        return {
          success: false,
          error: parsed.error || 'Handover verification failed',
          attemptsRemaining: parsed.data?.attemptsRemaining,
          isLocked: parsed.data?.isLocked,
          lockedUntil: parsed.data?.lockedUntil,
        };
      }
      if (!parsed.data || parsed.data.success === false) {
        return {
          success: false,
          error: parsed.data?.error || 'Invalid verification response from server',
        };
      }
      return { success: true, delivery: parsed.data.delivery };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async cancelDelivery(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });
      const parsed = await safeReadJson(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to cancel delivery' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async uploadProofPhoto(
    id: string,
    file: File
  ): Promise<{ success: boolean; proofPhotoUrl?: string; error?: string }> {
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/proof`, {
        method: 'POST',
        body: formData,
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to upload photo' };
      return { success: true, proofPhotoUrl: parsed.data?.proofPhotoUrl };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getLatestLocation(id: string) {
    try {
      const res = await fetch(`${API_BASE}/deliveries/${encodeURIComponent(id)}/location`);
      const parsed = await safeReadJson<any>(res);
      return parsed.ok ? parsed.data : null;
    } catch {
      return null;
    }
  },

  async updateLocation(
    id: string,
    coords: { latitude: number; longitude: number; heading?: number; speed?: number }
  ): Promise<{ success: boolean; location?: any; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to update location' };
      return { success: true, location: parsed.data?.location };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const journeysApi = {
  async getJourneys(params?: { transporterId?: string; activeOnly?: boolean }): Promise<PublishedJourney[]> {
    try {
      const query = new URLSearchParams();
      if (params?.transporterId) query.set('transporterId', params.transporterId);
      if (params?.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));

      const qs = query.toString();
      const res = await fetchWithAuth(`${API_BASE}/journeys${qs ? `?${qs}` : ''}`);
      const parsed = await safeReadJson<PublishedJourney[]>(res);
      return parsed.ok && Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  },

  async publishJourney(data: Partial<PublishedJourney>): Promise<{ data: PublishedJourney | null; error: string | null }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/journeys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const parsed = await safeReadJson<PublishedJourney>(res);
      if (!parsed.ok) return { data: null, error: parsed.error || 'Failed to publish journey' };
      return { data: parsed.data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  },

  async deleteJourney(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/journeys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const parsed = await safeReadJson(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to delete journey' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export const livekitApi = {
  async getToken(deliveryId: string): Promise<{
    token: string;
    serverUrl: string;
    room: string;
    participantIdentity: string;
    participantName: string;
    role: 'Customer' | 'Transporter';
  }> {
    const res = await fetchWithAuth(`${API_BASE}/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryId }),
    });

    const parsed = await safeReadJson<any>(res);
    if (!parsed.ok || !parsed.data) {
      throw new Error(parsed.error || 'Failed to generate LiveKit token');
    }
    return parsed.data;
  },
};

export const activitiesApi = {
  async getActivities() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/activities`);
      const parsed = await safeReadJson<any[]>(res);
      return parsed.ok && Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      return [];
    }
  },
};

export const placesApi = {
  async getAutocompleteSuggestions(input: string, biasCoords?: [number, number] | null) {
    if (!input || !input.trim()) return [];
    try {
      let url = `${API_BASE}/places/autocomplete?input=${encodeURIComponent(input.trim())}`;
      if (biasCoords) {
        url += `&lat=${biasCoords[0]}&lng=${biasCoords[1]}`;
      }
      const res = await fetch(url);
      const parsed = await safeReadJson<any>(res);
      return parsed.data?.suggestions || [];
    } catch (err) {
      console.warn('[PlacesApi] Autocomplete error:', err);
      return [];
    }
  },

  async getPlaceDetails(placeId: string) {
    try {
      const res = await fetch(`${API_BASE}/places/details?placeId=${encodeURIComponent(placeId)}`);
      const parsed = await safeReadJson<any>(res);
      return parsed.ok ? parsed.data : null;
    } catch (err) {
      console.warn('[PlacesApi] Details error:', err);
      return null;
    }
  },

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/places/reverse-geocode?lat=${lat}&lng=${lng}`);
      const parsed = await safeReadJson<any>(res);
      return parsed.data?.formattedAddress || null;
    } catch (err) {
      console.warn('[PlacesApi] Reverse geocode error:', err);
      return null;
    }
  },
};


