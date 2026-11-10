import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateRequestModal } from './CreateRequestModal';
import * as geolocationService from '../../services/geolocation';
import * as placesService from '../../services/places';
import * as appContext from '../../context/AppContext';

vi.mock('./CreateRequestRouteMap', () => ({
  CreateRequestRouteMap: ({ onPickupCoordsChanged }: any) => (
    <div data-testid="route-map-mock">
      <button
        type="button"
        onClick={() => onPickupCoordsChanged?.([18.5314, 73.8446], 'FC Road, Shivajinagar, Pune')}
      >
        Simulate Map Pin Placement
      </button>
    </div>
  ),
}));

describe('CreateRequestModal Geolocation & Pickup Validation Suite', () => {
  const mockCreateRequest = vi.fn().mockResolvedValue({ id: 'del-new-101' });
  const mockSetCurrentView = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(appContext, 'useApp').mockReturnValue({
      createRequest: mockCreateRequest,
      setCurrentView: mockSetCurrentView,
    } as any);

    vi.spyOn(placesService, 'searchGlobalPlaces').mockResolvedValue([]);
    vi.spyOn(placesService, 'resolvePlaceCoordinates').mockResolvedValue(null);
    vi.spyOn(placesService, 'reverseGeocodeCoords').mockResolvedValue('Stanford Campus Bookstore, Stanford, CA');
    vi.spyOn(placesService, 'geocodeAddress').mockResolvedValue(null);
  });

  it('1. prevents submission and displays clear inline error when pickup location is empty', async () => {
    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    // Fill title and description
    fireEvent.change(screen.getByLabelText(/Item or Errand Title/i), { target: { value: 'Organic Chemistry Textbook' } });
    fireEvent.change(screen.getByLabelText(/Details & Handover Instructions/i), { target: { value: 'Leave at front desk' } });

    // Click submit with empty locations
    const submitBtn = screen.getByRole('button', { name: /Publish Delivery Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Pickup location is required/i)).toBeDefined();
    });

    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it('2. acquires device GPS and automatically populates pickup address via reverse geocoding', async () => {
    vi.spyOn(geolocationService, 'getCurrentPositionAsync').mockResolvedValue([37.4275, -122.1697]);
    vi.spyOn(placesService, 'reverseGeocodeCoords').mockResolvedValue('Tresidder Union, Stanford, CA 94305');

    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    // Click "Use My Current Location" on pickup input
    const locateBtn = screen.getByRole('button', { name: /Use My Current Location/i });
    fireEvent.click(locateBtn);

    await waitFor(() => {
      const pickupInput = screen.getByLabelText(/Pickup Location/i) as HTMLInputElement;
      expect(pickupInput.value).toBe('Tresidder Union, Stanford, CA 94305');
    });

    expect(screen.getByText(/Verified Coordinates: 37.4275, -122.1697/i)).toBeDefined();
  });

  it('3. displays clear inline message when GPS access is denied without blocking manual entry', async () => {
    vi.spyOn(geolocationService, 'getCurrentPositionAsync').mockRejectedValue(
      new Error('Location access was denied. Please allow location permissions in your browser address bar.')
    );

    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Use My Current Location/i }));

    await waitFor(() => {
      expect(screen.getByText(/Location access was denied/i)).toBeDefined();
    });

    // User can still manually type their address
    const pickupInput = screen.getByLabelText(/Pickup Location/i);
    fireEvent.change(pickupInput, { target: { value: 'Main Gate, Stanford University' } });
    expect((pickupInput as HTMLInputElement).value).toBe('Main Gate, Stanford University');
  });

  it('4. displays retryable error when GPS times out', async () => {
    vi.spyOn(geolocationService, 'getCurrentPositionAsync').mockRejectedValue(
      new Error('Location request timed out. Please click "Use My Current Location" to retry.')
    );

    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Use My Current Location/i }));

    await waitFor(() => {
      expect(screen.getByText(/Location request timed out/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry/i })).toBeDefined();
    });
  });

  it('5. allows selecting and updating pickup location by clicking or placing pin on map', async () => {
    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    // Click map pin simulation button
    const mapPinBtn = screen.getByRole('button', { name: /Simulate Map Pin Placement/i });
    fireEvent.click(mapPinBtn);

    await waitFor(() => {
      const pickupInput = screen.getByLabelText(/Pickup Location/i) as HTMLInputElement;
      expect(pickupInput.value).toBe('FC Road, Shivajinagar, Pune');
    });

    expect(screen.getByText(/Verified Coordinates: 18.5314, 73.8446/i)).toBeDefined();
  });

  it('6. auto-resolves coordinates for manually typed address and submits successfully', async () => {
    vi.spyOn(placesService, 'geocodeAddress').mockImplementation(async (addr: string) => {
      if (addr.includes('Stanford')) {
        return {
          placeId: 'osm-1',
          formattedAddress: 'Stanford Bookstore, Stanford, CA',
          coords: [37.4255, -122.1705],
        };
      }
      if (addr.includes('Palo Alto')) {
        return {
          placeId: 'osm-2',
          formattedAddress: 'University Ave, Palo Alto, CA',
          coords: [37.4445, -122.1615],
        };
      }
      return null;
    });

    render(<CreateRequestModal isOpen={true} onClose={mockOnClose} />);

    // Fill all form fields
    fireEvent.change(screen.getByLabelText(/Item or Errand Title/i), { target: { value: 'Calculus Notes' } });
    fireEvent.change(screen.getByLabelText(/Details & Handover Instructions/i), { target: { value: 'Meet outside library' } });
    fireEvent.change(screen.getByLabelText(/Pickup Location/i), { target: { value: 'Stanford Bookstore' } });
    fireEvent.change(screen.getByLabelText(/Destination \/ Dropoff Location/i), { target: { value: 'University Ave Palo Alto' } });

    const submitBtn = screen.getByRole('button', { name: /Publish Delivery Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreateRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Calculus Notes',
          description: 'Meet outside library',
          pickupAddress: 'Stanford Bookstore, Stanford, CA',
          pickupCoords: [37.4255, -122.1705],
          dropoffAddress: 'University Ave, Palo Alto, CA',
          dropoffCoords: [37.4445, -122.1615],
        })
      );
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockSetCurrentView).toHaveBeenCalledWith('matching');
    });
  });
});

