import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLiveKitServerUrl,
  isLiveKitConfigured,
  setRuntimeLiveKitUrl,
} from './livekitConfig';

describe('LiveKit Configuration Resolver', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return empty string and false when no URL is set', () => {
    expect(getLiveKitServerUrl()).toBe('');
    expect(isLiveKitConfigured()).toBe(false);
  });

  it('should support runtime localStorage override', () => {
    setRuntimeLiveKitUrl('wss://routem8-test.livekit.cloud');
    expect(getLiveKitServerUrl()).toBe('wss://routem8-test.livekit.cloud');
    expect(isLiveKitConfigured()).toBe(true);
  });

  it('should clear runtime localStorage override when empty string is provided', () => {
    setRuntimeLiveKitUrl('wss://routem8-test.livekit.cloud');
    expect(isLiveKitConfigured()).toBe(true);

    setRuntimeLiveKitUrl('');
    expect(getLiveKitServerUrl()).toBe('');
    expect(isLiveKitConfigured()).toBe(false);
  });
});
