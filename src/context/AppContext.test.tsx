import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp } from './AppContext';
import * as supabaseService from '../services/supabase';

// Mock AuthContext
vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: null,
    isAuthenticated: false,
  })),
}));

// Mock Supabase service functions
vi.mock('../services/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof supabaseService>();
  return {
    ...actual,
    isSupabaseConfigured: false,
    fetchDeliveryRequestsFromDb: vi.fn(),
    fetchPublishedJourneysFromDb: vi.fn(),
    createDeliveryRequestInDb: vi.fn(),
    createPublishedJourneyInDb: vi.fn(),
    updateDeliveryRequestStatusInDb: vi.fn(),
  };
});

describe('Route M8 AppContext — Empty Datasets & Unconfigured Backend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseService as any).isSupabaseConfigured = false;
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

  it('4. should handle empty database responses cleanly when Supabase is configured', async () => {
    (supabaseService as any).isSupabaseConfigured = true;
    (supabaseService.fetchDeliveryRequestsFromDb as any).mockResolvedValue({
      data: [],
      error: null,
    });
    (supabaseService.fetchPublishedJourneysFromDb as any).mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.requests).toEqual([]);
    expect(result.current.journeys).toEqual([]);
    expect(result.current.backendError).toBeNull();
  });

  it('5. should capture database query errors cleanly and expose them via backendError', async () => {
    (supabaseService as any).isSupabaseConfigured = true;
    (supabaseService.fetchDeliveryRequestsFromDb as any).mockResolvedValue({
      data: [],
      error: 'Network connectivity timeout to database.',
    });
    (supabaseService.fetchPublishedJourneysFromDb as any).mockResolvedValue({
      data: [],
      error: null,
    });

    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoadingData).toBe(false);
    });

    expect(result.current.backendError).toBe('Network connectivity timeout to database.');
    expect(result.current.requests).toEqual([]);
  });
});
