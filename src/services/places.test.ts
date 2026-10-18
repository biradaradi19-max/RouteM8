import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchGlobalPlaces,
  resolvePlaceCoordinates,
  reverseGeocodeCoords,
} from './places';
import { placesApi } from './api';

describe('Global Location Search & Google Places (New) Service Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Worldwide Autocomplete Search (No California / India Restriction)', () => {
    it('should search global places and return genuine suggestions for "Atigre"', async () => {
      // Mock placesApi autocomplete returning genuine Atigre, Maharashtra, India
      vi.spyOn(placesApi, 'getAutocompleteSuggestions').mockResolvedValueOnce([
        {
          placeId: 'ChIJYUqIPgQDwTsR3gzY_7H8mIQ',
          description: 'Atigre, Maharashtra, India',
          mainText: 'Atigre',
          secondaryText: 'Maharashtra, India',
          types: ['locality', 'geocode', 'political'],
        },
        {
          placeId: 'ChIJZXZ5NwADwTsRbdLXdnJ42TU',
          description: 'Atigre phata, Atigre, Maharashtra, India',
          mainText: 'Atigre phata',
          secondaryText: 'Atigre, Maharashtra, India',
          types: ['point_of_interest', 'establishment'],
        },
      ]);

      const results = await searchGlobalPlaces('Atigre');

      expect(results.length).toBe(2);
      expect(results[0].mainText).toBe('Atigre');
      expect(results[0].secondaryText).toBe('Maharashtra, India');
      expect(results[0].description).toBe('Atigre, Maharashtra, India');
      expect(results[0].placeId).toBe('ChIJYUqIPgQDwTsR3gzY_7H8mIQ');
      // Ensure it is NOT a California address
      expect(results[0].description).not.toContain('California');
      expect(results[0].description).not.toContain('Stanford');
    });

    it('should return empty array for single-character or blank inputs without triggering network requests', async () => {
      const apiSpy = vi.spyOn(placesApi, 'getAutocompleteSuggestions');

      const res1 = await searchGlobalPlaces('');
      const res2 = await searchGlobalPlaces('   ');
      const res3 = await searchGlobalPlaces('A');

      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
      expect(res3).toEqual([]);
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('should pass optional user GPS bias coordinates to the search API', async () => {
      const apiSpy = vi.spyOn(placesApi, 'getAutocompleteSuggestions').mockResolvedValueOnce([
        {
          placeId: 'tokyo-station-1',
          description: 'Tokyo Station, Marunouchi, Chiyoda City, Tokyo, Japan',
          mainText: 'Tokyo Station',
          secondaryText: 'Chiyoda City, Tokyo, Japan',
        },
      ]);

      const userGps: [number, number] = [35.6812, 139.7671];
      const results = await searchGlobalPlaces('Tokyo', userGps);

      expect(apiSpy).toHaveBeenCalledWith('Tokyo', userGps);
      expect(results[0].mainText).toBe('Tokyo Station');
      expect(results[0].secondaryText).toContain('Tokyo, Japan');
    });
  });

  describe('2. Place ID Resolution to Real Geographic Coordinates', () => {
    it('should resolve genuine Place ID for Atigre into exact coordinates and formatted address', async () => {
      vi.spyOn(placesApi, 'getPlaceDetails').mockResolvedValueOnce({
        placeId: 'ChIJYUqIPgQDwTsR3gzY_7H8mIQ',
        formattedAddress: 'Atigre, Maharashtra, India',
        name: 'Atigre',
        location: {
          lat: 16.7413328,
          lng: 74.3675446,
        },
      });

      const resolved = await resolvePlaceCoordinates(
        'ChIJYUqIPgQDwTsR3gzY_7H8mIQ',
        'Atigre, Maharashtra, India'
      );

      expect(resolved).not.toBeNull();
      expect(resolved?.placeId).toBe('ChIJYUqIPgQDwTsR3gzY_7H8mIQ');
      expect(resolved?.formattedAddress).toBe('Atigre, Maharashtra, India');
      expect(resolved?.coords[0]).toBeCloseTo(16.7413, 2);
      expect(resolved?.coords[1]).toBeCloseTo(74.3675, 2);
    });

    it('should return null if Place ID is empty or invalid', async () => {
      const resolved = await resolvePlaceCoordinates('');
      expect(resolved).toBeNull();
    });
  });

  describe('3. Reverse Geocoding & Coordinate Validation', () => {
    it('should reverse geocode GPS coordinates into clean address', async () => {
      vi.spyOn(placesApi, 'reverseGeocode').mockResolvedValueOnce('Atigre, Kolhapur, Maharashtra, India');

      const address = await reverseGeocodeCoords([16.7413, 74.3675]);
      expect(address).toBe('Atigre, Kolhapur, Maharashtra, India');
    });

    it('should throw error when reverse geocoding invalid or non-finite coordinates', async () => {
      await expect(reverseGeocodeCoords([999, 999])).rejects.toThrow('Invalid geographic coordinates');
      await expect(reverseGeocodeCoords([NaN, 74.3675])).rejects.toThrow('Invalid geographic coordinates');
    });
  });
});
