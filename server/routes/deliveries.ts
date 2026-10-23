import { Router, type Response } from 'express';
import multer from 'multer';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';
import { Location } from '../models/Location.js';
import { isDbConnected } from '../config/db.js';
import { dispatchService } from '../services/dispatchService.js';
import { firestorePersistence } from '../services/firestorePersistence.js';

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
  status: 'open' | 'matched' | 'in_transit' | 'completed' | 'cancelled';
  requesterId: string;
  requesterName: string;
  requesterTrustScore: number;
  requesterAvatar?: string;
  transporterId?: string;
  transporterName?: string;
  transporterAvatar?: string;
  transporterVehicle?: string;
  handoverPin: string;
  pinAttempts: number;
  pinLockedUntil?: Date;
  proofPhotoUrl?: string;
  rejectedBy: string[];
  distanceKm?: number;
  estimatedDurationMin?: number;
  estimatedDetourMinutes?: number;
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
    distanceKm: 14.1,
    estimatedDurationMin: 20,
    estimatedDetourMinutes: 6,
    createdAt: new Date(Date.now() - 3600000 * 5),
    updatedAt: new Date(Date.now() - 3600000 * 5),
  },
];

export let inMemoryDeliveries: InMemDelivery[] = [...INITIAL_COMMUNITY_DELIVERIES];
export const inMemoryLocations = new Map<string, any>();

// Helper to format Mongo document into standard frontend DeliveryRequest
// Only the requester who created the delivery receives the plaintext handoverPin
function formatDelivery(doc: any, forUserId?: string) {
  const showPin = Boolean(forUserId && forUserId === doc.requesterId);

  return {
    id: (doc._id || doc.id).toString(),
    _id: (doc._id || doc.id).toString(),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    pickupAddress: doc.pickupAddress,
    pickupCoords: doc.pickupCoords,
    pickupPlaceId: doc.pickupPlaceId,
    dropoffAddress: doc.dropoffAddress,
    dropoffCoords: doc.dropoffCoords,
    dropoffPlaceId: doc.dropoffPlaceId,
    itemSize: doc.itemSize,
    weightEstimateKg: doc.weightEstimateKg,
    compensation: doc.compensation,
    urgency: doc.urgency,
    neededBy: doc.neededBy,
    status: doc.status,
    requesterId: doc.requesterId,
    requesterName: doc.requesterName,
    requesterTrustScore: doc.requesterTrustScore,
    requesterAvatar: doc.requesterAvatar,
    transporterId: doc.transporterId,
    transporterName: doc.transporterName,
    transporterAvatar: doc.transporterAvatar,
    transporterVehicle: doc.transporterVehicle,
    ...(showPin && doc.handoverPin ? { handoverPin: doc.handoverPin } : {}),
    pinAttempts: doc.pinAttempts,
    pinLockedUntil: doc.pinLockedUntil,
    proofPhotoUrl: doc.proofPhotoUrl,
    rejectedBy: doc.rejectedBy || [],
    distanceKm: doc.distanceKm,
    estimatedDurationMin: doc.estimatedDurationMin,
    estimatedDetourMinutes: doc.estimatedDetourMinutes,
    createdAt: doc.createdAt?.toISOString?.() || (doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()),
    updatedAt: doc.updatedAt?.toISOString?.() || (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString()),
  };
}

// Helper to find a delivery in DB or in-memory
export function getInMemDelivery(id: string | string[] | undefined) {
  if (!id) return undefined;
  const targetId = Array.isArray(id) ? id[0] : id;
  return inMemoryDeliveries.find(d => d._id === targetId || d.id === targetId);
}

