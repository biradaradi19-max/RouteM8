// @vitest-environment node
import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';

describe('Shared Persistence Cross-Container Storage', () => {
  let firestorePersistence: any;
  const inMemoryStore = new Map<string, any>();
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.ENABLE_FIRESTORE_TESTS = '1';

    // Mock fetch to simulate Firebase Realtime Database without depending on external cloud network availability
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      const method = init?.method || 'GET';

      const deliveryMatch = urlStr.match(/\/deliveries\/([^/]+)\.json/);
      if (deliveryMatch) {
        const id = decodeURIComponent(deliveryMatch[1]);
        if (method === 'PUT') {
          const body = JSON.parse(init?.body as string);
          inMemoryStore.set(id, body);
          return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'GET') {
          const data = inMemoryStore.get(id);
          return new Response(JSON.stringify(data || null), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (method === 'DELETE') {
          inMemoryStore.delete(id);
          return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    const mod = await import('../services/firestorePersistence.js');
    firestorePersistence = mod.firestorePersistence;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ENABLE_FIRESTORE_TESTS;
  });

  it('saves, retrieves, updates, and removes deliveries in shared persistence', async () => {
    const testId = 'test_del_' + Date.now();
    const mockDelivery = {
      _id: testId,
      id: testId,
      title: 'Emergency Document Delivery',
      category: 'documents',
      status: 'open',
      requesterId: 'user-req-123',
      requesterName: 'Alice Requester',
      handoverPin: '8492',
      pinAttempts: 0,
      compensation: 25.0,
      origin: { address: 'Main Street 1', lat: 37.7749, lng: -122.4194 },
      destination: { address: 'Market Street 10', lat: 37.7849, lng: -122.4094 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Save
    const saved = await firestorePersistence.saveDelivery(mockDelivery);
    expect(saved).toBe(true);

    // 2. Retrieve
    const fetched = await firestorePersistence.getDelivery(testId);
    expect(fetched).not.toBeNull();
    expect(fetched.id).toBe(testId);
    expect(fetched.status).toBe('open');
    expect(fetched.handoverPin).toBe('8492');

    // 3. Update (Acceptance by partner)
    const updated = await firestorePersistence.updateDelivery(testId, {
      status: 'matched',
      transporterId: 'partner-uid-456',
      transporterName: 'Bob Partner',
    });
    expect(updated).not.toBeNull();
    expect(updated.status).toBe('matched');
    expect(updated.transporterId).toBe('partner-uid-456');

    // 4. Verify updated state persisted
    const afterAccept = await firestorePersistence.getDelivery(testId);
    expect(afterAccept.status).toBe('matched');
    expect(afterAccept.transporterId).toBe('partner-uid-456');

    // 5. Cleanup
    await firestorePersistence.deleteDelivery(testId);
  }, 15000);
});
