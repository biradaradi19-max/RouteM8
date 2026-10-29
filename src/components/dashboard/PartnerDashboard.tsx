import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import {
  Car,
  Package,
  ShieldCheck,
  CheckCircle2,
  Search,
  DollarSign,
  Leaf,
  AlertCircle,
  Clock,
  Radio,
  MapPin,
  ChevronDown,
  ChevronUp,
  Power,
  Navigation,
  X,
  RefreshCw,
} from 'lucide-react';
import type { DeliveryRequest, PublishedJourney, TransporterLocation } from '../../types';
import { calculateHaversineDistance } from '../../services/routing';
import { MapView } from '../map/MapView';
import { CallButton } from '../audio/CallButton';
import { AudioCallModal } from '../audio/AudioCallModal';
import { useLiveKitCall } from '../../hooks/useLiveKitCall';
import { useTransporterLocation } from '../../hooks/useTransporterLocation';
import { usePartnerDiscoveryLocation } from '../../hooks/usePartnerDiscoveryLocation';
import { deliveriesApi } from '../../services/api';
import { PartnerIdentityVerificationModal } from '../verification/PartnerIdentityVerificationModal';

function formatLastUpdated(date: Date | null): string {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours > 1 ? 's' : ''} ago`;
}

interface PartnerDashboardProps {
  onOpenPublishJourney: () => void;
  onInspectMatch: (req: DeliveryRequest, journey?: PublishedJourney) => void;
}

export const PartnerDashboard: React.FC<PartnerDashboardProps> = ({
  onOpenPublishJourney,
  onInspectMatch,
}) => {
  const { user } = useAuth();
  const {
    requests,
    journeys,
    partnerAvailable,
    setPartnerAvailable,
    acceptDeliveryMatch,
    rejectDelivery,
    acceptError,
    updateRequestStatus,
    backendError,
    isLoadingData,
    refreshData,
  } = useApp();

  // Search & Filter state for Matching Opportunities
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Active delivery PIN verification state
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [expandedMapReqId, setExpandedMapReqId] = useState<string | null>(null);

  // Audio call modal state for contacting customer
  const [activeCallDelivery, setActiveCallDelivery] = useState<DeliveryRequest | null>(null);

  // Partner Face/Identity verification modal state
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  // Accepting & Rejecting match feedback state
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [acceptMessage, setAcceptMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Location-based Nearby Delivery Discovery
  const {
    coords: partnerGpsCoords,
    locationStatus,
    errorMessage: locationErrorMessage,
    lastUpdated: locationLastUpdated,
    refreshLocation,
  } = usePartnerDiscoveryLocation();

  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(5);
  const [nearbyDeliveries, setNearbyDeliveries] = useState<DeliveryRequest[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const lastFetchRef = useRef<string>('');

  const fetchNearby = useCallback(async (lat: number, lng: number, radiusKm: number) => {
    const fetchKey = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`;
    setIsLoadingNearby(true);
    setNearbyError(null);
    lastFetchRef.current = fetchKey;
    try {
      const data = await deliveriesApi.getNearbyDeliveries({ lat, lng, radiusKm });
      if (lastFetchRef.current === fetchKey) {
        setNearbyDeliveries(data);
      }
    } catch (err: any) {
      if (lastFetchRef.current === fetchKey) {
        setNearbyError(err.message || 'Unable to load nearby deliveries');
      }
    } finally {
      if (lastFetchRef.current === fetchKey) {
        setIsLoadingNearby(false);
      }
    }
  }, []);

  useEffect(() => {
    if (locationStatus === 'ready' && partnerGpsCoords) {
      fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
    }
  }, [locationStatus, partnerGpsCoords, searchRadiusKm, fetchNearby]);

  useEffect(() => {
    let isMounted = true;
    let cleanupSocket: (() => void) | undefined;

    getSocket().then((s) => {
      if (!isMounted) return;
      const handleSocketRefresh = () => {
        if (locationStatus === 'ready' && partnerGpsCoords) {
          fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
        }
      };

      s.on('delivery:created', handleSocketRefresh);
      s.on('delivery:new', handleSocketRefresh);
      s.on('delivery:claimed', handleSocketRefresh);
      s.on('delivery:cancelled', handleSocketRefresh);
      s.on('delivery:updated', handleSocketRefresh);

      cleanupSocket = () => {
        s.off('delivery:created', handleSocketRefresh);
        s.off('delivery:new', handleSocketRefresh);
        s.off('delivery:claimed', handleSocketRefresh);
        s.off('delivery:cancelled', handleSocketRefresh);
        s.off('delivery:updated', handleSocketRefresh);
      };
    }).catch(() => {});

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && locationStatus === 'ready' && partnerGpsCoords) {
        fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
      }
    };
    const handleFocus = () => {
      if (locationStatus === 'ready' && partnerGpsCoords) {
        fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      cleanupSocket?.();
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [locationStatus, partnerGpsCoords, searchRadiusKm, fetchNearby]);

  // Active deliveries for this partner (or all in demo mode)
  const myAssignedDeliveries = requests.filter(r => {
    if (user && r.transporterId && r.transporterId === user.id) return true;
    return r.status === 'matched' || r.status === 'in_transit';
  });

  const activeDeliveries = myAssignedDeliveries.filter(r => r.status === 'matched' || r.status === 'in_transit');
  const completedDeliveries = requests.filter(r => {
    if (user && r.transporterId && r.transporterId === user.id) return r.status === 'completed';
    return r.status === 'completed';
  });

  // Filter helper for requests
  const filterRequest = (r: DeliveryRequest) => {
    if (!r || r.status !== 'open') return false;
    // Security check: cannot accept own request
    if (user && r.requesterId === user.id) return false;
    // Dismissal check: dismiss for this partner if rejected
    if (user && r.rejectedBy && r.rejectedBy.includes(user.id)) return false;
    if (dismissedIds.has(r.id)) return false;

    const query = (searchQuery || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    const pickup = (r.pickupAddress || '').toLowerCase();
    const dropoff = (r.dropoffAddress || '').toLowerCase();

    const matchesSearch = !query || title.includes(query) || pickup.includes(query) || dropoff.includes(query);
    const matchesCat = selectedCategory === 'all' || r.category === selectedCategory;
    return matchesSearch && matchesCat;
  };

  // Open requests available to be matched and accepted from corridor/context
  const openRequests = requests.filter(filterRequest);

  // Active nearby discoveries fetched via GPS
  const activeNearbyDeliveries = nearbyDeliveries.filter(filterRequest);

  // Use location-based nearby deliveries if GPS is ready; fallback to corridor openRequests if provided
  const displayedDeliveries = locationStatus === 'ready' ? activeNearbyDeliveries : openRequests;

  // Track any open requests created by the current user
  const myOwnOpenRequests = requests.filter(r => user && r.requesterId === user.id && r.status === 'open');

  // Real dynamic earnings calculation
  const totalEarned = completedDeliveries.reduce((sum, r) => sum + (Number(r.compensation) || 0), 0);
  const pendingEarnings = activeDeliveries.reduce((sum, r) => sum + (Number(r.compensation) || 0), 0);
  const defaultJourney = journeys[0];

  // Broadcast partner availability and location to Socket.IO backend for smart dispatch
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    getSocket().then((s) => {
      if (!isMounted) return;
      s.emit('partner:presence', { isAvailable: partnerAvailable });

      if (defaultJourney) {
        s.emit('partner:journey', {
          originCoords: defaultJourney.originCoords,
          destCoords: defaultJourney.destCoords,
          maxDetourMinutes: defaultJourney.maxDetourMinutes,
        });
      }

      if (partnerAvailable && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!isMounted) return;
            s.emit('partner:location', {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              isAvailable: true,
            });
          },
          (err) => {
            // Never report approximate/default coordinates as verified live GPS
            console.warn('[PartnerDashboard] Geolocation unavailable or denied:', err.message);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    }).catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [user, partnerAvailable, defaultJourney]);

  // Verify PIN submission
  const handleVerifyPin = async (requestId: string) => {
    setPinError(null);
    setPinSuccess(null);
    setIsVerifying(true);
    try {
      const res = await updateRequestStatus(requestId, 'completed', pinInput);
      if (res.success) {
        setPinSuccess('PIN verified successfully! Handover confirmed and compensation released to your balance.');
        setPinInput('');
        setTimeout(() => {
          setVerifyingRequestId(null);
          setPinSuccess(null);
        }, 2200);
      } else {
        setPinError(res.message || 'Incorrect PIN code. Please confirm with the recipient.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Accept a matching request
  const handleAcceptRequest = async (requestId: string) => {
    if (!partnerAvailable) {
      setPartnerAvailable(true);
    }
    const targetJourney = journeys[0];
    setAcceptingId(requestId);
    setAcceptMessage(null);
    try {
      const success = await acceptDeliveryMatch(requestId, targetJourney?.id);
      if (success) {
        setNearbyDeliveries(prev => prev.filter(r => r.id !== requestId));
        setAcceptMessage({ text: 'Delivery request accepted! It is now in your active deliveries list.', isError: false });
        setTimeout(() => setAcceptMessage(null), 3500);
      } else {
        setAcceptMessage({
          text: acceptError || 'Unable to accept this delivery. It may have already been accepted by another partner.',
          isError: true,
        });
      }
    } finally {
      setAcceptingId(null);
    }
  };

  // Reject / dismiss a request for this partner only
  const handleRejectRequest = async (requestId: string) => {
    setRejectingId(requestId);
    setAcceptMessage(null);
    try {
      setDismissedIds(prev => new Set(prev).add(requestId));
      setNearbyDeliveries(prev => prev.filter(r => r.id !== requestId));
      const success = await rejectDelivery(requestId);
      if (success) {
        setAcceptMessage({ text: 'Delivery opportunity dismissed for your account.', isError: false });
        setTimeout(() => setAcceptMessage(null), 2500);
      } else {
        setAcceptMessage({ text: 'Could not dismiss delivery opportunity on server.', isError: true });
      }
    } finally {
      setRejectingId(null);
    }
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
          <span>Synchronizing community corridors with database...</span>
        </div>
      )}

      {/* Feedback banner for match acceptance */}
      {acceptMessage && (
        <div style={{
          backgroundColor: acceptMessage.isError ? 'var(--status-cancelled-bg)' : 'var(--bg-brand-subtle)',
          border: `1px solid ${acceptMessage.isError ? 'var(--status-cancelled-border)' : 'var(--color-mint-500)'}`,
          color: acceptMessage.isError ? 'var(--status-cancelled-text)' : 'var(--color-forest-900)',
          borderRadius: 'var(--radius-md)',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem'
        }}>
          {acceptMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} color="var(--color-mint-600)" />}
          <span>{acceptMessage.text}</span>
        </div>
      )}

      {/* 1. Delivery Partner Header Banner & Availability Switcher */}
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
              <Car size={13} /> Delivery Partner Portal
            </span>
            <span className="badge badge-verified">
              <ShieldCheck size={13} /> {user?.commuteVehicle || 'Verified Commuter'}
            </span>

            {/* Partner Identity Verification Status Badge / Trigger */}
            {user?.verificationStatus === 'pending_review' ? (
              <span
                className="badge badge-warning"
                data-testid="partner-identity-pending-badge"
                title="Your identity selfie is under review by the Route M8 safety team"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ShieldCheck size={13} /> Identity: Pending Review
              </span>
            ) : user?.verificationStatus === 'verified' || user?.verificationStatus === 'gov_id_verified' ? (
              <span
                className="badge badge-verified"
                data-testid="partner-identity-verified-badge"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ShieldCheck size={13} /> Identity Verified
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsVerificationModalOpen(true)}
                className="btn btn-secondary btn-sm"
                data-testid="verify-partner-identity-button"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.6rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
                title="Verify your delivery partner identity with a consent-based selfie check"
              >
                <ShieldCheck size={13} color="var(--color-mint-600)" />
                <span>Verify Identity</span>
              </button>
            )}
            
            {/* Real Persisted Availability Pill Toggle */}
            <button
              onClick={() => setPartnerAvailable(!partnerAvailable)}
              className={`availability-pill ${partnerAvailable ? 'online' : 'offline'}`}
              title="Click to toggle your availability for new delivery jobs"
              style={{ cursor: 'pointer', border: 'none' }}
            >
              <span className="dot" />
              <span>{partnerAvailable ? 'Online • Accepting Jobs' : 'Offline • Paused'}</span>
            </button>
          </div>

          <h1 style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2.125rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
            Commuter Partner Dashboard
          </h1>
          <p style={{ maxWidth: '640px', margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {partnerAvailable
              ? 'You are active along your corridors. Accept near-zero detour requests along your daily commute to offset fuel and reduce community emissions.'
              : 'You are currently offline. Turn availability on when you are ready to receive matching errand opportunities along your route.'}
          </p>
        </div>

        {/* Primary Partner Action */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenPublishJourney}
            className="btn btn-primary"
            style={{ padding: '0.875rem 1.625rem', fontSize: '0.9375rem', boxShadow: 'var(--shadow-sm)' }}
          >
            <Car size={18} />
            <span>Publish My Journey</span>
          </button>
        </div>
      </div>

      {/* 2. Partner Impact & Earnings KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* KPI 1: Active In-Flight Deliveries */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Active Deliveries</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-50)', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {activeDeliveries.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={13} /> <span className="tabular-nums">{openRequests.length}</span> nearby requests available
            </div>
          </div>
        </div>

        {/* KPI 2: Published Corridors */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Published Corridors</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-brand-subtle)', color: 'var(--color-forest-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {journeys.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {journeys[0]?.departureTime ? `Next departure: ${journeys[0].departureTime}` : 'Ready for corridor match'}
            </div>
          </div>
        </div>

        {/* KPI 3: Total Earnings */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Total Earnings</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              ${(Number(totalEarned) || 0).toFixed(2)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              + ${(Number(pendingEarnings) || 0).toFixed(2)} in active transit
            </div>
          </div>
        </div>

        {/* KPI 4: Detour Efficiency */}
        <div className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Detour Efficiency</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-100)', color: 'var(--color-mint-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={18} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              &lt; 7.5 min
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              Average detour along daily commute
            </div>
          </div>
        </div>
      </div>

      {/* 3. My Active Deliveries (With In-Transit & Recipient PIN Verification) */}
      {activeDeliveries.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                My Active Deliveries
              </h2>
              <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
                Verify physical recipient handover with the 4-digit security code provided by the customer.
              </p>
            </div>
            <span className="badge badge-matched">
              {activeDeliveries.length} Operations Active
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {activeDeliveries.map(del => {
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                        <span className={`badge ${del.status === 'in_transit' ? 'badge-active' : 'badge-matched'}`}>
                          {del.status === 'matched' ? 'Assigned to You' : 'In Transit (GPS Live)'}
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
                        Your Compensation
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
                        ${(Number(del.compensation) || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Endpoints */}
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

                  {/* Customer Contact & GPS Controls Bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-medium)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        flexShrink: 0
                      }}>
                        {del.requesterName ? del.requesterName[0] : 'C'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          {del.requesterName || 'Customer / Requester'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Recipient will provide you the 4-digit PIN upon arrival
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CallButton
                        onClick={() => setActiveCallDelivery(del)}
                        otherPartyRole="Customer"
                        otherPartyName={del.requesterName}
                      />
                      <button
                        onClick={() => setExpandedMapReqId(isMapOpen ? null : del.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                      >
                        <MapPin size={14} />
                        <span>{isMapOpen ? 'Hide Route' : 'Route & GPS'}</span>
                        {isMapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Live GPS Route Map & Controls */}
                  {isMapOpen && (
                    <PartnerLiveMapWithGps delivery={del} />
                  )}

                  {/* Actions & PIN Handover section */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-subtle)'
                  }}>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {del.status === 'matched' ? (
                        <span>Ready to head out? Switch to <strong>In-Transit</strong> mode to notify the customer.</span>
                      ) : (
                        <span>Item in transit. Ask the recipient for their <strong>4-digit handover PIN</strong> to complete.</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {del.status === 'matched' && (
                        <button
                          onClick={() => updateRequestStatus(del.id, 'in_transit')}
                          className="btn btn-secondary btn-sm"
                        >
                          <Navigation size={14} />
                          <span>Start Transit Mode</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setVerifyingRequestId(verifyingRequestId === del.id ? null : del.id);
                          setPinError(null);
                          setPinSuccess(null);
                        }}
                        className="btn btn-accent btn-sm"
                      >
                        <CheckCircle2 size={14} />
                        <span>Verify Handover PIN</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Handover PIN Input */}
                  {verifyingRequestId === del.id && (
                    <div style={{
                      backgroundColor: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: 'var(--shadow-md)',
                      animation: 'modal-fade-in 0.2s ease'
                    }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                        Enter 4-Digit Handover PIN provided by the recipient:
                      </div>

                      {pinError && (
                        <div style={{ color: 'var(--status-danger-text)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <AlertCircle size={14} /> {pinError}
                        </div>
                      )}

                      {pinSuccess && (
                        <div style={{ color: 'var(--status-active-text)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle2 size={14} /> {pinSuccess}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '340px' }}>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="e.g. 9421"
                          value={pinInput}
                          onChange={e => setPinInput(e.target.value)}
                          className="form-input tabular-nums"
                          style={{ textAlign: 'center', letterSpacing: '0.25em', fontWeight: 700, fontSize: '1.125rem' }}
                        />
                        <button
                          onClick={() => handleVerifyPin(del.id)}
                          disabled={pinInput.length !== 4 || isVerifying}
                          className="btn btn-primary btn-sm"
                          style={{ minWidth: '100px' }}
                        >
                          {isVerifying ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                          <span>{isVerifying ? 'Checking...' : 'Confirm'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Find Requests: Matching Opportunities Along Commute Routes */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Find Delivery Requests (Corridor Opportunities)
            </h2>
            <p style={{ fontSize: '0.875rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
              Open delivery requests with low detour minutes along popular Bay Area commuter routes.
            </p>
          </div>

          {/* Search bar & Category filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '220px' }}>
              <input
                type="text"
                placeholder="Search pickup/dropoff..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.25rem', paddingRight: '0.75rem', fontSize: '0.8125rem' }}
              />
              <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="form-select"
              style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem', width: 'auto' }}
            >
              <option value="all">All Categories</option>
              <option value="food">Food & Groceries</option>
              <option value="documents">Documents</option>
              <option value="electronics">Electronics</option>
              <option value="campus_item">Campus Items</option>
            </select>
          </div>
        </div>

        {/* Not Available Notice */}
        {!partnerAvailable && (
          <div style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px dashed var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Power size={18} color="var(--text-tertiary)" />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                You are currently in <strong>Offline Mode</strong>. Toggle availability to online to accept requests.
              </span>
            </div>
            <button
              onClick={() => setPartnerAvailable(true)}
              className="btn btn-secondary btn-sm"
            >
              Turn Online
            </button>
          </div>
        )}

        {/* Location Acquisition & Permission Status Banners */}
        {locationStatus === 'getting_location' && (
          <div
            className="card"
            style={{
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.875rem',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '1.25rem',
            }}
          >
            <Radio size={20} className="animate-pulse" style={{ color: 'var(--color-mint-600)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                Getting your location…
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Acquiring high-accuracy GPS coordinates to discover nearby deliveries.
              </div>
            </div>
          </div>
        )}

        {locationStatus === 'permission_denied' && (
          <div
            className="card"
            style={{
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              backgroundColor: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger-border)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertCircle size={20} style={{ color: 'var(--status-danger-text)', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--status-danger-text)' }}>
                  Location permission required
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {locationErrorMessage || 'Please allow Route M8 to access your device location in browser settings to discover nearby pickup requests.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshLocation()}
              className="btn btn-secondary btn-sm"
            >
              Retry GPS
            </button>
          </div>
        )}

        {(locationStatus === 'timeout' || locationStatus === 'unavailable' || locationStatus === 'error') && (
          <div
            className="card"
            style={{
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertCircle size={20} style={{ color: '#D97706', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                  Unable to get location — Retry
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  {locationErrorMessage || 'Could not acquire your device GPS position. Please check your location settings and retry.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refreshLocation()}
              className="btn btn-primary btn-sm"
            >
              Retry GPS
            </button>
          </div>
        )}

        {/* Location Radius & Refresh Controls */}
        {locationStatus === 'ready' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1.25rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Showing deliveries within {searchRadiusKm} km ({displayedDeliveries.length} found)
              </span>
              {locationLastUpdated && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  • Last updated: {formatLastUpdated(locationLastUpdated)}
                </span>
              )}
              {isLoadingNearby && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  <RefreshCw size={12} className="animate-spin" /> Finding nearby deliveries…
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)', overflow: 'hidden' }}>
                {[5, 10, 15].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    onClick={() => setSearchRadiusKm(radius)}
                    className={`btn btn-sm ${searchRadiusKm === radius ? 'btn-primary' : 'btn-ghost'}`}
                    style={{
                      borderRadius: 0,
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.8125rem',
                      fontWeight: searchRadiusKm === radius ? 700 : 500,
                    }}
                  >
                    {radius} km
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  refreshLocation();
                  if (partnerGpsCoords) {
                    fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
                  }
                }}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.35rem 0.75rem' }}
                title="Refresh Location & Deliveries"
              >
                <RefreshCw size={13} className={isLoadingNearby ? 'animate-spin' : ''} />
                <span>Refresh Location</span>
              </button>
            </div>
          </div>
        )}

        {/* Nearby Fetch Error Notice */}
        {nearbyError && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--status-danger-text)',
              fontSize: '0.8125rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={15} />
            <span>{nearbyError}</span>
          </div>
        )}

        {/* Requests Grid */}
        {displayedDeliveries.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1.25rem'
          }}>
            {displayedDeliveries.map(req => {
              const isAccepting = acceptingId === req.id;
              const isRejecting = rejectingId === req.id;
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
                    {/* Detour badge & category */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.375rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {req.pickupDistanceKm != null ? (
                          <span className="tabular-nums" style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--color-mint-600)',
                            backgroundColor: 'var(--color-mint-50)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-full)'
                          }}>
                            📍 {req.pickupDistanceKm.toFixed(1)} km away
                          </span>
                        ) : (
                          <span className="tabular-nums" style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--color-mint-600)',
                            backgroundColor: 'var(--color-mint-50)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-full)'
                          }}>
                            +{req.estimatedDetourMinutes || 5} min detour
                          </span>
                        )}

                        {req.matchType === 'corridor' && (
                          <span style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: 'var(--color-forest-900)',
                            backgroundColor: 'var(--color-mint-100)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--color-mint-300)'
                          }}>
                            ⚡ Route Match
                          </span>
                        )}
                        {req.matchType === 'nearby' && (
                          <span style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: 'var(--color-forest-800)',
                            backgroundColor: 'var(--bg-surface-subtle)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--border-medium)'
                          }}>
                            📍 Nearby Match
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                        {req.itemSize || 'standard'} item • {req.urgency || 'standard'}
                      </span>
                    </div>

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
                          Pickup: {req.pickupAddress || 'Address not specified'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-charcoal-700)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Dropoff: {req.dropoffAddress || 'Address not specified'}
                        </span>
                      </div>
                    </div>

                    {/* Trip Distance, ETA, and Needed By */}
                    <div style={{
                      marginTop: '0.875rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.75rem',
                      textAlign: 'center'
                    }}>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>Distance</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {req.distanceKm != null ? `${req.distanceKm.toFixed(1)} km` : (Array.isArray(req.pickupCoords) && req.pickupCoords.length >= 2 && Array.isArray(req.dropoffCoords) && req.dropoffCoords.length >= 2 ? `${calculateHaversineDistance(req.pickupCoords, req.dropoffCoords).toFixed(1)} km` : '—')}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>Est. Time</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {req.estimatedDurationMin != null ? `~${Math.round(req.estimatedDurationMin)}m` : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.6875rem' }}>Needed By</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.neededBy}>
                          {req.neededBy || 'Today'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Compensation & Accept Action */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.875rem',
                    borderTop: '1px solid var(--border-subtle)',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Earn
                      </div>
                      <div className="tabular-nums" style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
                        ${(Number(req.compensation) || 0).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => onInspectMatch(req, defaultJourney)}
                        className="btn btn-secondary btn-sm"
                        title="Inspect Route Map"
                        style={{ padding: '0.375rem 0.625rem' }}
                      >
                        <Navigation size={13} />
                        <span>Map</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectRequest(req.id)}
                        disabled={isAccepting || isRejecting}
                        className="btn btn-secondary btn-sm"
                        data-testid="reject-delivery-button"
                        style={{ color: 'var(--color-charcoal-700)', padding: '0.375rem 0.625rem' }}
                        title="Decline / dismiss this delivery opportunity for your account"
                      >
                        {isRejecting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <X size={13} />}
                        <span>{isRejecting ? 'Declining...' : 'Decline / Reject'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={isAccepting || isRejecting}
                        className="btn btn-primary btn-sm"
                        data-testid="accept-delivery-button"
                        style={{ padding: '0.375rem 0.75rem' }}
                      >
                        {isAccepting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <CheckCircle2 size={14} />}
                        <span>{isAccepting ? 'Accepting...' : 'Accept Delivery'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : locationStatus === 'ready' ? (
          /* Empty state for Partner with GPS Ready */
          <div className="empty-state-box">
            <div className="empty-state-icon-wrap">
              <MapPin size={28} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                No deliveries within {searchRadiusKm} km
              </h3>
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {myOwnOpenRequests.length > 0
                  ? `You have ${myOwnOpenRequests.length} open delivery request(s) created by your account. For security, delivery partners cannot accept packages they requested themselves.`
                  : searchQuery || selectedCategory !== 'all'
                  ? 'Try clearing your search filters to view all available requests.'
                  : `There are currently no open pickup requests within ${searchRadiusKm} km of your GPS location. Expand your search distance to discover requests further out.`}
              </p>
            </div>
            {searchRadiusKm < 15 ? (
              <button
                type="button"
                onClick={() => setSearchRadiusKm(prev => Math.min(15, prev + 5))}
                className="btn btn-primary btn-sm"
                style={{ marginTop: '0.5rem' }}
              >
                <Navigation size={15} />
                <span>Expand Search to {searchRadiusKm + 5} km</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  refreshLocation();
                  if (partnerGpsCoords) fetchNearby(partnerGpsCoords[0], partnerGpsCoords[1], searchRadiusKm);
                }}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.5rem' }}
              >
                <RefreshCw size={15} />
                <span>Refresh Deliveries</span>
              </button>
            )}
          </div>
        ) : locationStatus !== 'getting_location' && locationStatus !== 'permission_denied' && (
          /* Generic Empty state when not loading or permission pending */
          <div className="empty-state-box">
            <div className="empty-state-icon-wrap">
              <Car size={28} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>No Matching Requests Right Now</h3>
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {myOwnOpenRequests.length > 0
                  ? `You have ${myOwnOpenRequests.length} open delivery request(s) created by your account. For security, delivery partners cannot accept packages they requested themselves. Switch to Requester Hub to manage your requests, or wait for community corridor opportunities.`
                  : searchQuery || selectedCategory !== 'all'
                  ? 'Try clearing your search filters to view all available requests along commuter corridors.'
                  : 'Publish your commute journey to alert requesters when you travel along your route.'}
              </p>
            </div>
            <button
              onClick={onOpenPublishJourney}
              className="btn btn-primary btn-sm"
              style={{ marginTop: '0.5rem' }}
            >
              <Car size={15} />
              <span>Publish Your Route Corridor</span>
            </button>
          </div>
        )}
      </section>

      {/* 5. Completed Delivery History & Earnings Ledger */}
      {completedDeliveries.length > 0 && (
        <section style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-xs)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Completed Deliveries & Verified Earnings
              </h2>
              <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0', color: 'var(--text-secondary)' }}>
                All historical deliveries verified through 4-digit PIN handover.
              </p>
            </div>
            <span className="badge badge-completed">
              ${(Number(totalEarned) || 0).toFixed(2)} Total Settled
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {completedDeliveries.map(del => (
              <div
                key={del.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8125rem',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-mint-50)',
                    color: 'var(--color-mint-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{del.title || 'Community Delivery'}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      {del.pickupAddress || '—'} ➔ {del.dropoffAddress || '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span className="badge badge-completed" style={{ fontSize: '0.6875rem' }}>
                    PIN Verified
                  </span>
                  <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-forest-850)' }}>
                    +${(Number(del.compensation) || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audio Call Modal for Customer contact */}
      {activeCallDelivery && (
        <PartnerAudioCallWrapper
          delivery={activeCallDelivery}
          onClose={() => setActiveCallDelivery(null)}
        />
      )}

      {/* Partner Identity Verification Modal */}
      <PartnerIdentityVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        onVerificationSubmitted={() => refreshData()}
      />

    </div>
  );
};

// Sub-component for Live GPS and Map on active partner delivery
const PartnerLiveMapWithGps: React.FC<{
  delivery: DeliveryRequest;
  customSharing?: boolean;
  customLocation?: TransporterLocation | null;
  customError?: string | null;
  onStartSharing?: () => void;
  onStopSharing?: () => void;
}> = ({
  delivery,
  customSharing,
  customLocation,
  customError,
  onStartSharing,
  onStopSharing,
}) => {
  const hookResult = useTransporterLocation({
    deliveryId: delivery.id,
    deliveryStatus: delivery.status,
    isTransporter: true,
    autoStart: delivery.status === 'in_transit',
    initialLocation: delivery.lastKnownLocation,
  });

  const isSharing = customSharing !== undefined ? customSharing : hookResult.isSharing;
  const location = customLocation !== undefined ? customLocation : hookResult.location;
  const gpsError = customError !== undefined ? customError : hookResult.error;
  const startSharing = onStartSharing || hookResult.startSharing;
  const stopSharing = onStopSharing || hookResult.stopSharing;

  return (
    <div style={{
      border: '1px solid var(--border-medium)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      animation: 'modal-fade-in 0.2s ease'
    }}>
      {/* GPS Control Bar */}
      <div style={{
        padding: '0.625rem 1rem',
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
          <Radio size={15} color={isSharing ? 'var(--color-mint-500)' : 'var(--text-tertiary)'} className={isSharing ? 'pulse-animation' : ''} />
          <span>Live GPS Sharing: <strong style={{ color: isSharing ? 'var(--color-mint-600)' : 'var(--text-secondary)' }}>{isSharing ? 'Transmitting to Customer' : 'Paused'}</strong></span>
        </div>
        <button
          onClick={isSharing ? stopSharing : startSharing}
          className={`btn btn-sm ${isSharing ? 'btn-secondary' : 'btn-primary'}`}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
        >
          {isSharing ? 'Pause GPS' : 'Transmit Live GPS'}
        </button>
      </div>

      {gpsError && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: 'var(--status-danger-text)', backgroundColor: 'var(--status-cancelled-bg)' }}>
          {gpsError}
        </div>
      )}

      <div style={{ height: '260px' }}>
        <MapView
          pickupCoords={delivery.pickupCoords}
          dropoffCoords={delivery.dropoffCoords}
          pickupAddress={delivery.pickupAddress}
          dropoffAddress={delivery.dropoffAddress}
          transporterLocation={location}
          isLiveTracking={isSharing}
        />
      </div>
    </div>
  );
};

// Sub-component wrapper for LiveKit Audio Call in Partner context
const PartnerAudioCallWrapper: React.FC<{
  delivery: DeliveryRequest;
  onClose: () => void;
}> = ({ delivery, onClose }) => {
  const otherPartyName = delivery.requesterName || 'Customer';
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
      otherPartyRole="Customer"
      deliveryTitle={delivery.title}
      call={call}
    />
  );
};
