import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react';
import {
  getCurrentPositionAsync,
  reverseGeocode,
  geocodeAddress,
  isValidCoordinate,
} from '../../services/geolocation';

export interface LocationPickerInputProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  coords: [number, number] | null;
  onChange: (address: string, coords: [number, number] | null) => void;
  showCurrentLocation?: boolean;
  required?: boolean;
  disabled?: boolean;
}

// Corridor presets for instant prototyping & testing
const CORRIDOR_PRESETS: Array<{ label: string; address: string; coords: [number, number] }> = [
  { label: 'Stanford Green Library', address: 'Green Library, 557 Escondido Mall, Stanford, CA', coords: [37.4275, -122.1668] },
  { label: 'Stanford Gates CS Bldg', address: 'Gates Computer Science Building, Palo Alto, CA', coords: [37.4302, -122.1733] },
  { label: 'Whole Foods Market Palo Alto', address: 'Whole Foods Market, 774 Emerson St, Palo Alto, CA', coords: [37.4418, -122.1601] },
  { label: 'Walgreens Pharmacy El Camino', address: 'Walgreens, 4170 El Camino Real, Palo Alto, CA', coords: [37.4095, -122.1278] },
  { label: 'San Antonio Shopping Center', address: 'San Antonio Center, Mountain View, CA', coords: [37.4022, -122.1124] },
  { label: 'Castro Street Downtown', address: 'Castro St & El Camino Real, Mountain View, CA', coords: [37.3861, -122.0839] },
  { label: 'Googleplex / Charleston', address: '1600 Amphitheatre Pkwy, Mountain View, CA', coords: [37.4220, -122.0841] },
  { label: 'Sunnyvale Caltrain Station', address: 'Sunnyvale Caltrain, Sunnyvale, CA', coords: [37.3784, -122.0308] },
];

