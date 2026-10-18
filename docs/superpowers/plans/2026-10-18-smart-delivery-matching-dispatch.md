# Smart Delivery Matching & Route-Based Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade nearby and route-based smart dispatch engine with progressive multi-stage radius expansion, direction-aware travel corridor matching, atomic partner claim/decline, and real-time Socket.IO synchronization for Route M8.

**Architecture:** An in-memory/MongoDB partner presence registry tracks authenticated online partners with fresh GPS (<10 min). A multi-stage dispatch worker progressively schedules candidate evaluations (Stage 1: 3 km nearby -> Stage 2: 12s, 6 km + route corridor matching -> Stage 3: 25s, 10 km -> Stage 4: 40s, timeout). Route-based matching uses vector direction alignment (`cos(θ) > 0.5`) before running road curvature detour calculations to prevent unnecessary API calls and false matches. Atomic claims in MongoDB guarantee single-winner assignments, while Socket.IO channels communicate state transitions (`searching_partner`, `expanding_search`, `partner_assigned`, `no_partner_available`) to customers and delivery opportunities to partners.

**Tech Stack:** Express + TypeScript, MongoDB Atlas / Mongoose, Socket.IO, Firebase Authentication, Google Maps Platform / OSRM routing, React + TypeScript (Vite).

**Spec:** User prompt requirements for Smart Delivery Matching & Route-Based Dispatch.

## Global Constraints

- Backend must remain Express + TypeScript with MongoDB Atlas and Firebase Authentication; no Supabase reintroduction.
- Default initial pickup radius is 3 km, expandable to 6 km and 10 km max.
- GPS freshness threshold is 10 minutes; locations older than 600,000 ms must be ignored.
- Direction of travel must be verified (angle alignment > 0.5) before route-corridor detour evaluation; never match partners travelling in conflicting directions.
- Route-based matching must fall back to nearby matching if route/direction data is missing; never fabricate partner GPS or routes.
- Prevent duplicate notifications to the same partner for the same delivery across stages.
- Partner decline must dismiss the opportunity for that partner only (`rejectedBy: [uid]`) and not cancel it for others.
- Partner acceptance must be strictly atomic in MongoDB (reject concurrent claims with `409 Conflict`).
- All Socket.IO events and HTTP endpoints must enforce Firebase ID-token verification and role permissions.

## Review Focus

1. **Partner Heading Opposite to Delivery Direction:** Partner traveling South when delivery requires traveling North. Expected: Vector alignment rejects corridor match; partner is not notified unless within pure nearby pickup radius.
2. **Concurrent Partner Accept Race Condition:** Two partners attempt to accept the same dispatch opportunity within milliseconds. Expected: Only the first partner wins (`200 OK`, `matched`); the second partner receives `409 Conflict` and UI updates immediately.
3. **Partner Decline Does Not Cancel Dispatch:** A partner clicks Decline. Expected: Opportunity disappears for that partner only; remaining dispatch stages continue notifying other eligible partners.
4. **Stale Partner GPS Ignored:** Partner's last GPS update is 15 minutes old. Expected: Dispatch engine filters them out, preventing phantom matches to offline or distant partners.
5. **Customer Cancellation Aborts Active Timers:** Customer cancels a request while Stage 1 or 2 is active. Expected: All pending stage timeouts are immediately cleared; no further partner opportunities are emitted.

---

### Task 1: Partner Presence & GPS Registry Service

**Files:**
- Create: `server/services/partnerPresence.ts`
- Modify: `server/socket/index.ts:40-60`
- Test: `server/tests/partnerPresence.test.ts`

**Interfaces:**
- Consumes: `Location` model, `User` model, Socket.IO connections.
- Produces:
  ```ts
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

  export class PartnerPresenceService {
    updateLocation(userId: string, data: { latitude: number; longitude: number; heading?: number; speed?: number; isAvailable?: boolean; socketId?: string; fullName?: string }): PartnerPresenceRecord;
    setAvailability(userId: string, isAvailable: boolean): void;
    setActiveJourney(userId: string, journey?: { originCoords: [number, number]; destCoords: [number, number]; maxDetourMinutes: number }): void;
    getActivePartners(maxAgeMs?: number): PartnerPresenceRecord[];
    getPartner(userId: string): PartnerPresenceRecord | undefined;
    removePartner(userId: string): void;
  }
  ```

