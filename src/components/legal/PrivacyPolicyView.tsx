// ============================================================================
// ROUTE M8 — PRIVACY POLICY VIEW
// Comprehensive, responsive Privacy Policy meeting Google OAuth Branding
// Verification standards, detailing Google User Data handling, real-time GPS
// tracking lifecycles, MongoDB/Firebase storage, LiveKit WebRTC, and user rights.
// ============================================================================

import React, { useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  MapPin,
  UserCheck,
  Eye,
  Trash2,
  FileText,
  ArrowLeft,
  Building,
  CheckCircle2,
  Radio,
  Clock,
  Key,
  Server,
  PhoneCall,
  Share2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PrivacyPolicyView: React.FC = () => {
  const { setCurrentView } = useApp();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleNav = (e: React.MouseEvent, view: 'landing' | 'privacy' | 'terms' | 'dashboard') => {
    e.preventDefault();
    setCurrentView(view);
  };

  const scrollToSection = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    const elem = document.getElementById(sectionId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-app)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      {/* Top Breadcrumb & Hero Header */}
      <section
        style={{
          borderBottom: '1px solid var(--border-medium)',
          backgroundColor: 'var(--bg-surface)',
          paddingTop: '2.5rem',
          paddingBottom: '2.5rem',
          position: 'relative',
        }}
      >
        <div className="container" style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.25rem' }}>
          <a
            href="/"
            onClick={(e) => handleNav(e, 'landing')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--color-mint-600, #059669)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '1.25rem',
              padding: 0,
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Route M8</span>
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0.25rem 0.625rem',
                borderRadius: 'var(--radius-full, 9999px)',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--color-mint-600, #059669)',
              }}
            >
              <ShieldCheck size={14} /> Official Privacy Policy
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Effective Date: November 4, 2026
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Version 2.0 (Google OAuth & Platform Compliance)
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display, Outfit, sans-serif)',
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              fontWeight: 800,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
              margin: '0 0 0.75rem 0',
            }}
          >
            Route M8 Privacy Policy
          </h1>
          <p
            style={{
              fontSize: '1.0625rem',
              color: 'var(--text-secondary)',
              maxWidth: '780px',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            This Privacy Policy explains how Route M8 collects, uses, stores, shares, and protects your personal information,
            Google User Data, telephone numbers, delivery addresses, and real-time GPS locations across our peer-to-peer delivery
            matching and tracking platform.
          </p>
        </div>
      </section>

      {/* Main Content Body */}
      <div className="container" style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem' }}>

          {/* Quick Summary Callout Banner */}
          <div
            className="card-elevated"
            style={{
              padding: '1.5rem',
              borderRadius: 'var(--radius-xl, 1rem)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderLeft: '4px solid var(--color-mint-500, #10B981)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Privacy Commitments at a Glance
            </h3>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <li>
                <strong>Publicly Accessible:</strong> This policy is accessible to all individuals without requiring registration or sign-in.
              </li>
              <li>
                <strong>Google User Data Protection:</strong> We use Google Sign-In strictly to authenticate your account and display your profile identity to counterparties in confirmed delivery matches. We <strong>do not sell</strong> Google user data, nor do we use it for advertising.
              </li>
              <li>
                <strong>Active GPS Tracking Only:</strong> Geolocation tracking occurs <strong>only</strong> while a delivery partner is carrying an active package in status <code>matched</code> or <code>in_transit</code>. Location broadcasting terminates upon 4-digit PIN verification.
              </li>
              <li>
                <strong>Zero Audio/Video Recording:</strong> LiveKit voice and video calling feeds operate over live WebRTC channels for delivery coordination and are never recorded, wiretapped, or stored.
              </li>
              <li>
                <strong>Transparent Storage:</strong> Data is stored in secure MongoDB Atlas and Firebase environments. We do not claim data is purged unless an account or data deletion request is fulfilled.
              </li>
            </ul>
          </div>

          {/* Table of Contents / Quick Jump */}
          <nav
            aria-label="Table of Contents"
            style={{
              padding: '1.25rem 1.5rem',
              borderRadius: 'var(--radius-lg, 0.75rem)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
            }}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
              Table of Contents
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.5rem 1.5rem',
                fontSize: '0.875rem',
              }}
            >
              <a href="#section-1" onClick={(e) => scrollToSection(e, 'section-1')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>1. Introduction & Overview</a>
              <a href="#section-2" onClick={(e) => scrollToSection(e, 'section-2')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>2. Google User Data & OAuth</a>
              <a href="#section-3" onClick={(e) => scrollToSection(e, 'section-3')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>3. Information We Collect</a>
              <a href="#section-4" onClick={(e) => scrollToSection(e, 'section-4')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>4. Authentication & Phone Verification</a>
              <a href="#section-5" onClick={(e) => scrollToSection(e, 'section-5')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>5. Real-Time GPS Location Tracking</a>
              <a href="#section-6" onClick={(e) => scrollToSection(e, 'section-6')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>6. Customer & Partner Info Sharing</a>
              <a href="#section-7" onClick={(e) => scrollToSection(e, 'section-7')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>7. MongoDB & Firebase Data Storage</a>
              <a href="#section-8" onClick={(e) => scrollToSection(e, 'section-8')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>8. LiveKit Audio & Video Calling</a>
              <a href="#section-9" onClick={(e) => scrollToSection(e, 'section-9')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>9. Socket.IO Communications</a>
              <a href="#section-10" onClick={(e) => scrollToSection(e, 'section-10')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>10. How Information is Used</a>
              <a href="#section-11" onClick={(e) => scrollToSection(e, 'section-11')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>11. Data Sharing & Third Parties</a>
              <a href="#section-12" onClick={(e) => scrollToSection(e, 'section-12')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>12. Data Retention and Deletion</a>
              <a href="#section-13" onClick={(e) => scrollToSection(e, 'section-13')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>13. Security Measures</a>
              <a href="#section-14" onClick={(e) => scrollToSection(e, 'section-14')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>14. User Privacy Rights</a>
              <a href="#section-15" onClick={(e) => scrollToSection(e, 'section-15')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>15. Children&apos;s Privacy</a>
              <a href="#section-16" onClick={(e) => scrollToSection(e, 'section-16')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>16. Policy Updates</a>
              <a href="#section-17" onClick={(e) => scrollToSection(e, 'section-17')} style={{ color: 'var(--color-mint-600, #059669)', textDecoration: 'none' }}>17. Contact & Inquiries</a>
            </div>
          </nav>

          {/* SECTION 1: Introduction & Overview */}
          <section id="section-1" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <FileText size={22} color="var(--color-mint-600, #059669)" /> 1. Introduction & Overview of Route M8
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 (&quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is an individually operated peer-to-peer delivery and real-time tracking platform managed and operated by <strong>Aditya Biradar</strong>, based in India. Route M8 matches individuals needing local package transport
              (&quot;Requesters&quot; or &quot;Customers&quot;) with everyday commuters and travelers already traveling along compatible
              road corridors (&quot;Transporters&quot; or &quot;Delivery Partners&quot;).
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              This Privacy Policy applies to your interaction with our web application deployed at{' '}
              <code>https://route-m8.vercel.app</code>, our backend APIs, Socket.IO communication servers, and related digital services.
              This page is publicly accessible to all visitors at all times without requiring authentication.
            </p>
          </section>

          {/* SECTION 2: Google User Data & Google OAuth Verification */}
          <section
            id="section-2"
            style={{
              padding: '1.75rem',
              borderRadius: 'var(--radius-xl, 1rem)',
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Lock size={24} color="var(--color-mint-600, #059669)" />
              <h2
                style={{
                  fontFamily: 'var(--font-display, Outfit, sans-serif)',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                2. Google User Data & Google API Services User Data Policy Compliance
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 offers Google Sign-In as an authentication option powered by Google Identity Services and Firebase Authentication.
              We take the privacy of information received from Google APIs seriously and adhere strictly to Google&apos;s verification standards:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <UserCheck size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Exact Google User Data We Access</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  When you sign in using Google, we access only the basic profile data provided by Google OAuth:
                </p>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', marginTop: '0.375rem' }}>
                  <li><strong>Full Name:</strong> Your Google account display name.</li>
                  <li><strong>Email Address:</strong> Your primary verified Google email address.</li>
                  <li><strong>Profile Photo URL:</strong> The public avatar image associated with your Google profile.</li>
                  <li><strong>Google User ID:</strong> The unique alphanumeric identifier (UID / sub) assigned by Google.</li>
                </ul>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <CheckCircle2 size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Specific Purposes for Google User Data</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  We use the information received from Google APIs solely for the following functional purposes:
                </p>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', marginTop: '0.375rem' }}>
                  <li><strong>Account Provisioning & Authentication:</strong> To create and authenticate your Route M8 profile without requiring a separate password.</li>
                  <li><strong>Displaying Identity to Counterparties:</strong> Displaying your verified name and avatar to the sender or delivery partner during an active delivery match so participants can identify each other.</li>
                  <li><strong>Transactional Notifications:</strong> Sending essential delivery confirmations, status updates, and security alerts to your verified email.</li>
                  <li><strong>Account Integrity:</strong> Preventing fraudulent duplicate registrations and maintaining trust scores.</li>
                </ul>
              </div>
            </div>

            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                backgroundColor: 'rgba(5, 150, 105, 0.05)',
                border: '1px solid rgba(5, 150, 105, 0.25)',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Google API Services User Data Policy Compliance Statement (Limited Use)
              </h4>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Route M8&apos;s use and transfer to any other app of information received from Google APIs adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-mint-600, #059669)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Specifically:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li>We <strong>do not sell, rent, or lease</strong> Google User Data to third-party data brokers, marketers, or advertisers.</li>
                <li>We <strong>do not use or transfer</strong> Google User Data for serving advertisements, including personalized, retargeted, or interest-based advertising.</li>
                <li>We <strong>do not use</strong> Google User Data to train or fine-tune generalized artificial intelligence (AI) or machine learning (ML) models.</li>
                <li>We only share Google User Data with third-party service providers (such as MongoDB Atlas and Firebase) that are strictly necessary to operate our service and who are contractually bound to confidentiality and security obligations.</li>
                <li>Human review of Google User Data is strictly prohibited unless required to resolve security issues, troubleshoot explicit bugs with your consent, or comply with applicable legal obligations.</li>
              </ul>
            </div>
          </section>

          {/* SECTION 3: Information We Collect */}
          <section id="section-3" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <UserCheck size={22} color="var(--color-mint-600, #059669)" /> 3. Detailed Categories of Information We Collect
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Depending on how you use Route M8 (as a Customer/Requester or Delivery Partner/Transporter), we collect the following categories of data:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <UserCheck size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>3.1 Name, Email & Phone Number</strong>
                </div>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', margin: 0 }}>
                  <li><strong>Full Name:</strong> Required to identify participants and coordinate physical handovers.</li>
                  <li><strong>Email Address:</strong> Used for account identity, system notifications, and password reset requests.</li>
                  <li><strong>Telephone Number:</strong> Collected via Firebase Phone Authentication to verify caller identity, prevent fraudulent multi-accounting, and authorize participation in encrypted LiveKit audio call rooms.</li>
                  <li><strong>Optional Profile Details:</strong> Username, campus/workplace affiliation, bio, and delivery vehicle description.</li>
                </ul>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <MapPin size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>3.2 Delivery Addresses & Coordinates</strong>
                </div>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', margin: 0 }}>
                  <li><strong>Pickup and Dropoff Addresses:</strong> Physical street addresses, building names, or landmarks entered by customers.</li>
                  <li><strong>Geocoded Coordinates:</strong> Exact latitude and longitude coordinates derived from address entries via Google Places API autocomplete.</li>
                  <li><strong>Package Information:</strong> Parcel title, description, size classification (Small, Medium, Large), estimated weight, needed-by deadline, and agreed compensation amount.</li>
                </ul>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Key size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>3.3 Handover Verification PINs</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  When a delivery request is created, Route M8 server generates a secure 4-digit confirmation PIN.
                  This PIN is disclosed solely to the customer/recipient. The delivery partner cannot complete the delivery
                  or release compensation without physically receiving this code from the recipient upon inspection of the parcel.
                </p>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <CameraIcon size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>3.4 Identity & Delivery Proof Photos</strong>
                </div>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', margin: 0 }}>
                  <li><strong>Delivery Proof Photo:</strong> Optional parcel handover snapshot captured upon arrival to document physical delivery condition.</li>
                  <li><strong>Partner Verification Selfie:</strong> Delivery partners may submit a camera snapshot with explicit in-app consent for identity and fraud-prevention review (managed through <code>/api/auth/partner-verification/selfie</code>).</li>
                </ul>
              </div>
            </div>
          </section>

          {/* SECTION 4: Authentication & Phone Verification Protocols */}
          <section id="section-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Lock size={22} color="var(--color-mint-600, #059669)" /> 4. Authentication & Phone Verification Protocols
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 relies on Firebase Authentication (a Google Cloud Platform service) to provide secure identity management:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Google Sign-In:</strong> OAuth 2.0 authentication conducted via client-side popups. We never receive or store your Google account password.
              </li>
              <li>
                <strong>Email/Password Sign-In:</strong> Passwords are cryptographically salted and hashed using Firebase Auth before storage. Route M8 staff cannot access plaintext passwords.
              </li>
              <li>
                <strong>Firebase Phone Authentication:</strong> Phone numbers are confirmed through SMS one-time passcode (OTP) verification and Google reCAPTCHA. Phone verification certifies user trust, deters spammers, and unlocks access to LiveKit audio calling rooms.
              </li>
              <li>
                <strong>Cryptographic Token Validation:</strong> Authenticated sessions issue JSON Web Tokens (JWT) signed by Google/Firebase. Every protected API request validates these token claims on our backend before returning data.
              </li>
            </ul>
          </section>

          {/* SECTION 5: Real-Time GPS Location Tracking */}
          <section
            id="section-5"
            style={{
              padding: '1.75rem',
              borderRadius: 'var(--radius-xl, 1rem)',
              backgroundColor: 'var(--bg-surface)',
              border: '2px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Radio size={24} color="var(--color-mint-600, #059669)" />
              <h2
                style={{
                  fontFamily: 'var(--font-display, Outfit, sans-serif)',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                5. Real-Time GPS Tracking During Active Deliveries
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Live GPS location tracking is essential to calculate dynamic detours, display live maps, and ensure package safety.
              Below is the exact technical lifecycle governing location tracking in Route M8:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Clock size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>5.1 When Tracking Starts</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Location tracking begins <strong>only</strong> after a delivery partner explicitly accepts a delivery and the delivery status is changed to <code>matched</code> or <code>in_transit</code>.
                  Route M8 does <strong>not</strong> track your device in the background when the application is closed or when no active delivery is in progress.
                </p>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <MapPin size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>5.2 How Coordinates are Handled</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  The delivery partner&apos;s device accesses location using browser <code>navigator.geolocation.watchPosition</code> with <code>enableHighAccuracy: true</code>.
                  Coordinates (latitude, longitude, heading, speed, accuracy, timestamp) are transmitted via Socket.IO (event <code>location:update</code>) and HTTPS to the Route M8 server.
                  Updates are recorded in the MongoDB <code>Location</code> collection and updated on the delivery document&apos;s <code>lastKnownLocation</code> field.
                </p>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <CheckCircle2 size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>5.3 When Tracking Stops</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Location tracking ceases <strong>immediately</strong> when the delivery status transitions to <code>completed</code> (triggered by verified 4-digit PIN entry) or <code>cancelled</code>.
                  At that moment, the server rejects new coordinate updates for that delivery (<code>400 Bad Request</code>), the client clears the geolocation watcher (<code>clearWatch</code>), and live broadcasts stop.
                </p>
              </div>

              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Eye size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>5.4 Who Has Access & Why Needed</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  <strong>Who can access:</strong> Only the customer who created the delivery and the assigned delivery partner who joined the authenticated delivery room (<code>delivery:[id]</code>) can view live coordinates.
                  <br />
                  <strong>Why needed:</strong> To calculate accurate road ETAs, ensure passenger and cargo accountability, and enable recipients to meet transporters at curbside without delays.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 6: Customer and Delivery Partner Information Sharing */}
          <section id="section-6" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Share2 size={22} color="var(--color-mint-600, #059669)" /> 6. Customer & Delivery Partner Information Sharing
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Because Route M8 is a collaborative peer-to-peer platform, matched counterparties exchange limited necessary information:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>What Customers See About Partners:</strong>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', margin: 0 }}>
                  <li>Transporter full name and profile avatar.</li>
                  <li>Vehicle description (e.g., make, model, color).</li>
                  <li>Community trust score and ratings.</li>
                  <li>Real-time GPS coordinates while delivery is active.</li>
                </ul>
              </div>
              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>What Partners See About Customers:</strong>
                <ul style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '1.25rem', margin: 0 }}>
                  <li>Customer full name and profile avatar.</li>
                  <li>Pickup and dropoff street addresses and coordinates.</li>
                  <li>Package description, dimensions, urgency, and compensation.</li>
                  <li>The 4-digit PIN is <strong>hidden</strong> from the partner until verbally provided by recipient.</li>
                </ul>
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.875rem', margin: 0 }}>
              <strong>Phone Number Privacy:</strong> We do not publicly display telephone numbers to counterparties on the screen. Direct voice communication is facilitated through our in-app LiveKit call rooms.
            </p>
          </section>

          {/* SECTION 7: MongoDB & Firebase Data Storage Architecture */}
          <section id="section-7" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Server size={22} color="var(--color-mint-600, #059669)" /> 7. MongoDB & Firebase Data Storage Architecture
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 operates on modern, managed cloud database infrastructure:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>MongoDB Atlas:</strong> Our primary operational database. It stores the <code>User</code> collection (names, emails, avatars, ratings, vehicle details), <code>DeliveryRequest</code> collection (addresses, coordinates, package specs, status), <code>Journey</code> collection (commuter routes, departure times), <code>Location</code> collection (time-stamped GPS coordinate breadcrumbs), and <code>Activity</code> logs. Access is restricted via database authentication and IP allowlisting.
              </li>
              <li>
                <strong>Firebase Authentication:</strong> Houses user authentication credentials, Google OAuth tokens, and SMS verification records. Managed entirely within Google Cloud infrastructure.
              </li>
              <li>
                <strong>Firestore (Secondary Resilience):</strong> Synchronizes user profiles and location snapshots as a secondary persistence layer to ensure high availability.
              </li>
              <li>
                <strong>In-Memory Caches:</strong> Temporary server memory caches active socket connections and dispatch candidates to ensure sub-second response times.
              </li>
            </ul>
          </section>

          {/* SECTION 8: LiveKit Audio & Video Calling Data */}
          <section id="section-8" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <PhoneCall size={22} color="var(--color-mint-600, #059669)" /> 8. LiveKit Audio & Video Calling Data
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 includes in-app audio and video calling powered by LiveKit Cloud to allow delivery participants to coordinate arrival details:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Ephemeral Access Tokens:</strong> Tokens are minted by Route M8 server (<code>/api/livekit/token</code>) exclusively for verified participants in an active delivery who hold a verified phone number claim.
              </li>
              <li>
                <strong>Room Isolation:</strong> Call rooms are strictly partitioned per delivery (<code>delivery-[id]</code>). Only the authorized requester and assigned transporter can join.
              </li>
              <li>
                <strong>Zero Audio/Video Recording:</strong> LiveKit media streams are peer-to-cloud WebRTC connections for live coordination only. Route M8 does <strong>not</strong> record, transcribe, wiretap, or store audio or video conversations.
              </li>
              <li>
                <strong>Hardware Disengagement:</strong> Microphone and camera hardware permissions are released immediately when a participant hangs up or leaves the room.
              </li>
            </ul>
          </section>

          {/* SECTION 9: Socket.IO Real-Time Communications */}
          <section id="section-9" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Radio size={22} color="var(--color-mint-600, #059669)" /> 9. Socket.IO Real-Time Communications
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Real-time events (location broadcasts, status changes, matching opportunities) are transmitted through our Socket.IO WebSocket server:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li><strong>Token Authentication:</strong> All WebSocket handshakes require a verified Firebase ID token. Unauthenticated connections are rejected.</li>
              <li><strong>Room Scoping:</strong> Socket clients join strictly authorized rooms (<code>partner:[uid]</code> for dispatch notifications; <code>delivery:[id]</code> for live delivery coordinates).</li>
              <li><strong>Rate Limiting:</strong> Transporter location updates are throttled (maximum 1 update every 800ms) to prevent server flooding and preserve mobile device battery life.</li>
            </ul>
          </section>

          {/* SECTION 10: How Information is Used */}
          <section id="section-10" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <CheckCircle2 size={22} color="var(--color-mint-600, #059669)" /> 10. How Information is Used (Purposes of Processing)
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We process collected personal data only for legitimate business and operational purposes:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li><strong>Routing & Matching:</strong> Analyzing published travel journeys and pickup/dropoff coordinates to calculate detour minutes and recommend optimal delivery matches.</li>
              <li><strong>Navigation & ETA:</strong> Snapping coordinates to road geometry using Open Source Routing Machine (OSRM) and Google Places to provide turn-by-turn routes and accurate arrival estimates.</li>
              <li><strong>Handover Verification:</strong> Verifying delivery fulfillment through our 4-digit PIN protocol.</li>
              <li><strong>Account Security:</strong> Validating phone numbers, authenticating logins, and preventing fraud.</li>
              <li><strong>Service Communications:</strong> Notifying you when your package has been accepted, picked up, or completed.</li>
              <li><strong>Legal Compliance:</strong> Complying with tax, accounting, and lawful governmental reporting obligations.</li>
            </ul>
          </section>

          {/* SECTION 11: Data Sharing & Third-Party Service Providers */}
          <section id="section-11" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Share2 size={22} color="var(--color-mint-600, #059669)" /> 11. Data Sharing & Third-Party Service Providers
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 does <strong>not</strong> sell, rent, monetize, or trade any personal data, location data, or Google user data.
              We share data only with the following trusted third-party service providers who assist in operating our platform:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Google Cloud & Firebase</strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.25rem 0 0 0' }}>
                  Provides user identity authentication, Google Sign-In verification, SMS phone verification, reCAPTCHA anti-bot protection, and Google Places API autocomplete for address lookups.
                </p>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>MongoDB Atlas</strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.25rem 0 0 0' }}>
                  Cloud database infrastructure provider hosting our operational MongoDB database cluster. Data is stored in secure, access-controlled data centers with encrypted storage volumes.
                </p>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>LiveKit Cloud</strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.25rem 0 0 0' }}>
                  WebRTC cloud infrastructure that routes transient audio and video media streams for in-app calls between delivery participants. No call audio is stored or recorded.
                </p>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg, 0.75rem)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Vercel Inc.</strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.25rem 0 0 0' }}>
                  Edge hosting provider delivering the web application frontend assets, SSL certificates, and serverless routing.
                </p>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.875rem', margin: 0 }}>
              <strong>Legal Disclosures:</strong> We may disclose personal data if required to do so by law, subpoena, or in good-faith belief that such action is necessary to comply with valid legal process or protect personal physical safety in emergencies.
            </p>
          </section>

          {/* SECTION 12: Data Retention and Deletion */}
          <section id="section-12" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Trash2 size={22} color="var(--color-mint-600, #059669)" /> 12. Data Retention and Deletion Policy
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 discloses its actual current data retention and deletion practices:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>No Automated TTL Expiration:</strong> Route M8&apos;s MongoDB databases and Firebase Authentication services do not currently utilize automated Time-To-Live (TTL) expiration indexes or automated purging scripts.
              </li>
              <li>
                <strong>Persistent Storage:</strong> Account profile information, completed delivery records (addresses, package descriptions, compensation records, and 4-digit PIN verification receipts), and historical GPS location breadcrumbs in MongoDB persist in database storage until manually reviewed and deleted.
              </li>
              <li>
                <strong>Manual Account & Data Deletion Requests:</strong> Users can request the deletion of their account, Google profile information, delivery history, and associated location records by contacting the operator at <code>biradaradi19@gmail.com</code>.
              </li>
              <li>
                <strong>Manual Processing & Review:</strong> All deletion requests are manually reviewed and processed by the platform operator. Because deletion requires manual administrative verification and database purging across MongoDB and Firebase Authentication, no fixed automated deletion timeframe is currently promised.
              </li>
              <li>
                <strong>Exceptions & Legal Retention:</strong> While the operator endeavors to fulfill verified user deletion requests, certain transaction records, security logs, or delivery receipts may need to be retained where required by applicable law, statutory dispute resolution, or legitimate platform security purposes. We do not claim that all data is automatically deleted or that every deletion request can always be fulfilled where conflicting legal retention requirements apply.
              </li>
            </ul>
          </section>

          {/* SECTION 13: Security Measures */}
          <section id="section-13" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Lock size={22} color="var(--color-mint-600, #059669)" /> 13. Data Security Measures
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We implement comprehensive technical and organizational safeguards:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li><strong>Encryption in Transit:</strong> All communication between your device and Route M8 servers is encrypted in transit using Transport Layer Security (TLS 1.3 / HTTPS).</li>
              <li><strong>Token-Based Access Control:</strong> Backend API routes and WebSocket connections require cryptographically verified Firebase ID tokens.</li>
              <li><strong>Handover PIN Secrecy:</strong> Plaintext handover PINs are stored securely and never returned by the API to anyone other than the creating customer.</li>
              <li><strong>Database Protection:</strong> MongoDB Atlas access is protected by strong passwords and restricted network access controls.</li>
              <li><strong>Realistic Security Notice:</strong> While we employ rigorous commercial security controls, no internet transmission or electronic storage method can guarantee absolute security. Users are responsible for safeguarding their login credentials.</li>
            </ul>
          </section>

          {/* SECTION 14: User Privacy Rights */}
          <section id="section-14" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Eye size={22} color="var(--color-mint-600, #059669)" /> 14. Your Privacy Rights & Controls
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Depending on your location, you hold privacy rights regarding your personal information:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Access & Portability:</strong> You can review your profile, delivery history, and active routes in your Dashboard. You can request an export of your personal data by contacting <code>biradaradi19@gmail.com</code>.
              </li>
              <li>
                <strong>Correction & Updates:</strong> You may edit your full name, username, bio, commute vehicle, and profile details anytime in the app settings.
              </li>
              <li>
                <strong>Revoke Location Permissions:</strong> You can revoke device geolocation permissions at any time via your browser or mobile settings. Note that delivery partners must have location enabled to receive matched transit requests.
              </li>
              <li>
                <strong>Account Deletion:</strong> You have the right to request deletion of your account and personal data by contacting <code>biradaradi19@gmail.com</code>.
              </li>
            </ul>
          </section>

          {/* SECTION 15: Children's Privacy */}
          <section id="section-15" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <AlertTriangle size={22} color="var(--color-mint-600, #059669)" /> 15. Children&apos;s Privacy
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 is strictly designed and intended for individuals aged 18 years and older (or the legal age of majority in your jurisdiction).
              We do not knowingly solicit, collect, or process personal data from children under the age of 13 (or under 18).
              If we discover that a child has created an account or provided personal data, we will immediately delete that information and terminate the account.
              If you believe a child has provided us with personal data, please contact us immediately at <code>biradaradi19@gmail.com</code>.
            </p>
          </section>

          {/* SECTION 16: Policy Updates */}
          <section id="section-16" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                margin: 0,
              }}
            >
              <Clock size={22} color="var(--color-mint-600, #059669)" /> 16. Policy Updates & Notifications
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We may update this Privacy Policy from time to time to reflect operational, technological, or legal developments.
              When updates are made, we will revise the &quot;Effective Date&quot; at the top of this page.
              For material changes, we will provide prominent notice via in-app banners or notification to your registered email address.
              Your continued use of Route M8 following notification constitutes acknowledgement of the updated policy.
            </p>
          </section>

          {/* SECTION 17: Contact Information & Legal Entities */}
          <section
            id="section-17"
            style={{
              padding: '1.75rem',
              borderRadius: 'var(--radius-xl, 1rem)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display, Outfit, sans-serif)',
                fontSize: '1.375rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Building size={20} color="var(--color-mint-600, #059669)" /> 17. Contact Information & Privacy Enquiries
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              If you have any questions, concerns, requests to exercise your privacy rights, or inquiries regarding our Google OAuth data practices, please contact us:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              <div><strong>Platform Structure:</strong> Individually operated platform</div>
              <div><strong>Operator:</strong> Aditya Biradar</div>
              <div><strong>Operating Jurisdiction:</strong> India</div>
              <div><strong>Physical Address:</strong> A public physical address is not published to protect residential privacy. All official, privacy, and support correspondence should be directed to the verified email addresses below.</div>
              <div><strong>Privacy & Support Contact:</strong> biradaradi19@gmail.com</div>
              <div><strong>Legal & Official Notices:</strong> biradaradi19@gmail.com (Monitored for official and legal notices)</div>
              <div><strong>Privacy & Grievance Contact:</strong> biradaradi19@gmail.com (Designated point of contact for privacy matters and statutory grievances in India, subject to legal review)</div>
            </div>
          </section>

        </div>
      </div>

      {/* Footer Navigation */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          padding: '2.5rem 0',
        }}
      >
        <div
          className="container"
          style={{
            maxWidth: '960px',
            margin: '0 auto',
            padding: '0 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div>© 2026 Route M8 Technologies Inc. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <a
              href="/"
              onClick={(e) => handleNav(e, 'landing')}
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              Home
            </a>
            <a
              href="/privacy-policy"
              onClick={(e) => handleNav(e, 'privacy')}
              style={{ color: 'var(--color-mint-600, #059669)', fontWeight: 600, textDecoration: 'none' }}
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleNav(e, 'terms')}
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              Terms of Service
            </a>
            <a
              href="/dashboard"
              onClick={(e) => handleNav(e, 'dashboard')}
              style={{ color: 'var(--color-mint-600, #059669)', fontWeight: 600, textDecoration: 'none' }}
            >
              Dashboard
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Internal icon component for camera/photos
const CameraIcon: React.FC<{ size?: number; color?: string }> = ({ size = 18, color = 'currentColor' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
