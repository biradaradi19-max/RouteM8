// ============================================================================
// Component: CallButton
// Purpose: Trigger button to launch a LiveKit customer-transporter audio call.
// ============================================================================

import React from 'react';
import { Phone, PhoneCall } from 'lucide-react';

interface CallButtonProps {
  onClick: () => void;
  otherPartyRole: 'Customer' | 'Transporter';
  otherPartyName?: string;
  disabled?: boolean;
  isCallActive?: boolean;
}

export const CallButton: React.FC<CallButtonProps> = ({
  onClick,
  otherPartyRole,
  disabled = false,
  isCallActive = false,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        disabled
          ? 'Audio calling is available once a transporter is matched'
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
  );
};
