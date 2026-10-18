import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { 
  DeliveryRequest, 
  PublishedJourney, 
  RouteMatchResult, 
  ActivityItem, 
  DeliveryStatus, 
  ItemSize, 
  RequestCategory, 
  RequestUrgency 
} from '../types';

import { deliveriesApi, journeysApi, activitiesApi } from '../services/api';
import { calculateRouteMatch } from '../services/routing';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';

export type AppView = 'landing' | 'dashboard' | 'matching' | 'deliveries' | 'requests' | 'tracking' | 'history' | 'routes' | 'earnings' | 'profile';
export type RoleMode = 'requester' | 'transporter';
export type BackendConnectionStatus = 'connected' | 'connecting' | 'offline';

export interface AppContextType {
  // Theme & Views
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  activeRoleFilter: 'all' | 'requester' | 'transporter';
  setActiveRoleFilter: (role: 'all' | 'requester' | 'transporter') => void;
  activeRoleMode: RoleMode;
  setActiveRoleMode: (mode: RoleMode) => void;
  partnerAvailable: boolean;
  setPartnerAvailable: (available: boolean) => void;

  // Domain Data & Loading / Error States
  requests: DeliveryRequest[];
  journeys: PublishedJourney[];
  activities: ActivityItem[];
  isLoadingData: boolean;
  backendError: string | null;
  supabaseStatus: BackendConnectionStatus; // Retained for backwards compatibility
  backendStatus: BackendConnectionStatus;
  refreshData: () => Promise<void>;
  
  // Selection & Real Matching
  selectedRequest: DeliveryRequest | null;
  selectedJourney: PublishedJourney | null;
  activeMatch: RouteMatchResult | null;
  isMatchComputing: boolean;
  
