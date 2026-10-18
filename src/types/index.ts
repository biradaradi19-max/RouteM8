export type VerificationStatus = 'unverified' | 'email_verified' | 'student_verified' | 'work_verified' | 'gov_id_verified';
export type AccountStatus = 'active' | 'suspended' | 'pending_approval';

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  fullName: string;
  avatarUrl?: string;
  role: 'both' | 'requester' | 'transporter';
  verificationStatus: VerificationStatus;
  accountStatus?: AccountStatus;
  organization?: string; // Campus or Workplace (e.g., "Stanford University" or "TechCorp Campus")
  trustScore: number; // e.g. 98 out of 100
  completedDeliveries: number;
  completedCommutes: number;
  phone?: string;
  bio?: string;
  commuteVehicle?: string; // e.g., "Tesla Model 3" or "Subaru Outback" or "Bicycle / Transit"
  rating: number; // e.g. 4.95
}

export interface AuthAuditLog {
  id: string;
  userId: string;
  eventType: 'login_success' | 'logout' | 'password_reset_request' | 'password_reset_complete' | 'token_refresh';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}


export interface SafeProfileUpdates {
  fullName?: string;
  avatarUrl?: string;
  organization?: string;
  phone?: string;
  bio?: string;
  commuteVehicle?: string;
  role?: 'both' | 'requester' | 'transporter';
}

export type VerificationType = 'student' | 'work' | 'gov_id';
export type VerificationRequestStatus = 'pending_review' | 'approved' | 'rejected';

export interface VerificationSubmission {
  verificationType: VerificationType;
  organizationName: string;
  evidenceDomainOrId: string;
  notes?: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  verificationType: VerificationType;
  organizationName: string;
  evidenceDomainOrId: string;
  status: VerificationRequestStatus;
  submittedAt: string;
  notes?: string;
}


export type ItemSize = 'small' | 'medium' | 'large';
export type RequestUrgency = 'standard' | 'flexible' | 'urgent';
export type DeliveryStatus = 'open' | 'matched' | 'in_transit' | 'completed' | 'cancelled';
export type RequestCategory = 'groceries' | 'campus-supplies' | 'essentials' | 'pharmacy' | 'electronics' | 'other';

export interface DeliveryRequest {
  id: string;
  title: string;
  description: string;
  category: RequestCategory;
  pickupAddress: string;
  pickupCoords: [number, number]; // [lat, lng]
  dropoffAddress: string;
  dropoffCoords: [number, number]; // [lat, lng]
  itemSize: ItemSize;
  weightEstimateKg?: number;
  compensation: number; // e.g. 9.50
  urgency: RequestUrgency;
  neededBy: string; // ISO or human string
  status: DeliveryStatus;
  requesterId: string;
  requesterName: string;
  requesterTrustScore: number;
  requesterAvatar?: string;
  transporterId?: string;
  transporterName?: string;
  transporterAvatar?: string;
  transporterVehicle?: string;
  handoverPin: string; // 4 digit verification PIN for physical exchange
  createdAt: string;
  estimatedDetourMinutes?: number;
}

export interface PublishedJourney {
  id: string;
  transporterId: string;
  transporterName: string;
  transporterAvatar?: string;
  transporterTrustScore: number;
  vehicle: string;
  originAddress: string;
  originCoords: [number, number]; // [lat, lng]
  destAddress: string;
  destCoords: [number, number]; // [lat, lng]
  departureTime: string; // e.g., "Today 17:30" or ISO
  maxDetourMinutes: number; // e.g. 10
  capacity: ItemSize;
  recurringDays?: string[]; // e.g. ["Mon", "Tue", "Wed", "Thu", "Fri"]
  isActive: boolean;
  notes?: string;
  createdAt: string;
}

export interface RouteMatchResult {
  journeyId: string;
  requestId: string;
  directDistanceKm: number;
  directDurationMin: number;
  detourDistanceKm: number;
  detourDurationMin: number;
  additionalDetourMin: number;
  additionalDistanceKm: number;
  departureCompatibility: number; // 0 - 100 percentage
  overallMatchScore: number; // 0 - 100 percentage
  originCoords: [number, number];
  destCoords: [number, number];
  pickupCoords: [number, number];
  dropoffCoords: [number, number];
  directPolyline: [number, number][]; // [[lat, lng], ...]
  detourPolyline: [number, number][]; // [[lat, lng], ...]
}

export interface ActivityItem {
  id: string;
  type: 'request_created' | 'journey_published' | 'match_found' | 'in_transit' | 'delivered';
  title: string;
  description: string;
  timestamp: string;
  relatedId?: string;
  status?: DeliveryStatus;
}

export interface TransporterLocation {
  deliveryId: string;
  transporterId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  updatedAt: string;
}

