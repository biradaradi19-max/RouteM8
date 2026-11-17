import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MapView } from './MapView';
import * as GoogleMapsConfigModule from '../../services/googleMapsConfig';

vi.mock('../../services/routing', () => ({
  fetchRouteBetween: vi.fn().mockResolvedValue({
    distanceKm: 15.0,
    durationMin: 20.0,
    polyline: [[18.5204, 73.8567], [18.5500, 73.9000]],
  }),
  calculateHaversineDistance: vi.fn().mockReturnValue(15.0),
}));

// Mock GoogleMapView to verify props, engine activation, error handling, and click propagation
vi.mock('./GoogleMapView', () => ({
  GoogleMapView: ({
    apiKey,
    pickupCoords,
    dropoffCoords,
    transporterLocation,
    onLoadError,
    onMapClick,
  }: any) => {
    return (
      <div data-testid="google-map-view" data-api-key={apiKey}>
        <span>Google Maps Active</span>
        {pickupCoords && <div data-testid="google-pickup">{pickupCoords.join(',')}</div>}
        {dropoffCoords && <div data-testid="google-dropoff">{dropoffCoords.join(',')}</div>}
        {transporterLocation && (
          <div data-testid="google-transporter">
            {transporterLocation.latitude},{transporterLocation.longitude}
          </div>
        )}
        <button
          data-testid="simulate-google-load-error"
          onClick={() => onLoadError?.('Google Maps Script Network Timeout')}
        >
          Simulate Error
        </button>
        <button
          data-testid="simulate-google-map-click"
          onClick={() => onMapClick?.([18.5204, 73.8567])}
        >
          Simulate Map Click
        </button>
      </div>
    );
  },
}));

describe('MapView Architecture — Role-Based Provider Selection & Automatic Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('1. Requester Dashboard: loads Google Maps as primary provider when API key is configured', () => {
    vi.spyOn(GoogleMapsConfigModule, 'getGoogleMapsApiKey').mockReturnValue('AIzaSyMockKeyForRequester123');
    vi.spyOn(GoogleMapsConfigModule, 'isGoogleMapsConfigured').mockReturnValue(true);

    render(
      <MapView
        role="requester"
        pickupCoords={[16.7445, 74.3753]}
        dropoffCoords={[16.8503, 74.5949]}
        pickupAddress="Hatkanangle Station"
        dropoffAddress="Sangli Market"
      />
    );

    // Google Maps is rendered
    expect(screen.getByTestId('google-map-view')).toBeDefined();
    expect(screen.getByText('Google Maps Active')).toBeDefined();
    expect(screen.getByTestId('google-pickup').textContent).toBe('16.7445,74.3753');
    expect(screen.getByTestId('google-dropoff').textContent).toBe('16.8503,74.5949');
  });

  it('2. Requester Dashboard: automatically falls back to Leaflet + OSM when API key is missing', () => {
    vi.spyOn(GoogleMapsConfigModule, 'getGoogleMapsApiKey').mockReturnValue('');
    vi.spyOn(GoogleMapsConfigModule, 'isGoogleMapsConfigured').mockReturnValue(false);

    render(
      <MapView
        role="requester"
        pickupCoords={[16.7445, 74.3753]}
        dropoffCoords={[16.8503, 74.5949]}
      />
    );

    // Google Maps is NOT rendered
    expect(screen.queryByTestId('google-map-view')).toBeNull();
    // Re-center button (from Leaflet UI) is rendered
    expect(screen.getByRole('button', { name: /re-center/i })).toBeDefined();
  });

  it('3. Requester Dashboard: automatically switches to Leaflet + OSM if Google Maps SDK throws a load error', async () => {
    vi.spyOn(GoogleMapsConfigModule, 'getGoogleMapsApiKey').mockReturnValue('AIzaSyMockKeyForRequester123');
    vi.spyOn(GoogleMapsConfigModule, 'isGoogleMapsConfigured').mockReturnValue(true);

    render(
      <MapView
        role="requester"
        pickupCoords={[16.7445, 74.3753]}
        dropoffCoords={[16.8503, 74.5949]}
      />
    );

    expect(screen.getByTestId('google-map-view')).toBeDefined();

    // Trigger SDK error
    fireEvent.click(screen.getByTestId('simulate-google-load-error'));

    // Should fall back to Leaflet automatically
    await waitFor(() => {
      expect(screen.queryByTestId('google-map-view')).toBeNull();
      expect(screen.getByRole('button', { name: /re-center/i })).toBeDefined();
    });
  });

  it('4. Transporter Dashboard: defaults strictly to Leaflet + OpenStreetMap even when Google key is present', () => {
    vi.spyOn(GoogleMapsConfigModule, 'getGoogleMapsApiKey').mockReturnValue('AIzaSyMockKeyForRequester123');
    vi.spyOn(GoogleMapsConfigModule, 'isGoogleMapsConfigured').mockReturnValue(true);

    render(
      <MapView
        role="transporter"
        engine="leaflet"
        allowEngineSwitch={false}
        pickupCoords={[18.5204, 73.8567]}
        dropoffCoords={[18.5500, 73.9000]}
        transporterLocation={{
          deliveryId: 'del-123',
          transporterId: 'usr-trans-1',
          latitude: 18.5300,
          longitude: 73.8700,
          updatedAt: new Date().toISOString(),
          speed: 8.5,
          heading: 90,
          accuracy: 10,
        }}
      />
    );

    // Google Maps is NOT rendered for Transporter
    expect(screen.queryByTestId('google-map-view')).toBeNull();
    // Leaflet map container is active
    expect(screen.getByRole('button', { name: /re-center/i })).toBeDefined();
  });

  it('5. Transporter Dashboard: never displays Google Maps Platform popup or prompt', () => {
    render(
      <MapView
        role="transporter"
        engine="leaflet"
        allowEngineSwitch={false}
      />
    );

    expect(screen.queryByText(/Enable Google Maps Platform/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/AIzaSy.../i)).toBeNull();
  });

  it('6. Forwards interactive map clicks correctly with coordinate tuple', () => {
    vi.spyOn(GoogleMapsConfigModule, 'getGoogleMapsApiKey').mockReturnValue('AIzaSyMockKeyForRequester123');
    vi.spyOn(GoogleMapsConfigModule, 'isGoogleMapsConfigured').mockReturnValue(true);

    const mockOnMapClick = vi.fn();

    render(
      <MapView
        role="requester"
        onMapClick={mockOnMapClick}
      />
    );

    const clickBtn = screen.getByTestId('simulate-google-map-click');
    fireEvent.click(clickBtn);

    expect(mockOnMapClick).toHaveBeenCalledWith([18.5204, 73.8567]);
  });
});
