# Location-Based Nearby Delivery Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Location-Based Nearby Delivery Discovery for delivery partners in Route M8, obtaining live GPS first, filtering open delivery requests within an expandable 5-15 km radius, sorting by nearest pickup, and synchronizing updates in real time.

**Architecture:** 
1. **Frontend Hook & UI:** Dedicated `usePartnerDiscoveryLocation` hook handles browser geolocation permissions, states, and coordinates with zero fallback to fake coordinates. `PartnerDashboard.tsx` uses this hook to display location status, refresh controls, expandable radius chips (5 km, 10 km, 15 km), and distance-sorted delivery cards.
2. **Backend API:** Authenticated `GET /api/deliveries/nearby` route with coordinate and radius validation, partner role check, exclusion of requester's own requests and declined requests, Haversine distance calculation, and distance sorting. Dual-support for MongoDB and Firestore in-memory fallback.
3. **Real-time Sync:** Socket.IO events (`delivery:created`, `delivery:claimed`, `delivery:cancelled`) combined with tab focus and reconnect refetching for serverless resilience.

**Tech Stack:** React 18, TypeScript, Express, MongoDB Atlas / Mongoose, Firebase Auth, Socket.IO, Vitest, Testing Library.

**Spec:** User prompt requirements for Location-Based Nearby Delivery Discovery.

## Global Constraints

- Preserve the current architecture: React + TypeScript frontend, Firebase Auth, Express + TypeScript backend, MongoDB Atlas, Socket.IO.
- Do not reintroduce Supabase or create a mock-only implementation.
- Never silently fall back to fake coordinates, a hardcoded location, or an unrelated default map location.
- Strict authorization: requester cannot see their own request as a claimable job; delivery partner role required on protected endpoints.
- Atomic acceptance: only one partner can accept an open request; declines hide only for that partner.

## Review Focus

1. Geolocation denied/timeout: Partner sees explicit guidance and retry button without hanging or seeing requests at a default/fake location.
2. Coordinate precision & boundaries: Requests with missing or non-finite coords are excluded; coords at boundary (e.g. 4.9 km vs 5.1 km) are filtered accurately.
3. Requester-Partner separation: A user who creates a delivery request and switches to the Partner Hub must never see their own request listed as an available job.
4. Concurrent partner acceptance: If two partners attempt to accept the same delivery simultaneously, exactly one succeeds and the other receives a 409 Conflict error.
5. Radius expansion: Expanding from 5 km to 10 km and 15 km correctly fetches/re-filters deliveries and updates count without duplicate items.

---

### Task 1: Backend `GET /api/deliveries/nearby` Endpoint & Tests

**Files:**
- Create: `server/tests/nearbyDeliveries.test.ts`
- Modify: `server/routes/deliveries.ts:330-335`
- Modify: `server/models/DeliveryRequest.ts` (if needed for index or validation)

**Interfaces:**
- Consumes: `calculateHaversineDistance` from `server/services/matchingEngine.ts`, `requireAuth` from `server/middleware/auth.ts`, `isDbConnected` from `server/config/db.ts`.
- Produces: `GET /api/deliveries/nearby?lat={number}&lng={number}&radiusKm={number}` returning `DeliveryRequest[]` with `pickupDistanceKm`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/nearbyDeliveries.test.ts
// Tests:
// 1. Missing lat/lng returns 400
// 2. Invalid lat/lng (-95, 200) returns 400
// 3. Unauthenticated request returns 401
// 4. User with requester-only role returns 403
// 5. Correct 5 km filtering (4.0 km included, 6.0 km excluded)
// 6. Distance sorting (nearest first)
// 7. Excludes requester's own requests
// 8. Excludes declined requests (rejectedBy)
// 9. Excludes non-open requests (matched, cancelled)
// 10. Radius expansion to 10 km and 15 km includes farther requests
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/nearbyDeliveries.test.ts`
Expected: FAIL (404 or route not implemented)

- [ ] **Step 3: Implement `GET /api/deliveries/nearby` in `server/routes/deliveries.ts`**

Implement route before line 332 (`router.get('/:id')`):
- Validate `lat` (-90 to 90) and `lng` (-180 to 180).
- Validate `radiusKm` (number between 0.1 and 50, default 5).
- Check `req.user!.uid`. Check partner role (allow `'both'`, `'transporter'`, or unassigned default; block explicit `'requester'`).
- Filter candidate open requests: status === `'open'`, requesterId !== uid, not in rejectedBy, valid `pickupCoords`.
- Compute Haversine distance from `[lat, lng]` to each request's `pickupCoords`.
- Filter by `pickupDistanceKm <= radiusKm`.
- Sort by `pickupDistanceKm` ascending.
- Return formatted items with `pickupDistanceKm`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/tests/nearbyDeliveries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/deliveries.ts server/tests/nearbyDeliveries.test.ts
git commit -m "feat(api): implement GET /api/deliveries/nearby with coordinate validation and proximity filtering"
```