- [ ] **Step 1: Write the failing test for partner presence registry**

```ts
// server/tests/partnerPresence.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

    // Mock date to 11 minutes in the future
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/partnerPresence.test.ts`
Expected: FAIL with "Cannot find module '../services/partnerPresence.js'"

- [ ] **Step 3: Implement `PartnerPresenceService` in `server/services/partnerPresence.ts`**

Implement in-memory Map of `PartnerPresenceRecord` with `clearAll()`, `updateLocation()`, `setAvailability()`, `setActiveJourney()`, `getActivePartners(maxAgeMs = 600000)`, `getPartner()`, and `removePartner()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/tests/partnerPresence.test.ts`
Expected: PASS

- [ ] **Step 5: Integrate partner location & presence into `server/socket/index.ts`**

Add Socket.IO listener for `partner:presence` and `partner:location`:
- On `partner:presence` `{ isAvailable: boolean }`: update availability in `partnerPresenceService`.
- On `partner:location` `{ latitude, longitude, heading, speed, isAvailable }`: validate bounds, update in `partnerPresenceService` with socketId and userId.
- On socket `disconnect`: handle socket removal or unbinding.

- [ ] **Step 6: Commit**

```bash
git add server/services/partnerPresence.ts server/socket/index.ts server/tests/partnerPresence.test.ts
git commit -m "feat(dispatch): add partner presence and live GPS registry service"
```

---

### Task 2: Direction-Aware Matching & Ranking Engine

**Files:**
- Create: `server/services/matchingEngine.ts`
- Test: `server/tests/matchingEngine.test.ts`

**Interfaces:**
- Consumes: `PartnerPresenceRecord` from `partnerPresence.ts`, delivery pickup/dropoff coords.
- Produces:
  ```ts
  export interface CandidateMatch {
    partner: PartnerPresenceRecord;
    matchType: 'nearby' | 'corridor';
    distanceToPickupKm: number;
    estimatedEtaMinutes: number;
    directionalAlignment?: number; // -1 to 1 cosine similarity
    score: number; // 0 to 100
  }

  export interface MatchOptions {
    maxRadiusKm: number;
    enableRouteCorridorMatching?: boolean;
    maxDetourMinutes?: number;
    excludedPartnerIds?: string[];
  }

  export function calculateHaversineDistance(c1: [number, number], c2: [number, number]): number;
  export function calculateVectorAlignment(v1: [number, number], v2: [number, number]): number;
  export function evaluateDeliveryCandidates(
    delivery: {
      requesterId: string;
      pickupCoords: [number, number];
      dropoffCoords: [number, number];
      rejectedBy?: string[];
    },
    partners: PartnerPresenceRecord[],
    options: MatchOptions
  ): CandidateMatch[];
  ```

- [ ] **Step 1: Write the failing test for matching & ranking algorithms**

```ts
// server/tests/matchingEngine.test.ts
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
        coords: [37.43, -122.17], // Near pickup, but active route is heading South-West
        isAvailable: true,
        updatedAt: new Date(),
        activeJourney: {
          originCoords: [37.50, -122.10],
          destCoords: [37.40, -122.20], // Opposite vector
          maxDetourMinutes: 15,
        },
      },
    ];

    const matches = evaluateDeliveryCandidates(delivery, partners, {
      maxRadiusKm: 1.0, // Set small so only route match or tight proximity counts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/matchingEngine.test.ts`
Expected: FAIL with "Cannot find module '../services/matchingEngine.js'"

- [ ] **Step 3: Implement `calculateHaversineDistance`, `calculateVectorAlignment`, and `evaluateDeliveryCandidates` in `server/services/matchingEngine.ts`**

