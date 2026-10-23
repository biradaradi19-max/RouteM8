/**
 * ============================================================================
 * ROUTE M8 — GLOBAL PLACES & LOCATION SEARCH SERVICE
 * Worldwide location search, Google Places (New) resolution, GPS reverse-geocoding.
 * Supports villages, cities, postcodes, landmarks, and addresses worldwide.
 * ============================================================================
 */

import { placesApi } from './api';
import { isValidCoordinate } from './geolocation';

export interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  types?: string[];
}

export interface ResolvedPlace {
  placeId: string;
  formattedAddress: string;
  name?: string;
  coords: [number, number]; // [lat, lng]
}

/**
 * Fetch genuine autocomplete predictions worldwide without regional restriction.
 * Optional GPS coordinates provide proximity search bias only when permitted.
 */
// Cache resolved coordinates from search predictions to eliminate Nominatim 429 rate limit errors
const placeCoordsCache = new Map<string, [number, number]>();

export async function searchGlobalPlaces(
  query: string,
  biasCoords?: [number, number] | null
): Promise<PlacePrediction[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  // 1. Try backend proxy (uses Google Places API New with Nominatim fallback)
  try {
    const suggestions = await placesApi.getAutocompleteSuggestions(cleanQuery, biasCoords);
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      return suggestions.map((s: any) => {
        const placeId = s.placeId || '';
        if (s.location && isValidCoordinate(s.location.lat, s.location.lng)) {
          placeCoordsCache.set(placeId, [s.location.lat, s.location.lng]);
        }
        return {
          placeId,
          description: s.description || s.mainText || '',
          mainText: s.mainText || s.description || '',
          secondaryText: s.secondaryText || '',
          types: s.types || [],
        };
      });
    }
  } catch (err) {
    console.warn('[Places Service] Backend proxy error, trying client fallback:', err);
  }

  // 2. Direct client fallback to OpenStreetMap Nominatim for worldwide locations (villages, towns, postcodes)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=7&addressdetails=1`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const items = await resp.json();
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any, idx: number) => {
          const mainText = item.name || item.display_name.split(',')[0];
          const parts = item.display_name.split(',');
          const secondaryText = parts.slice(1).join(',').trim();
          const placeId = `osm-${item.osm_type || 'node'}-${item.osm_id || idx}`;

          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          if (isValidCoordinate(lat, lng)) {
            placeCoordsCache.set(placeId, [lat, lng]);
          }

          return {
            placeId,
            description: item.display_name,
            mainText,
            secondaryText,
            types: [item.type || 'geocode'],
          };
        });
      }
    }
  } catch (err) {
    console.warn('[Places Service] Client fallback error:', err);
  }

  return [];
}

/**
 * Resolve a selected Place ID to verified latitude & longitude coordinates.
 */
export async function resolvePlaceCoordinates(
  placeId: string,
  fallbackAddress?: string
): Promise<ResolvedPlace | null> {
  if (!placeId) return null;

  // 0. Instant resolution from prediction cache (eliminates Nominatim rate limits)
  const cached = placeCoordsCache.get(placeId);
  if (cached && isValidCoordinate(cached[0], cached[1])) {
    return {
      placeId,
      formattedAddress: fallbackAddress || 'Selected Location',
      coords: cached,
    };
  }

  // 1. Try backend Place Details endpoint
  try {
    const details = await placesApi.getPlaceDetails(placeId);
    if (details && details.location) {
      const { lat, lng } = details.location;
      if (isValidCoordinate(lat, lng)) {
        placeCoordsCache.set(placeId, [lat, lng]);
        return {
          placeId: details.placeId || placeId,
          formattedAddress: details.formattedAddress || details.name || fallbackAddress || '',
          name: details.name,
          coords: [lat, lng],
        };
      }
    }
  } catch (err) {
    console.warn('[Places Service] Details resolution notice:', err);
  }

  // 2. If it's an OpenStreetMap ID, fetch details from Nominatim
  if (placeId.startsWith('osm-')) {
    const parts = placeId.split('-');
    const osmType = parts[1] === 'way' ? 'W' : parts[1] === 'relation' ? 'R' : 'N';
    const osmId = parts[2];

    try {
      const url = `https://nominatim.openstreetmap.org/details?osmtype=${osmType}&osmid=${osmId}&format=json`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (resp.ok) {
        const data = await resp.json();
        const lat = parseFloat(data.centroid?.coordinates?.[1] || data.lat);
        const lng = parseFloat(data.centroid?.coordinates?.[0] || data.lon);

        if (isValidCoordinate(lat, lng)) {
          placeCoordsCache.set(placeId, [lat, lng]);
          return {
            placeId,
            formattedAddress: data.localname || fallbackAddress || 'Selected Location',
            coords: [lat, lng],
          };
        }
      }
    } catch (err) {
      console.warn('[Places Service] OSM details fallback notice:', err);
    }
  }


  // 3. Fallback: text geocoding if address string provided
  if (fallbackAddress) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackAddress)}&limit=1`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (resp.ok) {
        const list = await resp.json();
        if (list.length > 0) {
          const lat = parseFloat(list[0].lat);
          const lng = parseFloat(list[0].lon);
          if (isValidCoordinate(lat, lng)) {
            return {
              placeId,
              formattedAddress: list[0].display_name,
              coords: [lat, lng],
            };
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Reverse geocode [lat, lng] into a clean human-readable address.
 */
export async function reverseGeocodeCoords(coords: [number, number]): Promise<string> {
  const [lat, lng] = coords;
  if (!isValidCoordinate(lat, lng)) {
    throw new Error('Invalid geographic coordinates');
  }

  // 1. Try backend reverse geocoding
  try {
    const addr = await placesApi.reverseGeocode(lat, lng);
    if (addr) return addr;
  } catch {
    // Fall through to client Nominatim
  }

  // 2. Client fallback
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (resp.ok) {
      const data = await resp.json();
      if (data.display_name) return data.display_name;
    }
  } catch (err) {
    console.warn('[Places Service] Reverse geocoding notice:', err);
  }

  return `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
