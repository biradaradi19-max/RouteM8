import { Router, type Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { isDbConnected } from '../config/db.js';
import { findDelivery, toMongoIdFilter } from './deliveries.js';

const router = Router();

// POST /api/livekit/token - Generate LiveKit AccessToken for verified delivery participants
router.post('/token', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const uid = req.user!.uid;
    const { deliveryId, callType = 'audio' } = req.body || {};

    if (!deliveryId) {
      res.status(400).json({ error: 'deliveryId is required' });
      return;
    }

    let delivery: any = null;
    if (isDbConnected()) {
      try {
        const queryId = toMongoIdFilter(deliveryId);
        delivery = await DeliveryRequest.findOne({ _id: queryId });
      } catch {
        delivery = null;
      }
    }

    if (!delivery) {
      delivery = await findDelivery(deliveryId);
    }

    if (!delivery) {
      res.status(404).json({ error: 'Delivery request not found' });
      return;
    }

    const delId = (delivery._id || delivery.id).toString();

    // Participant authorization check: only requester or assigned transporter
    const isRequester = delivery.requesterId === uid;
    const isTransporter = delivery.transporterId === uid;

    if (!isRequester && !isTransporter) {
      res.status(403).json({ error: 'Forbidden: You are not an authorized participant in this delivery' });
      return;
    }

    // Audio/video calls are only permitted during active engagement (matched or in_transit)
    if (delivery.status !== 'matched' && delivery.status !== 'in_transit') {
      res.status(400).json({
        error: `Calling is not available for deliveries in '${delivery.status}' status. Calls require 'matched' or 'in_transit' status.`,
      });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || 'wss://routem8-5l64i76u.livekit.cloud';

    const participantName = isRequester ? delivery.requesterName : delivery.transporterName || 'Delivery Partner';
    const participantRole: 'Customer' | 'Transporter' = isRequester ? 'Customer' : 'Transporter';
    const roomName = `delivery-${delId}`;

    // If LiveKit credentials are not configured on server (e.g. testing or initial local setup)
    if (!apiKey || !apiSecret) {
      if (process.env.NODE_ENV === 'test' || process.env.ALLOW_MOCK_LIVEKIT === 'true') {
        res.json({
          token: `mock-livekit-token-${uid}-${Date.now()}`,
          serverUrl,
          room: roomName,
          participantIdentity: uid,
          participantName,
          role: participantRole,
          callType,
        });
        return;
      }

      res.status(503).json({
        error: 'LiveKit server credentials (LIVEKIT_API_KEY / LIVEKIT_API_SECRET) are not configured on the server.',
        missingConfig: true,
      });
      return;
    }

    // Mint short-lived access token with audio, video, and data channel grants
    const at = new AccessToken(apiKey, apiSecret, {
      identity: uid,
      name: participantName,
      ttl: '1h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await at.toJwt();

    res.json({
      token: jwt,
      serverUrl,
      room: roomName,
      participantIdentity: uid,
      participantName,
      role: participantRole,
      callType,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mint LiveKit call token', details: err.message });
  }
});

export default router;
