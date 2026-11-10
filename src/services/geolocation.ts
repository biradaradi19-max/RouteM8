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

/**
 * Maximum accuracy radius in meters to accept as a valid delivery vehicle tracking coordinate.
 * Readings worse than this (e.g. 5,000m - 50,000m) are coarse cell-tower or ISP IP geolocations
 * (such as Pune IP routing fallback when physically located in Tondar) and must NOT be broadcast
 * as verified live vehicle transit positions.
 */
export const GPS_MAX_ACCEPTABLE_ACCURACY_METERS = 1000;
export const GPS_HIGH_ACCURACY_THRESHOLD_METERS = 50;

export type GpsConfidenceTier = 'high' | 'medium' | 'low' | 'unusable';

export function getGpsConfidenceTier(accuracyMeters?: number | null): GpsConfidenceTier {
  if (accuracyMeters == null || Number.isNaN(accuracyMeters)) return 'low';
  if (accuracyMeters <= GPS_HIGH_ACCURACY_THRESHOLD_METERS) return 'high';
  if (accuracyMeters <= 200) return 'medium';
  if (accuracyMeters <= GPS_MAX_ACCEPTABLE_ACCURACY_METERS) return 'low';
  return 'unusable';
}

export function formatAccuracyDistance(meters?: number | null): string {
  if (meters == null || Number.isNaN(meters)) return 'unknown';
  if (meters >= 1000) {
    return `±${(meters / 1000).toFixed(1)} km`;
  }
  return `±${Math.round(meters)}m`;
}

export interface GpsDiagnosticEvent {
  source: 'partner_watch' | 'partner_discovery' | 'customer_poll' | 'socket_rx' | 'api_tx';
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  ageMs?: number;
  apiSuccess?: boolean;
  statusMessage?: string;
}

