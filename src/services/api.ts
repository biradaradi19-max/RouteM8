import { auth } from './firebase';
import type { DeliveryRequest, PublishedJourney, SafeProfileUpdates, UserProfile } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '') : '') + '/api';

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
      if (!res.ok) return null;
      return await res.json();
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
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to update profile' };
      return { success: true, user: data.user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async checkUsername(username: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/check-username/${encodeURIComponent(username)}`);
      const data = await res.json();
      return Boolean(data.available);
    } catch {
      return true;
    }
  },

  async getUser(id: string): Promise<Partial<UserProfile> | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/users/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return await res.json();
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
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async getDelivery(id: string): Promise<DeliveryRequest | null> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return await res.json();
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
      const resData = await res.json();
      if (!res.ok) return { data: null, error: resData.error || 'Failed to create delivery' };
      return { data: resData, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Network error' };
    }
  },

  async acceptDelivery(id: string): Promise<{ data: DeliveryRequest | null; error: string | null }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error || 'Failed to accept delivery' };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  },

  async rejectDelivery(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to dismiss delivery' };
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
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error || 'Failed to start transit' };
      return { data, error: null };
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
      const data = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: data.error || 'Handover verification failed',
          attemptsRemaining: data.attemptsRemaining,
          isLocked: data.isLocked,
          lockedUntil: data.lockedUntil,
        };
      }
      return { success: true, delivery: data.delivery };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async cancelDelivery(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to cancel delivery' };
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
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to upload photo' };
      return { success: true, proofPhotoUrl: data.proofPhotoUrl };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getLatestLocation(id: string) {
    try {
      const res = await fetch(`${API_BASE}/deliveries/${encodeURIComponent(id)}/location`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
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
      if (!res.ok) return [];
      return await res.json();
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
      const resData = await res.json();
      if (!res.ok) return { data: null, error: resData.error || 'Failed to publish journey' };
      return { data: resData, error: null };
    } catch (err: any) {
      return { data: null, error: err.message };
    }
  },

  async deleteJourney(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/journeys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Failed to delete journey' };
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

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate LiveKit token');
    }
    return data;
  },
};

export const activitiesApi = {
  async getActivities() {
    try {
      const res = await fetchWithAuth(`${API_BASE}/activities`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },
};
