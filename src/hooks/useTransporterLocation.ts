import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeliveryStatus, TransporterLocation } from '../types';
import {
  formatGeolocationError,
  isValidCoordinate,
  isCoordinateStale,
  shouldBroadcastLocation,
  type BroadcastCoordinate,
  GPS_MAX_ACCEPTABLE_ACCURACY_METERS,
  getGpsConfidenceTier,
  type GpsConfidenceTier,
  logGpsDiagnostics,
} from '../services/geolocation';
import { deliveriesApi } from '../services/api';
import { joinDeliveryRoom, emitLocationUpdate } from '../services/socket';

export type GeolocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'unknown';

export interface UseTransporterLocationOptions {
  deliveryId?: string | null;
  deliveryStatus?: DeliveryStatus;
  isTransporter?: boolean;
  minIntervalMs?: number;
  minDistanceMeters?: number;
  autoStart?: boolean;
  initialLocation?: TransporterLocation | null;
  onLocationBroadcast?: (location: TransporterLocation) => void;
}

export interface UseTransporterLocationResult {
  isSharing: boolean;
  permissionState: GeolocationPermissionState;
  location: TransporterLocation | null;
  error: string | null;
  isStale: boolean;
  accuracy: number | null;
  confidence: GpsConfidenceTier;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  toggleSharing: () => Promise<void>;
}

