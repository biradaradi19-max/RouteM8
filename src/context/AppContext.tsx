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

import { 
  isSupabaseConfigured,
  fetchDeliveryRequestsFromDb,
  fetchPublishedJourneysFromDb,
  createDeliveryRequestInDb,
  createPublishedJourneyInDb,
  updateDeliveryRequestStatusInDb,
  checkSupabaseConnection,
  type SupabaseConnectionStatus,
} from '../services/supabase';
import { calculateRouteMatch } from '../services/routing';
import { useAuth } from './AuthContext';

export interface AppContextType {
  // Theme & Views
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  currentView: 'landing' | 'dashboard' | 'matching' | 'deliveries';
  setCurrentView: (view: 'landing' | 'dashboard' | 'matching' | 'deliveries') => void;
  activeRoleFilter: 'all' | 'requester' | 'transporter';
  setActiveRoleFilter: (role: 'all' | 'requester' | 'transporter') => void;

  // Domain Data & Loading / Error States
  requests: DeliveryRequest[];
  journeys: PublishedJourney[];
  activities: ActivityItem[];
  isLoadingData: boolean;
  backendError: string | null;
  supabaseStatus: SupabaseConnectionStatus;
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
  acceptDeliveryMatch: (requestId: string, journeyId: string) => Promise<boolean>;
  updateRequestStatus: (requestId: string, nextStatus: DeliveryStatus, pinAttempt?: string) => Promise<{ success: boolean; message?: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_THEME_KEY = 'routem8_theme_v1';
const LOCAL_STORAGE_REQS_KEY = 'routem8_requests_v1';
const LOCAL_STORAGE_JRNS_KEY = 'routem8_journeys_v1';

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

  // Navigation state
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'matching' | 'deliveries'>('landing');
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'requester' | 'transporter'>('all');

  // Data State with initial seed (empty by default unless saved in local storage)
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
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseConnectionStatus>(
    isSupabaseConfigured ? 'connecting' : 'offline'
  );

  // Probe real Supabase backend connection state
  useEffect(() => {
    let isMounted = true;
    checkSupabaseConnection().then(status => {
      if (isMounted) {
        setSupabaseStatus(status);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Selections & Match Engine State
  const [selectedRequest, setSelectedRequest] = useState<DeliveryRequest | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<PublishedJourney | null>(null);
  const [activeMatch, setActiveMatch] = useState<RouteMatchResult | null>(null);
  const [isMatchComputing, setIsMatchComputing] = useState<boolean>(false);

  // Helper to save requests and journeys to localStorage
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

  // Sync data: fetch from Supabase if configured, otherwise use persistent local fixtures
  const refreshData = useCallback(async () => {
    if (isSupabaseConfigured) {
      setIsLoadingData(true);
      setBackendError(null);

      try {
        const [reqResult, jrnResult] = await Promise.all([
          fetchDeliveryRequestsFromDb(),
          fetchPublishedJourneysFromDb(),
        ]);

        if (reqResult.error || jrnResult.error) {
          setBackendError(reqResult.error || jrnResult.error);
        }

        if (reqResult.data.length > 0) setRequests(reqResult.data);
        if (jrnResult.data.length > 0) setJourneys(jrnResult.data);

        const activeReqs = reqResult.data.length > 0 ? reqResult.data : requests;
        const activeJrns = jrnResult.data.length > 0 ? jrnResult.data : journeys;

        if (activeReqs.length > 0 && activeJrns.length > 0) {
          selectRequestAndJourney(activeReqs[0], activeJrns[0]);
        }
      } catch (err: any) {
        setBackendError(err?.message || 'Failed to synchronize with backend.');
      } finally {
        setIsLoadingData(false);
      }
    } else {
      if (requests.length > 0 && journeys.length > 0 && !selectedRequest) {
        selectRequestAndJourney(requests[0], journeys[0]);
      }
    }
  }, [requests, journeys, selectedRequest, selectRequestAndJourney]);

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

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const newReqData: Omit<DeliveryRequest, 'id' | 'createdAt'> = {
      ...data,
      status: 'open',
      requesterId: user.id,
      requesterName: user.fullName || 'Community Requester',
      requesterTrustScore: user.trustScore || 85,
      requesterAvatar: user.avatarUrl,
      handoverPin: pin,
      estimatedDetourMinutes: 5,
    };

    let createdReq: DeliveryRequest = {
      id: `req-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...newReqData,
    };

    if (isSupabaseConfigured) {
      try {
        const { data: dbReq, error } = await createDeliveryRequestInDb(newReqData);
        if (dbReq && !error) {
          createdReq = dbReq;
        }
      } catch {
        // Fallback to local
      }
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

    const newJourneyData: Omit<PublishedJourney, 'id' | 'createdAt'> = {
      transporterId: user.id,
      transporterName: user.fullName || 'Commuter',
      transporterAvatar: user.avatarUrl,
      transporterTrustScore: user.trustScore || 85,
      ...data,
      isActive: true,
    };

    let createdJourney: PublishedJourney = {
      id: `jrn-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...newJourneyData,
    };

    if (isSupabaseConfigured) {
      try {
        const { data: dbJourney, error } = await createPublishedJourneyInDb(newJourneyData);
        if (dbJourney && !error) {
          createdJourney = dbJourney;
        }
      } catch {
        // Fallback to local
      }
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
  const acceptDeliveryMatch = async (requestId: string, journeyId: string): Promise<boolean> => {
    const journey = journeys.find(j => j.id === journeyId);
    if (!journey) return false;

    if (isSupabaseConfigured) {
      try {
        await updateDeliveryRequestStatusInDb(requestId, 'matched', journey.transporterId);
      } catch {
        // Fallback
      }
    }

    setRequests(prev => {
      const updated = prev.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            status: 'matched' as DeliveryStatus,
            transporterId: journey.transporterId,
            transporterName: journey.transporterName,
            transporterAvatar: journey.transporterAvatar,
            transporterVehicle: journey.vehicle,
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
        description: `${journey.transporterName} accepted request. Detour estimated at ${activeMatch?.additionalDetourMin || 5} mins.`,
        timestamp: 'Just now',
        relatedId: requestId,
        status: 'matched',
      },
      ...prev
    ]);

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

    if (nextStatus === 'completed') {
      if (!pinAttempt || pinAttempt.trim().length !== 4) {
        return { success: false, message: 'Please enter the 4-digit handover PIN provided by the recipient.' };
      }
      if (req.handoverPin && pinAttempt.trim() !== req.handoverPin) {
        return { success: false, message: 'Invalid handover PIN. Please check the PIN provided by the recipient.' };
      }
    }

    if (isSupabaseConfigured) {
      try {
        await updateDeliveryRequestStatusInDb(requestId, nextStatus, undefined, pinAttempt);
      } catch {
        // Fallback
      }
    }

    setRequests(prev => {
      const updated = prev.map(r => (r.id === requestId ? { ...r, status: nextStatus } : r));
      persistRequests(updated);
      return updated;
    });

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
        requests,
        journeys,
        activities,
        isLoadingData,
        backendError,
        supabaseStatus,
        refreshData,
        selectedRequest,
        selectedJourney,
        activeMatch,
        isMatchComputing,
        selectRequestAndJourney,
        createRequest,
        publishJourney,
        acceptDeliveryMatch,
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
