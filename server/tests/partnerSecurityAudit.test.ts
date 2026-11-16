import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import { inMemoryApplications, inMemoryAuditLogs } from '../routes/partnerApplication.js';
import { inMemoryPaymentOrders, inMemorySettlements, inMemoryRefunds } from '../routes/payments.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import { calculateCommission } from '../services/commissionEngine.js';

describe('RouteM8 Phase 2.1: Final Onboarding Security & Persistence Audit', () => {
  let server: Server;
  let baseUrl: string;

  const requesterToken = 'Bearer mock-token-audit-requester';
  const secondRequesterToken = 'Bearer mock-token-audit-applicant-2';
  const adminToken = 'Bearer mock-token-admin-audit';
  const unapprovedToken = 'Bearer mock-token-unapproved-user';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';

    // Clear all test in-memory state
    inMemoryApplications.clear();
    inMemoryAuditLogs.length = 0;
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryDeliveries.length = 0;

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
    process.env.NODE_ENV = 'test';
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // =========================================================================
  // 1. FAIL-CLOSED PERSISTENCE AUDIT
  // =========================================================================
  describe('1. MongoDB Persistence & Fail-Closed Behavior', () => {
    it('fails closed with HTTP 503 on partner application endpoints in non-test mode when MongoDB is unavailable', async () => {
      // Temporarily simulate production environment
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const applyRes = await fetch(`${baseUrl}/api/partner/apply`, {
          method: 'POST',
          headers: {
            Authorization: requesterToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ vehicleCategory: 'motorcycle' }),
        });
        expect(applyRes.status).toBe(503);
        const applyData: any = await applyRes.json();
        expect(applyData.error).toContain('Database unavailable');

        const statusRes = await fetch(`${baseUrl}/api/partner/application`, {
          headers: { Authorization: requesterToken },
        });
        expect(statusRes.status).toBe(503);

        const verifyIdRes = await fetch(`${baseUrl}/api/partner/verify-identity`, {
          method: 'POST',
          headers: {
            Authorization: requesterToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ consentObtained: true }),
        });
        expect(verifyIdRes.status).toBe(503);

        const reviewRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
          method: 'POST',
          headers: {
            Authorization: adminToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ applicationId: 'app-1', decision: 'approve', reason: 'Verified' }),
        });
        expect(reviewRes.status).toBe(503);
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });

    it('fails closed with HTTP 503 on payment endpoints in non-test mode when MongoDB is unavailable', async () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const orderRes = await fetch(`${baseUrl}/api/payments/create-order`, {
          method: 'POST',
          headers: {
            Authorization: requesterToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deliveryId: 'del-123' }),
        });
        expect(orderRes.status).toBe(503);
        const orderData: any = await orderRes.json();
        expect(orderData.error).toContain('Database unavailable');

        const settleRes = await fetch(`${baseUrl}/api/payments/settle`, {
          method: 'POST',
          headers: {
            Authorization: requesterToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ paymentOrderId: 'pay-123' }),
        });
        expect(settleRes.status).toBe(503);
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });
  });

  // =========================================================================
  // 2. BACKEND AUTHORIZATION & TRANSPORTER LIFECYCLE PROTECTION
  // =========================================================================
  describe('2. Backend Authorization & Dispatch Gatekeeper', () => {
    const testDeliveryId = 'del-audit-dispatch-001';

    beforeAll(() => {
      inMemoryDeliveries.push({
        _id: testDeliveryId,
        id: testDeliveryId,
        requesterId: 'audit-other-requester',
        pickupAddress: 'Sector 62, Noida',
        dropoffAddress: 'Cyber City, Gurugram',
        pickupCoords: [28.62, 77.37],
        dropoffCoords: [28.49, 77.08],
        category: 'documents',
        packageSize: 'small',
        status: 'open',
        compensation: 250,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it('rejects unapproved user from accepting a delivery with 403', async () => {
      const res = await fetch(`${baseUrl}/api/deliveries/${testDeliveryId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: unapprovedToken,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Approved delivery partner status required');
    });

    it('rejects applicant with submitted but unreviewed application from accepting a delivery', async () => {
      // Submit application for audit-applicant-2
      await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: secondRequesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vehicleCategory: 'motorcycle' }),
      });

      const res = await fetch(`${baseUrl}/api/deliveries/${testDeliveryId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: secondRequesterToken,
          'Content-Type': 'application/json',
        },
      });

      expect(res.status).toBe(403);
      const data: any = await res.json();
      expect(data.error).toContain('Approved delivery partner status required');
    });

    it('allows approved partner to accept open delivery', async () => {
      // Admin approves applicant 2
      const approveRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'audit-applicant-2',
          decision: 'approve',
          reason: 'KYC verified and background check cleared',
        }),
      });
      expect(approveRes.status).toBe(200);

      // Now applicant 2 accepts delivery
      const acceptRes = await fetch(`${baseUrl}/api/deliveries/${testDeliveryId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: secondRequesterToken,
          'Content-Type': 'application/json',
        },
      });
      expect(acceptRes.status).toBe(200);
      const acceptData: any = await acceptRes.json();
      expect(acceptData.status).toBe('matched');
      expect(acceptData.transporterId).toBe('audit-applicant-2');
    });

    it('immediately prevents suspended partner from accepting subsequent deliveries', async () => {
      // Create another open delivery
      const nextDeliveryId = 'del-audit-dispatch-002';
      inMemoryDeliveries.push({
        _id: nextDeliveryId,
        id: nextDeliveryId,
        requesterId: 'audit-other-requester',
        pickupAddress: 'Indiranagar, Bengaluru',
        dropoffAddress: 'Whitefield, Bengaluru',
        pickupCoords: [12.97, 77.64],
        dropoffCoords: [12.96, 77.75],
        category: 'groceries',
        packageSize: 'medium',
        status: 'open',
        compensation: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Admin suspends applicant 2
      const suspendRes = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'audit-applicant-2',
          decision: 'suspend',
          reason: 'Policy compliance violation during transit',
        }),
      });
      expect(suspendRes.status).toBe(200);

      // Suspended partner attempts to accept delivery
      const acceptRes = await fetch(`${baseUrl}/api/deliveries/${nextDeliveryId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: secondRequesterToken,
          'Content-Type': 'application/json',
        },
      });
      expect(acceptRes.status).toBe(403);
      const data: any = await resJson(acceptRes);
      expect(data.error).toContain('Partner status has been suspended or rejected');
    });
  });

  // =========================================================================
  // 3. ADMIN AUDIT SECURITY & TAMPER RESISTANCE
  // =========================================================================
  describe('3. Admin Audit Security & Tamper Resistance', () => {
    it('blocks non-admin users from accessing the audit log', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/audit-logs`, {
        headers: { Authorization: requesterToken },
      });
      expect(res.status).toBe(403);
    });

    it('strictly forbids DELETE or modification of audit log endpoints (404 Not Found)', async () => {
      const deleteRes = await fetch(`${baseUrl}/api/partner/admin/audit-logs`, {
        method: 'DELETE',
        headers: { Authorization: adminToken },
      });
      expect(deleteRes.status).toBe(404);

      const putRes = await fetch(`${baseUrl}/api/partner/admin/audit-logs`, {
        method: 'PUT',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'tampered' }),
      });
      expect(putRes.status).toBe(404);
    });

    it('requires a mandatory non-empty reason for all administrative decisions', async () => {
      const res = await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'audit-applicant-2',
          decision: 'reject',
          reason: '   ', // whitespace only
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Mandatory review reason is required');
    });

    it('accurately logs administrative action, target, actor, and reason', async () => {
      const initialLogCount = inMemoryAuditLogs.length;

      await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'audit-applicant-2',
          decision: 'reject',
          reason: 'Blurry government document photograph',
        }),
      });

      expect(inMemoryAuditLogs.length).toBe(initialLogCount + 1);
      const latestLog = inMemoryAuditLogs[0];
      expect(latestLog.adminUserId).toBe('admin-audit');
      expect(latestLog.action).toBe('partner_application_reject');
      expect(latestLog.targetId).toBe('audit-applicant-2');
      expect(latestLog.reason).toBe('Blurry government document photograph');
      expect(latestLog.newState.status).toBe('rejected');
    });
  });

  // =========================================================================
  // 4. PARTNER APPLICATION LIFECYCLE & STATE MACHINE
  // =========================================================================
  describe('4. Partner Application Lifecycle & Resubmission', () => {
    const applicantToken = 'Bearer mock-token-lifecycle-applicant';

    it('progresses through draft/submitted -> verification_pending -> under_review', async () => {
      // 1. Submit application
      const submitRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: applicantToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vehicleCategory: 'motorcycle' }),
      });
      expect(submitRes.status).toBe(200);

      // 2. Verify identity with consent
      const idRes = await fetch(`${baseUrl}/api/partner/verify-identity`, {
        method: 'POST',
        headers: {
          Authorization: applicantToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idType: 'aadhaar_offline',
          consentObtained: true,
          consentVersion: 'v1.0-2026',
        }),
      });
      expect(idRes.status).toBe(200);

      // Verify status is now verification_pending
      const appRes1 = await fetch(`${baseUrl}/api/partner/application`, {
        headers: { Authorization: applicantToken },
      });
      const data1: any = await appRes1.json();
      expect(data1.application.status).toBe('verification_pending');

      // 3. Finalize and submit for review
      const reviewRes = await fetch(`${baseUrl}/api/partner/submit-for-review`, {
        method: 'POST',
        headers: { Authorization: applicantToken },
      });
      expect(reviewRes.status).toBe(200);
      const reviewData: any = await reviewRes.json();
      expect(reviewData.application.status).toBe('under_review');
    });

    it('rejects premature submission or modification when under review', async () => {
      const applyRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: applicantToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vehicleCategory: 'scooter' }),
      });
      expect(applyRes.status).toBe(400);
      const data: any = await applyRes.json();
      expect(data.error).toContain('under review');
    });

    it('supports resubmission after administrative rejection', async () => {
      // Admin rejects application
      await fetch(`${baseUrl}/api/partner/admin/review`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: 'lifecycle-applicant',
          decision: 'reject',
          reason: 'Vehicle registration expired',
        }),
      });

      // Verify rejection status
      const appRes = await fetch(`${baseUrl}/api/partner/application`, {
        headers: { Authorization: applicantToken },
      });
      const appData: any = await appRes.json();
      expect(appData.application.status).toBe('rejected');

      // Resubmit application
      const resubmitRes = await fetch(`${baseUrl}/api/partner/apply`, {
        method: 'POST',
        headers: {
          Authorization: applicantToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'scooter',
          notes: 'Updated vehicle registration details',
        }),
      });

      expect(resubmitRes.status).toBe(200);
      const resubmitData: any = await resubmitRes.json();
      expect(resubmitData.application.status).toBe('submitted');
      expect(resubmitData.application.vehicleCategory).toBe('scooter');
    });
  });

  // =========================================================================
  // 5. IDENTITY PRIVACY & EXEMPT VEHICLE CATEGORIES
  // =========================================================================
  describe('5. Identity Privacy & Vehicle Exemptions', () => {
    it('refuses identity verification when consent is missing', async () => {
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

    it('returns masked IDs and hashes without exposing raw credentials', async () => {
      const res = await fetch(`${baseUrl}/api/partner/verify-vehicle`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vehicleCategory: 'motorcycle',
          drivingLicenceNumber: 'DL1420110012345',
          registrationNumber: 'DL01AB1234',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.verification.drivingLicenceMasked).toBe('DL-XXXX-2345');
      expect(data.verification.registrationNumberMasked).toBe('MH-XX-XX-1234');
      expect(data.verification.drivingLicenceHash).toBeDefined();
      expect(data.verification.drivingLicenceHash).toHaveLength(64); // SHA-256
    });

    it('exempts bicycle and walking partners from driving licence requirements', async () => {
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
      expect(data.verification.isExempt).toBe(true);
      expect(data.verification.status).toBe('exempt');
      expect(data.verification.drivingLicenceMasked).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. COMMISSION CALCULATION & BETA GUARANTEES
  // =========================================================================
  describe('6. Commission Arithmetic & Rounding Integrity', () => {
    it('maintains strict zero-drift equality between platform and partner shares', async () => {
      const testAmounts = [100, 250, 499, 1000, 2500, 7777, 100000];

      for (const amount of testAmounts) {
        const result = await calculateCommission(amount, 10.0);
        expect(result.platformSharePaise + result.partnerSharePaise).toBe(amount);
      }
    });

    it('enforces 0% commission when configured for beta / pilot promotion', async () => {
      const amountPaise = 5000; // ₹50.00
      const result = await calculateCommission(amountPaise, 0.0);

      expect(result.platformSharePaise).toBe(0);
      expect(result.partnerSharePaise).toBe(5000);
      expect(result.commissionRatePercent).toBe(0);
    });

    it('blocks non-admin users from altering platform commission rate', async () => {
      const res = await fetch(`${baseUrl}/api/payments/commission`, {
        method: 'PUT',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ratePercent: 15.0 }),
      });

      expect(res.status).toBe(403);
    });
  });
});

async function resJson(res: Response): Promise<any> {
  return await res.json();
}

