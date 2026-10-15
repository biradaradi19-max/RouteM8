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
  Compass
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
  const { currentView, setCurrentView, theme, toggleTheme } = useApp();
  const { user, isAuthenticated, signOut, isSupabaseConnected } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'matching', label: 'Route Matching', icon: Map, badge: 'Live' },
    { id: 'deliveries', label: 'Active Deliveries', icon: Package },
    { id: 'landing', label: 'Product Landing', icon: Compass },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 90,
          }}
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
          zIndex: isMobileOpen ? 150 : 40,
          flexShrink: 0,
          transition: 'transform var(--transition-normal), background-color var(--transition-normal)',
        }}
      >
        {/* Sidebar Header */}
        <div style={{
          padding: '1.25rem 1.25rem 1rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              backgroundColor: 'var(--bg-brand-subtle)',
              border: '1px solid rgba(45, 212, 191, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-forest-800)',
              flexShrink: 0
            }}>
              <Compass size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Corridor Hub
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                Bay Area Network
              </div>
            </div>
          </div>
          <span className="badge badge-brand" style={{ fontSize: '0.625rem', padding: '0.2rem 0.45rem' }}>
            Active
          </span>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ padding: '1rem 1.25rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={() => { onOpenCreateRequest(); onCloseMobile?.(); }}
            className="btn btn-primary btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
          >
            <PlusCircle size={16} />
            <span>Request an Item</span>
          </button>

          <button
            onClick={() => { onOpenPublishJourney(); onCloseMobile?.(); }}
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.625rem 0.875rem' }}
          >
            <Car size={16} />
            <span>Publish Journey</span>
          </button>
        </div>

        {/* Navigation Menu */}
        <nav style={{ padding: '0.75rem 0.875rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', padding: '0.5rem 0.625rem' }}>
            Navigation
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
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? 'var(--color-forest-850)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-brand-subtle)' : 'transparent',
                  border: isActive ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid transparent',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.875rem',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Icon size={18} color={isActive ? 'var(--color-forest-700)' : 'var(--text-tertiary)'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="badge badge-active" style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Backend & Security Status Box */}
        <div style={{ padding: '0 1.25rem 1rem' }}>
          <div
            onClick={onOpenSupabaseConfig}
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isSupabaseConnected ? 'var(--color-mint-500)' : '#F59E0B'
              }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {isSupabaseConnected ? 'Supabase Connected' : 'Local Persistence'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                  {isSupabaseConnected ? 'RLS Active' : 'Zero-config mode'}
                </div>
              </div>
            </div>
            <Settings size={14} color="var(--text-tertiary)" />
          </div>
        </div>

        {/* User Card & Settings Footer */}
        <div style={{
          padding: '1rem 1.25rem',
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
                    style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-forest-800)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700
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
                  style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                >
                  {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                </button>
                <button
                  onClick={() => signOut()}
                  aria-label="Sign Out"
                  style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                >
                  <LogOut size={16} />
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
                className="btn btn-secondary btn-sm"
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
