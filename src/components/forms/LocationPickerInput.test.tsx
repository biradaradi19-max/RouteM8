import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocationPickerInput } from './LocationPickerInput';
import * as geolocationService from '../../services/geolocation';
import * as placesService from '../../services/places';

describe('LocationPickerInput Component', () => {
  const defaultProps = {
    id: 'test-location',
    label: 'Pickup Location',
    value: '',
    coords: null as [number, number] | null,
    onChange: vi.fn(),
    showCurrentLocation: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(placesService, 'searchGlobalPlaces').mockResolvedValue([]);
    vi.spyOn(placesService, 'resolvePlaceCoordinates').mockResolvedValue(null);
  });

  it('renders label, input, and "Use My Current Location" button', () => {
    render(<LocationPickerInput {...defaultProps} />);
    expect(screen.getByLabelText('Pickup Location')).toBeDefined();
    expect(screen.getByRole('button', { name: /Use My Current Location/i })).toBeDefined();
  });

  it('calls getCurrentPositionAsync with maximumAge: 0 and enableHighAccuracy: true when button clicked', async () => {
    const getCurrentPositionSpy = vi.spyOn(geolocationService, 'getCurrentPositionAsync')
      .mockResolvedValue([18.5204, 73.8567]);
    const reverseGeocodeSpy = vi.spyOn(placesService, 'reverseGeocodeCoords')
      .mockResolvedValue('Pune Station, Pune, Maharashtra, India');

    const onChangeMock = vi.fn();
    render(<LocationPickerInput {...defaultProps} onChange={onChangeMock} />);

    const locateBtn = screen.getByRole('button', { name: /Use My Current Location/i });
    fireEvent.click(locateBtn);

    await waitFor(() => {
      expect(getCurrentPositionSpy).toHaveBeenCalledWith({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });

    await waitFor(() => {
      expect(reverseGeocodeSpy).toHaveBeenCalledWith([18.5204, 73.8567]);
    });

    expect(onChangeMock).toHaveBeenCalledWith(
      'Pune Station, Pune, Maharashtra, India',
      [18.5204, 73.8567],
      undefined
    );
  });

  it('preserves exact GPS coordinates even if reverse geocoding returns a coordinate fallback', async () => {
    vi.spyOn(geolocationService, 'getCurrentPositionAsync').mockResolvedValue([18.5167, 73.8562]);
    vi.spyOn(placesService, 'reverseGeocodeCoords').mockResolvedValue('Coordinates: 18.5167, 73.8562');

    const onChangeMock = vi.fn();
    render(<LocationPickerInput {...defaultProps} onChange={onChangeMock} />);

    fireEvent.click(screen.getByRole('button', { name: /Use My Current Location/i }));

    await waitFor(() => {
      expect(onChangeMock).toHaveBeenCalledWith(
        'Coordinates: 18.5167, 73.8562',
        [18.5167, 73.8562],
        undefined
      );
    });
  });

  it('shows clear retryable error message when GPS permission is denied or fails', async () => {
    vi.spyOn(geolocationService, 'getCurrentPositionAsync').mockRejectedValue(
      new Error('Location access was denied. Please allow location permissions in your browser address bar.')
    );

    const onChangeMock = vi.fn();
    render(<LocationPickerInput {...defaultProps} onChange={onChangeMock} />);

    fireEvent.click(screen.getByRole('button', { name: /Use My Current Location/i }));

    await waitFor(() => {
      expect(screen.getByText(/Location access was denied/i)).toBeDefined();
    });

    // Never call onChange with fake/fallback coordinates when GPS fails
    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it('displays verified coordinates indicator when valid coords are provided', () => {
    render(<LocationPickerInput {...defaultProps} value="Shivajinagar, Pune" coords={[18.5314, 73.8446]} />);
    expect(screen.getByText(/Verified Coordinates: 18.5314, 73.8446/i)).toBeDefined();
  });

  it('invalidates coords when user manually types in the input', () => {
    const onChangeMock = vi.fn();
    render(
      <LocationPickerInput
        {...defaultProps}
        value="Shivajinagar, Pune"
        coords={[18.5314, 73.8446]}
        onChange={onChangeMock}
      />
    );

    const input = screen.getByLabelText('Pickup Location');
    fireEvent.change(input, { target: { value: 'Shivajinagar Station' } });

    expect(onChangeMock).toHaveBeenCalledWith('Shivajinagar Station', null, undefined);
  });
});
