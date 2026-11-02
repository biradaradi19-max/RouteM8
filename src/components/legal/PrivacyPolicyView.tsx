// ============================================================================
// ROUTE M8 — PRIVACY POLICY VIEW
// Professional, responsive Privacy Policy explaining data collection,
// real-time GPS tracking, phone verification, and third-party auth protocols.
// ============================================================================

import React, { useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  MapPin,
  Phone,
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
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const PrivacyPolicyView: React.FC = () => {
  const { setCurrentView } = useApp();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
          <button
            onClick={() => setCurrentView('landing')}
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
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Route M8</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
              <ShieldCheck size={14} /> Official Policy
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Effective Date: November 2, 2026
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
              maxWidth: '720px',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            This Privacy Policy explains how Route M8 collects, uses, protects, and discloses your personal data,
            device GPS coordinates, and communication details across our peer-to-peer delivery and live tracking platform.
          </p>
        </div>
      </section>

      {/* Main Content Body with Quick Links */}
      <div className="container" style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem' }}>
          
          {/* Summary Callout Banner */}
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
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Privacy in Brief
            </h3>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Route M8 connects senders, recipients, and everyday travelers. We collect only the information necessary to
              match travel routes, calculate accurate ETAs, prevent delivery fraud, and facilitate physical handovers.
              <strong> We do not sell your personal data or continuous location histories to third-party data brokers.</strong>
            </p>
          </div>

          {/* SECTION 1: Personal Data We Collect */}
          <section id="information-collected" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <FileText size={22} color="var(--color-mint-600, #059669)" /> 1. Information We Collect
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Depending on whether you use Route M8 as a Customer (Sender or Recipient) or a Delivery Partner (Transporter),
              we collect the following categories of information:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
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
                  <strong style={{ fontSize: '0.9375rem' }}>Account & Profile Information</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Full name, email address, password hash (via Firebase Auth), profile photo, campus/workplace affiliation,
                  and whether you register as a sender or delivery partner.
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
                  <Phone size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Phone Numbers & Verification</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Your verified telephone number collected through Firebase Phone Authentication. Phone verification is
                  mandatorily verified by cryptographic claims on our backend before issuing LiveKit calling tokens.
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
                  <MapPin size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Delivery Addresses & Coordinates</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Pickup addresses, dropoff destinations, package descriptions, item dimensions, package urgency,
                  and special handling instructions necessary to compute route detours.
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
                  <Key size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Handover Verification PINs</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Cryptographically generated 4-digit confirmation codes provided to recipients to guarantee that packages
                  are delivered to the designated person before escrow funds are released.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 2: Real-time GPS Tracking */}
          <section id="gps-tracking" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Radio size={22} color="var(--color-mint-600, #059669)" /> 2. Real-Time GPS Tracking & Geolocation Flow
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Live location tracking is fundamental to Route M8’s bus-style logistics system. Here is precisely how your
              geographic coordinates are processed:
            </p>

            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                border: '1px solid var(--border-medium)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', gap: '1rem' }}>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-brand-subtle)',
                    color: 'var(--color-mint-600, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  1
                </span>
                <div>
                  <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.25rem' }}>
                    Active Delivery Lifecycle Only
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    We track delivery partner coordinates <strong>only during an active delivery lifecycle</strong> (statuses:{' '}
                    <code>ASSIGNED</code>, <code>PICKED_UP</code>, or <code>IN_TRANSIT</code>). Route M8 does not run background
                    location trackers when you are offline or when no active delivery is in progress.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-brand-subtle)',
                    color: 'var(--color-mint-600, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  2
                </span>
                <div>
                  <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.25rem' }}>
                    High-Accuracy GPS & Zero Synthetic Fallbacks
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    We request device GPS using <code>navigator.geolocation.watchPosition</code> with{' '}
                    <code>enableHighAccuracy: true</code> and <code>maximumAge: 0</code>. We strictly reject stale, simulated,
                    or synthetic city fallbacks. Horizontal accuracy is monitored, and low-confidence readings are flagged.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-brand-subtle)',
                    color: 'var(--color-mint-600, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  3
                </span>
                <div>
                  <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.25rem' }}>
                    Road-Following Polyline & Accurate ETA
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    Coordinates transmitted to our backend update the recipient's live map via secure WebSockets. Positions
                    are snapped to real road networks using Google Maps and routing services, calculating dynamic ETAs.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-brand-subtle)',
                    color: 'var(--color-mint-600, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    flexShrink: 0,
                  }}
                >
                  4
                </span>
                <div>
                  <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.25rem' }}>
                    Immediate Tracking Teardown
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                    As soon as the recipient verifies their 4-digit PIN and the delivery status transitions to{' '}
                    <code>COMPLETED</code>, geolocation watchers are cleared, broadcast channels close, and tracking stops.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: Google & Firebase Authentication */}
          <section id="authentication" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Lock size={22} color="var(--color-mint-600, #059669)" /> 3. Google & Firebase Authentication
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 relies on Google Cloud Platform and Firebase Authentication to provide enterprise-grade identity
              verification:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Google Identity Services:</strong> When signing in with Google OAuth, we receive your verified email,
                name, profile picture, and Google User Identifier. We never have access to your Google account password.
              </li>
              <li>
                <strong>Cryptographic Token Claims:</strong> Authentication produces cryptographically signed Firebase ID
                tokens (JSON Web Tokens). Our backend verifies these claims on every sensitive API request.
              </li>
              <li>
                <strong>Phone Authentication (Spark & Blaze Tiers):</strong> Phone numbers are confirmed through Firebase
                reCAPTCHA and OTP verification. In our development environment on the free Spark plan, pre-configured test
                credentials simulate verification without incurring SMS charges. In production, real cellular SMS verification
                validates device possession.
              </li>
            </ul>
          </section>

          {/* SECTION 4: LiveKit WebRTC Audio and Video Communications */}
          <section id="calling-privacy" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Eye size={22} color="var(--color-mint-600, #059669)" /> 4. LiveKit Cloud Audio & Video Calls
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              To facilitate seamless delivery coordination, Route M8 incorporates real-time WebRTC audio and video calling
              powered by LiveKit Cloud:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Cryptographic Room Tokens:</strong> Calling tokens are minted exclusively by our backend after verifying
                both participant assignment and phone verification status.
              </li>
              <li>
                <strong>Room Isolation:</strong> Call rooms are strictly scoped to individual deliveries (<code>delivery-[id]</code>).
                Only the designated customer and assigned delivery partner can join.
              </li>
              <li>
                <strong>No Audio/Video Recording:</strong> LiveKit media streams are peer-to-cloud WebRTC feeds for live coordination
                only. Route M8 does not record, store, or wiretap voice or video conversations.
              </li>
              <li>
                <strong>Hardware Release:</strong> Camera and microphone tracks are stopped and detached as soon as a participant
                hangs up, leaves the room, or completes the delivery.
              </li>
            </ul>
          </section>

          {/* SECTION 5: Data Sharing & Disclosures */}
          <section id="data-sharing" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <CheckCircle2 size={22} color="var(--color-mint-600, #059669)" /> 5. How Information is Shared
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We share personal data strictly to fulfill delivery requests and operate the platform:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.375rem' }}>
                  With Delivery Counterparties
                </strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  A sender sees the assigned partner's name, vehicle details, live location, and rating. The partner sees the
                  recipient's name, delivery address, and delivery instructions.
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
                <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.375rem' }}>
                  With Infrastructure Providers
                </strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  We share data with hosting and cloud providers (Vercel, MongoDB Atlas, Firebase, Google Cloud, and LiveKit Cloud)
                  under strict confidentiality and data-processing agreements.
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
                <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.375rem' }}>
                  Legal & Safety Disclosures
                </strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  We may disclose information if required by law, subpoena, or to protect the vital physical safety of customers,
                  partners, or the public.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 6: Data Retention & Security */}
          <section id="security-retention" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Clock size={22} color="var(--color-mint-600, #059669)" /> 6. Data Security & Retention
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              All network traffic to Route M8 is encrypted in transit via Transport Layer Security (TLS 1.3 / HTTPS).
              Passwords are salted and hashed through Firebase Authentication. Databases utilize role-based access control
              and restricted IP allowlisting.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              <strong>Retention Periods:</strong> Active GPS coordinate streams are retained during delivery transit and purged
              from transient sockets immediately upon completion. Completed delivery records (timestamps, pickup/dropoff points,
              and receipt PIN validation records) are retained for <code>[RETENTION_PERIOD, e.g., 24 months]</code> for dispute
              resolution, tax, and accounting compliance, after which they are archived or anonymized.
            </p>
          </section>

          {/* SECTION 7: User Rights */}
          <section id="user-rights" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Trash2 size={22} color="var(--color-mint-600, #059669)" /> 7. Your Privacy Rights & Choices
            </h2>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Revoke Location Permissions:</strong> You can disable location services anytime in your browser or device
                settings. Note that active delivery partners must have location enabled to receive matched transit requests.
              </li>
              <li>
                <strong>Access & Correction:</strong> You may inspect and modify your profile, phone number, vehicle information,
                and notifications directly from your Dashboard settings.
              </li>
              <li>
                <strong>Account Deletion:</strong> You have the right to request deletion of your account and personal data by
                contacting <code>[CONTACT_EMAIL]</code>.
              </li>
            </ul>
          </section>

          {/* SECTION 8: Contact Information */}
          <section
            id="contact"
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
              <Building size={20} color="var(--color-mint-600, #059669)" /> 8. Contact & Legal Entity
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              If you have any questions, privacy concerns, or requests regarding this Privacy Policy or your data, please contact:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              <div><strong>Entity:</strong> [BUSINESS_ENTITY_NAME]</div>
              <div><strong>Business Address:</strong> [BUSINESS_ADDRESS]</div>
              <div><strong>Privacy Email:</strong> [CONTACT_EMAIL]</div>
              <div><strong>Data Protection Officer:</strong> [DATA_PROTECTION_OFFICER_EMAIL]</div>
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
            <button
              onClick={() => setCurrentView('landing')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
            >
              Home
            </button>
            <button
              onClick={() => setCurrentView('terms')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
            >
              Terms of Service
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              style={{ background: 'none', border: 'none', color: 'var(--color-mint-600, #059669)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Dashboard
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
