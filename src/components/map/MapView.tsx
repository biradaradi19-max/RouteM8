import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { RouteMatchResult } from '../../types';
import { Compass } from 'lucide-react';


interface MapViewProps {
  match: RouteMatchResult | null;
  isLoading?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({ match, isLoading }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map instance once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center in Silicon Valley / Palo Alto
    const map = L.map(mapContainerRef.current, {
      center: [37.41, -122.12],
      zoom: 12,
      zoomControl: false,
    });

    // Add clean OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);


    // Reposition zoom control to top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Route Polylines and Markers whenever match data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!match) return;

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

    // 1. Direct Baseline Route (Subtle dark forest path)
    if (match.directPolyline.length > 0) {
      const directLine = L.polyline(match.directPolyline, {
        color: '#123527',
        weight: 3.5,
        opacity: 0.45,
        dashArray: '6, 8',
      }).addTo(layerGroup);
      directLine.bindTooltip('Direct Commute Path (No Detour)', { sticky: true });
    }

    // 2. Detour Route (Prominent mint green route through pickup and dropoff)
    if (match.detourPolyline.length > 0) {
      const detourLine = L.polyline(match.detourPolyline, {
        color: '#059669',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layerGroup);
      detourLine.bindTooltip(`Optimized Detour Route (+${match.additionalDetourMin} min)`, { sticky: true });
    }

    // 3. Origin Marker
    const originMarker = L.marker(match.originCoords, {
      icon: createMarkerIcon('A', '#0E291E', '#FFFFFF', '#34D399'),
    }).addTo(layerGroup);
    originMarker.bindPopup('<b>Commute Origin</b><br/>Journey Start');
    allPoints.push(match.originCoords);

    // 4. Pickup Marker
    const pickupMarker = L.marker(match.pickupCoords, {
      icon: createMarkerIcon('P', '#10B981', '#06150F', '#FFFFFF'),
    }).addTo(layerGroup);
    pickupMarker.bindPopup('<b>Pickup Location</b><br/>Item Retrieval Point');
    allPoints.push(match.pickupCoords);

    // 5. Dropoff Marker
    const dropoffMarker = L.marker(match.dropoffCoords, {
      icon: createMarkerIcon('D', '#2DD4BF', '#06150F', '#FFFFFF'),
    }).addTo(layerGroup);
    dropoffMarker.bindPopup('<b>Dropoff Location</b><br/>Recipient Handover Point');
    allPoints.push(match.dropoffCoords);

    // 6. Destination Marker
    const destMarker = L.marker(match.destCoords, {
      icon: createMarkerIcon('B', '#1B211E', '#FFFFFF', '#A7F3D0'),
    }).addTo(layerGroup);
    destMarker.bindPopup('<b>Commute Destination</b><br/>Final Journey Endpoint');
    allPoints.push(match.destCoords);

    // Fit map bounds smoothly
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [match]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '440px' }}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      />

      {/* Floating Route Legend */}
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
          <span>Detour Path (+{match?.additionalDetourMin || 0}m)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '16px', height: '0px', borderTop: '2px dashed #123527' }} />
          <span style={{ color: 'var(--color-charcoal-500)' }}>Direct Baseline</span>
        </div>
      </div>

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
  );
};
