import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLiveKitToken } from './livekit';

describe('LiveKit Service — Token Request & Edge Function Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error when Supabase client is unconfigured and no override provided', async () => {
    const res = await requestLiveKitToken('del-123', null as any);
    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
    expect(res.error).toContain('Supabase backend is not configured');
  });

  it('should invoke edge function and parse token response correctly', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-jwt',
        serverUrl: 'wss://routem8-prod.livekit.cloud',
        room: 'delivery-del-123',
        participantIdentity: 'usr-customer-1',
        participantName: 'Customer (Alex)',
        role: 'Customer',
      },
      error: null,
    });

    const mockClient = {
      functions: {
        invoke: mockInvoke,
      },
    } as any;

    const res = await requestLiveKitToken('del-123', mockClient);

    expect(mockInvoke).toHaveBeenCalledWith('livekit-token', {
      body: { deliveryId: 'del-123' },
    });
    expect(res.success).toBe(true);
    expect(res.error).toBeNull();
    expect(res.data?.token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-jwt');
    expect(res.data?.serverUrl).toBe('wss://routem8-prod.livekit.cloud');
    expect(res.data?.room).toBe('delivery-del-123');
    expect(res.data?.role).toBe('Customer');
  });

  it('should handle edge function error response when credentials are missing', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: {
        error: 'LiveKit server credentials are not fully configured',
        missingConfig: true,
      },
      error: {
        message: 'LiveKit credentials are not fully configured',
      },
    });

    const mockClient = {
      functions: {
        invoke: mockInvoke,
      },
    } as any;

    const res = await requestLiveKitToken('del-123', mockClient);

    expect(res.success).toBe(false);
    expect(res.missingConfig).toBe(true);
    expect(res.error).toContain('LiveKit credentials are not yet configured on the server');
  });

  it('should handle network failure gracefully', async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error('Network connection timeout'));

    const mockClient = {
      functions: {
        invoke: mockInvoke,
      },
    } as any;

    const res = await requestLiveKitToken('del-123', mockClient);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Network connection timeout');
  });
});
