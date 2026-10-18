import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  Map, 
  Package, 
  Car, 
  ShieldCheck, 
  PlusCircle, 
  Sun, 
  Moon, 
  LogOut, 
  Settings, 
  Compass,
  X
} from 'lucide-react';

interface SidebarProps {
  onOpenCreateRequest: () => void;
  onOpenPublishJourney: () => void;
  onOpenSupabaseConfig: () => void;
  onOpenAuth: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenCreateRequest,
  onOpenPublishJourney,
  onOpenSupabaseConfig,
  onOpenAuth,
  isMobileOpen,
  onCloseMobile
}) => {
  const {
    currentView,
    setCurrentView,
    theme,
    toggleTheme,
    supabaseStatus,
    activeRoleMode,
    setActiveRoleMode,
    partnerAvailable,
    setPartnerAvailable,
  } = useApp();
  const { user, isAuthenticated, signOut } = useAuth();
  const isBothRole = !user || user.role === 'both';

  interface SidebarNavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; color?: string }>;
    badge?: string;
  }

  const requesterNavItems: SidebarNavItem[] = [
    { id: 'dashboard', label: 'Requester Overview', icon: LayoutDashboard },
    { id: 'deliveries', label: 'Track Deliveries', icon: Compass },
    { id: 'matching', label: 'Explore Corridors', icon: Map },
    { id: 'landing', label: 'Product Landing', icon: Compass },
  ];

  const partnerNavItems: SidebarNavItem[] = [
    { id: 'dashboard', label: 'Partner Overview', icon: LayoutDashboard },
    { id: 'matching', label: 'Find Requests', icon: Map, badge: 'Live' },
    { id: 'deliveries', label: 'My Active Deliveries', icon: Package },
    { id: 'landing', label: 'Product Landing', icon: Compass },
  ];

  const navItems = activeRoleMode === 'requester' ? requesterNavItems : partnerNavItems;

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(6, 21, 15, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 90,
          }}
          aria-hidden="true"
        />
      )}

      <aside
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-medium)',
          display: 'flex',
          flexDirection: 'column',
          height: isMobileOpen ? '100vh' : 'calc(100vh - var(--header-height))',
          position: isMobileOpen ? 'fixed' : 'sticky',
          top: isMobileOpen ? 0 : 'var(--header-height)',
          left: 0,
          zIndex: isMobileOpen ? 150 : 40,
          flexShrink: 0,
          transition: 'transform var(--transition-normal), background-color var(--transition-normal)',
          overflowY: 'auto',
        }}
      >
        {/* Sidebar Header */}
        <div style={{
          padding: '1.125rem 1.25rem 0.875rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-brand-subtle)',
              border: '1px solid rgba(45, 212, 191, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-800)',
              flexShrink: 0
            }}>
              {activeRoleMode === 'requester' ? <Package size={16} /> : <Car size={16} />}
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {activeRoleMode === 'requester' ? 'Requester Hub' : 'Partner Portal'}
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {activeRoleMode === 'requester' ? 'Community Deliveries' : 'Commuter Corridors'}
              </div>
            </div>
          </div>

          {isMobileOpen ? (
            <button
              onClick={onCloseMobile}
              className="icon-btn"
              aria-label="Close Sidebar"
              style={{ width: 30, height: 30 }}
            >
              <X size={16} />
            </button>
          ) : (
            <span className="badge badge-brand" style={{ fontSize: '0.625rem', padding: '0.15rem 0.4rem' }}>
              {activeRoleMode === 'requester' ? 'Requester' : 'Partner'}
            </span>
          )}
        </div>

        {/* Role Switcher in Sidebar for users with both roles */}
        {isBothRole && (
          <div style={{ padding: '0.75rem 1rem 0' }}>
            <div className="role-switcher" role="group" aria-label="Sidebar Role Switcher" style={{ width: '100%' }}>
              <button
                type="button"
                onClick={() => {
                  setActiveRoleMode('requester');
                  if (currentView !== 'landing') setCurrentView('dashboard');
                  onCloseMobile?.();
                }}
                className={`role-switcher-btn ${activeRoleMode === 'requester' ? 'active' : ''}`}
                style={{ flex: 1, padding: '0.35rem 0.5rem' }}
              >
                <Package size={13} />
                <span>Requester</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveRoleMode('transporter');
                  if (currentView !== 'landing') setCurrentView('dashboard');
                  onCloseMobile?.();
                }}
                className={`role-switcher-btn ${activeRoleMode === 'transporter' ? 'active' : ''}`}
                style={{ flex: 1, padding: '0.35rem 0.5rem' }}
              >
                <Car size={13} />
                <span>Partner</span>
              </button>
            </div>
          </div>
        )}

        {/* Partner Availability Toggle (Only in Delivery Partner Mode) */}
        {activeRoleMode === 'transporter' && (
          <div style={{ padding: '0.75rem 1rem 0' }}>
            <button
              type="button"
              onClick={() => setPartnerAvailable(!partnerAvailable)}
              className={`availability-pill ${partnerAvailable ? 'online' : 'offline'}`}
              style={{ width: '100%', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
              title="Click to toggle availability"
            >
              <span className="dot" />
              <span>{partnerAvailable ? 'Online • Accepting Jobs' : 'Offline • Paused'}</span>
            </button>
          </div>
        )}

        {/* Quick Action Buttons */}
        <div style={{ padding: '0.875rem 1rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {activeRoleMode === 'requester' ? (
            <button
              onClick={() => { onOpenCreateRequest(); onCloseMobile?.(); }}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5625rem 0.8125rem' }}
            >
              <PlusCircle size={15} />
              <span>Request a Delivery</span>
            </button>
          ) : (
            <button
              onClick={() => { onOpenPublishJourney(); onCloseMobile?.(); }}
              className="btn btn-primary btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5625rem 0.8125rem' }}
            >
              <Car size={15} />
              <span>Publish My Journey</span>
            </button>
          )}

          {isBothRole && activeRoleMode === 'transporter' && (
            <button
              onClick={() => { onOpenCreateRequest(); onCloseMobile?.(); }}
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5625rem 0.8125rem' }}
            >
              <PlusCircle size={15} />
              <span>Request an Item</span>
            </button>
          )}
          {isBothRole && activeRoleMode === 'requester' && (
            <button
              onClick={() => { onOpenPublishJourney(); onCloseMobile?.(); }}
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5625rem 0.8125rem' }}
            >
              <Car size={15} />
              <span>Publish Commute</span>
            </button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '0.625rem 0.75rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }} aria-label="Sidebar Navigation">
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '0.375rem 0.5rem' }}>
            {activeRoleMode === 'requester' ? 'Requester Views' : 'Partner Views'}
          </div>

          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as any);
                  onCloseMobile?.();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5625rem 0.6875rem',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--color-forest-850)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-brand-subtle)' : 'transparent',
                  border: isActive ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid transparent',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.8125rem',
                  transition: 'all var(--transition-fast)',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <Icon size={16} color={isActive ? 'var(--color-forest-700)' : 'var(--text-tertiary)'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="badge badge-active" style={{ fontSize: '0.5625rem', padding: '0.1rem 0.35rem' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Supabase Connection Status Card */}
        <div style={{ padding: '0 0.875rem 0.625rem' }}>
          <div
            onClick={onOpenSupabaseConfig}
            role="button"
            tabIndex={0}
            title="Backend System Status"
            style={{
              padding: '0.625rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all var(--transition-fast)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`status-dot ${
                supabaseStatus === 'connected' ? 'status-dot-connected' :
                supabaseStatus === 'connecting' ? 'status-dot-connecting' :
                'status-dot-offline'
              }`} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                  {supabaseStatus === 'connected' ? 'Express + MongoDB' :
                   supabaseStatus === 'connecting' ? 'Express Connecting...' :
                   'Express Offline'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                  {supabaseStatus === 'connected' ? 'API & Socket.IO Active' :
                   supabaseStatus === 'connecting' ? 'Probing backend' :
                   'Local cache active'}
                </div>
              </div>
            </div>
            <Settings size={14} color="var(--text-tertiary)" />
          </div>
        </div>

        {/* User Card & Settings Footer */}
        <div style={{
          padding: '0.875rem 1rem',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName}
                    style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-forest-800)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}>
                    {user.fullName[0]}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.fullName}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--color-mint-600)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ShieldCheck size={11} /> Trust {user.trustScore}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <button
                  onClick={toggleTheme}
                  aria-label="Toggle Theme"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                >
                  {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                </button>
                <button
                  onClick={() => signOut()}
                  aria-label="Sign Out"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={onOpenAuth}
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
              >
                Sign In
              </button>
              <button
                onClick={toggleTheme}
                aria-label="Toggle Theme"
                className="icon-btn"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
