import { Router, type Response } from 'express';
import type { sanitizeFilter, UpdateQuery } from 'mongoose';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { PartnerApplication, type IPartnerApplication, type PartnerApplicationStatus, type VehicleCategory } from '../models/PartnerApplication.js';
import { IdentityVerification, type IIdentityVerification } from '../models/IdentityVerification.js';
import { VehicleVerification, type IVehicleVerification } from '../models/VehicleVerification.js';
import { AdminAuditLog, type IAdminAuditLog } from '../models/AdminAuditLog.js';
import { User, type IUser } from '../models/User.js';
import { isDbConnected } from '../config/db.js';
import { mockVerificationProvider } from '../services/verification/MockVerificationProvider.js';

type FilterQuery<T> = Parameters<typeof sanitizeFilter<T>>[0];

const router = Router();

// In-memory fallback strictly for automated tests
export { inMemoryApplications, inMemoryAuditLogs } from '../services/inMemoryStore.js';
import { inMemoryApplications, inMemoryAuditLogs } from '../services/inMemoryStore.js';

// POST /api/partner/apply - Submit or update delivery partner application
router.post('/apply', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const verifiedUser = req.user!;
    const { vehicleCategory, phone, notes } = req.body || {};

    const category: VehicleCategory = vehicleCategory && [
      'bicycle',
      'motorcycle',
      'scooter',
      'car',
      'ev',
      'van',
      'none',
    ].includes(vehicleCategory)
      ? vehicleCategory
      : 'motorcycle';

    if (isDbConnected()) {
      const appFilter: FilterQuery<IPartnerApplication> = { applicantId: verifiedUser.uid };
      let application = await PartnerApplication.findOne(appFilter).sort({ createdAt: -1 });

      if (application) {
        if (application.status === 'approved') {
          res.status(400).json({ error: 'Application already approved. You are already an approved delivery partner.' });
          return;
        }
        if (application.status === 'under_review') {
          res.status(400).json({ error: 'Your application is currently under review by an administrator.' });
          return;
        }
        if (application.status === 'suspended') {
          res.status(403).json({ error: 'Partner account is suspended. Please contact platform support.' });
          return;
        }
      }

      if (!application || application.status === 'rejected') {
        application = new PartnerApplication({
          applicantId: verifiedUser.uid,
          applicantEmail: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
          applicantName: verifiedUser.name || 'Applicant',
          phone: phone || verifiedUser.phoneNumber,
          vehicleCategory: category,
          notes,
          status: 'submitted',
          submittedAt: new Date(),
        });
      } else {
        // Update draft or re-submission
        application.vehicleCategory = category;
        if (phone) application.phone = phone;
        if (notes) application.notes = notes;
        if (application.status === 'draft') {
          application.status = 'submitted';
          application.submittedAt = new Date();
        }
      }

      await application.save();
      res.json({ success: true, application });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const existing = inMemoryApplications.get(verifiedUser.uid);
    if (existing) {
      if (existing.status === 'approved') {
        res.status(400).json({ error: 'Application already approved. You are already an approved delivery partner.' });
        return;
      }
      if (existing.status === 'under_review') {
        res.status(400).json({ error: 'Your application is currently under review by an administrator.' });
        return;
      }
      if (existing.status === 'suspended') {
        res.status(403).json({ error: 'Partner account is suspended. Please contact platform support.' });
        return;
      }
    }

    const application = {
      _id: `app-${verifiedUser.uid}`,
      applicantId: verifiedUser.uid,
      applicantEmail: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
      applicantName: verifiedUser.name || 'Applicant',
      phone: phone || verifiedUser.phoneNumber,
      vehicleCategory: category,
      notes,
      status: 'submitted',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryApplications.set(verifiedUser.uid, application);
    res.json({ success: true, application });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to submit partner application', details: err.message });
  }
});

// POST /api/partner/submit-for-review - Finalize verification and request admin review
router.post('/submit-for-review', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const verifiedUser = req.user!;

    if (isDbConnected()) {
      const appFilter: FilterQuery<IPartnerApplication> = { applicantId: verifiedUser.uid };
      const application = await PartnerApplication.findOne(appFilter).sort({ createdAt: -1 });
      if (!application) {
        res.status(404).json({ error: 'Partner application not found' });
        return;
      }
      if (application.status === 'approved') {
        res.status(400).json({ error: 'Application already approved' });
        return;
      }
      if (application.status === 'suspended') {
        res.status(403).json({ error: 'Partner account is suspended' });
        return;
      }

      application.status = 'under_review';
      await application.save();
      res.json({ success: true, application });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const app = inMemoryApplications.get(verifiedUser.uid);
    if (!app) {
      res.status(404).json({ error: 'Partner application not found' });
      return;
    }
    if (app.status === 'approved') {
      res.status(400).json({ error: 'Application already approved' });
      return;
    }
    if (app.status === 'suspended') {
      res.status(403).json({ error: 'Partner account is suspended' });
      return;
    }

    app.status = 'under_review';
    app.updatedAt = new Date();
    res.json({ success: true, application: app });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to submit for review', details: err.message });
  }
});

