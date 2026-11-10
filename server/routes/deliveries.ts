import { Router, type Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DeliveryRequest, type DeliveryStatus } from '../models/DeliveryRequest.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';
import { Location } from '../models/Location.js';
import { isDbConnected } from '../config/db.js';
import { dispatchService } from '../services/dispatchService.js';
import { calculateHaversineDistance } from '../services/matchingEngine.js';
import { generateHandoverPin, generatePinSalt, hashPin, verifyPinHash } from '../services/security.js';

const router = Router();

// Setup Multer for private delivery proof photos
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed as delivery proof'));
    }
  },
});

export interface InMemDelivery {
  _id: string;
  id: string;
  title: string;
  description: string;
  category: string;
  pickupAddress: string;
  pickupCoords: [number, number];
  pickupPlaceId?: string;
  dropoffAddress: string;
  dropoffCoords: [number, number];
  dropoffPlaceId?: string;
  itemSize: string;
  weightEstimateKg?: number;
  compensation: number;
  urgency: string;
  neededBy: string;
  status: DeliveryStatus;
  statusHistory?: any[];
  requesterId: string;
  requesterName: string;
  requesterTrustScore: number;
  requesterAvatar?: string;
  transporterId?: string;
  transporterName?: string;
  transporterAvatar?: string;
  transporterVehicle?: string;
  handoverPin: string;
  handoverPinHash?: string;
  handoverPinSalt?: string;
  pinAttempts: number;
  pinLockedUntil?: Date;
  proofPhotoUrl?: string;
  rejectedBy: string[];
  distanceKm?: number;
  pickupDistanceKm?: number;
  estimatedDurationMin?: number;
  estimatedDetourMinutes?: number;
  lastKnownLocation?: any;
  createdAt: Date;
  updatedAt: Date;
}

export const INITIAL_COMMUNITY_DELIVERIES: InMemDelivery[] = [
  {
    _id: '6712b001a1b2c3d4e5f60001',
    id: '6712b001a1b2c3d4e5f60001',
    title: 'Lab Notebook & Circuit Breadboard',
    description: 'Urgent pickup from Science Library; fragile electronics breadboard inside protected pouch.',
    category: 'campus-supplies',
    pickupAddress: 'Stanford Science Library, Stanford, CA',
    pickupCoords: [37.4275, -122.1697],
    dropoffAddress: 'Castro St & El Camino Real, Mountain View, CA',
    dropoffCoords: [37.3861, -122.0839],
    itemSize: 'small',
    weightEstimateKg: 1.2,
    compensation: 22.50,
    urgency: 'urgent',
    neededBy: 'Today by 19:00',
    status: 'open',
    requesterId: 'usr-marcus-10',
    requesterName: 'Marcus Vance',
    requesterTrustScore: 98,
    requesterAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    handoverPin: '4821',
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 8.4,
    estimatedDurationMin: 14,
    estimatedDetourMinutes: 5,
    createdAt: new Date(Date.now() - 3600000 * 2),
    updatedAt: new Date(Date.now() - 3600000 * 2),
  },
  {
    _id: '6712b001a1b2c3d4e5f60002',
    id: '6712b001a1b2c3d4e5f60002',
    title: 'Whole Foods Organic Groceries Bag',
    description: 'Pre-ordered curbside pickup: 2 bags of fresh produce, sourdough, and oat milk.',
    category: 'groceries',
    pickupAddress: 'Whole Foods Market, 774 Emerson St, Palo Alto, CA',
    pickupCoords: [37.4418, -122.1601],
    dropoffAddress: 'San Antonio Center, Mountain View, CA',
    dropoffCoords: [37.4022, -122.1124],
    itemSize: 'medium',
    weightEstimateKg: 4.5,
    compensation: 18.00,
    urgency: 'standard',
    neededBy: 'Today by 18:30',
    status: 'open',
    requesterId: 'usr-elena-20',
    requesterName: 'Elena Rostova',
    requesterTrustScore: 97,
    requesterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    handoverPin: '7914',
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 6.2,
    estimatedDurationMin: 11,
    estimatedDetourMinutes: 4,
    createdAt: new Date(Date.now() - 3600000 * 3),
    updatedAt: new Date(Date.now() - 3600000 * 3),
  },
  {
    _id: '6712b001a1b2c3d4e5f60003',
    id: '6712b001a1b2c3d4e5f60003',
    title: 'Pharmacy Prescription Medication Pack',
    description: 'Sealed prescription envelope from pharmacy counter for elderly family member.',
    category: 'pharmacy',
    pickupAddress: 'Walgreens, 4170 El Camino Real, Palo Alto, CA',
    pickupCoords: [37.4124, -122.1287],
    dropoffAddress: 'California Ave Commercial Strip, Palo Alto, CA',
    dropoffCoords: [37.4285, -122.1432],
    itemSize: 'small',
    weightEstimateKg: 0.5,
    compensation: 14.00,
    urgency: 'standard',
    neededBy: 'Today by 17:00',
    status: 'open',
    requesterId: 'usr-david-30',
    requesterName: 'David Chen',
    requesterTrustScore: 99,
    requesterAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    handoverPin: '3152',
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 3.8,
    estimatedDurationMin: 8,
    estimatedDetourMinutes: 3,
    createdAt: new Date(Date.now() - 3600000 * 4),
    updatedAt: new Date(Date.now() - 3600000 * 4),
  },
  {
    _id: '6712b001a1b2c3d4e5f60004',
    id: '6712b001a1b2c3d4e5f60004',
    title: 'Architectural Blueprint Portfolio',
    description: 'Heavy duty cylinder tube containing master plans for community center renovation.',
    category: 'documents',
    pickupAddress: 'University Ave & High St, Palo Alto, CA',
    pickupCoords: [37.4445, -122.1633],
    dropoffAddress: 'Sunnyvale Tech Campus, Sunnyvale, CA',
    dropoffCoords: [37.3751, -122.0352],
    itemSize: 'medium',
    weightEstimateKg: 2.1,
    compensation: 26.00,
    urgency: 'urgent',
    neededBy: 'Today by 20:00',
    status: 'open',
    requesterId: 'usr-priya-40',
    requesterName: 'Priya Patel',
    requesterTrustScore: 96,
    requesterAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    handoverPin: '8204',
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 12.1,
    estimatedDurationMin: 18,
    estimatedDetourMinutes: 6,
    createdAt: new Date(Date.now() - 3600000 * 5),
    updatedAt: new Date(Date.now() - 3600000 * 5),
  },
];

