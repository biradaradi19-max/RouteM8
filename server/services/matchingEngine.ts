import type { PartnerPresenceRecord } from './partnerPresence.js';

export interface CandidateMatch {
  partner: PartnerPresenceRecord;
  matchType: 'nearby' | 'corridor';
  distanceToPickupKm: number;
  estimatedEtaMinutes: number;
  directionalAlignment?: number; // -1 to 1 cosine similarity
  detourMinutes?: number;
  score: number; // 0 to 100
}

export interface MatchOptions {
  maxRadiusKm: number;
  enableRouteCorridorMatching?: boolean;
  maxDetourMinutes?: number;
  excludedPartnerIds?: string[];
}

/**
 * Calculate distance in kilometers between two coords using Haversine formula
 */
export function calculateHaversineDistance(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Calculate 2D vector cosine alignment (dot product / (|v1|*|v2|))
 * Returns value between -1.0 (opposite) and +1.0 (same direction)
 */
export function calculateVectorAlignment(
  v1: [number, number],
  v2: [number, number]
): number {
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
  const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);

  if (mag1 < 1e-7 || mag2 < 1e-7) return 0;
  const cosTheta = dot / (mag1 * mag2);
  return Math.max(-1, Math.min(1, cosTheta));
}

/**
 * Evaluates candidate delivery partners against a delivery request using both
 * geographic proximity and direction-aware travel corridor routing.
 */
export function evaluateDeliveryCandidates(
  delivery: {
    requesterId: string;
    pickupCoords: [number, number];
    dropoffCoords: [number, number];
    rejectedBy?: string[];
  },
  partners: PartnerPresenceRecord[],
  options: MatchOptions
): CandidateMatch[] {
  const now = Date.now();
  const matches: CandidateMatch[] = [];

  const deliveryVector: [number, number] = [
    delivery.dropoffCoords[0] - delivery.pickupCoords[0],
    delivery.dropoffCoords[1] - delivery.pickupCoords[1],
  ];

  for (const partner of partners) {
    // 1. Invariants: Exclude requester and already-declined partners
    if (partner.userId === delivery.requesterId) continue;
    if (delivery.rejectedBy && delivery.rejectedBy.includes(partner.userId)) continue;
    if (options.excludedPartnerIds && options.excludedPartnerIds.includes(partner.userId)) continue;
    if (!partner.isAvailable) continue;

    const distToPickupKm = calculateHaversineDistance(partner.coords, delivery.pickupCoords);
    const estimatedEtaMinutes = Math.max(1, Math.round((distToPickupKm / 30) * 60)); // 30 km/h average city transit
    const ageMs = now - partner.updatedAt.getTime();
    const freshnessRatio = Math.max(0, 1 - ageMs / (10 * 60 * 1000));

    let isCorridorMatch = false;
    let alignment: number | undefined;
    let detourMinutes: number | undefined;

    // 2. Route Corridor Evaluation
    if (options.enableRouteCorridorMatching && partner.activeJourney) {
      const journey = partner.activeJourney;
      const journeyVector: [number, number] = [
        journey.destCoords[0] - journey.originCoords[0],
        journey.destCoords[1] - journey.originCoords[1],
      ];

      alignment = calculateVectorAlignment(deliveryVector, journeyVector);

      // Only consider corridor match if partner travels in general aligned direction (cos(θ) > 0.5)
      if (alignment > 0.5) {
        const dDirect = calculateHaversineDistance(journey.originCoords, journey.destCoords);
        const dDetour =
          calculateHaversineDistance(journey.originCoords, delivery.pickupCoords) +
          calculateHaversineDistance(delivery.pickupCoords, delivery.dropoffCoords) +
          calculateHaversineDistance(delivery.dropoffCoords, journey.destCoords);

        const detourKm = Math.max(0, dDetour - dDirect);
        detourMinutes = Math.round((detourKm / 35) * 60);
        const maxDetour = options.maxDetourMinutes || journey.maxDetourMinutes || 15;

        if (detourMinutes <= maxDetour) {
          isCorridorMatch = true;
        }
      }
    }

    // 3. Nearby Geographic Evaluation
    const isNearbyMatch = distToPickupKm <= options.maxRadiusKm;

    if (!isNearbyMatch && !isCorridorMatch) {
      continue;
    }

    // 4. Calculate Composite Ranking Score (0 to 100)
    let score = 50;
    let matchType: 'nearby' | 'corridor' = 'nearby';

    if (isCorridorMatch) {
      matchType = 'corridor';
      const detourScore = detourMinutes !== undefined ? Math.max(0, 1 - detourMinutes / 20) * 20 : 10;
      score = Math.round(55 + (alignment || 0) * 25 + detourScore);
    } else {
      const distScore = Math.max(0, 1 - distToPickupKm / options.maxRadiusKm) * 35;
      const freshnessScore = freshnessRatio * 15;
      score = Math.round(50 + distScore + freshnessScore);
    }

    score = Math.max(10, Math.min(99, score));

    matches.push({
      partner,
      matchType,
      distanceToPickupKm: distToPickupKm,
      estimatedEtaMinutes,
      directionalAlignment: alignment,
      detourMinutes,
      score,
    });
  }

  // Rank by highest score descending
  return matches.sort((a, b) => b.score - a.score);
}
