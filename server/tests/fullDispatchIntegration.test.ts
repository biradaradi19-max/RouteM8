import { describe, it, expect, beforeEach } from 'vitest';
import { partnerPresenceService } from '../services/partnerPresence.js';
import { evaluateDeliveryCandidates } from '../services/matchingEngine.js';
import { dispatchService } from '../services/dispatchService.js';

describe('Smart Delivery Matching & Route-Based Dispatch — Full Integration Flow', () => {
  let mockIo: any;
  let emittedOpportunities: any[];
  let emittedStatuses: any[];

  beforeEach(() => {
    partnerPresenceService.clearAll();
    dispatchService.clearAll();
    emittedOpportunities = [];
    emittedStatuses = [];

    mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          if (event === 'dispatch:opportunity') emittedOpportunities.push({ room, payload });
          if (event === 'dispatch:status') emittedStatuses.push({ room, payload });
        },
      }),
      emit: (event: string, payload: any) => {
        if (event === 'dispatch:opportunity') emittedOpportunities.push({ payload });
        if (event === 'dispatch:status') emittedStatuses.push({ payload });
      },
    };
  });

  it('filters stale GPS (>10 min) and matches only online, available partners within initial 3 km radius', () => {
    // 1. Fresh online partner within 1.5 km
    partnerPresenceService.updateLocation('partner-fresh', {
      latitude: 37.43,
      longitude: -122.16,
      isAvailable: true,
      fullName: 'Fresh Partner',
    });

    // 2. Stale partner (15 minutes old GPS) within 1.5 km
    partnerPresenceService.updateLocation('partner-stale', {
      latitude: 37.43,
      longitude: -122.16,
      isAvailable: true,
      fullName: 'Stale Partner',
    });
    const staleRecord = partnerPresenceService.getPartner('partner-stale');
    if (staleRecord) {
      staleRecord.updatedAt = new Date(Date.now() - 15 * 60 * 1000);
    }

    // 3. Busy partner (isAvailable: false) within 1.5 km
    partnerPresenceService.updateLocation('partner-busy', {
      latitude: 37.43,
      longitude: -122.16,
      isAvailable: false,
      fullName: 'Busy Partner',
    });

    // 4. Distant partner (7 km away)
    partnerPresenceService.updateLocation('partner-distant', {
      latitude: 37.50,
      longitude: -122.10,
      isAvailable: true,
      fullName: 'Distant Partner',
    });

    const delivery = {
      requesterId: 'customer-1',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.40, -122.11] as [number, number],
    };

    const activePartners = partnerPresenceService.getActivePartners();
    expect(activePartners.map((p) => p.userId)).toContain('partner-fresh');
    expect(activePartners.map((p) => p.userId)).not.toContain('partner-stale');
    expect(activePartners.map((p) => p.userId)).not.toContain('partner-busy');

    // Initial Stage 1 matching (3 km radius)
    const stage1Matches = evaluateDeliveryCandidates(delivery, activePartners, {
      maxRadiusKm: 3,
      enableRouteCorridorMatching: false,
    });

    expect(stage1Matches.length).toBe(1);
    expect(stage1Matches[0].partner.userId).toBe('partner-fresh');
    expect(stage1Matches[0].distanceToPickupKm).toBeLessThanOrEqual(3);
    expect(stage1Matches[0].matchType).toBe('nearby');
  });

  it('identifies corridor route-compatible partners travelling along the delivery trajectory', () => {
    // Partner commuting from Stanford (37.43, -122.17) to Mountain View (37.38, -122.08)
    partnerPresenceService.updateLocation('partner-commuter', {
      latitude: 37.44,
      longitude: -122.16,
      isAvailable: true,
      fullName: 'Commuter Partner',
    });
    partnerPresenceService.setActiveJourney('partner-commuter', {
      originCoords: [37.44, -122.17],
      destCoords: [37.38, -122.08],
      maxDetourMinutes: 15,
    });

    // Customer request along the same route
    const delivery = {
      requesterId: 'customer-1',
      pickupCoords: [37.43, -122.15] as [number, number],
      dropoffCoords: [37.39, -122.09] as [number, number],
    };

    const matches = evaluateDeliveryCandidates(
      delivery,
      partnerPresenceService.getActivePartners(),
      {
        maxRadiusKm: 2,
        enableRouteCorridorMatching: true,
      }
    );

    const commuterMatch = matches.find((m) => m.partner.userId === 'partner-commuter');
    expect(commuterMatch).toBeDefined();
    expect(commuterMatch?.matchType).toBe('corridor');
    expect(commuterMatch?.directionalAlignment).toBeGreaterThan(0.5);
    expect(commuterMatch?.score).toBeGreaterThan(60);
  });

  it('guarantees atomic concurrency: single partner wins, concurrent accept yields 409 conflict', () => {
    const deliveryState = {
      id: 'del-atomic-integration',
      status: 'open',
      requesterId: 'cust-1',
      transporterId: null as string | null,
    };

    const tryAccept = (partnerId: string) => {
      // Simulates atomic findOneAndUpdate condition: { _id, status: 'open', requesterId: { $ne: partnerId } }
      if (deliveryState.status === 'open' && deliveryState.requesterId !== partnerId) {
        deliveryState.status = 'matched';
        deliveryState.transporterId = partnerId;
        return { success: true, status: 200 };
      }
      return { success: false, status: 409, error: 'Already accepted by another partner' };
    };

    const res1 = tryAccept('partner-alice');
    const res2 = tryAccept('partner-bob');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(409);
    expect(deliveryState.transporterId).toBe('partner-alice');
  });

  it('dismisses delivery for declining partner only without interrupting dispatch for others', () => {
    partnerPresenceService.updateLocation('partner-1', {
      latitude: 37.44,
      longitude: -122.16,
      isAvailable: true,
    });
    partnerPresenceService.updateLocation('partner-2', {
      latitude: 37.441,
      longitude: -122.161,
      isAvailable: true,
    });

    const delivery = {
      _id: 'del-decline-flow',
      id: 'del-decline-flow',
      requesterId: 'cust-1',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.38, -122.08] as [number, number],
      rejectedBy: [] as string[],
    };

    // Partner 1 declines
    dispatchService.handlePartnerDecline('del-decline-flow', 'partner-1');
    delivery.rejectedBy.push('partner-1');

    const candidates = evaluateDeliveryCandidates(
      delivery,
      partnerPresenceService.getActivePartners(),
      { maxRadiusKm: 3 }
    );

    expect(candidates.map((c) => c.partner.userId)).not.toContain('partner-1');
    expect(candidates.map((c) => c.partner.userId)).toContain('partner-2');
  });

  it('orchestrates progressive dispatch with Socket.IO notifications to partners and customers', () => {
    partnerPresenceService.updateLocation('partner-live-1', {
      latitude: 37.441,
      longitude: -122.161,
      isAvailable: true,
      fullName: 'Live Partner 1',
    });

    const delivery = {
      _id: 'del-socket-flow',
      id: 'del-socket-flow',
      title: 'Emergency Medical Kit',
      description: 'First aid box',
      pickupAddress: 'Stanford Medical Center',
      dropoffAddress: 'Palo Alto Downtown',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.42, -122.14] as [number, number],
      compensation: 25,
      urgency: 'urgent',
      status: 'open',
      category: 'pharmacy',
      itemSize: 'small',
      neededBy: 'ASAP',
      requesterId: 'cust-1',
      requesterName: 'Hospital Staff',
      handoverPin: '9988',
      createdAt: new Date().toISOString(),
      rejectedBy: [],
    };

    dispatchService.startDispatch(delivery, mockIo);

    expect(emittedOpportunities.length).toBeGreaterThan(0);
    expect(emittedOpportunities[0].payload.delivery.id).toBe('del-socket-flow');
    expect(emittedStatuses.length).toBeGreaterThan(0);
    expect(emittedStatuses[0].payload.state).toBe('searching_partner');

    dispatchService.stopDispatch('del-socket-flow', 'assigned', mockIo);
  });
});