---

### Task 2: Backend Coordinate Validation on Creation & Concurrent Acceptance Test

**Files:**
- Modify: `server/routes/deliveries.ts:360-425`
- Test: `server/tests/deliveryCreationValidation.test.ts`

**Interfaces:**
- Consumes: `DeliveryRequest` model, `inMemoryDeliveries`, `requireAuth`.
- Produces: Strict coordinate validation on `POST /api/deliveries` preventing malformed coordinates from entering the database.

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/deliveryCreationValidation.test.ts
// Tests:
// 1. Rejects creation if pickupCoords is not [lat, lng] array
// 2. Rejects creation if pickupCoords lat/lng is out of range
// 3. Concurrent acceptance: 2 simultaneous calls to /accept on same delivery -> 1 succeeds, 1 returns 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/tests/deliveryCreationValidation.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement validation in `POST /api/deliveries`**

Validate `pickupCoords` and `dropoffCoords` strictly: length 2, finite numbers within [-90, 90] and [-180, 180].

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/tests/deliveryCreationValidation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/deliveries.ts server/tests/deliveryCreationValidation.test.ts
git commit -m "feat(api): enforce strict coordinate validation on delivery creation and verify atomic acceptance"
```

---

### Task 3: Frontend API Client & Types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/api.ts`
- Test: `src/services/apiNearbyDeliveries.test.ts`

**Interfaces:**
- Consumes: `DeliveryRequest` from `src/types/index.ts`, `fetchWithAuth` from `src/services/api.ts`.
- Produces: `deliveriesApi.getNearbyDeliveries(params: { lat: number; lng: number; radiusKm?: number }): Promise<DeliveryRequest[]>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/apiNearbyDeliveries.test.ts
// Test deliveriesApi.getNearbyDeliveries calls /api/deliveries/nearby?lat=...&lng=...&radiusKm=... with auth token
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/apiNearbyDeliveries.test.ts`
Expected: FAIL (function undefined)

- [ ] **Step 3: Implement `getNearbyDeliveries` and update types**

Add `pickupDistanceKm?: number` to `DeliveryRequest` in `src/types/index.ts`.
Add `getNearbyDeliveries` method to `deliveriesApi` in `src/services/api.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/apiNearbyDeliveries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/api.ts src/services/apiNearbyDeliveries.test.ts
git commit -m "feat(frontend): add getNearbyDeliveries API client method and pickupDistanceKm type"
```

---

### Task 4: Partner Live Location Hook (`usePartnerDiscoveryLocation`)

**Files:**
- Create: `src/hooks/usePartnerDiscoveryLocation.ts`
- Test: `src/hooks/usePartnerDiscoveryLocation.test.ts`

**Interfaces:**
- Consumes: `navigator.geolocation`, `navigator.permissions` (optional).
- Produces: `{ coords, locationStatus, errorMessage, lastUpdated, refreshLocation }`
  - `locationStatus`: `'idle' | 'getting_location' | 'permission_denied' | 'unavailable' | 'timeout' | 'ready'`

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/usePartnerDiscoveryLocation.test.ts
// Tests:
// 1. Initial state triggers geolocation request with sensible timeout
// 2. Successful GPS acquisition sets status='ready', coords, lastUpdated
// 3. Permission denied (code 1) sets status='permission_denied' with clear message
// 4. Position unavailable (code 2) sets status='unavailable'
// 5. Timeout (code 3) sets status='timeout'
// 6. Never falls back to default coordinates on error
// 7. refreshLocation triggers re-acquisition
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePartnerDiscoveryLocation.test.ts`
Expected: FAIL (hook does not exist)

- [ ] **Step 3: Implement `usePartnerDiscoveryLocation`**

Implement in `src/hooks/usePartnerDiscoveryLocation.ts`:
- Check permission if supported.
- Call `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`.
- Track status, error, coordinates, and timestamp.
- Never set fake coordinates.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePartnerDiscoveryLocation.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePartnerDiscoveryLocation.ts src/hooks/usePartnerDiscoveryLocation.test.ts
git commit -m "feat(frontend): implement usePartnerDiscoveryLocation hook with strict GPS handling"
```

