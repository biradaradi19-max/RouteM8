import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Model the security invariants enforced by the trusted Supabase Edge Function 'livekit-token'.
 */
function evaluateLiveKitTokenAuthorization(
  callerUserId: string,
  delivery: {
    id: string;
    requesterId: string;
    transporterId?: string | null;
    status: string;
  }
): { authorized: boolean; errorCode?: number; errorMessage?: string; roomName?: string } {
  if (!callerUserId) {
    return { authorized: false, errorCode: 401, errorMessage: 'Unauthorized: Session missing' };
  }

  // Status check: must be active
  if (delivery.status !== 'matched' && delivery.status !== 'in_transit') {
    return {
      authorized: false,
      errorCode: 403,
      errorMessage: `Audio calling only permitted for matched or in-transit status. Current: ${delivery.status}`,
    };
  }

  // Participant authorization check: caller must be requester or assigned transporter
  const isRequester = callerUserId === delivery.requesterId;
  const isTransporter = Boolean(delivery.transporterId && callerUserId === delivery.transporterId);

  if (!isRequester && !isTransporter) {
    return {
      authorized: false,
      errorCode: 403,
      errorMessage: 'Forbidden: You are not an authorized participant for this delivery',
    };
  }

  // Deterministic room name assignment
  return {
    authorized: true,
    roomName: `delivery-${delivery.id}`,
  };
}

describe('LiveKit Edge Function Security & Token Authorization Invariants', () => {
  const activeDelivery = {
    id: 'del-campus-99',
    requesterId: 'usr-customer-1',
    transporterId: 'usr-transporter-2',
    status: 'in_transit',
  };

  it('should authorize delivery requester during active delivery with deterministic room', () => {
    const res = evaluateLiveKitTokenAuthorization('usr-customer-1', activeDelivery);
    expect(res.authorized).toBe(true);
    expect(res.roomName).toBe('delivery-del-campus-99');
  });

  it('should authorize assigned transporter during active delivery with identical deterministic room', () => {
    const res = evaluateLiveKitTokenAuthorization('usr-transporter-2', activeDelivery);
    expect(res.authorized).toBe(true);
    expect(res.roomName).toBe('delivery-del-campus-99');
  });

  it('should reject unauthorized third-party user attempting to join call', () => {
    const res = evaluateLiveKitTokenAuthorization('usr-attacker-evil', activeDelivery);
    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe(403);
    expect(res.errorMessage).toContain('not an authorized participant');
  });

  it('should reject token generation for open unassigned deliveries', () => {
    const openDelivery = {
      ...activeDelivery,
      transporterId: null,
      status: 'open',
    };
    const res = evaluateLiveKitTokenAuthorization('usr-customer-1', openDelivery);
    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe(403);
    expect(res.errorMessage).toContain('only permitted for matched or in-transit');
  });

  it('should reject token generation once delivery has completed', () => {
    const completedDelivery = {
      ...activeDelivery,
      status: 'completed',
    };
    const res = evaluateLiveKitTokenAuthorization('usr-customer-1', completedDelivery);
    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe(403);
    expect(res.errorMessage).toContain('only permitted for matched or in-transit');
  });

  it('should reject token generation once delivery has cancelled', () => {
    const cancelledDelivery = {
      ...activeDelivery,
      status: 'cancelled',
    };
    const res = evaluateLiveKitTokenAuthorization('usr-transporter-2', cancelledDelivery);
    expect(res.authorized).toBe(false);
    expect(res.errorCode).toBe(403);
    expect(res.errorMessage).toContain('only permitted for matched or in-transit');
  });

  it('should confirm that client-side frontend code never references or imports LIVEKIT_API_SECRET', () => {
    const frontendDir = path.resolve(__dirname, '..');
    const filesToCheck = [
      path.join(frontendDir, 'services', 'livekit.ts'),
      path.join(frontendDir, 'services', 'livekitConfig.ts'),
      path.join(frontendDir, 'hooks', 'useLiveKitCall.ts'),
    ];

    filesToCheck.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Assert frontend never imports server-side SDK
      expect(content).not.toMatch(/from\s+['"]livekit-server-sdk['"]/);
      // Assert frontend never reads LIVEKIT_API_SECRET from environment variables
      expect(content).not.toMatch(/import\.meta\.env\.LIVEKIT_API_SECRET/);
      expect(content).not.toMatch(/process\.env\.LIVEKIT_API_SECRET/);
    });
  });
});
