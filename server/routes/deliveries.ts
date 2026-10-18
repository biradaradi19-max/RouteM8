import { Router, type Response } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';
import { Location } from '../models/Location.js';

const router = Router();

// Setup Multer for private delivery proof photos
const uploadsDir = path.join(process.cwd(), 'uploads', 'delivery-proofs');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
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

// Helper to format Mongo document into standard frontend DeliveryRequest
function formatDelivery(doc: any) {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    pickupAddress: doc.pickupAddress,
    pickupCoords: doc.pickupCoords,
    dropoffAddress: doc.dropoffAddress,
    dropoffCoords: doc.dropoffCoords,
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
    handoverPin: doc.handoverPin,
    pinAttempts: doc.pinAttempts,
    pinLockedUntil: doc.pinLockedUntil,
    proofPhotoUrl: doc.proofPhotoUrl,
    rejectedBy: doc.rejectedBy || [],
    distanceKm: doc.distanceKm,
    estimatedDurationMin: doc.estimatedDurationMin,
    estimatedDetourMinutes: doc.estimatedDetourMinutes,
    createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

// GET /api/deliveries - List deliveries
router.get('/', async (req, res): Promise<void> => {
  try {
    const { status, requesterId, transporterId, category, excludeRejectedBy } = req.query;
    const filter: any = {};

    if (status) {
      filter.status = status;
    }
    if (requesterId) {
      filter.requesterId = requesterId;
    }
    if (transporterId) {
      filter.transporterId = transporterId;
    }
    if (category) {
      filter.category = category;
    }
    if (excludeRejectedBy) {
      filter.rejectedBy = { $ne: String(excludeRejectedBy) };
    }

    const docs = await DeliveryRequest.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(formatDelivery));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch deliveries', details: err.message });
  }
});

// GET /api/deliveries/:id - Get single delivery
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const doc = await DeliveryRequest.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }
    res.json(formatDelivery(doc));
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
      dropoffAddress,
      dropoffCoords,
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

    // Retrieve requester profile
    let requester = await User.findOne({ firebaseUid: uid });
    if (!requester) {
      requester = await User.create({
        firebaseUid: uid,
        email: req.user!.email || `${uid}@firebase.com`,
        fullName: req.user!.name || 'RouteM8 Requester',
        role: 'both',
      });
    }

    // Generate random 4-digit handover PIN
    const handoverPin = Math.floor(1000 + Math.random() * 9000).toString();

    const newDelivery = await DeliveryRequest.create({
      title: String(title).trim(),
      description: String(description || 'Standard errand request').trim(),
      category: category || 'other',
      pickupAddress: String(pickupAddress).trim(),
      pickupCoords,
      dropoffAddress: String(dropoffAddress).trim(),
      dropoffCoords,
      itemSize: itemSize || 'medium',
      weightEstimateKg: weightEstimateKg ? Number(weightEstimateKg) : undefined,
      compensation: Number(compensation),
      urgency: urgency || 'standard',
      neededBy: neededBy || 'Today by 18:00',
      status: 'open',
      requesterId: uid,
      requesterName: requester.fullName,
      requesterTrustScore: requester.trustScore,
      requesterAvatar: requester.avatarUrl,
      distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
      estimatedDurationMin: estimatedDurationMin !== undefined ? Number(estimatedDurationMin) : undefined,
      handoverPin,
      pinAttempts: 0,
      rejectedBy: [],
    });

    // Record activity
    await Activity.create({
      userId: uid,
      type: 'request_created',
      title: `Created delivery: ${title}`,
      description: `Delivery from ${pickupAddress} to ${dropoffAddress}`,
      relatedId: newDelivery._id.toString(),
      status: 'open',
    });

    res.status(201).json(formatDelivery(newDelivery));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create delivery request', details: err.message });
  }
});

