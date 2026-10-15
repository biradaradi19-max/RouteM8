#!/usr/bin/env node
/**
 * ============================================================================
 * ROUTE M8 — ADMINISTRATIVE CLI TOOL
 * Connects to Supabase using SUPABASE_SERVICE_ROLE_KEY to perform backend tasks:
 * 1. Confirm user email (solves expired OTP/magic link issues)
 * 2. Grant admin privileges
 * 3. List users & review verification requests
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isServiceRoleConfigured,
  adminConfirmUserByEmail,
  adminGrantAdminRole,
  adminListAllUsers,
  adminReviewVerification,
  getAdminSupabaseUrl,
  getServiceRoleKey,
} from '../src/services/supabaseAdmin';

// Manually load .env into process.env if not already loaded
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('\n======================================================');
  console.log('   Route M8 — Supabase Administrative Management');
  console.log('======================================================\n');

  const url = getAdminSupabaseUrl();
  const hasKey = Boolean(getServiceRoleKey());

  console.log(`Endpoint:   ${url || '(Not configured)'}`);
  console.log(`Admin Key:  ${hasKey ? 'Configured (Service Role Active)' : 'MISSING (SUPABASE_SERVICE_ROLE_KEY is blank in .env)'}\n`);

  if (!command || command === 'help' || command === '--help') {
    console.log('Usage:');
    console.log('  npx tsx scripts/admin.ts confirm-user <email>        Confirm user email address directly');
    console.log('  npx tsx scripts/admin.ts make-admin <email-or-uuid>  Grant admin role to user');
    console.log('  npx tsx scripts/admin.ts list-users                  List registered auth users');
    console.log('  npx tsx scripts/admin.ts review <id> <approved|rejected> [notes]');
    console.log('');
    return;
  }

  if (!isServiceRoleConfigured()) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY is not configured.');
    console.error('Please open .env and set your service role secret key:');
    console.error('   SUPABASE_SERVICE_ROLE_KEY=ey...\n');
    process.exit(1);
  }

  if (command === 'confirm-user' || command === 'confirm') {
    const email = args[1];
    if (!email) {
      console.error('❌ Please specify an email: npx tsx scripts/admin.ts confirm-user <email>');
      process.exit(1);
    }
    console.log(`⏳ Auto-confirming email for: ${email}...`);
    const res = await adminConfirmUserByEmail(email);
    if (res.success) {
      console.log(`✅ Success! User ${email} (ID: ${res.userId}) email confirmed in Supabase Auth.`);
      console.log('The user can now sign in immediately using their email and password!');
    } else {
      console.error(`❌ Failed: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'make-admin' || command === 'grant-admin') {
    const target = args[1];
    if (!target) {
      console.error('❌ Please specify an email or user UUID: npx tsx scripts/admin.ts make-admin <email>');
      process.exit(1);
    }
    console.log(`⏳ Granting administrator role to: ${target}...`);
    const res = await adminGrantAdminRole(target);
    if (res.success) {
      console.log(`✅ Success! User ${target} (ID: ${res.userId}) is now an administrator.`);
      console.log('They can now review and approve transporter verifications in Route M8.');
    } else {
      console.error(`❌ Failed: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'list-users') {
    console.log('⏳ Fetching registered users from Supabase Auth...');
    const res = await adminListAllUsers();
    if (res.success && res.users) {
      console.log(`Found ${res.users.length} registered users:\n`);
      for (const u of res.users) {
        console.log(`- ${u.email || '(No email)'}`);
        console.log(`  ID:        ${u.id}`);
        console.log(`  Confirmed: ${u.emailConfirmed ? '✅ Yes' : '⏳ Pending'}`);
        console.log(`  Created:   ${u.createdAt}`);
        console.log('');
      }
    } else {
      console.error(`❌ Failed: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'review') {
    const reqId = args[1];
    const action = args[2] as 'approved' | 'rejected';
    const notes = args.slice(3).join(' ') || undefined;

    if (!reqId || !action || !['approved', 'rejected'].includes(action)) {
      console.error('Usage: npx tsx scripts/admin.ts review <requestId> <approved|rejected> [notes]');
      process.exit(1);
    }

    console.log(`⏳ Setting verification request ${reqId} to ${action}...`);
    const res = await adminReviewVerification(reqId, action, notes);
    if (res.success) {
      console.log(`✅ Success! Request ${reqId} was ${action}.`);
    } else {
      console.error(`❌ Failed: ${res.error}`);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}. Run "npx tsx scripts/admin.ts help" for available commands.`);
}

main().catch((err) => {
  console.error('Fatal admin script error:', err);
  process.exit(1);
});
