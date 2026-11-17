/**
 * RouteM8 Route Weather Intelligence Service
 * 
 * Uses Open-Meteo (open, free, legitimate real-time weather API)
 * to verify precipitation and WMO weather codes along delivery corridors.
 * 
 * Strict Rule: Only confirmed heavy rain triggers a surcharge.
 * Light/moderate rain and ordinary weather do NOT trigger surcharges.
 * If weather API is unavailable, gracefully fall back to base fare.
 */

export interface WeatherSample {
  lat: number;
  lng: number;
  weatherCode: number;
  precipitationMmPerHour: number;
  time?: string;
}

export interface RouteWeatherReport {
  isHeavyRain: boolean;
  weatherCode?: number;
  precipitationMmPerHour?: number;
  reason?: string;
  checkedPoints: WeatherSample[];
  source: 'open-meteo' | 'unavailable' | 'mock';
}

/**
 * WMO Weather Codes identifying heavy/violent rain:
 * 65: Heavy rain, continuous
 * 82: Violent rain showers
 * 95: Thunderstorm (heavy if precipitation >= 4.0 mm/h)
 * 96: Thunderstorm with slight and heavy hail
 * 99: Thunderstorm with heavy hail
 * 
 * Meteorological standard: Heavy rain is defined as precipitation >= 7.5 mm/h.
 */
export function isHeavyRainCondition(weatherCode: number, precipitationMmPerHour: number): boolean {
  if (precipitationMmPerHour >= 7.5) {
    return true;
  }
  if ([65, 82, 96, 99].includes(weatherCode)) {
    return true;
  }
  if (weatherCode === 95 && precipitationMmPerHour >= 4.0) {
    return true;
  }
  return false;
}

/**
 * Fetches real-time weather at a specific coordinate from Open-Meteo with a strict 3-second timeout.
 */
export async function fetchCoordinateWeather(
  lat: number,
  lng: number,
  timeoutMs: number = 3000
): Promise<WeatherSample | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain,weather_code`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    if (data && data.current) {
      return {
        lat,
        lng,
        weatherCode: Number(data.current.weather_code ?? 0),
        precipitationMmPerHour: Number(data.current.precipitation ?? data.current.rain ?? 0),
        time: data.current.time,
      };
    }
  } catch {
    // Network latency, timeout or API failure - gracefully ignore
  }
  return null;
}

/**
 * Checks weather along the route: origin, midpoint, and destination.
 */
export async function checkRouteWeather(
  origin: [number, number],
  destination: [number, number],
  timeoutMs: number = 3000
): Promise<RouteWeatherReport> {
  const midpoint: [number, number] = [
    (origin[0] + destination[0]) / 2,
    (origin[1] + destination[1]) / 2,
  ];

  const pointsToCheck: [number, number][] = [origin, midpoint, destination];

  try {
    const samples = await Promise.all(
      pointsToCheck.map(([lat, lng]) => fetchCoordinateWeather(lat, lng, timeoutMs))
    );

    const validSamples = samples.filter((s): s is WeatherSample => s !== null);

    if (validSamples.length === 0) {
      return {
        isHeavyRain: false,
        checkedPoints: [],
        source: 'unavailable',
      };
    }

    // Check if any point along the route experiences heavy rain
    const heavyRainSample = validSamples.find(s => isHeavyRainCondition(s.weatherCode, s.precipitationMmPerHour));

    if (heavyRainSample) {
      return {
        isHeavyRain: true,
        weatherCode: heavyRainSample.weatherCode,
        precipitationMmPerHour: heavyRainSample.precipitationMmPerHour,
        reason: `Additional charge: Heavy rain along your delivery route (${heavyRainSample.precipitationMmPerHour.toFixed(1)} mm/h).`,
        checkedPoints: validSamples,
        source: 'open-meteo',
      };
    }

    return {
      isHeavyRain: false,
      weatherCode: validSamples[0].weatherCode,
      precipitationMmPerHour: validSamples[0].precipitationMmPerHour,
      checkedPoints: validSamples,
      source: 'open-meteo',
    };
  } catch {
    return {
      isHeavyRain: false,
      checkedPoints: [],
      source: 'unavailable',
    };
  }
}
