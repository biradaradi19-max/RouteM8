// ============================================================================
// React Hook: useLiveKitCall
// Purpose: Manage LiveKit audio & video call sessions for Route M8 delivery participants.
// Features:
//   - Microphone & camera permission validation with clear user guidance
//   - Server-minted token acquisition via Express backend /api/livekit/token
//   - Connection state management (idle, requesting_permission, connecting, connected, reconnecting, disconnected, error)
//   - Audio and video track publishing & remote track subscription with auto-attach
//   - Active speaker detection and call duration timer
//   - Microphone mute / unmute toggle and camera video toggle
//   - Local self-view preview and remote video attachment handlers
//   - Low-latency WebRTC data channel for auxiliary in-call GPS telemetry
//   - Explicit media track release and hardware camera/mic indicator LED cleanup
//   - Auto-hangup when delivery transitions to completed or cancelled
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
  type TrackPublication,
  ConnectionState,
} from 'livekit-client';
import type { DeliveryStatus } from '../types';
import { requestLiveKitToken } from '../services/livekit';
import { getSocket } from '../services/socket';

export type CallState =
  | 'idle'
  | 'requesting_permission'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type CallType = 'audio' | 'video';

export interface RemoteParticipantState {
  identity: string;
  name: string;
  isMuted: boolean;
  isVideoMuted: boolean;
  isSpeaking: boolean;
}

export interface UseLiveKitCallOptions {
  deliveryId: string;
  deliveryStatus?: DeliveryStatus;
  deliveryTitle?: string;
  otherPartyName?: string;
  initialCallType?: CallType;
  onCallEnded?: () => void;
  onDataReceived?: (data: any, participant?: RemoteParticipant) => void;
}

export interface UseLiveKitCallResult {
  callState: CallState;
  callType: CallType;
  isMuted: boolean;
  isVideoEnabled: boolean;
  hasRemoteVideo: boolean;
  isLocalSpeaking: boolean;
  isRemoteSpeaking: boolean;
  remoteParticipant: RemoteParticipantState | null;
  error: string | null;
  permissionDeniedType: 'microphone' | 'camera' | null;
  missingConfig: boolean;
  durationSeconds: number;
  roomName: string | null;
  startCall: (mode?: CallType) => Promise<void>;
  endCall: () => void;
  toggleMute: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  sendData: (data: Record<string, any>) => Promise<boolean>;
  attachLocalVideo: (element: HTMLVideoElement | null) => void;
  attachRemoteVideo: (element: HTMLVideoElement | null) => void;
}

