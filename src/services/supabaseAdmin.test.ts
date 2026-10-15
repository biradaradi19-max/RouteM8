import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isServiceRoleConfigured,
  getSupabaseAdminClient,
  setAdminClientForTesting,
  adminConfirmUserByEmail,
  adminGrantAdminRole,
  adminReviewVerification,
  adminListAllUsers,
} from './supabaseAdmin';

describe('Route M8 Supabase Admin Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAdminClientForTesting(null);
  });

  describe('Configuration & Initialization Checks', () => {
    it('should reflect unconfigured status in default isolated test environment', () => {
      expect(isServiceRoleConfigured()).toBe(false);
      expect(getSupabaseAdminClient()).toBeNull();
    });

    it('should fail safely when attempting to confirm user without service role key', async () => {
      const res = await adminConfirmUserByEmail('test@example.com');
      expect(res.success).toBe(false);
      expect(res.error).toContain('SUPABASE_SERVICE_ROLE_KEY is not configured');
    });

    it('should fail safely when attempting to grant admin role without service role key', async () => {
      const res = await adminGrantAdminRole('test@example.com');
      expect(res.success).toBe(false);
      expect(res.error).toContain('SUPABASE_SERVICE_ROLE_KEY is not configured');
    });

    it('should fail safely when reviewing verification without service role key', async () => {
      const res = await adminReviewVerification('vr-123', 'approved');
      expect(res.success).toBe(false);
      expect(res.error).toContain('SUPABASE_SERVICE_ROLE_KEY is not configured');
    });

    it('should fail safely when listing users without service role key', async () => {
      const res = await adminListAllUsers();
      expect(res.success).toBe(false);
      expect(res.error).toContain('SUPABASE_SERVICE_ROLE_KEY is not configured');
    });
  });

  describe('Admin Operations with Mock Client', () => {
    it('should validate email input when confirming user', async () => {
      const mockClient = {
        auth: { admin: { listUsers: vi.fn(), updateUserById: vi.fn() } },
        from: vi.fn(),
      } as any;
      setAdminClientForTesting(mockClient);

      const res = await adminConfirmUserByEmail('   ');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Email address is required');
    });

    it('should successfully confirm user email when user exists', async () => {
      const mockListUsers = vi.fn().mockResolvedValue({
        data: { users: [{ id: 'usr-456', email: 'alice@stanford.edu' }] },
        error: null,
      });
      const mockUpdateUserById = vi.fn().mockResolvedValue({
        data: { user: { id: 'usr-456', email: 'alice@stanford.edu' } },
        error: null,
      });
      const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

      const mockClient = {
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: mockUpdateUserById,
          },
        },
        from: mockFrom,
      } as any;

      setAdminClientForTesting(mockClient);

      const res = await adminConfirmUserByEmail('alice@stanford.edu');
      expect(res.success).toBe(true);
      expect(res.userId).toBe('usr-456');
      expect(mockUpdateUserById).toHaveBeenCalledWith('usr-456', { email_confirm: true });
    });

    it('should return helpful error when user email is not found', async () => {
      const mockListUsers = vi.fn().mockResolvedValue({
        data: { users: [{ id: 'usr-1', email: 'other@example.com' }] },
        error: null,
      });

      const mockClient = {
        auth: { admin: { listUsers: mockListUsers } },
        from: vi.fn(),
      } as any;

      setAdminClientForTesting(mockClient);

      const res = await adminConfirmUserByEmail('nonexistent@example.com');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No user account found with email');
    });

    it('should grant admin role by upserting admin_users and updating app_metadata', async () => {
      const mockListUsers = vi.fn().mockResolvedValue({
        data: { users: [{ id: 'usr-789', email: 'admin@routem8.org' }] },
        error: null,
      });
      const mockUpdateUserById = vi.fn().mockResolvedValue({
        data: { user: { id: 'usr-789' } },
        error: null,
      });
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });

      const mockClient = {
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: mockUpdateUserById,
          },
        },
        from: mockFrom,
      } as any;

      setAdminClientForTesting(mockClient);

      const res = await adminGrantAdminRole('admin@routem8.org');
      expect(res.success).toBe(true);
      expect(res.userId).toBe('usr-789');
      expect(mockUpsert).toHaveBeenCalledWith({ user_id: 'usr-789' }, { onConflict: 'user_id' });
      expect(mockUpdateUserById).toHaveBeenCalledWith('usr-789', {
        app_metadata: { is_admin: true },
      });
    });

    it('should review verification request via RPC', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });

      const mockClient = {
        rpc: mockRpc,
      } as any;

      setAdminClientForTesting(mockClient);

      const res = await adminReviewVerification('vr-555', 'approved', 'Documents verified');
      expect(res.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('review_verification_request', {
        p_request_id: 'vr-555',
        p_action: 'approved',
        p_notes: 'Documents verified',
      });
    });

    it('should list all auth users with confirmation status', async () => {
      const mockListUsers = vi.fn().mockResolvedValue({
        data: {
          users: [
            {
              id: 'u-1',
              email: 'u1@example.com',
              email_confirmed_at: '2026-10-15T10:00:00Z',
              created_at: '2026-10-15T09:00:00Z',
              last_sign_in_at: '2026-10-15T10:30:00Z',
            },
            {
              id: 'u-2',
              email: 'u2@example.com',
              email_confirmed_at: null,
              created_at: '2026-10-15T11:00:00Z',
            },
          ],
        },
        error: null,
      });

      const mockClient = {
        auth: { admin: { listUsers: mockListUsers } },
      } as any;

      setAdminClientForTesting(mockClient);

      const res = await adminListAllUsers();
      expect(res.success).toBe(true);
      expect(res.users).toHaveLength(2);
      expect(res.users![0].emailConfirmed).toBe(true);
      expect(res.users![1].emailConfirmed).toBe(false);
    });
  });
});
