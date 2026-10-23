import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { isDbConnected } from '../config/db.js';
import { firestorePersistence } from '../services/firestorePersistence.js';
const router = Router();
export const inMemoryUsers = new Map();
// GET /api/auth/me - Get or automatically create user profile from verified Firebase UID
router.get('/me', requireAuth, async (req, res) => {
    try {
        const verifiedUser = req.user;
        let user = null;
        if (isDbConnected()) {
            try {
                user = await User.findOne({ firebaseUid: verifiedUser.uid });
                if (!user) {
                    // Auto-provision initial profile with Firebase identity
                    user = await User.create({
                        firebaseUid: verifiedUser.uid,
                        email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
                        fullName: verifiedUser.name || 'RouteM8 User',
                        role: 'both',
                        verificationStatus: verifiedUser.emailVerified ? 'email_verified' : 'unverified',
                        trustScore: 85,
                        rating: 5.0,
                        partnerAvailable: true,
                    });
                }
            }
            catch (dbErr) {
                console.warn('[Auth Me DB Fallback]', dbErr.message);
            }
        }
        if (!user) {
            user = inMemoryUsers.get(verifiedUser.uid);
            if (!user) {
                // Check remote shared Firestore
                user = await firestorePersistence.getUser(verifiedUser.uid);
            }
            if (!user) {
                user = {
                    _id: `mem-${verifiedUser.uid}`,
                    firebaseUid: verifiedUser.uid,
                    email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
                    username: undefined,
                    fullName: verifiedUser.name || 'RouteM8 User',
                    role: 'both',
                    verificationStatus: verifiedUser.emailVerified ? 'email_verified' : 'unverified',
                    accountStatus: 'active',
                    organization: undefined,
                    commuteVehicle: undefined,
                    trustScore: 85,
                    completedDeliveries: 0,
                    completedCommutes: 0,
                    rating: 5.0,
                    avatarUrl: undefined,
                    bio: undefined,
                    partnerAvailable: true,
                };
                await firestorePersistence.saveUser(user);
            }
            inMemoryUsers.set(verifiedUser.uid, user);
        }
        res.json({
            user: {
                id: user.firebaseUid,
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                verificationStatus: user.verificationStatus,
                accountStatus: user.accountStatus,
                organization: user.organization,
                commuteVehicle: user.commuteVehicle,
                trustScore: user.trustScore,
                completedDeliveries: user.completedDeliveries,
                completedCommutes: user.completedCommutes,
                rating: user.rating,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
                partnerAvailable: user.partnerAvailable,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve user profile', details: err.message });
    }
});
// PUT /api/auth/profile - Update current user profile
router.put('/profile', requireAuth, async (req, res) => {
    try {
        const verifiedUser = req.user;
        const { fullName, username, role, organization, commuteVehicle, bio, avatarUrl, partnerAvailable } = req.body;
        if (isDbConnected()) {
            try {
                let user = await User.findOne({ firebaseUid: verifiedUser.uid });
                if (!user) {
                    user = new User({
                        firebaseUid: verifiedUser.uid,
                        email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
                    });
                }
                if (username && username !== user.username) {
                    const sanitizedUsername = String(username).toLowerCase().trim();
                    const existing = await User.findOne({ username: sanitizedUsername, firebaseUid: { $ne: verifiedUser.uid } });
                    if (existing) {
                        res.status(409).json({ error: 'Username is already taken' });
                        return;
                    }
                    user.username = sanitizedUsername;
                }
                if (fullName !== undefined)
                    user.fullName = String(fullName).trim();
                if (role && ['both', 'requester', 'transporter'].includes(role))
                    user.role = role;
                if (organization !== undefined)
                    user.organization = String(organization).trim();
                if (commuteVehicle !== undefined)
                    user.commuteVehicle = String(commuteVehicle).trim();
                if (bio !== undefined)
                    user.bio = String(bio).trim();
                if (avatarUrl !== undefined)
                    user.avatarUrl = avatarUrl;
                if (partnerAvailable !== undefined)
                    user.partnerAvailable = Boolean(partnerAvailable);
                await user.save();
                res.json({
                    success: true,
                    user: {
                        id: user.firebaseUid,
                        _id: user._id,
                        email: user.email,
                        username: user.username,
                        fullName: user.fullName,
                        role: user.role,
                        verificationStatus: user.verificationStatus,
                        accountStatus: user.accountStatus,
                        organization: user.organization,
                        commuteVehicle: user.commuteVehicle,
                        trustScore: user.trustScore,
                        completedDeliveries: user.completedDeliveries,
                        completedCommutes: user.completedCommutes,
                        rating: user.rating,
                        avatarUrl: user.avatarUrl,
                        bio: user.bio,
                        partnerAvailable: user.partnerAvailable,
                    },
                });
                return;
            }
            catch (dbErr) {
                console.warn('[Auth Profile DB Fallback]', dbErr.message);
            }
        }
        // In-memory fallback
        let user = inMemoryUsers.get(verifiedUser.uid) || {
            _id: `mem-${verifiedUser.uid}`,
            firebaseUid: verifiedUser.uid,
            email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
            fullName: verifiedUser.name || 'RouteM8 User',
            role: 'both',
            verificationStatus: verifiedUser.emailVerified ? 'email_verified' : 'unverified',
            accountStatus: 'active',
            trustScore: 85,
            completedDeliveries: 0,
            completedCommutes: 0,
            rating: 5.0,
            partnerAvailable: true,
        };
        if (username && username !== user.username) {
            const sanitizedUsername = String(username).toLowerCase().trim();
            for (const [otherUid, otherUser] of inMemoryUsers.entries()) {
                if (otherUid !== verifiedUser.uid && otherUser.username === sanitizedUsername) {
                    res.status(409).json({ error: 'Username is already taken' });
                    return;
                }
            }
            user.username = sanitizedUsername;
        }
        if (fullName !== undefined)
            user.fullName = String(fullName).trim();
        if (role && ['both', 'requester', 'transporter'].includes(role))
            user.role = role;
        if (organization !== undefined)
            user.organization = String(organization).trim();
        if (commuteVehicle !== undefined)
            user.commuteVehicle = String(commuteVehicle).trim();
        if (bio !== undefined)
            user.bio = String(bio).trim();
        if (avatarUrl !== undefined)
            user.avatarUrl = avatarUrl;
        if (partnerAvailable !== undefined)
            user.partnerAvailable = Boolean(partnerAvailable);
        inMemoryUsers.set(verifiedUser.uid, user);
        await firestorePersistence.saveUser(user);
        res.json({
            success: true,
            user: {
                id: user.firebaseUid,
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                verificationStatus: user.verificationStatus,
                accountStatus: user.accountStatus,
                organization: user.organization,
                commuteVehicle: user.commuteVehicle,
                trustScore: user.trustScore,
                completedDeliveries: user.completedDeliveries,
                completedCommutes: user.completedCommutes,
                rating: user.rating,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
                partnerAvailable: user.partnerAvailable,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update profile', details: err.message });
    }
});
// GET /api/auth/check-username/:username
router.get('/check-username/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase().trim();
        if (isDbConnected()) {
            try {
                const existing = await User.findOne({ username });
                res.json({ available: !existing });
                return;
            }
            catch (dbErr) {
                console.warn('[Check Username DB Fallback]', dbErr.message);
            }
        }
        const existsInMem = Array.from(inMemoryUsers.values()).some((u) => u.username === username);
        res.json({ available: !existsInMem });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to check username', details: err.message });
    }
});
// GET /api/auth/users/:id - Safe public profile
router.get('/users/:id', async (req, res) => {
    try {
        let user = null;
        if (isDbConnected()) {
            try {
                user = await User.findOne({ firebaseUid: req.params.id });
            }
            catch (dbErr) {
                console.warn('[User Fetch DB Fallback]', dbErr.message);
            }
        }
        if (!user) {
            user = inMemoryUsers.get(req.params.id);
        }
        if (!user) {
            user = await firestorePersistence.getUser(req.params.id);
            if (user) {
                inMemoryUsers.set(req.params.id, user);
            }
        }
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user.firebaseUid,
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            trustScore: user.trustScore,
            rating: user.rating,
            avatarUrl: user.avatarUrl,
            organization: user.organization,
            commuteVehicle: user.commuteVehicle,
            completedDeliveries: user.completedDeliveries,
            completedCommutes: user.completedCommutes,
            partnerAvailable: user.partnerAvailable,
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch user', details: err.message });
    }
});
// POST /api/auth/partner-verification/selfie - Privacy-conscious partner identity capture
router.post('/partner-verification/selfie', requireAuth, async (req, res) => {
    try {
        const verifiedUser = req.user;
        const { consentGiven, selfieBase64 } = req.body || {};
        if (!consentGiven) {
            res.status(400).json({ error: 'Explicit consent is required before capturing and submitting verification data.' });
            return;
        }
        if (!selfieBase64 || typeof selfieBase64 !== 'string' || !selfieBase64.startsWith('data:image/')) {
            res.status(400).json({ error: 'A valid image snapshot is required.' });
            return;
        }
        // Limit base64 image payload size (5MB max)
        if (selfieBase64.length > 5 * 1024 * 1024 * 1.37) {
            res.status(400).json({ error: 'Selfie image payload exceeds the 5MB size limit.' });
            return;
        }
        // Explicit state transition: unverified -> pending_review
        // Do NOT automatically mark verified; real human or provider evaluation is required.
        const newStatus = 'pending_review';
        if (isDbConnected()) {
            try {
                let userDoc = await User.findOne({ firebaseUid: verifiedUser.uid });
                if (!userDoc) {
                    userDoc = new User({
                        firebaseUid: verifiedUser.uid,
                        email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
                        fullName: verifiedUser.name || 'Delivery Partner',
                    });
                }
                userDoc.verificationStatus = newStatus;
                await userDoc.save();
                res.json({
                    success: true,
                    status: newStatus,
                    message: 'Selfie received with explicit consent. Your identity verification is under pending review.',
                    verificationStatus: newStatus,
                });
                return;
            }
            catch (dbErr) {
                console.warn('[Partner Verification DB Fallback]', dbErr.message);
            }
        }
        let user = inMemoryUsers.get(verifiedUser.uid) || {
            _id: `mem-${verifiedUser.uid}`,
            firebaseUid: verifiedUser.uid,
            email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
            fullName: verifiedUser.name || 'Delivery Partner',
            role: 'transporter',
            accountStatus: 'active',
            trustScore: 85,
            completedDeliveries: 0,
            completedCommutes: 0,
            rating: 5.0,
            partnerAvailable: true,
        };
        user.verificationStatus = newStatus;
        inMemoryUsers.set(verifiedUser.uid, user);
        await firestorePersistence.saveUser(user);
        res.json({
            success: true,
            status: newStatus,
            message: 'Selfie received with explicit consent. Your identity verification is under pending review.',
            verificationStatus: newStatus,
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to process identity verification', details: err.message });
    }
});
export default router;
