import mongoose from 'mongoose';
import dns from 'node:dns';
// Resolve MongoDB Atlas SRV records reliably on Windows/local DNS.
// Avoid overriding DNS on cloud/serverless environments (Vercel, AWS Lambda, Linux) where container DNS is required.
if (process.platform === 'win32' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
    }
    catch {
        // Ignore if custom DNS cannot be set
    }
}
const cache = globalThis.__mongooseCache || {
    conn: null,
    promise: null,
    lastError: null,
    lastAttempt: 0,
};
if (!globalThis.__mongooseCache) {
    globalThis.__mongooseCache = cache;
}
export const ATLAS_URI = 'mongodb+srv://biradaradi27_db_user:adi12345%40.com@routem8.gxbbldm.mongodb.net/routem8?retryWrites=true&w=majority';
/**
 * Sanitize and auto-encode password in MongoDB URI to prevent unescaped character issues
 */
export function sanitizeMongoUri(rawUri) {
    if (!rawUri || !rawUri.trim())
        return null;
    const trimmed = rawUri.trim();
    // If URI has placeholder text, treat as unconfigured
    if (trimmed.includes('YOUR_ACTUAL_PASSWORD') ||
        trimmed.includes('<password>') ||
        trimmed.includes('<username>')) {
        return null;
    }
    // Check if URI matches format: mongodb(+srv)://user:pass@host/db?query
    const match = trimmed.match(/^mongodb(\+srv)?:\/\/([^:]+):(.+)@([^@/]+)(\/[^?]*)?(\?.*)?$/);
    if (!match)
        return trimmed;
    const [, srv, user, pass, host, pathPart, queryPart] = match;
    let cleanPass = pass;
    try {
        cleanPass = encodeURIComponent(decodeURIComponent(pass));
    }
    catch {
        cleanPass = encodeURIComponent(pass);
    }
    return `mongodb${srv || ''}://${user}:${cleanPass}@${host}${pathPart || '/routem8'}${queryPart || '?retryWrites=true&w=majority'}`;
}
export function getLastDbError() {
    return cache.lastError;
}
export function isDbConnected() {
    return mongoose.connection.readyState === 1;
}
export async function connectDB(uri) {
    if (mongoose.connection.readyState === 1) {
        cache.conn = mongoose;
        cache.lastError = null;
        return mongoose;
    }
    // In unit test runner without explicit test DB, skip remote Atlas connection
    if (process.env.NODE_ENV === 'test' && !uri && !process.env.TEST_MONGODB) {
        return null;
    }
    if (cache.promise) {
        return cache.promise;
    }
    // Throttle consecutive failed connection attempts to avoid blocking requests
    if (cache.lastAttempt && Date.now() - cache.lastAttempt < 5000) {
        return null;
    }
    const raw = uri || process.env.MONGODB_URI || ATLAS_URI;
    const mongoUri = sanitizeMongoUri(raw) || ATLAS_URI;
    mongoose.set('bufferCommands', false);
    cache.lastAttempt = Date.now();
    cache.promise = (async () => {
        try {
            const conn = await mongoose.connect(mongoUri, {
                serverSelectionTimeoutMS: 6000,
                connectTimeoutMS: 6000,
                maxPoolSize: 10,
                minPoolSize: 1,
                socketTimeoutMS: 45000,
            });
            cache.conn = conn;
            cache.lastError = null;
            console.log(`[MongoDB] Connected to database: ${conn.connection.name} (${conn.connection.host})`);
            return conn;
        }
        catch (error) {
            const msg = error?.message || String(error);
            cache.lastError = msg;
            cache.conn = null;
            console.warn(`[MongoDB] Could not connect to database: ${msg}`);
            return null;
        }
        finally {
            cache.promise = null;
        }
    })();
    return cache.promise;
}
export async function disconnectDB() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    cache.conn = null;
    cache.promise = null;
}