// POST /api/deliveries/:id/accept - Partner accepts delivery atomically
router.post('/:id/accept', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;

    // Get transporter profile
    let transporter = await User.findOne({ firebaseUid: uid });
    if (!transporter) {
      transporter = await User.create({
        firebaseUid: uid,
        email: req.user!.email || `${uid}@firebase.com`,
        fullName: req.user!.name || 'Delivery Partner',
        role: 'transporter',
      });
    }

    // Atomic findOneAndUpdate ensuring status is 'open' and partner is not the requester
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
      // Diagnostic check for precise failure code
      const existing = await DeliveryRequest.findById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Delivery request not found' });
        return;
      }
      if (existing.requesterId === uid) {
        res.status(400).json({ error: 'Cannot accept your own delivery request' });
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
    });

    const formatted = formatDelivery(delivery);

    // Notify requester via delivery room and broadcast claimed to other partners
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery:${delivery._id}`).emit('delivery:matched', formatted);
      io.emit('delivery:claimed', { deliveryId: delivery._id.toString() });
    }

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to accept delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/reject - Partner dismisses/rejects delivery opportunity
router.post('/:id/reject', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const delivery = await DeliveryRequest.findById(req.params.id);

    if (!delivery) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }

    // Dismiss only for this partner by adding UID to rejectedBy array
    await DeliveryRequest.findByIdAndUpdate(req.params.id, {
      $addToSet: { rejectedBy: uid },
    });

    res.json({ success: true, message: 'Delivery dismissed for this partner' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to dismiss delivery', details: err.message });
  }
});

// POST /api/deliveries/:id/start-transit - Partner begins transit
router.post('/:id/start-transit', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const delivery = await DeliveryRequest.findById(req.params.id);

    if (!delivery) {
      res.status(404).json({ error: 'Delivery not found' });
      return;
    }

    if (delivery.transporterId !== uid) {
      res.status(403).json({ error: 'Only the assigned delivery partner can start transit' });
      return;
    }

    if (delivery.status !== 'matched') {
      res.status(400).json({ error: `Cannot start transit from status '${delivery.status}'` });
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
    });

    res.json(formatDelivery(delivery));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start transit', details: err.message });
  }
});

// POST /api/deliveries/:id/verify-pin - Handover PIN verification with lockout
router.post('/:id/verify-pin', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { pin } = req.body;
    const delivery = await DeliveryRequest.findById(req.params.id);

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
      });
      return;
    }

    const cleanedPin = String(pin).trim();
    if (cleanedPin !== delivery.handoverPin) {
      delivery.pinAttempts = (delivery.pinAttempts || 0) + 1;
      const MAX_ATTEMPTS = 5;

      if (delivery.pinAttempts >= MAX_ATTEMPTS) {
        // Lock out for 15 minutes
        delivery.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await delivery.save();

      const remaining = Math.max(0, MAX_ATTEMPTS - delivery.pinAttempts);
      res.status(400).json({
        error: 'Invalid handover PIN',
        attemptsRemaining: remaining,
        isLocked: delivery.pinAttempts >= MAX_ATTEMPTS,
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
      await User.updateOne({ firebaseUid: delivery.transporterId }, { $inc: { completedDeliveries: 1 } });
    }
    await User.updateOne({ firebaseUid: delivery.requesterId }, { $inc: { completedDeliveries: 1 } });

    await Activity.create({
      userId: uid,
      type: 'delivered',
      title: `Delivery completed: ${delivery.title}`,
      description: `Handover verified with secure PIN. Earned $${delivery.compensation.toFixed(2)}`,
      relatedId: delivery._id.toString(),
      status: 'completed',
    });

    res.json({
      success: true,
      message: 'Handover verified and delivery completed',
      delivery: formatDelivery(delivery),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify PIN', details: err.message });
  }
});

// POST /api/deliveries/:id/cancel - Cancel delivery
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const delivery = await DeliveryRequest.findById(req.params.id);

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

    res.json({ success: true, delivery: formatDelivery(delivery) });
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
    const latestLoc = await Location.findOne({ deliveryId: req.params.id }).sort({ createdAt: -1 });

    if (!latestLoc) {
      res.status(404).json({ error: 'No location updates found for this delivery' });
      return;
    }

    res.json({
      deliveryId: latestLoc.deliveryId,
      transporterId: latestLoc.transporterId,
      latitude: latestLoc.latitude,
      longitude: latestLoc.longitude,
      heading: latestLoc.heading,
      speed: latestLoc.speed,
      updatedAt: latestLoc.updatedAt.toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch location', details: err.message });
  }
});

export default router;
