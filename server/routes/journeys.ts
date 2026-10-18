import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { Journey } from '../models/Journey.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';

const router = Router();

function formatJourney(doc: any) {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    transporterId: doc.transporterId,
    transporterName: doc.transporterName,
    transporterAvatar: doc.transporterAvatar,
    transporterTrustScore: doc.transporterTrustScore,
    vehicle: doc.vehicle,
    originAddress: doc.originAddress,
    originCoords: doc.originCoords,
    destAddress: doc.destAddress,
    destCoords: doc.destCoords,
    departureTime: doc.departureTime,
    maxDetourMinutes: doc.maxDetourMinutes,
    capacity: doc.capacity,
    recurringDays: doc.recurringDays,
    isActive: doc.isActive,
    notes: doc.notes,
    createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
  };
}

// GET /api/journeys - List published journeys
router.get('/', async (req, res): Promise<void> => {
  try {
    const { transporterId, activeOnly } = req.query;
    const filter: any = {};

    if (transporterId) {
      filter.transporterId = transporterId;
    }
    if (activeOnly !== 'false') {
      filter.isActive = true;
    }

    const docs = await Journey.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(formatJourney));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch journeys', details: err.message });
  }
});

// GET /api/journeys/:id - Get single journey
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const doc = await Journey.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }
    res.json(formatJourney(doc));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch journey', details: err.message });
  }
});

// POST /api/journeys - Publish new journey
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const {
      vehicle,
      originAddress,
      originCoords,
      destAddress,
      destCoords,
      departureTime,
      maxDetourMinutes,
      capacity,
      recurringDays,
      notes,
    } = req.body;

    if (!vehicle || !originAddress || !originCoords || !destAddress || !destCoords || !departureTime) {
      res.status(400).json({ error: 'Missing required journey route fields' });
      return;
    }

    let transporter = await User.findOne({ firebaseUid: uid });
    if (!transporter) {
      transporter = await User.create({
        firebaseUid: uid,
        email: req.user!.email || `${uid}@firebase.com`,
        fullName: req.user!.name || 'Commuter Partner',
        role: 'transporter',
      });
    }

    const doc = await Journey.create({
      transporterId: uid,
      transporterName: transporter.fullName,
      transporterAvatar: transporter.avatarUrl,
      transporterTrustScore: transporter.trustScore,
      vehicle: String(vehicle).trim(),
      originAddress: String(originAddress).trim(),
      originCoords,
      destAddress: String(destAddress).trim(),
      destCoords,
      departureTime: String(departureTime).trim(),
      maxDetourMinutes: Number(maxDetourMinutes || 10),
      capacity: capacity || 'medium',
      recurringDays: Array.isArray(recurringDays) ? recurringDays : [],
      notes: notes ? String(notes).trim() : undefined,
      isActive: true,
    });

    await Activity.create({
      userId: uid,
      type: 'journey_published',
      title: `Published commute: ${originAddress} -> ${destAddress}`,
      description: `Departing ${departureTime} via ${vehicle}`,
      relatedId: doc._id.toString(),
    });

    res.status(201).json(formatJourney(doc));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to publish journey', details: err.message });
  }
});

// DELETE /api/journeys/:id - Delete / deactivate journey
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const doc = await Journey.findById(req.params.id);

    if (!doc) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    if (doc.transporterId !== uid) {
      res.status(403).json({ error: 'Only the commuter can delete their published journey' });
      return;
    }

    await Journey.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Journey removed' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete journey', details: err.message });
  }
});

export default router;