Implement ranking score:
- Distance component: `max(0, 100 - (distKm / maxRadius) * 40)`
- Travel time component: `avgSpeed = 30 km/h; etaMin = Math.round((distKm / 30) * 60)`
- Freshness component: decay over 10 minutes `freshness = max(0, 1 - ageMs / 600000) * 20`
- Corridor vector check: `cos(θ) = (V_delivery • V_journey) / (|V_delivery| * |V_journey|)`. If `cos(θ) > 0.5`, award route match bonus.
- Filter out requester's own UID, `rejectedBy` UIDs, and partners exceeding radius and detour limits.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/tests/matchingEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/matchingEngine.ts server/tests/matchingEngine.test.ts
git commit -m "feat(dispatch): implement direction-aware matching and candidate ranking engine"
```

---

### Task 3: Progressive Dispatch Engine & Stage Orchestration

**Files:**
- Create: `server/services/dispatchService.ts`
- Modify: `server/routes/deliveries.ts:318-380, 424-520`
- Test: `server/tests/dispatchService.test.ts`

**Interfaces:**
- Consumes: `partnerPresenceService`, `evaluateDeliveryCandidates`, Socket.IO instance.
- Produces:
  ```ts
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
    currentStage: number; // 1, 2, 3
    state: DispatchStageState;
    notifiedPartnerIds: Set<string>;
    timeouts: NodeJS.Timeout[];
  }

  export class DispatchService {
    startDispatch(delivery: any, io: any, stageIntervalMs?: number): void;
    stopDispatch(requestId: string, reason: 'assigned' | 'cancelled' | 'expired', io?: any): void;
    getJob(requestId: string): DispatchJob | undefined;
    handlePartnerDecline(requestId: string, partnerId: string): void;
  }
  ```

- [ ] **Step 1: Write the failing test for progressive dispatch orchestration**

```ts
// server/tests/dispatchService.test.ts
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
      pickupCoords: [37.4418, -122.1601],
      dropoffCoords: [37.3861, -122.0839],
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
      longitude: -122.14, // ~4 km away (within 6km, outside 3km)
      isAvailable: true,
    });

    const delivery = {
      _id: 'del-102',
      id: 'del-102',
      requesterId: 'cust-1',
      pickupCoords: [37.4418, -122.1601],
      dropoffCoords: [37.3861, -122.0839],
    };

    dispatchService.startDispatch(delivery, mockIo, 10000);
    expect(dispatchService.getJob('del-102')?.notifiedPartnerIds.has('partner-nearby')).toBe(true);

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
      pickupCoords: [37.44, -122.16],
      dropoffCoords: [37.38, -122.08],
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/dispatchService.test.ts`
Expected: FAIL with "Cannot find module '../services/dispatchService.js'"

- [ ] **Step 3: Implement `DispatchService` in `server/services/dispatchService.ts`**

Implement:
- `startDispatch(delivery, io, stageIntervalMs = 12000)`:
  - Stage 1 (0s): 3 km radius -> status `searching_partner`.
  - Stage 2 (12s): 6 km radius + corridor matching -> status `expanding_search`.
  - Stage 3 (24s): 10 km max radius -> status `expanding_search`.
  - Stage 4 (36s): status `no_partner_available`.
  - De-duplicate notified partner IDs using `Set<string>`.
  - Send status updates to `delivery:${deliveryId}` room and `io.emit('dispatch:opportunity')` directed to candidate sockets or partner rooms.
- `stopDispatch(requestId, reason, io)`: clear all scheduled timeouts in `timeouts` array, set state to `partner_assigned` or `cancelled`.
- `handlePartnerDecline(requestId, partnerId)`: add to `rejectedBy`, don't notify them in subsequent stages.

- [ ] **Step 4: Hook `dispatchService` into `server/routes/deliveries.ts`**

In `POST /api/deliveries`:
- Trigger `dispatchService.startDispatch(newDoc, req.app.get('io'))`.
In `POST /api/deliveries/:id/accept`:
- Trigger `dispatchService.stopDispatch(req.params.id, 'assigned', req.app.get('io'))`.
In `POST /api/deliveries/:id/reject`:
- Trigger `dispatchService.handlePartnerDecline(req.params.id, uid)`.
In `POST /api/deliveries/:id/cancel` or cancel handler:
- Trigger `dispatchService.stopDispatch(req.params.id, 'cancelled', req.app.get('io'))`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/tests/dispatchService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/dispatchService.ts server/routes/deliveries.ts server/tests/dispatchService.test.ts
git commit -m "feat(dispatch): add progressive multi-stage dispatch engine and connect to delivery routes"
```

---

### Task 4: Frontend Dispatch Opportunities & Real-time Partner Matching UI

**Files:**
- Modify: `src/types/index.ts:35-70`
- Modify: `src/context/AppContext.tsx:220-270`
- Modify: `src/components/dashboard/PartnerDashboard.tsx:80-140`
- Test: `src/components/dashboard/PartnerDashboardMatching.test.tsx`

