import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { 
  UserProfile, 
  DeliveryRequest, 
  PublishedJourney, 
  SafeProfileUpdates, 
  VerificationStatus, 
  AccountStatus,
  DeliveryStatus,
  ItemSize,
  RequestCategory,
  RequestUrgency,
  TransporterLocation 
} from '../types';

// ============================================================================
// OFFICIAL SUPABASE CLIENT CONFIGURATION
// Configured strictly through standard environment variables:
// - VITE_SUPABASE_URL: Project Endpoint URL
// - VITE_SUPABASE_ANON_KEY: Public Anonymous Client Key (RLS-protected)
// ============================================================================

const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  envUrl && 
  envAnonKey && 
  envUrl.startsWith('http')
);

// Initialize official Supabase client when configured, otherwise null
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(envUrl, envAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

let customClient: SupabaseClient | null = null;

export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  customClient = client;
}

// ============================================================================
// DATABASE SCHEMA ROW TYPES & SECURE MAPPINGS
// ============================================================================

export interface DatabaseProfileRow {
  id: string;
  email: string;
  username?: string | null;
  full_name: string;
  avatar_url?: string | null;
  role: 'both' | 'requester' | 'transporter';
  verification_status: VerificationStatus;
  account_status?: AccountStatus;
  organization?: string | null;
  trust_score: number;
  completed_deliveries: number;
  completed_commutes: number;
  phone?: string | null;
  bio?: string | null;
  commute_vehicle?: string | null;
  rating: number;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseDeliveryDetailsRow {
  request_id: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  contact_instructions?: string | null;
}

export interface DatabaseDeliverySecurityRow {
  request_id: string;
  handover_pin?: string;
  pin_hash?: string;
  attempts?: number;
}

export interface DatabaseDeliveryRequestRow {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  category: RequestCategory;
  pickup_address?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_address?: string | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  pickup_area?: string | null;
  dropoff_area?: string | null;
  item_size: ItemSize;
  weight_estimate_kg?: number | null;
  compensation: number;
  urgency: RequestUrgency;
  needed_by: string;
  status: DeliveryStatus;
  transporter_id?: string | null;
  handover_pin?: string | null;
  estimated_detour_minutes?: number | null;
  created_at: string;
  updated_at?: string;
  details?: DatabaseDeliveryDetailsRow | null;
  security?: DatabaseDeliverySecurityRow | null;
  requester?: {
    full_name: string;
    avatar_url?: string | null;
    trust_score: number;
  } | null;
  transporter?: {
    full_name: string;
    avatar_url?: string | null;
    commute_vehicle?: string | null;
  } | null;
}

export interface DatabasePublishedJourneyRow {
  id: string;
  transporter_id: string;
  vehicle: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  dest_address: string;
  dest_lat: number;
  dest_lng: number;
  departure_time: string;
  max_detour_minutes: number;
  capacity: ItemSize;
  recurring_days?: string[] | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  transporter?: {
    full_name: string;
    avatar_url?: string | null;
    trust_score: number;
  } | null;
}

// Map raw database row to application UserProfile with safe defaults
export function mapDbProfileToUserProfile(row: DatabaseProfileRow): UserProfile {
  // Enforce valid participant role: never trust manipulated strings or privileged roles
  const validRole: 'both' | 'requester' | 'transporter' = 
    (row.role === 'requester' || row.role === 'transporter') ? row.role : 'both';

  return {
    id: row.id,
    email: row.email,
    username: row.username || undefined,
    fullName: row.full_name,
    avatarUrl: row.avatar_url || undefined,
    role: validRole,
    verificationStatus: row.verification_status || 'unverified',
    accountStatus: row.account_status || 'active',
    organization: row.organization || undefined,
    trustScore: typeof row.trust_score === 'number' ? row.trust_score : 50,
    completedDeliveries: typeof row.completed_deliveries === 'number' ? row.completed_deliveries : 0,
    completedCommutes: typeof row.completed_commutes === 'number' ? row.completed_commutes : 0,
    phone: row.phone || undefined,
    bio: row.bio || undefined,
    commuteVehicle: row.commute_vehicle || undefined,
    rating: typeof row.rating === 'number' ? row.rating : 5.0,
  };
}

// Map database request row (with joined details/security) to application DeliveryRequest
export function mapDbRequestToDeliveryRequest(row: DatabaseDeliveryRequestRow): DeliveryRequest {
  const reqUser = row.requester;
  const transUser = row.transporter;
  const det = row.details;
  const sec = row.security;

  // Protect exact locations: if details is masked by RLS, safely fall back to public corridor area description
  // Never expose legacy raw columns if details is not authorized/provided
  const pickupAddr = det?.pickup_address || row.pickup_area || 'Corridor Origin';
  const pickupLat = det?.pickup_lat ?? 37.4275;
  const pickupLng = det?.pickup_lng ?? -122.1668;

  const dropoffAddr = det?.dropoff_address || row.dropoff_area || 'Corridor Destination';
  const dropoffLat = det?.dropoff_lat ?? 37.3861;
  const dropoffLng = det?.dropoff_lng ?? -122.0839;

  // Handover PIN is protected on server (hash-only); never exposed through discovery queries
  const pin = (row as any).handoverPin || sec?.handover_pin || '';

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    pickupAddress: pickupAddr,
    pickupCoords: [pickupLat, pickupLng],
    dropoffAddress: dropoffAddr,
    dropoffCoords: [dropoffLat, dropoffLng],
    itemSize: row.item_size,
    weightEstimateKg: row.weight_estimate_kg ? Number(row.weight_estimate_kg) : undefined,
    compensation: Number(row.compensation),
    urgency: row.urgency,
    neededBy: row.needed_by,
    status: row.status,
    requesterId: row.requester_id,
    requesterName: reqUser?.full_name || 'Community Member',
    requesterTrustScore: reqUser?.trust_score !== undefined ? reqUser.trust_score : 50,
    requesterAvatar: reqUser?.avatar_url || undefined,
    transporterId: row.transporter_id || undefined,
    transporterName: transUser?.full_name || undefined,
    transporterAvatar: transUser?.avatar_url || undefined,
    transporterVehicle: transUser?.commute_vehicle || undefined,
    handoverPin: pin,
    createdAt: row.created_at,
    estimatedDetourMinutes: row.estimated_detour_minutes || 5,
  };
}

