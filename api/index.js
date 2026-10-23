// server/app.ts
import express from "express";
import cors from "cors";
import path2 from "node:path";

// server/routes/auth.ts
import { Router } from "express";

// server/config/firebaseAdmin.ts
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFileSync, existsSync } from "node:fs";
var isFirebaseAdminInitialized = false;
function initializeFirebaseAdmin() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "routem8-36895";
  if (serviceAccountKey) {
    try {
      let parsedCreds;
      if (serviceAccountKey.trim().startsWith("{")) {
        parsedCreds = JSON.parse(serviceAccountKey);
      } else if (existsSync(serviceAccountKey)) {
        parsedCreds = JSON.parse(readFileSync(serviceAccountKey, "utf8"));
      }
      if (parsedCreds) {
        const app2 = initializeApp({
          credential: cert(parsedCreds),
          projectId: parsedCreds.project_id || projectId
        });
        isFirebaseAdminInitialized = true;
        console.log(`[Firebase Admin] Initialized with Service Account: ${parsedCreds.project_id || projectId}`);
        return app2;
      }
    } catch (err) {
      console.warn(`[Firebase Admin] Failed to parse service account key: ${err.message}. Falling back to default project init.`);
    }
  }
  const app = initializeApp({
    projectId
  });
  isFirebaseAdminInitialized = true;
  console.log(`[Firebase Admin] Initialized with Project ID: ${projectId}`);
  return app;
}
async function verifyFirebaseIdToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Missing or invalid token");
  }
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || process.env.ALLOW_TEST_TOKENS === "true") {
    if (token.startsWith("mock-token-")) {
      const uid = token.replace("mock-token-", "");
      return {
        uid,
        email: `${uid}@test.example.com`,
        name: `Test User ${uid}`,
        emailVerified: true
      };
    }
  }
  if (!isFirebaseAdminInitialized && getApps().length === 0) {
    initializeFirebaseAdmin();
  }
  try {
    const auth = getAuth();
    const decoded = await auth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      emailVerified: decoded.email_verified
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development" && token.includes(".")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
          if (payload.user_id || payload.sub) {
            return {
              uid: payload.user_id || payload.sub,
              email: payload.email,
              name: payload.name,
              emailVerified: payload.email_verified
            };
          }
        }
      } catch {
      }
    }
    throw new Error(`Invalid authentication token: ${err.message}`);
  }
}

// server/middleware/auth.ts
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or malformed Authorization header. Expected Bearer <token>"
    });
    return;
  }
  const token = authHeader.split("Bearer ")[1]?.trim();
  if (!token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Empty bearer token provided"
    });
    return;
  }
  try {
    const verifiedUser = await verifyFirebaseIdToken(token);
    req.user = verifiedUser;
    next();
  } catch (error) {
    res.status(401).json({
      error: "Unauthorized",
      message: error.message || "Token verification failed"
    });
  }
}
async function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split("Bearer ")[1]?.trim();
    if (token) {
      try {
        req.user = await verifyFirebaseIdToken(token);
      } catch {
      }
    }
  }
  next();
}

// server/models/User.ts
import mongoose, { Schema } from "mongoose";
var UserSchema = new Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-z0-9_]+$/
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ["both", "requester", "transporter"],
      default: "both"
    },
    verificationStatus: {
      type: String,
      default: "email_verified"
    },
    accountStatus: {
      type: String,
      default: "active"
    },
    organization: {
      type: String,
      trim: true
    },
    commuteVehicle: {
      type: String,
      trim: true
    },
    trustScore: {
      type: Number,
      default: 85,
      min: 0,
      max: 100
    },
    completedDeliveries: {
      type: Number,
      default: 0
    },
    completedCommutes: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5
    },
    avatarUrl: {
      type: String
    },
    bio: {
      type: String,
      maxlength: 500
    },
    partnerAvailable: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);
var User = mongoose.models.User || mongoose.model("User", UserSchema);

