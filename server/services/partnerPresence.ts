export interface PartnerPresenceRecord {
  userId: string;
  fullName: string;
  role: 'both' | 'transporter';
  coords: [number, number]; // [lat, lng]
  heading?: number;
  speed?: number;
  isAvailable: boolean;
  updatedAt: Date;
  socketId?: string;
  activeJourney?: {
    originCoords: [number, number];
    destCoords: [number, number];
    maxDetourMinutes: number;
  };
}

export interface PartnerLocationUpdateInput {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  isAvailable?: boolean;
  socketId?: string;
  fullName?: string;
  role?: 'both' | 'transporter';
}

export class PartnerPresenceService {
  private partners = new Map<string, PartnerPresenceRecord>();

  /**
   * Register or update partner live presence and GPS coordinate
   */
  updateLocation(userId: string, input: PartnerLocationUpdateInput): PartnerPresenceRecord {
    const existing = this.partners.get(userId);
    const updated: PartnerPresenceRecord = {
      userId,
      fullName: input.fullName || existing?.fullName || 'Delivery Partner',
      role: input.role || existing?.role || 'transporter',
      coords: [input.latitude, input.longitude],
      heading: typeof input.heading === 'number' ? input.heading : existing?.heading,
      speed: typeof input.speed === 'number' ? input.speed : existing?.speed,
      isAvailable: input.isAvailable !== undefined ? input.isAvailable : (existing?.isAvailable ?? true),
      updatedAt: new Date(),
      socketId: input.socketId || existing?.socketId,
      activeJourney: existing?.activeJourney,
    };

    this.partners.set(userId, updated);
    return updated;
  }

  /**
   * Update availability status (online/ready vs busy/offline)
   */
  setAvailability(userId: string, isAvailable: boolean): void {
    const existing = this.partners.get(userId);
    if (existing) {
      existing.isAvailable = isAvailable;
      existing.updatedAt = new Date();
    }
  }

  /**
   * Bind an active commuter journey for corridor route matching
   */
  setActiveJourney(
    userId: string,
    journey?: {
      originCoords: [number, number];
      destCoords: [number, number];
      maxDetourMinutes: number;
    }
  ): void {
    const existing = this.partners.get(userId);
    if (existing) {
      existing.activeJourney = journey;
    }
  }

  /**
   * Retrieve active, available partners whose GPS is within freshness window (default: 10 minutes = 600,000 ms)
   */
  getActivePartners(maxAgeMs = 10 * 60 * 1000): PartnerPresenceRecord[] {
    const now = Date.now();
    const result: PartnerPresenceRecord[] = [];

    for (const record of this.partners.values()) {
      if (!record.isAvailable) continue;
      const ageMs = now - record.updatedAt.getTime();
      if (ageMs <= maxAgeMs) {
        result.push(record);
      }
    }

    return result;
  }

  getPartner(userId: string): PartnerPresenceRecord | undefined {
    return this.partners.get(userId);
  }

  removePartner(userId: string): void {
    this.partners.delete(userId);
  }

  clearAll(): void {
    this.partners.clear();
  }
}

export const partnerPresenceService = new PartnerPresenceService();
