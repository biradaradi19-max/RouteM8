import React, { useState } from 'react';
import { isSupabaseConfigured } from '../../services/supabase';
import {
  getGoogleMapsApiKey,
  getGoogleMapsMapId,
  isGoogleMapsConfigured,
  setRuntimeGoogleMapsConfig,
} from '../../services/googleMapsConfig';
import {
  getLiveKitServerUrl,
  isLiveKitConfigured,
  setRuntimeLiveKitUrl,
} from '../../services/livekitConfig';
import { X, Database, CheckCircle2, Copy, AlertCircle, ExternalLink, Map, Save, PhoneCall } from 'lucide-react';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({ isOpen, onClose }) => {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const [mapsKeyInput, setMapsKeyInput] = useState<string>(() => getGoogleMapsApiKey());
  const [mapsMapIdInput, setMapsMapIdInput] = useState<string>(() => getGoogleMapsMapId());
  const [mapsSavedMsg, setMapsSavedMsg] = useState(false);

  const [livekitUrlInput, setLivekitUrlInput] = useState<string>(() => getLiveKitServerUrl());
  const [livekitSavedMsg, setLivekitSavedMsg] = useState(false);

  if (!isOpen) return null;

  const envSnippet = `# Route M8 — .env Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# Server-side admin key (NEVER prefix with VITE_)
SUPABASE_SERVICE_ROLE_KEY=
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
VITE_LIVEKIT_URL=wss://your-livekit-server.livekit.cloud`;

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const copySchemaReference = () => {
    navigator.clipboard.writeText('supabase/migrations/20261015000001_transporter_location_tracking.sql');
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  const handleSaveMapsConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setRuntimeGoogleMapsConfig(mapsKeyInput.trim(), mapsMapIdInput.trim() || 'DEMO_MAP_ID');
    setMapsSavedMsg(true);
    setTimeout(() => setMapsSavedMsg(false), 2500);
  };

  const handleSaveLivekitConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setRuntimeLiveKitUrl(livekitUrlInput.trim());
    setLivekitSavedMsg(true);
    setTimeout(() => setLivekitSavedMsg(false), 2500);
  };

  const isMapsConfigured = isGoogleMapsConfigured();
  const isLiveKitReady = isLiveKitConfigured();

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="backend-cfg-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-tertiary)' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-forest-850)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-mint-400)',
            }}
          >
            <Database size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Cloud & Mapping Infrastructure
            </span>
            <h2 id="backend-cfg-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              Backend & Google Maps Status
            </h2>
          </div>
        </div>

        {/* Supabase Status Banner */}
        <div
          style={{
            backgroundColor: isSupabaseConfigured ? 'var(--status-active-bg)' : 'var(--bg-surface-subtle)',
            border: '1px solid',
            borderColor: isSupabaseConfigured ? 'var(--status-active-border)' : 'var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          {isSupabaseConfigured ? (
            <>
              <CheckCircle2 size={18} style={{ color: 'var(--status-active-text)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--status-active-text)' }}>
                  Connected to Live Supabase Backend
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  PostgreSQL database, Row-Level Security, and Realtime GPS streaming are active.
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={18} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Supabase Backend Unconfigured
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  No backend credentials detected in environment variables. Database operations fail safely with zero fabricated data.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Google Maps Platform Status & Configuration */}
        <div
          style={{
            backgroundColor: isMapsConfigured ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface-subtle)',
            border: '1px solid',
            borderColor: isMapsConfigured ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Map size={18} color="var(--color-mint-600)" />
              <strong style={{ fontSize: '0.9375rem' }}>Google Maps Platform</strong>
            </div>
            <a
              href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_git_agentskills_v1"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}
            >
              Get Free Maps Demo Key <ExternalLink size={12} />
            </a>
          </div>

          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isMapsConfigured
              ? 'Google Maps is active with Advanced Markers and vector road styling. You can also fall back to Leaflet OSM anytime from the map toolbar.'
              : 'Google Maps API key not found. Leaflet OpenStreetMap is active as the fallback. Enter an API key or a free Maps Demo Key to enable Google Maps.'}
          </p>

          <form onSubmit={handleSaveMapsConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                API Key
              </label>
              <input
                type="text"
                placeholder="AIzaSy... (API Key or Maps Demo Key)"
                value={mapsKeyInput}
                onChange={(e) => setMapsKeyInput(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Map ID
                </label>
                <input
                  type="text"
                  placeholder="DEMO_MAP_ID"
                  value={mapsMapIdInput}
                  onChange={(e) => setMapsMapIdInput(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '0.5rem 0.875rem' }}>
                <Save size={14} />
                <span>Save</span>
              </button>
            </div>
            {mapsSavedMsg && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>
                Google Maps configuration updated!
              </span>
            )}
          </form>
        </div>

        {/* LiveKit WebRTC Audio Calling Configuration */}
        <div
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            border: '1px solid var(--border-subtle)',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PhoneCall size={18} color="var(--color-mint-600)" />
              <strong style={{ fontSize: '0.9375rem' }}>LiveKit Audio Calling</strong>
            </div>
            <span
              className={`badge badge-${isLiveKitReady ? 'active' : 'pending'}`}
              style={{ fontSize: '0.75rem' }}
            >
              {isLiveKitReady ? 'LiveKit URL Configured' : 'URL Unset (Edge Function Default)'}
            </span>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            Route M8 generates scoped LiveKit tokens via the <code>livekit-token</code> Supabase Edge Function to protect server secrets.
          </p>

          <form onSubmit={handleSaveLivekitConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                LiveKit WebSocket Server URL
              </label>
              <input
                type="text"
                placeholder="wss://your-project.livekit.cloud"
                value={livekitUrlInput}
                onChange={(e) => setLivekitUrlInput(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '0.5rem 0.875rem' }}>
                <Save size={14} />
                <span>Save LiveKit URL</span>
              </button>
            </div>
            {livekitSavedMsg && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>
                LiveKit server URL updated!
              </span>
            )}
          </form>
        </div>

        {/* Configuration Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="form-label">Production Environment (.env)</label>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Add your credentials to <code>.env</code> or <code>.env.local</code> in the project root:
            </div>
            <pre
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                overflowX: 'auto',
                fontFamily: 'monospace',
                margin: 0,
              }}
            >
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

          <div
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8125rem',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Database Migrations & Realtime Setup</span>
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
              Transporter live location tracking and Realtime publication schema is in <code>supabase/migrations/20261015000001_transporter_location_tracking.sql</code>.
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
