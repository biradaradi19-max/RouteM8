import { Router } from 'express';
const router = Router();
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyBGd5npLdnbQRZSWyO6lhbo7FoiI02OmsY';
/**
 * GET /api/places/autocomplete
 * Worldwide autocomplete search supporting villages, cities, addresses, landmarks, postcodes.
 * Optional GPS bias (lat, lng) when user permits.
 */
router.get('/autocomplete', async (req, res) => {
    const input = String(req.query.input || '').trim();
    const latStr = req.query.lat ? String(req.query.lat) : null;
    const lngStr = req.query.lng ? String(req.query.lng) : null;
    if (!input) {
        res.json({ suggestions: [] });
        return;
    }
    // 1. Try Google Places API (New)
    try {
        const body = { input };
        // Optional GPS search bias only if valid coordinates passed
        if (latStr && lngStr) {
            const lat = parseFloat(latStr);
            const lng = parseFloat(lngStr);
            if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                body.locationBias = {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius: 50000.0, // 50km bias circle
                    },
                };
            }
        }
        const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
            },
            body: JSON.stringify(body),
        });
        if (response.ok) {
            const data = (await response.json());
            if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                const suggestions = data.suggestions
                    .filter((s) => s.placePrediction)
                    .map((s) => {
                    const p = s.placePrediction;
                    return {
                        placeId: p.placeId || p.place?.replace('places/', '') || '',
                        description: p.text?.text || p.structuredFormat?.mainText?.text || '',
                        mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
                        secondaryText: p.structuredFormat?.secondaryText?.text || '',
                        types: p.types || [],
                    };
                });
                res.json({ suggestions, source: 'google' });
                return;
            }
        }
        else {
            const errText = await response.text();
            console.warn('[Places API New] HTTP Error:', response.status, errText);
        }
    }
    catch (err) {
        console.warn('[Places API New] Error fetching suggestions:', err.message);
    }
    // 2. High-reliability Worldwide Fallback (OpenStreetMap Nominatim)
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=7&addressdetails=1`;
        const fallbackResp = await fetch(url, {
            headers: {
                'User-Agent': 'RouteM8-DeliveryApp/1.0',
                'Accept-Language': 'en',
            },
        });
        if (fallbackResp.ok) {
            const results = (await fallbackResp.json());
            if (Array.isArray(results) && results.length > 0) {
                const suggestions = results.map((item, idx) => {
                    const mainText = item.name || item.display_name.split(',')[0];
                    const parts = item.display_name.split(',');
                    const secondaryText = parts.slice(1).join(',').trim();
                    return {
                        placeId: `osm-${item.osm_type || 'node'}-${item.osm_id || idx}`,
                        description: item.display_name,
                        mainText,
                        secondaryText,
                        types: [item.type || 'geocode'],
                    };
                });
                res.json({ suggestions, source: 'nominatim' });
                return;
            }
        }
    }
    catch (err) {
        console.warn('[Places Fallback] Nominatim search notice:', err.message);
    }
    res.json({ suggestions: [] });
});
/**
 * GET /api/places/details
 * Resolves Place ID to verified latitude, longitude, and formatted address.
 */
router.get('/details', async (req, res) => {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) {
        res.status(400).json({ error: 'placeId is required' });
        return;
    }
    // 1. If it's a Google Place ID
    if (!placeId.startsWith('osm-')) {
        try {
            const cleanId = placeId.replace('places/', '');
            const url = `https://places.googleapis.com/v1/places/${cleanId}?fields=id,displayName,formattedAddress,location&key=${GOOGLE_MAPS_KEY}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = (await response.json());
                if (data.location && typeof data.location.latitude === 'number') {
                    const result = {
                        placeId: data.id || cleanId,
                        formattedAddress: data.formattedAddress || data.displayName?.text || '',
                        name: data.displayName?.text || '',
                        location: {
                            lat: data.location.latitude,
                            lng: data.location.longitude,
                        },
                    };
                    res.json(result);
                    return;
                }
            }
            else {
                const errText = await response.text();
                console.warn('[Places Details] Google API error:', response.status, errText);
            }
        }
        catch (err) {
            console.warn('[Places Details] Google API request error:', err.message);
        }
    }
    // 2. If it's an OSM ID or Google failed
    if (placeId.startsWith('osm-')) {
        const parts = placeId.split('-');
        const osmType = parts[1] === 'way' ? 'W' : parts[1] === 'relation' ? 'R' : 'N';
        const osmId = parts[2];
        try {
            const url = `https://nominatim.openstreetmap.org/details?osmtype=${osmType}&osmid=${osmId}&format=json`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RouteM8-DeliveryApp/1.0',
                    'Accept-Language': 'en',
                },
            });
            if (response.ok) {
                const data = (await response.json());
                const lat = parseFloat(data.centroid?.coordinates?.[1] || data.lat);
                const lng = parseFloat(data.centroid?.coordinates?.[0] || data.lon);
                if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                    res.json({
                        placeId,
                        formattedAddress: data.localname || data.names?.name || 'Selected Location',
                        name: data.localname || data.names?.name || '',
                        location: { lat, lng },
                    });
                    return;
                }
            }
        }
        catch (err) {
            console.warn('[Places Details] OSM details notice:', err.message);
        }
    }
    res.status(404).json({ error: 'Unable to resolve coordinates for this place ID' });
});
/**
 * GET /api/places/reverse-geocode
 * Resolves [lat, lng] into human-readable formatted address
 */
router.get('/reverse-geocode', async (req, res) => {
    const latStr = req.query.lat ? String(req.query.lat) : null;
    const lngStr = req.query.lng ? String(req.query.lng) : null;
    if (!latStr || !lngStr) {
        res.status(400).json({ error: 'lat and lng query parameters required' });
        return;
    }
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        res.status(400).json({ error: 'Coordinates out of valid earth bounds' });
        return;
    }
    // Try OpenStreetMap Nominatim for clean reverse geocoding
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&addressdetails=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'RouteM8-DeliveryApp/1.0',
                'Accept-Language': 'en',
            },
        });
        if (response.ok) {
            const data = (await response.json());
            if (data.display_name) {
                res.json({ formattedAddress: data.display_name, lat, lng });
                return;
            }
        }
    }
    catch (err) {
        console.warn('[ReverseGeocode] Nominatim notice:', err.message);
    }
    res.json({ formattedAddress: `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng });
});
export default router;
