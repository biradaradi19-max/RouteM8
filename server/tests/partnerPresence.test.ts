import { describe, it, expect, beforeEach } from 'vitest';
import { partnerPresenceService } from '../services/partnerPresence.js';

describe('PartnerPresenceService', () => {
  beforeEach(() => {
    partnerPresenceService.clearAll();
  });

  it('should register and retrieve active partner with fresh location', () => {
    partnerPresenceService.updateLocation('partner-1', {
      latitude: 37.4418,
      longitude: -122.1601,
      heading: 90,
      speed: 12,
      isAvailable: true,
      fullName: 'John Driver',
    });

    const active = partnerPresenceService.getActivePartners();
    expect(active.length).toBe(1);
    expect(active[0].userId).toBe('partner-1');
    expect(active[0].coords).toEqual([37.4418, -122.1601]);
    expect(active[0].isAvailable).toBe(true);
  });

  it('should filter out partners with stale GPS location (> 10 minutes)', () => {
    partnerPresenceService.updateLocation('partner-stale', {
      latitude: 37.4418,
      longitude: -122.1601,
      isAvailable: true,
    });

    // Mock date to 11 minutes in the past
    const record = partnerPresenceService.getPartner('partner-stale');
    if (record) {
      record.updatedAt = new Date(Date.now() - 11 * 60 * 1000);
    }

    const active = partnerPresenceService.getActivePartners(10 * 60 * 1000);
    expect(active.find((p) => p.userId === 'partner-stale')).toBeUndefined();
  });

  it('should ignore unavailable partners', () => {
    partnerPresenceService.updateLocation('partner-busy', {
      latitude: 37.4418,
      longitude: -122.1601,
      isAvailable: false,
    });

    const active = partnerPresenceService.getActivePartners();
    expect(active.find((p) => p.userId === 'partner-busy')).toBeUndefined();
  });

  it('should support updating availability and removing partners cleanly', () => {
    partnerPresenceService.updateLocation('p-toggle', {
      latitude: 37.4,
      longitude: -122.1,
      isAvailable: true,
    });

    expect(partnerPresenceService.getActivePartners().length).toBe(1);

    partnerPresenceService.setAvailability('p-toggle', false);
    expect(partnerPresenceService.getActivePartners().length).toBe(0);

    partnerPresenceService.removePartner('p-toggle');
    expect(partnerPresenceService.getPartner('p-toggle')).toBeUndefined();
  });
});
