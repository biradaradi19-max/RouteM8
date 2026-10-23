import { Server as SocketIOServer } from 'socket.io';
import { verifyFirebaseIdToken } from '../config/firebaseAdmin.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { Location } from '../models/Location.js';
import { partnerPresenceService } from '../services/partnerPresence.js';
export function setupSocketServer(httpServer) {
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        pingInterval: 10000,
        pingTimeout: 5000,
    });
    // Track update rate limits (transporterId -> last timestamp)
    const lastLocationUpdates = new Map();
    // Authentication Middleware for all Socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace('Bearer ', '');
            if (!token) {
                return next(new Error('Authentication error: Missing token'));
            }
            const verifiedUser = await verifyFirebaseIdToken(token);
            socket.data.user = verifiedUser;
            socket.data.userId = verifiedUser.uid;
            next();
        }
        catch (err) {
            console.warn(`[Socket.IO Auth Failed] ${err.message}`);
            next(new Error(`Authentication error: ${err.message}`));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        console.log(`[Socket.IO] Client connected: ${socket.id} (UID: ${userId})`);
        // Auto-join personal partner room for targeted dispatch opportunities
        socket.join(`partner:${userId}`);
        // Partner registers general presence and availability
        socket.on('partner:presence', (data, callback) => {
            try {
                const isAvailable = Boolean(data?.isAvailable);
                partnerPresenceService.setAvailability(userId, isAvailable);
                if (callback)
                    callback({ success: true, isAvailable });
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        // Partner broadcasts dashboard GPS location for dispatch candidate matching
        socket.on('partner:location', (data, callback) => {
            try {
                const { latitude, longitude, heading, speed, isAvailable } = data;
                if (typeof latitude !== 'number' || typeof longitude !== 'number') {
                    if (callback)
                        callback({ error: 'Invalid coordinates' });
                    return;
                }
                if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                    if (callback)
                        callback({ error: 'Coordinates out of bounds' });
                    return;
                }
                const record = partnerPresenceService.updateLocation(userId, {
                    latitude,
                    longitude,
                    heading,
                    speed,
                    isAvailable: isAvailable !== undefined ? isAvailable : true,
                    socketId: socket.id,
                    fullName: socket.data.user?.name,
                });
                if (callback)
                    callback({ success: true, record });
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        // Partner registers active journey route corridor
        socket.on('partner:journey', (data, callback) => {
            try {
                if (data && data.originCoords && data.destCoords) {
                    partnerPresenceService.setActiveJourney(userId, {
                        originCoords: data.originCoords,
                        destCoords: data.destCoords,
                        maxDetourMinutes: Number(data.maxDetourMinutes || 15),
                    });
                }
                if (callback)
                    callback({ success: true });
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        // Join delivery room with strict authorization
        socket.on('delivery:join', async ({ deliveryId }, callback) => {
            try {
                if (!deliveryId) {
                    if (callback)
                        callback({ error: 'deliveryId is required' });
                    return;
                }
                const delivery = await DeliveryRequest.findById(deliveryId);
                if (!delivery) {
                    if (callback)
                        callback({ error: 'Delivery not found' });
                    return;
                }
                // Authorize: Only requester or assigned transporter can join the live tracking & calling room
                if (delivery.requesterId !== userId && delivery.transporterId !== userId) {
                    if (callback)
                        callback({ error: 'Unauthorized: You are not a participant in this delivery' });
                    return;
                }
                const room = `delivery:${deliveryId}`;
                socket.join(room);
                console.log(`[Socket.IO] Socket ${socket.id} (UID: ${userId}) joined ${room}`);
                if (callback) {
                    callback({ success: true, room, status: delivery.status });
                }
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        // Leave delivery room
        socket.on('delivery:leave', ({ deliveryId }) => {
            if (deliveryId) {
                const room = `delivery:${deliveryId}`;
                socket.leave(room);
                console.log(`[Socket.IO] Socket ${socket.id} left ${room}`);
            }
        });
        // Live GPS Location Update from delivery partner
        socket.on('location:update', async (data, callback) => {
            try {
                const { deliveryId, latitude, longitude, heading, speed } = data;
                if (!deliveryId || typeof latitude !== 'number' || typeof longitude !== 'number') {
                    if (callback)
                        callback({ error: 'Invalid coordinate payload' });
                    return;
                }
                // Validate coordinates
                if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                    if (callback)
                        callback({ error: 'Coordinates out of bounds' });
                    return;
                }
                // Rate limit: 1 update per 1 second per transporter
                const now = Date.now();
                const lastUpdate = lastLocationUpdates.get(userId) || 0;
                if (now - lastUpdate < 800) {
                    if (callback)
                        callback({ rateLimited: true });
                    return;
                }
                lastLocationUpdates.set(userId, now);
                // Verify delivery assignment and status
                const delivery = await DeliveryRequest.findById(deliveryId);
                if (!delivery) {
                    if (callback)
                        callback({ error: 'Delivery not found' });
                    return;
                }
                if (delivery.transporterId !== userId) {
                    if (callback)
                        callback({ error: 'Only assigned delivery partner can send live location' });
                    return;
                }
                // Stop sharing if completed or cancelled
                if (delivery.status === 'completed' || delivery.status === 'cancelled') {
                    if (callback)
                        callback({ error: `Location sharing stopped: delivery is ${delivery.status}` });
                    return;
                }
                // Persist latest location to MongoDB
                const locDoc = await Location.create({
                    deliveryId,
                    transporterId: userId,
                    latitude,
                    longitude,
                    heading: typeof heading === 'number' ? heading : undefined,
                    speed: typeof speed === 'number' ? speed : undefined,
                });
                const locationPayload = {
                    deliveryId,
                    transporterId: userId,
                    latitude,
                    longitude,
                    heading: locDoc.heading,
                    speed: locDoc.speed,
                    updatedAt: locDoc.createdAt.toISOString(),
                };
                // Broadcast to delivery room
                io.to(`delivery:${deliveryId}`).emit('location:change', locationPayload);
                if (callback)
                    callback({ success: true, location: locationPayload });
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        // =========================================================================
        // Real Audio Calling Signaling via Socket.IO
        // =========================================================================
        socket.on('call:initiate', async ({ deliveryId }, callback) => {
            try {
                const delivery = await DeliveryRequest.findById(deliveryId);
                if (!delivery) {
                    if (callback)
                        callback({ error: 'Delivery not found' });
                    return;
                }
                if (delivery.requesterId !== userId && delivery.transporterId !== userId) {
                    if (callback)
                        callback({ error: 'Unauthorized to call for this delivery' });
                    return;
                }
                const callerName = delivery.requesterId === userId ? delivery.requesterName : delivery.transporterName;
                const targetUserId = delivery.requesterId === userId ? delivery.transporterId : delivery.requesterId;
                // Broadcast to the delivery room (excluding caller)
                socket.to(`delivery:${deliveryId}`).emit('call:incoming', {
                    deliveryId,
                    callerId: userId,
                    callerName,
                    targetUserId,
                    room: `delivery-${deliveryId}`,
                });
                if (callback)
                    callback({ success: true });
            }
            catch (err) {
                if (callback)
                    callback({ error: err.message });
            }
        });
        socket.on('call:accept', ({ deliveryId }) => {
            socket.to(`delivery:${deliveryId}`).emit('call:accepted', { deliveryId, responderId: userId });
        });
        socket.on('call:reject', ({ deliveryId, reason }) => {
            socket.to(`delivery:${deliveryId}`).emit('call:rejected', { deliveryId, responderId: userId, reason });
        });
        socket.on('call:busy', ({ deliveryId }) => {
            socket.to(`delivery:${deliveryId}`).emit('call:busy', { deliveryId, responderId: userId });
        });
        socket.on('call:hangup', ({ deliveryId }) => {
            socket.to(`delivery:${deliveryId}`).emit('call:ended', { deliveryId, endedBy: userId });
        });
        socket.on('disconnect', () => {
            console.log(`[Socket.IO] Client disconnected: ${socket.id} (UID: ${userId})`);
        });
    });
    return io;
}
