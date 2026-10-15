// ============================================================================
// LiveKit Configuration & Endpoint Resolution
// ============================================================================

const LIVEKIT_URL_STORAGE_KEY = 'routem8_livekit_url';

/**
 * Get the configured LiveKit WebSocket Server URL.
 * Checks import.meta.env first, then localStorage runtime override.
 * Default is empty string if not configured.
 * 
 * NOTE: Frontend NEVER accesses or stores LIVEKIT_API_SECRET.
 * All tokens are minted server-side via Supabase Edge Function 'livekit-token'.
 */
export function getLiveKitServerUrl(): string {
  // 1. Vite environment variable
  const envUrl = import.meta.env.VITE_LIVEKIT_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim();
  }

  // 2. Runtime localStorage override (useful for testing/demo)
  try {
    const localUrl = localStorage.getItem(LIVEKIT_URL_STORAGE_KEY);
    if (localUrl && localUrl.trim().length > 0) {
      return localUrl.trim();
    }
  } catch {
    // Ignore localStorage access restrictions
  }

  return '';
}

/**
 * Check whether LiveKit server endpoint is configured.
 */
export function isLiveKitConfigured(): boolean {
  return getLiveKitServerUrl().length > 0;
}

/**
 * Set runtime LiveKit Server URL override.
 */
export function setRuntimeLiveKitUrl(url: string): void {
  try {
    if (url && url.trim().length > 0) {
      localStorage.setItem(LIVEKIT_URL_STORAGE_KEY, url.trim());
    } else {
      localStorage.removeItem(LIVEKIT_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore error
  }
}