// Map database journey row with joined profile to application PublishedJourney
export function mapDbJourneyToPublishedJourney(row: DatabasePublishedJourneyRow): PublishedJourney {
  const transUser = row.transporter;

  return {
    id: row.id,
    transporterId: row.transporter_id,
    transporterName: transUser?.full_name || 'Commuter',
    transporterAvatar: transUser?.avatar_url || undefined,
    transporterTrustScore: transUser?.trust_score !== undefined ? transUser.trust_score : 50,
    vehicle: row.vehicle,
    originAddress: row.origin_address,
    originCoords: [row.origin_lat, row.origin_lng],
    destAddress: row.dest_address,
    destCoords: [row.dest_lat, row.dest_lng],
    departureTime: row.departure_time,
    maxDetourMinutes: row.max_detour_minutes,
    capacity: row.capacity,
    recurringDays: row.recurring_days || undefined,
    isActive: row.is_active,
    notes: row.notes || undefined,
    createdAt: row.created_at,
  };
}

// ============================================================================
// PROFILE UPDATE SANITIZATION & SECURITY GUARDS
// ============================================================================

export const FORBIDDEN_PROFILE_FIELDS = [
  'trustScore',
  'trust_score',
  'verificationStatus',
  'verification_status',
  'accountStatus',
  'account_status',
  'completedDeliveries',
  'completed_deliveries',
  'completedCommutes',
  'completed_commutes',
  'rating',
  'id',
  'email',
  'role',
  'username',
] as const;

export function isForbiddenProfileUpdate(updates: Record<string, any>): boolean {
  return Object.keys(updates).some(key => 
    (FORBIDDEN_PROFILE_FIELDS as readonly string[]).includes(key)
  );
}

export function mapSafeProfileUpdatesToDb(updates: SafeProfileUpdates): Record<string, any> {
  const dbUpdates: Record<string, any> = {};
  if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
  if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;
  if (updates.organization !== undefined) dbUpdates.organization = updates.organization;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
  if (updates.commuteVehicle !== undefined) dbUpdates.commute_vehicle = updates.commuteVehicle;
  return dbUpdates;
}