export const inMemoryDeliveries: InMemDelivery[] = process.env.NODE_ENV === 'test'
  ? [...INITIAL_COMMUNITY_DELIVERIES]
  : [];
export const inMemoryLocations = new Map<string, any>();

// Helper to format Mongo document into standard frontend DeliveryRequest
// Only the requester who created the delivery receives the plaintext handoverPin
function formatDelivery(doc: any, forUserId?: string) {
  const showPin = Boolean(forUserId && forUserId === doc.requesterId);
  const docId = (doc._id || doc.id || 'del-' + Date.now()).toString();

  return {
    id: docId,
    _id: docId,
    title: doc.title || 'Community Delivery',
    description: doc.description || '',
    category: doc.category || 'other',
    pickupAddress: doc.pickupAddress || 'Address not specified',
    pickupCoords: Array.isArray(doc.pickupCoords) && doc.pickupCoords.length === 2
      ? [Number(doc.pickupCoords[0]), Number(doc.pickupCoords[1])]
      : doc.pickupCoords,
    pickupPlaceId: doc.pickupPlaceId,
    dropoffAddress: doc.dropoffAddress || 'Address not specified',
    dropoffCoords: Array.isArray(doc.dropoffCoords) && doc.dropoffCoords.length === 2
      ? [Number(doc.dropoffCoords[0]), Number(doc.dropoffCoords[1])]
      : doc.dropoffCoords,
    dropoffPlaceId: doc.dropoffPlaceId,
    itemSize: doc.itemSize || 'standard',
    weightEstimateKg: typeof doc.weightEstimateKg === 'number' ? doc.weightEstimateKg : 1.0,
    compensation: typeof doc.compensation === 'number' ? doc.compensation : (Number(doc.compensation) || 0),
    urgency: doc.urgency || 'standard',
    neededBy: doc.neededBy || 'Flexible',
    status: doc.status || 'open',
    statusHistory: doc.statusHistory || [],
    requesterId: doc.requesterId || 'anonymous',
    requesterName: doc.requesterName || 'Community Member',
    requesterTrustScore: typeof doc.requesterTrustScore === 'number' ? doc.requesterTrustScore : 95,
    requesterAvatar: doc.requesterAvatar,
    transporterId: doc.transporterId,
    transporterName: doc.transporterName,
    transporterAvatar: doc.transporterAvatar,
    transporterVehicle: doc.transporterVehicle,
    ...((doc.lastKnownLocation || inMemoryLocations.get(docId))
      ? { lastKnownLocation: doc.lastKnownLocation || inMemoryLocations.get(docId) }
      : {}),
    ...(showPin && doc.handoverPin ? { handoverPin: doc.handoverPin } : {}),
    pinAttempts: doc.pinAttempts || 0,
    pinLockedUntil: doc.pinLockedUntil,
    proofPhotoUrl: doc.proofPhotoUrl,
    rejectedBy: doc.rejectedBy || [],
    distanceKm: doc.distanceKm,
    ...(typeof doc.pickupDistanceKm === 'number' ? { pickupDistanceKm: doc.pickupDistanceKm } : {}),
    estimatedDurationMin: doc.estimatedDurationMin,
    estimatedDetourMinutes: doc.estimatedDetourMinutes,
    createdAt: doc.createdAt?.toISOString?.() || (doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()),
    updatedAt: doc.updatedAt?.toISOString?.() || (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString()),
  };
}

