import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PrivacyPolicyView } from './PrivacyPolicyView';
import { TermsOfServiceView } from './TermsOfServiceView';
import { AppProvider, useApp } from '../../context/AppContext';
import { LandingView } from '../landing/LandingView';

vi.mock('../../services/api', () => ({
  deliveriesApi: {
    getDeliveries: vi.fn().mockResolvedValue([]),
    getDelivery: vi.fn().mockResolvedValue(null),
    createDelivery: vi.fn(),
    updateStatus: vi.fn(),
  },
  journeysApi: {
    getJourneys: vi.fn().mockResolvedValue([]),
    createJourney: vi.fn(),
  },
  activitiesApi: {
    getActivities: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/socket', () => ({
  getSocket: vi.fn().mockResolvedValue({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      fullName: 'Legal Reviewer',
      role: 'requester',
      isPhoneVerified: true,
      trustScore: 90,
    },
    isAuthenticated: true,
    signOut: vi.fn(),
  }),
}));

describe('PrivacyPolicyView Component — Google OAuth & Platform Compliance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as any);
  });

  it('renders title, effective date, and key privacy principles', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getByRole('heading', { name: /Route M8 Privacy Policy/i })).toBeTruthy();
    expect(screen.getByText(/Effective Date: November 4, 2026/i)).toBeTruthy();
    expect(screen.getByText(/Privacy Commitments at a Glance/i)).toBeTruthy();
  });

  it('contains dedicated Google User Data section meeting Google OAuth Branding Verification', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/2. Google User Data & Google API Services User Data Policy Compliance/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Exact Google User Data We Access/i)).toBeTruthy();
    expect(screen.getByText(/Specific Purposes for Google User Data/i)).toBeTruthy();
    expect(screen.getByText(/Google API Services User Data Policy Compliance Statement \(Limited Use\)/i)).toBeTruthy();
    expect(screen.getByText(/do not sell, rent, or lease/i)).toBeTruthy();
  });

  it('explains collection of account information, phone numbers, delivery addresses, and PINs', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/3. Detailed Categories of Information We Collect/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/3.1 Name, Email & Phone Number/i)).toBeTruthy();
    expect(screen.getByText(/3.2 Delivery Addresses & Coordinates/i)).toBeTruthy();
    expect(screen.getByText(/3.3 Handover Verification PINs/i)).toBeTruthy();
    expect(screen.getByText(/3.4 Identity & Delivery Proof Photos/i)).toBeTruthy();
  });

  it('details Google and Firebase Authentication security protocols and token claims', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/4. Authentication & Phone Verification Protocols/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Firebase Phone Authentication:/i)).toBeTruthy();
    expect(screen.getByText(/Cryptographic Token Validation:/i)).toBeTruthy();
  });

  it('explains real-time GPS tracking lifecycle during active deliveries with exact start/stop criteria', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/5. Real-Time GPS Tracking During Active Deliveries/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/5.1 When Tracking Starts/i)).toBeTruthy();
    expect(screen.getByText(/5.2 How Coordinates are Handled/i)).toBeTruthy();
    expect(screen.getByText(/5.3 When Tracking Stops/i)).toBeTruthy();
    expect(screen.getByText(/5.4 Who Has Access & Why Needed/i)).toBeTruthy();
  });

  it('details MongoDB Atlas database architecture and Firebase data storage', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/7. MongoDB & Firebase Data Storage Architecture/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MongoDB Atlas:/i)).toBeTruthy();
    expect(screen.getByText(/Firebase Authentication:/i)).toBeTruthy();
  });

  it('details LiveKit Cloud WebRTC voice calling and Socket.IO real-time channels', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/8. LiveKit Audio & Video Calling Data/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Zero Audio\/Video Recording:/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/9. Socket.IO Real-Time Communications/i).length).toBeGreaterThan(0);
  });

  it('explains data retention periods, realistic deletion procedures, and user rights', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/12. Data Retention and Deletion Policy/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13. Data Security Measures/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14. Your Privacy Rights & Controls/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/15. Children's Privacy/i).length).toBeGreaterThan(0);
  });

  it('contains clear business and legal placeholders without invented fake credentials', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getAllByText(/\[BUSINESS_ENTITY_NAME\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[BUSINESS_ADDRESS\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[CONTACT_EMAIL\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[DATA_PROTECTION_OFFICER_EMAIL\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[RETENTION_PERIOD, e\.g\., 24 months\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[DELETION_TIMEFRAME, e\.g\., 30 days\]/i).length).toBeGreaterThan(0);
  });
});

describe('TermsOfServiceView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as any);
  });

  it('renders title, legal agreement badge, and key principles banner', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getByRole('heading', { name: /Route M8 Terms of Service/i })).toBeTruthy();
    expect(screen.getByText(/Last Revised: November 4, 2026/i)).toBeTruthy();
    expect(screen.getByText(/Key Principles at a Glance/i)).toBeTruthy();
  });

  it('explains technology intermediary role and common carrier disclaimer', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getByText(/2. Nature of Route M8 \(Technology Intermediary\)/i)).toBeTruthy();
    expect(screen.getByText(/Route M8 is not a common carrier, motor carrier, freight forwarder/i)).toBeTruthy();
  });

  it('articulates customer and delivery partner responsibilities and prohibited goods', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getByText(/4. Customer \/ Sender Responsibilities/i)).toBeTruthy();
    expect(screen.getByText(/Strictly Prohibited & Hazardous Goods/i)).toBeTruthy();
    expect(screen.getByText(/5. Delivery Partner \(Transporter\) Obligations/i)).toBeTruthy();
    expect(screen.getByText(/Driver Qualifications & Insurance/i)).toBeTruthy();
    expect(screen.getByText(/Mandatory Real-Time Location Tracking/i)).toBeTruthy();
  });

  it('defines the 4-digit handover PIN verification legal protocol', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getByText(/6. The 4-Digit Handover PIN Legal Protocol/i)).toBeTruthy();
    expect(screen.getByText(/Generation & Delivery:/i)).toBeTruthy();
    expect(screen.getByText(/Physical Verification:/i)).toBeTruthy();
    expect(screen.getByText(/Conclusive Fulfillment & Release:/i)).toBeTruthy();
  });

  it('explains LiveKit calling rules, warranty disclaimers, and limitation of liability', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getByText(/7. LiveKit Audio Communications & Code of Conduct/i)).toBeTruthy();
    expect(screen.getByText(/8. Compensation, Fees, and Cancellation/i)).toBeTruthy();
    expect(screen.getByText(/9. Disclaimers of Warranties/i)).toBeTruthy();
    expect(screen.getByText(/10. Limitation of Liability & Indemnification/i)).toBeTruthy();
  });

  it('contains legal placeholders for entity, jurisdiction, arbitration forum and emails', () => {
    render(
      <AppProvider>
        <TermsOfServiceView />
      </AppProvider>
    );

    expect(screen.getAllByText(/\[BUSINESS_ENTITY_NAME\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[BUSINESS_ADDRESS\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[LEGAL_EMAIL\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[CONTACT_EMAIL\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[JURISDICTION\]/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\[ARBITRATION_FORUM\]/i).length).toBeGreaterThan(0);
  });
});

describe('Navigation and URL routing integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '[]',
    } as any);
  });

  const LocationTestHarness: React.FC = () => {
    const { currentView, setCurrentView } = useApp();
    return (
      <div>
        <div data-testid="current-view">{currentView}</div>
        <button onClick={() => setCurrentView('privacy')}>Go Privacy</button>
        <button onClick={() => setCurrentView('terms')}>Go Terms</button>
        <button onClick={() => setCurrentView('landing')}>Go Landing</button>
      </div>
    );
  };

  it('initializes from window.location.pathname /privacy-policy', () => {
    window.history.replaceState({}, '', '/privacy-policy');
    render(
      <AppProvider>
        <LocationTestHarness />
      </AppProvider>
    );
    expect(screen.getByTestId('current-view').textContent).toBe('privacy');
  });

  it('initializes from window.location.pathname /terms', () => {
    window.history.replaceState({}, '', '/terms');
    render(
      <AppProvider>
        <LocationTestHarness />
      </AppProvider>
    );
    expect(screen.getByTestId('current-view').textContent).toBe('terms');
  });

  it('updates window.history when setCurrentView changes view', () => {
    window.history.replaceState({}, '', '/');
    render(
      <AppProvider>
        <LocationTestHarness />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('Go Privacy'));
    expect(screen.getByTestId('current-view').textContent).toBe('privacy');
    expect(window.location.pathname).toBe('/privacy-policy');

    fireEvent.click(screen.getByText('Go Terms'));
    expect(screen.getByTestId('current-view').textContent).toBe('terms');
    expect(window.location.pathname).toBe('/terms');

    fireEvent.click(screen.getByText('Go Landing'));
    expect(screen.getByTestId('current-view').textContent).toBe('landing');
    expect(window.location.pathname).toBe('/');
  });

  it('LandingView footer allows clicking Privacy Policy and Terms of Service', () => {
    const TestLandingHarness: React.FC = () => {
      const { currentView } = useApp();
      return (
        <div>
          <div data-testid="active-landing-view">{currentView}</div>
          <LandingView
            onOpenCreateRequest={vi.fn()}
            onOpenPublishJourney={vi.fn()}
            onGoToDashboard={vi.fn()}
            onOpenAuth={vi.fn()}
          />
        </div>
      );
    };

    render(
      <AppProvider>
        <TestLandingHarness />
      </AppProvider>
    );

    const privacyLink = screen.getByRole('link', { name: /Privacy Policy/i });
    fireEvent.click(privacyLink);
    expect(screen.getByTestId('active-landing-view').textContent).toBe('privacy');
  });
});
