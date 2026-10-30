// ============================================================================
// LiveKit Audio Service — Token Minting & Client Interface
// ============================================================================

import { livekitApi } from './api';
import { getLiveKitServerUrl } from './livekitConfig';

export interface LiveKitTokenResponse {
  token: string;
  serverUrl: string;
  room: string;
  participantIdentity: string;
  participantName: string;
  role: 'Customer' | 'Transporter';
  callType?: 'audio' | 'video';
}

export interface RequestLiveKitTokenResult {
  success: boolean;
  data: LiveKitTokenResponse | null;
  error: string | null;
  missingConfig?: boolean;
}

/**
 * Request a short-lived LiveKit access token from the trusted Express backend.
 * The server function verifies Firebase token, delivery assignment, and active status.
 * Secrets are never exposed to the client.
 */
export async function requestLiveKitToken(
  deliveryId: string,
  callType: 'audio' | 'video' = 'audio'
): Promise<RequestLiveKitTokenResult> {
  try {
    const data = await livekitApi.getToken(deliveryId, callType);

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
        callType: data.callType || callType,
      },
      error: null,
    };
  } catch (err: any) {
    const errorMsg = err.message || 'Failed to generate call token from server.';
    const isMissingConfig =
      errorMsg.includes('missingConfig') ||
      errorMsg.includes('credentials') ||
      errorMsg.includes('not configured');

    return {
      success: false,
      data: null,
      error: isMissingConfig
        ? 'LiveKit credentials are not yet configured on the server. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.'
        : errorMsg,
      missingConfig: Boolean(isMissingConfig),
    };
  }
}
