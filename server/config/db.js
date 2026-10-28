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
let isConnected = false;
export const ATLAS_URI = 'mongodb+srv://biradaradi27_db_user:adi12345%40.com@routem8.gxbbldm.mongodb.net/routem8?retryWrites=true&w=majority';
export async function connectDB(uri) {
    if (isConnected && mongoose.connection.readyState === 1) {
        return mongoose;
    }
    const mongoUri = uri || process.env.MONGODB_URI || ATLAS_URI;
    // Never buffer queries indefinitely when disconnected; fail fast or use fallback
    mongoose.set('bufferCommands', false);
    try {
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000,
        });
        isConnected = true;
        console.log(`[MongoDB] Connected to database: ${conn.connection.name} (${conn.connection.host})`);
        return conn;
    }
    catch (error) {
        console.warn(`[MongoDB] Could not connect to database: ${error.message}`);
        // Do not crash the process; allow in-memory/mock fallback if needed
        isConnected = false;
        return null;
    }
}
export async function disconnectDB() {
    if (isConnected || mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        isConnected = false;
    }
}
export function isDbConnected() {
    return mongoose.connection.readyState === 1;
}
