import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliveriesApi } from './api';

describe('deliveriesApi.getNearbyDeliveries', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = mockFetch;
  });

  it('queries /api/deliveries/nearby with lat, lng, and radiusKm', async () => {
    const mockDeliveries = [
      {
        id: 'del-1',
        title: 'Coffee Delivery',
        pickupDistanceKm: 1.2,
        pickupCoords: [37.42, -122.17],
        status: 'open',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockDeliveries),
    });

    const result = await deliveriesApi.getNearbyDeliveries({
      lat: 37.4275,
      lng: -122.1697,
      radiusKm: 10,
    });

    expect(result).toEqual(mockDeliveries);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/deliveries/nearby');
    expect(calledUrl).toContain('lat=37.4275');
    expect(calledUrl).toContain('lng=-122.1697');
    expect(calledUrl).toContain('radiusKm=10');
  });

  it('throws an error if backend returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Valid GPS latitude required' }),
    });

    await expect(
      deliveriesApi.getNearbyDeliveries({
        lat: 999,
        lng: -122.1697,
      })
    ).rejects.toThrow('Valid GPS latitude required');
  });
});
