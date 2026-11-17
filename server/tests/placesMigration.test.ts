// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';

describe('Server Places Route Key Migration & Fallback Tests', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Autocomplete Endpoint (/api/places/autocomplete)', () => {
    it('should return empty suggestions for blank input without errors', async () => {
      const res = await fetch(`${baseUrl}/api/places/autocomplete?input=`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data).toEqual({ suggestions: [] });
    });

    it('should gracefully fallback to Nominatim when GOOGLE_MAPS_API_KEY is not configured', async () => {
      // In this test environment, GOOGLE_MAPS_API_KEY is empty
      const res = await fetch(`${baseUrl}/api/places/autocomplete?input=London`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.suggestions)).toBe(true);
      if (data.suggestions.length > 0) {
        expect(data.source).toBe('nominatim');
        expect(data.suggestions[0].placeId).toMatch(/^osm-/);
      }
    });
  });

  describe('2. Details Endpoint (/api/places/details)', () => {
    it('should return 400 when placeId is missing', async () => {
      const res = await fetch(`${baseUrl}/api/places/details`);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('placeId is required');
    });

    it('should return 404 when non-OSM placeId is queried without Google server key', async () => {
      const res = await fetch(`${baseUrl}/api/places/details?placeId=non-osm-google-place-id`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as any;
      expect(data.error).toBe('Unable to resolve coordinates for this place ID');
    });
  });

  describe('3. Reverse Geocoding Endpoint (/api/places/reverse-geocode)', () => {
    it('should return 400 when lat or lng are omitted', async () => {
      const res = await fetch(`${baseUrl}/api/places/reverse-geocode?lat=18.5`);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('lat and lng query parameters required');
    });

    it('should return 400 when coordinates are out of Earth bounds', async () => {
      const res = await fetch(`${baseUrl}/api/places/reverse-geocode?lat=95&lng=200`);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBe('Coordinates out of valid earth bounds');
    });

    it('should successfully reverse geocode valid coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/places/reverse-geocode?lat=51.5074&lng=-0.1278`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.formattedAddress).toBeDefined();
      expect(typeof data.lat).toBe('number');
      expect(typeof data.lng).toBe('number');
    });
  });
});
