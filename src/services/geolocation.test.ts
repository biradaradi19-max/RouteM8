import { describe, it, expect, vi } from 'vitest';
import {
  formatGeolocationError,
  getCurrentPositionAsync,
  acquireAccuratePosition,
  formatAccuracyDistance,
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

  describe('getCurrentPositionAsync', () => {
    it('should request fresh GPS coordinates with maximumAge: 0 and enableHighAccuracy: true', async () => {
      let passedOptions: PositionOptions | undefined;
      const mockGetCurrentPosition = (
        success: (pos: GeolocationPosition) => void,
        _error?: (err: GeolocationPositionError) => void,
        options?: PositionOptions
      ) => {
        passedOptions = options;
        success({
          coords: {
            latitude: 18.5204,
            longitude: 73.8567,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition);
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        writable: true,
        configurable: true,
      });

      const coords = await getCurrentPositionAsync();
      expect(coords).toEqual([18.5204, 73.8567]);
      expect(passedOptions?.enableHighAccuracy).toBe(true);
      expect(passedOptions?.maximumAge).toBe(0);
      expect(passedOptions?.timeout).toBe(15000);
    });

    it('should reject with formatted error when geolocation times out', async () => {
      const mockGetCurrentPosition = (
        _success: (pos: GeolocationPosition) => void,
        error?: (err: GeolocationPositionError) => void
      ) => {
        if (error) {
          error({
            code: 3,
            message: 'Timeout expired',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: { getCurrentPosition: mockGetCurrentPosition },
        writable: true,
        configurable: true,
      });

      await expect(getCurrentPositionAsync()).rejects.toThrow(/timed out/i);
    });
  });

  describe('formatAccuracyDistance', () => {
    it('formats meters when under 1000m', () => {
      expect(formatAccuracyDistance(15)).toBe('±15m');
      expect(formatAccuracyDistance(150)).toBe('±150m');
    });

    it('formats kilometers when 1000m or above', () => {
      expect(formatAccuracyDistance(198000)).toBe('±198.0 km');
      expect(formatAccuracyDistance(2500)).toBe('±2.5 km');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatAccuracyDistance(null)).toBe('unknown');
      expect(formatAccuracyDistance(undefined)).toBe('unknown');
    });
  });

  describe('acquireAccuratePosition (Satellite Refinement & Coarse Filtering)', () => {
    it('resolves immediately when initial reading has high accuracy (<= 100m)', async () => {
      const mockWatchPosition = (
        success: (pos: GeolocationPosition) => void,
        _error?: any,
        _opts?: any
      ) => {
        success({
          coords: {
            latitude: 18.5204,
            longitude: 73.8567,
            accuracy: 12,
          },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition);
        return 1;
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: mockWatchPosition,
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const res = await acquireAccuratePosition({ timeout: 20000 });
      expect(res.coords).toEqual([18.5204, 73.8567]);
      expect(res.accuracy).toBe(12);
      expect(res.isRefined).toBe(true);
    });

    it('refines when first reading is coarse (±180 km) and second reading locks high accuracy', async () => {
      const progressUpdates: string[] = [];

      const mockWatchPosition = (
        success: (pos: GeolocationPosition) => void,
        _error?: any,
        _opts?: any
      ) => {
        // 1. Initial coarse Wi-Fi/cell reading
        success({
          coords: { latitude: 18.5000, longitude: 73.8000, accuracy: 180000 },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition);

        // 2. Refined GNSS lock shortly after
        setTimeout(() => {
          success({
            coords: { latitude: 18.5204, longitude: 73.8567, accuracy: 8 },
            timestamp: Date.now(),
          } as unknown as GeolocationPosition);
        }, 50);

        return 2;
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: mockWatchPosition,
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      const res = await acquireAccuratePosition({
        timeout: 20000,
        maxRefineMs: 500,
        onProgress: (p) => progressUpdates.push(p.message),
      });

      expect(res.coords).toEqual([18.5204, 73.8567]);
      expect(res.accuracy).toBe(8);
      expect(res.isRefined).toBe(true);
      expect(progressUpdates.some((m) => m.includes('180.0 km'))).toBe(true);
    });

    it('rejects with clear user guidance if reading remains coarse (> 1000m) after refinement period', async () => {
      const mockWatchPosition = (
        success: (pos: GeolocationPosition) => void,
        _error?: any,
        _opts?: any
      ) => {
        // Coarse reading only
        success({
          coords: { latitude: 18.5000, longitude: 73.8000, accuracy: 198000 },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition);
        return 3;
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: mockWatchPosition,
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      await expect(
        acquireAccuratePosition({
          timeout: 20000,
          maxAccuracyMeters: 1000,
          maxRefineMs: 50,
        })
      ).rejects.toThrow(/GPS accuracy \(±198\.0 km\) is too coarse/);
    });

    it('rejects with permission denied message when user denies access', async () => {
      const mockWatchPosition = (
        _success: any,
        error: (err: GeolocationPositionError) => void
      ) => {
        error({
          code: 1,
          message: 'Permission Denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
        return 4;
      };

      Object.defineProperty(navigator, 'geolocation', {
        value: {
          watchPosition: mockWatchPosition,
          clearWatch: vi.fn(),
        },
        writable: true,
        configurable: true,
      });

      await expect(acquireAccuratePosition()).rejects.toThrow(/Location access was denied/i);
    });
  });
});
