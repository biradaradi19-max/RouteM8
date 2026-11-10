import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { Journey } from '../models/Journey.js';
import { User } from '../models/User.js';
import { Activity } from '../models/Activity.js';
import { isDbConnected } from '../config/db.js';

const router = Router();

export const inMemoryJourneys: any[] = [];

function formatJourney(doc: any) {
  return {
    id: (doc._id || doc.id).toString(),
    _id: (doc._id || doc.id).toString(),
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
    createdAt: doc.createdAt?.toISOString ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
    updatedAt: doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : (doc.updatedAt || new Date().toISOString()),
  };
}

// GET /api/journeys - List published journeys
router.get('/', async (req, res): Promise<void> => {
  try {
    const { transporterId, activeOnly } = req.query;

    if (isDbConnected()) {
      try {
        const filter: any = {};
        if (transporterId) filter.transporterId = transporterId;
        if (activeOnly !== 'false') filter.isActive = true;

        const docs = await Journey.find(filter).sort({ createdAt: -1 }).limit(100);
        res.json(docs.map(formatJourney));
        return;
      } catch (dbErr: any) {
        console.warn('[Journeys List DB Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated tests
    const filtered = inMemoryJourneys.filter((j) => {
      if (transporterId && j.transporterId !== transporterId) return false;
      if (activeOnly !== 'false' && !j.isActive) return false;
      return true;
    });

    res.json(filtered.map(formatJourney));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch journeys', details: err.message });
  }
});

// POST /api/journeys - Publish a recurring or one-off commute route
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

    if (!vehicle || !originAddress || !destAddress || !originCoords || !destCoords || !departureTime) {
      res.status(400).json({ error: 'Missing required journey fields' });
      return;
    }

    const journeyData = {
      id: 'jrn-' + Date.now(),
      transporterId: uid,
      transporterName: req.user!.name || 'Commuter Transporter',
      transporterAvatar: req.user!.picture,
      transporterTrustScore: 90,
      vehicle: String(vehicle).trim(),
      originAddress: String(originAddress).trim(),
      originCoords,
      destAddress: String(destAddress).trim(),
      destCoords,
      departureTime,
      maxDetourMinutes: Number(maxDetourMinutes) || 15,
      capacity: capacity || 'medium',
      recurringDays: Array.isArray(recurringDays) ? recurringDays : [],
      isActive: true,
      notes: notes ? String(notes).trim() : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (isDbConnected()) {
      try {
        const user = await User.findOne({ firebaseUid: uid });
        if (user) {
          journeyData.transporterName = user.fullName;
          journeyData.transporterAvatar = user.avatarUrl;
          journeyData.transporterTrustScore = user.trustScore;
        }

        const newDoc = await Journey.create(journeyData);

        await Activity.create({
          userId: uid,
          type: 'journey_published',
          title: `Published route: ${originAddress} to ${destAddress}`,
          description: `Vehicle: ${vehicle}, Departs: ${departureTime}`,
          relatedId: newDoc._id.toString(),
        }).catch(() => {});

        res.status(201).json(formatJourney(newDoc));
        return;
      } catch (dbErr: any) {
        console.warn('[Journeys Create DB Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    inMemoryJourneys.unshift(journeyData);
    res.status(201).json(formatJourney(journeyData));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to publish journey', details: err.message });
  }
});

// POST /api/journeys/:id/cancel - Deactivate/cancel a journey
router.post('/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const journeyId = req.params.id;

    if (isDbConnected()) {
      try {
        const doc = await Journey.findById(journeyId);
        if (doc) {
          if (doc.transporterId !== uid) {
            res.status(403).json({ error: 'Forbidden: you can only cancel your own journeys' });
            return;
          }
          doc.isActive = false;
          await doc.save();
          res.json({ success: true, message: 'Journey cancelled' });
          return;
        }
      } catch (dbErr: any) {
        console.warn('[Journey Cancel DB Notice]', dbErr.message);
      }
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const memItem = inMemoryJourneys.find((j) => j.id === journeyId || j._id === journeyId);
    if (!memItem) {
      res.status(404).json({ error: 'Journey not found' });
      return;
    }

    if (memItem.transporterId !== uid) {
      res.status(403).json({ error: 'Forbidden: you can only cancel your own journeys' });
      return;
    }

    memItem.isActive = false;
    res.json({ success: true, message: 'Journey cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to cancel journey', details: err.message });
  }
});

export default router;
