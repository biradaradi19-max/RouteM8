import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import type { RouteMatchResult, TransporterLocation } from '../../types';
import { Compass, Navigation, Package, Flag, AlertCircle } from 'lucide-react';

interface GoogleMapViewProps {
  apiKey: string;
  mapId?: string;
  match?: RouteMatchResult | null;
  transporterLocation?: TransporterLocation | null;
  isLiveTracking?: boolean;
  isLoading?: boolean;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  pickupAddress?: string;
  dropoffAddress?: string;
}

// Inner helper to manage camera bounds and Google Maps polylines
const MapController: React.FC<{
  match?: RouteMatchResult | null;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  transporterLocation?: TransporterLocation | null;
}> = ({ match, pickupCoords, dropoffCoords, transporterLocation }) => {
  const map = useMap();

  // Draw Polylines using Google Maps native Polyline API
  useEffect(() => {
    if (!map) return;

    const polylines: google.maps.Polyline[] = [];

    // 1. Direct Baseline Commute Polyline (Subtle dashed line)
    if (match && match.directPolyline.length > 0) {
      const directPath = match.directPolyline.map(([lat, lng]) => ({ lat, lng }));
      const directLine = new google.maps.Polyline({
        path: directPath,
        strokeColor: '#123527',
        strokeOpacity: 0.45,
        strokeWeight: 3.5,
        map,
      });
      polylines.push(directLine);
    }

    // 2. Detour Route Polyline (Prominent emerald line)
    if (match && match.detourPolyline.length > 0) {
      const detourPath = match.detourPolyline.map(([lat, lng]) => ({ lat, lng }));
      const detourLine = new google.maps.Polyline({
        path: detourPath,
        strokeColor: '#059669',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
      });
      polylines.push(detourLine);
    }

    return () => {
      polylines.forEach((line) => line.setMap(null));
    };
  }, [map, match]);

  // Adjust camera bounds smoothly to frame all active locations
  useEffect(() => {
    if (!map) return;

    const points: google.maps.LatLngLiteral[] = [];

    if (pickupCoords) points.push({ lat: pickupCoords[0], lng: pickupCoords[1] });
    if (dropoffCoords) points.push({ lat: dropoffCoords[0], lng: dropoffCoords[1] });
    if (transporterLocation) {
      points.push({ lat: transporterLocation.latitude, lng: transporterLocation.longitude });
    }

    if (match) {
      points.push({ lat: match.originCoords[0], lng: match.originCoords[1] });
      points.push({ lat: match.destCoords[0], lng: match.destCoords[1] });
      points.push({ lat: match.pickupCoords[0], lng: match.pickupCoords[1] });
      points.push({ lat: match.dropoffCoords[0], lng: match.dropoffCoords[1] });
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
  }, [map, match, pickupCoords, dropoffCoords, transporterLocation]);

  return null;
};

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  apiKey,
  mapId = 'DEMO_MAP_ID',
  match,
  transporterLocation,
  isLiveTracking = false,
  isLoading = false,
  pickupCoords: propPickup,
  dropoffCoords: propDropoff,
  pickupAddress,
  dropoffAddress,
}) => {
  const [loadError, setLoadError] = useState<string | null>(null);

  // Determine active coordinates from match or explicit props
  const pickup = useMemo(() => {
    return propPickup || (match ? match.pickupCoords : undefined);
  }, [propPickup, match]);

  const dropoff = useMemo(() => {
    return propDropoff || (match ? match.dropoffCoords : undefined);
  }, [propDropoff, match]);

  const defaultCenter = useMemo<google.maps.LatLngLiteral>(() => {
    if (transporterLocation) return { lat: transporterLocation.latitude, lng: transporterLocation.longitude };
    if (pickup) return { lat: pickup[0], lng: pickup[1] };
    if (match) return { lat: match.originCoords[0], lng: match.originCoords[1] };
    return { lat: 37.4275, lng: -122.1668 }; // Silicon Valley default
  }, [transporterLocation, pickup, match]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <APIProvider
        apiKey={apiKey}
        onLoad={() => setLoadError(null)}
        onError={() => setLoadError('Failed to load Google Maps SDK. Please check your API key and network connection.')}
      >
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={13}
          mapId={mapId || 'DEMO_MAP_ID'}
          internalUsageAttributionIds={['gmp_git_agentskills_v1']}
          style={{ width: '100%', height: '100%', minHeight: '440px' }}
          disableDefaultUI={false}
          gestureHandling="greedy"
        >
          <MapController
            match={match}
            pickupCoords={pickup}
            dropoffCoords={dropoff}
            transporterLocation={transporterLocation}
          />

          {/* 1. Commute Origin Marker (when route match exists) */}
          {match && (
            <AdvancedMarker
              position={{ lat: match.originCoords[0], lng: match.originCoords[1] }}
              title="Commute Origin"
            >
              <div
                style={{
                  background: '#0E291E',
                  color: '#FFFFFF',
                  border: '2px solid #34D399',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                A
              </div>
            </AdvancedMarker>
          )}

          {/* 2. Pickup Location Marker */}
          {pickup && (
            <AdvancedMarker
              position={{ lat: pickup[0], lng: pickup[1] }}
              title={pickupAddress ? `Pickup: ${pickupAddress}` : 'Pickup Location'}
            >
              <div
                style={{
                  background: 'var(--color-mint-500, #10B981)',
                  color: '#06150F',
                  border: '2px solid #FFFFFF',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.45)',
                  cursor: 'pointer',
                }}
              >
                <Package size={17} strokeWidth={2.5} />
              </div>
            </AdvancedMarker>
          )}

          {/* 3. Dropoff Location Marker */}
          {dropoff && (
            <AdvancedMarker
              position={{ lat: dropoff[0], lng: dropoff[1] }}
              title={dropoffAddress ? `Dropoff: ${dropoffAddress}` : 'Dropoff Location'}
            >
              <div
                style={{
                  background: 'var(--color-teal-400, #2DD4BF)',
                  color: '#06150F',
                  border: '2px solid #FFFFFF',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px',
                  boxShadow: '0 4px 14px rgba(45, 212, 191, 0.45)',
                  cursor: 'pointer',
                }}
              >
                <Flag size={17} strokeWidth={2.5} />
              </div>
            </AdvancedMarker>
          )}

          {/* 4. Commute Destination Marker (when route match exists) */}
          {match && (
            <AdvancedMarker
              position={{ lat: match.destCoords[0], lng: match.destCoords[1] }}
              title="Commute Destination"
            >
              <div
                style={{
                  background: '#1B211E',
                  color: '#FFFFFF',
                  border: '2px solid #A7F3D0',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                B
              </div>
            </AdvancedMarker>
          )}

          {/* 5. Live Transporter GPS Location Marker */}
          {transporterLocation && (
            <AdvancedMarker
              position={{ lat: transporterLocation.latitude, lng: transporterLocation.longitude }}
              title="Transporter Live Location"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Animated pulsating radar ring */}
                <span
                  style={{
                    position: 'absolute',
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(16, 185, 129, 0.35)',
                    animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }}
                />

                {/* Primary vehicle marker bubble */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-forest-900, #06150F)',
                    color: 'var(--color-mint-400, #34D399)',
                    border: '2.5px solid #34D399',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                    transform: transporterLocation.heading ? `rotate(${transporterLocation.heading}deg)` : undefined,
                    transition: 'transform 0.4s ease, all 0.2s ease',
                  }}
                >
                  <Navigation size={18} strokeWidth={2.5} style={{ fill: 'currentColor' }} />
                </div>
              </div>
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>

      {/* Floating Live Tracking Badge / Status Bar */}
      {(transporterLocation || isLiveTracking) && (
        <div
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            zIndex: 10,
            backgroundColor: 'rgba(6, 21, 15, 0.88)',
            backdropFilter: 'blur(10px)',
            color: '#FFFFFF',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.875rem',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: '#10B981',
              boxShadow: '0 0 10px #10B981',
            }}
          />
          <span>{isLiveTracking && !transporterLocation ? 'Connecting GPS...' : 'Live Transporter GPS'}</span>
          {transporterLocation?.speed !== undefined && transporterLocation?.speed !== null && (
            <span style={{ opacity: 0.8, fontSize: '0.75rem', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '0.5rem' }}>
              {(transporterLocation.speed * 3.6).toFixed(0)} km/h
            </span>
          )}
        </div>
      )}

      {/* Route Legend (when route match is displayed) */}
      {match && (
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            zIndex: 10,
            backgroundColor: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '0.625rem 0.875rem',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.375rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-charcoal-800)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '16px', height: '4px', backgroundColor: '#059669', borderRadius: '2px' }} />
            <span>Detour Path (+{match.additionalDetourMin || 0}m)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '16px', height: '0px', borderTop: '2px dashed #123527' }} />
            <span style={{ color: 'var(--color-charcoal-500)' }}>Direct Baseline</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontWeight: 600,
              fontSize: '0.875rem',
            }}
          >
            <Compass className="spin-animation" size={18} color="var(--color-mint-500)" />
            <span>Computing real road geometry...</span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {loadError && (
        <div
          style={{
            position: 'absolute',
            bottom: '1rem',
            right: '1rem',
            zIndex: 30,
            backgroundColor: 'var(--status-danger-bg, #FEE2E2)',
            color: 'var(--status-danger-text, #991B1B)',
            padding: '0.625rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--status-danger-border, #F87171)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{loadError}</span>
        </div>
      )}
    </div>
  );
};
