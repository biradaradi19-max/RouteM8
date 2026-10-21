import React, { useState } from 'react';
import type { RouteMatchResult, DeliveryRequest, PublishedJourney } from '../../types';
import { 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Compass, 
  X,
  Package,
} from 'lucide-react';

interface RouteDetailsPanelProps {
  match: RouteMatchResult | null;
  request: DeliveryRequest | null;
  journey: PublishedJourney | null;
  onAcceptMatch: (requestId: string, journeyId?: string) => Promise<boolean>;
  onRejectRequest?: (requestId: string) => Promise<boolean>;
  isComputing?: boolean;
}

export const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = ({
  match,
  request,
  journey,
  onAcceptMatch,
  onRejectRequest,
  isComputing
}) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);
  const [rejectedSuccess, setRejectedSuccess] = useState(false);

  if (!request) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-medium)',
        color: 'var(--text-tertiary)'
      }}>
        <Compass size={32} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
        <p>Select a delivery request from the list to inspect route details and compensation.</p>
      </div>
    );
  }

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const ok = await onAcceptMatch(request.id, journey?.id);
      if (ok) {
        setAcceptedSuccess(true);
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!onRejectRequest) return;
    setIsRejecting(true);
    try {
      const ok = await onRejectRequest(request.id);
      if (ok) {
        setRejectedSuccess(true);
      }
    } finally {
      setIsRejecting(false);
    }
  };

  const isAlreadyMatched = request.status === 'matched' || request.status === 'in_transit' || request.status === 'completed';

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-medium)',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Header & Compatibility Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-brand">
              <Sparkles size={12} /> {journey ? 'Real Route Analysis' : 'Direct Errand Drop'}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              {journey ? 'via OSRM Engine' : 'No Commute Required'}
            </span>
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            {request.title}
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {request.description}
          </p>
        </div>

        {match ? (
          <div style={{
            backgroundColor: 'var(--bg-brand-subtle)',
            border: '1px solid var(--color-mint-200)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.875rem',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', fontWeight: 600 }}>
              Match Score
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--color-mint-600)', lineHeight: 1 }}>
              {match.overallMatchScore}%
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.5rem 0.75rem',
            textAlign: 'right',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)'
          }}>
            <span style={{ fontWeight: 700, color: 'var(--color-forest-800)', textTransform: 'capitalize' }}>
              {request.urgency}
            </span>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>Needed {request.neededBy}</div>
          </div>
        )}
      </div>

      {/* Primary Route Metrics Cards */}
      {journey && match ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0.875rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Clock size={13} /> Added Detour
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-forest-800)', marginTop: '0.125rem' }}>
              +{match.additionalDetourMin} min
            </div>
            <div className="tabular-nums" style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              Max allowed: {journey.maxDetourMinutes}m
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Compass size={13} /> Extra Distance
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-forest-800)', marginTop: '0.125rem' }}>
              +{match.additionalDistanceKm} km
            </div>
            <div className="tabular-nums" style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              Total: {match.detourDistanceKm} km
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ShieldCheck size={13} /> Compatibility
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-mint-600)', marginTop: '0.125rem' }}>
              {match.departureCompatibility}%
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              Departure Window
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0.875rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Compass size={13} /> Distance
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-forest-800)', marginTop: '0.125rem' }}>
              {request.distanceKm ? `${request.distanceKm} km` : 'Direct Trip'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              Est. road travel
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Clock size={13} /> Est. Duration
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-forest-800)', marginTop: '0.125rem' }}>
              {request.estimatedDurationMin ? `${request.estimatedDurationMin} min` : 'Standard'}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              Travel time
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Package size={13} /> Parcel Size
            </div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-mint-600)', marginTop: '0.125rem', textTransform: 'capitalize' }}>
              {request.itemSize}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
              {request.weightEstimateKg ? `~${request.weightEstimateKg} kg` : 'Standard package'}
            </div>
          </div>
        </div>
      )}

      {/* Sequential Route Waypoints */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
          {journey ? 'Sequential Commute Path' : 'Delivery Route Coordinates'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
          {/* Connecting Vertical Guide Line */}
          <div style={{
            position: 'absolute',
            left: '14px',
            top: '16px',
            bottom: '16px',
            width: '2px',
            backgroundColor: 'var(--border-medium)',
            zIndex: 0
          }} />

          {/* 1. Origin (if journey) */}
          {journey && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', zIndex: 1 }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-forest-850)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                flexShrink: 0
              }}>
                A
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                  Commute Origin ({journey.departureTime})
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {journey.originAddress}
                </div>
              </div>
            </div>
          )}

          {/* 2. Pickup */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', zIndex: 1 }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-mint-500)',
              color: 'var(--color-forest-950)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 800,
              flexShrink: 0
            }}>
              P
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>
                Item Pickup Location
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {request.pickupAddress}
              </div>
            </div>
          </div>

          {/* 3. Dropoff */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', zIndex: 1 }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-mint-300)',
              color: 'var(--color-forest-950)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 800,
              flexShrink: 0
            }}>
              D
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>
                Item Dropoff Destination
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {request.dropoffAddress}
              </div>
            </div>
          </div>

          {/* 4. Destination (if journey) */}
          {journey && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', zIndex: 1 }}>
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-charcoal-800)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                flexShrink: 0
              }}>
                B
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                  Commute Destination
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {journey.destAddress}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requester & Compensation Info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem',
        backgroundColor: 'var(--bg-surface-subtle)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {request.requesterAvatar ? (
            <img
              src={request.requesterAvatar}
              alt={request.requesterName}
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--color-forest-700)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
              {request.requesterName ? request.requesterName[0] : 'R'}
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {request.requesterName || 'Community Requester'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ShieldCheck size={12} /> Trust Score {request.requesterTrustScore || 98}%
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Compensation
          </div>
          <div className="tabular-nums" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
            ${request.compensation.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Primary Action Buttons */}
      {isAlreadyMatched ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          backgroundColor: 'var(--status-matched-bg)',
          color: 'var(--status-matched-text)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: '0.875rem',
          border: '1px solid var(--status-matched-border)'
        }}>
          <CheckCircle2 size={16} />
          <span>Active Match: Transporter Assigned</span>
        </div>
      ) : acceptedSuccess ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          backgroundColor: 'var(--status-active-bg)',
          color: 'var(--status-active-text)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: '0.875rem',
          border: '1px solid var(--status-active-border)'
        }}>
          <CheckCircle2 size={16} />
          <span>Match Accepted! Added to Active Deliveries</span>
        </div>
      ) : rejectedSuccess ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          color: 'var(--text-tertiary)',
          borderRadius: 'var(--radius-md)',
          fontWeight: 600,
          fontSize: '0.875rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <X size={16} />
          <span>Delivery Dismissed for Your Account</span>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {onRejectRequest && (
            <button
              onClick={handleReject}
              disabled={isRejecting || isAccepting}
              className="btn btn-secondary"
              data-testid="panel-decline-button"
              style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {isRejecting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <X size={16} />}
              <span>Decline</span>
            </button>
          )}

          <button
            onClick={handleAccept}
            disabled={isAccepting || isComputing || isRejecting}
            className="btn btn-primary"
            data-testid="panel-accept-button"
            style={{ flex: 1, padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {isAccepting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                <span>Confirming Acceptance...</span>
              </>
            ) : (
              <>
                <span>Accept Delivery</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      )}

      {/* Safety Notice */}
      <div style={{
        fontSize: '0.75rem',
        color: 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        lineHeight: 1.4
      }}>
        <ShieldCheck size={14} color="var(--color-mint-600)" style={{ flexShrink: 0 }} />
        <span>Protected by Route M8 Community Trust Escrow & 4-Digit Physical Handover PIN.</span>
      </div>
    </div>
  );
};