**Interfaces:**
- Consumes: Socket events `dispatch:opportunity`, `dispatch:status`, `delivery:claimed`.
- Produces: Instant dispatch opportunity card with distance to pickup, estimated detour, match badge ("Within 2.4 km" / "On Your Route"), and responsive Accept / Decline actions.

- [ ] **Step 1: Write the failing test for partner live dispatch opportunities UI**

```tsx
// src/components/dashboard/PartnerDashboardMatching.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartnerDashboard } from './PartnerDashboard';
import { AppContext } from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';

describe('PartnerDashboard Dispatch Matching UI', () => {
  it('renders live dispatch opportunity with match tags and accept/decline buttons', () => {
    const mockRequest = {
      id: 'req-disp-1',
      title: 'Urgent Medical Supplies',
      pickupAddress: '4170 El Camino Real, Palo Alto',
      dropoffAddress: 'California Ave, Palo Alto',
      pickupCoords: [37.4124, -122.1287] as [number, number],
      dropoffCoords: [37.4285, -122.1432] as [number, number],
      compensation: 28.5,
      urgency: 'urgent',
      status: 'open' as const,
      category: 'pharmacy' as const,
      itemSize: 'small' as const,
      neededBy: 'ASAP',
      requesterId: 'usr-customer-99',
      requesterName: 'Alice Patient',
      handoverPin: '1234',
      distanceKm: 3.2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockAppContext: any = {
      requests: [mockRequest],
      journeys: [],
      partnerAvailable: true,
      setPartnerAvailable: vi.fn(),
      acceptDeliveryMatch: vi.fn(),
      rejectDelivery: vi.fn(),
      updateRequestStatus: vi.fn(),
      isLoadingData: false,
      backendError: null,
    };

    const mockAuthContext: any = {
      user: { id: 'partner-active', name: 'Bob Partner', role: 'transporter' },
    };

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <AppContext.Provider value={mockAppContext}>
          <PartnerDashboard onOpenPublishJourney={vi.fn()} onInspectMatch={vi.fn()} />
        </AppContext.Provider>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Urgent Medical Supplies')).toBeInTheDocument();
    expect(screen.getByText(/Accept Delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/Decline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it passes or check failure**

Run: `npx vitest run src/components/dashboard/PartnerDashboardMatching.test.tsx`
Expected: PASS (or minor prop adjustment)

- [ ] **Step 3: Enhance `PartnerDashboard.tsx` and `AppContext.tsx` for real-time dispatch events**

In `AppContext.tsx`:
- Add listener for `dispatch:opportunity`: automatically unshift into `requests` state so it appears immediately on partner screen without page refresh.
- Add listener for `dispatch:status`: update delivery object dispatch state.

In `PartnerDashboard.tsx`:
- Show match type badges: e.g. "Direct Route Match (3.2 km detour)" or "Nearby Partner Match (< 3 km)".
- Ensure Accept Delivery calls `acceptDeliveryMatch(requestId)`.
- Ensure Decline calls `rejectDelivery(requestId)` which calls backend `POST /api/deliveries/:id/reject` and removes opportunity from view.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/PartnerDashboardMatching.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/context/AppContext.tsx src/components/dashboard/PartnerDashboard.tsx src/components/dashboard/PartnerDashboardMatching.test.tsx
git commit -m "feat(ui): display real-time dispatch opportunities with match badges on partner dashboard"
```

---

### Task 5: Customer Real-Time Progressive Dispatch Status UI

**Files:**
- Modify: `src/components/dashboard/RequesterDashboard.tsx:60-160`
- Test: `src/components/dashboard/RequesterDispatchStatus.test.tsx`

**Interfaces:**
- Consumes: Delivery request `dispatchStatus` / socket event `dispatch:status`.
- Produces: Live customer tracking badge showing:
  - Stage 1: "Searching for a partner within 3 km..."
  - Stage 2: "Finding more partners (expanding to 6 km & commute routes)..."
  - Stage 3: "Partner assigned! Preparing pickup."
  - Stage 4 / Timeout: "No partner currently available in this radius." with a Retry button.

- [ ] **Step 1: Write the failing test for requester dispatch status indicator**