// Asynchronous finder checking local memory first, then cross-container Firestore persistence
export async function findDelivery(id: string | string[] | undefined): Promise<InMemDelivery | undefined> {
  if (!id) return undefined;
  const targetId = Array.isArray(id) ? id[0] : id;
  const local = inMemoryDeliveries.find(d => d._id === targetId || d.id === targetId);
  if (local) return local;

  const remote = await firestorePersistence.getDelivery(targetId);
  if (remote) {
    const formatted: InMemDelivery = {
      ...remote,
      _id: remote._id || targetId,
      id: remote.id || targetId,
      rejectedBy: remote.rejectedBy || [],
      createdAt: remote.createdAt ? new Date(remote.createdAt) : new Date(),
      updatedAt: remote.updatedAt ? new Date(remote.updatedAt) : new Date(),
    };
    const existingIdx = inMemoryDeliveries.findIndex(d => d._id === targetId || d.id === targetId);
    if (existingIdx >= 0) {
      inMemoryDeliveries[existingIdx] = formatted;
    } else {
      inMemoryDeliveries.unshift(formatted);
    }
    return formatted;
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

        const count = await DeliveryRequest.countDocuments();
        if (count === 0) {
          // Auto-seed MongoDB with community requests
          await DeliveryRequest.insertMany(INITIAL_COMMUNITY_DELIVERIES as any);
        }

        const docs = await DeliveryRequest.find(filter).sort({ createdAt: -1 }).limit(100);
        res.json(docs.map(d => formatDelivery(d, callerUid)));
        return;
      } catch (dbErr: any) {
        console.warn('[DB Fallback] Falling back to in-memory delivery store:', dbErr.message);
      }
    }

    // In-memory + remote Firestore cross-container fallback
    let remoteDocs: any[] = [];
    try {
      remoteDocs = await firestorePersistence.listDeliveries(50);
    } catch {
      // Non-blocking
    }
    for (const rem of remoteDocs) {
      const rId = rem._id || rem.id;
      if (rId && !inMemoryDeliveries.some(d => d._id === rId || d.id === rId)) {
        inMemoryDeliveries.unshift({
          ...rem,
          _id: rId,
          id: rId,
          rejectedBy: rem.rejectedBy || [],
          createdAt: rem.createdAt ? new Date(rem.createdAt) : new Date(),
          updatedAt: rem.updatedAt ? new Date(rem.updatedAt) : new Date(),
        });
      }
    }

    let results = [...inMemoryDeliveries];
    if (status) results = results.filter(d => d.status === status);
    if (requesterId) results = results.filter(d => d.requesterId === requesterId);
    if (transporterId) results = results.filter(d => d.transporterId === transporterId);
    if (category) results = results.filter(d => d.category === category);
    if (excludeRejectedBy) results = results.filter(d => !d.rejectedBy || !d.rejectedBy.includes(String(excludeRejectedBy)));

    res.json(results.map(d => formatDelivery(d, callerUid)));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch deliveries', details: err.message });
  }
});