// Record login event using trusted server-side RPC mechanism
export async function recordLoginAuditInDb(
  eventType: 'login_success' | 'logout' | 'token_refresh' = 'login_success',
  clientOverride?: SupabaseClient
): Promise<{ success: boolean; error: string | null }> {
  const client = clientOverride || customClient || supabase;
  if (!client) {
    return { success: false, error: 'Supabase backend is not configured.' };
  }

  try {
    const { error } = await client.rpc('record_login_event', {
      p_event_type: eventType,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to record login audit.' };
  }
}


// ============================================================================
// GENUINE SUPABASE DATA OPERATIONS (FAIL SAFELY WHEN UNCONFIGURED)
// ============================================================================

export async function fetchDeliveryRequestsFromDb(): Promise<{ data: DeliveryRequest[]; error: string | null }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { data: [], error: 'Supabase backend is not configured.' };
  }

  try {
    // Secure joined select with RLS-protected delivery_details
    // Plaintext PIN storage is removed; cryptographic hashes are protected and never returned by discovery queries
    const { data, error } = await client
      .from('delivery_requests')
      .select(`
        id,
        requester_id,
        title,
        description,
        category,
        pickup_area,
        dropoff_area,
        item_size,
        weight_estimate_kg,
        compensation,
        urgency,
        needed_by,
        status,
        transporter_id,
        estimated_detour_minutes,
        created_at,
        updated_at,
        details:delivery_details (
          pickup_address,
          pickup_lat,
          pickup_lng,
          dropoff_address,
          dropoff_lat,
          dropoff_lng,
          contact_instructions
        ),
        requester:requester_id (full_name, avatar_url, trust_score),
        transporter:transporter_id (full_name, avatar_url, commute_vehicle)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      // Insecure fallback query removed: return clear error immediately to prevent exposure of legacy coordinates/PINs
      return { data: [], error: error.message };
    }

    const mapped = (data || []).map((row: any) => mapDbRequestToDeliveryRequest(row));
    return { data: mapped, error: null };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch delivery requests.' };
  }
}

export async function fetchPublishedJourneysFromDb(): Promise<{ data: PublishedJourney[]; error: string | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { data: [], error: 'Supabase backend is not configured.' };
  }

  try {
    const { data, error } = await supabase
      .from('published_journeys')
      .select(`
        *,
        transporter:transporter_id (full_name, avatar_url, trust_score)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: error.message };
    }

    const mapped = (data || []).map((row: any) => mapDbJourneyToPublishedJourney(row));
    return { data: mapped, error: null };
  } catch (err: any) {
    return { data: [], error: err?.message || 'Failed to fetch journeys.' };
  }
}

export async function createDeliveryRequestInDb(
  request: Omit<DeliveryRequest, 'id' | 'createdAt'>
): Promise<{ data: DeliveryRequest | null; error: string | null }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { data: null, error: 'Supabase backend is not configured. Request could not be saved.' };
  }

  try {
    // 1. Attempt atomic secure RPC first (provisions requests, details, and security)
    const { data: rpcData, error: rpcError } = await client.rpc('create_delivery_request_secure', {
      p_title: request.title,
      p_description: request.description,
      p_category: request.category,
      p_pickup_address: request.pickupAddress,
      p_pickup_lat: request.pickupCoords[0],
      p_pickup_lng: request.pickupCoords[1],
      p_dropoff_address: request.dropoffAddress,
      p_dropoff_lat: request.dropoffCoords[0],
      p_dropoff_lng: request.dropoffCoords[1],
      p_item_size: request.itemSize,
      p_compensation: request.compensation,
      p_urgency: request.urgency,
      p_needed_by: request.neededBy,
      p_handover_pin: request.handoverPin,
      p_weight_estimate_kg: request.weightEstimateKg ?? null,
      p_contact_instructions: null
    });

    if (!rpcError && rpcData) {
      return {
        data: {
          id: rpcData.id,
          ...request,
          status: 'open',
          createdAt: new Date().toISOString(),
          estimatedDetourMinutes: 5,
        },
        error: null,
      };
    }

    if (rpcError && !rpcError.message.includes('function') && !rpcError.message.includes('does not exist')) {
      return { data: null, error: rpcError.message };
    }

    // 2. Fallback to direct table insertion if RPC is not yet created
    const dbPayload = {
      requester_id: request.requesterId,
      title: request.title,
      description: request.description,
      category: request.category,
      pickup_area: request.pickupAddress.split(',')[0],
      dropoff_area: request.dropoffAddress.split(',')[0],
      pickup_address: request.pickupAddress,
      pickup_lat: request.pickupCoords[0],
      pickup_lng: request.pickupCoords[1],
      dropoff_address: request.dropoffAddress,
      dropoff_lat: request.dropoffCoords[0],
      dropoff_lng: request.dropoffCoords[1],
      item_size: request.itemSize,
      weight_estimate_kg: request.weightEstimateKg ?? null,
      compensation: request.compensation,
      urgency: request.urgency,
      needed_by: request.neededBy,
      status: 'open',
    };

    const { data, error } = await client
      .from('delivery_requests')
      .insert([dbPayload])
      .select(`
        *,
        requester:requester_id (full_name, avatar_url, trust_score)
      `)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return {
      data: {
        id: data.id,
        ...request,
        status: 'open',
        createdAt: data.created_at || new Date().toISOString(),
        estimatedDetourMinutes: 5,
      },
      error: null,
    };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Failed to create delivery request in database.' };
  }
}

