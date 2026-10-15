// ============================================================================
// React Hook: useLiveKitCall
// Purpose: Manage LiveKit audio call session for Route M8 delivery participants.
// Features:
//   - Microphone permission validation and friendly error handling
//   - Server-minted token acquisition via Edge Function
//   - Connection state management (idle, connecting, connected, disconnected, error)
//   - Audio track publishing and remote track subscription with auto-attach
//   - Active speaker detection and call duration timer
//   - Mute / unmute control
//   - Explicit media track release and hardware microphone indicator cleanup
//   - Auto-hangup when delivery is completed or cancelled
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Participant,
  ConnectionState,
} from 'livekit-client';
import type { DeliveryStatus } from '../types';
import { requestLiveKitToken } from '../services/livekit';

export type CallState =
  | 'idle'
  | 'requesting_permission'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface RemoteParticipantState {
  identity: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface UseLiveKitCallOptions {
  deliveryId: string;
  deliveryStatus?: DeliveryStatus;
  deliveryTitle?: string;
  otherPartyName?: string;
  onCallEnded?: () => void;
}

export interface UseLiveKitCallResult {
  callState: CallState;
  isMuted: boolean;
  isLocalSpeaking: boolean;
  isRemoteSpeaking: boolean;
  remoteParticipant: RemoteParticipantState | null;
  error: string | null;
  missingConfig: boolean;
  durationSeconds: number;
  roomName: string | null;
  startCall: () => Promise<void>;
  endCall: () => void;
  toggleMute: () => Promise<void>;
}

export function useLiveKitCall({
  deliveryId,
  deliveryStatus,
  otherPartyName,
  onCallEnded,
}: UseLiveKitCallOptions): UseLiveKitCallResult {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState<boolean>(false);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipantState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missingConfig, setMissingConfig] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [roomName, setRoomName] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const attachedAudioElementsRef = useRef<HTMLMediaElement[]>([]);
  const timerRef = useRef<any>(null);

  // Helper to clear timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDurationSeconds(0);
  }, []);

  // Helper to fully cleanup and release media tracks
  const cleanupCall = useCallback(() => {
    stopTimer();

    // Detach and remove remote audio elements
    attachedAudioElementsRef.current.forEach((el) => {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {
        // Ignore detach error
      }
    });
    attachedAudioElementsRef.current = [];

    // Disconnect and release tracks from room
    if (roomRef.current) {
      try {
        // Explicitly stop all local audio tracks to release microphone hardware lock
        roomRef.current.localParticipant.audioTrackPublications.forEach((pub) => {
          if (pub.track) {
            pub.track.stop();
          }
        });
        roomRef.current.disconnect(true);
      } catch {
        // Ignore disconnect error
      }
      roomRef.current = null;
    }

    setRemoteParticipant(null);
    setIsLocalSpeaking(false);
    setIsRemoteSpeaking(false);
  }, [stopTimer]);

  // Public End Call method
  const endCall = useCallback(() => {
    cleanupCall();
    setCallState('disconnected');
    setTimeout(() => {
      setCallState('idle');
      if (onCallEnded) {
        onCallEnded();
      }
    }, 1500);
  }, [cleanupCall, onCallEnded]);

  // Auto-hangup when delivery finishes or gets cancelled
  useEffect(() => {
    if (
      (deliveryStatus === 'completed' || deliveryStatus === 'cancelled') &&
      callState !== 'idle' &&
      callState !== 'disconnected'
    ) {
      endCall();
    }
  }, [deliveryStatus, callState, endCall]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  // Start Call flow
  const startCall = useCallback(async () => {
    if (!deliveryId) {
      setError('Cannot start call: Delivery ID is missing.');
      setCallState('error');
      return;
    }

    if (deliveryStatus !== 'matched' && deliveryStatus !== 'in_transit') {
      setError(
        `Calls are only permitted during active deliveries. Current status is '${deliveryStatus || 'unknown'}'.`
      );
      setCallState('error');
      return;
    }

    setError(null);
    setMissingConfig(false);
    setCallState('requesting_permission');

    // 1. Check & request browser microphone permissions
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support audio devices or WebRTC.');
      }

      // Quick test stream to trigger browser prompt and test permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release test stream tracks immediately; LiveKit will create its own
      stream.getTracks().forEach((track) => track.stop());
    } catch (permErr: any) {
      const isDenied =
        permErr.name === 'NotAllowedError' ||
        permErr.name === 'PermissionDeniedError' ||
        permErr.message?.includes('denied');

      const isNotFound = permErr.name === 'NotFoundError' || permErr.name === 'DevicesNotFoundError';

      const msg = isDenied
        ? 'Microphone permission was denied. Please allow microphone access in your browser settings to make audio calls.'
        : isNotFound
        ? 'No microphone found. Please connect an audio input device to start the call.'
        : `Microphone error: ${permErr.message || 'Unable to access microphone.'}`;

      setError(msg);
      setCallState('error');
      return;
    }

    // 2. Fetch server-minted LiveKit Access Token
    setCallState('connecting');
    const tokenRes = await requestLiveKitToken(deliveryId);

    if (!tokenRes.success || !tokenRes.data) {
      setError(tokenRes.error || 'Failed to authenticate call with server.');
      setMissingConfig(Boolean(tokenRes.missingConfig));
      setCallState('error');
      return;
    }

    const { token, serverUrl, room: assignedRoomName } = tokenRes.data;
    setRoomName(assignedRoomName);

    if (!serverUrl) {
      setError(
        'LiveKit server URL is not configured. Please set LIVEKIT_URL in your server environment.'
      );
      setMissingConfig(true);
      setCallState('error');
      return;
    }

    // 3. Instantiate LiveKit Room
    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      roomRef.current = room;

      // Track Subscribed (incoming remote audio)
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();
            attachedAudioElementsRef.current.push(audioElement);
          }

          setRemoteParticipant({
            identity: participant.identity,
            name: participant.name || otherPartyName || 'Participant',
            isMuted: !participant.isMicrophoneEnabled,
            isSpeaking: false,
          });
        }
      );

      // Track Unsubscribed
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach();
      });

      // Participant Connected
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        setRemoteParticipant({
          identity: participant.identity,
          name: participant.name || otherPartyName || 'Participant',
          isMuted: !participant.isMicrophoneEnabled,
          isSpeaking: false,
        });
      });

      // Participant Disconnected
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setRemoteParticipant(null);
      });

      // Active Speakers Changed
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const localSpeaker = speakers.find((s) => s.isLocal);
        const remoteSpeaker = speakers.find((s) => !s.isLocal);
        setIsLocalSpeaking(Boolean(localSpeaker));
        setIsRemoteSpeaking(Boolean(remoteSpeaker));
      });

      // Connection state changes
      room.on(RoomEvent.Reconnecting, () => {
        setCallState('reconnecting');
      });

      room.on(RoomEvent.Reconnected, () => {
        setCallState('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        endCall();
      });

      // Connect to LiveKit SFU
      await room.connect(serverUrl, token);

      // Enable local microphone
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);
      setCallState('connected');

      // Start duration timer
      setDurationSeconds(0);
      timerRef.current = setInterval(() => {
        setDurationSeconds((sec) => sec + 1);
      }, 1000);

      // Inspect any already connected remote participants
      if (room.remoteParticipants.size > 0) {
        const firstRemote = Array.from(room.remoteParticipants.values())[0];
        setRemoteParticipant({
          identity: firstRemote.identity,
          name: firstRemote.name || otherPartyName || 'Participant',
          isMuted: !firstRemote.isMicrophoneEnabled,
          isSpeaking: false,
        });
      }
    } catch (err: any) {
      cleanupCall();
      setError(err?.message || 'Failed to establish LiveKit audio connection.');
      setCallState('error');
    }
  }, [deliveryId, deliveryStatus, otherPartyName, endCall, cleanupCall]);

  // Toggle Mute
  const toggleMute = useCallback(async () => {
    if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) {
      return;
    }
    const nextMuted = !isMuted;
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
      setIsMuted(nextMuted);
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle microphone state.');
    }
  }, [isMuted]);

  return {
    callState,
    isMuted,
    isLocalSpeaking,
    isRemoteSpeaking,
    remoteParticipant,
    error,
    missingConfig,
    durationSeconds,
    roomName,
    startCall,
    endCall,
    toggleMute,
  };
}
