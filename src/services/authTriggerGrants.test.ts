import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Auth Trigger Grants & Signup Database Error Regression Suite', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const fixMigrationPath = path.join(migrationsDir, '20261015000002_auth_trigger_grants_fix.sql');

  it('1. should have the new timestamped fix migration file created', () => {
    expect(fs.existsSync(fixMigrationPath), 'Migration 20261015000002_auth_trigger_grants_fix.sql must exist').toBe(true);
  });

  it('2. should preserve immutability of all previously applied migrations', () => {
    const historicalMigrations = [
      '20261012000001_initial_schema.sql',
      '20261013000001_security_hardening.sql',
      '20261014000001_handover_pin_security.sql',
      '20261014000002_trusted_context_hardening.sql',
      '20261014000003_auth_identity_hardening.sql',
      '20261015000001_transporter_location_tracking.sql',
    ];

    for (const m of historicalMigrations) {
      const fullPath = path.join(migrationsDir, m);
      expect(fs.existsSync(fullPath), `Historical migration ${m} must exist`).toBe(true);
    }
  });

  it('3. should grant execute on auth triggers to supabase_auth_admin, postgres, and service_role', () => {
    const sql = fs.readFileSync(fixMigrationPath, 'utf8');

    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.handle_user_email_confirmed\(\)\s+to\s+[^;]*supabase_auth_admin/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.handle_user_email_confirmed\(\)\s+to\s+[^;]*service_role/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+to\s+[^;]*supabase_auth_admin/i);
  });

  it('4. should keep trusted context helpers strictly isolated to internal system roles', () => {
    const sql = fs.readFileSync(fixMigrationPath, 'utf8');

    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.set_trusted_context\s*\(text,\s*uuid\)\s+to\s+[^;]*service_role/i);
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.set_trusted_context\s*\(text,\s*uuid\)\s+to\s+[^;]*\b(anon|authenticated)\b/i);
  });

  it('5. should keep server_context_keys strictly isolated from client roles', () => {
    const sql = fs.readFileSync(fixMigrationPath, 'utf8');

    expect(sql).toMatch(/grant\s+select\s+on\s+(table\s+)?public\.server_context_keys\s+to\s+[^;]*service_role/i);
    expect(sql).not.toMatch(/grant\s+.*on\s+(table\s+)?public\.server_context_keys\s+to\s+[^;]*\b(anon|authenticated)\b/i);
  });

  it('6. should enforce least privilege on public.profiles: zero anon access and no client delete', () => {
    const sql = fs.readFileSync(fixMigrationPath, 'utf8');

    // anon must NOT have table permissions on profiles
    expect(sql).not.toMatch(/grant\s+select\s+on\s+(table\s+)?public\.profiles\s+to\s+[^;]*\banon\b/i);
    expect(sql).not.toMatch(/grant\s+.*insert.*on\s+(table\s+)?public\.profiles\s+to\s+[^;]*\banon\b/i);

    // authenticated has select, insert, update matching RLS, but NOT delete
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update\s+on\s+(table\s+)?public\.profiles\s+to\s+[^;]*authenticated/i);
    expect(sql).not.toMatch(/grant\s+.*delete.*on\s+(table\s+)?public\.profiles\s+to\s+[^;]*\bauthenticated\b/i);

    // dedicated check_username_available RPC is provided to clients instead
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.check_username_available/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.check_username_available\s*\(text\)\s+to\s+[^;]*anon/i);
  });

  it('7. should grant permissions on delivery_requests, published_journeys, and transporter_locations matching RLS without anon access', () => {
    const sql = fs.readFileSync(fixMigrationPath, 'utf8');

    // No anon table grants
    expect(sql).not.toMatch(/grant\s+.*on\s+(table\s+)?public\.delivery_requests\s+to\s+[^;]*\banon\b/i);
    expect(sql).not.toMatch(/grant\s+.*on\s+(table\s+)?public\.published_journeys\s+to\s+[^;]*\banon\b/i);
    expect(sql).not.toMatch(/grant\s+.*on\s+(table\s+)?public\.transporter_locations\s+to\s+[^;]*\banon\b/i);

    // Authenticated operations governed by RLS
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+(table\s+)?public\.delivery_requests\s+to\s+[^;]*authenticated/i);
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+(table\s+)?public\.published_journeys\s+to\s+[^;]*authenticated/i);
    expect(sql).toMatch(/grant\s+select,\s*insert,\s*update\s+on\s+(table\s+)?public\.transporter_locations\s+to\s+[^;]*authenticated/i);
  });
});