export async function createPublishedJourneyInDb(
  journey: Omit<PublishedJourney, 'id' | 'createdAt'>
): Promise<{ data: PublishedJourney | null; error: string | null }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { data: null, error: 'Supabase backend is not configured. Commute journey could not be published.' };
  }

  try {
    const dbPayload = {
      transporter_id: journey.transporterId,
      vehicle: journey.vehicle,
      origin_address: journey.originAddress,
      origin_lat: journey.originCoords[0],
      origin_lng: journey.originCoords[1],
      dest_address: journey.destAddress,
      dest_lat: journey.destCoords[0],
      dest_lng: journey.destCoords[1],
      departure_time: journey.departureTime,
      max_detour_minutes: journey.maxDetourMinutes,
      capacity: journey.capacity,
      recurring_days: journey.recurringDays || null,
      is_active: true,
      notes: journey.notes || null,
    };

    const { data, error } = await client
      .from('published_journeys')
      .insert([dbPayload])
      .select(`
        *,
        transporter:transporter_id (full_name, avatar_url, trust_score)
      `)
      .single();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: mapDbJourneyToPublishedJourney(data), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Failed to publish commute route in database.' };
  }
}

export async function updateDeliveryRequestStatusInDb(
  requestId: string,
  status: DeliveryStatus,
  transporterId?: string,
  pinAttempt?: string
): Promise<{ success: boolean; error: string | null }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { success: false, error: 'Supabase backend is not configured.' };
  }

  try {
    // Dispatch to dedicated server-side RPCs implementing state machine validation
    if (status === 'matched') {
      const { data, error } = await client.rpc('accept_delivery_request', { p_request_id: requestId });
      if (!error && data?.success) {
        return { success: true, error: null };
      }
      if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
        return { success: false, error: error.message };
      }
    } else if (status === 'in_transit') {
      const { data, error } = await client.rpc('start_delivery_transit', { p_request_id: requestId });
      if (!error && data?.success) {
        return { success: true, error: null };
      }
      if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
        return { success: false, error: error.message };
      }
    } else if (status === 'completed') {
      if (!pinAttempt || pinAttempt.trim().length !== 4) {
        return {
          success: false,
          error: 'Valid 4-digit handover PIN is required to complete delivery.'
        };
      }

      const { data, error } = await client.rpc('complete_delivery_handover', {
        p_request_id: requestId,
        p_pin: pinAttempt.trim(),
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        return { success: false, error: data.error || 'PIN verification failed.' };
      }

      if (data?.success) {
        return { success: true, error: null };
      }

      return { success: false, error: 'Handover verification failed.' };
    } else if (status === 'cancelled') {
      const { data, error } = await client.rpc('cancel_delivery_request', { p_request_id: requestId });
      if (!error && data?.success) {
        return { success: true, error: null };
      }
      if (error && !error.message.includes('function') && !error.message.includes('does not exist')) {
        return { success: false, error: error.message };
      }
    }

    // Direct table update fallback (for environments where RPC is pending migration)
    const updatePayload: Record<string, any> = { status };
    if (transporterId) {
      updatePayload.transporter_id = transporterId;
    }

    const { error } = await client
      .from('delivery_requests')
      .update(updatePayload)
      .eq('id', requestId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update delivery status in database.' };
  }
}

