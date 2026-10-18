import React, { useEffect, useState, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { Package, Flag, Navigation, Clock } from 'lucide-react';
import { getGoogleMapsApiKey, getGoogleMapsMapId } from '../../services/googleMapsConfig';
import { fetchRouteBetween } from '../../services/routing';

export interface CreateRequestRouteMapProps {
  pickupCoords: [number, number] | null;
  dropoffCoords: [number, number] | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  onRouteComputed?: (stats: { distanceKm: number; durationMin: number }) => void;
}

// Internal controller to handle camera framing and polyline rendering
const PreviewMapController: React.FC<{
  pickupCoords: [number, number] | null;
  dropoffCoords: [number, number] | null;
  polyline: [number, number][];
}> = ({ pickupCoords, dropoffCoords, polyline }) => {
  const map = useMap();

  // Draw route polyline
  useEffect(() => {
    if (!map || polyline.length === 0) return;

    const path = polyline.map(([lat, lng]) => ({ lat, lng }));
    const routeLine = new google.maps.Polyline({
      path,
      strokeColor: '#059669',
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map,
    });

    return () => {
      routeLine.setMap(null);
    };
  }, [map, polyline]);

  // Adjust camera to frame both markers smoothly
  useEffect(() => {
    if (!map) return;

    const points: google.maps.LatLngLiteral[] = [];
    if (pickupCoords) points.push({ lat: pickupCoords[0], lng: pickupCoords[1] });
    if (dropoffCoords) points.push({ lat: dropoffCoords[0], lng: dropoffCoords[1] });

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
  }, [map, pickupCoords, dropoffCoords]);

  return null;
};

export const CreateRequestRouteMap: React.FC<CreateRequestRouteMapProps> = ({
  pickupCoords,
  dropoffCoords,
  pickupAddress,
  dropoffAddress,
  onRouteComputed,
}) => {
  const apiKey = useMemo(() => getGoogleMapsApiKey(), []);
  const mapId = useMemo(() => getGoogleMapsMapId(), []);

  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Re-compute route whenever pickup or dropoff coordinates change
  useEffect(() => {
    if (!pickupCoords || !dropoffCoords) {
      setRoutePolyline([]);
      setDistanceKm(null);
      setDurationMin(null);
      return;
    }

    let isCancelled = false;
    setIsCalculating(true);

    fetchRouteBetween(pickupCoords, dropoffCoords)
      .then((res) => {
        if (!isCancelled) {
          setRoutePolyline(res.polyline);
          setDistanceKm(res.distanceKm);
          setDurationMin(res.durationMin);
          if (onRouteComputed) {
            onRouteComputed({ distanceKm: res.distanceKm, durationMin: res.durationMin });
          }
        }
      })
      .catch((err) => {
        console.warn('[RoutePreview] Route calculation notice:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsCalculating(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [pickupCoords, dropoffCoords, onRouteComputed]);

  const defaultCenter = useMemo<google.maps.LatLngLiteral>(() => {
    if (pickupCoords) return { lat: pickupCoords[0], lng: pickupCoords[1] };
    if (dropoffCoords) return { lat: dropoffCoords[0], lng: dropoffCoords[1] };
    return { lat: 37.4275, lng: -122.1668 }; // Silicon Valley default
  }, [pickupCoords, dropoffCoords]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '240px',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-medium)',
        backgroundColor: '#F3F4F6',
      }}
    >
      <APIProvider apiKey={apiKey} libraries={['places', 'geometry', 'marker']}>
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={12}
          mapId={mapId || 'DEMO_MAP_ID'}
          internalUsageAttributionIds={['gmp_git_agentskills_v1']}
          style={{ width: '100%', height: '100%' }}
          disableDefaultUI={true}
          gestureHandling="greedy"
        >
          <PreviewMapController
            pickupCoords={pickupCoords}
            dropoffCoords={dropoffCoords}
            polyline={routePolyline}
          />

          {/* Pickup Marker */}
          {pickupCoords && (
            <AdvancedMarker
              position={{ lat: pickupCoords[0], lng: pickupCoords[1] }}
              title={pickupAddress ? `Pickup: ${pickupAddress}` : 'Pickup Location'}
            >
              <div
                style={{
                  background: 'var(--color-mint-500, #10B981)',
                  color: '#FFFFFF',
                  border: '2px solid #FFFFFF',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.45)',
                }}
              >
                <Package size={16} strokeWidth={2.5} />
              </div>
            </AdvancedMarker>
          )}

          {/* Dropoff Marker */}
          {dropoffCoords && (
            <AdvancedMarker
              position={{ lat: dropoffCoords[0], lng: dropoffCoords[1] }}
              title={dropoffAddress ? `Dropoff: ${dropoffAddress}` : 'Dropoff Location'}
            >
              <div
                style={{
                  background: 'var(--color-teal-500, #14B8A6)',
                  color: '#FFFFFF',
                  border: '2px solid #FFFFFF',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(20, 184, 166, 0.45)',
                }}
              >
                <Flag size={16} strokeWidth={2.5} />
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>

      {/* Floating Route Distance & ETA Pill */}
      {distanceKm !== null && durationMin !== null && (
        <div
          style={{
            position: 'absolute',
            top: '0.75rem',
            left: '0.75rem',
            zIndex: 10,
            backgroundColor: 'rgba(6, 21, 15, 0.88)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.45rem 0.75rem',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Navigation size={13} color="var(--color-mint-400)" />
            <span>{distanceKm} km</span>
          </div>
          <span style={{ opacity: 0.3 }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={13} color="var(--color-mint-400)" />
            <span>~{durationMin} mins driving</span>
          </div>
        </div>
      )}

      {/* Loading state indicator */}
      {isCalculating && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.75rem',
            right: '0.75rem',
            zIndex: 10,
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.25rem 0.5rem',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.6875rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span className="spinner" style={{ width: 11, height: 11 }} />
          <span>Calculating road route...</span>
        </div>
      )}

      {/* Hint overlay when locations are not fully selected */}
      {(!pickupCoords || !dropoffCoords) && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(4px)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-full)',
            padding: '0.35rem 0.875rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-charcoal-700)',
            whiteSpace: 'nowrap',
          }}
        >
          {!pickupCoords
            ? 'Select pickup location to preview on map'
            : 'Select dropoff destination to compute route & ETA'}
        </div>
      )}
    </div>
  );
};
