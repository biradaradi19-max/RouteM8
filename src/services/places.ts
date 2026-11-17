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

export const KNOWN_REGIONAL_FALLBACKS: Record<string, {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  types: string[];
  lat: number;
  lng: number;
}> = {
  atigre: {
    placeId: 'loc-atigre-kolhapur',
    description: 'Atigre, Hatkanangale, Kolhapur, Maharashtra 416118, India',
    mainText: 'Atigre',
    secondaryText: 'Hatkanangale, Kolhapur, Maharashtra, India',
    types: ['locality', 'political'],
    lat: 16.744566,
    lng: 74.360000,
  },
  'sanjay ghodawat university': {
    placeId: 'loc-sgu-atigre',
    description: 'Sanjay Ghodawat University, Kolhapur - Sangli Highway, Atigre, Maharashtra 416118, India',
    mainText: 'Sanjay Ghodawat University',
    secondaryText: 'Atigre, Kolhapur, Maharashtra, India',
    types: ['university', 'point_of_interest'],
    lat: 16.744540,
    lng: 74.383920,
  },
  hatkanangle: {
    placeId: 'loc-hatkanangle-kolhapur',
    description: 'Hatkanangle, Kolhapur, Maharashtra, India',
    mainText: 'Hatkanangle',
    secondaryText: 'Kolhapur, Maharashtra, India',
    types: ['locality', 'political'],
    lat: 16.744500,
    lng: 74.375300,
  },
  hatkanangale: {
    placeId: 'loc-hatkanangale-kolhapur',
    description: 'Hatkanangle, Kolhapur, Maharashtra, India',
    mainText: 'Hatkanangle',
    secondaryText: 'Kolhapur, Maharashtra, India',
    types: ['locality', 'political'],
    lat: 16.744500,
    lng: 74.375300,
  },
  majalgaon: {
    placeId: 'loc-majalgaon-beed',
    description: 'Majalgaon, Beed, Maharashtra, India',
    mainText: 'Majalgaon',
    secondaryText: 'Beed, Maharashtra, India',
    types: ['locality', 'political'],
    lat: 19.155100,
    lng: 76.209900,
  },
  sangli: {
    placeId: 'loc-sangli-maharashtra',
    description: 'Sangli, Maharashtra, India',
    mainText: 'Sangli',
    secondaryText: 'Maharashtra, India',
    types: ['locality', 'political'],
    lat: 16.850300,
    lng: 74.594900,
  },
};

/**
 * Fetch genuine autocomplete predictions worldwide without regional restriction.
 * Optional GPS coordinates provide proximity search bias only when permitted.
 */
const placeCoordsCache = new Map<string, [number, number]>();

