import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dispatchService } from '../services/dispatchService.js';
import { partnerPresenceService } from '../services/partnerPresence.js';

describe('DispatchService Progressive Engine', () => {
  let mockIo: any;
  let emittedEvents: Array<{ room?: string; event: string; payload: any }>;

  beforeEach(() => {
    vi.useFakeTimers();
    partnerPresenceService.clearAll();
    emittedEvents = [];
    mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        },
      }),
      emit: (event: string, payload: any) => {
        emittedEvents.push({ event, payload });
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should immediately trigger Stage 1 dispatch (3 km radius) and notify nearby partner', () => {
    partnerPresenceService.updateLocation('partner-nearby', {
      latitude: 37.4418,
      longitude: -122.1601,
      isAvailable: true,
      fullName: 'Nearby Partner',
    });

    const delivery = {
      _id: 'del-101',
      id: 'del-101',
      requesterId: 'cust-1',
      pickupCoords: [37.4418, -122.1601] as [number, number],
      dropoffCoords: [37.3861, -122.0839] as [number, number],
      title: 'Lab Notebook',
      compensation: 25,
    };

    dispatchService.startDispatch(delivery, mockIo, 10000);

    const job = dispatchService.getJob('del-101');
    expect(job).toBeDefined();
    expect(job?.state).toBe('searching_partner');
    expect(job?.currentStage).toBe(1);

    // Verify opportunity emitted to partner
    const opp = emittedEvents.find((e) => e.event === 'dispatch:opportunity');
    expect(opp).toBeDefined();
    expect(opp?.payload?.delivery?.id).toBe('del-101');
  });

  it('should expand to Stage 2 (6 km) after stage interval without duplicate notifications', () => {
    partnerPresenceService.updateLocation('partner-nearby', {
      latitude: 37.4418,
      longitude: -122.1601,
      isAvailable: true,
    });
    partnerPresenceService.updateLocation('partner-stage2', {
      latitude: 37.47,
      longitude: -122.14, // ~3.5 km away (outside 3km, inside 6km)
      isAvailable: true,
    });

    const delivery = {
      _id: 'del-102',
      id: 'del-102',
      requesterId: 'cust-1',
      pickupCoords: [37.4418, -122.1601] as [number, number],
      dropoffCoords: [37.3861, -122.0839] as [number, number],
      title: 'Groceries',
      compensation: 18,
    };

    dispatchService.startDispatch(delivery, mockIo, 10000);
    expect(dispatchService.getJob('del-102')?.notifiedPartnerIds.has('partner-nearby')).toBe(true);
    expect(dispatchService.getJob('del-102')?.notifiedPartnerIds.has('partner-stage2')).toBe(false);

    // Fast-forward 10 seconds to Stage 2
    vi.advanceTimersByTime(10500);

    const job = dispatchService.getJob('del-102');
    expect(job?.currentStage).toBe(2);
    expect(job?.notifiedPartnerIds.has('partner-stage2')).toBe(true);
  });

  it('should clear all timers and stop dispatching when request is accepted or cancelled (Review Focus 5)', () => {
    partnerPresenceService.updateLocation('p-1', {
      latitude: 37.44,
      longitude: -122.16,
      isAvailable: true,
    });

    const delivery = {
      _id: 'del-103',
      id: 'del-103',
      requesterId: 'cust-1',
      pickupCoords: [37.44, -122.16] as [number, number],
      dropoffCoords: [37.38, -122.08] as [number, number],
      title: 'Blueprint',
      compensation: 20,
    };

    dispatchService.startDispatch(delivery, mockIo, 10000);
    dispatchService.stopDispatch('del-103', 'assigned', mockIo);

    const job = dispatchService.getJob('del-103');
    expect(job?.state).toBe('partner_assigned');
    expect(job?.timeouts.length).toBe(0);

    // Advancing timers should not cause any further dispatch stages
    vi.advanceTimersByTime(50000);
    expect(job?.currentStage).toBe(1);
  });
});