  // Actions
  selectRequestAndJourney: (request: DeliveryRequest, journey: PublishedJourney) => Promise<void>;
  createRequest: (data: {
    title: string;
    description: string;
    category: RequestCategory;
    pickupAddress: string;
    pickupCoords: [number, number];
    dropoffAddress: string;
    dropoffCoords: [number, number];
    itemSize: ItemSize;
    compensation: number;
    urgency: RequestUrgency;
    neededBy: string;
  }) => Promise<DeliveryRequest>;
  publishJourney: (data: {
    vehicle: string;
    originAddress: string;
    originCoords: [number, number];
    destAddress: string;
    destCoords: [number, number];
    departureTime: string;
    maxDetourMinutes: number;
    capacity: ItemSize;
    recurringDays?: string[];
    notes?: string;
  }) => Promise<PublishedJourney>;
  acceptDeliveryMatch: (requestId: string, journeyId?: string) => Promise<boolean>;
  rejectDelivery: (requestId: string) => Promise<boolean>;
  acceptError: string | null;
  updateRequestStatus: (requestId: string, nextStatus: DeliveryStatus, pinAttempt?: string) => Promise<{ success: boolean; message?: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_THEME_KEY = 'routem8_theme_v1';
const LOCAL_STORAGE_REQS_KEY = 'routem8_requests_v1';
const LOCAL_STORAGE_JRNS_KEY = 'routem8_journeys_v1';
const LOCAL_STORAGE_ROLE_MODE_KEY = 'routem8_active_role_mode_v1';
const LOCAL_STORAGE_AVAILABILITY_KEY = 'routem8_partner_available_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Theme setup
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
      return (saved === 'dark' || saved === 'light') ? saved : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Navigation & Role Mode state
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'requester' | 'transporter'>('all');

  const [activeRoleMode, setActiveRoleModeState] = useState<RoleMode>(() => {
    try {
      if (user?.role === 'transporter') return 'transporter';
      if (user?.role === 'requester') return 'requester';
      const saved = localStorage.getItem(LOCAL_STORAGE_ROLE_MODE_KEY);
      if (saved === 'transporter' || saved === 'requester') return saved;
    } catch {
      // Ignore
    }
    return 'requester';
  });

  useEffect(() => {
    if (user?.role === 'transporter') {
      setActiveRoleModeState('transporter');
    } else if (user?.role === 'requester') {
      setActiveRoleModeState('requester');
    }
  }, [user?.role]);

  const setActiveRoleMode = (mode: RoleMode) => {
    setActiveRoleModeState(mode);
    try {
      localStorage.setItem(LOCAL_STORAGE_ROLE_MODE_KEY, mode);
    } catch {
      // Ignore
    }
  };

  const [partnerAvailable, setPartnerAvailableState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_AVAILABILITY_KEY);
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return true;
  });

  const setPartnerAvailable = (available: boolean) => {
    setPartnerAvailableState(available);
    try {
      localStorage.setItem(LOCAL_STORAGE_AVAILABILITY_KEY, String(available));
    } catch {
      // Ignore
    }
  };

  // Data State with initial local fallback
  const [requests, setRequests] = useState<DeliveryRequest[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_REQS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    return [];
  });

  const [journeys, setJourneys] = useState<PublishedJourney[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_JRNS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    return [];
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendConnectionStatus>('connecting');

  // Probe Express API health
  useEffect(() => {
    let isMounted = true;
    fetch('/api/health')
      .then(res => {
        if (isMounted) {
          setBackendStatus(res.ok ? 'connected' : 'offline');
        }
      })
      .catch(() => {
        if (isMounted) {
          setBackendStatus('offline');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    let isMounted = true;
    let unsubSocket: (() => void) | null = null;

    getSocket()
      .then((s) => {
        if (!isMounted) return;

        const handleClaimed = ({ deliveryId }: { deliveryId: string }) => {
          setRequests((prev) =>
            prev.map((r) => (r.id === deliveryId ? { ...r, status: 'matched' as DeliveryStatus } : r))
          );
        };

        const handleMatched = (updatedDelivery: DeliveryRequest) => {
          setRequests((prev) =>
            prev.map((r) => (r.id === updatedDelivery.id ? updatedDelivery : r))
          );
        };

        s.on('delivery:claimed', handleClaimed);
        s.on('delivery:matched', handleMatched);

        unsubSocket = () => {
          s.off('delivery:claimed', handleClaimed);
          s.off('delivery:matched', handleMatched);
        };
      })
      .catch((err) => {
        console.warn('[AppContext Socket notice]', err);
      });

    return () => {
      isMounted = false;
      if (unsubSocket) unsubSocket();
    };
  }, []);

  // Selections & Match Engine State
  const [selectedRequest, setSelectedRequest] = useState<DeliveryRequest | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<PublishedJourney | null>(null);
  const [activeMatch, setActiveMatch] = useState<RouteMatchResult | null>(null);
  const [isMatchComputing, setIsMatchComputing] = useState<boolean>(false);

  const persistRequests = (newReqs: DeliveryRequest[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_REQS_KEY, JSON.stringify(newReqs));
    } catch {
      // Ignore
    }
  };

  const persistJourneys = (newJrns: PublishedJourney[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_JRNS_KEY, JSON.stringify(newJrns));
    } catch {
      // Ignore
    }
  };

  // Compute real route match when request & journey are selected
  const selectRequestAndJourney = useCallback(async (request: DeliveryRequest, journey: PublishedJourney) => {
    setSelectedRequest(request);
    setSelectedJourney(journey);
    setIsMatchComputing(true);
    try {
      const match = await calculateRouteMatch(
        journey.id,
        journey.originCoords,
        journey.destCoords,
        request.id,
        request.pickupCoords,
        request.dropoffCoords,
        journey.maxDetourMinutes
      );
      setActiveMatch(match);
    } catch (err) {
      console.error('Error calculating real route match:', err);
      setActiveMatch(null);
    } finally {
      setIsMatchComputing(false);
    }
  }, []);

  // Sync data: fetch from Express + MongoDB backend
  const refreshData = useCallback(async () => {
    setIsLoadingData(true);
    setBackendError(null);

    try {
      const [fetchedReqs, fetchedJourneys, fetchedActs] = await Promise.all([
        deliveriesApi.getDeliveries(),
        journeysApi.getJourneys(),
        activitiesApi.getActivities(),
      ]);

      if (fetchedReqs.length > 0) {
        setRequests(fetchedReqs);
        persistRequests(fetchedReqs);
      }
      if (fetchedJourneys.length > 0) {
        setJourneys(fetchedJourneys);
        persistJourneys(fetchedJourneys);
      }
      if (fetchedActs.length > 0) {
        setActivities(fetchedActs);
      }

      setBackendStatus('connected');

      const activeReqs = fetchedReqs.length > 0 ? fetchedReqs : requests;
      const activeJrns = fetchedJourneys.length > 0 ? fetchedJourneys : journeys;

      if (activeReqs.length > 0 && activeJrns.length > 0) {
        selectRequestAndJourney(activeReqs[0], activeJrns[0]);
      }
    } catch (err: any) {
      console.warn('[Sync] Express backend offline, preserving local cache:', err.message);
      setBackendError(err.message || 'Failed to synchronize with backend.');
    } finally {
      setIsLoadingData(false);
    }
  }, [requests, journeys, selectRequestAndJourney]);

  useEffect(() => {
    refreshData();
  }, [refreshData, user]);

  // Create Delivery Request
  const createRequest = async (data: {
    title: string;
    description: string;
    category: RequestCategory;
    pickupAddress: string;
    pickupCoords: [number, number];
    dropoffAddress: string;
    dropoffCoords: [number, number];
    itemSize: ItemSize;
    compensation: number;
    urgency: RequestUrgency;
    neededBy: string;
  }): Promise<DeliveryRequest> => {
    if (!user) {
      throw new Error('Authentication required. Please sign in to create a delivery request.');
    }

    const { data: serverReq, error } = await deliveriesApi.createDelivery(data);
    let createdReq: DeliveryRequest;
    if (serverReq) {
      createdReq = serverReq;
    } else {
      if (error && !error.includes('Network') && !error.includes('Failed to fetch') && !error.includes('Unexpected end of JSON')) {
        throw new Error(error);
      }
      createdReq = {
        id: `req-${Date.now()}`,
        ...data,
        status: 'open',
        requesterId: user.id,
        requesterName: user.fullName || 'Requester',
        requesterAvatar: user.avatarUrl,
        requesterTrustScore: user.trustScore || 98,
        createdAt: new Date().toISOString(),
        handoverPin: Math.floor(1000 + Math.random() * 9000).toString(),
      };
    }

    setRequests(prev => {
      const updated = [createdReq, ...prev];
      persistRequests(updated);
      return updated;
    });
    setSelectedRequest(createdReq);

    setActivities(prev => [
      {
        id: `act-${Date.now()}`,
        type: 'request_created',
        title: `New Request: ${createdReq.title}`,
        description: `Compensation: $${createdReq.compensation.toFixed(2)} | Needed by ${createdReq.neededBy}`,
        timestamp: 'Just now',
        relatedId: createdReq.id,
      },
      ...prev
    ]);

    if (journeys.length > 0) {
      selectRequestAndJourney(createdReq, journeys[0]);
    }

    return createdReq;
  };

  // Publish Commuter Journey
  const publishJourney = async (data: {
    vehicle: string;
    originAddress: string;
    originCoords: [number, number];
    destAddress: string;
    destCoords: [number, number];
    departureTime: string;
    maxDetourMinutes: number;
    capacity: ItemSize;
    recurringDays?: string[];
    notes?: string;
  }): Promise<PublishedJourney> => {
    if (!user) {
      throw new Error('Authentication required. Please sign in to publish a commute route.');
    }

    const { data: createdJourney, error } = await journeysApi.publishJourney(data);
    if (error || !createdJourney) {
      throw new Error(error || 'Failed to publish commute route on server');
    }

    setJourneys(prev => {
      const updated = [createdJourney, ...prev];
      persistJourneys(updated);
      return updated;
    });
    setSelectedJourney(createdJourney);

    setActivities(prev => [
      {
        id: `act-${Date.now()}`,
        type: 'journey_published',
        title: `Commute Published: ${createdJourney.vehicle}`,
        description: `${createdJourney.originAddress} ➔ ${createdJourney.destAddress} (${createdJourney.departureTime})`,
        timestamp: 'Just now',
        relatedId: createdJourney.id,
      },
      ...prev
    ]);

    if (requests.length > 0) {
      selectRequestAndJourney(requests[0], createdJourney);
    }

    return createdJourney;
  };

  // Accept Match
  const acceptDeliveryMatch = async (requestId: string, journeyId?: string): Promise<boolean> => {
    const journey = journeyId ? journeys.find(j => j.id === journeyId) : journeys[0];
    setAcceptError(null);

    // Security check: requester cannot accept their own delivery request
    const targetReq = requests.find(r => r.id === requestId);
    if (targetReq && user && targetReq.requesterId === user.id) {
      setAcceptError('You cannot accept your own delivery request.');
      return false;
    }

    const { data: updatedDoc, error } = await deliveriesApi.acceptDelivery(requestId);
    if (error || !updatedDoc) {
      // If already accepted/conflict, mark as matched locally
      if (error && (error.includes('already been accepted') || error.includes('no longer open'))) {
        setAcceptError(error);
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'matched' as DeliveryStatus } : r));
        return false;
      }
      // If network error on deployed preview without backend reachable, accept optimistically:
      if (!updatedDoc && (error?.includes('Failed to fetch') || error?.includes('Network') || error?.includes('Unexpected end of JSON'))) {
        const fallbackDoc: DeliveryRequest = {
          ...targetReq!,
          status: 'matched' as DeliveryStatus,
          transporterId: user?.id || journey?.transporterId || 'demo-partner',
          transporterName: user?.fullName || journey?.transporterName || 'Verified Commuter',
          transporterAvatar: user?.avatarUrl || journey?.transporterAvatar,
          transporterVehicle: user?.commuteVehicle || journey?.vehicle || 'Commuter Vehicle',
        };
        setRequests(prev => {
          const updated = prev.map(r => r.id === requestId ? fallbackDoc : r);
          persistRequests(updated);
          return updated;
        });
        return true;
      }
      setAcceptError(error || 'Failed to accept delivery.');
      return false;
    }

    setRequests(prev => {
      const updated = prev.map(req => {
        if (req.id === requestId) {
          return updatedDoc || {
            ...req,
            status: 'matched' as DeliveryStatus,
            transporterId: journey?.transporterId,
            transporterName: journey?.transporterName,
            transporterAvatar: journey?.transporterAvatar,
            transporterVehicle: journey?.vehicle,
          };
        }
        return req;
      });
      persistRequests(updated);
      return updated;
    });

    setActivities(prev => [
      {
        id: `act-${Date.now()}`,
        type: 'match_found',
        title: 'Delivery Match Confirmed',
        description: `Accepted delivery: ${updatedDoc.title}`,
        timestamp: 'Just now',
        relatedId: requestId,
        status: 'matched',
      },
      ...prev
    ]);

    return true;
  };

  // Reject / Dismiss Delivery Opportunity for this partner
  const rejectDelivery = async (requestId: string): Promise<boolean> => {
    // 1. Immediately dismiss locally for instant UX
    setRequests(prev => prev.filter(r => r.id !== requestId));

    // 2. Persist dismissal to MongoDB
    const res = await deliveriesApi.rejectDelivery(requestId);
    if (!res.success) {
      console.warn('[Reject Delivery Notice]', res.error);
      return false;
    }

    return true;
  };

  // Update Status / PIN Verification
  const updateRequestStatus = async (
    requestId: string, 
    nextStatus: DeliveryStatus, 
    pinAttempt?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found.' };

    if (nextStatus === 'in_transit') {
      const { data: transitDoc, error } = await deliveriesApi.startTransit(requestId);
      if (error) {
        return { success: false, message: error };
      }
      setRequests(prev => {
        const updated = prev.map(r => (r.id === requestId ? transitDoc || { ...r, status: nextStatus } : r));
        persistRequests(updated);
        return updated;
      });
    } else if (nextStatus === 'completed') {
      if (!pinAttempt || pinAttempt.trim().length !== 4) {
        return { success: false, message: 'Please enter the 4-digit handover PIN provided by the recipient.' };
      }

      const res = await deliveriesApi.verifyPin(requestId, pinAttempt.trim());
      if (!res.success) {
        return { success: false, message: res.error || 'PIN verification failed.' };
      }

      setRequests(prev => {
        const updated = prev.map(r => (r.id === requestId ? res.delivery || { ...r, status: nextStatus } : r));
        persistRequests(updated);
        return updated;
      });
    } else if (nextStatus === 'cancelled') {
      const res = await deliveriesApi.cancelDelivery(requestId);
      if (!res.success) {
        return { success: false, message: res.error || 'Failed to cancel delivery.' };
      }
      setRequests(prev => {
        const updated = prev.map(r => (r.id === requestId ? { ...r, status: nextStatus } : r));
        persistRequests(updated);
        return updated;
      });
    } else {
      setRequests(prev => {
        const updated = prev.map(r => (r.id === requestId ? { ...r, status: nextStatus } : r));
        persistRequests(updated);
        return updated;
      });
    }

    const statusTitleMap: Record<DeliveryStatus, string> = {
      open: 'Request Reopened',
      matched: 'Matched with Transporter',
      in_transit: 'Item In Transit',
      completed: 'Handover Completed & Verified',
      cancelled: 'Request Cancelled'
    };

    setActivities(prev => [
      {
        id: `act-${Date.now()}`,
        type: nextStatus === 'completed' ? 'delivered' : 'in_transit',
        title: statusTitleMap[nextStatus],
        description: `Status changed to ${nextStatus.replace('_', ' ')} for "${req.title}"`,
        timestamp: 'Just now',
        relatedId: requestId,
        status: nextStatus,
      },
      ...prev
    ]);

    return { success: true };
  };

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        currentView,
        setCurrentView,
        activeRoleFilter,
        setActiveRoleFilter,
        activeRoleMode,
        setActiveRoleMode,
        partnerAvailable,
        setPartnerAvailable,
        requests,
        journeys,
        activities,
        isLoadingData,
        backendError,
        supabaseStatus: backendStatus, // Backwards compatible alias
        backendStatus,
        refreshData,
        selectedRequest,
        selectedJourney,
        activeMatch,
        isMatchComputing,
        selectRequestAndJourney,
        createRequest,
        publishJourney,
        acceptDeliveryMatch,
        rejectDelivery,
        acceptError,
        updateRequestStatus,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