async function safeJson<T = any>(resp: Response): Promise<T | null> {
  try {
    const text = await resp.text();
    if (!text || text.trim().length === 0) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function searchGlobalPlaces(
  query: string,
  biasCoords?: [number, number] | null
): Promise<PlacePrediction[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  // 0. Try browser Google Places AutocompleteService if Maps JS is loaded
  if (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteService) {
    try {
      const svc = new (window as any).google.maps.places.AutocompleteService();
      const req: any = { input: cleanQuery };
      if (biasCoords && isValidCoordinate(biasCoords[0], biasCoords[1])) {
        req.locationBias = {
          radius: 50000,
          center: { lat: biasCoords[0], lng: biasCoords[1] },
        };
      }
      const predictions: any[] = await new Promise((resolve) => {
        svc.getPlacePredictions(req, (results: any, status: any) => {
          if (status === 'OK' && Array.isArray(results) && results.length > 0) {
            resolve(results);
          } else {
            resolve([]);
          }
        });
      });
      if (predictions.length > 0) {
        return predictions.map((p: any) => ({
          placeId: p.place_id,
          description: p.description,
          mainText: p.structured_formatting?.main_text || p.description,
          secondaryText: p.structured_formatting?.secondary_text || '',
          types: p.types || [],
        }));
      }
    } catch (err) {
      console.warn('[Places Service] Browser Google Autocomplete notice:', err);
    }
  }

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
      const items = await safeJson<any[]>(resp);
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

  // 3. Known regional locations fallback (villages / hubs omitted by standard OSM nodes)
  const queryLower = cleanQuery.toLowerCase();
  for (const [key, fallback] of Object.entries(KNOWN_REGIONAL_FALLBACKS)) {
    if (queryLower.includes(key) || key.includes(queryLower)) {
      placeCoordsCache.set(fallback.placeId, [fallback.lat, fallback.lng]);
      return [
        {
          placeId: fallback.placeId,
          description: fallback.description,
          mainText: fallback.mainText,
          secondaryText: fallback.secondaryText,
          types: fallback.types,
        },
      ];
    }
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

  // 0. Known regional fallback place IDs
  if (placeId.startsWith('loc-')) {
    const match = Object.values(KNOWN_REGIONAL_FALLBACKS).find((item) => item.placeId === placeId);
    if (match) {
      placeCoordsCache.set(placeId, [match.lat, match.lng]);
      return {
        placeId: match.placeId,
        formattedAddress: match.description,
        name: match.mainText,
        coords: [match.lat, match.lng],
      };
    }
  }

  // 0b. Instant resolution from prediction cache (eliminates Nominatim rate limits)
  const cached = placeCoordsCache.get(placeId);
  if (cached && isValidCoordinate(cached[0], cached[1])) {
    return {
      placeId,
      formattedAddress: fallbackAddress || 'Selected Location',
      coords: cached,
    };
  }

  // 1. If running in browser with Google Maps Geocoder and this is a Google Place ID
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder && !placeId.startsWith('osm-')) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const resolved: ResolvedPlace | null = await new Promise((resolve) => {
        geocoder.geocode({ placeId }, (results: any, status: string) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
            resolve({
              placeId,
              formattedAddress: results[0].formatted_address || fallbackAddress || 'Selected Location',
              name: results[0].address_components?.[0]?.long_name,
              coords: [lat, lng],
            });
          } else {
            resolve(null);
          }
        });
      });
      if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
        placeCoordsCache.set(placeId, resolved.coords);
        return resolved;
      }
    } catch (err) {
      console.warn('[Places Service] Browser Geocoder notice:', err);
    }
  }

  // 2. Try backend Place Details endpoint
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
        const data = await safeJson<any>(resp);
        if (data) {
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
        const list = await safeJson<any[]>(resp);
        if (Array.isArray(list) && list.length > 0) {
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
 * Geocode a manually entered address string into verified coordinates.
 */
export async function geocodeAddress(address: string): Promise<ResolvedPlace | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  // 1. Check if first autocomplete prediction matches
  try {
    const list = await searchGlobalPlaces(trimmed);
    if (list.length > 0) {
      const resolved = await resolvePlaceCoordinates(list[0].placeId, list[0].description);
      if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
        return resolved;
      }
    }
  } catch {
    // fall through
  }

  // 2. Fallback direct Nominatim geocoding
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1`;
    const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (resp.ok) {
      const list = await safeJson<any[]>(resp);
      if (Array.isArray(list) && list.length > 0) {
        const lat = parseFloat(list[0].lat);
        const lng = parseFloat(list[0].lon);
        if (isValidCoordinate(lat, lng)) {
          return {
            placeId: `osm-${list[0].osm_type || 'node'}-${list[0].osm_id || '0'}`,
            formattedAddress: list[0].display_name,
            coords: [lat, lng],
          };
        }
      }
    }
  } catch (err) {
    console.warn('[Places Service] geocodeAddress fallback notice:', err);
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
      const data = await safeJson<any>(resp);
      if (data && data.display_name) return data.display_name;
    }
  } catch (err) {
    console.warn('[Places Service] Reverse geocoding notice:', err);
  }

  return `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
