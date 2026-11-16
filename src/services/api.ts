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

  const signal = options.signal || AbortSignal.timeout(10000);

  return fetch(url, {
    ...options,
    headers,
    signal,
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

  async submitPartnerVerification(payload: {
    consentGiven: boolean;
    selfieBase64: string;
  }): Promise<{ success: boolean; status?: string; message?: string; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/auth/partner-verification/selfie`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) {
        return { success: false, error: parsed.error || 'Failed to submit identity verification' };
      }
      return {
        success: true,
        status: parsed.data?.status || 'pending_review',
        message: parsed.data?.message,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during verification submission' };
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
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.requesterId) query.set('requesterId', params.requesterId);
    if (params?.transporterId) query.set('transporterId', params.transporterId);
    if (params?.category) query.set('category', params.category);
    if (params?.excludeRejectedBy) query.set('excludeRejectedBy', params.excludeRejectedBy);

    const qs = query.toString();
    const res = await fetchWithAuth(`${API_BASE}/deliveries${qs ? `?${qs}` : ''}`);
    const parsed = await safeReadJson<DeliveryRequest[]>(res);
    if (!parsed.ok) {
      throw new Error(parsed.error || `Failed to fetch deliveries (${parsed.status})`);
    }
    return Array.isArray(parsed.data) ? parsed.data : [];
  },

  async getNearbyDeliveries(params: {
    lat: number;
    lng: number;
    radiusKm?: number;
  }): Promise<DeliveryRequest[]> {
    const query = new URLSearchParams();
    query.set('lat', String(params.lat));
    query.set('lng', String(params.lng));
    if (params.radiusKm !== undefined) {
      query.set('radiusKm', String(params.radiusKm));
    }

    const res = await fetchWithAuth(`${API_BASE}/deliveries/nearby?${query.toString()}`);
    const parsed = await safeReadJson<DeliveryRequest[]>(res);
    if (!parsed.ok) {
      throw new Error(parsed.error || `Failed to fetch nearby deliveries (${parsed.status})`);
    }
    return Array.isArray(parsed.data) ? parsed.data : [];
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
      const res = await fetchWithAuth(`${API_BASE}/deliveries/${encodeURIComponent(id)}/location`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      const parsed = await safeReadJson<any>(res);
      return parsed.ok ? parsed.data : null;
    } catch {
      return null;
    }
  },

  async updateLocation(
    id: string,
    coords: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
      clientTimestamp?: number;
    }
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
    const query = new URLSearchParams();
    if (params?.transporterId) query.set('transporterId', params.transporterId);
    if (params?.activeOnly !== undefined) query.set('activeOnly', String(params.activeOnly));

    const qs = query.toString();
    const res = await fetchWithAuth(`${API_BASE}/journeys${qs ? `?${qs}` : ''}`);
    const parsed = await safeReadJson<PublishedJourney[]>(res);
    if (!parsed.ok) {
      throw new Error(parsed.error || `Failed to fetch journeys (${parsed.status})`);
    }
    return Array.isArray(parsed.data) ? parsed.data : [];
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
  async getToken(deliveryId: string, callType: 'audio' | 'video' = 'audio'): Promise<{
    token: string;
    serverUrl: string;
    room: string;
    participantIdentity: string;
    participantName: string;
    role: 'Customer' | 'Transporter';
    callType?: 'audio' | 'video';
  }> {
    const res = await fetchWithAuth(`${API_BASE}/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryId, callType }),
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
    if (!auth?.currentUser) {
      return [];
    }
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
      if (!parsed.ok || !parsed.data) return null;
      if (typeof parsed.data === 'string') return parsed.data;
      return parsed.data.formattedAddress || null;
    } catch (err) {
      console.warn('[PlacesApi] Reverse geocode error:', err);
      return null;
    }
  },
};

