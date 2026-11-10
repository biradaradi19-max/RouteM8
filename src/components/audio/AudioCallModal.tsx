// ============================================================================
// Component: AudioCallModal / LiveKitCallModal
// Purpose: Impeccable, modern audio & video calling modal for Route M8.
// Features:
//   - Route M8 brand styling (Forest green, emerald accents, dark glassmorphism)
//   - Dual-mode: Audio calling and full WebRTC Video calling
//   - Remote video viewport with Picture-in-Picture local self-preview
//   - Soundwave / pulse animations for active speaking states
//   - Microphone (Mute / Unmute) and Camera (On / Off) toggle controls
//   - Real-time WebRTC connection state alerts (Connecting, Connected, Reconnecting, Disconnected)
//   - Clear browser permission recovery instructions when camera/mic access is denied
//   - Hardware camera and microphone indicator cleanup on hang-up
// ============================================================================

import React, { useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  ShieldCheck,
  AlertCircle,
  Volume2,
  Lock,
  X,
  Navigation,
} from 'lucide-react';
import type { UseLiveKitCallResult } from '../../hooks/useLiveKitCall';

export interface AudioCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  otherPartyName: string;
  otherPartyRole: 'Customer' | 'Transporter';
  deliveryTitle: string;
  call: UseLiveKitCallResult;
  hasP2pGpsSync?: boolean;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const AudioCallModal: React.FC<AudioCallModalProps> = ({
  isOpen,
  onClose,
  otherPartyName,
  otherPartyRole,
  deliveryTitle,
  call,
  hasP2pGpsSync = false,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const {
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
    toggleMute,
    toggleCamera,
    endCall,
    startCall,
    attachLocalVideo,
    attachRemoteVideo,
  } = call;

  // Bind video element refs when elements mount or video status changes
  useEffect(() => {
    if (localVideoRef.current) {
      attachLocalVideo(localVideoRef.current);
    }
  }, [attachLocalVideo, isVideoEnabled, callState]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      attachRemoteVideo(remoteVideoRef.current);
    }
  }, [attachRemoteVideo, hasRemoteVideo, callState]);

  if (!isOpen) return null;

  const handleModalClose = () => {
    if (callState === 'connected' || callState === 'connecting') {
      endCall();
    }
    onClose();
  };

  const isVideoMode = callType === 'video' || isVideoEnabled || hasRemoteVideo;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        backgroundColor: 'rgba(6, 21, 15, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="card-elevated"
        style={{
          width: '100%',
          maxWidth: isVideoMode ? '580px' : '440px',
          backgroundColor: 'var(--bg-surface, #FFFFFF)',
          borderRadius: 'var(--radius-2xl, 1.25rem)',
          border: '1px solid var(--border-medium, rgba(0,0,0,0.1))',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.2))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          transition: 'max-width 0.3s ease',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            backgroundColor: 'var(--bg-base, #F8FAFC)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor:
                  callState === 'connected'
                    ? '#10B981'
                    : callState === 'connecting' || callState === 'requesting_permission'
                    ? '#F59E0B'
                    : '#EF4444',
                boxShadow:
                  callState === 'connected'
                    ? '0 0 8px #10B981'
                    : callState === 'connecting'
                    ? '0 0 8px #F59E0B'
                    : 'none',
              }}
            />
            <span
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--text-secondary, #64748B)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {callState === 'connected'
                ? isVideoMode
                  ? 'Live Video Room'
                  : 'Live Audio Room'
                : callState === 'connecting'
                ? 'Connecting to Room...'
                : callState === 'requesting_permission'
                ? 'Requesting Permissions...'
                : callState === 'reconnecting'
                ? 'Reconnecting Signal...'
                : callState === 'disconnected'
                ? 'Call Ended'
                : 'Call Status'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasP2pGpsSync && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.6875rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#059669',
                  fontWeight: 600,
                }}
                title="Live GPS coordinates synchronized over WebRTC Data Channel"
              >
                <Navigation size={10} />
                <span>P2P GPS</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleModalClose}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-tertiary, #94A3B8)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-sm, 0.375rem)',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Central Call Card Body */}
        <div
          style={{
            padding: isVideoMode ? '1rem' : '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: isVideoMode ? '0.75rem' : '1.25rem',
          }}
        >
          {/* VIDEO STAGE: Rendered when in video mode and connected */}
          {isVideoMode && callState === 'connected' ? (
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '320px',
                backgroundColor: '#091E16',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
              }}
            >
              {/* Remote Video Track Viewport */}
              {hasRemoteVideo ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: 'var(--color-mint-300, #6EE7B7)',
                  }}
                >
                  <div
                    style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(45, 212, 191, 0.15)',
                      border: isRemoteSpeaking ? '3px solid #10B981' : '2px solid rgba(45, 212, 191, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      animation: isRemoteSpeaking ? 'pulse 1.4s infinite' : 'none',
                    }}
                  >
                    {otherPartyName.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>
                    {remoteParticipant ? `${otherPartyName}'s Camera is Off` : `Waiting for ${otherPartyName}...`}
                  </span>
                </div>
              )}

              {/* Local Self-View Picture-in-Picture Preview */}
              {isVideoEnabled && (
                <div
                  style={{
                    position: 'absolute',
                    top: '0.75rem',
                    right: '0.75rem',
                    width: '110px',
                    height: '75px',
                    borderRadius: 'var(--radius-md, 0.5rem)',
                    overflow: 'hidden',
                    border: '2px solid rgba(255,255,255,0.7)',
                    backgroundColor: '#0F291E',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    zIndex: 2,
                  }}
                >
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)', // Mirror effect for self preview
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '4px',
                      fontSize: '0.5625rem',
                      color: 'white',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      padding: '1px 3px',
                      borderRadius: '2px',
                      fontWeight: 600,
                    }}
                  >
                    You
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* AUDIO STAGE: Avatar with soundwave ripples */
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {(isRemoteSpeaking || isLocalSpeaking) && (
                <span
                  style={{
                    position: 'absolute',
                    width: '110px',
                    height: '110px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    animation: 'pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }}
                />
              )}

              <div
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-forest-900, #06150F)',
                  color: 'var(--color-mint-400, #34D399)',
                  border: isRemoteSpeaking ? '3px solid #10B981' : '3px solid rgba(52, 211, 153, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1))',
                  zIndex: 1,
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  transition: 'all 0.2s ease',
                }}
              >
                {otherPartyName.slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}

          {/* Caller Details & Delivery Subtitle */}
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary, #0F172A)' }}>
              {otherPartyName}
            </h3>
            <p
              style={{
                margin: '0.25rem 0 0',
                fontSize: '0.875rem',
                color: 'var(--text-secondary, #64748B)',
                fontWeight: 500,
              }}
            >
              {otherPartyRole} • {deliveryTitle}
            </p>
          </div>

          {/* Timer & Connection Status Text */}
          {callState === 'connected' ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0.875rem',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-full, 9999px)',
                color: 'var(--color-mint-600, #059669)',
                fontSize: '0.9375rem',
                fontWeight: 700,
              }}
            >
              <Volume2 size={15} />
              <span className="tabular-nums">{formatDuration(durationSeconds)}</span>
              {isRemoteSpeaking && (
                <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                  (Speaking...)
                </span>
              )}
            </div>
          ) : callState === 'connecting' ? (
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary, #64748B)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <PhoneCall size={16} className="pulse-animation" />
              <span>Establishing secure LiveKit Cloud channel...</span>
            </div>
          ) : callState === 'requesting_permission' ? (
            <div style={{ fontSize: '0.875rem', color: '#D97706', fontWeight: 600 }}>
              Please allow microphone & camera permissions in your browser.
            </div>
          ) : callState === 'reconnecting' ? (
            <div style={{ fontSize: '0.875rem', color: '#D97706' }}>
              Reconnecting to LiveKit Room...
            </div>
          ) : callState === 'disconnected' ? (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary, #94A3B8)' }}>
              Call terminated. Releasing media devices...
            </div>
          ) : null}

          {/* Permission / Configuration Error Banner */}
          {error && (
            <div
              style={{
                width: '100%',
                backgroundColor: missingConfig ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: missingConfig
                  ? '1px solid rgba(245, 158, 11, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
                color: missingConfig ? '#B45309' : '#DC2626',
                borderRadius: 'var(--radius-md, 0.5rem)',
                padding: '0.75rem 1rem',
                fontSize: '0.8125rem',
                textAlign: 'left',
                display: 'flex',
                gap: '0.625rem',
                alignItems: 'flex-start',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {missingConfig
                    ? 'LiveKit Configuration Required'
                    : permissionDeniedType === 'camera'
                    ? 'Camera Permission Blocked'
                    : permissionDeniedType === 'microphone'
                    ? 'Microphone Permission Blocked'
                    : 'Call Notice'}
                </p>
                <p style={{ margin: '0.25rem 0 0', lineHeight: 1.4 }}>{error}</p>
                {permissionDeniedType && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.9 }}>
                    Tip: Click the lock or camera/mic icon on the left side of your browser address bar and set permissions to <strong>Allow</strong>.
                  </p>
                )}
                {missingConfig && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.9 }}>
                    Provide <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code>, and <code>LIVEKIT_URL</code> in your environment.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Remote Participant Status Details */}
          {callState === 'connected' && (
            <div
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                backgroundColor: 'var(--bg-base, #F8FAFC)',
                borderRadius: 'var(--radius-md, 0.5rem)',
                border: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
                fontSize: '0.8125rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)' }}>
                <ShieldCheck size={14} color="#10B981" />
                <span>LiveKit Encrypted</span>
              </div>
              <div>
                {remoteParticipant ? (
                  <span style={{ color: '#059669', fontWeight: 600 }}>
                    {remoteParticipant.isMuted ? 'Remote Mic Muted' : 'Remote Mic Live'}
                    {remoteParticipant.isVideoMuted === false && ' • Video Live'}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                    Waiting for {otherPartyName} to join room...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Call Control Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              paddingTop: '0.5rem',
            }}
          >
            {callState === 'connected' && (
              <>
                {/* Microphone Mute Toggle */}
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  className="btn btn-secondary"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
                    borderColor: isMuted ? '#EF4444' : 'var(--border-medium)',
                    color: isMuted ? '#EF4444' : 'var(--text-primary)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>

                {/* Camera Toggle */}
                <button
                  type="button"
                  onClick={toggleCamera}
                  aria-label={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                  title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                  className="btn btn-secondary"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isVideoEnabled ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                    borderColor: isVideoEnabled ? '#10B981' : 'var(--border-medium)',
                    color: isVideoEnabled ? '#059669' : 'var(--text-primary)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              </>
            )}

            {/* End Call / Retry Actions */}
            {callState === 'connected' || callState === 'connecting' || callState === 'requesting_permission' ? (
              <button
                type="button"
                onClick={endCall}
                aria-label="End Call"
                title="End Call"
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <PhoneOff size={22} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="btn btn-secondary"
                  style={{ minWidth: '90px' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => startCall('audio')}
                  className="btn btn-primary"
                  style={{ minWidth: '110px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <PhoneCall size={15} />
                  <span>Retry Call</span>
                </button>
                <button
                  type="button"
                  onClick={() => startCall('video')}
                  className="btn btn-secondary"
                  style={{ minWidth: '110px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Video size={15} />
                  <span>Video Call</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Security Assurance Footer */}
        <div
          style={{
            padding: '0.625rem 1.25rem',
            backgroundColor: 'var(--bg-base, #F8FAFC)',
            borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary, #94A3B8)',
          }}
        >
          <Lock size={12} />
          <span>Restricted to authorized delivery participants (#{deliveryTitle.slice(0, 16)})</span>
        </div>
      </div>
    </div>
  );
};
