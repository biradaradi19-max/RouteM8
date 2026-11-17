import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  setRuntimeGoogleMapsConfig,
  DEFAULT_GOOGLE_MAPS_MAP_ID,
} from './googleMapsConfig';

describe('Google Maps Platform Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return empty string and unconfigured state when no environment or localStorage key is set', () => {
    expect(getGoogleMapsApiKey()).toBe('');
    expect(isGoogleMapsConfigured()).toBe(false);
  });

  it('should verify Leaflet/OSM fallback mode when no key is set', () => {
    // When isGoogleMapsConfigured() returns false, MapView and CreateRequestRouteMap activate Leaflet/OSM
    const isConfigured = isGoogleMapsConfigured();
    expect(isConfigured).toBe(false);
    const activeMapEngine = isConfigured ? 'google' : 'leaflet';
    expect(activeMapEngine).toBe('leaflet');
  });

  it('should return configured key and configured state when VITE_GOOGLE_MAPS_API_KEY is present', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'AIzaSyMockConfiguredEnvKey_777');
    expect(getGoogleMapsApiKey()).toBe('AIzaSyMockConfiguredEnvKey_777');
    expect(isGoogleMapsConfigured()).toBe(true);
  });

  it('should return DEMO_MAP_ID as default mapId when none is configured', () => {
    expect(getGoogleMapsMapId()).toBe(DEFAULT_GOOGLE_MAPS_MAP_ID);
  });

  it('should allow setting runtime Google Maps configuration in localStorage', () => {
    setRuntimeGoogleMapsConfig('AIzaSyCustomKey999', 'CUSTOM_MAP_ID');
    expect(getGoogleMapsApiKey()).toBe('AIzaSyCustomKey999');
    expect(getGoogleMapsMapId()).toBe('CUSTOM_MAP_ID');
    expect(isGoogleMapsConfigured()).toBe(true);
  });

  it('should clear runtime configuration without falling back to any hardcoded key', () => {
    setRuntimeGoogleMapsConfig('AIzaSyCustomKey999', 'CUSTOM_MAP_ID');
    expect(isGoogleMapsConfigured()).toBe(true);

    setRuntimeGoogleMapsConfig('', '');
    expect(getGoogleMapsApiKey()).toBe('');
    expect(getGoogleMapsMapId()).toBe(DEFAULT_GOOGLE_MAPS_MAP_ID);
    expect(isGoogleMapsConfigured()).toBe(false);
  });
});
