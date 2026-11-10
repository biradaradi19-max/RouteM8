import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import L from 'leaflet';
import { Package, Flag, Navigation, Clock } from 'lucide-react';
import { getGoogleMapsApiKey, getGoogleMapsMapId, isGoogleMapsConfigured } from '../../services/googleMapsConfig';
import { fetchRouteBetween } from '../../services/routing';
import { reverseGeocodeCoords } from '../../services/places';
import { isValidCoordinate } from '../../services/geolocation';

export interface CreateRequestRouteMapProps {
  pickupCoords: [number, number] | null;
  dropoffCoords: [number, number] | null;
  pickupAddress?: string;
  dropoffAddress?: string;
  onPickupCoordsChanged?: (coords: [number, number], address?: string) => void;
  onDropoffCoordsChanged?: (coords: [number, number], address?: string) => void;
  onRouteComputed?: (stats: { distanceKm: number; durationMin: number }) => void;
}

// Internal Leaflet preview component for free-tier environments without Google Maps billing
const LeafletRouteMapPreview: React.FC<{
  pickupCoords: [number, number] | null;
  dropoffCoords: [number, number] | null;
  polyline: [number, number][];
  onMarkerDrag: (newCoords: [number, number], type: 'pickup' | 'dropoff') => void;
  onMapClick: (coords: [number, number]) => void;
}> = ({ pickupCoords, dropoffCoords, polyline, onMarkerDrag, onMapClick }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const onMapClickRef = useRef(onMapClick);
  const onMarkerDragRef = useRef(onMarkerDrag);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onMarkerDragRef.current = onMarkerDrag;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter = pickupCoords || dropoffCoords || [20.0, 77.0];
    const initialZoom = pickupCoords ? 13 : 5;

    const map = L.map(containerRef.current, {
      center: [initialCenter[0], initialCenter[1]],
      zoom: initialZoom,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current([e.latlng.lat, e.latlng.lng]);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Pickup marker
    if (pickupCoords) {
      if (!pickupMarkerRef.current) {
        const pickupIcon = L.divIcon({
          className: 'leaflet-custom-marker',
          html: `<div style="background:#10B981;color:#fff;border:2px solid #fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(16,185,129,0.5);font-size:12px;font-weight:700;">📦</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([pickupCoords[0], pickupCoords[1]], {
          icon: pickupIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onMarkerDragRef.current([pos.lat, pos.lng], 'pickup');
        });
        pickupMarkerRef.current = marker;
      } else {
        pickupMarkerRef.current.setLatLng([pickupCoords[0], pickupCoords[1]]);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    // Dropoff marker
    if (dropoffCoords) {
      if (!dropoffMarkerRef.current) {
        const dropoffIcon = L.divIcon({
          className: 'leaflet-custom-marker',
          html: `<div style="background:#14B8A6;color:#fff;border:2px solid #fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(20,184,166,0.5);font-size:12px;font-weight:700;">🏁</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([dropoffCoords[0], dropoffCoords[1]], {
          icon: dropoffIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onMarkerDragRef.current([pos.lat, pos.lng], 'dropoff');
        });
        dropoffMarkerRef.current = marker;
      } else {
        dropoffMarkerRef.current.setLatLng([dropoffCoords[0], dropoffCoords[1]]);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }

    // Polyline
    if (polyline && polyline.length > 0) {
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(polyline as [number, number][], {
          color: '#059669',
          weight: 5,
          opacity: 0.95,
        }).addTo(map);
      } else {
        polylineRef.current.setLatLngs(polyline as [number, number][]);
      }
    } else if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Adjust camera view
    if (pickupCoords && dropoffCoords) {
      map.fitBounds([
        [pickupCoords[0], pickupCoords[1]],
        [dropoffCoords[0], dropoffCoords[1]],
      ], { padding: [35, 35] });
    } else if (pickupCoords) {
      map.setView([pickupCoords[0], pickupCoords[1]], 14);
    }
  }, [pickupCoords, dropoffCoords, polyline]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

// Internal controller to handle camera framing and polyline rendering in Google Maps
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
  onPickupCoordsChanged,
  onDropoffCoordsChanged,
  onRouteComputed,
}) => {
  const apiKey = useMemo(() => getGoogleMapsApiKey(), []);
  const mapId = useMemo(() => getGoogleMapsMapId(), []);
  const isGoogleActive = useMemo(() => isGoogleMapsConfigured(), []);

  const [pinMode, setPinMode] = useState<'pickup' | 'dropoff'>('pickup');
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

  // Handler for map click (places or moves pin)
  const handleMapClick = async (coords: [number, number]) => {
    const [lat, lng] = coords;
    if (!isValidCoordinate(lat, lng)) return;

    let address: string;
    try {
      address = await reverseGeocodeCoords(coords);
    } catch {
      address = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }

    if (pinMode === 'pickup' || !pickupCoords) {
      onPickupCoordsChanged?.(coords, address);
      if (!dropoffCoords) setPinMode('dropoff');
    } else {
      onDropoffCoordsChanged?.(coords, address);
    }
  };

  // Handler for marker dragging
  const handleMarkerDrag = async (coords: [number, number], type: 'pickup' | 'dropoff') => {
    const [lat, lng] = coords;
    if (!isValidCoordinate(lat, lng)) return;

    let address: string;
    try {
      address = await reverseGeocodeCoords(coords);
    } catch {
      address = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }

    if (type === 'pickup') {
      onPickupCoordsChanged?.(coords, address);
    } else {
      onDropoffCoordsChanged?.(coords, address);
    }
  };

  const defaultCenter = useMemo<google.maps.LatLngLiteral>(() => {
    if (pickupCoords) return { lat: pickupCoords[0], lng: pickupCoords[1] };
    if (dropoffCoords) return { lat: dropoffCoords[0], lng: dropoffCoords[1] };
    return { lat: 20.0, lng: 77.0 }; // Global overview
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
      {/* Map Engine: Google Maps or Leaflet Fallback */}
      {isGoogleActive ? (
        <APIProvider apiKey={apiKey} libraries={['places', 'geometry', 'marker']}>
          <Map
            defaultCenter={defaultCenter}
            defaultZoom={12}
            mapId={mapId || 'DEMO_MAP_ID'}
            internalUsageAttributionIds={['gmp_git_agentskills_v1']}
            style={{ width: '100%', height: '100%' }}
            disableDefaultUI={true}
            gestureHandling="greedy"
            onClick={(e) => {
              const lat = e.detail?.latLng?.lat;
              const lng = e.detail?.latLng?.lng;
              if (typeof lat === 'number' && typeof lng === 'number') {
                handleMapClick([lat, lng]);
              }
            }}
          >
            <PreviewMapController
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              polyline={routePolyline}
            />

            {/* Pickup Marker (Draggable) */}
            {pickupCoords && (
              <AdvancedMarker
                position={{ lat: pickupCoords[0], lng: pickupCoords[1] }}
                title={pickupAddress ? `Pickup: ${pickupAddress} (Drag to adjust)` : 'Pickup Location (Drag to adjust)'}
                draggable={true}
                onDragEnd={(e) => {
                  const lat = e.latLng?.lat();
                  const lng = e.latLng?.lng();
                  if (typeof lat === 'number' && typeof lng === 'number') {
                    handleMarkerDrag([lat, lng], 'pickup');
                  }
                }}
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
                    cursor: 'grab',
                  }}
                  title="Drag to adjust exact pickup doorstep"
                >
                  <Package size={16} strokeWidth={2.5} />
                </div>
              </AdvancedMarker>
            )}

            {/* Dropoff Marker (Draggable) */}
            {dropoffCoords && (
              <AdvancedMarker
                position={{ lat: dropoffCoords[0], lng: dropoffCoords[1] }}
                title={dropoffAddress ? `Dropoff: ${dropoffAddress} (Drag to adjust)` : 'Dropoff Location (Drag to adjust)'}
                draggable={true}
                onDragEnd={(e) => {
                  const lat = e.latLng?.lat();
                  const lng = e.latLng?.lng();
                  if (typeof lat === 'number' && typeof lng === 'number') {
                    handleMarkerDrag([lat, lng], 'dropoff');
                  }
                }}
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
                    cursor: 'grab',
                  }}
                  title="Drag to adjust exact dropoff destination"
                >
                  <Flag size={16} strokeWidth={2.5} />
                </div>
              </AdvancedMarker>
            )}
          </Map>
        </APIProvider>
      ) : (
        <LeafletRouteMapPreview
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          polyline={routePolyline}
          onMarkerDrag={handleMarkerDrag}
          onMapClick={handleMapClick}
        />
      )}

      {/* Floating Route Distance & ETA Pill */}
      {distanceKm !== null && durationMin !== null && (
        <div
          style={{
            position: 'absolute',
            top: '0.5rem',
            left: '0.5rem',
            zIndex: 10,
            backgroundColor: 'rgba(6, 21, 15, 0.88)',
            backdropFilter: 'blur(8px)',
            color: '#FFFFFF',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.35rem 0.65rem',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
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
            <span>~{durationMin} mins</span>
          </div>
        </div>
      )}

      {/* Interactive Pin-Mode Switcher: allows user to select which pin to place by tapping map */}
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(6px)',
          padding: '0.2rem',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-medium)',
        }}
      >
        <button
          type="button"
          onClick={() => setPinMode('pickup')}
          style={{
            padding: '0.2rem 0.45rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.6875rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: pinMode === 'pickup' ? 'var(--color-mint-500, #10B981)' : 'transparent',
            color: pinMode === 'pickup' ? '#FFFFFF' : 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title="Click to place or move Pickup pin on map"
        >
          <span>📦 Pickup Pin</span>
        </button>
        <button
          type="button"
          onClick={() => setPinMode('dropoff')}
          style={{
            padding: '0.2rem 0.45rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.6875rem',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: pinMode === 'dropoff' ? 'var(--color-teal-500, #14B8A6)' : 'transparent',
            color: pinMode === 'dropoff' ? '#FFFFFF' : 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title="Click to place or move Destination pin on map"
        >
          <span>🏁 Dropoff Pin</span>
        </button>
      </div>

      {/* Loading state indicator */}
      {isCalculating && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.5rem',
            right: '0.5rem',
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
          <span>Routing...</span>
        </div>
      )}

      {/* Helpful Hint Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '0.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(4px)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-full)',
          padding: '0.25rem 0.75rem',
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: 'var(--color-charcoal-700)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {!pickupCoords
          ? '💡 Tap map to set pickup pin, or use "My Current Location"'
          : !dropoffCoords
          ? '💡 Tap map or search destination to complete route'
          : '💡 Drag markers to fine-tune exact doorstep positions'}
      </div>
    </div>
  );
};
