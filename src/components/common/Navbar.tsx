import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Menu, 
  Sun, 
  Moon, 
  PlusCircle, 
  Car,
  User, 
} from 'lucide-react';




interface NavbarProps {
  onOpenCreateRequest: () => void;
  onOpenPublishJourney: () => void;
  onOpenSupabaseConfig: () => void;
  onOpenAuth: () => void;
  onToggleMobileMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenCreateRequest,
  onOpenPublishJourney,
  onOpenSupabaseConfig,
  onOpenAuth,
  onToggleMobileMenu
}) => {
  const { currentView, setCurrentView, theme, toggleTheme } = useApp();
  const { user, isAuthenticated, isSupabaseConnected } = useAuth();

  return (
    <header style={{
      height: 'var(--header-height)',
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-medium)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--shadow-xs)',
      transition: 'background-color var(--transition-normal)'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        
        {/* Brand & Mobile Hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {currentView !== 'landing' && (
            <button
              onClick={onToggleMobileMenu}
              className="mobile-only"
              aria-label="Open Navigation Menu"
              style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}
            >
              <Menu size={22} />
            </button>
          )}

          <div
            onClick={() => setCurrentView('landing')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              backgroundColor: 'var(--color-forest-850)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
                <path d="M18 46C18 36 28 34 32 32C36 30 46 28 46 18" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" />
                <circle cx="18" cy="46" r="6" fill="#0E291E" stroke="#2DD4BF" strokeWidth="4" />
                <circle cx="32" cy="32" r="5" fill="#34D399" />
                <circle cx="46" cy="18" r="6" fill="#0E291E" stroke="#A7F3D0" strokeWidth="4" />
              </svg>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                Route M8
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="desktop-only">
          {[
            { id: 'landing', label: 'Overview' },
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'matching', label: 'Route Matching' },
            { id: 'deliveries', label: 'Active Deliveries' },
          ].map(item => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as any)}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--color-forest-850)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-brand-subtle)' : 'transparent',
                  border: isActive ? '1px solid rgba(45, 212, 191, 0.25)' : '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  transition: 'all var(--transition-fast)'
                }}
              >
                {isActive && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)' }} />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Action Icons & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Supabase Status Pill */}
          <button
            onClick={onOpenSupabaseConfig}
            className="desktop-only"
            title={isSupabaseConnected ? 'Connected to Supabase Cloud' : 'Running in zero-config local mode'}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              transition: 'all var(--transition-fast)'
            }}
          >
            <span
              className={isSupabaseConnected ? 'pulse-indicator' : ''}
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isSupabaseConnected ? 'var(--color-mint-500)' : '#F59E0B'
              }}
            />
            <span>{isSupabaseConnected ? 'Supabase Live' : 'Demo Mode'}</span>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Dark / Light Theme"
            style={{
              padding: '0.5rem',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {/* Quick Header CTAs */}
          <button
            onClick={onOpenPublishJourney}
            className="btn btn-secondary btn-sm desktop-only"
            title="Publish your everyday commute"
          >
            <Car size={15} />
            <span>Publish Commute</span>
          </button>

          <button
            onClick={onOpenCreateRequest}
            className="btn btn-primary btn-sm desktop-only"
          >
            <PlusCircle size={15} />
            <span>Request Item</span>
          </button>


          {/* Auth Button or User Badge */}
          {isAuthenticated && user ? (
            <div
              onClick={() => setCurrentView('dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--color-forest-800)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                  {user.fullName[0]}
                </div>
              )}
              <span style={{ fontSize: '0.8125rem', fontWeight: 700 }} className="desktop-only">
                {user.fullName.split(' ')[0]}
              </span>
              <span className="badge badge-brand desktop-only" style={{ padding: '0.125rem 0.375rem', fontSize: '0.6875rem' }}>
                {user.trustScore}%
              </span>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn btn-secondary btn-sm"
            >
              <User size={15} />
              <span>Sign In</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
};
