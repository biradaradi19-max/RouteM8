import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/dashboard/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { MatchingView } from './components/matching/MatchingView';
import { DeliveriesView } from './components/deliveries/DeliveriesView';
import { LandingView } from './components/landing/LandingView';
import { CreateRequestModal } from './components/forms/CreateRequestModal';
import { PublishJourneyModal } from './components/forms/PublishJourneyModal';
import { AuthModal } from './components/auth/AuthModal';
import { SupabaseConfigModal } from './components/forms/SupabaseConfigModal';
import type { DeliveryRequest, PublishedJourney } from './types';


const MainAppContent: React.FC = () => {
  const { currentView, setCurrentView, selectRequestAndJourney } = useApp();

  // Modal Visibility States
  const [isCreateReqOpen, setIsCreateReqOpen] = useState(false);
  const [isPublishJrnOpen, setIsPublishJrnOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Inspector callback: user clicks "Inspect Route" from Dashboard
  const handleInspectMatch = (req: DeliveryRequest, journey?: PublishedJourney) => {
    if (journey) {
      selectRequestAndJourney(req, journey);
    }
    setCurrentView('matching');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        onOpenCreateRequest={() => setIsCreateReqOpen(true)}
        onOpenPublishJourney={() => setIsPublishJrnOpen(true)}
        onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onToggleMobileMenu={() => setIsMobileSidebarOpen(prev => !prev)}
      />

      {/* Primary Content View Switcher */}
      {currentView === 'landing' ? (
        <main style={{ flex: 1 }}>
          <LandingView
            onOpenCreateRequest={() => setIsCreateReqOpen(true)}
            onOpenPublishJourney={() => setIsPublishJrnOpen(true)}
            onGoToDashboard={() => setCurrentView('dashboard')}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        </main>
      ) : (
        <div style={{ display: 'flex', flex: 1, minHeight: 'calc(100vh - var(--header-height))' }}>
          {/* Dashboard Left Sidebar */}
          <div className="desktop-only">
            <Sidebar
              onOpenCreateRequest={() => setIsCreateReqOpen(true)}
              onOpenPublishJourney={() => setIsPublishJrnOpen(true)}
              onOpenSupabaseConfig={() => setIsSupabaseModalOpen(true)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </div>

          {/* Mobile Drawer Sidebar */}
          {isMobileSidebarOpen && (
            <div className="mobile-only" style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
              <Sidebar
                onOpenCreateRequest={() => { setIsCreateReqOpen(true); setIsMobileSidebarOpen(false); }}
                onOpenPublishJourney={() => { setIsPublishJrnOpen(true); setIsMobileSidebarOpen(false); }}
                onOpenSupabaseConfig={() => { setIsSupabaseModalOpen(true); setIsMobileSidebarOpen(false); }}
                onOpenAuth={() => { setIsAuthModalOpen(true); setIsMobileSidebarOpen(false); }}
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
              />
            </div>
          )}

          {/* Main App Content Panes */}
          <main style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)' }}>
            {currentView === 'dashboard' && (
              <DashboardView
                onOpenCreateRequest={() => setIsCreateReqOpen(true)}
                onOpenPublishJourney={() => setIsPublishJrnOpen(true)}
                onInspectMatch={handleInspectMatch}
              />
            )}

            {currentView === 'matching' && <MatchingView />}

            {currentView === 'deliveries' && (
              <DeliveriesView
                onOpenCreateRequest={() => setIsCreateReqOpen(true)}
              />
            )}
          </main>
        </div>
      )}

      {/* Global Interactive Modals */}
      <CreateRequestModal
        isOpen={isCreateReqOpen}
        onClose={() => setIsCreateReqOpen(false)}
      />

      <PublishJourneyModal
        isOpen={isPublishJrnOpen}
        onClose={() => setIsPublishJrnOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <SupabaseConfigModal
        isOpen={isSupabaseModalOpen}
        onClose={() => setIsSupabaseModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainAppContent />
      </AppProvider>
    </AuthProvider>
  );
}
