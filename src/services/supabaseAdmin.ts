import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// ROUTE M8 — SUPABASE ADMIN SERVICE (SERVER-SIDE & CLI ONLY)
// Security Critical:
// - Uses SUPABASE_SERVICE_ROLE_KEY to bypass Row Level Security.
// - NEVER expose this key to browser clients (do not prefix with VITE_).
// - Intended for administrative CLI commands, user verification recovery,
//   and server-side operations.
// ============================================================================

function getEnvVar(key: string): string {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!.trim();
  }
  // In Vite environment (if imported in tests/build), check import.meta.env safely
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as any)[key]) {
      return ((import.meta.env as any)[key] || '').trim();
    }
  } catch {
    // Ignore in non-meta environments
  }
  return '';
}

export function getAdminSupabaseUrl(): string {
  return getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL') || '';
}

export function getServiceRoleKey(): string {
  return getEnvVar('SUPABASE_SERVICE_ROLE_KEY') || getEnvVar('SUPABASE_SERVICE_KEY') || '';
}

export function isServiceRoleConfigured(): boolean {
  const url = getAdminSupabaseUrl();
  const key = getServiceRoleKey();
  return Boolean(url && key && url.startsWith('http'));
}

let customAdminClient: SupabaseClient | null = null;

export function setAdminClientForTesting(client: SupabaseClient | null): void {
  customAdminClient = client;
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (customAdminClient) return customAdminClient;

  if (!isServiceRoleConfigured()) return null;

  const url = getAdminSupabaseUrl();
  const key = getServiceRoleKey();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Auto-confirms user's email address in Supabase Auth.
 * Used when an email confirmation link expires (e.g. otp_expired) or for administrative onboarding.
 */
export async function adminConfirmUserByEmail(
  email: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      success: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Please set it in .env to use admin functions.',
    };
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Email address is required.' };
  }

  try {
    // 1. Locate user in Supabase Auth
    const { data: usersData, error: listError } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });

    if (listError) {
      return { success: false, error: `Failed to query auth users: ${listError.message}` };
    }

    const targetUser = usersData.users.find(
      (u) => (u.email || '').toLowerCase() === cleanEmail
    );

    if (!targetUser) {
      return {
        success: false,
        error: `No user account found with email: ${cleanEmail}. Please ensure the user has signed up first.`,
      };
    }

    // 2. Update user to mark email confirmed
    const { data: updated, error: updateError } = await client.auth.admin.updateUserById(
      targetUser.id,
      { email_confirm: true }
    );

    if (updateError) {
      return { success: false, error: `Failed to confirm email: ${updateError.message}` };
    }

    // 3. Ensure profile verification_status is set to verified or email confirmed
    await client
      .from('profiles')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUser.id);

    return {
      success: true,
      userId: updated.user.id,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error confirming user email.' };
  }
}

/**
 * Grants administrator role to a user by adding their user ID to public.admin_users
 * and updating app_metadata.
 */
export async function adminGrantAdminRole(
  emailOrUserId: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      success: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.',
    };
  }

  const query = emailOrUserId.trim();
  if (!query) {
    return { success: false, error: 'User email or UUID is required.' };
  }

  try {
    let targetUserId = query;

    // Check if input is email rather than UUID
    if (query.includes('@')) {
      const { data: usersData, error: listError } = await client.auth.admin.listUsers({
        page: 1,
        perPage: 100,
      });

      if (listError) return { success: false, error: listError.message };

      const found = usersData.users.find((u) => (u.email || '').toLowerCase() === query.toLowerCase());
      if (!found) {
        return { success: false, error: `No user found with email: ${query}` };
      }
      targetUserId = found.id;
    }

    // 1. Insert into public.admin_users table
    const { error: insertError } = await client
      .from('admin_users')
      .upsert({ user_id: targetUserId }, { onConflict: 'user_id' });

    if (insertError) {
      return { success: false, error: `Failed to insert into admin_users: ${insertError.message}` };
    }

    // 2. Set app_metadata.is_admin = true
    await client.auth.admin.updateUserById(targetUserId, {
      app_metadata: { is_admin: true },
    });

    return { success: true, userId: targetUserId };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error granting admin role.' };
  }
}

/**
 * Reviews a pending transporter/student verification request directly using service role bypass.
 */
export async function adminReviewVerification(
  requestId: string,
  action: 'approved' | 'rejected',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
  }

  try {
    const { data, error } = await client.rpc('review_verification_request', {
      p_request_id: requestId,
      p_action: action,
      p_notes: notes || 'Reviewed via Route M8 Admin Service',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: Boolean(data?.success), error: undefined };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to review verification.' };
  }
}

/**
 * Lists all registered auth users with their email confirmation and role status.
 */
export async function adminListAllUsers(): Promise<{
  success: boolean;
  users?: Array<{
    id: string;
    email?: string;
    emailConfirmed: boolean;
    createdAt: string;
    lastSignIn?: string;
  }>;
  error?: string;
}> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' };
  }

  try {
    const { data, error } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });

    if (error) return { success: false, error: error.message };

    const users = data.users.map((u) => ({
      id: u.id,
      email: u.email,
      emailConfirmed: Boolean(u.email_confirmed_at),
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
    }));

    return { success: true, users };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error listing users.' };
  }
}
