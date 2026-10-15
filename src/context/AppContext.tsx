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

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // Theme setup (persisted cleanly in localStorage without touching credentials)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Navigation state
  const [currentView, setCurrentView] = useState<'landing' | 'dashboard' | 'matching' | 'deliveries'>('landing');
  const [activeRoleFilter, setActiveRoleFilter] = useState<'all' | 'requester' | 'transporter'>('all');

  // Genuine Database State (defaults strictly to empty arrays in production)
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
  const [journeys, setJourneys] = useState<PublishedJourney[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(Boolean(isSupabaseConfigured));
  const [backendError, setBackendError] = useState<string | null>(null);

  // Selections & Match Engine State
  const [selectedRequest, setSelectedRequest] = useState<DeliveryRequest | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<PublishedJourney | null>(null);
  const [activeMatch, setActiveMatch] = useState<RouteMatchResult | null>(null);
  const [isMatchComputing, setIsMatchComputing] = useState<boolean>(false);

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

  // Fetch real data from Supabase backend (fails safely when unconfigured)
  const refreshData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setRequests([]);
      setJourneys([]);
      setSelectedRequest(null);
      setSelectedJourney(null);
      setActiveMatch(null);
      setIsLoadingData(false);
      return;
    }

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

      setRequests(reqResult.data);
      setJourneys(jrnResult.data);

      if (reqResult.data.length > 0 && jrnResult.data.length > 0) {
        selectRequestAndJourney(reqResult.data[0], jrnResult.data[0]);
      } else {
        setSelectedRequest(reqResult.data[0] || null);
        setSelectedJourney(jrnResult.data[0] || null);
        setActiveMatch(null);
      }
    } catch (err: any) {
      setBackendError(err?.message || 'Failed to synchronize with Supabase backend.');
    } finally {
      setIsLoadingData(false);
    }
  }, [selectRequestAndJourney]);

  // Initial fetch and synchronization on auth state change
  useEffect(() => {
    refreshData();
  }, [refreshData, user]);

  // Create Delivery Request via real Supabase database operation
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
    if (!isSupabaseConfigured) {
      throw new Error('Supabase backend is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to create delivery requests.');
    }

    if (!user) {
      throw new Error('Authentication required. Please sign in to create a delivery request.');
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const newReqData: Omit<DeliveryRequest, 'id' | 'createdAt'> = {
      ...data,
      status: 'open',
      requesterId: user.id,
      requesterName: user.fullName || 'Community Requester',
      requesterTrustScore: user.trustScore || 50,
      requesterAvatar: user.avatarUrl,
      handoverPin: pin,
      estimatedDetourMinutes: 5,
    };

    const { data: createdReq, error } = await createDeliveryRequestInDb(newReqData);
    if (error || !createdReq) {
      throw new Error(error || 'Failed to save delivery request to database.');
    }

    setRequests(prev => [createdReq, ...prev]);
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

  // Publish Commuter Journey via real Supabase database operation
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
    if (!isSupabaseConfigured) {
      throw new Error('Supabase backend is not configured. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to publish commute routes.');
    }

    if (!user) {
      throw new Error('Authentication required. Please sign in to publish a commute route.');
    }

    const newJourneyData: Omit<PublishedJourney, 'id' | 'createdAt'> = {
      transporterId: user.id,
      transporterName: user.fullName || 'Commuter',
      transporterAvatar: user.avatarUrl,
      transporterTrustScore: user.trustScore || 50,
      ...data,
      isActive: true,
    };

    const { data: createdJourney, error } = await createPublishedJourneyInDb(newJourneyData);
    if (error || !createdJourney) {
      throw new Error(error || 'Failed to publish commute route to database.');
    }

    setJourneys(prev => [createdJourney, ...prev]);
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

  // Accept Match in Database
  const acceptDeliveryMatch = async (requestId: string, journeyId: string): Promise<boolean> => {
    const journey = journeys.find(j => j.id === journeyId);
    if (!journey) return false;

    if (!isSupabaseConfigured) {
      return false;
    }

    const { success, error } = await updateDeliveryRequestStatusInDb(requestId, 'matched', journey.transporterId);
    if (!success) {
      console.error('Failed to accept match in database:', error);
      return false;
    }

    setRequests(prev => prev.map(req => {
      if (req.id === requestId) {
        return {
          ...req,
          status: 'matched',
          transporterId: journey.transporterId,
          transporterName: journey.transporterName,
          transporterAvatar: journey.transporterAvatar,
          transporterVehicle: journey.vehicle,
        };
      }
      return req;
    }));

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

  // Update Status / PIN Verification in Database
  const updateRequestStatus = async (
    requestId: string, 
    nextStatus: DeliveryStatus, 
    pinAttempt?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found.' };

    // If moving to completed, validate 4-digit format before forwarding to server RPC
    if (nextStatus === 'completed') {
      if (!pinAttempt || pinAttempt.trim().length !== 4) {
        return { success: false, message: 'Please enter the 4-digit handover PIN provided by the recipient.' };
      }
    }

    if (!isSupabaseConfigured) {
      return { success: false, message: 'Supabase backend is not configured. Status cannot be updated.' };
    }

    const { success, error } = await updateDeliveryRequestStatusInDb(requestId, nextStatus, undefined, pinAttempt);
    if (!success) {
      return { success: false, message: error || 'Failed to update delivery status in database.' };
    }

    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return { ...r, status: nextStatus };
      }
      return r;
    }));

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
