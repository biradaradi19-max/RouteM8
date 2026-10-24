import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
import { isDbConnected } from '../config/db.js';

const router = Router();

// GET /api/activities - Retrieve timeline activities for current user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    if (isDbConnected()) {
      try {
        const items = await Activity.find({ userId: uid }).sort({ createdAt: -1 }).limit(30);
        res.json(
          items.map((item) => ({
            id: item._id.toString(),
            type: item.type,
            title: item.title,
            description: item.description,
            timestamp: item.createdAt.toISOString(),
            relatedId: item.relatedId,
            status: item.status,
          }))
        );
        return;
      } catch (dbErr: any) {
        console.warn('[Activity DB Fallback]', dbErr.message);
      }
    }

    res.json([]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch activities', details: err.message });
  }
});

export default router;
