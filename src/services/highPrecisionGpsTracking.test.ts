import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatAccuracyDistance,
  getGpsConfidenceTier,
  isCoordinateStale,
  isValidCoordinate,
  calculateDistanceMeters,
} from './geolocation';
import { shouldPersistTelemetryLog } from '../../server/routes/deliveries';

describe('RouteM8 High-Precision GPS Tracking & Accuracy Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. GPS Accuracy Distance & Confidence Tier Formatting', () => {
    it('formats high-precision meters accurately (e.g. ±8m, ±45m)', () => {
      expect(formatAccuracyDistance(8.2)).toBe('±8m');
      expect(formatAccuracyDistance(45.4)).toBe('±45m');
      expect(formatAccuracyDistance(0)).toBe('±0m');
    });

    it('formats coarse distances in kilometers with one decimal place (e.g. ±198.0 km)', () => {
      expect(formatAccuracyDistance(198000)).toBe('±198.0 km');
      expect(formatAccuracyDistance(35000)).toBe('±35.0 km');
      expect(formatAccuracyDistance(1200)).toBe('±1.2 km');
    });

    it('handles null and undefined safely without throwing', () => {
      expect(formatAccuracyDistance(null)).toBe('unknown');
      expect(formatAccuracyDistance(undefined)).toBe('unknown');
      expect(formatAccuracyDistance(NaN)).toBe('unknown');
    });

    it('classifies confidence tiers correctly based on accuracy meters', () => {
      expect(getGpsConfidenceTier(15)).toBe('high');
      expect(getGpsConfidenceTier(50)).toBe('high');
      expect(getGpsConfidenceTier(120)).toBe('medium');
      expect(getGpsConfidenceTier(200)).toBe('medium');
      expect(getGpsConfidenceTier(500)).toBe('low');
      expect(getGpsConfidenceTier(1000)).toBe('low');
      expect(getGpsConfidenceTier(1001)).toBe('unusable');
      expect(getGpsConfidenceTier(198000)).toBe('unusable');
    });
  });

  describe('2. Coordinate Validation & Staleness Detection', () => {
    it('validates realistic geographical coordinates', () => {
      expect(isValidCoordinate(18.5204, 73.8567)).toBe(true); // Pune
      expect(isValidCoordinate(37.4275, -122.1697)).toBe(true); // Stanford
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(91, 0)).toBe(false);
      expect(isValidCoordinate(0, 181)).toBe(false);
      expect(isValidCoordinate(NaN, 73.8567)).toBe(false);
    });

    it('detects fresh vs stale GPS coordinates based on timestamp', () => {
      const freshIso = new Date(Date.now() - 5000).toISOString(); // 5 seconds ago
      const staleIso = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago

      expect(isCoordinateStale(freshIso, 60000)).toBe(false);
      expect(isCoordinateStale(staleIso, 60000)).toBe(true);
      expect(isCoordinateStale(null, 60000)).toBe(true);
    });

    it('calculates real distance in meters using Haversine formula', () => {
      // Distance between two points ~111 meters apart
      const dist = calculateDistanceMeters(18.5200, 73.8567, 18.5210, 73.8567);
      expect(dist).toBeGreaterThan(100);
      expect(dist).toBeLessThan(125);
    });
  });

  describe('3. MongoDB Atlas M0 Write Optimization Throttling', () => {
    it('persists initial telemetry reading immediately', () => {
      const delId = 'del-write-test-1';
      const shouldSaveFirst = shouldPersistTelemetryLog(delId, 18.5204, 73.8567);
      expect(shouldSaveFirst).toBe(true);
    });

    it('throttles rapid consecutive pings when partner has not moved significantly', () => {
      const delId = 'del-write-test-2';
      // First ping
      expect(shouldPersistTelemetryLog(delId, 18.5204, 73.8567)).toBe(true);
      // Rapid ping 1 second later with minimal movement (2 meters)
      expect(shouldPersistTelemetryLog(delId, 18.52041, 73.85671)).toBe(false);
    });

    it('allows write when partner moves significantly (>= 50 meters)', () => {
      const delId = 'del-write-test-3';
      // First ping
      expect(shouldPersistTelemetryLog(delId, 18.5204, 73.8567)).toBe(true);
      // Moved 200 meters north
      expect(shouldPersistTelemetryLog(delId, 18.5222, 73.8567)).toBe(true);
    });
  });
});