export function logGpsDiagnostics(event: GpsDiagnosticEvent): void {
  const ageSec = event.ageMs !== undefined ? `${(event.ageMs / 1000).toFixed(1)}s` : '0s';
  const acc = event.accuracyMeters != null ? `±${Math.round(event.accuracyMeters)}m` : 'unknown';
  const status = event.statusMessage ? ` (${event.statusMessage})` : '';
  const api = event.apiSuccess !== undefined ? ` api=${event.apiSuccess ? 'OK' : 'FAIL'}` : '';
  console.debug(
    `[GPS-Diag:${event.source}] lat=${event.latitude.toFixed(6)} lng=${event.longitude.toFixed(6)} acc=${acc} age=${ageSec}${api}${status}`
  );
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

export interface GpsAcquisitionProgress {
  status: 'requesting' | 'refining' | 'locked' | 'coarse';
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  message: string;
}

export interface GpsLocationResult {
  coords: [number, number];
  accuracy: number;
  isRefined: boolean;
}

export interface ExtendedPositionOptions extends PositionOptions {
  maxAccuracyMeters?: number;
  desiredAccuracyMeters?: number;
  maxRefineMs?: number;
  onProgress?: (progress: GpsAcquisitionProgress) => void;
}

/**
 * Acquire GPS location using an adaptive satellite-refinement strategy.
 * Does not immediately reject initial coarse network readings; instead provides
 * device GNSS hardware an adaptive period to lock satellites and achieve high accuracy.
 */
export async function acquireAccuratePosition(options?: ExtendedPositionOptions): Promise<GpsLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by your browser.');
  }

  // Enforce secure context (HTTPS) check in production
  if (
    typeof window !== 'undefined' &&
    window.isSecureContext === false &&
    window.location.protocol !== 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    throw new Error('Browser geolocation requires a secure HTTPS connection. Please access RouteM8 over HTTPS.');
  }

  const timeoutMs = options?.timeout ?? 15000;
  const maxAccuracy = options?.maxAccuracyMeters ?? GPS_MAX_ACCEPTABLE_ACCURACY_METERS;
  const desiredAccuracy = options?.desiredAccuracyMeters ?? 100;
  const maxRefineMs = options?.maxRefineMs ?? 6000;

  options?.onProgress?.({
    status: 'requesting',
    message: 'Requesting GPS position from device...',
  });

  return new Promise((resolve, reject) => {
    let bestPosition: GeolocationPosition | null = null;
    let refineTimer: any = null;
    let hasResolved = false;
    let watchId: number | null = null;

    const cleanup = () => {
      hasResolved = true;
      if (refineTimer) {
        clearTimeout(refineTimer);
        refineTimer = null;
      }
      if (watchId !== null && typeof navigator.geolocation.clearWatch === 'function') {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // ignore
        }
        watchId = null;
      }
    };

    const handleSuccessPosition = (pos: GeolocationPosition) => {
      if (hasResolved) return;
      const { latitude, longitude, accuracy } = pos.coords;

      if (!isValidCoordinate(latitude, longitude)) {
        return;
      }

      logGpsDiagnostics({
        source: 'partner_discovery',
        latitude,
        longitude,
        accuracyMeters: accuracy,
        timestamp: pos.timestamp || Date.now(),
      });

      const currentAccuracy = typeof accuracy === 'number' && !Number.isNaN(accuracy) ? accuracy : 999999;

      // Track the best accuracy seen so far
      if (!bestPosition || currentAccuracy < (bestPosition.coords.accuracy || Infinity)) {
        bestPosition = pos;
      }

      // 1. If accuracy is within desired high-accuracy threshold (e.g. <= 100m), resolve immediately
      if (currentAccuracy <= desiredAccuracy) {
        cleanup();
        options?.onProgress?.({
          status: 'locked',
          latitude,
          longitude,
          accuracyMeters: currentAccuracy,
          message: `GPS lock acquired (${formatAccuracyDistance(currentAccuracy)})`,
        });
        resolve({
          coords: [latitude, longitude],
          accuracy: currentAccuracy,
          isRefined: true,
        });
        return;
      }

      // 2. Coarse initial reading (e.g. Wi-Fi or cell tower ±200 km)
      // Do not reject immediately! Give satellite GNSS hardware time to refine
      options?.onProgress?.({
        status: 'refining',
        latitude,
        longitude,
        accuracyMeters: currentAccuracy,
        message: `Acquiring satellites... (${formatAccuracyDistance(currentAccuracy)}). Refining GPS...`,
      });

      // Start refinement timer if not already running
      if (!refineTimer) {
        refineTimer = setTimeout(() => {
          if (hasResolved) return;
          cleanup();

          if (bestPosition) {
            const bestAcc = bestPosition.coords.accuracy;
            if (typeof bestAcc === 'number' && bestAcc <= maxAccuracy) {
              resolve({
                coords: [bestPosition.coords.latitude, bestPosition.coords.longitude],
                accuracy: bestAcc,
                isRefined: false,
              });
              return;
            }

            reject(
              new Error(
                `GPS accuracy (${formatAccuracyDistance(bestAcc)}) is too coarse. High-precision GPS is unavailable. Android devices: please enable "Use precise location" in browser permissions or move outdoors for satellite lock. You can also search your pickup address below or pick a pin on the map.`
              )
            );
            return;
          }

          reject(new Error('GPS location request timed out. Please retry or enter your address manually.'));
        }, maxRefineMs);
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      if (hasResolved) return;

      // If we already have an acceptable reading, resolve with it rather than erroring out
      if (bestPosition && bestPosition.coords.accuracy <= maxAccuracy) {
        cleanup();
        resolve({
          coords: [bestPosition.coords.latitude, bestPosition.coords.longitude],
          accuracy: bestPosition.coords.accuracy,
          isRefined: false,
        });
        return;
      }

      cleanup();
      reject(new Error(formatGeolocationError(err)));
    };

    // If watchPosition is available (real browsers), use it for satellite refinement
    if (typeof navigator.geolocation.watchPosition === 'function') {
      try {
        watchId = navigator.geolocation.watchPosition(
          handleSuccessPosition,
          handleError,
          {
            enableHighAccuracy: true,
            timeout: timeoutMs,
            maximumAge: 0,
            ...options,
          }
        );
      } catch (err: any) {
        cleanup();
        reject(new Error(err.message || 'Failed to start GPS location watch.'));
      }
    } else {
      // Fallback to getCurrentPosition (e.g. test mocks)
      navigator.geolocation.getCurrentPosition(
        handleSuccessPosition,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
          ...options,
        }
      );
    }
  });
}

/**
 * Promise-based current position retrieval with browser geolocation.
 */
export async function getCurrentPositionAsync(options?: ExtendedPositionOptions): Promise<[number, number]> {
  const result = await acquireAccuratePosition(options);
  return result.coords;
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
