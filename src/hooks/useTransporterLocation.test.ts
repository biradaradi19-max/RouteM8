import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTransporterLocation } from './useTransporterLocation';
import { deliveriesApi } from '../services/api';
import * as socketService from '../services/socket';

vi.mock('../services/api', () => ({
  deliveriesApi: {
    getLatestLocation: vi.fn().mockResolvedValue(null),
    updateLocation: vi.fn().mockResolvedValue({ success: true }),
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
        15,
        10
      );
      expect(deliveriesApi.updateLocation).toHaveBeenCalledWith(
        'del-1',
        expect.objectContaining({
          latitude: 37.43,
          longitude: -122.17,
          heading: 180,
          speed: 15,
          accuracy: 10,
        })
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

  it('should auto-start GPS sharing when isTransporter and status is in_transit', async () => {
    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-auto-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isSharing).toBe(true);
      expect(mockWatchPosition).toHaveBeenCalled();
    });
  });

  it('should initialize immediately with initialLocation and detect staleness', async () => {
    const staleTime = new Date(Date.now() - 90000).toISOString(); // 90s ago
    const initial = {
      deliveryId: 'del-stale-1',
      transporterId: 'tr-1',
      latitude: 18.5204,
      longitude: 73.8567,
      updatedAt: staleTime,
    };

    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-stale-1',
        deliveryStatus: 'in_transit',
        isTransporter: false,
        initialLocation: initial,
      })
    );

    await waitFor(() => {
      expect(result.current.location).toEqual(initial);
      expect(result.current.isStale).toBe(true);
    });
  });

  it('should succeed silently via HTTP REST when socket is disconnected', async () => {
    vi.mocked(socketService.emitLocationUpdate).mockResolvedValueOnce({
      success: false,
      error: 'Socket disconnected',
    });
    vi.mocked(deliveriesApi.updateLocation).mockResolvedValueOnce({
      success: true,
      location: { latitude: 18.5204, longitude: 73.8567 },
    });

    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-serverless-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await waitFor(() => {
      expect(result.current.isSharing).toBe(true);
    });

    act(() => {
      watchCallback({
        coords: {
          latitude: 18.5204,
          longitude: 73.8567,
          heading: 90,
          speed: 12,
          accuracy: 5,
        },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(deliveriesApi.updateLocation).toHaveBeenCalled();
      // Should not surface socket error because HTTP succeeded
      expect(result.current.error).toBeNull();
    });
  });

  it('should reject coarse accuracy (> 1000m) and not broadcast false coordinates', async () => {
    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-coarse-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await act(async () => {
      await result.current.startSharing();
    });

    // Simulate coarse network/IP position (e.g. Pune IP fallback with 35,000m accuracy)
    act(() => {
      watchCallback({
        coords: {
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 35000, // 35 km
        },
        timestamp: Date.now(),
      });
    });

    // Should NOT broadcast coarse location
    expect(socketService.emitLocationUpdate).not.toHaveBeenCalled();
    expect(deliveriesApi.updateLocation).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Acquiring GPS satellite fix');

    // When real satellite fix arrives (e.g. Tondar with 12m accuracy)
    act(() => {
      watchCallback({
        coords: {
          latitude: 18.3325,
          longitude: 77.0821,
          accuracy: 12,
        },
        timestamp: Date.now() + 1000,
      });
    });

    await waitFor(() => {
      expect(result.current.location?.latitude).toBe(18.3325);
      expect(result.current.location?.longitude).toBe(77.0821);
      expect(result.current.error).toBeNull();
      expect(deliveriesApi.updateLocation).toHaveBeenCalledWith(
        'del-coarse-1',
        expect.objectContaining({
          latitude: 18.3325,
          longitude: 77.0821,
          accuracy: 12,
        })
      );
    });
  });

  it('should not abort sharing on transient timeout and should recover when GPS locks', async () => {
    const { result } = renderHook(() =>
      useTransporterLocation({
        deliveryId: 'del-timeout-1',
        deliveryStatus: 'in_transit',
        isTransporter: true,
      })
    );

    await act(async () => {
      await result.current.startSharing();
    });

    expect(result.current.isSharing).toBe(true);

    // Simulate transient timeout (code 3)
    act(() => {
      watchErrorCallback({
        code: 3,
        message: 'Timeout',
      });
    });

    // Crucial: isSharing remains TRUE and clearWatch is NOT called
    expect(result.current.isSharing).toBe(true);
    expect(mockClearWatch).not.toHaveBeenCalled();

    // Subsequent satellite acquisition succeeds
    act(() => {
      watchCallback({
        coords: {
          latitude: 18.3325,
          longitude: 77.0821,
          accuracy: 15,
        },
        timestamp: Date.now(),
      });
    });

    await waitFor(() => {
      expect(result.current.location?.latitude).toBe(18.3325);
      expect(result.current.location?.longitude).toBe(77.0821);
    });
  });
});
