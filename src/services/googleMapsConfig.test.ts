import { describe, it, expect, beforeEach } from 'vitest';
import {
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  setRuntimeGoogleMapsConfig,
} from './googleMapsConfig';

describe('Google Maps Platform Configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should default to empty string if no env or localStorage key is set', () => {
    expect(getGoogleMapsApiKey()).toBe('');
    expect(isGoogleMapsConfigured()).toBe(false);
  });

  it('should return DEMO_MAP_ID as default mapId when none is configured', () => {
    expect(getGoogleMapsMapId()).toBe('DEMO_MAP_ID');
  });

  it('should allow setting runtime Google Maps configuration in localStorage', () => {
    setRuntimeGoogleMapsConfig('AIzaSyTestKey123', 'TEST_MAP_ID');
    expect(getGoogleMapsApiKey()).toBe('AIzaSyTestKey123');
    expect(getGoogleMapsMapId()).toBe('TEST_MAP_ID');
    expect(isGoogleMapsConfigured()).toBe(true);
  });

  it('should clear runtime configuration when empty string is provided', () => {
    setRuntimeGoogleMapsConfig('AIzaSyTestKey123', 'TEST_MAP_ID');
    setRuntimeGoogleMapsConfig('', '');
    expect(getGoogleMapsApiKey()).toBe('');
    expect(getGoogleMapsMapId()).toBe('DEMO_MAP_ID');
    expect(isGoogleMapsConfigured()).toBe(false);
  });
});