export function isValidPickupCoords(coords: any): coords is [number, number] {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    typeof coords[0] === 'number' &&
    typeof coords[1] === 'number' &&
    !Number.isNaN(coords[0]) &&
    !Number.isNaN(coords[1]) &&
    coords[0] >= -90 &&
    coords[0] <= 90 &&
    coords[1] >= -180 &&
    coords[1] <= 180
  );
}

export function toMongoIdFilter(id: string | string[]) {
  const str = String(Array.isArray(id) ? id[0] : id).trim();
  if (mongoose.Types.ObjectId.isValid(str) && str.length === 24) {
    return { $in: [str, new mongoose.Types.ObjectId(str)] };
  }
  return str;
}

export function getInMemDelivery(id: string | string[] | undefined) {
  if (!id) return undefined;
  const targetId = Array.isArray(id) ? id[0] : id;
  return inMemoryDeliveries.find((d) => d._id === targetId || d.id === targetId);
}

export async function findDelivery(id: string | string[] | undefined): Promise<InMemDelivery | undefined> {
  if (!id) return undefined;
  const targetId = Array.isArray(id) ? id[0] : id;
  const local = inMemoryDeliveries.find((d) => d._id === targetId || d.id === targetId);
  if (local) return local;

  if (isDbConnected()) {
    try {
      const doc = await DeliveryRequest.findOne({ _id: toMongoIdFilter(targetId) });
      if (doc) {
        const formatted: InMemDelivery = {
          ...doc.toObject(),
          _id: doc._id.toString(),
          id: doc._id.toString(),
        };
        inMemoryDeliveries.unshift(formatted);
        return formatted;
      }
    } catch {
      // Fallback
    }
  }

  return undefined;
}

// GET /api/deliveries - List deliveries
router.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, requesterId, transporterId, category, excludeRejectedBy } = req.query;
    const callerUid = req.user?.uid;

    if (isDbConnected()) {
      try {
        const filter: any = {};
        if (status) filter.status = status;
        if (requesterId) filter.requesterId = requesterId;
        if (transporterId) filter.transporterId = transporterId;
        if (category) filter.category = category;
        if (excludeRejectedBy) filter.rejectedBy = { $ne: String(excludeRejectedBy) };

        const docs = await DeliveryRequest.find(filter).sort({ createdAt: -1 }).limit(100);
        res.json(docs.map((d) => formatDelivery(d, callerUid)));
        return;
      } catch (dbErr: any) {
        console.warn('[Deliveries List DB Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated testing
    const filtered = inMemoryDeliveries.filter((d) => {
      if (status && d.status !== status) return false;
      if (requesterId && d.requesterId !== requesterId) return false;
      if (transporterId && d.transporterId !== transporterId) return false;
      if (category && d.category !== category) return false;
      if (excludeRejectedBy && d.rejectedBy?.includes(String(excludeRejectedBy))) return false;
      return true;
    });

    res.json(filtered.map((d) => formatDelivery(d, callerUid)));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch deliveries', details: err.message });
  }
});

// GET /api/deliveries/nearby - Discover active open deliveries near partner GPS
router.get('/nearby', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { lat: latStr, lng: lngStr, radiusKm: radiusStr } = req.query;
    const callerUid = req.user!.uid;

    if (latStr === undefined || lngStr === undefined) {
      res.status(400).json({ error: 'Missing coordinates. Both lat and lng query parameters are required.' });
      return;
    }

    const lat = parseFloat(String(latStr));
    const lng = parseFloat(String(lngStr));

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Invalid coordinates. lat must be between -90 and 90, lng between -180 and 180.' });
      return;
    }

    let radiusKm = 5;
    if (radiusStr !== undefined) {
      radiusKm = parseFloat(String(radiusStr));
      if (Number.isNaN(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
        res.status(400).json({ error: 'radiusKm must be a positive number between 0.1 and 50' });
        return;
      }
    }

    let candidates: any[] = [];

    if (isDbConnected()) {
      try {
        const filter: any = { status: 'open' };
        if (callerUid) {
          filter.requesterId = { $ne: callerUid };
          filter.rejectedBy = { $ne: callerUid };
        }
        candidates = await DeliveryRequest.find(filter).lean();
      } catch (dbErr: any) {
        console.warn('[DB Nearby Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    if (candidates.length === 0 && process.env.NODE_ENV === 'test') {
      candidates = inMemoryDeliveries.filter((d) => {
        return (
          d.status === 'open' &&
          (!callerUid || d.requesterId !== callerUid) &&
          (!callerUid || !d.rejectedBy?.includes(callerUid))
        );
      });
    }

    const partnerCoords: [number, number] = [lat, lng];
    const results: any[] = [];

    for (const item of candidates) {
      if (!isValidPickupCoords(item.pickupCoords)) continue;
      const distKm = calculateHaversineDistance(partnerCoords, [item.pickupCoords[0], item.pickupCoords[1]]);
      if (distKm <= radiusKm) {
        const formatted = formatDelivery({ ...item, pickupDistanceKm: distKm }, callerUid);
        results.push(formatted);
      }
    }

    results.sort((a, b) => (a.pickupDistanceKm || 0) - (b.pickupDistanceKm || 0));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to find nearby deliveries', details: err.message });
  }
});

