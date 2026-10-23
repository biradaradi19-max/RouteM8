import { useState, useEffect, useRef, useCallback } from 'react';
import type { DeliveryStatus, TransporterLocation } from '../types';
import {
  formatGeolocationError,
  isValidCoordinate,
  isCoordinateStale,
  shouldBroadcastLocation,
  type BroadcastCoordinate,
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
}

export interface UseTransporterLocationResult {
  isSharing: boolean;
  permissionState: GeolocationPermissionState;
  location: TransporterLocation | null;
  error: string | null;
  isStale: boolean;
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
}: UseTransporterLocationOptions): UseTransporterLocationResult {
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<GeolocationPermissionState>('unknown');
  const [location, setLocation] = useState<TransporterLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastBroadcastRef = useRef<BroadcastCoordinate | null>(null);

  // Check initial browser permission status if supported
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionState('unavailable');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((perm) => {
          setPermissionState(perm.state as GeolocationPermissionState);
          perm.onchange = () => {
            setPermissionState(perm.state as GeolocationPermissionState);
          };
        })
        .catch(() => {
          setPermissionState('prompt');
        });
    } else {
      setPermissionState('prompt');
    }
  }, []);

  // Fetch initial recorded location from MongoDB & subscribe to Socket.IO room updates
  useEffect(() => {
    if (!deliveryId) {
      setLocation(null);
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
      pollInterval = setInterval(() => {
        if (!isMounted) return;
        deliveriesApi.getLatestLocation(deliveryId).then((loc) => {
          if (isMounted && loc) {
            setLocation((prev) => {
              if (!prev) return loc;
              if (new Date(loc.updatedAt).getTime() > new Date(prev.updatedAt).getTime()) {
                return loc;
              }
              return prev;
            });
          }
        }).catch(() => {});
      }, 5000);
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

        // Optimistically update local view
        setLocation({
          deliveryId,
          transporterId: '',
          latitude,
          longitude,
          heading: currentCoord.heading ?? undefined,
          speed: currentCoord.speed ?? undefined,
          updatedAt: new Date(now).toISOString(),
        });

        // Broadcast to Express + Socket.IO server (which persists to MongoDB)
        emitLocationUpdate(
          deliveryId,
          latitude,
          longitude,
          currentCoord.heading ?? undefined,
          currentCoord.speed ?? undefined
        ).then((res) => {
          if (!res.success && res.error) {
            setError(res.error);
          }
        });

        // Dual-transport: also report via HTTP REST in case WebSockets are unavailable/serverless
        deliveriesApi.updateLocation(deliveryId, {
          latitude,
          longitude,
          heading: currentCoord.heading ?? undefined,
          speed: currentCoord.speed ?? undefined,
        }).catch((err) => {
          console.warn('[useTransporterLocation] HTTP updateLocation error:', err);
        });
      }
    };

    const onWatchError = (err: GeolocationPositionError) => {
      const formatted = formatGeolocationError(err);
      setError(formatted);
      if (err.code === 1) {
        setPermissionState('denied');
      }
      stopSharing();
    };

    try {
      const id = navigator.geolocation.watchPosition(onWatchSuccess, onWatchError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });
      watchIdRef.current = id;
      setIsSharing(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to start geolocation tracking.');
      stopSharing();
    }
  }, [deliveryId, isTransporter, deliveryStatus, minIntervalMs, minDistanceMeters, stopSharing]);

  const toggleSharing = useCallback(async () => {
    if (isSharing) {
      stopSharing();
    } else {
      await startSharing();
    }
  }, [isSharing, startSharing, stopSharing]);

  const isStale = isCoordinateStale(location?.updatedAt);

  return {
    isSharing,
    permissionState,
    location,
    error,
    isStale,
    startSharing,
    stopSharing,
    toggleSharing,
  };
}