export interface PartnerApplicationInfo {
  _id?: string;
  applicantId: string;
  applicantEmail: string;
  applicantName: string;
  phone?: string;
  status: 'draft' | 'submitted' | 'verification_pending' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  vehicleCategory: 'bicycle' | 'motorcycle' | 'scooter' | 'car' | 'ev' | 'van' | 'none';
  identityVerificationId?: string;
  vehicleVerificationId?: string;
  rejectionReason?: string;
  suspensionReason?: string;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  identityVerification?: {
    status: string;
    maskedId: string;
    idType: string;
    verifiedAt?: string;
  } | null;
  vehicleVerification?: {
    status: string;
    isExempt: boolean;
    drivingLicenceMasked?: string;
    registrationNumberMasked?: string;
    verifiedAt?: string;
  } | null;
}

export interface AdminAuditLogEntry {
  _id: string;
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  reason?: string;
  createdAt: string;
}

export const partnerApi = {
  async apply(payload: {
    vehicleCategory: string;
    phone?: string;
    notes?: string;
  }): Promise<{ success: boolean; application?: PartnerApplicationInfo; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to submit application' };
      return { success: true, application: parsed.data?.application };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getApplication(): Promise<{
    application: PartnerApplicationInfo | null;
    identityVerification: any;
    vehicleVerification: any;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/application`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data) {
        return { application: null, identityVerification: null, vehicleVerification: null };
      }
      return {
        application: parsed.data.application || null,
        identityVerification: parsed.data.identityVerification || null,
        vehicleVerification: parsed.data.vehicleVerification || null,
      };
    } catch {
      return { application: null, identityVerification: null, vehicleVerification: null };
    }
  },

  async verifyIdentity(payload: {
    idType: string;
    consentObtained: boolean;
    consentVersion?: string;
  }): Promise<{ success: boolean; referenceId?: string; maskedId?: string; status?: string; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/verify-identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Identity verification failed' };
      return {
        success: true,
        referenceId: parsed.data?.referenceId,
        maskedId: parsed.data?.maskedId,
        status: parsed.data?.status,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async verifyVehicle(payload: {
    vehicleCategory: string;
    drivingLicenceNumber?: string;
    registrationNumber?: string;
  }): Promise<{ success: boolean; verification?: any; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/verify-vehicle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Vehicle verification failed' };
      return { success: true, verification: parsed.data?.verification };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async submitForReview(): Promise<{ success: boolean; application?: PartnerApplicationInfo; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/submit-for-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to submit for review' };
      return { success: true, application: parsed.data?.application };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getAdminApplications(params?: {
    status?: string;
    search?: string;
  }): Promise<{ applications: PartnerApplicationInfo[] }> {
    try {
      let url = `${API_BASE}/partner/admin/applications`;
      const queryParts: string[] = [];
      if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
      if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
      if (queryParts.length > 0) url += `?${queryParts.join('&')}`;

      const res = await fetchWithAuth(url);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data) return { applications: [] };
      return { applications: parsed.data.applications || [] };
    } catch {
      return { applications: [] };
    }
  },

  async getAdminAuditLogs(): Promise<{ logs: AdminAuditLogEntry[] }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/admin/audit-logs`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data) return { logs: [] };
      return { logs: parsed.data.logs || [] };
    } catch {
      return { logs: [] };
    }
  },

  async adminReview(payload: {
    applicationId: string;
    decision: 'approve' | 'reject' | 'suspend';
    reason: string;
  }): Promise<{ success: boolean; status?: string; application?: PartnerApplicationInfo; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/partner/admin/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Admin review failed' };
      return {
        success: true,
        status: parsed.data?.status,
        application: parsed.data?.application,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

export interface CommissionSnapshotInfo {
  ratePercent: number;
  platformSharePaise: number;
  partnerSharePaise: number;
  calculatedAt: string;
}

export interface PaymentOrderInfo {
  _id: string;
  deliveryId: string;
  requesterId: string;
  transporterId?: string;
  currency: string;
  amountPaise: number;
  commissionSnapshot: CommissionSnapshotInfo;
  provider: 'mock' | 'cashfree' | 'razorpay';
  providerOrderId?: string;
  providerPaymentId?: string;
  idempotencyKey: string;
  status: 'created' | 'pending' | 'paid' | 'partially_refunded' | 'split_pending' | 'settled' | 'refunded' | 'failed' | 'cancelled';
  paidAt?: string;
  splitAt?: string;
  createdAt: string;
}

export interface AdminFinancialOverview {
  totalVolumePaise: number;
  platformCommissionPaise: number;
  transporterPayablePaise: number;
  totalSettledPaise?: number;
  totalNegativeExposurePaise?: number;
  unresolvedDiscrepancyCount?: number;
  pendingSettlementsCount: number;
  failedSettlementsCount: number;
  refundsCount: number;
  totalRefundedPaise: number;
  totalOrdersCount: number;
  recentOrders: PaymentOrderInfo[];
  recentSettlements: any[];
  recentRefunds: any[];
}

export interface FinancialDiscrepancy {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  paymentOrderId?: string;
  deliveryId?: string;
  settlementId?: string;
  transporterId?: string;
  amountPaise: number;
  description: string;
  detectedAt: string;
  resolved: boolean;
  resolutionNote?: string;
  resolvedBy?: { uid: string; email?: string };
  resolvedAt?: string;
  resolutionResult?: string;
}

export interface FinancialReconciliationReport {
  timestamp: string;
  summary: {
    totalGrossVolumePaise: number;
    totalPlatformCommissionPaise: number;
    totalTransporterPayablePaise: number;
    totalSettledPaise: number;
    totalPendingSettlementPaise: number;
    totalRefundedPaise: number;
    totalFailedSettlementPaise: number;
    totalNegativeExposurePaise: number;
    discrepancyCount: number;
    isClean: boolean;
  };
  discrepancies: FinancialDiscrepancy[];
}

export interface MockVendorAccountInfo {
  vendorId: string;
  transporterId: string;
  transporterName: string;
  verificationStatus: string;
  bankAccountRef: string;
  ifscCode: string;
  isEligibleForSettlement: boolean;
  unresolvedNegativeBalancePaise: number;
  totalNegativeExposureRecoveredPaise?: number;
  lastRecoveryAt?: string;
  isMock: boolean;
  createdAt: string;
}

export const paymentApi = {
  async getCurrencies(): Promise<{
    success: boolean;
    currencies?: Record<string, any>;
    defaultCurrency?: string;
    defaultCountry?: string;
    error?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/currencies`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to fetch currencies' };
      return {
        success: true,
        currencies: parsed.data?.currencies,
        defaultCurrency: parsed.data?.defaultCurrency,
        defaultCountry: parsed.data?.defaultCountry,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async detectCountry(): Promise<{
    success: boolean;
    countryCode?: string;
    currencyCode?: string;
    source?: string;
    error?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/detect-country`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Country detection failed' };
      return {
        success: true,
        countryCode: parsed.data?.countryCode,
        currencyCode: parsed.data?.currencyCode,
        source: parsed.data?.source,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getExchangeQuote(payload: {
    sourceAmountMinorUnits: number;
    sourceCurrency: string;
    targetCurrency: string;
  }): Promise<{
    success: boolean;
    quote?: any;
    error?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/exchange-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to get exchange quote' };
      return { success: true, quote: parsed.data?.quote };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async createOrder(payload: {
    deliveryId: string;
    idempotencyKey?: string;
    currencyCode?: string;
    conversionQuoteId?: string;
  }): Promise<{
    success: boolean;
    order?: PaymentOrderInfo;
    providerOrderId?: string;
    paymentSessionId?: string;
    isDuplicate?: boolean;
    isInternationalSimulation?: boolean;
    error?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to create payment order' };
      return {
        success: true,
        order: parsed.data?.order,
        providerOrderId: parsed.data?.providerOrderId,
        paymentSessionId: parsed.data?.paymentSessionId,
        isDuplicate: parsed.data?.isDuplicate,
        isInternationalSimulation: parsed.data?.isInternationalSimulation,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async verifyPayment(payload: {
    providerOrderId: string;
    providerPaymentId?: string;
    paymentSignature?: string;
  }): Promise<{ success: boolean; order?: PaymentOrderInfo; alreadyPaid?: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Payment verification failed' };
      return {
        success: true,
        order: parsed.data?.order,
        alreadyPaid: parsed.data?.alreadyPaid,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getOrder(deliveryId: string): Promise<{ success: boolean; order?: PaymentOrderInfo; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/order/${encodeURIComponent(deliveryId)}`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data?.order) return { success: false, error: parsed.error || 'Order not found' };
      return { success: true, order: parsed.data.order };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getCommissionRate(): Promise<{ ratePercent: number; minCommissionPaise: number; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/commission`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data) return { ratePercent: 12.0, minCommissionPaise: 0 };
      return {
        ratePercent: parsed.data.ratePercent ?? 12.0,
        minCommissionPaise: parsed.data.minCommissionPaise ?? 0,
      };
    } catch {
      return { ratePercent: 12.0, minCommissionPaise: 0 };
    }
  },

  async updateCommissionRate(ratePercent: number, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/commission`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratePercent, reason }),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to update commission rate' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async settle(payload: {
    paymentOrderId?: string;
    deliveryId?: string;
    idempotencyKey?: string;
    currencyCode?: string;
  }): Promise<{ success: boolean; settlement?: any; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Settlement failed' };
      return { success: true, settlement: parsed.data?.settlement };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async refund(payload: {
    paymentOrderId: string;
    reason: string;
    amountPaise?: number;
    amountMinorUnits?: number;
    currencyCode?: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; refund?: any; remainingBalance?: number; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Refund failed' };
      return { success: true, refund: parsed.data?.refund, remainingBalance: parsed.data?.remainingBalance };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async reconcileRefund(refundId: string): Promise<{ success: boolean; refund?: any; status?: string; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/refund/${encodeURIComponent(refundId)}/reconcile`, {
        method: 'POST',
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Reconciliation failed' };
      return { success: true, refund: parsed.data?.refund, status: parsed.data?.status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getAdminOverview(): Promise<{ success: boolean; overview?: AdminFinancialOverview; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/admin/overview`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok || !parsed.data) return { success: false, error: parsed.error || 'Failed to fetch financial overview' };
      return { success: true, overview: parsed.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getReconciliation(): Promise<{ success: boolean; report?: FinancialReconciliationReport; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/reconciliation`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to fetch reconciliation report' };
      return { success: true, report: parsed.data?.report };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async resolveDiscrepancy(discrepancyId: string, resolutionNote?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/reconciliation/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discrepancyId, resolutionNote }),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to resolve discrepancy' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getVendors(): Promise<{ success: boolean; vendors?: MockVendorAccountInfo[]; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/vendors`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to fetch vendors' };
      return { success: true, vendors: parsed.data?.vendors || [] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async reverseSettlement(settlementId: string, reason?: string): Promise<{ success: boolean; settlement?: any; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/settle/${encodeURIComponent(settlementId)}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to reverse settlement' };
      return { success: true, settlement: parsed.data?.settlement };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getRecoveryStatus(): Promise<{
    success: boolean;
    stuckSplitPendingCount?: number;
    stuckProcessingRefundsCount?: number;
    unprocessedWebhooksCount?: number;
    needsRecovery?: boolean;
    error?: string;
  }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/recover/status`);
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Failed to fetch recovery status' };
      return {
        success: true,
        stuckSplitPendingCount: parsed.data?.stuckSplitPendingCount,
        stuckProcessingRefundsCount: parsed.data?.stuckProcessingRefundsCount,
        unprocessedWebhooksCount: parsed.data?.unprocessedWebhooksCount,
        needsRecovery: parsed.data?.needsRecovery,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async runRecovery(targetOrderId?: string): Promise<{ success: boolean; report?: any; error?: string }> {
    try {
      const res = await fetchWithAuth(`${API_BASE}/payments/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetOrderId }),
      });
      const parsed = await safeReadJson<any>(res);
      if (!parsed.ok) return { success: false, error: parsed.error || 'Recovery sweep failed' };
      return { success: true, report: parsed.data?.report };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};


