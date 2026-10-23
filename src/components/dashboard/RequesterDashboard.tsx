import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  PlusCircle,
  Package,
  ShieldCheck,
  CheckCircle2,
  Key,
  Search,
  DollarSign,
  Leaf,
  AlertCircle,
  MapPin,
  Clock,
  Car,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { DeliveryRequest, DeliveryStatus } from '../../types';
import { MapView } from '../map/MapView';
import { CallButton } from '../audio/CallButton';
import { AudioCallModal } from '../audio/AudioCallModal';
import { useLiveKitCall } from '../../hooks/useLiveKitCall';
import { useTransporterLocation } from '../../hooks/useTransporterLocation';

interface RequesterDashboardProps {
  onOpenCreateRequest: () => void;
  onInspectMatch: (req: DeliveryRequest) => void;
}

export const RequesterDashboard: React.FC<RequesterDashboardProps> = ({
  onOpenCreateRequest,
  onInspectMatch,
}) => {
  const { user } = useAuth();
  const {
    requests,
    backendError,
    isLoadingData,
    refreshData,
  } = useApp();

  // Search & Status filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DeliveryStatus>('all');
  const [copiedPinId, setCopiedPinId] = useState<string | null>(null);
  const [expandedMapReqId, setExpandedMapReqId] = useState<string | null>(null);

  // Audio call modal state for active delivery
  const [activeCallDelivery, setActiveCallDelivery] = useState<DeliveryRequest | null>(null);

  // Time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Filter requests belonging to this requester (or all if unauthenticated/demo)
  const myRequests = requests.filter(r => {
    if (user && r.requesterId && r.requesterId === user.id) return true;
    // For demo/unlinked requests, include them so user can immediately experience the flow
    return !user || !r.requesterId || r.requesterId === user.id;
  });

  const activeRequests = myRequests.filter(r => r.status === 'open' || r.status === 'matched' || r.status === 'in_transit');
  const inTransitRequests = myRequests.filter(r => r.status === 'in_transit' || r.status === 'matched');
  const completedRequests = myRequests.filter(r => r.status === 'completed');

  const filteredRequests = myRequests.filter(r => {
    if (!r) return false;
    const query = (searchQuery || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    const pickup = (r.pickupAddress || '').toLowerCase();
    const dropoff = (r.dropoffAddress || '').toLowerCase();

    const matchesSearch = !query || title.includes(query) || pickup.includes(query) || dropoff.includes(query);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Financial summary based on real data
  const totalSpent = completedRequests.reduce((sum, r) => sum + (Number(r.compensation) || 0), 0);
  const activeBudget = activeRequests.reduce((sum, r) => sum + (Number(r.compensation) || 0), 0);
  const co2PreventedKg = (completedRequests.length * 3.55 + inTransitRequests.length * 1.8).toFixed(1);

  // Copy PIN helper
  const handleCopyPin = (id: string, pin: string) => {
    navigator.clipboard?.writeText(pin);
    setCopiedPinId(id);
    setTimeout(() => setCopiedPinId(null), 2000);
  };

  return (
    <div style={{ padding: 'clamp(1.25rem, 3vw, 2.5rem)', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Backend Synchronization Notice */}
      {backendError && (
        <div style={{
          backgroundColor: 'var(--status-cancelled-bg)',
          border: '1px solid var(--status-cancelled-border)',
          color: 'var(--status-cancelled-text)',
          borderRadius: 'var(--radius-md)',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.875rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Sync Notice:</strong> {backendError}
            </div>
          </div>
          <button
            onClick={() => refreshData()}
            disabled={isLoadingData}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--status-cancelled-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: isLoadingData ? 'not-allowed' : 'pointer',
              color: 'var(--status-cancelled-text)'
            }}
          >
            <RefreshCw size={14} className={isLoadingData ? 'spinner' : ''} />
            <span>{isLoadingData ? 'Retrying...' : 'Retry Sync'}</span>
          </button>
        </div>
      )}

      {/* Loading Synchronization Indicator */}
      {isLoadingData && !backendError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          fontSize: '0.8125rem',
          color: 'var(--color-mint-600)',
          backgroundColor: 'var(--bg-brand-subtle)',
          border: '1px solid var(--border-subtle)',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius-md)'
        }}>
          <span className="spinner" style={{ width: 14, height: 14 }} />
          <span>Synchronizing your requests with Route M8 network...</span>
        </div>
      )}

      {/* 1. Requester Welcome Banner */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-medium)',
        padding: 'clamp(1.5rem, 3vw, 2.25rem)',
        boxShadow: 'var(--shadow-xs)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.5rem',
        position: 'relative'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-brand">
              <Package size={13} /> Requester Portal
            </span>
            <span className="badge badge-verified">
              <ShieldCheck size={13} /> {user?.organization || 'Verified Requester'}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-mint-600)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              ★ {user?.trustScore || 98}% Trust Score
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.125rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
            {getGreeting()}, {user?.fullName ? user.fullName.split(' ')[0] : 'Requester'}
          </h1>
          <p style={{ maxWidth: '640px', margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Need groceries, parcels, or university campus items transported? Route M8 matches your delivery needs with verified commuters already traveling that way.
          </p>
        </div>

        {/* Primary Action Button */}
        <div>
          <button
            onClick={onOpenCreateRequest}
            className="btn btn-primary"
            style={{ padding: '0.875rem 1.625rem', fontSize: '0.9375rem', boxShadow: 'var(--shadow-sm)' }}
          >
            <PlusCircle size={20} />
            <span>Request a Delivery</span>
          </button>
        </div>
      </div>

      {/* 2. Requester KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* KPI 1: Active Requests */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Active Requests</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-50)', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {activeRequests.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={13} /> <span className="tabular-nums">{inTransitRequests.length}</span> currently in transit / matched
            </div>
          </div>
        </div>

        {/* KPI 2: Completed Deliveries */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Completed Deliveries</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-brand-subtle)', color: 'var(--color-forest-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {completedRequests.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              100% verified with 4-digit security PIN
            </div>
          </div>
        </div>

        {/* KPI 3: Compensation Summary */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Compensation Spent</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              ${(Number(totalSpent) || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              + ${(Number(activeBudget) || 0).toFixed(2)} in active escrow
            </div>
          </div>
        </div>

        {/* KPI 4: Carbon Prevented */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Carbon Prevented</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-100)', color: 'var(--color-mint-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {co2PreventedKg} kg
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              Saved by pooling with commuter trips
            </div>
          </div>
        </div>
      </div>

      {/* 3. In-Transit Deliveries: Live Tracking & Transporter Contact */}
      {inTransitRequests.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Active Delivery Tracking & Handover
              </h2>
              <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
                Track your parcel in transit, contact your assigned transporter, and keep your secret PIN ready for recipient handover.
              </p>
            </div>
            <span className="badge badge-active">
              {inTransitRequests.length} In Progress
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {inTransitRequests.map(del => {
              const isMapOpen = expandedMapReqId === del.id;
              return (
                <div
                  key={del.id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    border: '1px solid var(--border-medium)',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  {/* Delivery Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                        <span className={`badge ${del.status === 'in_transit' ? 'badge-active' : 'badge-matched'}`}>
                          {del.status === 'in_transit' ? 'In Transit' : 'Transporter Matched'}
                        </span>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={13} /> Needed by {del.neededBy}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.1875rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {del.title}
                      </h3>
                      <p style={{ fontSize: '0.875rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
                        {del.description}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Offered Compensation
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
                        ${(Number(del.compensation) || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Route Corridor Preview */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '0.75rem',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    padding: '0.875rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8125rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)', marginTop: '5px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Pickup</div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{del.pickupAddress || 'Address not specified'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-forest-800)', marginTop: '5px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Dropoff</div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{del.dropoffAddress || 'Address not specified'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Assigned Transporter Card & Audio Calling */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    padding: '0.875rem 1.125rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-forest-850)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        flexShrink: 0
                      }}>
                        {del.transporterName ? del.transporterName[0] : 'T'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                            {del.transporterName || 'Verified Route Commuter'}
                          </span>
                          <span className="badge badge-brand" style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}>
                            <ShieldCheck size={11} /> 99% Reliable
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Car size={13} /> {del.transporterVehicle || 'Everyday Commuter Vehicle'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Transporter Audio Call Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CallButton
                        onClick={() => setActiveCallDelivery(del)}
                        otherPartyRole="Transporter"
                        otherPartyName={del.transporterName}
                      />
                      <button
                        onClick={() => setExpandedMapReqId(isMapOpen ? null : del.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                      >
                        <MapPin size={14} />
                        <span>{isMapOpen ? 'Hide Map' : 'Track on Map'}</span>
                        {isMapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Live GPS Map */}
                  {isMapOpen && (
                    <RequesterLiveTrackingMap delivery={del} />
                  )}

                  {/* Handover PIN Display Banner */}
                  <div style={{
                    backgroundColor: 'var(--bg-brand-subtle)',
                    border: '1px dashed var(--color-forest-600)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.875rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-forest-850)',
                        color: 'var(--color-mint-400)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Key size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-forest-950)' }}>
                          Your 4-Digit Handover Security PIN
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Share this PIN with your transporter only when you physically receive the item.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: 800,
                          letterSpacing: '0.15em',
                          color: 'var(--color-forest-900)',
                          backgroundColor: 'var(--bg-surface)',
                          padding: '0.25rem 0.875rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-medium)',
                          boxShadow: 'var(--shadow-xs)'
                        }}
                      >
                        {del.handoverPin || '9421'}
                      </div>
                      <button
                        onClick={() => handleCopyPin(del.id, del.handoverPin || '9421')}
                        className="btn btn-secondary btn-sm"
                        title="Copy PIN"
                        style={{ padding: '0.4rem 0.625rem' }}
                      >
                        {copiedPinId === del.id ? <Check size={14} color="var(--color-mint-600)" /> : <Copy size={14} />}
                        <span style={{ fontSize: '0.75rem' }}>{copiedPinId === del.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Progress Visualizer */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0.5rem',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    {[
                      { step: 1, label: 'Requested', done: true },
                      { step: 2, label: 'Matched', done: true },
                      { step: 3, label: 'In Transit', done: del.status === 'in_transit' },
                      { step: 4, label: 'Delivered', done: del.status === 'completed' },
                    ].map(item => (
                      <div key={item.step} style={{ textAlign: 'center' }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: item.done ? 'var(--color-mint-500)' : 'var(--border-medium)',
                          color: item.done ? 'var(--color-forest-950)' : 'var(--text-tertiary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          margin: '0 auto 0.25rem'
                        }}>
                          {item.done ? '✓' : item.step}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: item.done ? 700 : 500, color: item.done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. My Requests List & Status Filter */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              My Delivery Requests
            </h2>
            <p style={{ fontSize: '0.875rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
              All parcels, groceries, and items you have posted for community delivery.
            </p>
          </div>

          {/* Search bar & filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="Search requests..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.25rem', paddingRight: '0.75rem', fontSize: '0.8125rem' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="form-select"
              style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem', width: 'auto' }}
            >
              <option value="all">All Statuses ({myRequests.length})</option>
              <option value="open">Open</option>
              <option value="matched">Matched</option>
              <option value="in_transit">In Transit</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Requests Grid */}
        {filteredRequests.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1.25rem'
          }}>
            {filteredRequests.map(req => {
              const statusBadgeClass =
                req.status === 'open' ? 'badge-pending' :
                req.status === 'matched' ? 'badge-matched' :
                req.status === 'in_transit' ? 'badge-active' :
                req.status === 'completed' ? 'badge-completed' :
                'badge-secondary';

              return (
                <div
                  key={req.id}
                  className="card-interactive"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                  }}
                >
                  <div>
                    {/* Status & Category */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.375rem' }}>
                      <span className={`badge ${statusBadgeClass}`}>
                        {req.status === 'open' ? (
                          req.dispatchStatus === 'expanding_search'
                            ? 'Finding More Partners'
                            : req.dispatchStatus === 'no_partner_available'
                            ? 'No Partner Available'
                            : 'Searching for a partner'
                        ) : req.status === 'matched' ? (
                          'Partner Assigned'
                        ) : (
                          req.status.replace('_', ' ')
                        )}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                        {req.category || 'Package'}
                      </span>
                    </div>

                    {/* Progressive Dispatch Progress Callout */}
                    {req.status === 'open' && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 0.625rem',
                        marginBottom: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: req.dispatchStatus === 'no_partner_available' ? 'var(--status-cancelled-bg)' : 'var(--color-mint-50)',
                        border: `1px solid ${req.dispatchStatus === 'no_partner_available' ? 'var(--status-cancelled-border)' : 'var(--color-mint-200)'}`,
                        fontSize: '0.75rem',
                        color: req.dispatchStatus === 'no_partner_available' ? 'var(--status-cancelled-text)' : 'var(--color-mint-700)',
                        fontWeight: 600
                      }}>
                        <Radio size={13} className={req.dispatchStatus !== 'no_partner_available' ? 'animate-pulse' : ''} style={{ flexShrink: 0 }} />
                        <span>
                          {req.dispatchStatus === 'expanding_search'
                            ? 'Expanding radius to 6 km and matching commute routes...'
                            : req.dispatchStatus === 'no_partner_available'
                            ? 'No partner available currently. Expand offer or retry.'
                            : 'Searching for a partner within 3 km pickup radius...'}
                        </span>
                      </div>
                    )}

                    <h3 style={{ fontSize: '1.0625rem', margin: '0 0 0.375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {req.title}
                    </h3>
                    <p style={{ fontSize: '0.8125rem', margin: 0, color: 'var(--text-secondary)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {req.description}
                    </p>

                    {/* Corridor endpoints */}
                    <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Pickup: {req.pickupAddress}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-charcoal-700)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Dropoff: {req.dropoffAddress}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Compensation & PIN */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.875rem',
                    borderTop: '1px solid var(--border-subtle)'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Compensation
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
                        ${(Number(req.compensation) || 0).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {req.handoverPin && (
                        <span
                          className="tabular-nums"
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)'
                          }}
                          title="Recipient Handover PIN"
                        >
                          PIN: {req.handoverPin}
                        </span>
                      )}
                      <button
                        onClick={() => onInspectMatch(req)}
                        className="btn btn-secondary btn-sm"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty state for Requester */
          <div className="empty-state-box">
            <div className="empty-state-icon-wrap">
              <Package size={28} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                {searchQuery || statusFilter !== 'all' ? 'No Requests Match Your Filter' : 'No Delivery Requests Yet'}
              </h3>
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or resetting the status filter.'
                  : 'Post your first errand, campus item, or package to connect with everyday commuters.'}
              </p>
            </div>
            <button
              onClick={onOpenCreateRequest}
              className="btn btn-primary btn-sm"
              style={{ marginTop: '0.5rem' }}
            >
              <PlusCircle size={15} />
              <span>Post Your First Delivery Request</span>
            </button>
          </div>
        )}
      </section>

      {/* Audio Call Modal for Customer-Transporter contact */}
      {activeCallDelivery && (
        <RequesterAudioCallWrapper
          delivery={activeCallDelivery}
          onClose={() => setActiveCallDelivery(null)}
        />
      )}

    </div>
  );
};

// Sub-component wrapper for LiveKit Audio Call in Requester context
const RequesterAudioCallWrapper: React.FC<{
  delivery: DeliveryRequest;
  onClose: () => void;
}> = ({ delivery, onClose }) => {
  const otherPartyName = delivery.transporterName || 'Transporter';
  const call = useLiveKitCall({
    deliveryId: delivery.id,
    deliveryStatus: delivery.status,
    deliveryTitle: delivery.title,
    otherPartyName,
  });

  return (
    <AudioCallModal
      isOpen={true}
      onClose={onClose}
      otherPartyName={otherPartyName}
      otherPartyRole="Transporter"
      deliveryTitle={delivery.title}
      call={call}
    />
  );
};

// Sub-component wrapper for Live GPS Map in Requester context
const RequesterLiveTrackingMap: React.FC<{ delivery: DeliveryRequest }> = ({ delivery }) => {
  const { location, isStale } = useTransporterLocation({
    deliveryId: delivery.id,
    deliveryStatus: delivery.status,
    isTransporter: false,
  });

  const isLive = delivery.status === 'in_transit' && !!location && !isStale;

  return (
    <div style={{
      border: '1px solid var(--border-medium)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      animation: 'modal-fade-in 0.2s ease'
    }}>
      <div style={{
        padding: '0.5rem 1rem',
        backgroundColor: 'var(--bg-surface-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        fontSize: '0.8125rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Radio size={14} color={isLive ? 'var(--color-mint-500)' : 'var(--text-tertiary)'} className={isLive ? 'pulse-animation' : ''} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            {delivery.status === 'in_transit'
              ? (location ? (isStale ? 'Last recorded transporter location' : 'Live Transporter GPS Streaming') : 'Waiting for transporter GPS signal...')
              : 'Delivery assigned • Transporter preparing pickup'}
          </span>
        </div>
        {delivery.estimatedDurationMin && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Est. transit time: ~{Math.round(delivery.estimatedDurationMin)} mins
          </span>
        )}
      </div>

      <div style={{ height: '280px' }}>
        <MapView
          pickupCoords={delivery.pickupCoords}
          dropoffCoords={delivery.dropoffCoords}
          pickupAddress={delivery.pickupAddress}
          dropoffAddress={delivery.dropoffAddress}
          transporterLocation={location}
          isLiveTracking={isLive}
        />
      </div>
    </div>
  );
};
