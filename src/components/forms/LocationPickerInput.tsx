import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  X,
  Globe,
} from 'lucide-react';
import { getCurrentPositionAsync, isValidCoordinate } from '../../services/geolocation';
import {
  searchGlobalPlaces,
  resolvePlaceCoordinates,
  reverseGeocodeCoords,
  type PlacePrediction,
} from '../../services/places';

export interface LocationPickerInputProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  coords: [number, number] | null;
  placeId?: string;
  onChange: (address: string, coords: [number, number] | null, placeId?: string) => void;
  showCurrentLocation?: boolean;
  required?: boolean;
  disabled?: boolean;
}

export const LocationPickerInput: React.FC<LocationPickerInputProps> = ({
  id,
  label,
  placeholder = 'Search address, village, landmark, city, or postal code...',
  value,
  coords,
  onChange,
  showCurrentLocation = false,
  required = false,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastSelectedTextRef = useRef<string>('');

  const [inputValue, setInputValue] = useState(value);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [userBiasCoords, setUserBiasCoords] = useState<[number, number] | null>(null);

  // Sync external value changes
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setInputValue(value);
  }

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search for worldwide places
  useEffect(() => {
    const trimmed = inputValue.trim();

    // If query is short or already matches the selected address with valid coords, don't re-search
    if (trimmed.length < 2) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    if (coords && (trimmed === value || trimmed === lastSelectedTextRef.current)) {
      return;
    }

    let isCurrent = true;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setGeoError(null);
      try {
        const results = await searchGlobalPlaces(trimmed, userBiasCoords);
        if (isCurrent) {
          setPredictions(results);
          setIsOpen(results.length > 0);
        }
      } catch (err: any) {
        console.warn('[LocationPicker] Autocomplete search notice:', err);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 280);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [inputValue, coords, value, userBiasCoords]);

  // Handle selecting a place prediction from the dropdown
  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setIsOpen(false);
    setIsResolving(true);
    setGeoError(null);
    lastSelectedTextRef.current = prediction.description;
    setInputValue(prediction.description);

    try {
      const resolved = await resolvePlaceCoordinates(prediction.placeId, prediction.description);
      if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
        const address = resolved.formattedAddress || prediction.description;
        lastSelectedTextRef.current = address;
        onChange(address, resolved.coords, resolved.placeId);
      } else {
        setGeoError(`Unable to verify coordinates for "${prediction.mainText}". Please pick another search result.`);
        onChange(prediction.description, null, undefined);
      }
    } catch (err: any) {
      setGeoError(err.message || 'Error resolving location coordinates.');
      onChange(prediction.description, null, undefined);
    } finally {
      setIsResolving(false);
    }
  };

  // Handle "Use My Current Location" with fresh device GPS
  const handleUseCurrentLocation = async () => {
    setGeoError(null);
    setIsLocating(true);
    setIsOpen(false);

    try {
      const pos = await getCurrentPositionAsync({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      const [lat, lng] = pos;

      if (!isValidCoordinate(lat, lng)) {
        throw new Error('Received invalid GPS coordinates from browser.');
      }

      setUserBiasCoords([lat, lng]);

      // Reverse geocode current position for human-readable display string
      let formatted: string;
      try {
        formatted = await reverseGeocodeCoords([lat, lng]);
      } catch {
        formatted = `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }

      lastSelectedTextRef.current = formatted;
      setInputValue(formatted);
      // Strictly maintain exact device GPS coordinates - reverse geocode must not change coords
      onChange(formatted, [lat, lng], undefined);
    } catch (err: any) {
      setGeoError(err.message || 'Unable to retrieve your current location. Please check browser permissions.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleClear = () => {
    lastSelectedTextRef.current = '';
    setInputValue('');
    setPredictions([]);
    setIsOpen(false);
    setGeoError(null);
    onChange('', null, undefined);
    if (inputRef.current) inputRef.current.focus();
  };

  const hasValidCoords = Boolean(coords && isValidCoordinate(coords[0], coords[1]));

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', position: 'relative' }}
    >
      {/* Label and "Use My Current Location" Action */}
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
            <span>{isLocating ? 'Detecting GPS...' : 'Use My Current Location'}</span>
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
          value={inputValue}
          onChange={(e) => {
            const val = e.target.value;
            lastSelectedTextRef.current = '';
            setInputValue(val);
            setGeoError(null);
            // Invalidate coordinates until user selects a verified place
            onChange(val, null, undefined);
          }}
          onFocus={() => {
            if (predictions.length > 0 && !hasValidCoords) {
              setIsOpen(true);
            }
          }}
          className="form-input"
          style={{
            paddingLeft: '2.375rem',
            paddingRight: inputValue ? '4.5rem' : '2.25rem',
            borderColor: hasValidCoords
              ? 'rgba(16, 185, 129, 0.45)'
              : geoError
              ? 'var(--status-danger-border)'
              : undefined,
            backgroundColor: hasValidCoords ? 'rgba(16, 185, 129, 0.03)' : undefined,
          }}
          autoComplete="off"
        />

        <div
          style={{
            position: 'absolute',
            right: '0.625rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          {(isSearching || isResolving) && (
            <span className="spinner" style={{ width: 14, height: 14 }} />
          )}

          {inputValue && (
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
        </div>
      </div>

      {/* Autocomplete Predictions Dropdown */}
      {isOpen && predictions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 60,
            marginTop: '0.25rem',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '0.25rem',
          }}
        >
          <div
            style={{
              padding: '0.375rem 0.625rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Globe size={11} />
            <span>Worldwide Matches</span>
          </div>

          {predictions.map((p, idx) => (
            <button
              key={p.placeId || idx}
              type="button"
              onClick={() => handleSelectPrediction(p)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.625rem',
                border: 'none',
                background: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
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
              <MapPin
                size={14}
                style={{
                  color: 'var(--color-mint-600)',
                  marginTop: '0.125rem',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', overflow: 'hidden' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {p.mainText || p.description}
                </span>
                {p.secondaryText && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.secondaryText}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Coordinate Verification Status Pill */}
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
              Verified Coordinates: {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
            </span>
          </span>
        ) : isResolving ? (
          <span style={{ color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="spinner" style={{ width: 11, height: 11 }} />
            <span>Resolving verified coordinates...</span>
          </span>
        ) : inputValue ? (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Select a location from suggestions to verify coordinates
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Worldwide location search enabled
          </span>
        )}
      </div>

      {/* Geolocation / Validation Error Notice */}
      {geoError && (
        <div
          style={{
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid var(--status-danger-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            color: 'var(--status-danger-text)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{geoError}</span>
          </div>
          {showCurrentLocation && (
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating || disabled}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--status-danger-text)',
                textDecoration: 'underline',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '0.125rem 0.25rem',
                flexShrink: 0,
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};
