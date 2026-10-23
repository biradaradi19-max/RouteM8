import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
const router = Router();
// GET /api/auth/me - Get or automatically create user profile from verified Firebase UID
router.get('/me', requireAuth, async (req, res) => {
    try {
        const verifiedUser = req.user;
        let user = await User.findOne({ firebaseUid: verifiedUser.uid });
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
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update profile', details: err.message });
    }
});
// GET /api/auth/check-username/:username
router.get('/check-username/:username', async (req, res) => {
    try {
        const username = req.params.username.toLowerCase().trim();
        const existing = await User.findOne({ username });
        res.json({ available: !existing });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to check username', details: err.message });
    }
});
// GET /api/auth/users/:id - Safe public profile
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findOne({ firebaseUid: req.params.id });
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
export default router;
