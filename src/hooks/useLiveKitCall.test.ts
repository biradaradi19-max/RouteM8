import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLiveKitCall } from './useLiveKitCall';
import * as livekitService from '../services/livekit';

// Mock LiveKit Client
const mockLocalParticipant = {
  setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
  setCameraEnabled: vi.fn().mockResolvedValue(undefined),
  publishData: vi.fn().mockResolvedValue(undefined),
  audioTrackPublications: new Map(),
  videoTrackPublications: new Map(),
};

const mockRoomEventListeners = new Map<string, Function>();

const mockRoomInstance = {
  state: 'connected',
  localParticipant: mockLocalParticipant,
  remoteParticipants: new Map(),
  on: vi.fn().mockImplementation((event: string, callback: Function) => {
    mockRoomEventListeners.set(event, callback);
    return mockRoomInstance;
  }),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockImplementation(() => {
    mockRoomInstance.state = 'disconnected';
  }),
};

vi.mock('../services/livekit', () => ({
  requestLiveKitToken: vi.fn(),
}));

vi.mock('livekit-client', () => {
  class MockRoom {
    constructor() {
      return mockRoomInstance as any;
    }
  }

  return {
    Room: MockRoom,
    RoomEvent: {
      Connected: 'connected',
      Disconnected: 'disconnected',
      TrackSubscribed: 'trackSubscribed',
      TrackUnsubscribed: 'trackUnsubscribed',
      ParticipantConnected: 'participantConnected',
      ParticipantDisconnected: 'participantDisconnected',
      ActiveSpeakersChanged: 'activeSpeakersChanged',
      DataReceived: 'dataReceived',
      Reconnecting: 'reconnecting',
      Reconnected: 'reconnected',
    },
    Track: {
      Kind: {
        Audio: 'audio',
        Video: 'video',
      },
    },
    ConnectionState: {
      Connected: 'connected',
      Disconnected: 'disconnected',
    },
  };
});

