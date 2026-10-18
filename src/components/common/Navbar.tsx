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
  Settings,
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
  const { user, isAuthenticated } = useAuth();

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          {currentView !== 'landing' && (
            <button
              onClick={onToggleMobileMenu}
              className="mobile-only icon-btn"
              aria-label="Open Navigation Menu"
            >
              <Menu size={20} />
            </button>
          )}

          <div
            onClick={() => setCurrentView('landing')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}
            title="Route M8 Home"
          >
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              backgroundColor: 'var(--color-forest-850)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: 'var(--shadow-xs)'
            }}>
              <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
                <path d="M18 46C18 36 28 34 32 32C36 30 46 28 46 18" stroke="#2DD4BF" strokeWidth="5.5" strokeLinecap="round" />
                <circle cx="18" cy="46" r="6" fill="#0E291E" stroke="#2DD4BF" strokeWidth="4" />
                <circle cx="32" cy="32" r="5" fill="#34D399" />
                <circle cx="46" cy="18" r="6" fill="#0E291E" stroke="#A7F3D0" strokeWidth="4" />
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1875rem', letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
                Route M8
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Nav Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="desktop-only" aria-label="Main Navigation">
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
                className={`nav-tab ${isActive ? 'active' : ''}`}
              >
                {isActive && <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)' }} />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Actions & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          
          {/* Action CTAs */}
          <button
            onClick={onOpenPublishJourney}
            className="btn btn-secondary btn-sm desktop-only"
            title="Publish your everyday commute"
          >
            <Car size={14} />
            <span>Publish Commute</span>
          </button>

          <button
            onClick={onOpenCreateRequest}
            className="btn btn-primary btn-sm desktop-only"
            title="Request an item to be delivered"
          >
            <PlusCircle size={14} />
            <span>Request Item</span>
          </button>

          {/* Infrastructure & Settings Control */}
          <button
            onClick={onOpenSupabaseConfig}
            className="icon-btn"
            aria-label="Database & Infrastructure Settings"
            title="Database & Infrastructure Settings"
          >
            <Settings size={18} />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="icon-btn"
            aria-label="Toggle Dark / Light Theme"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {/* Auth Button or User Profile Badge */}
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
                border: '1px solid var(--border-subtle)',
                transition: 'background-color var(--transition-fast)'
              }}
              title="View Dashboard Profile"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'var(--color-forest-800)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                  {user.fullName[0]}
                </div>
              )}
              <span style={{ fontSize: '0.8125rem', fontWeight: 700 }} className="desktop-only">
                {user.fullName.split(' ')[0]}
              </span>
              <span className="badge badge-brand desktop-only" style={{ padding: '0.125rem 0.375rem', fontSize: '0.625rem' }}>
                {user.trustScore}%
              </span>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn btn-secondary btn-sm"
            >
              <User size={14} />
              <span>Sign In</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
};
