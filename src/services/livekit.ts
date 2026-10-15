// ============================================================================
// LiveKit Audio Service — Token Minting & Client Interface
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { getLiveKitServerUrl } from './livekitConfig';

export interface LiveKitTokenResponse {
  token: string;
  serverUrl: string;
  room: string;
  participantIdentity: string;
  participantName: string;
  role: 'Customer' | 'Transporter';
}

export interface RequestLiveKitTokenResult {
  success: boolean;
  data: LiveKitTokenResponse | null;
  error: string | null;
  missingConfig?: boolean;
}

/**
 * Request a short-lived LiveKit access token from the trusted Supabase Edge Function.
 * The server function verifies caller session, delivery assignment, and active status.
 * Secrets are never exposed to the client.
 */
export async function requestLiveKitToken(
  deliveryId: string,
  clientOverride?: SupabaseClient
): Promise<RequestLiveKitTokenResult> {
  const client = clientOverride || supabase;

  if (!client || (!isSupabaseConfigured && !clientOverride)) {
    return {
      success: false,
      data: null,
      error: 'Supabase backend is not configured. LiveKit call tokens require an active backend session.',
    };
  }

  try {
    const { data, error } = await client.functions.invoke('livekit-token', {
      body: { deliveryId },
    });

    if (error) {
      // Check for specific HTTP / Edge Function errors
      const errorMsg = error.message || 'Failed to generate call token from server.';
      const isMissingConfig =
        errorMsg.includes('missingConfig') ||
        errorMsg.includes('credentials') ||
        (data && data.missingConfig);

      return {
        success: false,
        data: null,
        error: isMissingConfig
          ? 'LiveKit credentials are not yet configured on the server. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.'
          : errorMsg,
        missingConfig: Boolean(isMissingConfig),
      };
    }

    if (!data || !data.token) {
      return {
        success: false,
        data: null,
        error: data?.error || 'Invalid server response: No token returned.',
        missingConfig: Boolean(data?.missingConfig),
      };
    }

    // Use serverUrl returned by Edge Function, falling back to frontend configured URL
    const resolvedServerUrl = data.serverUrl || getLiveKitServerUrl();

    return {
      success: true,
      data: {
        token: data.token,
        serverUrl: resolvedServerUrl,
        room: data.room,
        participantIdentity: data.participantIdentity,
        participantName: data.participantName,
        role: data.role,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      data: null,
      error: err?.message || 'Network error requesting audio call token.',
    };
  }
}