// server/routes/auth.ts
var router = Router();
router.get("/me", requireAuth, async (req, res) => {
  try {
    const verifiedUser = req.user;
    let user = await User.findOne({ firebaseUid: verifiedUser.uid });
    if (!user) {
      user = await User.create({
        firebaseUid: verifiedUser.uid,
        email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
        fullName: verifiedUser.name || "RouteM8 User",
        role: "both",
        verificationStatus: verifiedUser.emailVerified ? "email_verified" : "unverified",
        trustScore: 85,
        rating: 5,
        partnerAvailable: true
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
        partnerAvailable: user.partnerAvailable
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve user profile", details: err.message });
  }
});
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const verifiedUser = req.user;
    const { fullName, username, role, organization, commuteVehicle, bio, avatarUrl, partnerAvailable } = req.body;
    let user = await User.findOne({ firebaseUid: verifiedUser.uid });
    if (!user) {
      user = new User({
        firebaseUid: verifiedUser.uid,
        email: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`
      });
    }
    if (username && username !== user.username) {
      const sanitizedUsername = String(username).toLowerCase().trim();
      const existing = await User.findOne({ username: sanitizedUsername, firebaseUid: { $ne: verifiedUser.uid } });
      if (existing) {
        res.status(409).json({ error: "Username is already taken" });
        return;
      }
      user.username = sanitizedUsername;
    }
    if (fullName !== void 0) user.fullName = String(fullName).trim();
    if (role && ["both", "requester", "transporter"].includes(role)) user.role = role;
    if (organization !== void 0) user.organization = String(organization).trim();
    if (commuteVehicle !== void 0) user.commuteVehicle = String(commuteVehicle).trim();
    if (bio !== void 0) user.bio = String(bio).trim();
    if (avatarUrl !== void 0) user.avatarUrl = avatarUrl;
    if (partnerAvailable !== void 0) user.partnerAvailable = Boolean(partnerAvailable);
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
        partnerAvailable: user.partnerAvailable
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile", details: err.message });
  }
});
router.get("/check-username/:username", async (req, res) => {
  try {
    const username = req.params.username.toLowerCase().trim();
    const existing = await User.findOne({ username });
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ error: "Failed to check username", details: err.message });
  }
});
router.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.params.id });
    if (!user) {
      res.status(404).json({ error: "User not found" });
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
      partnerAvailable: user.partnerAvailable
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user", details: err.message });
  }
});
var auth_default = router;

// server/routes/deliveries.ts
import { Router as Router2 } from "express";
import multer from "multer";
import { existsSync as existsSync2, mkdirSync } from "node:fs";
import path from "node:path";

// server/models/DeliveryRequest.ts
import mongoose2, { Schema as Schema2 } from "mongoose";
var DeliveryRequestSchema = new Schema2(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      enum: ["groceries", "campus-supplies", "essentials", "pharmacy", "electronics", "other"],
      default: "other"
    },
    pickupAddress: {
      type: String,
      required: true
    },
    pickupCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: "Invalid pickup coordinates [lat, lng]"
      }
    },
    pickupPlaceId: {
      type: String,
      trim: true
    },
    dropoffAddress: {
      type: String,
      required: true
    },
    dropoffCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: "Invalid dropoff coordinates [lat, lng]"
      }
    },
    dropoffPlaceId: {
      type: String,
      trim: true
    },
    itemSize: {
      type: String,
      enum: ["small", "medium", "large"],
      default: "medium"
    },
    weightEstimateKg: {
      type: Number,
      min: 0
    },
    compensation: {
      type: Number,
      required: true,
      min: 0
    },
    urgency: {
      type: String,
      enum: ["standard", "flexible", "urgent"],
      default: "standard"
    },
    neededBy: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ["open", "matched", "in_transit", "completed", "cancelled"],
      default: "open",
      index: true
    },
    requesterId: {
      type: String,
      required: true,
      index: true
    },
    requesterName: {
      type: String,
      required: true
    },
    requesterTrustScore: {
      type: Number,
      default: 90
    },
    requesterAvatar: {
      type: String
    },
    transporterId: {
      type: String,
      index: true
    },
    transporterName: {
      type: String
    },
    transporterAvatar: {
      type: String
    },
    transporterVehicle: {
      type: String
    },
    handoverPin: {
      type: String,
      required: true,
      length: 4
    },
    pinAttempts: {
      type: Number,
      default: 0
    },
    pinLockedUntil: {
      type: Date
    },
    proofPhotoUrl: {
      type: String
    },
    rejectedBy: {
      type: [String],
      default: [],
      index: true
    },
    distanceKm: {
      type: Number
    },
    estimatedDurationMin: {
      type: Number
    },
    estimatedDetourMinutes: {
      type: Number,
      default: 5
    }
  },
  {
    timestamps: true
  }
);
var DeliveryRequest = mongoose2.models.DeliveryRequest || mongoose2.model("DeliveryRequest", DeliveryRequestSchema);

// server/models/Activity.ts
import mongoose3, { Schema as Schema3 } from "mongoose";
var ActivitySchema = new Schema3(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ["request_created", "journey_published", "match_found", "in_transit", "delivered"],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    relatedId: {
      type: String,
      index: true
    },
    status: {
      type: String,
      enum: ["open", "matched", "in_transit", "completed", "cancelled"]
    }
  },
  {
    timestamps: true
  }
);
ActivitySchema.index({ userId: 1, createdAt: -1 });
var Activity = mongoose3.models.Activity || mongoose3.model("Activity", ActivitySchema);

// server/models/Location.ts
import mongoose4, { Schema as Schema4 } from "mongoose";
var LocationSchema = new Schema4(
  {
    deliveryId: {
      type: String,
      required: true,
      index: true
    },
    transporterId: {
      type: String,
      required: true,
      index: true
    },
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180
    },
    heading: {
      type: Number,
      min: 0,
      max: 360
    },
    speed: {
      type: Number,
      min: 0
    }
  },
  {
    timestamps: true
  }
);
LocationSchema.index({ deliveryId: 1, updatedAt: -1 });
var Location = mongoose4.models.Location || mongoose4.model("Location", LocationSchema);

// server/config/db.ts
import mongoose5 from "mongoose";
import dns from "node:dns";
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
}
var isConnected = false;
async function connectDB(uri) {
  if (isConnected && mongoose5.connection.readyState === 1) {
    return mongoose5;
  }
  const mongoUri = uri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/routem8";
  mongoose5.set("bufferCommands", false);
  try {
    const conn = await mongoose5.connect(mongoUri, {
      serverSelectionTimeoutMS: 3e3,
      connectTimeoutMS: 5e3
    });
    isConnected = true;
    console.log(`[MongoDB] Connected to database: ${conn.connection.name} (${conn.connection.host})`);
    return conn;
  } catch (error) {
    console.warn(`[MongoDB] Could not connect to ${mongoUri}: ${error.message}`);
    isConnected = false;
    return null;
  }
}
function isDbConnected() {
  return mongoose5.connection.readyState === 1;
}

// server/services/partnerPresence.ts
var PartnerPresenceService = class {
  partners = /* @__PURE__ */ new Map();
  /**
   * Register or update partner live presence and GPS coordinate
   */
  updateLocation(userId, input) {
    const existing = this.partners.get(userId);
    const updated = {
      userId,
      fullName: input.fullName || existing?.fullName || "Delivery Partner",
      role: input.role || existing?.role || "transporter",
      coords: [input.latitude, input.longitude],
      heading: typeof input.heading === "number" ? input.heading : existing?.heading,
      speed: typeof input.speed === "number" ? input.speed : existing?.speed,
      isAvailable: input.isAvailable !== void 0 ? input.isAvailable : existing?.isAvailable ?? true,
      updatedAt: /* @__PURE__ */ new Date(),
      socketId: input.socketId || existing?.socketId,
      activeJourney: existing?.activeJourney
    };
    this.partners.set(userId, updated);
    return updated;
  }
  /**
   * Update availability status (online/ready vs busy/offline)
   */
  setAvailability(userId, isAvailable) {
    const existing = this.partners.get(userId);
    if (existing) {
      existing.isAvailable = isAvailable;
      existing.updatedAt = /* @__PURE__ */ new Date();
    }
  }
  /**
   * Bind an active commuter journey for corridor route matching
   */
  setActiveJourney(userId, journey) {
    const existing = this.partners.get(userId);
    if (existing) {
      existing.activeJourney = journey;
    }
  }
  /**
   * Retrieve active, available partners whose GPS is within freshness window (default: 10 minutes = 600,000 ms)
   */
  getActivePartners(maxAgeMs = 10 * 60 * 1e3) {
    const now = Date.now();
    const result = [];
    for (const record of this.partners.values()) {
      if (!record.isAvailable) continue;
      const ageMs = now - record.updatedAt.getTime();
      if (ageMs <= maxAgeMs) {
        result.push(record);
      }
    }
    return result;
  }
  getPartner(userId) {
    return this.partners.get(userId);
  }
  removePartner(userId) {
    this.partners.delete(userId);
  }
  clearAll() {
    this.partners.clear();
  }
};
var partnerPresenceService = new PartnerPresenceService();

// server/services/matchingEngine.ts
function calculateHaversineDistance(coord1, coord2) {
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}
function calculateVectorAlignment(v1, v2) {
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
  const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
  if (mag1 < 1e-7 || mag2 < 1e-7) return 0;
  const cosTheta = dot / (mag1 * mag2);
  return Math.max(-1, Math.min(1, cosTheta));
}
function evaluateDeliveryCandidates(delivery, partners, options) {
  const now = Date.now();
  const matches = [];
  const deliveryVector = [
    delivery.dropoffCoords[0] - delivery.pickupCoords[0],
    delivery.dropoffCoords[1] - delivery.pickupCoords[1]
  ];
  for (const partner of partners) {
    if (partner.userId === delivery.requesterId) continue;
    if (delivery.rejectedBy && delivery.rejectedBy.includes(partner.userId)) continue;
    if (options.excludedPartnerIds && options.excludedPartnerIds.includes(partner.userId)) continue;
    if (!partner.isAvailable) continue;
    const distToPickupKm = calculateHaversineDistance(partner.coords, delivery.pickupCoords);
    const estimatedEtaMinutes = Math.max(1, Math.round(distToPickupKm / 30 * 60));
    const ageMs = now - partner.updatedAt.getTime();
    const freshnessRatio = Math.max(0, 1 - ageMs / (10 * 60 * 1e3));
    let isCorridorMatch = false;
    let alignment;
    let detourMinutes;
    if (options.enableRouteCorridorMatching && partner.activeJourney) {
      const journey = partner.activeJourney;
      const journeyVector = [
        journey.destCoords[0] - journey.originCoords[0],
        journey.destCoords[1] - journey.originCoords[1]
      ];
      alignment = calculateVectorAlignment(deliveryVector, journeyVector);
      if (alignment > 0.5) {
        const dDirect = calculateHaversineDistance(journey.originCoords, journey.destCoords);
        const dDetour = calculateHaversineDistance(journey.originCoords, delivery.pickupCoords) + calculateHaversineDistance(delivery.pickupCoords, delivery.dropoffCoords) + calculateHaversineDistance(delivery.dropoffCoords, journey.destCoords);
        const detourKm = Math.max(0, dDetour - dDirect);
        detourMinutes = Math.round(detourKm / 35 * 60);
        const maxDetour = options.maxDetourMinutes || journey.maxDetourMinutes || 15;
        if (detourMinutes <= maxDetour) {
          isCorridorMatch = true;
        }
      }
    }
    const isNearbyMatch = distToPickupKm <= options.maxRadiusKm;
    if (!isNearbyMatch && !isCorridorMatch) {
      continue;
    }
    let score = 50;
    let matchType = "nearby";
    if (isCorridorMatch) {
      matchType = "corridor";
      const detourScore = detourMinutes !== void 0 ? Math.max(0, 1 - detourMinutes / 20) * 20 : 10;
      score = Math.round(55 + (alignment || 0) * 25 + detourScore);
    } else {
      const distScore = Math.max(0, 1 - distToPickupKm / options.maxRadiusKm) * 35;
      const freshnessScore = freshnessRatio * 15;
      score = Math.round(50 + distScore + freshnessScore);
    }
    score = Math.max(10, Math.min(99, score));
    matches.push({
      partner,
      matchType,
      distanceToPickupKm: distToPickupKm,
      estimatedEtaMinutes,
      directionalAlignment: alignment,
      detourMinutes,
      score
    });
  }
  return matches.sort((a, b) => b.score - a.score);
}

// server/services/dispatchService.ts
var DispatchService = class {
  jobs = /* @__PURE__ */ new Map();
  /**
   * Start progressive multi-stage dispatch worker for a delivery request
   */
  startDispatch(delivery, io, stageIntervalMs = 12e3) {
    const requestId = delivery._id?.toString() || delivery.id;
    if (!requestId) return;
    this.stopDispatch(requestId, "cancelled");
    const job = {
      requestId,
      delivery,
      currentStage: 1,
      state: "searching_partner",
      notifiedPartnerIds: /* @__PURE__ */ new Set(),
      timeouts: []
    };
    this.jobs.set(requestId, job);
    this.executeStage(job, 1, 3, false, io);
    const t2 = setTimeout(() => {
      if (job.state === "partner_assigned" || job.state === "cancelled") return;
      job.currentStage = 2;
      job.state = "expanding_search";
      this.executeStage(job, 2, 6, true, io);
    }, stageIntervalMs);
    job.timeouts.push(t2);
    const t3 = setTimeout(() => {
      if (job.state === "partner_assigned" || job.state === "cancelled") return;
      job.currentStage = 3;
      job.state = "expanding_search";
      this.executeStage(job, 3, 10, true, io);
    }, stageIntervalMs * 2);
    job.timeouts.push(t3);
    const t4 = setTimeout(() => {
      if (job.state === "partner_assigned" || job.state === "cancelled") return;
      job.state = "no_partner_available";
      if (io) {
        io.to(`delivery:${requestId}`).emit("dispatch:status", {
          deliveryId: requestId,
          state: "no_partner_available",
          message: "No delivery partner currently available in this radius. You can expand budget or retry."
        });
        io.emit("dispatch:status", {
          deliveryId: requestId,
          state: "no_partner_available"
        });
      }
    }, Math.round(stageIntervalMs * 3.2));
    job.timeouts.push(t4);
  }
  /**
   * Execute single dispatch stage: evaluate candidates, notify partners, update status
   */
  executeStage(job, stageNumber, radiusKm, enableCorridors, io) {
    const partners = partnerPresenceService.getActivePartners();
    const candidates = evaluateDeliveryCandidates(
      {
        requesterId: job.delivery.requesterId,
        pickupCoords: job.delivery.pickupCoords,
        dropoffCoords: job.delivery.dropoffCoords,
        rejectedBy: job.delivery.rejectedBy
      },
      partners,
      {
        maxRadiusKm: radiusKm,
        enableRouteCorridorMatching: enableCorridors,
        excludedPartnerIds: Array.from(job.notifiedPartnerIds)
      }
    );
    for (const match of candidates) {
      job.notifiedPartnerIds.add(match.partner.userId);
      const opportunityPayload = {
        delivery: job.delivery,
        matchType: match.matchType,
        distanceToPickupKm: match.distanceToPickupKm,
        estimatedEtaMinutes: match.estimatedEtaMinutes,
        score: match.score,
        directionalAlignment: match.directionalAlignment,
        stage: stageNumber
      };
      if (io) {
        io.to(`partner:${match.partner.userId}`).emit("dispatch:opportunity", opportunityPayload);
        io.emit("dispatch:opportunity", opportunityPayload);
      }
    }
    if (io) {
      io.to(`delivery:${job.requestId}`).emit("dispatch:status", {
        deliveryId: job.requestId,
        state: job.state,
        stage: stageNumber,
        radiusKm,
        candidateCount: candidates.length
      });
      io.emit("dispatch:status", {
        deliveryId: job.requestId,
        state: job.state,
        stage: stageNumber,
        radiusKm
      });
    }
  }
  /**
   * Stop dispatching (when accepted, cancelled, or expired) and clear all timers
   */
  stopDispatch(requestId, reason = "assigned", io) {
    const job = this.jobs.get(requestId);
    if (!job) return;
    for (const timeout of job.timeouts) {
      clearTimeout(timeout);
    }
    job.timeouts = [];
    job.state = reason === "assigned" ? "partner_assigned" : reason === "cancelled" ? "cancelled" : "no_partner_available";
    if (io) {
      io.to(`delivery:${requestId}`).emit("dispatch:status", {
        deliveryId: requestId,
        state: job.state,
        reason
      });
      io.emit("dispatch:status", {
        deliveryId: requestId,
        state: job.state,
        reason
      });
    }
  }
  /**
   * Partner declines: record in rejection list so they are excluded from further stages
   */
  handlePartnerDecline(requestId, partnerId) {
    const job = this.jobs.get(requestId);
    if (job) {
      if (!job.delivery.rejectedBy) job.delivery.rejectedBy = [];
      if (!job.delivery.rejectedBy.includes(partnerId)) {
        job.delivery.rejectedBy.push(partnerId);
      }
      job.notifiedPartnerIds.add(partnerId);
    }
  }
  getJob(requestId) {
    return this.jobs.get(requestId);
  }
  clearAll() {
    for (const job of this.jobs.values()) {
      for (const t of job.timeouts) clearTimeout(t);
    }
    this.jobs.clear();
  }
};
var dispatchService = new DispatchService();

// server/routes/deliveries.ts
var router2 = Router2();
var isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
var uploadsDir = isServerless ? path.join("/tmp", "uploads", "delivery-proofs") : path.join(process.cwd(), "uploads", "delivery-proofs");
try {
  if (!existsSync2(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn("[Multer Storage] Could not initialize uploads directory:", err.message);
}
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `proof-${uniqueSuffix}${ext}`);
  }
});
var upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed as delivery proof"));
    }
  }
});
var INITIAL_COMMUNITY_DELIVERIES = [
  {
    _id: "6712b001a1b2c3d4e5f60001",
    id: "6712b001a1b2c3d4e5f60001",
    title: "Lab Notebook & Circuit Breadboard",
    description: "Urgent pickup from Science Library; fragile electronics breadboard inside protected pouch.",
    category: "campus-supplies",
    pickupAddress: "Stanford Science Library, Stanford, CA",
    pickupCoords: [37.4275, -122.1697],
    dropoffAddress: "Castro St & El Camino Real, Mountain View, CA",
    dropoffCoords: [37.3861, -122.0839],
    itemSize: "small",
    weightEstimateKg: 1.2,
    compensation: 22.5,
    urgency: "urgent",
    neededBy: "Today by 19:00",
    status: "open",
    requesterId: "usr-marcus-10",
    requesterName: "Marcus Vance",
    requesterTrustScore: 98,
    requesterAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    handoverPin: "4821",
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 8.4,
    estimatedDurationMin: 14,
    estimatedDetourMinutes: 5,
    createdAt: new Date(Date.now() - 36e5 * 2),
    updatedAt: new Date(Date.now() - 36e5 * 2)
  },
  {
    _id: "6712b001a1b2c3d4e5f60002",
    id: "6712b001a1b2c3d4e5f60002",
    title: "Whole Foods Organic Groceries Bag",
    description: "Pre-ordered curbside pickup: 2 bags of fresh produce, sourdough, and oat milk.",
    category: "groceries",
    pickupAddress: "Whole Foods Market, 774 Emerson St, Palo Alto, CA",
    pickupCoords: [37.4418, -122.1601],
    dropoffAddress: "San Antonio Center, Mountain View, CA",
    dropoffCoords: [37.4022, -122.1124],
    itemSize: "medium",
    weightEstimateKg: 4.5,
    compensation: 18,
    urgency: "standard",
    neededBy: "Today by 18:30",
    status: "open",
    requesterId: "usr-elena-20",
    requesterName: "Elena Rostova",
    requesterTrustScore: 97,
    requesterAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    handoverPin: "7914",
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 6.2,
    estimatedDurationMin: 11,
    estimatedDetourMinutes: 4,
    createdAt: new Date(Date.now() - 36e5 * 3),
    updatedAt: new Date(Date.now() - 36e5 * 3)
  },
  {
    _id: "6712b001a1b2c3d4e5f60003",
    id: "6712b001a1b2c3d4e5f60003",
    title: "Pharmacy Prescription Medication Pack",
    description: "Sealed prescription envelope from pharmacy counter for elderly family member.",
    category: "pharmacy",
    pickupAddress: "Walgreens, 4170 El Camino Real, Palo Alto, CA",
    pickupCoords: [37.4124, -122.1287],
    dropoffAddress: "California Ave Commercial Strip, Palo Alto, CA",
    dropoffCoords: [37.4285, -122.1432],
    itemSize: "small",
    weightEstimateKg: 0.5,
    compensation: 14,
    urgency: "standard",
    neededBy: "Today by 17:00",
    status: "open",
    requesterId: "usr-david-30",
    requesterName: "David Chen",
    requesterTrustScore: 99,
    requesterAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    handoverPin: "3152",
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 3.8,
    estimatedDurationMin: 8,
    estimatedDetourMinutes: 3,
    createdAt: new Date(Date.now() - 36e5 * 4),
    updatedAt: new Date(Date.now() - 36e5 * 4)
  },
  {
    _id: "6712b001a1b2c3d4e5f60004",
    id: "6712b001a1b2c3d4e5f60004",
    title: "Architectural Blueprint Portfolio",
    description: "Heavy duty cylinder tube containing master plans for community center renovation.",
    category: "documents",
    pickupAddress: "University Ave & High St, Palo Alto, CA",
    pickupCoords: [37.4445, -122.1633],
    dropoffAddress: "Sunnyvale Tech Campus, Sunnyvale, CA",
    dropoffCoords: [37.3751, -122.0352],
    itemSize: "medium",
    weightEstimateKg: 2.1,
    compensation: 26,
    urgency: "urgent",
    neededBy: "Today by 20:00",
    status: "open",
    requesterId: "usr-priya-40",
    requesterName: "Priya Patel",
    requesterTrustScore: 96,
    requesterAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    handoverPin: "8204",
    pinAttempts: 0,
    rejectedBy: [],
    distanceKm: 14.1,
    estimatedDurationMin: 20,
    estimatedDetourMinutes: 6,
    createdAt: new Date(Date.now() - 36e5 * 5),
    updatedAt: new Date(Date.now() - 36e5 * 5)
  }
];
var inMemoryDeliveries = [...INITIAL_COMMUNITY_DELIVERIES];
var inMemoryLocations = /* @__PURE__ */ new Map();
function formatDelivery(doc, forUserId) {
  const showPin = Boolean(forUserId && forUserId === doc.requesterId);
  return {
    id: (doc._id || doc.id).toString(),
    _id: (doc._id || doc.id).toString(),
    title: doc.title,
    description: doc.description,
    category: doc.category,
    pickupAddress: doc.pickupAddress,
    pickupCoords: doc.pickupCoords,
    pickupPlaceId: doc.pickupPlaceId,
    dropoffAddress: doc.dropoffAddress,
    dropoffCoords: doc.dropoffCoords,
    dropoffPlaceId: doc.dropoffPlaceId,
    itemSize: doc.itemSize,
    weightEstimateKg: doc.weightEstimateKg,
    compensation: doc.compensation,
    urgency: doc.urgency,
    neededBy: doc.neededBy,
    status: doc.status,
    requesterId: doc.requesterId,
    requesterName: doc.requesterName,
    requesterTrustScore: doc.requesterTrustScore,
    requesterAvatar: doc.requesterAvatar,
    transporterId: doc.transporterId,
    transporterName: doc.transporterName,
    transporterAvatar: doc.transporterAvatar,
    transporterVehicle: doc.transporterVehicle,
    ...showPin && doc.handoverPin ? { handoverPin: doc.handoverPin } : {},
    pinAttempts: doc.pinAttempts,
    pinLockedUntil: doc.pinLockedUntil,
    proofPhotoUrl: doc.proofPhotoUrl,
    rejectedBy: doc.rejectedBy || [],
    distanceKm: doc.distanceKm,
    estimatedDurationMin: doc.estimatedDurationMin,
    estimatedDetourMinutes: doc.estimatedDetourMinutes,
    createdAt: doc.createdAt?.toISOString?.() || (doc.createdAt ? new Date(doc.createdAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString()),
    updatedAt: doc.updatedAt?.toISOString?.() || (doc.updatedAt ? new Date(doc.updatedAt).toISOString() : (/* @__PURE__ */ new Date()).toISOString())
  };
}
function getInMemDelivery(id) {
  if (!id) return void 0;
  const targetId = Array.isArray(id) ? id[0] : id;
  return inMemoryDeliveries.find((d) => d._id === targetId || d.id === targetId);
}
router2.get("/", optionalAuth, async (req, res) => {
  try {
    const { status, requesterId, transporterId, category, excludeRejectedBy } = req.query;
    const callerUid = req.user?.uid;
    if (isDbConnected()) {
      try {
        const filter = {};
        if (status) filter.status = status;
        if (requesterId) filter.requesterId = requesterId;
        if (transporterId) filter.transporterId = transporterId;
        if (category) filter.category = category;
        if (excludeRejectedBy) filter.rejectedBy = { $ne: String(excludeRejectedBy) };
        const count = await DeliveryRequest.countDocuments();
        if (count === 0) {
          await DeliveryRequest.insertMany(INITIAL_COMMUNITY_DELIVERIES);
        }
        const docs = await DeliveryRequest.find(filter).sort({ createdAt: -1 }).limit(100);
        res.json(docs.map((d) => formatDelivery(d, callerUid)));
        return;
      } catch (dbErr) {
        console.warn("[DB Fallback] Falling back to in-memory delivery store:", dbErr.message);
      }
    }
    let results = [...inMemoryDeliveries];
    if (status) results = results.filter((d) => d.status === status);
    if (requesterId) results = results.filter((d) => d.requesterId === requesterId);
    if (transporterId) results = results.filter((d) => d.transporterId === transporterId);
    if (category) results = results.filter((d) => d.category === category);
    if (excludeRejectedBy) results = results.filter((d) => !d.rejectedBy || !d.rejectedBy.includes(String(excludeRejectedBy)));
    res.json(results.map((d) => formatDelivery(d, callerUid)));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch deliveries", details: err.message });
  }
});
router2.get("/:id", optionalAuth, async (req, res) => {
  try {
    const callerUid = req.user?.uid;
    if (isDbConnected()) {
      try {
        const doc = await DeliveryRequest.findById(req.params.id);
        if (doc) {
          res.json(formatDelivery(doc, callerUid));
          return;
        }
      } catch {
      }
    }
    const inMem = getInMemDelivery(req.params.id);
    if (!inMem) {
      res.status(404).json({ error: "Delivery request not found" });
      return;
    }
    res.json(formatDelivery(inMem, callerUid));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch delivery", details: err.message });
  }
});
router2.post("/", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const {
      title,
      description,
      category,
      pickupAddress,
      pickupCoords,
      pickupPlaceId,
      dropoffAddress,
      dropoffCoords,
      dropoffPlaceId,
      itemSize,
      weightEstimateKg,
      compensation,
      urgency,
      neededBy,
      distanceKm,
      estimatedDurationMin
    } = req.body;
    if (!title || !pickupAddress || !dropoffAddress || !pickupCoords || !dropoffCoords || compensation === void 0) {
      res.status(400).json({ error: "Missing required delivery fields" });
      return;
    }
    const handoverPin = Math.floor(1e3 + Math.random() * 9e3).toString();
    const newId = `del-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    const deliveryData = {
      _id: newId,
      id: newId,
      title: String(title).trim(),
      description: String(description || "Standard errand request").trim(),
      category: category || "other",
      pickupAddress: String(pickupAddress).trim(),
      pickupCoords,
      pickupPlaceId: pickupPlaceId ? String(pickupPlaceId).trim() : void 0,
      dropoffAddress: String(dropoffAddress).trim(),
      dropoffCoords,
      dropoffPlaceId: dropoffPlaceId ? String(dropoffPlaceId).trim() : void 0,
      itemSize: itemSize || "medium",
      weightEstimateKg: weightEstimateKg ? Number(weightEstimateKg) : void 0,
      compensation: Number(compensation),
      urgency: urgency || "standard",
      neededBy: neededBy || "Today by 18:00",
      status: "open",
      requesterId: uid,
      requesterName: req.user.name || "RouteM8 Requester",
      requesterTrustScore: 98,
      requesterAvatar: req.user.picture,
      distanceKm: distanceKm !== void 0 ? Number(distanceKm) : void 0,
      estimatedDurationMin: estimatedDurationMin !== void 0 ? Number(estimatedDurationMin) : void 0,
      handoverPin,
      pinAttempts: 0,
      rejectedBy: [],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    inMemoryDeliveries.unshift(deliveryData);
    if (isDbConnected()) {
      try {
        let requester = await User.findOne({ firebaseUid: uid });
        if (!requester) {
          requester = await User.create({
            firebaseUid: uid,
            email: req.user.email || `${uid}@firebase.com`,
            fullName: req.user.name || "RouteM8 Requester",
            role: "both"
          });
        }
        const newDoc = await DeliveryRequest.create({
          ...deliveryData,
          requesterName: requester.fullName,
          requesterTrustScore: requester.trustScore,
          requesterAvatar: requester.avatarUrl
        });
        await Activity.create({
          userId: uid,
          type: "request_created",
          title: `Created delivery: ${title}`,
          description: `Delivery from ${pickupAddress} to ${dropoffAddress}`,
          relatedId: newDoc._id.toString(),
          status: "open"
        }).catch(() => {
        });
        const io2 = req.app.get("io");
        if (io2) {
          const formattedDoc = formatDelivery(newDoc);
          io2.emit("delivery:created", formattedDoc);
          io2.emit("delivery:new", formattedDoc);
        }
        dispatchService.startDispatch(newDoc, io2);
        res.status(201).json(formatDelivery(newDoc, uid));
        return;
      } catch (dbErr) {
        console.warn("[DB Save Fallback] Using in-memory created delivery:", dbErr.message);
      }
    }
    const io = req.app.get("io");
    if (io) {
      const formattedMem = formatDelivery(deliveryData);
      io.emit("delivery:created", formattedMem);
      io.emit("delivery:new", formattedMem);
    }
    dispatchService.startDispatch(deliveryData, io);
    res.status(201).json(formatDelivery(deliveryData, uid));
  } catch (err) {
    res.status(500).json({ error: "Failed to create delivery request", details: err.message });
  }
});
router2.post("/:id/accept", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    if (isDbConnected()) {
      try {
        let transporter = await User.findOne({ firebaseUid: uid });
        if (!transporter) {
          transporter = await User.create({
            firebaseUid: uid,
            email: req.user.email || `${uid}@firebase.com`,
            fullName: req.user.name || "Delivery Partner",
            role: "transporter"
          });
        }
        const delivery = await DeliveryRequest.findOneAndUpdate(
          {
            _id: req.params.id,
            status: "open",
            requesterId: { $ne: uid }
          },
          {
            $set: {
              status: "matched",
              transporterId: uid,
              transporterName: transporter.fullName,
              transporterAvatar: transporter.avatarUrl,
              transporterVehicle: transporter.commuteVehicle || "Vehicle / Commuter"
            }
          },
          { new: true }
        );
        if (!delivery) {
          const existing = await DeliveryRequest.findById(req.params.id);
          if (!existing) {
            res.status(404).json({ error: "Delivery request not found" });
            return;
          }
          if (existing.requesterId === uid) {
            res.status(403).json({ error: "Forbidden: cannot accept your own delivery request" });
            return;
          }
          if (existing.status !== "open") {
            res.status(409).json({
              error: "This delivery has already been accepted by another partner or is no longer open",
              status: existing.status
            });
            return;
          }
          res.status(400).json({ error: "Unable to accept this delivery" });
          return;
        }
        await Activity.create({
          userId: uid,
          type: "match_found",
          title: `Accepted delivery: ${delivery.title}`,
          description: `Matched with requester ${delivery.requesterName}`,
          relatedId: delivery._id.toString(),
          status: "matched"
        }).catch(() => {
        });
        const formatted2 = formatDelivery(delivery);
        const io2 = req.app.get("io");
        if (io2) {
          io2.to(`delivery:${delivery._id}`).emit("delivery:matched", formatted2);
          io2.emit("delivery:claimed", { deliveryId: delivery._id.toString() });
        }
        dispatchService.stopDispatch(delivery._id.toString(), "assigned", io2);
        res.json(formatted2);
        return;
      } catch (dbErr) {
        console.warn("[DB Accept Fallback] Falling back to in-memory accept:", dbErr.message);
      }
    }
    const target = getInMemDelivery(req.params.id);
    if (!target) {
      res.status(404).json({ error: "Delivery request not found" });
      return;
    }
    if (target.requesterId === uid) {
      res.status(403).json({ error: "Forbidden: cannot accept your own delivery request" });
      return;
    }
    if (target.status !== "open") {
      res.status(409).json({
        error: "This delivery has already been accepted by another partner or is no longer open",
        status: target.status
      });
      return;
    }
    target.status = "matched";
    target.transporterId = uid;
    target.transporterName = req.user.name || "Delivery Partner";
    target.transporterVehicle = "Commuter Vehicle";
    target.updatedAt = /* @__PURE__ */ new Date();
    const formatted = formatDelivery(target);
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${target._id}`).emit("delivery:matched", formatted);
      io.emit("delivery:claimed", { deliveryId: target._id.toString() });
    }
    dispatchService.stopDispatch(target._id.toString(), "assigned", io);
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Failed to accept delivery", details: err.message });
  }
});
router2.post("/:id/reject", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const deliveryId = String(req.params.id);
    dispatchService.handlePartnerDecline(deliveryId, uid);
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(req.params.id);
        if (!delivery) {
          res.status(404).json({ error: "Delivery request not found" });
          return;
        }
        await DeliveryRequest.findByIdAndUpdate(req.params.id, {
          $addToSet: { rejectedBy: uid }
        });
        res.json({ success: true, message: "Delivery dismissed for this partner" });
        return;
      } catch (dbErr) {
        console.warn("[DB Reject Fallback] Falling back to in-memory reject:", dbErr.message);
      }
    }
    const target = getInMemDelivery(req.params.id);
    if (!target) {
      res.status(404).json({ error: "Delivery request not found" });
      return;
    }
    if (!target.rejectedBy) target.rejectedBy = [];
    if (!target.rejectedBy.includes(uid)) {
      target.rejectedBy.push(uid);
    }
    res.json({ success: true, message: "Delivery dismissed for this partner" });
  } catch (err) {
    res.status(500).json({ error: "Failed to dismiss delivery", details: err.message });
  }
});
router2.post("/:id/start-transit", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const deliveryId = String(req.params.id);
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);
        if (!delivery) {
          res.status(404).json({ error: "Delivery not found" });
          return;
        }
        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: "Only the assigned delivery partner can start transit" });
          return;
        }
        if (delivery.status !== "matched") {
          res.status(400).json({ error: `Cannot start transit from status '${delivery.status}'. Delivery must be in 'matched' status.` });
          return;
        }
        delivery.status = "in_transit";
        await delivery.save();
        await Activity.create({
          userId: uid,
          type: "in_transit",
          title: `In transit: ${delivery.title}`,
          description: `En route to pickup and drop-off`,
          relatedId: delivery._id.toString(),
          status: "in_transit"
        }).catch(() => {
        });
        const formatted2 = formatDelivery(delivery);
        const io2 = req.app.get("io");
        if (io2) {
          io2.to(`delivery:${delivery._id}`).emit("delivery:in_transit", formatted2);
          io2.to(`delivery:${delivery._id}`).emit("delivery:status_changed", {
            deliveryId: delivery._id.toString(),
            status: "in_transit",
            delivery: formatted2
          });
          io2.emit("delivery:updated", formatted2);
        }
        res.json(formatted2);
        return;
      } catch (dbErr) {
        console.warn("[DB Start-Transit Fallback] Falling back to in-memory start-transit:", dbErr.message);
      }
    }
    const target = getInMemDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (target.transporterId !== uid) {
      res.status(403).json({ error: "Only the assigned delivery partner can start transit" });
      return;
    }
    if (target.status !== "matched") {
      res.status(400).json({ error: `Cannot start transit from status '${target.status}'. Delivery must be in 'matched' status.` });
      return;
    }
    target.status = "in_transit";
    target.updatedAt = /* @__PURE__ */ new Date();
    const formatted = formatDelivery(target);
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${target._id}`).emit("delivery:in_transit", formatted);
      io.to(`delivery:${target._id}`).emit("delivery:status_changed", {
        deliveryId: target._id.toString(),
        status: "in_transit",
        delivery: formatted
      });
      io.emit("delivery:updated", formatted);
    }
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Failed to start transit", details: err.message });
  }
});
router2.post("/:id/verify-pin", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const deliveryId = String(req.params.id);
    const { pin } = req.body || {};
    if (!pin || typeof pin !== "string" || pin.trim().length !== 4) {
      res.status(400).json({ error: "Please provide a valid 4-digit handover PIN" });
      return;
    }
    const cleanedPin = pin.trim();
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);
        if (!delivery) {
          res.status(404).json({ error: "Delivery not found" });
          return;
        }
        if (delivery.requesterId !== uid && delivery.transporterId !== uid) {
          res.status(403).json({ error: "Only participants in this delivery can verify handover" });
          return;
        }
        if (delivery.status === "completed") {
          res.status(400).json({ error: "Delivery is already completed" });
          return;
        }
        if (delivery.pinLockedUntil && /* @__PURE__ */ new Date() < new Date(delivery.pinLockedUntil)) {
          const waitMinutes = Math.ceil((new Date(delivery.pinLockedUntil).getTime() - Date.now()) / 6e4);
          res.status(429).json({
            error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
            lockedUntil: delivery.pinLockedUntil,
            isLocked: true
          });
          return;
        }
        if (cleanedPin !== delivery.handoverPin) {
          delivery.pinAttempts = (delivery.pinAttempts || 0) + 1;
          const MAX_ATTEMPTS = 5;
          if (delivery.pinAttempts >= MAX_ATTEMPTS) {
            delivery.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1e3);
          }
          await delivery.save();
          const remaining = Math.max(0, MAX_ATTEMPTS - delivery.pinAttempts);
          res.status(400).json({
            error: "Invalid handover PIN",
            attemptsRemaining: remaining,
            isLocked: delivery.pinAttempts >= MAX_ATTEMPTS,
            lockedUntil: delivery.pinLockedUntil
          });
          return;
        }
        delivery.pinAttempts = 0;
        delivery.pinLockedUntil = void 0;
        delivery.status = "completed";
        await delivery.save();
        if (delivery.transporterId) {
          await User.updateOne({ firebaseUid: delivery.transporterId }, { $inc: { completedDeliveries: 1 } }).catch(() => {
          });
        }
        await User.updateOne({ firebaseUid: delivery.requesterId }, { $inc: { completedDeliveries: 1 } }).catch(() => {
        });
        await Activity.create({
          userId: uid,
          type: "delivered",
          title: `Delivery completed: ${delivery.title}`,
          description: `Handover verified with secure PIN. Earned $${delivery.compensation.toFixed(2)}`,
          relatedId: delivery._id.toString(),
          status: "completed"
        }).catch(() => {
        });
        const formatted2 = formatDelivery(delivery);
        const io2 = req.app.get("io");
        if (io2) {
          io2.to(`delivery:${delivery._id}`).emit("delivery:completed", formatted2);
          io2.to(`delivery:${delivery._id}`).emit("delivery:status_changed", {
            deliveryId: delivery._id.toString(),
            status: "completed",
            delivery: formatted2
          });
          io2.emit("delivery:updated", formatted2);
        }
        res.json({
          success: true,
          message: "Handover verified and delivery completed",
          delivery: formatted2
        });
        return;
      } catch (dbErr) {
        console.warn("[DB Verify-PIN Fallback] Falling back to in-memory verify-pin:", dbErr.message);
      }
    }
    const target = getInMemDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (target.requesterId !== uid && target.transporterId !== uid) {
      res.status(403).json({ error: "Only participants in this delivery can verify handover" });
      return;
    }
    if (target.status === "completed") {
      res.status(400).json({ error: "Delivery is already completed" });
      return;
    }
    if (target.pinLockedUntil && /* @__PURE__ */ new Date() < new Date(target.pinLockedUntil)) {
      const waitMinutes = Math.ceil((new Date(target.pinLockedUntil).getTime() - Date.now()) / 6e4);
      res.status(429).json({
        error: `PIN verification locked due to too many failed attempts. Try again in ${waitMinutes} minute(s).`,
        lockedUntil: target.pinLockedUntil,
        isLocked: true
      });
      return;
    }
    if (cleanedPin !== target.handoverPin) {
      target.pinAttempts = (target.pinAttempts || 0) + 1;
      const MAX_ATTEMPTS = 5;
      if (target.pinAttempts >= MAX_ATTEMPTS) {
        target.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1e3);
      }
      const remaining = Math.max(0, MAX_ATTEMPTS - target.pinAttempts);
      res.status(400).json({
        error: "Invalid handover PIN",
        attemptsRemaining: remaining,
        isLocked: target.pinAttempts >= MAX_ATTEMPTS,
        lockedUntil: target.pinLockedUntil
      });
      return;
    }
    target.pinAttempts = 0;
    target.pinLockedUntil = void 0;
    target.status = "completed";
    target.updatedAt = /* @__PURE__ */ new Date();
    const formatted = formatDelivery(target);
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${target._id}`).emit("delivery:completed", formatted);
      io.to(`delivery:${target._id}`).emit("delivery:status_changed", {
        deliveryId: target._id.toString(),
        status: "completed",
        delivery: formatted
      });
      io.emit("delivery:updated", formatted);
    }
    res.json({
      success: true,
      message: "Handover verified and delivery completed",
      delivery: formatted
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify PIN", details: err.message });
  }
});
router2.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const deliveryId = String(req.params.id);
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);
        if (!delivery) {
          res.status(404).json({ error: "Delivery not found" });
          return;
        }
        if (delivery.requesterId !== uid && delivery.transporterId !== uid) {
          res.status(403).json({ error: "Not authorized to cancel this delivery" });
          return;
        }
        if (delivery.status === "completed") {
          res.status(400).json({ error: "Cannot cancel a completed delivery" });
          return;
        }
        delivery.status = "cancelled";
        await delivery.save();
        const io2 = req.app.get("io");
        if (io2) {
          io2.to(`delivery:${delivery._id}`).emit("delivery:cancelled", { deliveryId: delivery._id.toString() });
        }
        dispatchService.stopDispatch(delivery._id.toString(), "cancelled", io2);
        res.json({ success: true, delivery: formatDelivery(delivery) });
        return;
      } catch (dbErr) {
        console.warn("[DB Cancel Fallback] Falling back to in-memory cancel:", dbErr.message);
      }
    }
    const target = getInMemDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (target.requesterId !== uid && target.transporterId !== uid) {
      res.status(403).json({ error: "Not authorized to cancel this delivery" });
      return;
    }
    if (target.status === "completed") {
      res.status(400).json({ error: "Cannot cancel a completed delivery" });
      return;
    }
    target.status = "cancelled";
    target.updatedAt = /* @__PURE__ */ new Date();
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${target._id}`).emit("delivery:cancelled", { deliveryId: target._id.toString() });
    }
    dispatchService.stopDispatch(target._id.toString(), "cancelled", io);
    res.json({ success: true, delivery: formatDelivery(target) });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel delivery", details: err.message });
  }
});
router2.post(
  "/:id/proof",
  requireAuth,
  upload.single("photo"),
  async (req, res) => {
    try {
      const uid = req.user.uid;
      const delivery = await DeliveryRequest.findById(req.params.id);
      if (!delivery) {
        res.status(404).json({ error: "Delivery not found" });
        return;
      }
      if (delivery.transporterId !== uid && delivery.requesterId !== uid) {
        res.status(403).json({ error: "Only participants can attach delivery proof" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "No photo uploaded" });
        return;
      }
      const relativeUrl = `/uploads/delivery-proofs/${req.file.filename}`;
      delivery.proofPhotoUrl = relativeUrl;
      await delivery.save();
      res.json({
        success: true,
        proofPhotoUrl: relativeUrl,
        delivery: formatDelivery(delivery)
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload delivery proof", details: err.message });
    }
  }
);
router2.get("/:id/location", async (req, res) => {
  try {
    const deliveryId = String(req.params.id);
    if (isDbConnected()) {
      try {
        const latestLoc = await Location.findOne({ deliveryId }).sort({ createdAt: -1 });
        if (latestLoc) {
          res.json({
            deliveryId: latestLoc.deliveryId,
            transporterId: latestLoc.transporterId,
            latitude: latestLoc.latitude,
            longitude: latestLoc.longitude,
            heading: latestLoc.heading,
            speed: latestLoc.speed,
            updatedAt: latestLoc.updatedAt.toISOString()
          });
          return;
        }
      } catch (dbErr) {
        console.warn("[DB Location Fallback] Location query error:", dbErr.message);
      }
    }
    const memLoc = inMemoryLocations.get(deliveryId);
    if (memLoc) {
      res.json(memLoc);
      return;
    }
    res.status(404).json({ error: "No location updates found for this delivery" });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch location", details: err.message });
  }
});
router2.post("/:id/location", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const deliveryId = String(req.params.id);
    const { latitude, longitude, heading, speed } = req.body || {};
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      res.status(400).json({ error: "Latitude and longitude must be numbers" });
      return;
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: "Coordinates out of bounds" });
      return;
    }
    if (isDbConnected()) {
      try {
        const delivery = await DeliveryRequest.findById(deliveryId);
        if (!delivery) {
          res.status(404).json({ error: "Delivery not found" });
          return;
        }
        if (delivery.transporterId !== uid) {
          res.status(403).json({ error: "Only the assigned delivery partner can send live location" });
          return;
        }
        if (delivery.status !== "matched" && delivery.status !== "in_transit") {
          res.status(400).json({ error: `Cannot share location for delivery in status "${delivery.status}"` });
          return;
        }
        const locDoc = await Location.create({
          deliveryId,
          transporterId: uid,
          latitude,
          longitude,
          heading: typeof heading === "number" ? heading : void 0,
          speed: typeof speed === "number" ? speed : void 0
        });
        const payload2 = {
          deliveryId,
          transporterId: uid,
          latitude: locDoc.latitude,
          longitude: locDoc.longitude,
          heading: locDoc.heading,
          speed: locDoc.speed,
          updatedAt: locDoc.updatedAt.toISOString()
        };
        inMemoryLocations.set(deliveryId, payload2);
        const io2 = req.app.get("io");
        if (io2) {
          io2.to(`delivery:${deliveryId}`).emit("location:change", payload2);
        }
        res.json({ success: true, location: payload2 });
        return;
      } catch (dbErr) {
        console.warn("[DB Location Fallback] Location create fallback:", dbErr.message);
      }
    }
    const target = getInMemDelivery(deliveryId);
    if (!target) {
      res.status(404).json({ error: "Delivery not found" });
      return;
    }
    if (target.transporterId !== uid) {
      res.status(403).json({ error: "Only the assigned delivery partner can send live location" });
      return;
    }
    if (target.status !== "matched" && target.status !== "in_transit") {
      res.status(400).json({ error: `Cannot share location for delivery in status "${target.status}"` });
      return;
    }
    const payload = {
      deliveryId,
      transporterId: uid,
      latitude,
      longitude,
      heading: typeof heading === "number" ? heading : void 0,
      speed: typeof speed === "number" ? speed : void 0,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    inMemoryLocations.set(deliveryId, payload);
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${deliveryId}`).emit("location:change", payload);
    }
    res.json({ success: true, location: payload });
  } catch (err) {
    res.status(500).json({ error: "Failed to record location", details: err.message });
  }
});
var deliveries_default = router2;

// server/routes/journeys.ts
import { Router as Router3 } from "express";

// server/models/Journey.ts
import mongoose6, { Schema as Schema5 } from "mongoose";
var JourneySchema = new Schema5(
  {
    transporterId: {
      type: String,
      required: true,
      index: true
    },
    transporterName: {
      type: String,
      required: true
    },
    transporterAvatar: {
      type: String
    },
    transporterTrustScore: {
      type: Number,
      default: 85
    },
    vehicle: {
      type: String,
      required: true,
      trim: true
    },
    originAddress: {
      type: String,
      required: true
    },
    originCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: "Invalid origin coordinates [lat, lng]"
      }
    },
    destAddress: {
      type: String,
      required: true
    },
    destCoords: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => v.length === 2 && v[0] >= -90 && v[0] <= 90 && v[1] >= -180 && v[1] <= 180,
        message: "Invalid destination coordinates [lat, lng]"
      }
    },
    departureTime: {
      type: String,
      required: true
    },
    maxDetourMinutes: {
      type: Number,
      default: 10,
      min: 1,
      max: 60
    },
    capacity: {
      type: String,
      enum: ["small", "medium", "large"],
      default: "medium"
    },
    recurringDays: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);
var Journey = mongoose6.models.Journey || mongoose6.model("Journey", JourneySchema);

// server/routes/journeys.ts
var router3 = Router3();
function formatJourney(doc) {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    transporterId: doc.transporterId,
    transporterName: doc.transporterName,
    transporterAvatar: doc.transporterAvatar,
    transporterTrustScore: doc.transporterTrustScore,
    vehicle: doc.vehicle,
    originAddress: doc.originAddress,
    originCoords: doc.originCoords,
    destAddress: doc.destAddress,
    destCoords: doc.destCoords,
    departureTime: doc.departureTime,
    maxDetourMinutes: doc.maxDetourMinutes,
    capacity: doc.capacity,
    recurringDays: doc.recurringDays,
    isActive: doc.isActive,
    notes: doc.notes,
    createdAt: doc.createdAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: doc.updatedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString()
  };
}
router3.get("/", async (req, res) => {
  try {
    const { transporterId, activeOnly } = req.query;
    const filter = {};
    if (transporterId) {
      filter.transporterId = transporterId;
    }
    if (activeOnly !== "false") {
      filter.isActive = true;
    }
    const docs = await Journey.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(docs.map(formatJourney));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch journeys", details: err.message });
  }
});
router3.get("/:id", async (req, res) => {
  try {
    const doc = await Journey.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Journey not found" });
      return;
    }
    res.json(formatJourney(doc));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch journey", details: err.message });
  }
});
router3.post("/", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const {
      vehicle,
      originAddress,
      originCoords,
      destAddress,
      destCoords,
      departureTime,
      maxDetourMinutes,
      capacity,
      recurringDays,
      notes
    } = req.body;
    if (!vehicle || !originAddress || !originCoords || !destAddress || !destCoords || !departureTime) {
      res.status(400).json({ error: "Missing required journey route fields" });
      return;
    }
    let transporter = await User.findOne({ firebaseUid: uid });
    if (!transporter) {
      transporter = await User.create({
        firebaseUid: uid,
        email: req.user.email || `${uid}@firebase.com`,
        fullName: req.user.name || "Commuter Partner",
        role: "transporter"
      });
    }
    const doc = await Journey.create({
      transporterId: uid,
      transporterName: transporter.fullName,
      transporterAvatar: transporter.avatarUrl,
      transporterTrustScore: transporter.trustScore,
      vehicle: String(vehicle).trim(),
      originAddress: String(originAddress).trim(),
      originCoords,
      destAddress: String(destAddress).trim(),
      destCoords,
      departureTime: String(departureTime).trim(),
      maxDetourMinutes: Number(maxDetourMinutes || 10),
      capacity: capacity || "medium",
      recurringDays: Array.isArray(recurringDays) ? recurringDays : [],
      notes: notes ? String(notes).trim() : void 0,
      isActive: true
    });
    await Activity.create({
      userId: uid,
      type: "journey_published",
      title: `Published commute: ${originAddress} -> ${destAddress}`,
      description: `Departing ${departureTime} via ${vehicle}`,
      relatedId: doc._id.toString()
    });
    res.status(201).json(formatJourney(doc));
  } catch (err) {
    res.status(500).json({ error: "Failed to publish journey", details: err.message });
  }
});
router3.delete("/:id", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const doc = await Journey.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "Journey not found" });
      return;
    }
    if (doc.transporterId !== uid) {
      res.status(403).json({ error: "Only the commuter can delete their published journey" });
      return;
    }
    await Journey.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Journey removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete journey", details: err.message });
  }
});
var journeys_default = router3;

// server/routes/livekit.ts
import { Router as Router4 } from "express";
import { AccessToken } from "livekit-server-sdk";
var router4 = Router4();
router4.post("/token", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { deliveryId } = req.body;
    if (!deliveryId) {
      res.status(400).json({ error: "deliveryId is required" });
      return;
    }
    const delivery = await DeliveryRequest.findById(deliveryId);
    if (!delivery) {
      res.status(404).json({ error: "Delivery request not found" });
      return;
    }
    const isRequester = delivery.requesterId === uid;
    const isTransporter = delivery.transporterId === uid;
    if (!isRequester && !isTransporter) {
      res.status(403).json({ error: "Forbidden: You are not an authorized participant in this delivery" });
      return;
    }
    if (delivery.status !== "matched" && delivery.status !== "in_transit") {
      res.status(400).json({
        error: `Audio calling is not available for deliveries in '${delivery.status}' status. Calls require 'matched' or 'in_transit' status.`
      });
      return;
    }
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || "wss://routem8-dev.livekit.cloud";
    const participantName = isRequester ? delivery.requesterName : delivery.transporterName || "Delivery Partner";
    const participantRole = isRequester ? "Customer" : "Transporter";
    const roomName = `delivery-${delivery._id.toString()}`;
    if (!apiKey || !apiSecret) {
      if (process.env.NODE_ENV === "test" || process.env.ALLOW_MOCK_LIVEKIT === "true") {
        res.json({
          token: `mock-livekit-token-${uid}-${Date.now()}`,
          serverUrl,
          room: roomName,
          participantIdentity: uid,
          participantName,
          role: participantRole
        });
        return;
      }
      res.status(503).json({
        error: "LiveKit server credentials (LIVEKIT_API_KEY / LIVEKIT_API_SECRET) are not configured on the server.",
        missingConfig: true
      });
      return;
    }
    const at = new AccessToken(apiKey, apiSecret, {
      identity: uid,
      name: participantName,
      ttl: "1h"
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    const jwt = await at.toJwt();
    res.json({
      token: jwt,
      serverUrl,
      room: roomName,
      participantIdentity: uid,
      participantName,
      role: participantRole
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to mint LiveKit call token", details: err.message });
  }
});
var livekit_default = router4;

// server/routes/activities.ts
import { Router as Router5 } from "express";
var router5 = Router5();
router5.get("/", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const items = await Activity.find({ userId: uid }).sort({ createdAt: -1 }).limit(30);
    res.json(
      items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        title: item.title,
        description: item.description,
        timestamp: item.createdAt.toISOString(),
        relatedId: item.relatedId,
        status: item.status
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch activities", details: err.message });
  }
});
var activities_default = router5;

// server/routes/places.ts
import { Router as Router6 } from "express";
var router6 = Router6();
var GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "AIzaSyBGd5npLdnbQRZSWyO6lhbo7FoiI02OmsY";
router6.get("/autocomplete", async (req, res) => {
  const input = String(req.query.input || "").trim();
  const latStr = req.query.lat ? String(req.query.lat) : null;
  const lngStr = req.query.lng ? String(req.query.lng) : null;
  if (!input) {
    res.json({ suggestions: [] });
    return;
  }
  try {
    const body = { input };
    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        body.locationBias = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 5e4
            // 50km bias circle
          }
        };
      }
    }
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_KEY
      },
      body: JSON.stringify(body)
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        const suggestions = data.suggestions.filter((s) => s.placePrediction).map((s) => {
          const p = s.placePrediction;
          return {
            placeId: p.placeId || p.place?.replace("places/", "") || "",
            description: p.text?.text || p.structuredFormat?.mainText?.text || "",
            mainText: p.structuredFormat?.mainText?.text || p.text?.text || "",
            secondaryText: p.structuredFormat?.secondaryText?.text || "",
            types: p.types || []
          };
        });
        res.json({ suggestions, source: "google" });
        return;
      }
    } else {
      const errText = await response.text();
      console.warn("[Places API New] HTTP Error:", response.status, errText);
    }
  } catch (err) {
    console.warn("[Places API New] Error fetching suggestions:", err.message);
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=7&addressdetails=1`;
    const fallbackResp = await fetch(url, {
      headers: {
        "User-Agent": "RouteM8-DeliveryApp/1.0",
        "Accept-Language": "en"
      }
    });
    if (fallbackResp.ok) {
      const results = await fallbackResp.json();
      if (Array.isArray(results) && results.length > 0) {
        const suggestions = results.map((item, idx) => {
          const mainText = item.name || item.display_name.split(",")[0];
          const parts = item.display_name.split(",");
          const secondaryText = parts.slice(1).join(",").trim();
          return {
            placeId: `osm-${item.osm_type || "node"}-${item.osm_id || idx}`,
            description: item.display_name,
            mainText,
            secondaryText,
            types: [item.type || "geocode"]
          };
        });
        res.json({ suggestions, source: "nominatim" });
        return;
      }
    }
  } catch (err) {
    console.warn("[Places Fallback] Nominatim search notice:", err.message);
  }
  res.json({ suggestions: [] });
});
router6.get("/details", async (req, res) => {
  const placeId = String(req.query.placeId || "").trim();
  if (!placeId) {
    res.status(400).json({ error: "placeId is required" });
    return;
  }
  if (!placeId.startsWith("osm-")) {
    try {
      const cleanId = placeId.replace("places/", "");
      const url = `https://places.googleapis.com/v1/places/${cleanId}?fields=id,displayName,formattedAddress,location&key=${GOOGLE_MAPS_KEY}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.location && typeof data.location.latitude === "number") {
          const result = {
            placeId: data.id || cleanId,
            formattedAddress: data.formattedAddress || data.displayName?.text || "",
            name: data.displayName?.text || "",
            location: {
              lat: data.location.latitude,
              lng: data.location.longitude
            }
          };
          res.json(result);
          return;
        }
      } else {
        const errText = await response.text();
        console.warn("[Places Details] Google API error:", response.status, errText);
      }
    } catch (err) {
      console.warn("[Places Details] Google API request error:", err.message);
    }
  }
  if (placeId.startsWith("osm-")) {
    const parts = placeId.split("-");
    const osmType = parts[1] === "way" ? "W" : parts[1] === "relation" ? "R" : "N";
    const osmId = parts[2];
    try {
      const url = `https://nominatim.openstreetmap.org/details?osmtype=${osmType}&osmid=${osmId}&format=json`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "RouteM8-DeliveryApp/1.0",
          "Accept-Language": "en"
        }
      });
      if (response.ok) {
        const data = await response.json();
        const lat = parseFloat(data.centroid?.coordinates?.[1] || data.lat);
        const lng = parseFloat(data.centroid?.coordinates?.[0] || data.lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          res.json({
            placeId,
            formattedAddress: data.localname || data.names?.name || "Selected Location",
            name: data.localname || data.names?.name || "",
            location: { lat, lng }
          });
          return;
        }
      }
    } catch (err) {
      console.warn("[Places Details] OSM details notice:", err.message);
    }
  }
  res.status(404).json({ error: "Unable to resolve coordinates for this place ID" });
});
router6.get("/reverse-geocode", async (req, res) => {
  const latStr = req.query.lat ? String(req.query.lat) : null;
  const lngStr = req.query.lng ? String(req.query.lng) : null;
  if (!latStr || !lngStr) {
    res.status(400).json({ error: "lat and lng query parameters required" });
    return;
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "Coordinates out of valid earth bounds" });
    return;
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "RouteM8-DeliveryApp/1.0",
        "Accept-Language": "en"
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.display_name) {
        res.json({ formattedAddress: data.display_name, lat, lng });
        return;
      }
    }
  } catch (err) {
    console.warn("[ReverseGeocode] Nominatim notice:", err.message);
  }
  res.json({ formattedAddress: `Location at ${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng });
});
var places_default = router6;

// server/app.ts
function createApp() {
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  const isServerless2 = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const uploadsPath = isServerless2 ? path2.join("/tmp", "uploads") : path2.join(process.cwd(), "uploads");
  app.use("/uploads", express.static(uploadsPath));
  const healthHandler = (_req, res) => {
    res.json({
      status: "ok",
      service: "RouteM8 Express API",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  };
  app.get("/api/health", healthHandler);
  app.get("/health", healthHandler);
  app.use("/api/auth", auth_default);
  app.use("/auth", auth_default);
  app.use("/api/deliveries", deliveries_default);
  app.use("/deliveries", deliveries_default);
  app.use("/api/journeys", journeys_default);
  app.use("/journeys", journeys_default);
  app.use("/api/livekit", livekit_default);
  app.use("/livekit", livekit_default);
  app.use("/api/activities", activities_default);
  app.use("/activities", activities_default);
  app.use("/api/places", places_default);
  app.use("/places", places_default);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
  });
  return app;
}

// api/index.ts
var appPromise = null;
async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      try {
        await connectDB();
      } catch (err) {
        console.warn("[Vercel Serverless] MongoDB connect attempt:", err.message);
      }
      return createApp();
    })();
  }
  return appPromise;
}
async function handler(req, res) {
  const app = await getApp();
  return new Promise((resolve, reject) => {
    res.on("finish", () => resolve());
    res.on("close", () => resolve());
    res.on("error", (err) => reject(err));
    app(req, res);
  });
}
export {
  handler as default
};
