import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import type { RouteMatchResult, TransporterLocation } from '../../types';
import { Compass, Layers } from 'lucide-react';
import { GoogleMapView } from './GoogleMapView';
import { getGoogleMapsApiKey, getGoogleMapsMapId, isGoogleMapsConfigured, setRuntimeGoogleMapsConfig } from '../../services/googleMapsConfig';
import { fetchRouteBetween, calculateHaversineDistance } from '../../services/routing';
import { isCoordinateStale } from '../../services/geolocation';

export interface MapViewProps {
  match?: RouteMatchResult | null;
  transporterLocation?: TransporterLocation | null;
  isLiveTracking?: boolean;
  isLoading?: boolean;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  pickupAddress?: string;
  dropoffAddress?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  match = null,
  transporterLocation = null,
  isLiveTracking = false,
  isLoading = false,
  pickupCoords: propPickup,
  dropoffCoords: propDropoff,
  pickupAddress,
  dropoffAddress,
}) => {
  const [googleKey, setGoogleKey] = useState<string>(() => getGoogleMapsApiKey());
  const mapId = useMemo(() => getGoogleMapsMapId(), []);
  const [mapEngine, setMapEngine] = useState<'google' | 'leaflet'>(() =>
    isGoogleMapsConfigured() ? 'google' : 'leaflet'
  );
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [tempKeyInput, setTempKeyInput] = useState('');

  // Turn-by-turn road network route for deliveries without a commuter match object
  const [directRoutePolyline, setDirectRoutePolyline] = useState<[number, number][] | null>(null);
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  // Live road navigation polyline & metrics from active transporter GPS to dropoff destination
  const [liveNavPolyline, setLiveNavPolyline] = useState<[number, number][] | null>(null);
  const [liveNavStats, setLiveNavStats] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const lastNavOriginRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    const dropoff = propDropoff || (match ? match.dropoffCoords : undefined);
    if (!transporterLocation || !dropoff) {
      setLiveNavPolyline(null);
      setLiveNavStats(null);
      lastNavOriginRef.current = null;
      return;
    }

    const currentPos: [number, number] = [transporterLocation.latitude, transporterLocation.longitude];

    // Throttle OSRM routing calls: only refetch if partner moved >= 20m from last routed position
    if (lastNavOriginRef.current) {
      const movedMeters = calculateHaversineDistance(lastNavOriginRef.current, currentPos) * 1000;
      if (movedMeters < 20) {
        return;
      }
    }

    lastNavOriginRef.current = currentPos;
    let isCurrent = true;

    fetchRouteBetween(currentPos, dropoff)
      .then((res) => {
        if (isCurrent && res.polyline && res.polyline.length > 0) {
          setLiveNavPolyline(res.polyline);
          setLiveNavStats({ distanceKm: res.distanceKm, durationMin: res.durationMin });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLiveNavPolyline([currentPos, dropoff]);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [transporterLocation, propDropoff, match]);

  useEffect(() => {
    const pickup = propPickup || (match ? match.pickupCoords : undefined);
    const dropoff = propDropoff || (match ? match.dropoffCoords : undefined);

    if (match || !pickup || !dropoff) {
      setDirectRoutePolyline(null);
      setRouteStats(null);
      return;
    }

    let isCurrent = true;
    fetchRouteBetween(pickup, dropoff)
      .then((res) => {
        if (isCurrent && res.polyline && res.polyline.length > 0) {
          setDirectRoutePolyline(res.polyline);
          setRouteStats({ distanceKm: res.distanceKm, durationMin: res.durationMin });
        }
      })
      .catch(() => {
        if (isCurrent) {
          setDirectRoutePolyline([pickup, dropoff]);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [match, propPickup, propDropoff]);

  // Fallback to leaflet if google map key is cleared
  if (!googleKey && mapEngine === 'google') {
    setMapEngine('leaflet');
  }

  // Leaflet references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasFittedBoundsRef = useRef<boolean>(false);

  // Reset bounds fitting when target route endpoints change
  useEffect(() => {
    hasFittedBoundsRef.current = false;
  }, [match, propPickup, propDropoff]);

  // Initialize Leaflet map instance once when in leaflet mode
  useEffect(() => {
    if (mapEngine !== 'leaflet') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: L.LatLngExpression = transporterLocation
      ? [transporterLocation.latitude, transporterLocation.longitude]
      : (propPickup || (match ? match.pickupCoords : [18.35, 77.08]));

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 12,
      zoomControl: false,
    });

    // Clean OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEngine]);

  // Update Leaflet Route Polylines and Markers whenever data changes
  useEffect(() => {
    if (mapEngine !== 'leaflet') return;

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const allPoints: L.LatLngExpression[] = [];

    // Helper for sleek HTML markers
    const createMarkerIcon = (label: string, bg: string, color: string, border: string) => {
      return L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="
            background: ${bg};
            color: ${color};
            border: 2px solid ${border};
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 4px 12px rgba(0,0,0,0.22);
          ">${label}</div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });
    };

    // 1. Direct Commute Baseline Route
    if (match && match.directPolyline.length > 0) {
      const directLine = L.polyline(match.directPolyline, {
        color: '#123527',
        weight: 3.5,
        opacity: 0.45,
        dashArray: '6, 8',
      }).addTo(layerGroup);
      directLine.bindTooltip('Direct Commute Path (No Detour)', { sticky: true });
    }

    // 2. Detour Route
    if (match && match.detourPolyline.length > 0) {
      const detourLine = L.polyline(match.detourPolyline, {
        color: '#059669',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      detourLine.bindTooltip(`Optimized Detour Route (+${match.additionalDetourMin} min)`, { sticky: true });
    }

    // 2.5 Direct Errands Delivery Route Polyline (when match object is not present)
    if (!match && directRoutePolyline && directRoutePolyline.length > 0) {
      const isNavActive = Boolean(liveNavPolyline && liveNavPolyline.length > 0);
      const deliveryLine = L.polyline(directRoutePolyline, {
        color: isNavActive ? '#10B981' : '#059669',
        weight: isNavActive ? 3.5 : 4.5,
        opacity: isNavActive ? 0.45 : 0.9,
        dashArray: isNavActive ? '5, 8' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      const tooltipText = routeStats
        ? `Delivery Route (${routeStats.distanceKm.toFixed(1)} km · ~${routeStats.durationMin} min)`
        : 'Direct Delivery Route';
      deliveryLine.bindTooltip(tooltipText, { sticky: true });
      directRoutePolyline.forEach((pt) => allPoints.push(pt));
    }

    // 2.6 Active Turn-by-Turn Road Navigation from Live Transporter GPS
    if (liveNavPolyline && liveNavPolyline.length > 0) {
      const navLine = L.polyline(liveNavPolyline, {
        color: '#059669',
        weight: 5.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      const navTooltip = liveNavStats
        ? `Live Navigation (${liveNavStats.distanceKm.toFixed(1)} km · ~${liveNavStats.durationMin} min to destination)`
        : 'Live Road Navigation Route';
      navLine.bindTooltip(navTooltip, { sticky: true });
      liveNavPolyline.forEach((pt) => allPoints.push(pt));
    }

    // 3. Origin & Destination Markers (when match exists)

    if (match) {
      const originMarker = L.marker(match.originCoords, {
        icon: createMarkerIcon('A', '#0E291E', '#FFFFFF', '#34D399'),
      }).addTo(layerGroup);
      originMarker.bindPopup('<b>Commute Origin</b><br/>Journey Start');
      allPoints.push(match.originCoords);

      const destMarker = L.marker(match.destCoords, {
        icon: createMarkerIcon('B', '#1B211E', '#FFFFFF', '#A7F3D0'),
      }).addTo(layerGroup);
      destMarker.bindPopup('<b>Commute Destination</b><br/>Final Journey Endpoint');
      allPoints.push(match.destCoords);
    }

    // 4. Pickup Location Marker
    const pickup = propPickup || (match ? match.pickupCoords : undefined);
    if (pickup) {
      const pickupMarker = L.marker(pickup, {
        icon: createMarkerIcon('P', '#10B981', '#06150F', '#FFFFFF'),
      }).addTo(layerGroup);
      pickupMarker.bindPopup(`<b>Pickup Location</b><br/>${pickupAddress || 'Item Retrieval Point'}`);
      allPoints.push(pickup);
    }

    // 5. Dropoff Location Marker
    const dropoff = propDropoff || (match ? match.dropoffCoords : undefined);
    if (dropoff) {
      const dropoffMarker = L.marker(dropoff, {
        icon: createMarkerIcon('D', '#2DD4BF', '#06150F', '#FFFFFF'),
      }).addTo(layerGroup);
      dropoffMarker.bindPopup(`<b>Dropoff Location</b><br/>${dropoffAddress || 'Recipient Handover Point'}`);
      allPoints.push(dropoff);
    }

    // 6. Transporter Live GPS Location Marker (with animated pulsing ring & staleness detection)
    if (transporterLocation) {
      const isStale = isCoordinateStale(transporterLocation.updatedAt, 60000);
      const ringBg = isStale ? 'rgba(245, 158, 11, 0.22)' : 'rgba(16, 185, 129, 0.35)';
      const ringAnim = isStale ? 'none' : 'pulse 1.8s infinite';
      const borderColor = isStale ? '#F59E0B' : '#34D399';
      const iconColor = isStale ? '#F59E0B' : '#34D399';
      const statusTitle = isStale ? 'Transporter Location (Signal Stale)' : 'Transporter Live GPS';

      const transporterIcon = L.divIcon({
        className: 'transporter-live-map-icon',
        html: `
          <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: ${ringBg}; animation: ${ringAnim};"></div>
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: #06150F;
              border: 2.5px solid ${borderColor};
              color: ${iconColor};
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              transform: ${transporterLocation.heading ? `rotate(${transporterLocation.heading}deg)` : 'none'};
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
              </svg>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const transMarker = L.marker([transporterLocation.latitude, transporterLocation.longitude], {
        icon: transporterIcon,
      }).addTo(layerGroup);
      transMarker.bindPopup(`<b>${statusTitle}</b><br/>${isStale ? 'Last recorded' : 'Live stream'}: ${new Date(transporterLocation.updatedAt).toLocaleTimeString()}`);
      allPoints.push([transporterLocation.latitude, transporterLocation.longitude]);
    }

    // Fit map bounds smoothly on initial load (avoiding jarring resets on live GPS updates)
    if (allPoints.length > 0 && !hasFittedBoundsRef.current) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasFittedBoundsRef.current = true;
    }
  }, [mapEngine, match, propPickup, propDropoff, pickupAddress, dropoffAddress, transporterLocation, directRoutePolyline, routeStats, liveNavPolyline, liveNavStats]);


  const handleRecenter = () => {
    hasFittedBoundsRef.current = false;
    const map = mapInstanceRef.current;
    if (map) {
      const points: L.LatLngExpression[] = [];
      const pickup = propPickup || (match ? match.pickupCoords : undefined);
      const dropoff = propDropoff || (match ? match.dropoffCoords : undefined);
      if (pickup) points.push(pickup);
      if (dropoff) points.push(dropoff);
      if (transporterLocation) points.push([transporterLocation.latitude, transporterLocation.longitude]);
      if (match) {
        points.push(match.originCoords);
        points.push(match.destCoords);
      }
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 14 });
      }
    }
  };

  const handleSaveRuntimeKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempKeyInput.trim()) {
      setRuntimeGoogleMapsConfig(tempKeyInput.trim());
      setGoogleKey(tempKeyInput.trim());
      setMapEngine('google');
      setShowKeyInput(false);
      setTempKeyInput('');
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      
      {/* Re-center Control Button */}
      <button
        type="button"
        onClick={handleRecenter}
        title="Re-center map to fit route and live transporter"
        style={{
          position: 'absolute',
          top: '0.875rem',
          left: '0.875rem',
          zIndex: 1000,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-full)',
          padding: '0.35rem 0.75rem',
          boxShadow: 'var(--shadow-sm)',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        <Compass size={14} />
        <span>Re-center</span>
      </button>

      {/* Provider Selector Switch in Top Right */}
      <div
        style={{
          position: 'absolute',
          top: '0.875rem',
          right: '0.875rem',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-full)',
          padding: '0.25rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (googleKey) {
              setMapEngine('google');
            } else {
              setShowKeyInput(true);
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: mapEngine === 'google' ? 'var(--color-forest-850)' : 'transparent',
            color: mapEngine === 'google' ? '#FFFFFF' : 'var(--text-secondary)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>Google Maps</span>
        </button>

        <button
          type="button"
          onClick={() => setMapEngine('leaflet')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: mapEngine === 'leaflet' ? 'var(--color-forest-850)' : 'transparent',
            color: mapEngine === 'leaflet' ? '#FFFFFF' : 'var(--text-secondary)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>Leaflet OSM</span>
        </button>
      </div>

      {/* Render Google Maps Engine */}
      {mapEngine === 'google' && googleKey ? (
        <GoogleMapView
          apiKey={googleKey}
          mapId={mapId}
          match={match}
          transporterLocation={transporterLocation}
          isLiveTracking={isLiveTracking}
          isLoading={isLoading}
          pickupCoords={propPickup}
          dropoffCoords={propDropoff}
          pickupAddress={pickupAddress}
          dropoffAddress={dropoffAddress}
        />
      ) : (
        /* Render Leaflet Engine */
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px' }}>
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '440px',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              zIndex: 1,
            }}
          />

          {/* Floating Route Legend (when match is present) */}
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
        </div>
      )}

      {/* Google Maps API Key Setup Popover */}
      {showKeyInput && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.75rem',
              maxWidth: '460px',
              width: '100%',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-brand-subtle)',
                  color: 'var(--color-forest-800)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Layers size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                Enable Google Maps Platform
              </h3>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Enter a Google Maps API Key or a free Maps Demo Key to unlock Google Maps and Advanced Markers.
            </p>

            <form onSubmit={handleSaveRuntimeKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="AIzaSy... (Google Maps API Key)"
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.875rem' }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowKeyInput(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!tempKeyInput.trim()}
                  className="btn btn-primary btn-sm"
                >
                  Save & Enable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
