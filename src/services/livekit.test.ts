import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLiveKitToken } from './livekit';
import { livekitApi } from './api';

vi.mock('./api', () => ({
  livekitApi: {
    getToken: vi.fn(),
  },
}));

describe('LiveKit Service — Token Request & Backend Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch token from Express backend and return structured response', async () => {
    vi.mocked(livekitApi.getToken).mockResolvedValueOnce({
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-jwt',
      serverUrl: 'wss://routem8-prod.livekit.cloud',
      room: 'delivery-del-123',
      participantIdentity: 'usr-customer-1',
      participantName: 'Customer (Alex)',
      role: 'Customer',
    });

    const res = await requestLiveKitToken('del-123');

    expect(livekitApi.getToken).toHaveBeenCalledWith('del-123');
    expect(res.success).toBe(true);
    expect(res.error).toBeNull();
    expect(res.data?.token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-jwt');
    expect(res.data?.serverUrl).toBe('wss://routem8-prod.livekit.cloud');
    expect(res.data?.room).toBe('delivery-del-123');
    expect(res.data?.role).toBe('Customer');
  });

  it('should handle backend error when credentials are not configured', async () => {
    vi.mocked(livekitApi.getToken).mockRejectedValueOnce(
      new Error('LiveKit credentials are not configured on the server')
    );

    const res = await requestLiveKitToken('del-123');

    expect(res.success).toBe(false);
    expect(res.missingConfig).toBe(true);
    expect(res.error).toContain('LiveKit credentials are not yet configured on the server');
  });

  it('should handle network failure gracefully', async () => {
    vi.mocked(livekitApi.getToken).mockRejectedValueOnce(new Error('Network connection timeout'));

    const res = await requestLiveKitToken('del-123');

    expect(res.success).toBe(false);
    expect(res.error).toBe('Network connection timeout');
  });
});