// GET /api/deliveries/:id - Get single delivery
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const callerUid = req.user?.uid;

    if (isDbConnected()) {
      try {
        const doc = await DeliveryRequest.findById(req.params.id);
        if (doc) {
          res.json(formatDelivery(doc, callerUid));
          return;
        }
      } catch {
        // Fallback to in-memory
      }
    }

    const inMem = await findDelivery(req.params.id);
    if (!inMem) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }
    res.json(formatDelivery(inMem, callerUid));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch delivery', details: err.message });
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

    const handoverPin = Math.floor(1000 + Math.random() * 9000).toString();
    const newId = `del-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

    const deliveryData: InMemDelivery = {
      _id: newId,
      id: newId,
      title: String(title).trim(),
      description: String(description || 'Standard errand request').trim(),
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
      requesterId: uid,
      requesterName: req.user!.name || 'RouteM8 Requester',
      requesterTrustScore: 98,
      requesterAvatar: req.user!.picture,
      distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
      estimatedDurationMin: estimatedDurationMin !== undefined ? Number(estimatedDurationMin) : undefined,
      handoverPin,
      pinAttempts: 0,
      rejectedBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Always store in inMemoryDeliveries as active cache and sync with Firestore
    inMemoryDeliveries.unshift(deliveryData);
    await firestorePersistence.saveDelivery(deliveryData);

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
        console.warn('[DB Save Fallback] Using in-memory created delivery:', dbErr.message);
      }
    }

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

// POST /api/deliveries/:id/accept - Partner accepts delivery atomically
router.post('/:id/accept', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;

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

        const delivery = await DeliveryRequest.findOneAndUpdate(
          {
            _id: req.params.id,
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
          },
          { new: true }
        );

        if (!delivery) {
          const existing = await DeliveryRequest.findById(req.params.id);
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
              error: 'This delivery has already been accepted by another partner or is no longer open',
              status: existing.status,
            });
            return;
          }
          res.status(400).json({ error: 'Unable to accept this delivery' });
          return;
        }

        await Activity.create({
          userId: uid,
          type: 'match_found',
          title: `Accepted delivery: ${delivery.title}`,
          description: `Matched with requester ${delivery.requesterName}`,
          relatedId: delivery._id.toString(),
          status: 'matched',
        }).catch(() => {});

        const formatted = formatDelivery(delivery);
        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${delivery._id}`).emit('delivery:matched', formatted);
          io.emit('delivery:claimed', { deliveryId: delivery._id.toString() });
        }
        dispatchService.stopDispatch(delivery._id.toString(), 'assigned', io);

        res.json(formatted);
        return;
      } catch (dbErr: any) {
        console.warn('[DB Accept Fallback] Falling back to in-memory accept:', dbErr.message);
      }
    }

    // In-memory atomic accept
    const target = await findDelivery(req.params.id);
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
        error: 'This delivery has already been accepted by another partner or is no longer open',
        status: target.status,
      });
      return;
    }

    target.status = 'matched';
    target.transporterId = uid;
    target.transporterName = req.user!.name || 'Delivery Partner';
    target.transporterVehicle = 'Commuter Vehicle';
    target.updatedAt = new Date();

    // Persist matched state across serverless containers
    await firestorePersistence.saveDelivery(target);

    const formatted = formatDelivery(target);
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${target._id}`).emit('delivery:matched', formatted);
      io.emit('delivery:claimed', { deliveryId: target._id.toString() });
    }
    dispatchService.stopDispatch(target._id.toString(), 'assigned', io);

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to accept delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/reject - Partner dismisses/rejects delivery opportunity
router.post('/:id/reject', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(req.params.id);

    dispatchService.handlePartnerDecline(deliveryId, uid);

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(req.params.id);
        if (!delivery) {
          res.status(404).json({ error: 'Delivery request not found' });
          return;
        }

        await DeliveryRequest.findByIdAndUpdate(req.params.id, {
          $addToSet: { rejectedBy: uid },
        });

        res.json({ success: true, message: 'Delivery dismissed for this partner' });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Reject Fallback] Falling back to in-memory reject:', dbErr.message);
      }
    }

    const target = await findDelivery(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }

    if (!target.rejectedBy) target.rejectedBy = [];
    if (!target.rejectedBy.includes(uid)) {
      target.rejectedBy.push(uid);
    }
    target.updatedAt = new Date();
    await firestorePersistence.saveDelivery(target);

    res.json({ success: true, message: 'Delivery dismissed for this partner' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to dismiss delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/start-transit - Partner begins transit
router.post('/:id/start-transit', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(req.params.id);

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);

        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only the assigned delivery partner can start transit' });
          return;
        }

        if (delivery.status !== 'matched') {
          res.status(400).json({ error: `Cannot start transit from status '${delivery.status}'. Delivery must be in 'matched' status.` });
          return;
        }

        delivery.status = 'in_transit';
        await delivery.save();

        await Activity.create({
          userId: uid,
          type: 'in_transit',
          title: `In transit: ${delivery.title}`,
          description: `En route to pickup and drop-off`,
          relatedId: delivery._id.toString(),
          status: 'in_transit',
        }).catch(() => {});

        const formatted = formatDelivery(delivery);
        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${delivery._id}`).emit('delivery:in_transit', formatted);
          io.to(`delivery:${delivery._id}`).emit('delivery:status_changed', {
            deliveryId: delivery._id.toString(),
            status: 'in_transit',
            delivery: formatted,
          });
          io.emit('delivery:updated', formatted);
        }

        res.json(formatted);
        return;
      } catch (dbErr: any) {
        console.warn('[DB Start-Transit Fallback] Falling back to in-memory start-transit:', dbErr.message);
      }
    }

    // In-memory fallback
    const target = await findDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned delivery partner can start transit' });
      return;
    }

    if (target.status !== 'matched') {
      res.status(400).json({ error: `Cannot start transit from status '${target.status}'. Delivery must be in 'matched' status.` });
      return;
    }

    target.status = 'in_transit';
    target.updatedAt = new Date();

    // Persist in-transit state across serverless containers
    await firestorePersistence.saveDelivery(target);

    const formatted = formatDelivery(target);
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${target._id}`).emit('delivery:in_transit', formatted);
      io.to(`delivery:${target._id}`).emit('delivery:status_changed', {
        deliveryId: target._id.toString(),
        status: 'in_transit',
        delivery: formatted,
      });
      io.emit('delivery:updated', formatted);
    }

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start transit', details: err.message });
  }
});

// POST /api/deliveries/:id/verify-pin - Handover PIN verification with lockout
router.post('/:id/verify-pin', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(req.params.id);
    const { pin } = req.body || {};

    if (!pin || typeof pin !== 'string' || pin.trim().length !== 4) {
      res.status(400).json({ error: 'Please provide a valid 4-digit handover PIN' });
      return;
    }

    const cleanedPin = pin.trim();

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);

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

        // Check lockout
        if (delivery.pinLockedUntil && new Date() < new Date(delivery.pinLockedUntil)) {
          const waitMinutes = Math.ceil((new Date(delivery.pinLockedUntil).getTime() - Date.now()) / 60000);
          res.status(429).json({
            error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
            lockedUntil: delivery.pinLockedUntil,
            isLocked: true,
          });
          return;
        }

        if (cleanedPin !== delivery.handoverPin) {
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
        await delivery.save();

        // Increment completed counts
        if (delivery.transporterId) {
          await User.updateOne({ firebaseUid: delivery.transporterId }, { $inc: { completedDeliveries: 1 } }).catch(() => {});
        }
        await User.updateOne({ firebaseUid: delivery.requesterId }, { $inc: { completedDeliveries: 1 } }).catch(() => {});

        await Activity.create({
          userId: uid,
          type: 'delivered',
          title: `Delivery completed: ${delivery.title}`,
          description: `Handover verified with secure PIN. Earned $${delivery.compensation.toFixed(2)}`,
          relatedId: delivery._id.toString(),
          status: 'completed',
        }).catch(() => {});

        const formatted = formatDelivery(delivery);
        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${delivery._id}`).emit('delivery:completed', formatted);
          io.to(`delivery:${delivery._id}`).emit('delivery:status_changed', {
            deliveryId: delivery._id.toString(),
            status: 'completed',
            delivery: formatted,
          });
          io.emit('delivery:updated', formatted);
        }

        res.json({
          success: true,
          message: 'Handover verified and delivery completed',
          delivery: formatted,
        });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Verify-PIN Fallback] Falling back to in-memory verify-pin:', dbErr.message);
      }
    }

    // In-memory fallback
    const target = await findDelivery(deliveryId);
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

    // Check lockout
    if (target.pinLockedUntil && new Date() < new Date(target.pinLockedUntil)) {
      const waitMinutes = Math.ceil((new Date(target.pinLockedUntil).getTime() - Date.now()) / 60000);
      res.status(429).json({
        error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
        lockedUntil: target.pinLockedUntil,
        isLocked: true,
      });
      return;
    }

    if (cleanedPin !== target.handoverPin) {
      target.pinAttempts = (target.pinAttempts || 0) + 1;
      const MAX_ATTEMPTS = 5;

      if (target.pinAttempts >= MAX_ATTEMPTS) {
        target.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      target.updatedAt = new Date();
      await firestorePersistence.saveDelivery(target);

      const remaining = Math.max(0, MAX_ATTEMPTS - target.pinAttempts);
      res.status(400).json({
        error: 'Invalid handover PIN',
        attemptsRemaining: remaining,
        isLocked: target.pinAttempts >= MAX_ATTEMPTS,
        lockedUntil: target.pinLockedUntil,
      });
      return;
    }

    // Correct PIN in-memory
    target.pinAttempts = 0;
    target.pinLockedUntil = undefined;
    target.status = 'completed';
    target.updatedAt = new Date();

    // Persist completed status across serverless containers
    await firestorePersistence.saveDelivery(target);

    const formatted = formatDelivery(target);
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${target._id}`).emit('delivery:completed', formatted);
      io.to(`delivery:${target._id}`).emit('delivery:status_changed', {
        deliveryId: target._id.toString(),
        status: 'completed',
        delivery: formatted,
      });
      io.emit('delivery:updated', formatted);
    }

    res.json({
      success: true,
      message: 'Handover verified and delivery completed',
      delivery: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify PIN', details: err.message });
  }
});

// POST /api/deliveries/:id/cancel - Cancel delivery
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(req.params.id);

    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);

        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.requesterId !== uid && delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Not authorized to cancel this delivery' });
          return;
        }

        if (delivery.status === 'completed') {
          res.status(400).json({ error: 'Cannot cancel a completed delivery' });
          return;
        }

        delivery.status = 'cancelled';
        await delivery.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${delivery._id}`).emit('delivery:cancelled', { deliveryId: delivery._id.toString() });
        }
        dispatchService.stopDispatch(delivery._id.toString(), 'cancelled', io);

        res.json({ success: true, delivery: formatDelivery(delivery) });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Cancel Fallback] Falling back to in-memory cancel:', dbErr.message);
      }
    }

    const target = await findDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.requesterId !== uid && target.transporterId !== uid) {
      res.status(403).json({ error: 'Not authorized to cancel this delivery' });
      return;
    }

    if (target.status === 'completed') {
      res.status(400).json({ error: 'Cannot cancel a completed delivery' });
      return;
    }

    target.status = 'cancelled';
    target.updatedAt = new Date();

    // Persist cancelled state across serverless containers
    await firestorePersistence.saveDelivery(target);

    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${target._id}`).emit('delivery:cancelled', { deliveryId: target._id.toString() });
    }
    dispatchService.stopDispatch(target._id.toString(), 'cancelled', io);

    res.json({ success: true, delivery: formatDelivery(target) });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to cancel delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/proof - Private delivery-proof photo upload
router.post(
  '/:id/proof',
  requireAuth,
  upload.single('photo'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const uid = req.user!.uid;
      const delivery = await DeliveryRequest.findById(req.params.id);

      if (!delivery) {
        res.status(404).json({ error: 'Delivery not found' });
        return;
      }

      if (delivery.transporterId !== uid && delivery.requesterId !== uid) {
        res.status(403).json({ error: 'Only participants can attach delivery proof' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No photo uploaded' });
        return;
      }

      const relativeUrl = `/uploads/delivery-proofs/${req.file.filename}`;
      delivery.proofPhotoUrl = relativeUrl;
      await delivery.save();

      res.json({
        success: true,
        proofPhotoUrl: relativeUrl,
        delivery: formatDelivery(delivery),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to upload delivery proof', details: err.message });
    }
  }
);

// GET /api/deliveries/:id/location - Get latest GPS location for delivery
router.get('/:id/location', async (req, res): Promise<void> => {
  try {
    const deliveryId = String(req.params.id);

    if (isDbConnected()) {
      try {
        const latestLoc = await Location.findOne({ deliveryId }).sort({ createdAt: -1 });
        if (latestLoc) {
          res.json({
            deliveryId: latestLoc.deliveryId,
            transporterId: latestLoc.transporterId,
            latitude: latestLoc.latitude,
            longitude: latestLoc.longitude,
            heading: latestLoc.heading,
            speed: latestLoc.speed,
            updatedAt: latestLoc.updatedAt.toISOString(),
          });
          return;
        }
      } catch (dbErr: any) {
        console.warn('[DB Location Fallback] Location query error:', dbErr.message);
      }
    }

    // In-memory fallback
    const memLoc = inMemoryLocations.get(deliveryId);
    if (memLoc) {
      res.json(memLoc);
      return;
    }

    const remoteLoc = await firestorePersistence.getLatestLocation(deliveryId);
    if (remoteLoc) {
      inMemoryLocations.set(deliveryId, remoteLoc);
      res.json(remoteLoc);
      return;
    }

    res.status(404).json({ error: 'No location updates found for this delivery' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch location', details: err.message });
  }
});

// POST /api/deliveries/:id/location - Record live GPS location (dual-transport HTTP fallback)
router.post('/:id/location', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const deliveryId = String(req.params.id);
    const { latitude, longitude, heading, speed } = req.body || {};

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ error: 'Latitude and longitude must be numbers' });
      return;
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: 'Coordinates out of bounds' });
      return;
    }

    // Check DB first if connected
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);
        if (!delivery) {
          res.status(404).json({ error: 'Delivery not found' });
          return;
        }

        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: 'Only the assigned delivery partner can send live location' });
          return;
        }

        if (delivery.status !== 'matched' && delivery.status !== 'in_transit') {
          res.status(400).json({ error: `Cannot share location for delivery in status "${delivery.status}"` });
          return;
        }

        const locDoc = await Location.create({
          deliveryId,
          transporterId: uid,
          latitude,
          longitude,
          heading: typeof heading === 'number' ? heading : undefined,
          speed: typeof speed === 'number' ? speed : undefined,
        });

        const payload = {
          deliveryId,
          transporterId: uid,
          latitude: locDoc.latitude,
          longitude: locDoc.longitude,
          heading: locDoc.heading,
          speed: locDoc.speed,
          updatedAt: locDoc.updatedAt.toISOString(),
        };

        inMemoryLocations.set(deliveryId, payload);
        await firestorePersistence.saveLocation(deliveryId, payload);

        const io = req.app.get('io');
        if (io) {
          io.to(`delivery:${deliveryId}`).emit('location:change', payload);
        }

        res.json({ success: true, location: payload });
        return;
      } catch (dbErr: any) {
        console.warn('[DB Location Fallback] Location create fallback:', dbErr.message);
      }
    }

    // In-memory fallback
    const target = await findDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (target.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned delivery partner can send live location' });
      return;
    }

    if (target.status !== 'matched' && target.status !== 'in_transit') {
      res.status(400).json({ error: `Cannot share location for delivery in status "${target.status}"` });
      return;
    }

    const payload = {
      deliveryId,
      transporterId: uid,
      latitude,
      longitude,
      heading: typeof heading === 'number' ? heading : undefined,
      speed: typeof speed === 'number' ? speed : undefined,
      updatedAt: new Date().toISOString(),
    };

    inMemoryLocations.set(deliveryId, payload);
    await firestorePersistence.saveLocation(deliveryId, payload);

    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${deliveryId}`).emit('location:change', payload);
    }

    res.json({ success: true, location: payload });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to record location', details: err.message });
  }
});

export default router;