export function useLiveKitCall({
  deliveryId,
  deliveryStatus,
  otherPartyName,
  initialCallType = 'audio',
  onCallEnded,
  onDataReceived,
}: UseLiveKitCallOptions): UseLiveKitCallResult {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>(initialCallType);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState<boolean>(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState<boolean>(false);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipantState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDeniedType, setPermissionDeniedType] = useState<'microphone' | 'camera' | null>(null);
  const [missingConfig, setMissingConfig] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [roomName, setRoomName] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const attachedAudioElementsRef = useRef<HTMLMediaElement[]>([]);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null);
  const timerRef = useRef<any>(null);

  // Stop active call duration timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDurationSeconds(0);
  }, []);

  // Fully cleanup and release hardware media tracks (mic & camera)
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

    // Detach video elements
    if (remoteVideoTrackRef.current && remoteVideoElRef.current) {
      try {
        remoteVideoTrackRef.current.detach(remoteVideoElRef.current);
      } catch {
        // Ignore detach error
      }
    }
    if (remoteVideoElRef.current) {
      remoteVideoElRef.current.srcObject = null;
    }
    if (localVideoElRef.current) {
      localVideoElRef.current.srcObject = null;
    }
    remoteVideoTrackRef.current = null;

    // Disconnect and release tracks from room to shut off hardware LEDs
    if (roomRef.current) {
      try {
        // Stop local audio tracks
        roomRef.current.localParticipant.audioTrackPublications?.forEach((pub: any) => {
          if (pub?.track) {
            pub.track.stop();
          }
        });
        // Stop local video tracks
        roomRef.current.localParticipant.videoTrackPublications?.forEach((pub: any) => {
          if (pub?.track) {
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
    setIsVideoEnabled(false);
    setHasRemoteVideo(false);
  }, [stopTimer]);

  // Public End Call method
  const endCall = useCallback(() => {
    if (deliveryId) {
      getSocket().then((s) => s.emit('call:hangup', { deliveryId })).catch(() => {});
    }
    cleanupCall();
    setCallState('disconnected');
    setTimeout(() => {
      setCallState('idle');
      if (onCallEnded) {
        onCallEnded();
      }
    }, 1500);
  }, [cleanupCall, deliveryId, onCallEnded]);

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

  // Video attachment helpers for UI components
  const attachLocalVideo = useCallback((element: HTMLVideoElement | null) => {
    localVideoElRef.current = element;
    if (element && roomRef.current?.localParticipant) {
      const pubs = Array.from(roomRef.current.localParticipant.videoTrackPublications.values());
      const firstVideoPub = pubs.find((p: any) => p.track && p.track.kind === Track.Kind.Video);
      if (firstVideoPub && firstVideoPub.track) {
        firstVideoPub.track.attach(element);
      }
    }
  }, []);

  const attachRemoteVideo = useCallback((element: HTMLVideoElement | null) => {
    remoteVideoElRef.current = element;
    if (element && remoteVideoTrackRef.current) {
      remoteVideoTrackRef.current.attach(element);
    }
  }, []);

  // Start Call flow (Audio or Video)
  const startCall = useCallback(async (mode?: CallType) => {
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

    const selectedMode = mode || callType || 'audio';
    setCallType(selectedMode);
    setError(null);
    setPermissionDeniedType(null);
    setMissingConfig(false);
    setCallState('requesting_permission');

    // 1. Check & request browser media permissions
    const needsVideo = selectedMode === 'video';
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support audio/video devices or WebRTC.');
      }

      // Quick test stream to trigger browser prompt and test permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: needsVideo,
      });
      // Release test stream tracks immediately; LiveKit creates its own tracks
      stream.getTracks().forEach((track) => track.stop());
    } catch (permErr: any) {
      const isDenied =
        permErr.name === 'NotAllowedError' ||
        permErr.name === 'PermissionDeniedError' ||
        permErr.message?.includes('denied');

      const isNotFound = permErr.name === 'NotFoundError' || permErr.name === 'DevicesNotFoundError';

      let msg = '';
      if (needsVideo) {
        setPermissionDeniedType(isDenied ? 'camera' : null);
        msg = isDenied
          ? 'Camera/microphone permission was denied. Please allow camera and mic access in your browser settings to start a video call.'
          : isNotFound
          ? 'No camera or microphone found. Please connect your media devices to start a video call.'
          : `Media device error: ${permErr.message || 'Unable to access camera and microphone.'}`;
      } else {
        setPermissionDeniedType(isDenied ? 'microphone' : null);
        msg = isDenied
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings to make audio calls.'
          : isNotFound
          ? 'No microphone found. Please connect an audio input device to start the call.'
          : `Microphone error: ${permErr.message || 'Unable to access microphone.'}`;
      }

      setError(msg);
      setCallState('error');
      return;
    }

    // 2. Fetch server-minted LiveKit Access Token
    setCallState('connecting');
    const tokenRes = await requestLiveKitToken(deliveryId, selectedMode);

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
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 24 },
        },
      });

      roomRef.current = room;

      // Track Subscribed (incoming remote audio or video)
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();
            attachedAudioElementsRef.current.push(audioElement);
          } else if (track.kind === Track.Kind.Video) {
            remoteVideoTrackRef.current = track;
            setHasRemoteVideo(true);
            if (remoteVideoElRef.current) {
              track.attach(remoteVideoElRef.current);
            }
          }

          setRemoteParticipant({
            identity: participant.identity,
            name: participant.name || otherPartyName || 'Participant',
            isMuted: !participant.isMicrophoneEnabled,
            isVideoMuted: !participant.isCameraEnabled,
            isSpeaking: false,
          });
        }
      );

      // Track Unsubscribed
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video) {
          if (remoteVideoElRef.current) {
            try {
              track.detach(remoteVideoElRef.current);
            } catch {
              // Ignore
            }
          }
          remoteVideoTrackRef.current = null;
          setHasRemoteVideo(false);
        } else if (track.kind === Track.Kind.Audio) {
          try {
            track.detach();
          } catch {
            // Ignore
          }
        }
      });

      // Track Muted/Unmuted
      room.on(RoomEvent.TrackMuted, (pub: TrackPublication, participant: Participant) => {
        if (participant !== room.localParticipant) {
          setRemoteParticipant((prev) =>
            prev
              ? {
                  ...prev,
                  isMuted: pub.kind === Track.Kind.Audio ? true : prev.isMuted,
                  isVideoMuted: pub.kind === Track.Kind.Video ? true : prev.isVideoMuted,
                }
              : null
          );
          if (pub.kind === Track.Kind.Video) {
            setHasRemoteVideo(false);
          }
        }
      });

      room.on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant: Participant) => {
        if (participant !== room.localParticipant) {
          setRemoteParticipant((prev) =>
            prev
              ? {
                  ...prev,
                  isMuted: pub.kind === Track.Kind.Audio ? false : prev.isMuted,
                  isVideoMuted: pub.kind === Track.Kind.Video ? false : prev.isVideoMuted,
                }
              : null
          );
          if (pub.kind === Track.Kind.Video) {
            setHasRemoteVideo(true);
          }
        }
      });

      // Participant Connected
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        setRemoteParticipant({
          identity: participant.identity,
          name: participant.name || otherPartyName || 'Participant',
          isMuted: !participant.isMicrophoneEnabled,
          isVideoMuted: !participant.isCameraEnabled,
          isSpeaking: false,
        });
      });

      // Participant Disconnected
      room.on(RoomEvent.ParticipantDisconnected, () => {
        setRemoteParticipant(null);
        setHasRemoteVideo(false);
      });

      // Active Speakers Changed
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const localSpeaker = speakers.find((s) => s.isLocal);
        const remoteSpeaker = speakers.find((s) => !s.isLocal);
        setIsLocalSpeaking(Boolean(localSpeaker));
        setIsRemoteSpeaking(Boolean(remoteSpeaker));
      });

      // LiveKit Data Channel Message Received
      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const jsonStr = new TextDecoder().decode(payload);
          const parsed = JSON.parse(jsonStr);
          if (onDataReceived) {
            onDataReceived(parsed, participant);
          }
        } catch {
          // Ignore malformed payload
        }
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

      // Connect to LiveKit Cloud SFU
      await room.connect(serverUrl, token);

      // Signal incoming call to delivery room participants via Socket.IO
      getSocket().then((s) => s.emit('call:initiate', { deliveryId, callType: selectedMode })).catch(() => {});

      // Enable local microphone
      await room.localParticipant.setMicrophoneEnabled(true);
      setIsMuted(false);

      // Enable camera if video call mode is requested
      if (needsVideo) {
        try {
          await room.localParticipant.setCameraEnabled(true);
          setIsVideoEnabled(true);
          // Attach to local preview element if already mounted
          const pubs = Array.from(room.localParticipant.videoTrackPublications.values());
          const firstVideoPub = pubs.find((p: any) => p.track && p.track.kind === Track.Kind.Video);
          if (firstVideoPub && firstVideoPub.track && localVideoElRef.current) {
            firstVideoPub.track.attach(localVideoElRef.current);
          }
        } catch (camErr: any) {
          console.warn('[LiveKit Call] Camera enable fallback:', camErr.message);
          setIsVideoEnabled(false);
        }
      } else {
        setIsVideoEnabled(false);
      }

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
          isVideoMuted: !firstRemote.isCameraEnabled,
          isSpeaking: false,
        });

        // Check if remote already published video
        const remoteVideoPub = Array.from(firstRemote.videoTrackPublications.values()).find(
          (p: any) => p.track && p.isSubscribed
        );
        if (remoteVideoPub && remoteVideoPub.track) {
          remoteVideoTrackRef.current = remoteVideoPub.track as RemoteTrack;
          setHasRemoteVideo(true);
          if (remoteVideoElRef.current) {
            remoteVideoPub.track.attach(remoteVideoElRef.current);
          }
        }
      }
    } catch (err: any) {
      cleanupCall();
      setError(err?.message || 'Failed to establish LiveKit connection.');
      setCallState('error');
    }
  }, [deliveryId, deliveryStatus, callType, otherPartyName, onDataReceived, endCall, cleanupCall]);

  // Toggle Microphone Mute
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

  // Toggle Camera On / Off
  const toggleCamera = useCallback(async () => {
    if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) {
      return;
    }
    const nextVideo = !isVideoEnabled;
    try {
      if (nextVideo) {
        await roomRef.current.localParticipant.setCameraEnabled(true);
        setIsVideoEnabled(true);
        // Attach to local preview element if present
        const pubs = Array.from(roomRef.current.localParticipant.videoTrackPublications.values());
        const firstVideoPub = pubs.find((p: any) => p.track && p.track.kind === Track.Kind.Video);
        if (firstVideoPub && firstVideoPub.track && localVideoElRef.current) {
          firstVideoPub.track.attach(localVideoElRef.current);
        }
      } else {
        await roomRef.current.localParticipant.setCameraEnabled(false);
        setIsVideoEnabled(false);
        if (localVideoElRef.current) {
          localVideoElRef.current.srcObject = null;
        }
      }
    } catch (err: any) {
      const isDenied = err.name === 'NotAllowedError' || err.message?.includes('denied');
      if (isDenied) {
        setPermissionDeniedType('camera');
        setError('Camera permission was denied. Please allow camera permissions in your browser to share video.');
      } else {
        setError(err?.message || 'Failed to toggle camera.');
      }
    }
  }, [isVideoEnabled]);

  // Send auxiliary telemetry / metadata over LiveKit Data Channel
  const sendData = useCallback(async (data: Record<string, any>): Promise<boolean> => {
    if (!roomRef.current || roomRef.current.state !== ConnectionState.Connected) {
      return false;
    }
    try {
      const payload = new TextEncoder().encode(JSON.stringify(data));
      await roomRef.current.localParticipant.publishData(payload, { reliable: true });
      return true;
    } catch (err: any) {
      console.warn('[LiveKit DataChannel] publishData notice:', err.message);
      return false;
    }
  }, []);

  return {
    callState,
    callType,
    isMuted,
    isVideoEnabled,
    hasRemoteVideo,
    isLocalSpeaking,
    isRemoteSpeaking,
    remoteParticipant,
    error,
    permissionDeniedType,
    missingConfig,
    durationSeconds,
    roomName,
    startCall,
    endCall,
    toggleMute,
    toggleCamera,
    sendData,
    attachLocalVideo,
    attachRemoteVideo,
  };
}
