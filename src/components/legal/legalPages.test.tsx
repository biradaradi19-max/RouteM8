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

describe('PrivacyPolicyView Component', () => {
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
    expect(screen.getByText(/Effective Date: November 2, 2026/i)).toBeTruthy();
    expect(screen.getByText(/We do not sell your personal data or continuous location histories/i)).toBeTruthy();
  });

  it('explains collection of account information, phone numbers, and delivery addresses', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getByText(/Account & Profile Information/i)).toBeTruthy();
    expect(screen.getByText(/Phone Numbers & Verification/i)).toBeTruthy();
    expect(screen.getByText(/Delivery Addresses & Coordinates/i)).toBeTruthy();
    expect(screen.getByText(/Handover Verification PINs/i)).toBeTruthy();
  });

  it('explains real-time GPS tracking lifecycle during active deliveries', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getByText(/2. Real-Time GPS Tracking & Geolocation Flow/i)).toBeTruthy();
    expect(screen.getByText(/Active Delivery Lifecycle Only/i)).toBeTruthy();
    expect(screen.getByText(/High-Accuracy GPS & Zero Synthetic Fallbacks/i)).toBeTruthy();
    expect(screen.getByText(/Immediate Tracking Teardown/i)).toBeTruthy();
  });

  it('details Google and Firebase Authentication security protocols', () => {
    render(
      <AppProvider>
        <PrivacyPolicyView />
      </AppProvider>
    );

    expect(screen.getByText(/3. Google & Firebase Authentication/i)).toBeTruthy();
    expect(screen.getByText(/Phone Authentication \(Spark & Blaze Tiers\):/i)).toBeTruthy();
    expect(screen.getByText(/Google Identity Services:/i)).toBeTruthy();
    expect(screen.getByText(/4. LiveKit Cloud Audio & Video Calls/i)).toBeTruthy();
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
    expect(screen.getByText(/Last Revised: November 2, 2026/i)).toBeTruthy();
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

    const privacyBtn = screen.getByRole('button', { name: /Privacy Policy/i });
    fireEvent.click(privacyBtn);
    expect(screen.getByTestId('active-landing-view').textContent).toBe('privacy');
  });
});
