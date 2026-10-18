import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  calculateVectorAlignment,
  evaluateDeliveryCandidates,
} from '../services/matchingEngine.js';
import type { PartnerPresenceRecord } from '../services/partnerPresence.js';

describe('Matching Engine', () => {
  it('should calculate accurate Haversine distance in kilometers', () => {
    // Stanford to Palo Alto (~3.5 km)
    const d = calculateHaversineDistance([37.4275, -122.1697], [37.4418, -122.1601]);
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(4.0);
  });

  it('should calculate directional vector cosine alignment correctly', () => {
    // Both heading East-North-East
    const alignmentAligned = calculateVectorAlignment([1, 1], [1, 1]);
    expect(alignmentAligned).toBeCloseTo(1.0, 2);

    // Opposite directions
    const alignmentOpposite = calculateVectorAlignment([1, 1], [-1, -1]);
    expect(alignmentOpposite).toBeCloseTo(-1.0, 2);

    // Perpendicular
    const alignmentPerp = calculateVectorAlignment([1, 0], [0, 1]);
    expect(alignmentPerp).toBeCloseTo(0, 2);
  });

  it('should rank nearby partner higher when closer to pickup and fresh GPS', () => {
    const delivery = {
      requesterId: 'cust-1',
      pickupCoords: [37.4418, -122.1601] as [number, number],
      dropoffCoords: [37.3861, -122.0839] as [number, number],
    };

    const partners: PartnerPresenceRecord[] = [
      {
        userId: 'p-close',
        fullName: 'Close Driver',
        role: 'transporter',
        coords: [37.442, -122.16], // ~0.1 km away
        isAvailable: true,
        updatedAt: new Date(),
      },
      {
        userId: 'p-far',
        fullName: 'Far Driver',
        role: 'transporter',
        coords: [37.46, -122.14], // ~2.5 km away
        isAvailable: true,
        updatedAt: new Date(),
      },
    ];

    const matches = evaluateDeliveryCandidates(delivery, partners, { maxRadiusKm: 3 });
    expect(matches.length).toBe(2);
    expect(matches[0].partner.userId).toBe('p-close');
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });

  it('should reject corridor match if partner travels in opposite direction (Review Focus 1)', () => {
    const delivery = {
      requesterId: 'cust-1',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.50, -122.10] as [number, number], // Heading North-East
    };

    const partners: PartnerPresenceRecord[] = [
      {
        userId: 'p-opposite',
        fullName: 'Opposite Commuter',
        role: 'transporter',
        coords: [37.43, -122.17],
        isAvailable: true,
        updatedAt: new Date(),
        activeJourney: {
          originCoords: [37.50, -122.10],
          destCoords: [37.40, -122.20], // Opposite vector heading South-West
          maxDetourMinutes: 15,
        },
      },
    ];

    const matches = evaluateDeliveryCandidates(delivery, partners, {
      maxRadiusKm: 1.0,
      enableRouteCorridorMatching: true,
    });

    const oppositeMatch = matches.find((m) => m.partner.userId === 'p-opposite');
    if (oppositeMatch) {
      // Must not be classified as corridor match if opposite
      expect(oppositeMatch.matchType).not.toBe('corridor');
    }
  });

  it('should exclude partners in rejectedBy list', () => {
    const delivery = {
      requesterId: 'cust-1',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.45, -122.15] as [number, number],
      rejectedBy: ['p-declined'],
    };

    const partners: PartnerPresenceRecord[] = [
      {
        userId: 'p-declined',
        fullName: 'Declined Driver',
        role: 'transporter',
        coords: [37.441, -122.161],
        isAvailable: true,
        updatedAt: new Date(),
      },
    ];

    const matches = evaluateDeliveryCandidates(delivery, partners, { maxRadiusKm: 3 });
    expect(matches.length).toBe(0);
  });

  it('should exclude the delivery requester from candidate matches', () => {
    const delivery = {
      requesterId: 'cust-same-user',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.45, -122.15] as [number, number],
    };

    const partners: PartnerPresenceRecord[] = [
      {
        userId: 'cust-same-user',
        fullName: 'Same Person',
        role: 'both',
        coords: [37.44, -122.16],
        isAvailable: true,
        updatedAt: new Date(),
      },
    ];

    const matches = evaluateDeliveryCandidates(delivery, partners, { maxRadiusKm: 3 });
    expect(matches.length).toBe(0);
  });
});