---

### Task 5: Partner Dashboard UI & Nearby Delivery Discovery Integration

**Files:**
- Modify: `src/components/dashboard/PartnerDashboard.tsx`
- Test: `src/components/dashboard/PartnerNearbyDiscovery.test.tsx`

**Interfaces:**
- Consumes: `usePartnerDiscoveryLocation`, `deliveriesApi.getNearbyDeliveries`, `useApp`, `useAuth`, `getSocket`.
- Produces: Fully interactive Nearby Discovery section in Partner Hub with live GPS status bar, radius chips (5 km, 10 km, 15 km), distance tags, empty states with expand action, and real-time Socket.IO synchronization.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/dashboard/PartnerNearbyDiscovery.test.tsx
// Tests:
// 1. Renders "Getting your location…" while GPS is acquiring
// 2. Renders "Location permission required" when permission denied
// 3. Renders "Unable to get location — Retry" on timeout/unavailable with working retry button
// 4. When GPS ready, fetches nearby deliveries and displays active radius (5 km default) and matching count
// 5. Displays pickup distance tag ("X.X km from your location") on each card
// 6. Clicking "10 km" or "15 km" expands radius and fetches/displays expanded results
// 7. Shows "No deliveries within 5 km" with 1-click button to expand search
// 8. Displays last location update time and allows manual refresh
// 9. Real-time updates: removes card on delivery:claimed or delivery:cancelled
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/dashboard/PartnerNearbyDiscovery.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement UI in `PartnerDashboard.tsx`**

Integrate:
- `usePartnerDiscoveryLocation` hook.
- Top location status bar: Status message, last updated relative time, "Refresh Location" button.
- Radius selector: `5 km` (active by default), `10 km`, `15 km`, with match count badges.
- Deliveries list: display pickup distance (`1.4 km from your location`), pickup/dropoff address, item description, compensation, status.
- Empty state: "No deliveries within {radius} km" with "Expand Search to {radius + 5} km" button.
- Socket.IO listeners: `delivery:claimed`, `delivery:cancelled`, `delivery:created`, plus window focus event listener.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/dashboard/PartnerNearbyDiscovery.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/PartnerDashboard.tsx src/components/dashboard/PartnerNearbyDiscovery.test.tsx
git commit -m "feat(ui): integrate location-based nearby delivery discovery in Partner Dashboard"
```

---

### Task 6: Full Suite Verification & Code Review

**Files:**
- Entire repository

- [ ] **Step 1: Run complete test suite**

Run: `npx vitest run`
Expected: 100% pass across all test suites.

- [ ] **Step 2: Run full build check**

Run: `npm run build`
Expected: Clean build with exit code 0.

- [ ] **Step 3: Run CodeRabbit review**

Run manual review or CodeRabbit inspection on git diff. Address any security, performance, or typing issues.

- [ ] **Step 4: Commit any refactorings**

```bash
git commit -m "chore: finalize location-based discovery implementation and test coverage"
```

---

### Task 7: Production Deployment & Live Verification

**Files:**
- Deployment to Vercel (`https://route-m8.vercel.app`)

- [ ] **Step 1: Push changes to main**

```bash
git push origin main
```

- [ ] **Step 2: Verify production deployment**

Use `browser_subagent` to navigate to `https://route-m8.vercel.app/#partner-hub`:
- Verify location permission prompt and status rendering.
- Verify nearby deliveries list rendering, radius toggle (5 km -> 10 km -> 15 km), and refresh location.
- Verify two separate sessions (customer creates request, partner discovers nearby).

- [ ] **Step 3: Document verification results**
