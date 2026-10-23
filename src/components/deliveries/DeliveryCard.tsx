import React, { useState } from 'react';
import type { DeliveryRequest } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useTransporterLocation } from '../../hooks/useTransporterLocation';
import { useLiveKitCall } from '../../hooks/useLiveKitCall';
import { AudioCallModal } from '../audio/AudioCallModal';
import { CallButton } from '../audio/CallButton';
import { MapView } from '../map/MapView';
import {
  Key,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Compass,
  Radio,
  ChevronDown,
  ChevronUp,
  X,
  Truck,
  Clock,
} from 'lucide-react';

interface DeliveryCardProps {
  request: DeliveryRequest;
  onInspectMatch: (req: DeliveryRequest) => void;
  onUpdateStatus: (requestId: string, status: 'in_transit' | 'completed' | 'cancelled', pin?: string) => Promise<{ success: boolean; message?: string }>;
}

export const DeliveryCard: React.FC<DeliveryCardProps> = ({
  request: req,
  onInspectMatch,
  onUpdateStatus,
}) => {
  const { user } = useAuth();
  const { activeRoleMode, acceptDeliveryMatch, rejectDelivery, acceptError } = useApp();
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(
    req.status === 'matched' || req.status === 'in_transit'
  );
  const [isVerifying, setIsVerifying] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const [isVerifyingOpen, setIsVerifyingOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isStartingTransit, setIsStartingTransit] = useState(false);

  // Check roles
  const isAssignedTransporter = Boolean(user && req.transporterId && user.id === req.transporterId);
  const isRequester = Boolean(user && user.id === req.requesterId);
  const isParticipant = isAssignedTransporter || isRequester;

  const otherPartyRole = isAssignedTransporter ? 'Customer' : 'Transporter';
  const otherPartyName = isAssignedTransporter
    ? (req.requesterName || 'Customer')
    : (req.transporterName || 'Transporter');

  // LiveKit audio call session for this delivery
  const call = useLiveKitCall({
    deliveryId: req.id,
    deliveryStatus: req.status,
    deliveryTitle: req.title,
    otherPartyName,
  });

  const handleStartCall = async () => {
    setIsCallModalOpen(true);
    if (call.callState === 'idle' || call.callState === 'disconnected' || call.callState === 'error') {
      await call.startCall();
    }
  };

  // Live GPS tracking hook for this delivery
  const {
    isSharing,
    location: transporterLocation,
    error: gpsError,
    isStale,
    startSharing,
    stopSharing,
  } = useTransporterLocation({
    deliveryId: req.id,
    deliveryStatus: req.status,
    // Only the specifically assigned transporter for THIS delivery may broadcast GPS
    isTransporter: isAssignedTransporter,
  });

  const handleVerifyPin = async () => {
    setFeedbackMsg(null);
    setIsVerifying(true);
    try {
      const res = await onUpdateStatus(req.id, 'completed', pinCode);
      if (res.success) {
        setFeedbackMsg({
          text: 'PIN verified successfully! Handover completed and compensation released.',
          isError: false,
        });
        setPinCode('');
        setTimeout(() => {
          setIsVerifyingOpen(false);
          setFeedbackMsg(null);
        }, 2000);
      } else {
        setFeedbackMsg({ text: res.message || 'Incorrect PIN code.', isError: true });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAcceptDelivery = async () => {
    setActionError(null);
    setIsAccepting(true);
    try {
      const ok = await acceptDeliveryMatch(req.id);
      if (!ok) {
        setActionError(acceptError || 'Could not accept delivery. It may have already been claimed.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to accept delivery.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRejectDelivery = async () => {
    setActionError(null);
    setIsRejecting(true);
    try {
      const ok = await rejectDelivery(req.id);
      if (!ok) {
        setActionError('Could not decline delivery.');
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to decline delivery.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleStartTransit = async () => {
    setActionError(null);
    setIsStartingTransit(true);
    try {
      const res = await onUpdateStatus(req.id, 'in_transit');
      if (!res.success) {
        setActionError(res.message || 'Failed to start transit.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to start transit.');
    } finally {
      setIsStartingTransit(false);
    }
  };

  return (
    <div
      className="card-interactive"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-medium)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span
              className={`badge badge-${
                req.status === 'completed'
                  ? 'completed'
                  : req.status === 'open'
                  ? 'pending'
                  : 'active'
              }`}
            >
              {req.status.replace('_', ' ')}
            </span>
            <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Created {new Date(req.createdAt).toLocaleDateString()}
            </span>
            {req.status === 'in_transit' && transporterLocation && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--color-mint-600, #059669)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.15rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#10B981',
                    animation: 'pulse 1.8s infinite',
                  }}
                />
                {isStale ? 'GPS Active (Stale)' : 'Live GPS Active'}
              </span>
            )}
          </div>

          <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>{req.title}</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
            {req.description}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Compensation
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
            ${req.compensation.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Pickup & Dropoff Waypoints */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-mint-600)', marginBottom: '0.25rem' }}>
            Pickup Location
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {req.pickupAddress}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-forest-700)', marginBottom: '0.25rem' }}>
            Dropoff Destination
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            {req.dropoffAddress}
          </div>
        </div>
      </div>

      {/* Interactive Live Map & GPS Panel */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setIsMapExpanded((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              color: 'var(--color-forest-800)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Compass size={16} />
            <span>{isMapExpanded ? 'Hide Delivery Route & Map' : 'View Delivery Route & Live GPS Map'}</span>
            {isMapExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {/* Controls toolbar */}
          {(req.status === 'matched' || req.status === 'in_transit') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Live Audio Call Button */}
              {isParticipant && (
                <CallButton
                  onClick={handleStartCall}
                  otherPartyRole={otherPartyRole}
                  isCallActive={call.callState === 'connected' || call.callState === 'connecting'}
                />
              )}

              {/* GPS Broadcast Control for Transporter */}
              {isAssignedTransporter && (
                isSharing ? (
                  <button
                    type="button"
                    onClick={stopSharing}
                    className="btn btn-secondary btn-sm"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      color: '#DC2626',
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.625rem',
                    }}
                  >
                    <Radio size={14} className="pulse-animation" />
                    <span>Stop Sharing GPS</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startSharing}
                    className="btn btn-primary btn-sm"
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.625rem',
                    }}
                  >
                    <Navigation size={14} />
                    <span>Share Live GPS</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* GPS Alert Message */}
        {gpsError && (
          <div
            style={{
              backgroundColor: 'var(--status-danger-bg, #FEE2E2)',
              color: 'var(--status-danger-text, #991B1B)',
              border: '1px solid var(--status-danger-border, #F87171)',
              borderRadius: 'var(--radius-md)',
              padding: '0.625rem 0.875rem',
              fontSize: '0.8125rem',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{gpsError}</span>
          </div>
        )}

        {/* Embedded Map Canvas */}
        {isMapExpanded && (
          <div
            style={{
              height: '360px',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border-medium)',
              boxShadow: 'var(--shadow-inner)',
            }}
          >
            <MapView
              pickupCoords={req.pickupCoords}
              dropoffCoords={req.dropoffCoords}
              pickupAddress={req.pickupAddress}
              dropoffAddress={req.dropoffAddress}
              transporterLocation={transporterLocation}
              isLiveTracking={isSharing || Boolean(transporterLocation)}
            />
          </div>
        )}
      </div>

      {/* Handover & Status Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {/* Handover PIN Display (Shielded from unauthorized transporters) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              backgroundColor: 'var(--bg-brand-subtle)',
              border: '1px dashed var(--color-forest-600)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.375rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8125rem',
            }}
          >
            <Key size={14} color="var(--color-forest-800)" />
            {isRequester && !isAssignedTransporter ? (
              // Only the requester sees the actual PIN — used to verify physical handover
              <span>
                Handover Verification PIN:{' '}
                <strong className="tabular-nums" style={{ letterSpacing: '0.08em' }}>
                  {req.handoverPin || '——'}
                </strong>
              </span>
            ) : isAssignedTransporter ? (
              // The transporter is told to collect the PIN from the recipient at delivery
              <span>
                Handover Verification PIN:{' '}
                <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  (Obtain 4 digits from recipient at delivery)
                </span>
              </span>
            ) : (
              // Third-party viewers see a masked placeholder — PIN is never exposed
              <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                PIN protected — visible to requester only
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Audio Call Action Button */}
          {isParticipant && (req.status === 'matched' || req.status === 'in_transit') && (
            <CallButton
              onClick={handleStartCall}
              otherPartyRole={otherPartyRole}
              isCallActive={call.callState === 'connected' || call.callState === 'connecting'}
            />
          )}

          {req.status === 'open' && (
            <>
              {activeRoleMode === 'transporter' && (
                <>
                  <button
                    type="button"
                    onClick={handleRejectDelivery}
                    disabled={isAccepting || isRejecting}
                    className="btn btn-secondary btn-sm"
                    data-testid="reject-delivery-button"
                    title="Decline / Reject this delivery opportunity"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      color: 'var(--color-charcoal-700)',
                    }}
                  >
                    {isRejecting ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : (
                      <X size={14} />
                    )}
                    <span>{isRejecting ? 'Declining...' : 'Decline / Reject'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAcceptDelivery}
                    disabled={isAccepting || isRejecting}
                    className="btn btn-primary btn-sm"
                    data-testid="accept-delivery-button"
                    title="Accept this delivery and assign it to yourself"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {isAccepting ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    <span>{isAccepting ? 'Accepting...' : 'Accept Delivery'}</span>
                  </button>
                </>
              )}

              <button onClick={() => onInspectMatch(req)} className="btn btn-secondary btn-sm">
                Find Route Match
              </button>
            </>
          )}

          {/* Matched status: Requester sees awaiting pickup status, Partner sees Mark In Transit button */}
          {req.status === 'matched' && isRequester && !isAssignedTransporter && (
            <span
              className="badge badge-warning"
              data-testid="awaiting-pickup-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.65rem',
                fontSize: '0.8rem',
              }}
            >
              <Clock size={13} />
              <span>Partner Assigned — Awaiting Pickup</span>
            </span>
          )}

          {req.status === 'matched' && (isAssignedTransporter || (activeRoleMode === 'transporter' && !isRequester) || (!isRequester && !req.transporterId)) && (
            <button
              type="button"
              onClick={handleStartTransit}
              disabled={isStartingTransit}
              className="btn btn-secondary btn-sm"
              data-testid="mark-in-transit-button"
              title="Mark package picked up and start transit route"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              {isStartingTransit ? (
                <span className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <Truck size={14} />
              )}
              <span>{isStartingTransit ? 'Updating...' : 'Mark In Transit'}</span>
            </button>
          )}

          {req.status !== 'completed' && req.status !== 'open' && (isAssignedTransporter || (activeRoleMode === 'transporter' && !isRequester)) && (
            <button
              type="button"
              onClick={() => setIsVerifyingOpen((prev) => !prev)}
              className="btn btn-accent btn-sm"
              data-testid="verify-handover-pin-button"
            >
              <CheckCircle2 size={15} />
              <span>Verify Handover PIN</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div
          style={{
            backgroundColor: 'var(--status-danger-bg, #FEE2E2)',
            color: 'var(--status-danger-text, #991B1B)',
            border: '1px solid var(--status-danger-border, #F87171)',
            borderRadius: 'var(--radius-md)',
            padding: '0.625rem 0.875rem',
            fontSize: '0.8125rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Verify Handover PIN Drawer */}
      {isVerifyingOpen && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            boxShadow: 'var(--shadow-md)',
            animation: 'modal-fade-in 0.2s ease',
          }}
        >
          <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            Recipient Handover Code Verification:
          </div>

          {feedbackMsg && (
            <div
              style={{
                color: feedbackMsg.isError ? 'var(--status-danger-text)' : 'var(--status-active-text)',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              {feedbackMsg.isError ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '320px' }}>
            <input
              type="text"
              maxLength={4}
              placeholder="4-digit PIN"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              className="form-input tabular-nums"
              style={{ textAlign: 'center', letterSpacing: '0.25em', fontWeight: 700, fontSize: '1.125rem' }}
            />
            <button
              onClick={handleVerifyPin}
              disabled={pinCode.length !== 4 || isVerifying}
              className="btn btn-primary btn-sm"
              data-testid="submit-verify-pin-button"
              style={{ minWidth: '85px' }}
            >
              {isVerifying ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              <span>{isVerifying ? 'Verifying...' : 'Verify'}</span>
            </button>
          </div>
        </div>
      )}

      {/* LiveKit WebRTC Audio Call Modal */}
      <AudioCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        otherPartyName={otherPartyName}
        otherPartyRole={otherPartyRole}
        deliveryTitle={req.title}
        call={call}
      />
    </div>
  );
};