// POST /api/deliveries - Create new delivery request
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const {
      title,
      description,
      category,
      pickupAddress,
      pickupCoords,
      pickupPlaceId,
      dropoffAddress,
      dropoffCoords,
      dropoffPlaceId,
      itemSize,
      weightEstimateKg,
      compensation,
      urgency,
      neededBy,
      distanceKm,
      estimatedDurationMin,
    } = req.body;

    if (!title || !pickupAddress || !dropoffAddress || !pickupCoords || !dropoffCoords || compensation === undefined) {
      res.status(400).json({ error: 'Missing required delivery fields' });
      return;
    }

    if (!isValidPickupCoords(pickupCoords)) {
      res.status(400).json({ error: 'Invalid pickup coordinates. Must be [latitude, longitude]' });
      return;
    }

    if (!isValidPickupCoords(dropoffCoords)) {
      res.status(400).json({ error: 'Invalid dropoff coordinates. Must be [latitude, longitude]' });
      return;
    }

    // Duplicate-request protection (within 60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    if (isDbConnected()) {
      try {
        const duplicate = await DeliveryRequest.findOne({
          requesterId: uid,
          title: String(title).trim(),
          status: 'open',
          createdAt: { $gte: sixtySecondsAgo },
        });
        if (duplicate) {
          res.status(409).json({
            error: 'Duplicate delivery request detected. An identical request is already open.',
            deliveryId: duplicate._id,
          });
          return;
        }
      } catch (dupErr: any) {
        console.warn('[Duplicate Check Notice]', dupErr.message);
      }
    } else if (process.env.NODE_ENV === 'test') {
      const dup = inMemoryDeliveries.find((d) =>
        d.requesterId === uid &&
        d.title === String(title).trim() &&
        d.status === 'open' &&
        new Date(d.createdAt).getTime() >= sixtySecondsAgo.getTime()
      );
      if (dup) {
        res.status(409).json({
          error: 'Duplicate delivery request detected. An identical request is already open.',
          deliveryId: dup._id,
        });
        return;
      }
    }

    // Cryptographic PIN Generation & Hashing
    const rawPin = (req.body.handoverPin && typeof req.body.handoverPin === 'string' && /^\d{4}$/.test(req.body.handoverPin.trim()))
      ? req.body.handoverPin.trim()
      : generateHandoverPin();
    const pinSalt = generatePinSalt();
    const pinHash = hashPin(rawPin, pinSalt);

    const newId = (req.body.id && typeof req.body.id === 'string' && req.body.id.trim())
      ? req.body.id.trim()
      : new mongoose.Types.ObjectId().toString();

    const deliveryData: InMemDelivery = {
      _id: newId,
      id: newId,
      title: String(title).trim(),
      description: String(description || 'Standard delivery errand').trim(),
      category: category || 'other',
      pickupAddress: String(pickupAddress).trim(),
      pickupCoords,
      pickupPlaceId: pickupPlaceId ? String(pickupPlaceId).trim() : undefined,
      dropoffAddress: String(dropoffAddress).trim(),
      dropoffCoords,
      dropoffPlaceId: dropoffPlaceId ? String(dropoffPlaceId).trim() : undefined,
      itemSize: itemSize || 'medium',
      weightEstimateKg: weightEstimateKg ? Number(weightEstimateKg) : undefined,
      compensation: Number(compensation),
      urgency: urgency || 'standard',
      neededBy: neededBy || 'Today by 18:00',
      status: 'open',
      statusHistory: [
        {
          status: 'open',
          changedAt: new Date(),
          changedBy: uid,
          note: 'Delivery request created by customer',
        },
      ],
      requesterId: uid,
      requesterName: req.user!.name || 'RouteM8 Requester',
      requesterTrustScore: 98,
      requesterAvatar: req.user!.picture,
      distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
      estimatedDurationMin: estimatedDurationMin !== undefined ? Number(estimatedDurationMin) : undefined,
      handoverPin: rawPin,
      handoverPinHash: pinHash,
      handoverPinSalt: pinSalt,
      pinAttempts: 0,
      rejectedBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (isDbConnected()) {
      try {
        let requester = await User.findOne({ firebaseUid: uid });
        if (!requester) {
          requester = await User.create({
            firebaseUid: uid,
            email: req.user!.email || `${uid}@firebase.com`,
            fullName: req.user!.name || 'RouteM8 Requester',
            role: 'both',
          });
        }

        const newDoc = await DeliveryRequest.create({
          ...deliveryData,
          requesterName: requester.fullName,
          requesterTrustScore: requester.trustScore,
          requesterAvatar: requester.avatarUrl,
        });

        // Activity log
        await Activity.create({
          userId: uid,
          type: 'request_created',
          title: `Created delivery: ${title}`,
          description: `Delivery from ${pickupAddress} to ${dropoffAddress}`,
          relatedId: newDoc._id.toString(),
          status: 'open',
        }).catch(() => {});

        const io = req.app.get('io');
        if (io) {
          const formattedDoc = formatDelivery(newDoc);
          io.emit('delivery:created', formattedDoc);
          io.emit('delivery:new', formattedDoc);
        }
        dispatchService.startDispatch(newDoc, io);

        res.status(201).json(formatDelivery(newDoc, uid));
        return;
      } catch (dbErr: any) {
        console.warn('[DB Save Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    inMemoryDeliveries.unshift(deliveryData);

    const io = req.app.get('io');
    if (io) {
      const formattedMem = formatDelivery(deliveryData);
      io.emit('delivery:created', formattedMem);
      io.emit('delivery:new', formattedMem);
    }
    dispatchService.startDispatch(deliveryData, io);

    res.status(201).json(formatDelivery(deliveryData, uid));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create delivery request', details: err.message });
  }
});

// POST /api/deliveries/:id/accept - Partner accepts delivery atomically (Concurrency locked)
router.post('/:id/accept', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isDbConnected()) {
      try {
        let transporter = await User.findOne({ firebaseUid: uid });
        if (!transporter) {
          transporter = await User.create({
            firebaseUid: uid,
            email: req.user!.email || `${uid}@firebase.com`,
            fullName: req.user!.name || 'Delivery Partner',
            role: 'transporter',
          });
        }

        // Atomic lock: Only updates if status is still 'open' and requester != transporter
        const delivery = await DeliveryRequest.findOneAndUpdate(
          {
            _id: toMongoIdFilter(deliveryId),
            status: 'open',
            requesterId: { $ne: uid },
          },
          {
            $set: {
              status: 'matched',
              transporterId: uid,
              transporterName: transporter.fullName,
              transporterAvatar: transporter.avatarUrl,
              transporterVehicle: transporter.commuteVehicle || 'Vehicle / Commuter',
            },
            $push: {
              statusHistory: {
                status: 'matched',
                changedAt: new Date(),
                changedBy: uid,
                note: 'Transporter accepted delivery assignment',
              },
            },
          },
          { new: true }
        );

        if (!delivery) {
          const existing = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
          if (!existing) {
            res.status(404).json({ error: 'Delivery request not found' });
            return;
          }
          if (existing.requesterId === uid) {
            res.status(403).json({ error: 'Forbidden: cannot accept your own delivery request' });
            return;
          }
          if (existing.status !== 'open') {
            res.status(409).json({
              error: 'Conflict: Delivery has already been accepted by another partner or is no longer open',
              currentStatus: existing.status,
            });
            return;
          }
        }

        if (delivery) {
          await Activity.create({
            userId: uid,
            type: 'match_found',
            title: `Accepted delivery: ${delivery.title}`,
            description: `Pickup from ${delivery.pickupAddress}`,
            relatedId: delivery._id.toString(),
            status: 'matched',
          }).catch(() => {});

          const io = req.app.get('io');
          if (io) {
            const formatted = formatDelivery(delivery);
            io.emit('delivery:updated', formatted);
            io.to(`delivery:${delivery._id}`).emit('delivery:matched', formatted);
          }

          res.json(formatDelivery(delivery, uid));
          return;
        }
      } catch (dbErr: any) {
        console.warn('[DB Accept Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory atomic check for automated test runner
    const target = inMemoryDeliveries.find((d) => d._id === req.params.id || d.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }

    if (target.requesterId === uid) {
      res.status(403).json({ error: 'Forbidden: cannot accept your own delivery request' });
      return;
    }

    if (target.status !== 'open') {
      res.status(409).json({
        error: 'Conflict: Delivery has already been accepted by another partner or is no longer open',
        currentStatus: target.status,
      });
      return;
    }

    target.status = 'matched';
    target.transporterId = uid;
    target.transporterName = req.user!.name || 'Delivery Partner';
    target.transporterAvatar = req.user!.picture;
    target.transporterVehicle = 'Vehicle / Commuter';
    target.updatedAt = new Date();

    const io = req.app.get('io');
    if (io) {
      const formatted = formatDelivery(target);
      io.emit('delivery:updated', formatted);
    }

    res.json(formatDelivery(target, uid));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to accept delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/reject - Partner dismisses delivery from discovery
router.post('/:id/reject', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isDbConnected()) {
      try {
        await DeliveryRequest.updateOne(
          { _id: toMongoIdFilter(deliveryId) },
          { $addToSet: { rejectedBy: uid } }
        );
        res.json({ success: true, message: 'Delivery dismissed from matching list' });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Reject Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (target) {
      if (!target.rejectedBy) target.rejectedBy = [];
      if (!target.rejectedBy.includes(uid)) target.rejectedBy.push(uid);
    }

    res.json({ success: true, message: 'Delivery dismissed from matching list' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reject delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/start-transit - Partner indicates package has been collected and is en route
router.post('/:id/start-transit', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only the assigned delivery partner can start transit' });
          return;
        }

        if (delivery.status !== 'matched') {
          res.status(400).json({ error: `Cannot start transit: Cannot transition delivery to in_transit from status: ${delivery.status}` });
          return;
        }

        delivery.status = 'in_transit';
        delivery.statusHistory.push({
          status: 'in_transit',
          changedAt: new Date(),
          changedBy: uid,
          note: 'Package collected; in transit to destination',
        });
        await delivery.save();

        const io = req.app.get('io');
        if (io) {
          const formatted = formatDelivery(delivery);
          io.emit('delivery:updated', formatted);
          io.to(`delivery:${delivery._id}`).emit('delivery:in_transit', formatted);
        }

        res.json(formatDelivery(delivery, uid));
        return;
      } catch (dbErr: any) {
        console.warn('[DB Start Transit Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned delivery partner can start transit' });
      return;
    }

    if (target.status !== 'matched') {
      res.status(400).json({ error: `Cannot start transit: Cannot transition delivery to in_transit from status: ${target.status}` });
      return;
    }

    target.status = 'in_transit';
    target.updatedAt = new Date();

    const io = req.app.get('io');
    if (io) {
      const formatted = formatDelivery(target);
      io.emit('delivery:updated', formatted);
    }

    res.json(formatDelivery(target, uid));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start transit', details: err.message });
  }
});

// POST /api/deliveries/:id/verify-pin - Transporter submits handover PIN for dropoff verification
router.post('/:id/verify-pin', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { pin } = req.body;

    if (!pin || typeof pin !== 'string') {
      res.status(400).json({ error: 'A 4-digit handover PIN is required' });
      return;
    }

    const cleanedPin = pin.trim();
    if (!/^\d{4}$/.test(cleanedPin)) {
      res.status(400).json({ error: 'Please provide a valid 4-digit handover PIN' });
      return;
    }

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.requesterId !== uid && delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only participants in this delivery can verify handover' });
          return;
        }

        if (delivery.status === 'completed') {
          res.status(400).json({ error: 'Delivery is already completed' });
          return;
        }

        // Lockout evaluation
        if (delivery.pinLockedUntil && new Date() < new Date(delivery.pinLockedUntil)) {
          const waitMinutes = Math.ceil((new Date(delivery.pinLockedUntil).getTime() - Date.now()) / 60000);
          res.status(429).json({
            error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
            lockedUntil: delivery.pinLockedUntil,
            isLocked: true,
          });
          return;
        }

        // Cryptographic or plaintext PIN match check
        const isMatch = (delivery.handoverPinSalt && delivery.handoverPinHash)
          ? verifyPinHash(cleanedPin, delivery.handoverPinSalt, delivery.handoverPinHash)
          : cleanedPin === delivery.handoverPin;

        if (!isMatch) {
          delivery.pinAttempts = (delivery.pinAttempts || 0) + 1;
          const MAX_ATTEMPTS = 5;

          if (delivery.pinAttempts >= MAX_ATTEMPTS) {
            delivery.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          }

          await delivery.save();

          const remaining = Math.max(0, MAX_ATTEMPTS - delivery.pinAttempts);
          res.status(400).json({
            error: 'Invalid handover PIN',
            attemptsRemaining: remaining,
            isLocked: delivery.pinAttempts >= MAX_ATTEMPTS,
            lockedUntil: delivery.pinLockedUntil,
          });
          return;
        }

        // Correct PIN: complete the delivery
        delivery.pinAttempts = 0;
        delivery.pinLockedUntil = undefined;
        delivery.status = 'completed';
        delivery.statusHistory.push({
          status: 'completed',
          changedAt: new Date(),
          changedBy: uid,
          note: 'Handover completed; verified with PIN',
        });
        await delivery.save();

        if (delivery.transporterId) {
          await User.findOneAndUpdate(
            { firebaseUid: delivery.transporterId },
            { $inc: { completedDeliveries: 1 } }
          ).catch(() => {});
        }

        const io = req.app.get('io');
        if (io) {
          const formatted = formatDelivery(delivery);
          io.emit('delivery:updated', formatted);
          io.to(`delivery:${delivery._id}`).emit('delivery:completed', formatted);
        }

        res.json({
          success: true,
          message: 'Handover verified and delivery completed successfully!',
          delivery: formatDelivery(delivery, uid),
        });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Verify PIN Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory verification for test runner
    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.requesterId !== uid && target.transporterId !== uid) {
      res.status(403).json({ error: 'Only participants in this delivery can verify handover' });
      return;
    }

    if (target.status === 'completed') {
      res.status(400).json({ error: 'Delivery is already completed' });
      return;
    }

    if (target.pinLockedUntil && new Date() < new Date(target.pinLockedUntil)) {
      const waitMinutes = Math.ceil((new Date(target.pinLockedUntil).getTime() - Date.now()) / 60000);
      res.status(429).json({
        error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
        lockedUntil: target.pinLockedUntil,
        isLocked: true,
      });
      return;
    }

    const isMatch = (target.handoverPinSalt && target.handoverPinHash)
      ? verifyPinHash(cleanedPin, target.handoverPinSalt, target.handoverPinHash)
      : cleanedPin === target.handoverPin;

    if (!isMatch) {
      target.pinAttempts = (target.pinAttempts || 0) + 1;
      const MAX_ATTEMPTS = 5;

      if (target.pinAttempts >= MAX_ATTEMPTS) {
        target.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      const remaining = Math.max(0, MAX_ATTEMPTS - target.pinAttempts);
      res.status(400).json({
        error: 'Invalid handover PIN',
        attemptsRemaining: remaining,
        isLocked: target.pinAttempts >= MAX_ATTEMPTS,
        lockedUntil: target.pinLockedUntil,
      });
      return;
    }

    target.pinAttempts = 0;
    target.pinLockedUntil = undefined;
    target.status = 'completed';
    target.updatedAt = new Date();

    const io = req.app.get('io');
    if (io) {
      const formatted = formatDelivery(target);
      io.emit('delivery:updated', formatted);
    }

    res.json({
      success: true,
      message: 'Handover verified and delivery completed successfully!',
      delivery: formatDelivery(target, uid),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify handover PIN', details: err.message });
  }
});

// In-memory throttle tracker to avoid excessive MongoDB writes on Atlas M0
const lastTelemetryLogTimes = new Map<string, { time: number; lat: number; lng: number }>();

export function shouldPersistTelemetryLog(deliveryId: string, lat: number, lng: number): boolean {
  const last = lastTelemetryLogTimes.get(deliveryId);
  const now = Date.now();
  if (!last) {
    lastTelemetryLogTimes.set(deliveryId, { time: now, lat, lng });
    return true;
  }
  const timeElapsedMs = now - last.time;
  const distMeters = calculateHaversineDistance([last.lat, last.lng], [lat, lng]) * 1000;
  // Save historical telemetry breadcrumb every 30s or when moved >= 50m
  if (timeElapsedMs >= 30000 || distMeters >= 50) {
    lastTelemetryLogTimes.set(deliveryId, { time: now, lat, lng });
    return true;
  }
  return false;
}

// POST /api/deliveries/:id/location - Transporter streams telemetry position
router.post('/:id/location', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { latitude, longitude, heading, speed, accuracy, clientTimestamp } = req.body || {};

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: 'latitude and longitude are required' });
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Coordinates out of bounds' });
      return;
    }

    const numericAccuracy =
      typeof accuracy === 'number' && !Number.isNaN(accuracy) && accuracy >= 0 ? accuracy : undefined;

    const updateTime =
      typeof clientTimestamp === 'number' && !Number.isNaN(clientTimestamp) && clientTimestamp > 0
        ? new Date(clientTimestamp)
        : new Date();
    const nowIso = updateTime.toISOString();

    const locationUpdate = {
      deliveryId,
      transporterId: uid,
      latitude: lat,
      longitude: lng,
      heading: typeof heading === 'number' ? heading : undefined,
      speed: typeof speed === 'number' ? speed : undefined,
      accuracy: numericAccuracy,
      updatedAt: nowIso,
    };

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only the assigned delivery partner can stream location telemetry' });
          return;
        }

        // Out-of-order stale update guard
        const existingLastKnown = (delivery as any).lastKnownLocation;
        if (existingLastKnown && existingLastKnown.updatedAt) {
          const existingTime = new Date(existingLastKnown.updatedAt).getTime();
          if (updateTime.getTime() < existingTime) {
            res.json({ success: true, location: existingLastKnown, stale: true });
            return;
          }
        }

        delivery.lastKnownLocation = locationUpdate;
        await delivery.save();

        // Optimize MongoDB writes for Atlas M0: throttle breadcrumb insertions
        if (shouldPersistTelemetryLog(deliveryId, lat, lng)) {
          await Location.create(locationUpdate).catch(() => {});
        }

        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${deliveryId}`).emit('delivery:location', locationUpdate);
          io.to(`delivery:${deliveryId}`).emit('location:change', locationUpdate);
        }

        res.json({ success: true, location: locationUpdate });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Location Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned delivery partner can stream location telemetry' });
      return;
    }

    // Out-of-order stale update guard for in-memory
    if (target.lastKnownLocation && target.lastKnownLocation.updatedAt) {
      const existingTime = new Date(target.lastKnownLocation.updatedAt).getTime();
      if (updateTime.getTime() < existingTime) {
        res.json({ success: true, location: target.lastKnownLocation, stale: true });
        return;
      }
    }

    target.lastKnownLocation = locationUpdate;
    inMemoryLocations.set(deliveryId, locationUpdate);

    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${deliveryId}`).emit('delivery:location', locationUpdate);
      io.to(`delivery:${deliveryId}`).emit('location:change', locationUpdate);
    }

    res.json({ success: true, location: locationUpdate });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record location', details: err.message });
  }
});

