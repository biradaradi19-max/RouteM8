export class PartnerPresenceService {
    partners = new Map();
    /**
     * Register or update partner live presence and GPS coordinate
     */
    updateLocation(userId, input) {
        const existing = this.partners.get(userId);
        const updated = {
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
    setAvailability(userId, isAvailable) {
        const existing = this.partners.get(userId);
        if (existing) {
            existing.isAvailable = isAvailable;
            existing.updatedAt = new Date();
        }
    }
    /**
     * Bind an active commuter journey for corridor route matching
     */
    setActiveJourney(userId, journey) {
        const existing = this.partners.get(userId);
        if (existing) {
            existing.activeJourney = journey;
        }
    }
    /**
     * Retrieve active, available partners whose GPS is within freshness window (default: 10 minutes = 600,000 ms)
     */
    getActivePartners(maxAgeMs = 10 * 60 * 1000) {
        const now = Date.now();
        const result = [];
        for (const record of this.partners.values()) {
            if (!record.isAvailable)
                continue;
            const ageMs = now - record.updatedAt.getTime();
            if (ageMs <= maxAgeMs) {
                result.push(record);
            }
        }
        return result;
    }
    getPartner(userId) {
        return this.partners.get(userId);
    }
    removePartner(userId) {
        this.partners.delete(userId);
    }
    clearAll() {
        this.partners.clear();
    }
}
export const partnerPresenceService = new PartnerPresenceService();
