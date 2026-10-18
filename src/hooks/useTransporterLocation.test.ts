import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransporterLocation } from './useTransporterLocation';
import { deliveriesApi } from '../services/api';
import * as socketService from '../services/socket';

vi.mock('../services/api', () => ({
  deliveriesApi: {
    getLatestLocation: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../services/socket', () => ({
  joinDeliveryRoom: vi.fn().mockResolvedValue(vi.fn()),
  emitLocationUpdate: vi.fn().mockResolvedValue({ success: true }),
}));

describe('useTransporterLocation Hook', () => {
  let mockWatchPosition: any;
  let mockClearWatch: any;
  let watchCallback: any;
  let watchErrorCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWatchPosition = vi.fn().mockImplementation((success, error) => {
      watchCallback = success;
      watchErrorCallback = error;
      return 101; // watch ID
    });

    mockClearWatch = vi.fn();

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // cleanup
  });

  it('should initialize with sharing disabled and fetch initial location', async () => {
    const mockInitial = {
      deliveryId: 'del-1',
      transporterId: 'tr-1',
      latitude: 37.4275,
      longitude: -122.1668,
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(deliveriesApi.getLatestLocation).mockResolvedValueOnce(mockInitial);

    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-1',
        deliveryStatus: 'in_transit',
        isTransporter: false,
      })
    );

    expect(result.current.isSharing).toBe(false);

    await waitFor(() => {
      expect(result.current.location).toEqual(mockInitial);
    });

    expect(socketService.joinDeliveryRoom).toHaveBeenCalledWith(
      'del-1',
      expect.objectContaining({ onLocation: expect.any(Function) })
    );
  });

  it('should start sharing GPS and broadcast position to database', async () => {
    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await act(async () => {
      await result.current.startSharing();
    });

    expect(result.current.isSharing).toBe(true);
    expect(mockWatchPosition).toHaveBeenCalled();

    // Simulate browser GPS coordinate reading
    act(() => {
      watchCallback({
        coords: {
          latitude: 37.43,
          longitude: -122.17,
          heading: 180,
          speed: 15,
          accuracy: 10,
        },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(socketService.emitLocationUpdate).toHaveBeenCalledWith(
        'del-1',
        37.43,
        -122.17,
        180,
        15
      );
    });

    expect(result.current.location?.latitude).toBe(37.43);
    expect(result.current.location?.longitude).toBe(-122.17);
  });

  it('should handle geolocation permission denied error', async () => {
    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await act(async () => {
      await result.current.startSharing();
    });

    // Simulate error
    act(() => {
      watchErrorCallback({
        code: 1, // PERMISSION_DENIED
        message: 'User denied',
        PERMISSION_DENIED: 1,
      });
    });

    expect(result.current.isSharing).toBe(false);
    expect(result.current.permissionState).toBe('denied');
    expect(result.current.error).toContain('Location access was denied');
    expect(mockClearWatch).toHaveBeenCalledWith(101);
  });

  it('should auto-stop sharing when delivery status changes to completed', async () => {
    const { result, rerender } = renderHook(
      (props: { currentStatus: 'in_transit' | 'completed' }) =>
        useTransporterLocation({
          deliveryId: 'del-1',
          deliveryStatus: props.currentStatus,
          isTransporter: true,
        }),
      { initialProps: { currentStatus: 'in_transit' as 'in_transit' | 'completed' } }
    );

    await act(async () => {
      await result.current.startSharing();
    });

    expect(result.current.isSharing).toBe(true);

    // Delivery is completed
    rerender({ currentStatus: 'completed' });

    expect(result.current.isSharing).toBe(false);
    expect(mockClearWatch).toHaveBeenCalledWith(101);
  });
});
