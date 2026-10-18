import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  setRuntimeGoogleMapsConfig,
  DEFAULT_GOOGLE_MAPS_API_KEY,
  DEFAULT_GOOGLE_MAPS_MAP_ID,
} from './googleMapsConfig';

describe('Google Maps Platform Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to the verified demo key if no custom env or localStorage key is set', () => {
    expect(getGoogleMapsApiKey()).toBe(DEFAULT_GOOGLE_MAPS_API_KEY);
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

  it('should restore default demo configuration when empty string is provided', () => {
    setRuntimeGoogleMapsConfig('AIzaSyCustomKey999', 'CUSTOM_MAP_ID');
    setRuntimeGoogleMapsConfig('', '');
    expect(getGoogleMapsApiKey()).toBe(DEFAULT_GOOGLE_MAPS_API_KEY);
    expect(getGoogleMapsMapId()).toBe(DEFAULT_GOOGLE_MAPS_MAP_ID);
    expect(isGoogleMapsConfigured()).toBe(true);
  });
});
