/**
 * ============================================================================
 * ROUTE M8 — GEOLOCATION & LIVE GPS TRACKING SERVICE
 * Handles browser geolocation permissions, high-accuracy coordinate streaming,
 * position staleness detection, and secure backend broadcasting.
 * ============================================================================
 */

export interface BroadcastCoordinate {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp: number;
}

export interface BroadcastThresholds {
  minIntervalMs?: number; // Minimum time between consecutive backend updates (default: 5000ms)
  minDistanceMeters?: number; // Minimum distance change to force an immediate update (default: 15m)
}

/**
 * Format browser GeolocationPositionError into a clear, actionable user message.
 */
export function formatGeolocationError(error: GeolocationPositionError | { code?: number; message?: string }): string {
  if (!error) return 'An unknown location error occurred.';

  switch (error.code) {
    case 1: // PERMISSION_DENIED
      return 'Location access was denied. Please allow location permissions in your browser address bar to share live GPS with the sender/recipient.';
    case 2: // POSITION_UNAVAILABLE
      return 'GPS position is currently unavailable. Ensure device location/GPS is switched on and signal is available.';
    case 3: // TIMEOUT
      return 'Location request timed out. Retrying GPS satellite acquisition...';
    default:
      return error.message || 'Unable to retrieve live location.';
  }
}

/**
 * Validate that coordinates are valid finite numbers within earth boundaries.
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Check if a recorded coordinate is stale (older than maxAgeMs, default 2 minutes).
 */
export function isCoordinateStale(isoTimestamp?: string | null, maxAgeMs = 120000): boolean {
  if (!isoTimestamp) return true;
  const recordedTime = new Date(isoTimestamp).getTime();
  if (Number.isNaN(recordedTime)) return true;
  return Date.now() - recordedTime > maxAgeMs;
}

/**
 * Calculate Great-Circle distance between two coordinates in meters (Haversine formula).
 */
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determine whether a new coordinate reading should be broadcast to the backend.
 * Uses smart throttling: updates at least every `minIntervalMs` (5s), or sooner if moved > `minDistanceMeters` (15m).
 */
export function shouldBroadcastLocation(
  lastSent: BroadcastCoordinate | null,
  current: BroadcastCoordinate,
  thresholds: BroadcastThresholds = {}
): boolean {
  if (!lastSent) return true;

  const minInterval = thresholds.minIntervalMs ?? 5000;
  const minDistance = thresholds.minDistanceMeters ?? 15;

  const timeElapsed = current.timestamp - lastSent.timestamp;
  if (timeElapsed >= minInterval) {
    return true;
  }

  const distanceMoved = calculateDistanceMeters(
    lastSent.latitude,
    lastSent.longitude,
    current.latitude,
    current.longitude
  );

  return distanceMoved >= minDistance;
}
