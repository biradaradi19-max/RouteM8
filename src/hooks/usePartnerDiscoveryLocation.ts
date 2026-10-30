import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isValidCoordinate,
  GPS_MAX_ACCEPTABLE_ACCURACY_METERS,
  logGpsDiagnostics,
} from '../services/geolocation';

export type PartnerLocationStatus =
  | 'idle'
  | 'getting_location'
  | 'permission_denied'
  | 'unavailable'
  | 'timeout'
  | 'error'
  | 'ready';

export interface UsePartnerDiscoveryLocationReturn {
  coords: [number, number] | null;
  accuracy?: number | null;
  locationStatus: PartnerLocationStatus;
  errorMessage: string | null;
  lastUpdated: Date | null;
  refreshLocation: () => Promise<void>;
  statusLabel: string;
}

export function usePartnerDiscoveryLocation(): UsePartnerDiscoveryLocationReturn {
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<PartnerLocationStatus>('getting_location');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isMountedRef = useRef(true);

  const acquireLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (isMountedRef.current) {
        setLocationStatus('unavailable');
        setErrorMessage('Geolocation is not supported by your browser.');
        setCoords(null);
      }
      return;
    }

    if (isMountedRef.current) {
      setLocationStatus('getting_location');
      setErrorMessage(null);
    }

    // Check permissions API if available
    if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (perm.state === 'denied') {
          if (isMountedRef.current) {
            setLocationStatus('permission_denied');
            setErrorMessage('Location permission has been blocked. Please enable location access in browser settings.');
            setCoords(null);
          }
          return;
        }
      } catch {
        // Non-blocking fallback to getCurrentPosition
      }
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;

        logGpsDiagnostics({
          source: 'partner_discovery',
          latitude: lat,
          longitude: lng,
          accuracyMeters: acc,
          timestamp: pos.timestamp || Date.now(),
        });

        if (isValidCoordinate(lat, lng)) {
          if (typeof acc === 'number' && acc > GPS_MAX_ACCEPTABLE_ACCURACY_METERS) {
            setCoords(null);
            setAccuracy(acc);
            setLocationStatus('getting_location');
            setErrorMessage(`Waiting for accurate GPS lock (current accuracy ±${(acc / 1000).toFixed(1)} km is too coarse)...`);
            return;
          }

          setCoords([lat, lng]);
          setAccuracy(acc ?? null);
          setLocationStatus('ready');
          setErrorMessage(null);
          setLastUpdated(new Date(pos.timestamp || Date.now()));
        } else {
          setCoords(null);
          setAccuracy(null);
          setLocationStatus('error');
          setErrorMessage('Received invalid GPS coordinates from device.');
        }
      },
      (err) => {
        if (!isMountedRef.current) return;
        setCoords(null);

        switch (err.code) {
          case 1: // PERMISSION_DENIED
            setLocationStatus('permission_denied');
            setErrorMessage(err.message || 'Location permission denied by user.');
            break;
          case 2: // POSITION_UNAVAILABLE
            setLocationStatus('unavailable');
            setErrorMessage(err.message || 'Position unavailable from device GPS.');
            break;
          case 3: // TIMEOUT
            setLocationStatus('timeout');
            setErrorMessage(err.message || 'Location acquisition timed out.');
            break;
          default:
            setLocationStatus('error');
            setErrorMessage(err.message || 'Unable to retrieve current location.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    acquireLocation();

    return () => {
      isMountedRef.current = false;
    };
  }, [acquireLocation]);

  const refreshLocation = useCallback(async () => {
    await acquireLocation();
  }, [acquireLocation]);

  let statusLabel = 'Getting your location…';
  if (locationStatus === 'permission_denied') {
    statusLabel = 'Location permission required';
  } else if (
    locationStatus === 'unavailable' ||
    locationStatus === 'timeout' ||
    locationStatus === 'error'
  ) {
    statusLabel = 'Unable to get location — Retry';
  } else if (locationStatus === 'ready') {
    statusLabel = 'Location acquired';
  }

  return {
    coords,
    accuracy,
    locationStatus,
    errorMessage,
    lastUpdated,
    refreshLocation,
    statusLabel,
  };
}
