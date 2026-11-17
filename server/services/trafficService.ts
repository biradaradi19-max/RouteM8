/**
 * RouteM8 Route Traffic Intelligence Service
 * 
 * Compares live traffic transit duration against normal free-flow duration
 * using verified traffic data providers (Google Maps Directions or TomTom).
 * 
 * Strict Rule: Only confirmed heavy traffic (>=35% delay & >=5 min detour) triggers surcharge.
 * Ordinary traffic or missing provider data falls back to normal base fare.
 */

export interface RouteTrafficReport {
  isHeavyTraffic: boolean;
  normalDurationSec?: number;
  trafficDurationSec?: number;
  delaySec?: number;
  delayRatio?: number;
  reason?: string;
  source: 'google-maps' | 'tomtom' | 'unavailable' | 'mock';
}

/**
 * Evaluates whether traffic condition qualifies as heavy congestion.
 * Requires at least a 35% time increase and at least 300 seconds (5 mins) delay.
 */
export function isHeavyTrafficCondition(normalDurationSec: number, trafficDurationSec: number): boolean {
  if (normalDurationSec <= 0 || trafficDurationSec <= 0) return false;
  const delaySec = trafficDurationSec - normalDurationSec;
  const ratio = trafficDurationSec / normalDurationSec;
  return ratio >= 1.35 && delaySec >= 300;
}

/**
 * Checks traffic via Google Maps Directions API if server key is configured.
 */
async function checkGoogleMapsTraffic(
  origin: [number, number],
  destination: [number, number],
  apiKey: string,
  timeoutMs: number = 3000
): Promise<RouteTrafficReport | null> {
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin[0]},${origin[1]}&destination=${destination[0]},${destination[1]}&departure_time=now&key=${apiKey}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data: any = await res.json();
    if (data.status === 'OK' && data.routes && data.routes[0]?.legs && data.routes[0].legs[0]) {
      const leg = data.routes[0].legs[0];
      const normalDurationSec = leg.duration?.value ?? 0;
      const trafficDurationSec = leg.duration_in_traffic?.value ?? normalDurationSec;
      const delaySec = Math.max(0, trafficDurationSec - normalDurationSec);
      const delayRatio = normalDurationSec > 0 ? trafficDurationSec / normalDurationSec : 1;

      const heavy = isHeavyTrafficCondition(normalDurationSec, trafficDurationSec);

      return {
        isHeavyTraffic: heavy,
        normalDurationSec,
        trafficDurationSec,
        delaySec,
        delayRatio: Number(delayRatio.toFixed(2)),
        reason: heavy
          ? `Additional charge: Heavy traffic along your delivery route (+${Math.round(delaySec / 60)} min delay).`
          : undefined,
        source: 'google-maps',
      };
    }
  } catch {
    // Network latency, timeout or API failure - gracefully ignore
  }
  return null;
}

/**
 * Checks traffic via TomTom Routing API if configured.
 */
async function checkTomTomTraffic(
  origin: [number, number],
  destination: [number, number],
  apiKey: string,
  timeoutMs: number = 3000
): Promise<RouteTrafficReport | null> {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin[0]},${origin[1]}:${destination[0]},${destination[1]}/json?traffic=true&key=${apiKey}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data: any = await res.json();
    if (data.routes && data.routes[0]?.summary) {
      const summary = data.routes[0].summary;
      const trafficDurationSec = summary.travelTimeInSeconds ?? 0;
      const delaySec = summary.trafficDelayInSeconds ?? 0;
      const normalDurationSec = Math.max(1, trafficDurationSec - delaySec);
      const delayRatio = normalDurationSec > 0 ? trafficDurationSec / normalDurationSec : 1;

      const heavy = isHeavyTrafficCondition(normalDurationSec, trafficDurationSec);

      return {
        isHeavyTraffic: heavy,
        normalDurationSec,
        trafficDurationSec,
        delaySec,
        delayRatio: Number(delayRatio.toFixed(2)),
        reason: heavy
          ? `Additional charge: Heavy traffic along your delivery route (+${Math.round(delaySec / 60)} min delay).`
          : undefined,
        source: 'tomtom',
      };
    }
  } catch {
    // Graceful fallback
  }
  return null;
}

/**
 * Checks route traffic against legitimate providers.
 * If no provider is available or traffic is normal, returns isHeavyTraffic: false.
 */
export async function checkRouteTraffic(
  origin: [number, number],
  destination: [number, number],
  timeoutMs: number = 3000
): Promise<RouteTrafficReport> {
  const googleKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (googleKey) {
    const googleReport = await checkGoogleMapsTraffic(origin, destination, googleKey, timeoutMs);
    if (googleReport) return googleReport;
  }

  const tomtomKey = (process.env.TOMTOM_API_KEY || '').trim();
  if (tomtomKey) {
    const tomtomReport = await checkTomTomTraffic(origin, destination, tomtomKey, timeoutMs);
    if (tomtomReport) return tomtomReport;
  }

  // Graceful fallback: No provider configured or queries timed out
  return {
    isHeavyTraffic: false,
    source: 'unavailable',
  };
}