export const LocationPickerInput: React.FC<LocationPickerInputProps> = ({
  id,
  label,
  placeholder = 'Search street, building, or landmark...',
  value,
  coords,
  onChange,
  showCurrentLocation = false,
  required = false,
  disabled = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // Initialize Google Places Autocomplete when Google Maps Places library is available
  useEffect(() => {
    if (!inputRef.current) return;

    const initAutocomplete = () => {
      const googleMaps = (window as any).google?.maps;
      if (googleMaps && googleMaps.places && !autocompleteRef.current) {
        try {
          const autocomplete = new googleMaps.places.Autocomplete(inputRef.current, {
            fields: ['formatted_address', 'geometry', 'name'],
          });

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place && place.geometry && place.geometry.location) {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              const formattedAddress = place.formatted_address || place.name || inputRef.current?.value || '';
              setGeoError(null);
              onChange(formattedAddress, [lat, lng]);
            }
          });

          autocompleteRef.current = autocomplete;
        } catch (err) {
          console.warn('[Places Autocomplete Init Notice]', err);
        }
      }
    };

    initAutocomplete();

    // Re-check after Google Maps SDK finishes loading asynchronously
    const timer = setInterval(() => {
      if ((window as any).google?.maps?.places && !autocompleteRef.current) {
        initAutocomplete();
        clearInterval(timer);
      }
    }, 500);

    return () => {
      clearInterval(timer);
    };
  }, [onChange]);

  // Handle "Use My Current Location"
  const handleUseCurrentLocation = async () => {
    setGeoError(null);
    setIsLocating(true);
    try {
      const pos = await getCurrentPositionAsync();
      const [lat, lng] = pos;

      if (!isValidCoordinate(lat, lng)) {
        throw new Error('Retrieved position is outside valid geographic coordinates.');
      }

      // Reverse geocode into formatted address
      const formattedAddress = await reverseGeocode([lat, lng]);
      onChange(formattedAddress, [lat, lng]);
    } catch (err: any) {
      setGeoError(err.message || 'Unable to retrieve your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  // Attempt geocoding on blur if text is entered without coordinate resolution
  const handleBlur = async () => {
    if (!value || !value.trim()) {
      if (coords) onChange('', null);
      return;
    }

    // If coordinates are already set, no resolution needed
    if (coords && isValidCoordinate(coords[0], coords[1])) return;

    setIsGeocoding(true);
    setGeoError(null);
    try {
      const resolved = await geocodeAddress(value);
      if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
        onChange(resolved.address, resolved.coords);
      } else {
        setGeoError('Could not verify coordinates for this address. Please choose a suggestion or pick a corridor location.');
        onChange(value, null);
      }
    } catch (err: any) {
      setGeoError(err.message || 'Failed to verify address coordinates.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleClear = () => {
    onChange('', null);
    setGeoError(null);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleSelectPreset = (preset: typeof CORRIDOR_PRESETS[0]) => {
    onChange(preset.address, preset.coords);
    setShowPresets(false);
    setGeoError(null);
  };

  const hasValidCoords = Boolean(coords && isValidCoordinate(coords[0], coords[1]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label htmlFor={id} className="form-label" style={{ margin: 0, fontWeight: 700 }}>
          {label}
        </label>

        {showCurrentLocation && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating || disabled}
            style={{
              background: 'none',
              border: 'none',
              color: isLocating ? 'var(--text-tertiary)' : 'var(--color-mint-600)',
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: isLocating || disabled ? 'not-allowed' : 'pointer',
              padding: '0.125rem 0.25rem',
            }}
            title="Detect GPS coordinates using browser geolocation"
          >
            {isLocating ? (
              <span className="spinner" style={{ width: 12, height: 12 }} />
            ) : (
              <Crosshair size={13} strokeWidth={2.5} />
            )}
            <span>{isLocating ? 'Detecting Location...' : 'Use My Current Location'}</span>
          </button>
        )}
      </div>

      {/* Input container */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <MapPin
          size={16}
          style={{
            position: 'absolute',
            left: '0.875rem',
            color: hasValidCoords ? 'var(--color-mint-500)' : 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        />

        <input
          ref={inputRef}
          id={id}
          type="text"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setGeoError(null);
            // If user types, clear previous coords until resolved
            onChange(e.target.value, null);
          }}
          onBlur={handleBlur}
          className="form-input"
          style={{
            paddingLeft: '2.375rem',
            paddingRight: value ? '4.5rem' : '2.25rem',
            borderColor: hasValidCoords
              ? 'rgba(16, 185, 129, 0.45)'
              : geoError
              ? 'var(--status-danger-border)'
              : undefined,
            backgroundColor: hasValidCoords ? 'rgba(16, 185, 129, 0.03)' : undefined,
          }}
          autoComplete="off"
        />

        <div style={{ position: 'absolute', right: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {isGeocoding && <span className="spinner" style={{ width: 14, height: 14 }} />}

          {value && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear location"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPresets((prev) => !prev)}
            title="Quick Corridor Locations"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Verified Coordinates Pill or Error Notice */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
        {hasValidCoords && coords ? (
          <span
            style={{
              color: 'var(--color-mint-600)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={13} />
            <span>
              Resolved: {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
            </span>
          </span>
        ) : value ? (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Resolving verified road coordinates...
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Google Places Autocomplete enabled
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowPresets((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-forest-800)',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            fontSize: '0.6875rem',
            textDecoration: 'underline',
          }}
        >
          {showPresets ? 'Close Presets' : 'Corridor Quick Picks'}
        </button>
      </div>

      {/* Presets Popover Menu */}
      {showPresets && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 40,
            marginTop: '0.25rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '0.375rem',
          }}
        >
          <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            Bay Area Corridor Presets
          </div>
          {CORRIDOR_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectPreset(p)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.625rem',
                border: 'none',
                background: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.125rem',
                fontSize: '0.8125rem',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-surface-subtle)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>{p.address}</span>
            </button>
          ))}
        </div>
      )}

      {/* Geolocation / Validation Error Banner */}
      {geoError && (
        <div
          style={{
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid var(--status-danger-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--status-danger-text)',
            fontSize: '0.75rem',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>{geoError}</span>
        </div>
      )}
    </div>
  );
};
