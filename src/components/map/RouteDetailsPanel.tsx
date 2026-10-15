import React, { useState } from 'react';
import type { RouteMatchResult, DeliveryRequest, PublishedJourney } from '../../types';
import { 
  Clock, 
  ShieldCheck, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Compass, 
} from 'lucide-react';


interface RouteDetailsPanelProps {
  match: RouteMatchResult | null;
  request: DeliveryRequest | null;
  journey: PublishedJourney | null;
  onAcceptMatch: (requestId: string, journeyId: string) => Promise<boolean>;
  isComputing?: boolean;
}

export const RouteDetailsPanel: React.FC<RouteDetailsPanelProps> = ({
  match,
  request,
  journey,
  onAcceptMatch,
  isComputing
}) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);

  if (!request || !journey) {
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
        <p>Select a delivery request and commuter journey to inspect real route compatibility.</p>
      </div>
    );
  }

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      const ok = await onAcceptMatch(request.id, journey.id);
      if (ok) {
        setAcceptedSuccess(true);
      }
    } finally {
      setIsAccepting(false);
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
              <Sparkles size={12} /> Real Route Analysis
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              via OSRM Engine
            </span>
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            {request.title}
          </h3>
        </div>

        {match && (
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
        )}
      </div>

      {/* Primary Route Metrics Cards */}
      {match ? (
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
        <div className="skeleton" style={{ height: '72px', width: '100%' }} />
      )}

      {/* Sequential Route Waypoints */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-tertiary)' }}>
          Sequential Commute Path
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

          {/* 1. Origin */}
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
                Item Dropoff Location
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {request.dropoffAddress}
              </div>
            </div>
          </div>

          {/* 4. Destination */}
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
              {request.requesterName[0]}
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {request.requesterName}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ShieldCheck size={12} /> Trust Score {request.requesterTrustScore}%
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

      {/* Primary Action Button */}
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
      ) : (
        <button
          onClick={handleAccept}
          disabled={isAccepting || isComputing}
          className="btn btn-primary"
          style={{ width: '100%', padding: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          {isAccepting ? (
            <>
              <span className="spinner" style={{ width: 16, height: 16 }} />
              <span>Confirming Route Match...</span>
            </>
          ) : (
            <>
              <span>Accept Delivery Match</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
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
