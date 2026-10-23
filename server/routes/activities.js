import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Activity } from '../models/Activity.js';
const router = Router();
// GET /api/activities - Retrieve timeline activities for current user
router.get('/', requireAuth, async (req, res) => {
    try {
        const uid = req.user.uid;
        const items = await Activity.find({ userId: uid }).sort({ createdAt: -1 }).limit(30);
        res.json(items.map((item) => ({
            id: item._id.toString(),
            type: item.type,
            title: item.title,
            description: item.description,
            timestamp: item.createdAt.toISOString(),
            relatedId: item.relatedId,
            status: item.status,
        })));
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch activities', details: err.message });
    }
});
export default router;
