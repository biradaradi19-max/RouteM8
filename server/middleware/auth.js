import { verifyFirebaseIdToken } from '../config/firebaseAdmin.js';
export async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing or malformed Authorization header. Expected Bearer <token>',
        });
        return;
    }
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Empty bearer token provided',
        });
        return;
    }
    try {
        const verifiedUser = await verifyFirebaseIdToken(token);
        req.user = verifiedUser;
        next();
    }
    catch (error) {
        res.status(401).json({
            error: 'Unauthorized',
            message: error.message || 'Token verification failed',
        });
    }
}
export async function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split('Bearer ')[1]?.trim();
        if (token) {
            try {
                req.user = await verifyFirebaseIdToken(token);
            }
            catch {
                // Silently continue unauthenticated
            }
        }
    }
    next();
}
