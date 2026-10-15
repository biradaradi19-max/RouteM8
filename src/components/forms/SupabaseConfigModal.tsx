import React, { useState } from 'react';
import { isSupabaseConfigured } from '../../services/supabase';
import { X, Database, CheckCircle2, Copy, AlertCircle, ExternalLink } from 'lucide-react';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({ isOpen, onClose }) => {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);

  if (!isOpen) return null;

  const envSnippet = `# Route M8 — .env Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`;

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const copySchemaReference = () => {
    navigator.clipboard.writeText('supabase/migrations/20261013000001_security_hardening.sql');
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="supabase-cfg-title">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '560px' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-tertiary)' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-forest-850)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-mint-400)'
          }}>
            <Database size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Cloud Backend
            </span>
            <h2 id="supabase-cfg-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              Supabase Integration Status
            </h2>
          </div>
        </div>

        {/* Status Banner */}
        <div style={{
          backgroundColor: isSupabaseConfigured ? 'var(--status-active-bg)' : 'var(--bg-surface-subtle)',
          border: '1px solid',
          borderColor: isSupabaseConfigured ? 'var(--status-active-border)' : 'var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem'
        }}>
          {isSupabaseConfigured ? (
            <>
              <CheckCircle2 size={18} style={{ color: 'var(--status-active-text)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--status-active-text)' }}>
                  Connected to Live Supabase Backend
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  The client is initialized via <code>VITE_SUPABASE_URL</code> with Row-Level Security and server triggers active.
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={18} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Supabase Environment Unconfigured
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  No backend credentials detected in environment variables. Database requests fail safely with zero fabricated data.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Configuration Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Production Environment Setup</label>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Add your project credentials to <code>.env</code> or <code>.env.local</code> in the project root:
            </div>
            <pre style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              overflowX: 'auto',
              fontFamily: 'monospace',
              margin: 0
            }}>
              {envSnippet}
            </pre>
            <button
              type="button"
              onClick={copyEnvSnippet}
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              <Copy size={14} /> {copiedEnv ? 'Copied .env Template!' : 'Copy .env Template'}
            </button>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.8125rem'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Database Migration & RLS Security</span>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                Dashboard <ExternalLink size={12} />
              </a>
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Base schema is in <code>supabase/schema.sql</code>, and security hardening migration (RLS, PIN protection, server RPCs) is in <code>supabase/migrations/20261013000001_security_hardening.sql</code>.
            </div>
            <button
              type="button"
              onClick={copySchemaReference}
              className="btn btn-secondary btn-sm"
              style={{ width: '100%' }}
            >
              <Copy size={14} /> {copiedSchema ? 'Copied File Reference!' : 'Copy Schema File Path'}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', marginTop: '0.25rem' }}
          >
            Close Overview
          </button>
        </div>
      </div>
    </div>
  );
};
