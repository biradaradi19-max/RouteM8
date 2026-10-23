import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePartnerDiscoveryLocation } from './usePartnerDiscoveryLocation';

describe('usePartnerDiscoveryLocation', () => {
  const originalGeolocation = navigator.geolocation;
  const originalPermissions = (navigator as any).permissions;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      configurable: true,
      writable: true,
    });
    if (originalPermissions) {
      Object.defineProperty(navigator, 'permissions', {
        value: originalPermissions,
        configurable: true,
        writable: true,
      });
    }
  });

  it('initializes and successfully retrieves real GPS coordinates', async () => {
    const mockGetCurrentPosition = vi.fn().mockImplementation((success) => {
      success({
        coords: {
          latitude: 37.4275,
          longitude: -122.1697,
          accuracy: 10,
        },
        timestamp: Date.now(),
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => usePartnerDiscoveryLocation());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe('ready');
      expect(result.current.coords).toEqual([37.4275, -122.1697]);
      expect(result.current.lastUpdated).not.toBeNull();
    });
    expect(mockGetCurrentPosition).toHaveBeenCalled();
  });

  it('handles permission denied (error code 1) and sets permission_denied status without fake coords', async () => {
    const mockGetCurrentPosition = vi.fn().mockImplementation((_, error) => {
      error({
        code: 1, // PERMISSION_DENIED
        message: 'User denied Geolocation',
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => usePartnerDiscoveryLocation());

    await waitFor(() => {
      expect(result.current.coords).toBeNull();
      expect(result.current.locationStatus).toBe('permission_denied');
      expect(result.current.statusLabel).toBe('Location permission required');
    });
  });

  it('handles position unavailable (error code 2) and sets unavailable status with retry label', async () => {
    const mockGetCurrentPosition = vi.fn().mockImplementation((_, error) => {
      error({
        code: 2, // POSITION_UNAVAILABLE
        message: 'GPS signal not found',
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => usePartnerDiscoveryLocation());

    await waitFor(() => {
      expect(result.current.coords).toBeNull();
      expect(result.current.locationStatus).toBe('unavailable');
      expect(result.current.statusLabel).toBe('Unable to get location — Retry');
    });
  });

  it('handles timeout (error code 3) and sets timeout status with retry label', async () => {
    const mockGetCurrentPosition = vi.fn().mockImplementation((_, error) => {
      error({
        code: 3, // TIMEOUT
        message: 'Geolocation timed out',
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => usePartnerDiscoveryLocation());

    await waitFor(() => {
      expect(result.current.coords).toBeNull();
      expect(result.current.locationStatus).toBe('timeout');
      expect(result.current.statusLabel).toBe('Unable to get location — Retry');
    });
  });

  it('allows manual refreshLocation to retry acquiring location', async () => {
    let callCount = 0;
    const mockGetCurrentPosition = vi.fn().mockImplementation((success, error) => {
      callCount++;
      if (callCount === 1) {
        error({ code: 3, message: 'Timeout' });
      } else {
        success({
          coords: { latitude: 37.4124, longitude: -122.1287 },
          timestamp: Date.now(),
        });
      }
    });

    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => usePartnerDiscoveryLocation());

    await waitFor(() => {
      expect(result.current.locationStatus).toBe('timeout');
    });

    await act(async () => {
      await result.current.refreshLocation();
    });

    await waitFor(() => {
      expect(result.current.locationStatus).toBe('ready');
      expect(result.current.coords).toEqual([37.4124, -122.1287]);
    });
  });
});
