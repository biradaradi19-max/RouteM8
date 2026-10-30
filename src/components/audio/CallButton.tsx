// ============================================================================
// Component: CallButton
// Purpose: Trigger buttons to launch secure LiveKit audio or video calls.
// ============================================================================

import React from 'react';
import { Phone, PhoneCall, Video } from 'lucide-react';

export interface CallButtonProps {
  onClick: () => void;
  onVideoClick?: () => void;
  otherPartyRole: 'Customer' | 'Transporter';
  otherPartyName?: string;
  disabled?: boolean;
  isCallActive?: boolean;
}

export const CallButton: React.FC<CallButtonProps> = ({
  onClick,
  onVideoClick,
  otherPartyRole,
  disabled = false,
  isCallActive = false,
}) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      {/* Audio Call Button */}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={
          disabled
            ? 'Calling is available once a transporter is matched'
            : `Start secure audio call with ${otherPartyRole}`
        }
        className={`btn btn-sm ${isCallActive ? 'btn-accent' : 'btn-secondary'}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          padding: '0.25rem 0.625rem',
          backgroundColor: isCallActive ? 'rgba(16, 185, 129, 0.15)' : undefined,
          borderColor: isCallActive ? 'rgba(16, 185, 129, 0.4)' : undefined,
          color: isCallActive ? 'var(--color-mint-600, #059669)' : undefined,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.15s ease',
        }}
      >
        {isCallActive ? (
          <PhoneCall size={14} className="pulse-animation" />
        ) : (
          <Phone size={14} />
        )}
        <span>{isCallActive ? 'In Call...' : `Call ${otherPartyRole}`}</span>
      </button>

      {/* Video Call Button (when onVideoClick provided and not in call) */}
      {onVideoClick && !isCallActive && (
        <button
          type="button"
          onClick={onVideoClick}
          disabled={disabled}
          title={
            disabled
              ? 'Video calling is available once a transporter is matched'
              : `Start secure video call with ${otherPartyRole}`
          }
          className="btn btn-sm btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          <Video size={14} />
          <span>Video</span>
        </button>
      )}
    </div>
  );
};
