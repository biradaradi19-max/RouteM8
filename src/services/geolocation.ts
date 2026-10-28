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
      return 'Location access was denied. Please allow location permissions in your browser address bar to detect your current location.';
    case 2: // POSITION_UNAVAILABLE
      return 'GPS position is currently unavailable. Ensure device location/GPS is switched on and signal is clear.';
    case 3: // TIMEOUT
      return 'Location request timed out. Please click "Use My Current Location" to retry.';
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

/**
 * Promise-based current position retrieval with browser geolocation.
 */
export async function getCurrentPositionAsync(options?: PositionOptions): Promise<[number, number]> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        reject(new Error(formatGeolocationError(err)));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
        ...options,
      }
    );
  });
}

/**
 * Reverse geocode [lat, lng] into a human-readable formatted address.
 * Prefers Google Maps Geocoder, with fallback to OpenStreetMap Nominatim.
 */
export async function reverseGeocode(coords: [number, number]): Promise<string> {
  const [lat, lng] = coords;

  // 1. Try Google Maps Geocoder if Google Maps JS SDK is active
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const res = await geocoder.geocode({ location: { lat, lng } });
      if (res.results && res.results.length > 0 && res.results[0].formatted_address) {
        return res.results[0].formatted_address;
      }
    } catch (err) {
      console.warn('[ReverseGeocode] Google Geocoder error, trying fallback:', err);
    }
  }

  // 2. Fallback to public OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      if (data.display_name) {
        return data.display_name;
      }
    }
  } catch (err) {
    console.warn('[ReverseGeocode] Nominatim fallback error:', err);
  }

  // 3. Coordinate string fallback
  return `Location near ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Geocode text address into formatted address and [lat, lng].
 */
export async function geocodeAddress(
  address: string
): Promise<{ address: string; coords: [number, number] } | null> {
  if (!address || !address.trim()) return null;

  // 1. Try Google Maps Geocoder
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const res = await geocoder.geocode({ address: address.trim() });
      if (res.results && res.results.length > 0) {
        const item = res.results[0];
        const lat = item.geometry.location.lat();
        const lng = item.geometry.location.lng();
        return {
          address: item.formatted_address,
          coords: [lat, lng],
        };
      }
    } catch (err) {
      console.warn('[GeocodeAddress] Google Geocoder error, trying fallback:', err);
    }
  }

  // 2. Fallback to Nominatim
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.trim())}&limit=1`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(timer);

    if (resp.ok) {
      const results = await resp.json();
      if (results && results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        if (isValidCoordinate(lat, lon)) {
          return {
            address: results[0].display_name,
            coords: [lat, lon],
          };
        }
      }
    }
  } catch (err) {
    console.warn('[GeocodeAddress] Nominatim error:', err);
  }

  return null;
}
