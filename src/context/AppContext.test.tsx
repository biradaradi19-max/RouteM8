import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp } from './AppContext';
import { deliveriesApi, journeysApi } from '../services/api';

// Mock AuthContext
vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    isAuthenticated: false,
  })),
}));

// Mock API service functions
vi.mock('../services/api', () => ({
  deliveriesApi: {
    getDeliveries: vi.fn().mockResolvedValue([]),
    createDelivery: vi.fn(),
    acceptDelivery: vi.fn(),
    startTransit: vi.fn(),
    verifyPin: vi.fn(),
    cancelDelivery: vi.fn(),
  },
  journeysApi: {
    getJourneys: vi.fn().mockResolvedValue([]),
    publishJourney: vi.fn(),
    deleteJourney: vi.fn(),
  },
  activitiesApi: {
    getActivities: vi.fn().mockResolvedValue([]),
  },
}));

describe('Route M8 AppContext — Empty Datasets & Backend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AppProvider>{children}</AppProvider>
  );

  it('1. should start with empty requests and journeys datasets by default', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.requests).toEqual([]);
    expect(result.current.journeys).toEqual([]);
    expect(result.current.selectedRequest).toBeNull();
    expect(result.current.selectedJourney).toBeNull();
    expect(result.current.activeMatch).toBeNull();
  });

  it('2. should reject createRequest when user is unauthenticated', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    await expect(
      result.current.createRequest({
        title: 'Package Delivery',
        description: 'Test description',
        category: 'essentials',
        pickupAddress: 'Palo Alto',
        pickupCoords: [37.44, -122.16],
        dropoffAddress: 'Mountain View',
        dropoffCoords: [37.38, -122.08],
        itemSize: 'small',
        compensation: 15,
        urgency: 'standard',
        neededBy: 'Today',
      })
    ).rejects.toThrow('Authentication required');

    expect(result.current.requests).toEqual([]);
  });

  it('3. should reject publishJourney when user is unauthenticated', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    await expect(
      result.current.publishJourney({
        vehicle: 'Toyota Prius',
        originAddress: 'Palo Alto',
        originCoords: [37.44, -122.16],
        destAddress: 'Mountain View',
        destCoords: [37.38, -122.08],
        departureTime: '18:00',
        maxDetourMinutes: 10,
        capacity: 'small',
      })
    ).rejects.toThrow('Authentication required');

    expect(result.current.journeys).toEqual([]);
  });

  it('4. should handle empty database responses cleanly when backend is configured', async () => {
    vi.mocked(deliveriesApi.getDeliveries).mockResolvedValueOnce([]);
    vi.mocked(journeysApi.getJourneys).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.requests).toEqual([]);
    expect(result.current.journeys).toEqual([]);
    expect(result.current.backendError).toBeNull();
  });

  it('5. should capture database query errors cleanly and expose them via backendError', async () => {
    vi.mocked(deliveriesApi.getDeliveries).mockRejectedValueOnce(
      new Error('Network connectivity timeout to database.')
    );

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.backendError).toBe('Network connectivity timeout to database.');
    expect(result.current.requests).toEqual([]);
  });

  it('6. should populate data and clear isLoadingData to false on successful response', async () => {
    const mockDelivery = {
      id: 'del-101',
      title: 'Lab Supplies',
      description: 'Campus reagents',
      category: 'campus-supplies' as const,
      pickupAddress: 'Stanford Lab',
      pickupCoords: [37.42, -122.16] as [number, number],
      dropoffAddress: 'Palo Alto Hospital',
      dropoffCoords: [37.44, -122.17] as [number, number],
      itemSize: 'small' as const,
      compensation: 20,
      urgency: 'standard' as const,
      neededBy: 'Today',
      status: 'open' as const,
      createdAt: '2026-10-24T00:00:00Z',
    };

    vi.mocked(deliveriesApi.getDeliveries).mockResolvedValueOnce([mockDelivery]);
    vi.mocked(journeysApi.getJourneys).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.requests).toHaveLength(1);
    expect(result.current.requests[0].id).toBe('del-101');
    expect(result.current.backendError).toBeNull();
  });

  it('7. should not re-trigger infinite fetch cycles when data is received', async () => {
    const mockDelivery = {
      id: 'del-102',
      title: 'Study Notes',
      description: 'Physics notes',
      category: 'campus-supplies' as const,
      pickupAddress: 'Stanford',
      pickupCoords: [37.42, -122.16] as [number, number],
      dropoffAddress: 'Menlo Park',
      dropoffCoords: [37.45, -122.18] as [number, number],
      itemSize: 'small' as const,
      compensation: 12,
      urgency: 'flexible' as const,
      neededBy: 'Tomorrow',
      status: 'open' as const,
      createdAt: '2026-10-24T00:00:00Z',
    };

    const getDeliveriesSpy = vi.mocked(deliveriesApi.getDeliveries).mockResolvedValue([mockDelivery]);
    vi.mocked(journeysApi.getJourneys).mockResolvedValue([]);

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    // Wait 300ms to guarantee no re-render trigger loop is occurring
    await new Promise((r) => setTimeout(r, 300));

    expect(getDeliveriesSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isLoadingData).toBe(false);
  });
});