// GET /api/deliveries/:id/location - Polling endpoint for real-time transporter GPS position
router.get('/:id/location', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const callerUid = req.user?.uid;

    if (isDbConnected()) {
      const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
      if (!delivery) {
        res.status(404).json({ error: 'Delivery not found' });
        return;
      }

      // Check authorization: only participants can view location
      if (callerUid && delivery.requesterId !== callerUid && delivery.transporterId !== callerUid) {
        res.status(403).json({ error: 'Forbidden: only delivery participants can view live location' });
        return;
      }

      res.json(delivery.lastKnownLocation || null);
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (callerUid && target && target.requesterId !== callerUid && target.transporterId !== callerUid) {
      res.status(403).json({ error: 'Forbidden: only delivery participants can view live location' });
      return;
    }

    const loc = inMemoryLocations.get(deliveryId) || target?.lastKnownLocation;
    res.json(loc || null);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get location', details: err.message });
  }
});

// GET /api/deliveries/:id - Fetch single delivery
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const callerUid = req.user?.uid;

    if (isDbConnected()) {
      try {
        const doc = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (doc) {
          res.json(formatDelivery(doc, callerUid));
          return;
        }
      } catch (dbErr: any) {
        console.warn('[DB Get Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const local = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (local) {
      res.json(formatDelivery(local, callerUid));
      return;
    }

    res.status(404).json({ error: 'Delivery not found' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/cancel - Requester cancels their delivery
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.requesterId !== uid && delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only participants can cancel this delivery' });
          return;
        }

        if (delivery.status === 'completed') {
          res.status(400).json({ error: 'Cannot cancel a completed delivery' });
          return;
        }

        delivery.status = 'cancelled';
        delivery.statusHistory.push({
          status: 'cancelled',
          changedAt: new Date(),
          changedBy: uid,
          note: 'Delivery cancelled by user',
        });
        await delivery.save();

        res.json({ success: true, message: 'Delivery cancelled successfully', delivery: formatDelivery(delivery, uid) });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Cancel Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.requesterId !== uid && target.transporterId !== uid) {
      res.status(403).json({ error: 'Only participants can cancel this delivery' });
      return;
    }

    if (target.status === 'completed') {
      res.status(400).json({ error: 'Cannot cancel a completed delivery' });
      return;
    }

    target.status = 'cancelled';
    target.updatedAt = new Date();

    res.json({ success: true, message: 'Delivery cancelled successfully', delivery: formatDelivery(target, uid) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to cancel delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/proof - Upload photographic delivery proof
router.post('/:id/proof', requireAuth, upload.single('photo'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (!req.file) {
      res.status(400).json({ error: 'A photo file is required' });
      return;
    }

    // Convert file to secure data URI or store in MongoDB
    const base64Photo = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findOne({ _id: toMongoIdFilter(deliveryId) });
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only the assigned transporter can submit delivery proof' });
          return;
        }

        delivery.proofPhotoUrl = base64Photo;
        delivery.proofPhotoMetadata = {
          size: req.file.size,
          mimeType: req.file.mimetype,
          uploadedAt: new Date(),
        };
        await delivery.save();

        res.json({ success: true, message: 'Delivery proof photo recorded' });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Proof Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const target = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned transporter can submit delivery proof' });
      return;
    }

    target.proofPhotoUrl = base64Photo;
    res.json({ success: true, message: 'Delivery proof photo recorded' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record proof photo', details: err.message });
  }
});

export default router;
