import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
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
import { X, Server, CheckCircle2, Copy, AlertCircle, Map, Save, PhoneCall, ShieldCheck, Database } from 'lucide-react';

interface BackendStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackendStatusModal: React.FC<BackendStatusModalProps> = ({ isOpen, onClose }) => {
  const { backendStatus, backendError } = useApp();
  const { isFirebaseConnected } = useAuth();
  const [copiedEnv, setCopiedEnv] = useState(false);

  const [mapsKeyInput, setMapsKeyInput] = useState<string>(() => getGoogleMapsApiKey());
  const [mapsMapIdInput, setMapsMapIdInput] = useState<string>(() => getGoogleMapsMapId());
  const [mapsSavedMsg, setMapsSavedMsg] = useState(false);

  const [livekitUrlInput, setLivekitUrlInput] = useState<string>(() => getLiveKitServerUrl());
  const [livekitSavedMsg, setLivekitSavedMsg] = useState(false);

  if (!isOpen) return null;

  const envSnippet = `# Route M8 — Express, MongoDB, Firebase & LiveKit Configuration
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/routem8?retryWrites=true&w=majority
FIREBASE_PROJECT_ID=routem8-36895
# Optional: path to serviceAccountKey.json or inline JSON string
FIREBASE_SERVICE_ACCOUNT_KEY=

# LiveKit Audio Calling (Minted exclusively on Express backend)
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Client Variables (VITE_)
VITE_FIREBASE_PROJECT_ID=routem8-36895
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
VITE_LIVEKIT_URL=wss://your-livekit-server.livekit.cloud`;

  const copyEnvSnippet = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '2rem', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }}>
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
            <Server size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Architecture & Infrastructure
            </span>
            <h2 id="backend-cfg-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              Route M8 Backend Status
            </h2>
          </div>
        </div>

        {/* Backend Status Banner */}
        <div
          style={{
            backgroundColor: backendStatus === 'connected' ? 'var(--status-active-bg)' : 'var(--bg-surface-subtle)',
            border: '1px solid',
            borderColor: backendStatus === 'connected' ? 'var(--status-active-border)' : 'var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          {backendStatus === 'connected' ? (
            <>
              <CheckCircle2 size={18} style={{ color: 'var(--status-active-text)', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--status-active-text)' }}>
                  Express + MongoDB + Socket.IO Active
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Node.js API, MongoDB persistent store, and Socket.IO real-time GPS & audio calling signaling are connected.
                </div>
              </div>
            </>
          ) : backendStatus === 'connecting' ? (
            <>
              <div className="spinner" style={{ width: 18, height: 18, marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Checking Express Backend Health...
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Probing <code>/api/health</code> endpoint and Socket.IO connection.
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={18} style={{ color: '#F59E0B', marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Express Backend Offline / Dev Mode
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {backendError || 'Express server (port 5000) not responding. Running with local client cache. Start server via "npm run server".'}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stack Component Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {/* Firebase Auth */}
          <div style={{ padding: '0.875rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <ShieldCheck size={16} color="var(--color-mint-600)" />
              <strong style={{ fontSize: '0.8125rem' }}>Firebase Auth</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {isFirebaseConnected ? 'Identity & Tokens verified' : 'Configured'}
            </div>
          </div>

          {/* MongoDB */}
          <div style={{ padding: '0.875rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <Database size={16} color="var(--color-mint-600)" />
              <strong style={{ fontSize: '0.8125rem' }}>MongoDB Atlas</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Users, Deliveries, Journeys, GPS
            </div>
          </div>
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
            <span className={`badge badge-${isMapsConfigured ? 'active' : 'pending'}`} style={{ fontSize: '0.75rem' }}>
              {isMapsConfigured ? 'Google Maps Active' : 'Leaflet Fallback Active'}
            </span>
          </div>

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
              {isLiveKitReady ? 'LiveKit URL Configured' : 'URL Unset'}
            </span>
          </div>

          <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            Route M8 provides encrypted real-time audio calls between requesters and transporters. Tokens are minted strictly on the Express backend.
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
            <label className="form-label">Production Environment Template (.env)</label>
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

// Backwards-compatibility alias
export const SupabaseConfigModal = BackendStatusModal;
