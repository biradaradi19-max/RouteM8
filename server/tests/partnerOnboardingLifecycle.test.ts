import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryApplications, inMemoryAuditLogs } from '../routes/partnerApplication.js';

describe('RouteM8 Phase 2: Partner Onboarding & Admin Verification System', () => {
  let server: Server;
  let baseUrl: string;

  const requesterToken = 'Bearer mock-token-requester-user-1';
  const requester2Token = 'Bearer mock-token-requester-user-2';
  const adminToken = 'Bearer mock-token-admin-root';
  const unauthorizedToken = 'Bearer mock-token-unauthorized-user';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';

    // Clear test in-memory state
    inMemoryApplications.clear();
    inMemoryAuditLogs.length = 0;

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('1. Partner Application Submission & State Transitions', () => {
    it('submits a new partner application starting in "submitted" status', async () => {
      const res = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
          phone: '+91 98765 43210',
          notes: 'Daily tech corridor commute 9am-6pm',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.application).toBeDefined();
      expect(data.application.status).toBe('submitted');
      expect(data.application.vehicleCategory).toBe('motorcycle');
    });

    it('retrieves the active application status for authenticated user', async () => {
      const res = await fetch(`${baseUrl}/api/partner/application`, {
        headers: { Authorization: requesterToken },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.application).toBeDefined();
      expect(data.application.status).toBe('submitted');
    });
  });

  describe('2. Identity and Vehicle Verification', () => {
    it('blocks identity verification without explicit user consent', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: false,
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Consent required');
    });

    it('processes identity verification with consent and masks sensitive ID', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: true,
          consentVersion: 'v2.0-2026',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.maskedId).toBe('XXXXXXXX8901');
      expect(data.status).toBe('pending');
    });

    it('grants automatic exemption for non-motorized transport (bicycle)', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-vehicle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'bicycle',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.verification.status).toBe('exempt');
      expect(data.verification.isExempt).toBe(true);
    });

    it('verifies vehicle credentials for motorized transport', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-vehicle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
          drivingLicenceNumber: 'DL-0420110012345',
          registrationNumber: 'MH-12-AB-1234',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.verification.status).toBe('verified');
      expect(data.verification.isExempt).toBe(false);
      expect(data.verification.drivingLicenceMasked).toContain('DL-XXXX');
      expect(data.verification.registrationNumberMasked).toContain('MH-XX');
    });

    it('transitions application to "under_review" upon submit-for-review', async () => {
      const res = await fetch(`${baseUrl}/api/partner/submit-for-review`, {
        method: 'POST',
        headers: { Authorization: requesterToken },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.application.status).toBe('under_review');
    });
  });

  describe('3. Admin RBAC & Audit Trail Verification', () => {
    it('forbids non-admin users from accessing admin applications list', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/applications`, {
        headers: { Authorization: unauthorizedToken },
      });

      expect(res.status).toBe(403);
    });

    it('forbids non-admin users from accessing admin audit logs', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/audit-logs`, {
        headers: { Authorization: unauthorizedToken },
      });

      expect(res.status).toBe(403);
    });

    it('allows admin to list and search pending applications', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/applications?status=pending`, {
        headers: { Authorization: adminToken },
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(Array.isArray(data.applications)).toBe(true);
      expect(data.applications.length).toBeGreaterThan(0);
    });

    it('rejects admin review decision if mandatory reason is missing', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'mock-token-requester-user-1',
          decision: 'approve',
          reason: '   ', // Empty/whitespace reason
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Mandatory review reason is required');
    });

    it('successfully approves application with mandatory reason and logs audit event', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'mock-token-requester-user-1',
          decision: 'approve',
          reason: 'Aadhaar offline XML and DL credentials verified against registry.',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('approved');

      // Verify audit logs contain the approval event
      const auditRes = await fetch(`${baseUrl}/api/partner/admin/audit-logs`, {
        headers: { Authorization: adminToken },
      });
      expect(auditRes.status).toBe(200);
      const auditData: any = await auditRes.json();
      expect(auditData.logs.length).toBeGreaterThan(0);
      expect(auditData.logs[0].action).toBe('partner_application_approve');
      expect(auditData.logs[0].reason).toContain('Aadhaar offline XML');
    });

    it('prevents approved partner from submitting duplicate application', async () => {
      const res = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'car',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('already approved');
    });
  });

  describe('4. Rejection, Resubmission, and Suspension Lifecycle', () => {
    it('allows a second user to apply and allows admin to reject with feedback', async () => {
      // 1. User 2 applies
      const applyRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requester2Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
          phone: '+91 91234 56789',
          notes: 'Suburban delivery corridor',
        }),
      });
      expect(applyRes.status).toBe(200);
      const applyData: any = await applyRes.json();
      const targetAppId = applyData.application?._id || 'requester-user-2';

      // 2. Admin rejects with feedback
      const rejectRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: targetAppId,
          decision: 'reject',
          reason: 'Driving licence copy was unreadable. Please update your document number.',
        }),
      });

      expect(rejectRes.status).toBe(200);
      const rejectData: any = await rejectRes.json();
      expect(rejectData.status).toBe('rejected');

      // 3. User checks status and sees rejection feedback
      const statusRes = await fetch(`${baseUrl}/api/partner/application?u=requester2`, {
        headers: { Authorization: requester2Token },
      });
      const statusData: any = await statusRes.json();
      expect(statusData.application.status).toBe('rejected');
      expect(statusData.application.rejectionReason).toContain('unreadable');

      // 4. User 2 successfully edits and resubmits application
      const resubmitRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requester2Token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'bicycle', // Switches to exempt vehicle
          phone: '+91 91234 56789',
          notes: 'Updated to cycle courier',
        }),
      });

      expect(resubmitRes.status).toBe(200);
      const resubmitData: any = await resubmitRes.json();
      expect(resubmitData.application.status).toBe('submitted');
      expect(resubmitData.application.vehicleCategory).toBe('bicycle');
    });

    it('allows admin to suspend an approved partner and blocks further applications', async () => {
      const suspendRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'mock-token-requester-user-1',
          decision: 'suspend',
          reason: 'Corridor safety policy investigation.',
        }),
      });

      expect(suspendRes.status).toBe(200);
      const suspendData: any = await suspendRes.json();
      expect(suspendData.status).toBe('suspended');

      // Suspended partner cannot arbitrarily re-apply
      const reapplyRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
        }),
      });

      expect(reapplyRes.status).toBe(403);
      const reapplyData: any = await reapplyRes.json();
      expect(reapplyData.error).toContain('suspended');
    });
  });
});
