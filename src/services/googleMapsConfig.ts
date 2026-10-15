/**
 * ============================================================================
 * ROUTE M8 — GOOGLE MAPS PLATFORM CONFIGURATION & DEMO KEY UTILITIES
 * Manages Google Maps API key resolution from environment variables & localStorage,
 * Cloud mapId configuration, and fallback detection.
 * ============================================================================
 */

const LOCAL_STORAGE_KEY = 'routem8_google_maps_key_v1';
const LOCAL_STORAGE_MAP_ID_KEY = 'routem8_google_maps_map_id_v1';

export function getGoogleMapsApiKey(): string {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  if (envKey) return envKey;

  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = (window.localStorage.getItem(LOCAL_STORAGE_KEY) || '').trim();
    if (saved) return saved;
  }

  return '';
}

export function getGoogleMapsMapId(): string {
  const envMapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();
  if (envMapId) return envMapId;

  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = (window.localStorage.getItem(LOCAL_STORAGE_MAP_ID_KEY) || '').trim();
    if (saved) return saved;
  }

  // Required DEMO_MAP_ID for AdvancedMarkerElement prototyping
  return 'DEMO_MAP_ID';
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function setRuntimeGoogleMapsConfig(apiKey: string, mapId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (apiKey) {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, apiKey.trim());
  } else {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  }

  if (mapId) {
    window.localStorage.setItem(LOCAL_STORAGE_MAP_ID_KEY, mapId.trim());
  } else {
    window.localStorage.removeItem(LOCAL_STORAGE_MAP_ID_KEY);
  }
}