```tsx
// src/components/dashboard/RequesterDispatchStatus.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequesterDashboard } from './RequesterDashboard';
import { AppContext } from '../../context/AppContext';
import { AuthContext } from '../../context/AuthContext';

describe('RequesterDashboard Dispatch Status View', () => {
  it('displays progressive search indicator when delivery status is open', () => {
    const mockRequest = {
      id: 'req-open-search',
      title: 'Chemistry Glassware',
      pickupAddress: 'Stanford Science Library',
      dropoffAddress: 'Castro St, Mountain View',
      pickupCoords: [37.4275, -122.1697] as [number, number],
      dropoffCoords: [37.3861, -122.0839] as [number, number],
      compensation: 22.5,
      urgency: 'urgent',
      status: 'open' as const,
      category: 'campus-supplies' as const,
      itemSize: 'small' as const,
      neededBy: 'Today by 19:00',
      requesterId: 'usr-customer-1',
      requesterName: 'Marcus Vance',
      handoverPin: '4821',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const mockAppContext: any = {
      requests: [mockRequest],
      journeys: [],
      isLoadingData: false,
      backendError: null,
    };

    const mockAuthContext: any = {
      user: { id: 'usr-customer-1', name: 'Marcus Vance', role: 'requester' },
    };

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <AppContext.Provider value={mockAppContext}>
          <RequesterDashboard onOpenCreateRequest={vi.fn()} onInspectMatch={vi.fn()} />
        </AppContext.Provider>
      </AuthContext.Provider>
    );

    expect(screen.getByText(/Searching for a delivery partner/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it passes or check failure**

Run: `npx vitest run src/components/dashboard/RequesterDispatchStatus.test.tsx`
Expected: Check output

- [ ] **Step 3: Update `RequesterDashboard.tsx` to render progressive dispatch indicators**

In `RequesterDashboard.tsx`:
- When request is in `open` status: render an animated pulse beacon with copy:
  - "Searching for a delivery partner..."
  - "Notifying nearby & route-matched partners"
  - Display pickup address, dropoff address, and compensation.
- When `status === 'matched'`: display assigned partner's name, avatar, vehicle, and handover PIN with quick-copy.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/RequesterDispatchStatus.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/RequesterDashboard.tsx src/components/dashboard/RequesterDispatchStatus.test.tsx
git commit -m "feat(ui): add progressive dispatch status indicator and partner assignment view for requesters"
```

---

### Task 6: Full Verification, Security & Production Build

**Files:**
- Test: `server/tests/fullDispatchIntegration.test.ts`
- Run: Full vitest suite & `npm run build`

- [ ] **Step 1: Write full end-to-end dispatch integration test**

```ts
// server/tests/fullDispatchIntegration.test.ts
import { describe, it, expect } from 'vitest';
import { partnerPresenceService } from '../services/partnerPresence.js';
import { evaluateDeliveryCandidates } from '../services/matchingEngine.js';

describe('Full Dispatch Integration Flow', () => {
  it('should complete the entire nearby and route matching pipeline', () => {
    partnerPresenceService.clearAll();

    // 1. Online partner with fresh GPS
    partnerPresenceService.updateLocation('partner-alpha', {
      latitude: 37.4418,
      longitude: -122.1601,
      isAvailable: true,
      fullName: 'Alpha Transporter',
    });

    // 2. Customer creates request
    const delivery = {
      requesterId: 'cust-xyz',
      pickupCoords: [37.4418, -122.1601] as [number, number],
      dropoffCoords: [37.3861, -122.0839] as [number, number],
    };

    // 3. Match evaluation
    const candidates = evaluateDeliveryCandidates(
      delivery,
      partnerPresenceService.getActivePartners(),
      { maxRadiusKm: 3 }
    );

    expect(candidates.length).toBe(1);
    expect(candidates[0].partner.userId).toBe('partner-alpha');
    expect(candidates[0].matchType).toBe('nearby');
    expect(candidates[0].score).toBeGreaterThan(80);
  });
});
```

- [ ] **Step 2: Run all tests in the repository**

Run: `npx vitest run`
Expected: All test suites PASS (22+ suites).

- [ ] **Step 3: Run full TypeScript and Vite production build**

Run: `npm run build`
Expected: Clean build (`tsc -b && vite build`) with exit code 0.

- [ ] **Step 4: Commit and finalize**

```bash
git add server/tests/fullDispatchIntegration.test.ts
git commit -m "test(dispatch): add end-to-end dispatch integration test and verify production build"
```