describe('useLiveKitCall Hook', () => {
  let mockGetUserMedia: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRoomEventListeners.clear();
    mockRoomInstance.state = 'connected';

    mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with idle state and no error', () => {
    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Alex',
      })
    );

    expect(result.current.callState).toBe('idle');
    expect(result.current.isMuted).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.durationSeconds).toBe(0);
  });

  it('should reject call initiation when delivery status is inactive', async () => {
    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'open',
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    expect(result.current.callState).toBe('error');
    expect(result.current.error).toContain('Calls are only permitted during active deliveries');
  });

  it('should handle microphone permission denial gracefully', async () => {
    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValueOnce(notAllowedError);

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    expect(result.current.callState).toBe('error');
    expect(result.current.error).toContain('Microphone permission was denied');
  });

  it('should request token, connect to room, and set connected state', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-123',
        participantIdentity: 'usr-customer',
        participantName: 'Customer',
        role: 'Customer',
      },
      error: null,
    });

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    expect(result.current.callState).toBe('connected');
    expect(result.current.roomName).toBe('delivery-del-123');
    expect(mockRoomInstance.connect).toHaveBeenCalledWith(
      'wss://test.livekit.cloud',
      'mock-jwt-token'
    );
    expect(mockLocalParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('should toggle microphone mute state when connected', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-123',
        participantIdentity: 'usr-customer',
        participantName: 'Customer',
        role: 'Customer',
      },
      error: null,
    });

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    expect(result.current.isMuted).toBe(false);

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(mockLocalParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    expect(result.current.isMuted).toBe(true);
  });

  it('should disconnect and release room when endCall is invoked', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-123',
        participantIdentity: 'usr-customer',
        participantName: 'Customer',
        role: 'Customer',
      },
      error: null,
    });

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    act(() => {
      result.current.endCall();
    });

    expect(mockRoomInstance.disconnect).toHaveBeenCalled();
    expect(result.current.callState).toBe('disconnected');
  });

  it('should automatically end call when delivery becomes completed', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-123',
        participantIdentity: 'usr-customer',
        participantName: 'Customer',
        role: 'Customer',
      },
      error: null,
    });

    let currentStatus: any = 'in_transit';
    const { result, rerender } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-123',
        deliveryStatus: currentStatus,
        otherPartyName: 'Alex',
      })
    );

    await act(async () => {
      await result.current.startCall();
    });

    expect(result.current.callState).toBe('connected');

    // Delivery is completed upon physical PIN verification
    currentStatus = 'completed';
    rerender();

    await waitFor(() => {
      expect(mockRoomInstance.disconnect).toHaveBeenCalled();
      expect(result.current.callState).toBe('disconnected');
    });
  });

  it('should start video call with camera enabled and video mode', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token-video',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-video-1',
        participantIdentity: 'usr-customer',
        participantName: 'Customer',
        role: 'Customer',
        callType: 'video',
      },
      error: null,
    });

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-video-1',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Ravi',
        initialCallType: 'video',
      })
    );

    await act(async () => {
      await result.current.startCall('video');
    });

    expect(result.current.callState).toBe('connected');
    expect(result.current.callType).toBe('video');
    expect(mockLocalParticipant.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(result.current.isVideoEnabled).toBe(true);

    // Toggle camera off
    await act(async () => {
      await result.current.toggleCamera();
    });

    expect(mockLocalParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
    expect(result.current.isVideoEnabled).toBe(false);
  });

  it('should handle camera permission denial and set permissionDeniedType to camera', async () => {
    const camError = new Error('Camera permission denied');
    camError.name = 'NotAllowedError';
    mockGetUserMedia.mockRejectedValueOnce(camError);

    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-video-perm',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Ravi',
      })
    );

    await act(async () => {
      await result.current.startCall('video');
    });

    expect(result.current.callState).toBe('error');
    expect(result.current.permissionDeniedType).toBe('camera');
    expect(result.current.error).toContain('Camera/microphone permission was denied');
  });

  it('should transmit and receive auxiliary GPS telemetry over LiveKit data channel', async () => {
    vi.mocked(livekitService.requestLiveKitToken).mockResolvedValueOnce({
      success: true,
      data: {
        token: 'mock-jwt-token-data',
        serverUrl: 'wss://test.livekit.cloud',
        room: 'delivery-del-data-1',
        participantIdentity: 'usr-partner',
        participantName: 'Partner',
        role: 'Transporter',
      },
      error: null,
    });

    const onDataReceivedMock = vi.fn();
    const { result } = renderHook(() =>
      useLiveKitCall({
        deliveryId: 'del-data-1',
        deliveryStatus: 'in_transit',
        otherPartyName: 'Customer',
        onDataReceived: onDataReceivedMock,
      })
    );

    await act(async () => {
      await result.current.startCall('audio');
    });

    // 1. Send data channel packet
    let sendResult = false;
    await act(async () => {
      sendResult = await result.current.sendData({
        type: 'gps_telemetry',
        latitude: 18.3325,
        longitude: 77.0821,
        accuracy: 12.5,
      });
    });

    expect(sendResult).toBe(true);
    expect(mockLocalParticipant.publishData).toHaveBeenCalled();

    // 2. Simulate incoming data channel packet from remote peer
    const dataReceivedListener = mockRoomEventListeners.get('dataReceived');
    expect(dataReceivedListener).toBeDefined();

    const incomingPayload = new TextEncoder().encode(
      JSON.stringify({ type: 'gps_telemetry', latitude: 18.3325, longitude: 77.0821, accuracy: 12.5 })
    );

    act(() => {
      dataReceivedListener!(incomingPayload, { identity: 'usr-remote' });
    });

    expect(onDataReceivedMock).toHaveBeenCalledWith(
      { type: 'gps_telemetry', latitude: 18.3325, longitude: 77.0821, accuracy: 12.5 },
      { identity: 'usr-remote' }
    );
  });
});