// Administrator verification review helper
export async function reviewVerificationRequestInDb(
  requestId: string,
  action: 'approved' | 'rejected',
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  const client = customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { success: false, error: 'Supabase backend is not configured.' };
  }

  try {
    const { data, error } = await client.rpc('review_verification_request', {
      p_request_id: requestId,
      p_action: action,
      p_notes: notes || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: Boolean(data?.success), error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to review verification request.' };
  }
}

// ============================================================================
// TRANSPORTER LIVE LOCATION TRACKING & REALTIME SUBSCRIPTIONS
// ============================================================================

export interface DatabaseTransporterLocationRow {
  delivery_id: string;
  transporter_id: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  updated_at: string;
}

export function mapDbLocationToTransporterLocation(row: DatabaseTransporterLocationRow): TransporterLocation {
  return {
    deliveryId: row.delivery_id,
    transporterId: row.transporter_id,
    latitude: row.latitude,
    longitude: row.longitude,
    heading: row.heading !== null && row.heading !== undefined ? Number(row.heading) : undefined,
    speed: row.speed !== null && row.speed !== undefined ? Number(row.speed) : undefined,
    updatedAt: row.updated_at,
  };
}

/**
 * Report or update transporter GPS location for an active delivery.
 * Uses atomic RPC `update_transporter_location` if available, with direct table upsert fallback.
 */
export async function updateTransporterLocationInDb(
  deliveryId: string,
  coords: { latitude: number; longitude: number; heading?: number; speed?: number },
  clientOverride?: SupabaseClient
): Promise<{ success: boolean; error: string | null }> {
  const client = clientOverride || customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { success: false, error: 'Supabase backend is not configured.' };
  }

  try {
    // 1. Try atomic secure RPC first
    const { data: rpcData, error: rpcError } = await client.rpc('update_transporter_location', {
      p_delivery_id: deliveryId,
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      p_heading: coords.heading ?? null,
      p_speed: coords.speed ?? null,
    });

    if (!rpcError && rpcData?.success) {
      return { success: true, error: null };
    }

    if (rpcError && !rpcError.message.includes('function') && !rpcError.message.includes('does not exist')) {
      return { success: false, error: rpcError.message };
    }

    // 2. Fallback to direct table upsert with RLS enforcement
    const userRes = await client.auth.getUser();
    const userId = userRes.data.user?.id;
    if (!userId) {
      return { success: false, error: 'Authentication required.' };
    }

    const { error } = await client
      .from('transporter_locations')
      .upsert({
        delivery_id: deliveryId,
        transporter_id: userId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'delivery_id' });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update transporter location.' };
  }
}

/**
 * Fetch the latest recorded transporter location for an active delivery.
 */
export async function fetchTransporterLocationFromDb(
  deliveryId: string,
  clientOverride?: SupabaseClient
): Promise<{ data: TransporterLocation | null; error: string | null }> {
  const client = clientOverride || customClient || supabase;
  if ((!isSupabaseConfigured && !customClient) || !client) {
    return { data: null, error: 'Supabase backend is not configured.' };
  }

  try {
    const { data, error } = await client
      .from('transporter_locations')
      .select('*')
      .eq('delivery_id', deliveryId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    return { data: mapDbLocationToTransporterLocation(data as DatabaseTransporterLocationRow), error: null };
  } catch (err: any) {
    return { data: null, error: err?.message || 'Failed to fetch transporter location.' };
  }
}

/**
 * Subscribe to live Supabase Realtime location updates for a specific delivery.
 * Returns an unsubscribe callback for clean component unmounting.
 */
export function subscribeToTransporterLocation(
  deliveryId: string,
  onLocationUpdate: (location: TransporterLocation) => void,
  clientOverride?: SupabaseClient
): () => void {
  const client = clientOverride || customClient || supabase;
  if (!client) {
    return () => {};
  }

  try {
    const channel = client
      .channel(`delivery-location-${deliveryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transporter_locations',
          filter: `delivery_id=eq.${deliveryId}`,
        },
        (payload: any) => {
          if (payload.new && payload.new.latitude !== undefined && payload.new.longitude !== undefined) {
            onLocationUpdate(mapDbLocationToTransporterLocation(payload.new as DatabaseTransporterLocationRow));
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

