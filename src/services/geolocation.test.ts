import { describe, it, expect } from 'vitest';
import {
  formatGeolocationError,
  isCoordinateStale,
  calculateDistanceMeters,
  shouldBroadcastLocation,
  isValidCoordinate,
} from './geolocation';

describe('Route M8 Geolocation Service', () => {
  describe('formatGeolocationError', () => {
    it('should format PERMISSION_DENIED correctly', () => {
      const err = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 } as GeolocationPositionError;
      const formatted = formatGeolocationError(err);
      expect(formatted).toContain('Location access was denied');
    });

    it('should format POSITION_UNAVAILABLE correctly', () => {
      const err = { code: 2, message: 'Position unavailable', POSITION_UNAVAILABLE: 2 } as GeolocationPositionError;
      const formatted = formatGeolocationError(err);
      expect(formatted).toContain('GPS position is currently unavailable');
    });

    it('should format TIMEOUT correctly', () => {
      const err = { code: 3, message: 'Timeout', TIMEOUT: 3 } as GeolocationPositionError;
      const formatted = formatGeolocationError(err);
      expect(formatted).toContain('Location request timed out');
    });

    it('should fallback for unknown error', () => {
      const err = { code: 99, message: 'Custom error' } as any;
      const formatted = formatGeolocationError(err);
      expect(formatted).toContain('Custom error');
    });
  });

  describe('isValidCoordinate', () => {
    it('should validate correct latitude and longitude values', () => {
      expect(isValidCoordinate(37.4275, -122.1668)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(90, 180)).toBe(true);
      expect(isValidCoordinate(-90, -180)).toBe(true);
    });

    it('should reject out-of-bounds coordinates', () => {
      expect(isValidCoordinate(91, 0)).toBe(false);
      expect(isValidCoordinate(-91, 0)).toBe(false);
      expect(isValidCoordinate(0, 181)).toBe(false);
      expect(isValidCoordinate(0, -181)).toBe(false);
      expect(isValidCoordinate(NaN, -122)).toBe(false);
      expect(isValidCoordinate(37, Infinity)).toBe(false);
    });
  });

  describe('isCoordinateStale', () => {
    it('should mark recent timestamp as fresh', () => {
      const now = Date.now();
      expect(isCoordinateStale(new Date(now - 10000).toISOString(), 60000)).toBe(false);
    });

    it('should mark old timestamp as stale', () => {
      const now = Date.now();
      expect(isCoordinateStale(new Date(now - 120000).toISOString(), 60000)).toBe(true);
    });

    it('should consider missing timestamp as stale', () => {
      expect(isCoordinateStale(undefined, 60000)).toBe(true);
      expect(isCoordinateStale('', 60000)).toBe(true);
    });
  });

  describe('calculateDistanceMeters', () => {
    it('should calculate accurate distance between two points', () => {
      // Palo Alto Gates CS building to Stanford Oval (~1.1 km)
      const dist = calculateDistanceMeters(37.4302, -122.1733, 37.4292, -122.1697);
      expect(dist).toBeGreaterThan(300);
      expect(dist).toBeLessThan(600);
    });

    it('should return 0 for identical points', () => {
      expect(calculateDistanceMeters(37.4302, -122.1733, 37.4302, -122.1733)).toBe(0);
    });
  });

  describe('shouldBroadcastLocation', () => {
    it('should always broadcast initial coordinate when no previous coordinate exists', () => {
      const shouldSend = shouldBroadcastLocation(null, { latitude: 37.42, longitude: -122.16, timestamp: Date.now() });
      expect(shouldSend).toBe(true);
    });

    it('should not broadcast if minimum time threshold has not elapsed and moved distance is small', () => {
      const prev = { latitude: 37.42000, longitude: -122.16000, timestamp: 1000000 };
      const curr = { latitude: 37.42001, longitude: -122.16001, timestamp: 1001000 }; // 1 sec later, ~1m
      expect(shouldBroadcastLocation(prev, curr, { minIntervalMs: 5000, minDistanceMeters: 15 })).toBe(false);
    });

    it('should broadcast if minimum time threshold has elapsed', () => {
      const prev = { latitude: 37.42000, longitude: -122.16000, timestamp: 1000000 };
      const curr = { latitude: 37.42001, longitude: -122.16001, timestamp: 1006000 }; // 6 sec later
      expect(shouldBroadcastLocation(prev, curr, { minIntervalMs: 5000, minDistanceMeters: 15 })).toBe(true);
    });

    it('should broadcast if moved distance exceeds minimum distance threshold even if interval is shorter', () => {
      const prev = { latitude: 37.42000, longitude: -122.16000, timestamp: 1000000 };
      const curr = { latitude: 37.42100, longitude: -122.16100, timestamp: 1002000 }; // 2 sec later, ~140m moved
      expect(shouldBroadcastLocation(prev, curr, { minIntervalMs: 5000, minDistanceMeters: 15 })).toBe(true);
    });
  });
});
