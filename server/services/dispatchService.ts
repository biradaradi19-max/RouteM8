import { partnerPresenceService } from './partnerPresence.js';
import { evaluateDeliveryCandidates } from './matchingEngine.js';

export type DispatchStageState =
  | 'idle'
  | 'searching_partner'
  | 'expanding_search'
  | 'partner_assigned'
  | 'no_partner_available'
  | 'cancelled';

export interface DispatchJob {
  requestId: string;
  delivery: any;
  currentStage: number;
  state: DispatchStageState;
  notifiedPartnerIds: Set<string>;
  timeouts: NodeJS.Timeout[];
}

export class DispatchService {
  private jobs = new Map<string, DispatchJob>();

  /**
   * Start progressive multi-stage dispatch worker for a delivery request
   */
  startDispatch(delivery: any, io: any, stageIntervalMs = 12000): void {
    const requestId = delivery._id?.toString() || delivery.id;
    if (!requestId) return;

    // Clear any pre-existing job for this delivery
    this.stopDispatch(requestId, 'cancelled');

    const job: DispatchJob = {
      requestId,
      delivery,
      currentStage: 1,
      state: 'searching_partner',
      notifiedPartnerIds: new Set<string>(),
      timeouts: [],
    };

    this.jobs.set(requestId, job);

    // =========================================================================
    // Stage 1 (T = 0s): Initial nearby search within 3 km pickup radius
    // =========================================================================
    this.executeStage(job, 1, 3, false, io);

    // =========================================================================
    // Stage 2 (T = 10-15s): Expand to 6 km + route corridor matching
    // =========================================================================
    const t2 = setTimeout(() => {
      if (job.state === 'partner_assigned' || job.state === 'cancelled') return;
      job.currentStage = 2;
      job.state = 'expanding_search';
      this.executeStage(job, 2, 6, true, io);
    }, stageIntervalMs);
    job.timeouts.push(t2);

    // =========================================================================
    // Stage 3 (T = 20-30s): Expand to 10 km maximum configured radius
    // =========================================================================
    const t3 = setTimeout(() => {
      if (job.state === 'partner_assigned' || job.state === 'cancelled') return;
      job.currentStage = 3;
      job.state = 'expanding_search';
      this.executeStage(job, 3, 10, true, io);
    }, stageIntervalMs * 2);
    job.timeouts.push(t3);

    // =========================================================================
    // Stage 4 (T = 35-45s): Exhausted window -> notify "no_partner_available"
    // =========================================================================
    const t4 = setTimeout(() => {
      if (job.state === 'partner_assigned' || job.state === 'cancelled') return;
      job.state = 'no_partner_available';
      if (io) {
        io.to(`delivery:${requestId}`).emit('dispatch:status', {
          deliveryId: requestId,
          state: 'no_partner_available',
          message: 'No delivery partner currently available in this radius. You can expand budget or retry.',
        });
        io.emit('dispatch:status', {
          deliveryId: requestId,
          state: 'no_partner_available',
        });
      }
    }, Math.round(stageIntervalMs * 3.2));
    job.timeouts.push(t4);
  }

  /**
   * Execute single dispatch stage: evaluate candidates, notify partners, update status
   */
  private executeStage(
    job: DispatchJob,
    stageNumber: number,
    radiusKm: number,
    enableCorridors: boolean,
    io: any
  ): void {
    const partners = partnerPresenceService.getActivePartners();
    const candidates = evaluateDeliveryCandidates(
      {
        requesterId: job.delivery.requesterId,
        pickupCoords: job.delivery.pickupCoords,
        dropoffCoords: job.delivery.dropoffCoords,
        rejectedBy: job.delivery.rejectedBy,
      },
      partners,
      {
        maxRadiusKm: radiusKm,
        enableRouteCorridorMatching: enableCorridors,
        excludedPartnerIds: Array.from(job.notifiedPartnerIds),
      }
    );

    // Emit opportunities to newly identified candidates without duplicates
    for (const match of candidates) {
      job.notifiedPartnerIds.add(match.partner.userId);

      const opportunityPayload = {
        delivery: job.delivery,
        matchType: match.matchType,
        distanceToPickupKm: match.distanceToPickupKm,
        estimatedEtaMinutes: match.estimatedEtaMinutes,
        score: match.score,
        directionalAlignment: match.directionalAlignment,
        stage: stageNumber,
      };

      if (io) {
        // Direct socket room emission
        io.to(`partner:${match.partner.userId}`).emit('dispatch:opportunity', opportunityPayload);
        // Also emit general opportunity for partners listening globally on their dashboard
        io.emit('dispatch:opportunity', opportunityPayload);
      }
    }

    // Emit progressive dispatch state to customer
    if (io) {
      io.to(`delivery:${job.requestId}`).emit('dispatch:status', {
        deliveryId: job.requestId,
        state: job.state,
        stage: stageNumber,
        radiusKm,
        candidateCount: candidates.length,
      });
      io.emit('dispatch:status', {
        deliveryId: job.requestId,
        state: job.state,
        stage: stageNumber,
        radiusKm,
      });
    }
  }

  /**
   * Stop dispatching (when accepted, cancelled, or expired) and clear all timers
   */
  stopDispatch(requestId: string, reason: 'assigned' | 'cancelled' | 'expired' = 'assigned', io?: any): void {
    const job = this.jobs.get(requestId);
    if (!job) return;

    for (const timeout of job.timeouts) {
      clearTimeout(timeout);
    }
    job.timeouts = [];

    job.state =
      reason === 'assigned'
        ? 'partner_assigned'
        : reason === 'cancelled'
        ? 'cancelled'
        : 'no_partner_available';

    if (io) {
      io.to(`delivery:${requestId}`).emit('dispatch:status', {
        deliveryId: requestId,
        state: job.state,
        reason,
      });
      io.emit('dispatch:status', {
        deliveryId: requestId,
        state: job.state,
        reason,
      });
    }
  }

  /**
   * Partner declines: record in rejection list so they are excluded from further stages
   */
  handlePartnerDecline(requestId: string, partnerId: string): void {
    const job = this.jobs.get(requestId);
    if (job) {
      if (!job.delivery.rejectedBy) job.delivery.rejectedBy = [];
      if (!job.delivery.rejectedBy.includes(partnerId)) {
        job.delivery.rejectedBy.push(partnerId);
      }
      job.notifiedPartnerIds.add(partnerId);
    }
  }

  getJob(requestId: string): DispatchJob | undefined {
    return this.jobs.get(requestId);
  }

  clearAll(): void {
    for (const job of this.jobs.values()) {
      for (const t of job.timeouts) clearTimeout(t);
    }
    this.jobs.clear();
  }
}

export const dispatchService = new DispatchService();