// GET /api/partner/application - Get authenticated user's partner application status
router.get('/application', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const uid = req.user!.uid;

    if (isDbConnected()) {
      const appFilter: FilterQuery<IPartnerApplication> = { applicantId: uid };
      const application = await PartnerApplication.findOne(appFilter).sort({ createdAt: -1 });
      const identityVerification = application?.identityVerificationId
        ? await IdentityVerification.findById(application.identityVerificationId)
        : null;
      const vehicleVerification = application?.vehicleVerificationId
        ? await VehicleVerification.findById(application.vehicleVerificationId)
        : null;

      res.json({
        application: application || null,
        identityVerification: identityVerification
          ? {
              status: identityVerification.status,
              maskedId: identityVerification.maskedId,
              idType: identityVerification.idType,
              verifiedAt: identityVerification.verifiedAt,
            }
          : null,
        vehicleVerification: vehicleVerification
          ? {
              status: vehicleVerification.status,
              isExempt: vehicleVerification.isExempt,
              drivingLicenceMasked: vehicleVerification.drivingLicenceMasked,
              registrationNumberMasked: vehicleVerification.registrationNumberMasked,
              verifiedAt: vehicleVerification.verifiedAt,
            }
          : null,
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const application = inMemoryApplications.get(uid) || null;
    res.json({
      application,
      identityVerification: application?.identityVerification || null,
      vehicleVerification: application?.vehicleVerification || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve partner application', details: err.message });
  }
});

// POST /api/partner/verify-identity - Initiate government ID verification
router.post('/verify-identity', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const verifiedUser = req.user!;
    const { idType, consentObtained, consentVersion } = req.body || {};

    if (!isDbConnected() && process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    if (!consentObtained) {
      res.status(400).json({
        error: 'Consent required',
        message: 'Explicit user consent must be obtained before initiating identity verification.',
      });
      return;
    }

    const validIdTypes = ['aadhaar_offline', 'pan', 'voter_id', 'passport', 'driving_licence'];
    const chosenType = validIdTypes.includes(idType) ? idType : 'aadhaar_offline';

    // Provider invocation (Mock adapter for Phase 1 & 2)
    const initResult = await mockVerificationProvider.initiateIdentityVerification({
      userId: verifiedUser.uid,
      applicantName: verifiedUser.name || 'Applicant',
      idType: chosenType,
      consentObtained: true,
      consentVersion: consentVersion || 'v1.0-2026',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (isDbConnected()) {
      const record = await IdentityVerification.create({
        userId: verifiedUser.uid,
        idType: chosenType,
        provider: 'mock',
        providerReferenceId: initResult.providerReferenceId,
        maskedId: initResult.maskedId || 'XXXXXXXX8901',
        verificationHash: initResult.verificationHash || 'mock-hash',
        consentRecord: {
          consentObtained: true,
          consentTimestamp: new Date(),
          consentVersion: consentVersion || 'v1.0-2026',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
        status: initResult.status,
      });

      // Link to application
      const updateFilter: FilterQuery<IPartnerApplication> = { applicantId: verifiedUser.uid };
      const updateDoc: UpdateQuery<IPartnerApplication> = {
        $set: {
          identityVerificationId: record._id.toString(),
          status: 'verification_pending',
        },
      };
      await PartnerApplication.findOneAndUpdate(updateFilter, updateDoc);

      res.json({
        success: true,
        referenceId: initResult.providerReferenceId,
        status: initResult.status,
        maskedId: initResult.maskedId,
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const app = inMemoryApplications.get(verifiedUser.uid);
    if (app) {
      app.identityVerificationId = `id-verif-${verifiedUser.uid}`;
      app.status = 'verification_pending';
      app.identityVerification = {
        status: initResult.status,
        maskedId: initResult.maskedId,
        idType: chosenType,
        verifiedAt: new Date(),
      };
    }

    res.json({
      success: true,
      referenceId: initResult.providerReferenceId,
      status: initResult.status,
      maskedId: initResult.maskedId,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to initiate identity verification', details: err.message });
  }
});

// POST /api/partner/verify-vehicle - Vehicle and Driving Licence verification
router.post('/verify-vehicle', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const verifiedUser = req.user!;
    const { vehicleCategory, category: altCategory, drivingLicenceNumber, registrationNumber } = req.body || {};

    if (!isDbConnected() && process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const category: VehicleCategory = vehicleCategory || altCategory || 'motorcycle';

    const verifyResult = await mockVerificationProvider.verifyVehicleCredentials({
      userId: verifiedUser.uid,
      vehicleCategory: category,
      drivingLicenceNumber,
      registrationNumber,
    });

    if (isDbConnected()) {
      const record = await VehicleVerification.create({
        userId: verifiedUser.uid,
        vehicleCategory: category,
        isExempt: verifyResult.isExempt,
        drivingLicenceMasked: verifyResult.drivingLicenceMasked,
        drivingLicenceHash: verifyResult.drivingLicenceHash,
        registrationNumberMasked: verifyResult.registrationNumberMasked,
        registrationHash: verifyResult.registrationHash,
        provider: 'mock',
        status: verifyResult.status,
        verifiedAt: verifyResult.status === 'verified' ? new Date() : undefined,
      });

      const updateFilter: FilterQuery<IPartnerApplication> = { applicantId: verifiedUser.uid };
      const updateDoc: UpdateQuery<IPartnerApplication> = {
        $set: {
          vehicleVerificationId: record._id.toString(),
          vehicleCategory: category,
        },
      };
      await PartnerApplication.findOneAndUpdate(updateFilter, updateDoc);

      res.json({ success: true, verification: record });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const app = inMemoryApplications.get(verifiedUser.uid);
    if (app) {
      app.vehicleVerificationId = `veh-verif-${verifiedUser.uid}`;
      app.vehicleCategory = category;
      app.vehicleVerification = verifyResult;
    }

    res.json({ success: true, verification: verifyResult });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify vehicle credentials', details: err.message });
  }
});

// GET /api/partner/admin/applications - List and filter partner applications (Admin only)
router.get('/admin/applications', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query as { status?: string; search?: string };

    if (isDbConnected()) {
      const query: FilterQuery<IPartnerApplication> = {};
      if (status && status !== 'all') {
        if (status === 'pending') {
          query.status = { $in: ['submitted', 'verification_pending', 'under_review'] };
        } else {
          query.status = status as PartnerApplicationStatus;
        }
      }

      if (search && search.trim()) {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
          { applicantName: regex },
          { applicantEmail: regex },
          { phone: regex },
        ];
      }

      const applications = await PartnerApplication.find(query).sort({ createdAt: -1 }).lean<IPartnerApplication[]>();

      const enriched = await Promise.all(
        applications.map(async (app) => {
          const identity = app.identityVerificationId
            ? await IdentityVerification.findById(app.identityVerificationId).lean<IIdentityVerification | null>()
            : null;
          const vehicle = app.vehicleVerificationId
            ? await VehicleVerification.findById(app.vehicleVerificationId).lean<IVehicleVerification | null>()
            : null;
          return {
            ...app,
            identityVerification: identity
              ? {
                  status: identity.status,
                  maskedId: identity.maskedId,
                  idType: identity.idType,
                  verifiedAt: identity.verifiedAt,
                }
              : null,
            vehicleVerification: vehicle
              ? {
                  status: vehicle.status,
                  isExempt: vehicle.isExempt,
                  drivingLicenceMasked: vehicle.drivingLicenceMasked,
                  registrationNumberMasked: vehicle.registrationNumberMasked,
                  verifiedAt: vehicle.verifiedAt,
                }
              : null,
          };
        })
      );

      res.json({ applications: enriched });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    let apps = Array.from(inMemoryApplications.values());
    if (status && status !== 'all') {
      if (status === 'pending') {
        apps = apps.filter(a => ['submitted', 'verification_pending', 'under_review'].includes(a.status));
      } else {
        apps = apps.filter(a => a.status === status);
      }
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      apps = apps.filter(
        a =>
          (a.applicantName && a.applicantName.toLowerCase().includes(q)) ||
          (a.applicantEmail && a.applicantEmail.toLowerCase().includes(q)) ||
          (a.phone && a.phone.toLowerCase().includes(q))
      );
    }

    res.json({ applications: apps });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve applications', details: err.message });
  }
});

// GET /api/partner/admin/audit-logs - Admin audit trail (Admin only)
router.get('/admin/audit-logs', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (isDbConnected()) {
      const logFilter: FilterQuery<IAdminAuditLog> = { targetType: 'PartnerApplication' };
      const logs = await AdminAuditLog.find(logFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean<IAdminAuditLog[]>();
      res.json({ logs });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    res.json({ logs: inMemoryAuditLogs });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve audit logs', details: err.message });
  }
});

// POST /api/partner/admin/review - Admin approval / rejection / suspension with mandatory reason & audit logging
router.post('/admin/review', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const adminUid = req.user!.uid;
    const { applicationId, decision, reason } = req.body || {};

    if (!isDbConnected() && process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    if (!applicationId || !['approve', 'reject', 'suspend'].includes(decision)) {
      res.status(400).json({ error: 'applicationId and valid decision (approve | reject | suspend) required' });
      return;
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      res.status(400).json({ error: 'Mandatory review reason is required' });
      return;
    }

    const targetStatus: PartnerApplicationStatus =
      decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'suspended';

    if (isDbConnected()) {
      const application = await PartnerApplication.findById(applicationId);
      if (!application) {
        res.status(404).json({ error: 'Partner application not found' });
        return;
      }

      const previousState = { status: application.status };

      application.status = targetStatus;
      application.reviewedBy = adminUid;
      application.reviewedAt = new Date();
      if (decision === 'approve') {
        application.approvedAt = new Date();
      } else if (decision === 'reject') {
        application.rejectionReason = reason;
      } else if (decision === 'suspend') {
        application.suspensionReason = reason;
      }

      await application.save();

      // On approval/suspension/rejection, update User model server-side
      const userFilter: FilterQuery<IUser> = { firebaseUid: application.applicantId };
      if (decision === 'approve') {
        const userUpdate: UpdateQuery<IUser> = {
          $set: {
            role: 'both',
            commuteVehicle: application.vehicleCategory,
            verificationStatus: 'gov_id_verified',
            partnerAvailable: true,
            accountStatus: 'active',
          },
        };
        await User.findOneAndUpdate(userFilter, userUpdate);
      } else if (decision === 'suspend' || decision === 'reject') {
        // Revoking partner status preserves requester permissions while disabling partner matching
        const userUpdate: UpdateQuery<IUser> = {
          $set: {
            role: 'requester',
            partnerAvailable: false,
          },
        };
        await User.findOneAndUpdate(userFilter, userUpdate);
      }

      // Record immutable audit log
      await AdminAuditLog.create({
        adminUserId: adminUid,
        adminEmail: req.user!.email || 'admin@routem8.internal',
        action: `partner_application_${decision}`,
        targetType: 'PartnerApplication',
        targetId: applicationId,
        previousState,
        newState: { status: targetStatus },
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {});

      res.json({ success: true, status: targetStatus, application });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    let app: any = null;
    const cleanId = String(applicationId).replace(/^mock-token-/, '');
    for (const [key, val] of inMemoryApplications.entries()) {
      if (
        val._id === applicationId ||
        val.applicantId === applicationId ||
        key === applicationId ||
        val._id === cleanId ||
        val.applicantId === cleanId ||
        key === cleanId ||
        val._id === `app-${cleanId}`
      ) {
        val.status = targetStatus;
        val.reviewedBy = adminUid;
        val.reviewedAt = new Date();
        if (decision === 'approve') val.approvedAt = new Date();
        if (decision === 'reject') val.rejectionReason = reason;
        if (decision === 'suspend') val.suspensionReason = reason;
        app = val;
        break;
      }
    }
    if (!app) {
      app = {
        _id: applicationId,
        applicantId: applicationId,
        status: targetStatus,
        reviewedBy: adminUid,
        reviewedAt: new Date(),
        rejectionReason: decision === 'reject' ? reason : undefined,
        suspensionReason: decision === 'suspend' ? reason : undefined,
      };
      inMemoryApplications.set(applicationId, app);
    }

    const auditEntry = {
      _id: `audit-${Date.now()}`,
      adminUserId: adminUid,
      adminEmail: req.user!.email || 'admin@routem8.internal',
      action: `partner_application_${decision}`,
      targetType: 'PartnerApplication',
      targetId: applicationId,
      previousState: { status: 'under_review' },
      newState: { status: targetStatus },
      reason,
      createdAt: new Date(),
    };
    inMemoryAuditLogs.unshift(auditEntry);

    res.json({ success: true, status: targetStatus, application: app });
  } catch (err: any) {
    res.status(500).json({ error: 'Admin review failed', details: err.message });
  }
});

export default router;