export function useTransporterLocation({
  deliveryId,
  deliveryStatus,
  isTransporter = false,
  minIntervalMs = 3000,
  minDistanceMeters = 10,
  autoStart = false,
  initialLocation = null,
  onLocationBroadcast,
}: UseTransporterLocationOptions): UseTransporterLocationResult {
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<GeolocationPermissionState>(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return 'unavailable';
    }
    return 'unknown';
  });
  const [location, setLocation] = useState<TransporterLocation | null>(initialLocation || null);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef<BroadcastCoordinate | null>(null);
  const onLocationBroadcastRef = useRef(onLocationBroadcast);

  useEffect(() => {
    onLocationBroadcastRef.current = onLocationBroadcast;
  }, [onLocationBroadcast]);

  const [prevDeliveryId, setPrevDeliveryId] = useState(deliveryId);
  if (deliveryId !== prevDeliveryId) {
    setPrevDeliveryId(deliveryId);
    if (!deliveryId) {
      setLocation(null);
    }
  }

  // Check initial browser permission status if supported
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    let isMounted = true;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          if (!isMounted) return;
          setPermissionState(perm.state as GeolocationPermissionState);
          perm.onchange = () => {
            if (isMounted) setPermissionState(perm.state as GeolocationPermissionState);
          };
        })
        .catch(() => {
          if (isMounted) setPermissionState('prompt');
        });
    } else {
      queueMicrotask(() => {
        if (isMounted) setPermissionState('prompt');
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch initial recorded location from MongoDB & subscribe to Socket.IO room updates
  useEffect(() => {
    if (!deliveryId) {
      return;
    }

    let isMounted = true;
    let cleanupSocket: (() => void) | null = null;

    // Fetch initial state from Express/MongoDB
    deliveriesApi.getLatestLocation(deliveryId).then((loc) => {
      if (isMounted && loc) {
        setLocation(loc);
      }
    });

    // Subscribe to live Socket.IO delivery room updates
    joinDeliveryRoom(deliveryId, {
      onLocation: (updatedLoc) => {
        if (isMounted) {
          setLocation(updatedLoc);
          setError(null);
        }
      },
    }).then((unsubscribe) => {
      if (isMounted) {
        cleanupSocket = unsubscribe;
      } else {
        unsubscribe();
      }
    });

    // Setup HTTP fallback polling for serverless environments where WebSockets are unavailable
    let pollInterval: any = null;
    if (deliveryStatus === 'matched' || deliveryStatus === 'in_transit') {
      const intervalMs = deliveryStatus === 'in_transit' ? 2500 : 4000;
      pollInterval = setInterval(() => {
        if (!isMounted) return;
        deliveriesApi
          .getLatestLocation(deliveryId)
          .then((loc) => {
            if (isMounted && loc) {
              setLocation((prev) => {
                if (!prev) return loc;
                const prevTime = new Date(prev.updatedAt).getTime();
                const newTime = new Date(loc.updatedAt).getTime();
                if (newTime >= prevTime) {
                  return loc;
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }, intervalMs);
    }

    return () => {
      isMounted = false;
      if (cleanupSocket) {
        cleanupSocket();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [deliveryId, deliveryStatus]);

  // Clean stop for active watch
  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsSharing(false);
    lastBroadcastRef.current = null;
  }, []);

  // Auto-stop sharing when delivery is completed or cancelled
  useEffect(() => {
    if (deliveryStatus === 'completed' || deliveryStatus === 'cancelled') {
      stopSharing();
    }
  }, [deliveryStatus, stopSharing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, [stopSharing]);

  // Start sharing live GPS coordinates
  const startSharing = useCallback(async () => {
    if (!deliveryId) {
      setError('No active delivery selected for location tracking.');
      return;
    }

    if (!isTransporter) {
      setError('Only the assigned transporter can share live location for this delivery.');
      return;
    }

    if (deliveryStatus !== 'matched' && deliveryStatus !== 'in_transit') {
      setError(`Cannot share location for delivery in status "${deliveryStatus}".`);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      setPermissionState('unavailable');
      return;
    }

    setError(null);

    const onWatchSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, heading, speed, accuracy } = position.coords;

      if (!isValidCoordinate(latitude, longitude)) {
        setError('Received invalid GPS coordinate reading.');
        return;
      }

      setPermissionState('granted');
      const now = Date.now();

      logGpsDiagnostics({
        source: 'partner_watch',
        latitude,
        longitude,
        accuracyMeters: accuracy,
        heading,
        speed,
        timestamp: now,
      });

      // Filter out low-confidence coarse IP/Wi-Fi estimates (> 1000m, e.g. Pune IP while in Tondar)
      if (typeof accuracy === 'number' && accuracy > GPS_MAX_ACCEPTABLE_ACCURACY_METERS) {
        setError(
          `Acquiring GPS satellite fix (current accuracy ±${(accuracy / 1000).toFixed(1)} km is too coarse). Waiting for satellites...`
        );
        return;
      }

      const currentCoord: BroadcastCoordinate = {
        latitude,
        longitude,
        heading: heading !== null && !Number.isNaN(heading) ? heading : null,
        speed: speed !== null && !Number.isNaN(speed) ? speed : null,
        accuracy: accuracy !== null && !Number.isNaN(accuracy) ? accuracy : null,
        timestamp: now,
      };

      // Check if update meets broadcast threshold
      if (
        shouldBroadcastLocation(lastBroadcastRef.current, currentCoord, {
          minIntervalMs,
          minDistanceMeters,
        })
      ) {
        lastBroadcastRef.current = currentCoord;

        // Optimistically update local view with fresh GPS position and accuracy
        const locPayload: TransporterLocation = {
          deliveryId,
          transporterId: '',
          latitude,
          longitude,
          heading: currentCoord.heading ?? undefined,
          speed: currentCoord.speed ?? undefined,
          accuracy: accuracy !== null && !Number.isNaN(accuracy) ? accuracy : undefined,
          updatedAt: new Date(now).toISOString(),
        };
        setLocation(locPayload);

        // Notify auxiliary broadcast listeners (e.g. active LiveKit WebRTC data channel)
        if (onLocationBroadcastRef.current) {
          try {
            onLocationBroadcastRef.current(locPayload);
          } catch {
            // Ignore auxiliary broadcast errors
          }
        }

        // Broadcast to Express + Socket.IO server (opportunistic when available)
        emitLocationUpdate(
          deliveryId,
          latitude,
          longitude,
          currentCoord.heading ?? undefined,
          currentCoord.speed ?? undefined,
          accuracy !== null && !Number.isNaN(accuracy) ? accuracy : undefined
        ).catch(() => {});

        // Dual-transport: primary and reliable HTTP REST for serverless
        deliveriesApi
          .updateLocation(deliveryId, {
            latitude,
            longitude,
            heading: currentCoord.heading ?? undefined,
            speed: currentCoord.speed ?? undefined,
            accuracy: accuracy !== null && !Number.isNaN(accuracy) ? accuracy : undefined,
            clientTimestamp: now,
          })
          .then((res) => {
            if (res.success) {
              setError(null);
            } else if (res.error) {
              setError(res.error);
            }
          })
          .catch((err) => {
            console.warn('[useTransporterLocation] HTTP updateLocation error:', err);
          });
      }
    };

    const onWatchError = (err: GeolocationPositionError) => {
      const formatted = formatGeolocationError(err);
      setError(formatted);
      if (err.code === 1) {
        setPermissionState('denied');
        stopSharing();
      } else {
        // Code 2 (POSITION_UNAVAILABLE) or Code 3 (TIMEOUT):
        // Transient error during satellite acquisition. DO NOT stop sharing!
        // Keep watcher alive so position updates automatically flow when satellites lock.
        logGpsDiagnostics({
          source: 'partner_watch',
          latitude: 0,
          longitude: 0,
          timestamp: Date.now(),
          statusMessage: `Transient watchPosition error code ${err.code}: ${err.message}`,
        });
      }
    };

    try {
      const id = navigator.geolocation.watchPosition(onWatchSuccess, onWatchError, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
      watchIdRef.current = id;
      setIsSharing(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to start geolocation tracking.');
      stopSharing();
    }
  }, [deliveryId, isTransporter, deliveryStatus, minIntervalMs, minDistanceMeters, stopSharing]);

  // Auto-start sharing if autoStart is true or if transporter's active delivery is in transit
  useEffect(() => {
    if (
      (autoStart || (isTransporter && deliveryStatus === 'in_transit')) &&
      !isSharing &&
      permissionState !== 'denied'
    ) {
      startSharing();
    }
  }, [autoStart, isTransporter, deliveryStatus, isSharing, permissionState, startSharing]);

  const toggleSharing = useCallback(async () => {
    if (isSharing) {
      stopSharing();
    } else {
      await startSharing();
    }
  }, [isSharing, startSharing, stopSharing]);

  const isStale = isCoordinateStale(location?.updatedAt, 60000);
  const accuracy = location?.accuracy ?? null;
  const confidence = getGpsConfidenceTier(accuracy);

  return {
    isSharing,
    permissionState,
    location,
    error,
    isStale,
    accuracy,
    confidence,
    startSharing,
    stopSharing,
    toggleSharing,
  };
}
