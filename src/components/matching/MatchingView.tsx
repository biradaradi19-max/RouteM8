import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { MapView } from '../map/MapView';
import { RouteDetailsPanel } from '../map/RouteDetailsPanel';
import { Compass, Clock, SlidersHorizontal, AlertCircle } from 'lucide-react';
import type { DeliveryRequest } from '../../types';

export const MatchingView: React.FC = () => {
  const { user } = useAuth();
  const { 
    requests, 
    journeys, 
    selectedRequest, 
    selectedJourney, 
    activeMatch, 
    isMatchComputing, 
    selectRequestAndJourney,
    acceptDeliveryMatch,
    rejectDelivery,
    backendError,
  } = useApp();

  const [maxDetourFilter, setMaxDetourFilter] = useState<number>(20);
  const [filterMode, setFilterMode] = useState<'all' | 'corridor'>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [localSelectedRequest, setLocalSelectedRequest] = useState<DeliveryRequest | null>(null);

  // Available journeys to compare against
  const activeJourney = selectedJourney || journeys[0] || null;

  // Filter candidate requests
  const candidateRequests = requests.filter(r => {
    // 1. Must be open
    if (r.status !== 'open') return false;
    // 2. Exclude user's own requests
    if (user && r.requesterId === user.id) return false;
    // 3. Exclude requests declined by this partner
    if (user && r.rejectedBy && r.rejectedBy.includes(user.id)) return false;
    if (dismissedIds.has(r.id)) return false;

    // 4. Detour / corridor filter if active commute exists and corridor mode is selected
    if (activeJourney && filterMode === 'corridor' && r.estimatedDetourMinutes !== undefined) {
      return r.estimatedDetourMinutes <= maxDetourFilter;
    }
    return true;
  });

  const currentSelectedRequest =
    (localSelectedRequest && candidateRequests.some(r => r.id === localSelectedRequest.id))
      ? localSelectedRequest
      : (selectedRequest && candidateRequests.some(r => r.id === selectedRequest.id))
        ? selectedRequest
        : candidateRequests[0] || null;

  // Auto-trigger matching engine when active request and commute are both present
  useEffect(() => {
    if (currentSelectedRequest && activeJourney) {
      selectRequestAndJourney(currentSelectedRequest, activeJourney);
    }
  }, [currentSelectedRequest, activeJourney, selectRequestAndJourney]);

  const handleSelectRequest = (req: DeliveryRequest) => {
    setLocalSelectedRequest(req);
    if (activeJourney) {
      selectRequestAndJourney(req, activeJourney);
    }
  };

  const handleRejectRequest = async (requestId: string): Promise<boolean> => {
    setDismissedIds(prev => new Set(prev).add(requestId));
    return rejectDelivery(requestId);
  };

  return (
    <div style={{
      padding: 'clamp(1rem, 2.5vw, 2rem)',
      maxWidth: '1500px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      height: 'calc(100vh - 40px)',
      minHeight: '800px'
    }}>
      {/* Backend Synchronization Notice */}
      {backendError && (
        <div style={{
          backgroundColor: 'var(--status-cancelled-bg)',
          border: '1px solid var(--status-cancelled-border)',
          color: 'var(--status-cancelled-text)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Backend Notice:</strong> {backendError}
          </div>
        </div>
      )}

      {/* Top Header & Commute Selector */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-medium)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: 'var(--shadow-xs)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-brand-subtle)',
            color: 'var(--color-forest-800)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Compass size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-mint-600)' }}>
              Find Delivery Requests
            </div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>
              Live Errand Matching & Road Intelligence
            </h2>
          </div>
        </div>

        {/* Selected Journey Picker & Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>
            Active Commute:
          </span>
          <select
            value={activeJourney?.id || ''}
            onChange={e => {
              const j = journeys.find(item => item.id === e.target.value);
              if (j && selectedRequest) {
                selectRequestAndJourney(selectedRequest, j);
              }
            }}
            disabled={journeys.length === 0}
            className="form-select"
            style={{ width: 'auto', minWidth: '240px', padding: '0.45rem 0.75rem', fontSize: '0.8125rem' }}
          >
            {journeys.length === 0 ? (
              <option value="">No published commutes (Direct errands active)</option>
            ) : (
              journeys.map(j => (
                <option key={j.id} value={j.id}>
                  {j.vehicle} ({j.originAddress.split(',')[0]} ➔ {j.destAddress.split(',')[0]})
                </option>
              ))
            )}
          </select>

          {activeJourney && (
            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: filterMode === 'all' ? 'var(--color-forest-800)' : 'transparent',
                  color: filterMode === 'all' ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                All Open ({requests.filter(r => r.status === 'open' && (!user || r.requesterId !== user.id)).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('corridor')}
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: filterMode === 'corridor' ? 'var(--color-forest-800)' : 'transparent',
                  color: filterMode === 'corridor' ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Corridor Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split Layout: Candidate List (Left) + Interactive Map & Panel (Right) */}
      <div className="matching-layout" style={{
        display: 'grid',
        gap: '1.25rem',
        flex: 1,
        minHeight: 0
      }}>
        
        {/* Left Column: Corridor Candidate Requests */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xs)'
        }}>
          {/* Header */}
          <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>Available Delivery Requests</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  {activeJourney && filterMode === 'corridor'
                    ? 'Along your commute corridor'
                    : 'Open errands in community feed'}
                </div>
              </div>
              <span className="badge badge-brand" data-testid="available-requests-badge">
                {candidateRequests.length} Available
              </span>
            </div>

            {activeJourney && filterMode === 'corridor' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <SlidersHorizontal size={13} /> Max Detour:
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--color-forest-800)' }}>+{maxDetourFilter} min</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="35"
                  step="1"
                  value={maxDetourFilter}
                  onChange={e => setMaxDetourFilter(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--color-mint-500)', height: '4px' }}
                />
              </>
            )}
          </div>

          {/* List Scrollable Container */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {candidateRequests.length > 0 ? (
              candidateRequests.map(req => {
                const isSelected = currentSelectedRequest?.id === req.id;
                return (
                  <div
                    key={req.id}
                    onClick={() => handleSelectRequest(req)}
                    className={isSelected ? '' : 'card-interactive'}
                    data-testid={`candidate-request-${req.id}`}
                    style={{
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--color-forest-700)' : 'var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isSelected ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem', gap: '0.5rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {req.title}
                      </div>
                      <span className="tabular-nums" style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: 'var(--color-forest-850)',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '4px',
                        flexShrink: 0
                      }}>
                        ${req.compensation.toFixed(2)}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {req.description}
                    </p>

                    {/* Pickup & Dropoff snippets */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)', flexShrink: 0 }} />
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{req.pickupAddress}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-mint-300)', flexShrink: 0 }} />
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{req.dropoffAddress}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={11} /> {req.neededBy}
                      </span>
                      <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-mint-600)' }}>
                        {req.estimatedDetourMinutes !== undefined
                          ? `+${req.estimatedDetourMinutes} min detour`
                          : req.distanceKm ? `${req.distanceKm} km trip` : 'Direct Delivery'}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{
                padding: '2.5rem 1.25rem',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-medium)',
                margin: 'auto 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-brand-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-forest-800)'
                }}>
                  <SlidersHorizontal size={20} />
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  No Candidate Requests
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.4, maxWidth: '240px' }}>
                  {requests.filter(r => r.status === 'open').length === 0
                    ? 'No open delivery requests in the system yet. Post an errand request to match with commuters.'
                    : 'No requests match your current filters. Toggle "All Open" to view community errands.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Area: Interactive Map Region & Route Details */}
        <div className="matching-details-region">
          <div className="matching-map-box">
            <MapView match={activeMatch} isLoading={isMatchComputing} />
          </div>

          <div className="matching-panel-box">
            <RouteDetailsPanel
              match={activeMatch}
              request={currentSelectedRequest}
              journey={activeJourney}
              onAcceptMatch={acceptDeliveryMatch}
              onRejectRequest={handleRejectRequest}
              isComputing={isMatchComputing}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
