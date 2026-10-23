import mongoose from 'mongoose';
import dns from 'node:dns';
// Resolve MongoDB Atlas SRV records reliably on Windows/local DNS
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}
catch {
    // Ignore if custom DNS cannot be set
}
let isConnected = false;
export async function connectDB(uri) {
    if (isConnected && mongoose.connection.readyState === 1) {
        return mongoose;
    }
    const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/routem8';
    // Never buffer queries indefinitely when disconnected; fail fast or use fallback
    mongoose.set('bufferCommands', false);
    try {
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 3000,
            connectTimeoutMS: 5000,
        });
        isConnected = true;
        console.log(`[MongoDB] Connected to database: ${conn.connection.name} (${conn.connection.host})`);
        return conn;
    }
    catch (error) {
        console.warn(`[MongoDB] Could not connect to ${mongoUri}: ${error.message}`);
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
