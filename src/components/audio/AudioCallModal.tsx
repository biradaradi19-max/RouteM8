// ============================================================================
// Component: AudioCallModal
// Purpose: Impeccable, responsive UI for customer-transporter audio calling.
// Features:
//   - Clean glassmorphism dialog and connection status badges
//   - Active speaker wave / pulse animation
//   - Formatted duration timer
//   - Mute / Unmute toggle button
//   - End Call hang-up button
//   - Error and permission resolution guidelines
// ============================================================================

import React from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  ShieldCheck,
  AlertCircle,
  Volume2,
  Lock,
  X,
} from 'lucide-react';
import type { UseLiveKitCallResult } from '../../hooks/useLiveKitCall';

interface AudioCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  otherPartyName: string;
  otherPartyRole: 'Customer' | 'Transporter';
  deliveryTitle: string;
  call: UseLiveKitCallResult;
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
}) => {
  if (!isOpen) return null;

  const {
    callState,
    isMuted,
    isLocalSpeaking,
    isRemoteSpeaking,
    remoteParticipant,
    error,
    missingConfig,
    durationSeconds,
    toggleMute,
    endCall,
    startCall,
  } = call;

  const handleModalClose = () => {
    if (callState === 'connected' || callState === 'connecting') {
      endCall();
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        backgroundColor: 'rgba(6, 21, 15, 0.75)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: '440px',
          backgroundColor: 'var(--bg-surface, #FFFFFF)',
          borderRadius: 'var(--radius-2xl, 1.25rem)',
          border: '1px solid var(--border-medium, rgba(0,0,0,0.1))',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
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
                ? 'Live Call Active'
                : callState === 'connecting'
                ? 'Connecting to Room...'
                : callState === 'requesting_permission'
                ? 'Requesting Mic Access...'
                : callState === 'reconnecting'
                ? 'Reconnecting...'
                : callState === 'disconnected'
                ? 'Call Ended'
                : 'Call Status'}
            </span>
          </div>

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

        {/* Central Call Card Body */}
        <div
          style={{
            padding: '2rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '1.25rem',
          }}
        >
          {/* Avatar with Soundwave / Speaking Rings */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Outer speaking ripple when remote or local is speaking */}
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

          {/* Caller Details */}
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

          {/* Timer or Status Text */}
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
              <span>Establishing secure WebRTC channel...</span>
            </div>
          ) : callState === 'requesting_permission' ? (
            <div style={{ fontSize: '0.875rem', color: '#D97706' }}>
              Please click "Allow" in your browser microphone prompt.
            </div>
          ) : callState === 'disconnected' ? (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary, #94A3B8)' }}>
              Call terminated. Releasing audio devices...
            </div>
          ) : null}

          {/* Error / Missing Credentials Box */}
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
                  {missingConfig ? 'LiveKit Configuration Required' : 'Audio Connection Notice'}
                </p>
                <p style={{ margin: '0.25rem 0 0', lineHeight: 1.4 }}>{error}</p>
                {missingConfig && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.9 }}>
                    Provide <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code>, and <code>LIVEKIT_URL</code> in your Supabase secrets or local environment.
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
                <span>Encrypted P2P Voice</span>
              </div>
              <div>
                {remoteParticipant ? (
                  <span style={{ color: '#059669', fontWeight: 600 }}>
                    {remoteParticipant.isMuted ? 'Remote Mic Muted' : 'Remote Mic Live'}
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
              gap: '1.25rem',
              paddingTop: '0.75rem',
            }}
          >
            {callState === 'connected' && (
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                className="btn btn-secondary"
                style={{
                  width: '52px',
                  height: '52px',
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
                {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
            )}

            {callState === 'connected' || callState === 'connecting' || callState === 'requesting_permission' ? (
              <button
                type="button"
                onClick={endCall}
                aria-label="End Call"
                style={{
                  width: '60px',
                  height: '60px',
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
                <PhoneOff size={24} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="btn btn-secondary"
                  style={{ minWidth: '100px' }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={startCall}
                  className="btn btn-primary"
                  style={{ minWidth: '120px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <PhoneCall size={16} />
                  <span>Retry Call</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Security Assurance Footer */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
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
          <span>Restricted to authorized participants for delivery #{deliveryTitle.slice(0, 16)}</span>
        </div>
      </div>
    </div>
  );
};
