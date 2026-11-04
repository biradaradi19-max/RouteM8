// ============================================================================
// ROUTE M8 — TERMS OF SERVICE VIEW
// Comprehensive, responsive Terms of Service defining platform rules,
// peer-to-peer delivery obligations, 4-digit PIN verification, and liability boundaries.
// ============================================================================

import React, { useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  Scale,
  Package,
  Car,
  Key,
  PhoneCall,
  AlertTriangle,
  Building,
  ArrowLeft,
  DollarSign,
  AlertOctagon,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const TermsOfServiceView: React.FC = () => {
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
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setCurrentView('landing');
            }}
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
              <Scale size={14} /> Legal Agreement
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Last Revised: November 4, 2026
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
            Route M8 Terms of Service
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
            These Terms of Service govern your access to and use of the Route M8 peer-to-peer delivery matching platform,
            mobile and web applications, real-time GPS tracking infrastructure, and audio coordination services.
          </p>
        </div>
      </section>

      {/* Main Content Body */}
      <div className="container" style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.25rem 5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2.5rem' }}>

          {/* Quick Summary Alert */}
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
              Key Principles at a Glance
            </h3>
            <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Route M8 is a marketplace connecting senders with community transporters. We do not transport packages
              ourselves. Delivery completion is strictly verified using our physical 4-digit PIN protocol. Transporters agree
              to broadcast real-time GPS locations during active deliveries, and customers warrant that shipments contain no
              illegal or hazardous cargo.
            </p>
          </div>

          {/* SECTION 1: Acceptance & Legal Contracting */}
          <section id="acceptance" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <FileText size={22} color="var(--color-mint-600, #059669)" /> 1. Acceptance of Terms
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              By accessing, browsing, registering for, or using Route M8 (the &quot;Platform&quot;), operated by{' '}
              <strong>[BUSINESS_ENTITY_NAME]</strong> (&quot;Route M8&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;),
              you (&quot;User&quot;, &quot;Customer&quot;, &quot;Transporter&quot;, or &quot;you&quot;) agree to be legally bound
              by these Terms of Service (&quot;Terms&quot;) and our{' '}
              <a
                href="/privacy-policy"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentView('privacy');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-mint-600, #059669)',
                  textDecoration: 'underline',
                  padding: 0,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Privacy Policy
              </a>
              . If you do not agree to these Terms, you may not access or use the Platform.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We reserve the right to amend or update these Terms periodically. Notice of material updates will be delivered via
              the Platform or via registered email. Continued use of Route M8 following modifications constitutes acceptance.
            </p>
          </section>

          {/* SECTION 2: Platform Nature & Status */}
          <section id="platform-nature" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Scale size={22} color="var(--color-mint-600, #059669)" /> 2. Nature of Route M8 (Technology Intermediary)
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 is a technology communication and geospatial routing marketplace. We provide algorithmic detour
              optimization, live GPS tracking visualization, and direct peer-to-peer matching between individuals seeking
              courier transit (&quot;Requesters&quot; or &quot;Customers&quot;) and everyday commuters or independent travelers
              traveling along compatible paths (&quot;Transporters&quot; or &quot;Delivery Partners&quot;).
            </p>
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--text-primary)',
                lineHeight: 1.6,
                fontSize: '0.9375rem',
              }}
            >
              <strong>IMPORTANT DISCLAIMER:</strong> Route M8 is not a common carrier, motor carrier, freight forwarder,
              or courier delivery business. We do not take legal title to, ownership of, or physical custody over any
              transported package. Delivery Partners operate as independent peer participants and are not employees, joint
              venturers, franchisees, or legal agents of Route M8.
            </div>
          </section>

          {/* SECTION 3: Account Eligibility & Authentication */}
          <section id="eligibility-auth" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Lock size={22} color="var(--color-mint-600, #059669)" /> 3. Account Eligibility & Phone Verification
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              To register for an account and participate in deliveries, you must meet the following mandatory requirements:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Age of Majority:</strong> You must be at least 18 years of age (or the legal age of majority in your
                jurisdiction) and fully competent to enter into binding agreements.
              </li>
              <li>
                <strong>Accurate Identification:</strong> You must authenticate using valid credentials (via Google Sign-In or
                Firebase Authentication) and provide truthful, accurate, and up-to-date profile information.
              </li>
              <li>
                <strong>Mandatory Phone Verification:</strong> In order to accept delivery assignments, dispatch journeys, or
                initiate LiveKit encrypted audio coordination, users must complete cryptographic SMS / reCAPTCHA phone verification.
                Phone numbers must be verified against Firebase Authentication and certified by Route M8 backend token claims.
              </li>
              <li>
                <strong>Account Confidentiality:</strong> You are responsible for safeguarding your login credentials. You agree
                to notify Route M8 immediately of any unauthorized access to your account.
              </li>
            </ul>
          </section>

          {/* SECTION 4: Customer / Sender Responsibilities & Prohibited Goods */}
          <section id="customer-responsibilities" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Package size={22} color="var(--color-mint-600, #059669)" /> 4. Customer / Sender Responsibilities
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Customers who submit delivery requests through the Platform agree to adhere to the following strict conditions:
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
                  <ShieldCheck size={18} color="var(--color-mint-600, #059669)" />
                  <strong style={{ fontSize: '0.9375rem' }}>Accurate Sizing & Packaging</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  You must accurately categorize package dimensions (Small, Medium, Large) and weight. Fragile or delicate items
                  must be properly padded and sealed in durable outer containers prior to handover.
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
                  <strong style={{ fontSize: '0.9375rem' }}>Recipient Coordination</strong>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  You must ensure that the recipient is available at the destination coordinate and possesses the secure 4-digit
                  handover PIN. Transporters are not required to wait longer than 10 minutes at the dropoff point.
                </p>
              </div>
            </div>

            <div
              style={{
                marginTop: '0.5rem',
                padding: '1.5rem',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                backgroundColor: 'rgba(239, 68, 68, 0.04)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#DC2626' }}>
                <AlertOctagon size={20} />
                <strong style={{ fontSize: '1rem' }}>Strictly Prohibited & Hazardous Goods</strong>
              </div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.9375rem', margin: '0 0 0.75rem 0' }}>
                You warrant and represent that no package tendered through Route M8 contains any of the following items:
              </p>
              <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.875rem', paddingLeft: '1.25rem', margin: 0 }}>
                <li>Firearms, munitions, fireworks, explosives, or military hardware.</li>
                <li>Illicit substances, narcotics, controlled prescription drugs without prescription, or drug paraphernalia.</li>
                <li>Flammable, corrosive, toxic, biohazardous, radioactive, or hazardous chemical waste.</li>
                <li>Live animals, human remains, or regulated biological organs and fluids.</li>
                <li>Cash, currency, bearer instruments, loose bullion, or untraceable prepaid cash cards.</li>
                <li>Stolen property, counterfeit goods, or contraband infringing any third-party intellectual property or customs law.</li>
                <li>Any item whose transit by unbonded private motor vehicle violates municipal, state, or federal laws.</li>
              </ul>
              <p style={{ color: '#DC2626', fontSize: '0.8125rem', fontWeight: 600, margin: '0.75rem 0 0 0' }}>
                Attempting to send prohibited items results in immediate permanent expulsion, forfeit of funds, and referral to law enforcement agencies.
              </p>
            </div>
          </section>

          {/* SECTION 5: Delivery Partner (Transporter) Obligations */}
          <section id="partner-responsibilities" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Car size={22} color="var(--color-mint-600, #059669)" /> 5. Delivery Partner (Transporter) Obligations
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Transporters accepting delivery matches agree to uphold the following professional standards:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Driver Qualifications & Insurance:</strong> Transporters operating motor vehicles must hold a valid,
                unexpired driver&apos;s license, valid vehicle registration, and minimum mandatory automobile liability insurance
                in compliance with applicable traffic and transport regulations.
              </li>
              <li>
                <strong>Duty of Safe Custody:</strong> Upon taking physical custody of a package, Transporters must store items
                securely within their vehicle trunk or interior compartment away from extreme heat, moisture, or theft risk.
              </li>
              <li>
                <strong>Mandatory Real-Time Location Tracking:</strong> In accordance with our safety architecture, Transporters
                expressly agree that while an active delivery is in status <code>matched</code>, <code>picked_up</code>, or{' '}
                <code>in_transit</code>, their device GPS coordinates will be captured via browser geolocation and broadcast to the
                customer and recipient via real-time WebSocket. Disabling GPS while in custody of a package violates these Terms.
              </li>
              <li>
                <strong>Strict Non-Tampering Obligation:</strong> Transporters may never open, inspect, tamper with, photograph inner
                contents, or withhold customer parcels. If a Transporter has reasonable cause to suspect a package contains prohibited
                hazardous materials, they must halt transit immediately and contact Route M8 Support.
              </li>
            </ul>
          </section>

          {/* SECTION 6: The 4-Digit Handover PIN Legal Protocol */}
          <section id="pin-protocol" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Key size={22} color="var(--color-mint-600, #059669)" /> 6. The 4-Digit Handover PIN Legal Protocol
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              To ensure conclusive proof of delivery and prevent claims of lost or misappropriated items, Route M8 enforces a
              cryptographic handover protocol:
            </p>

            <div
              style={{
                padding: '1.5rem',
                borderRadius: 'var(--radius-xl, 1rem)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span
                  style={{
                    backgroundColor: 'var(--color-mint-600, #059669)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
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
                  <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Generation & Delivery:</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    When a delivery request is accepted, Route M8 server generates an unguessable 4-digit verification code visible
                    solely to the Requester and designated recipient.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span
                  style={{
                    backgroundColor: 'var(--color-mint-600, #059669)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
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
                  <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Physical Verification:</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    The recipient must physically inspect the external packaging condition at the dropoff destination before orally
                    providing the 4-digit PIN to the Transporter.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span
                  style={{
                    backgroundColor: 'var(--color-mint-600, #059669)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
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
                  <strong style={{ fontSize: '0.9375rem', color: 'var(--text-primary)' }}>Conclusive Fulfillment & Release:</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Successful entry of the matching PIN by the Transporter transitions the status to <code>completed</code>.
                    This constitutes conclusive legal evidence of delivery completion, releases compensation funds from escrow to
                    the Transporter, and terminates active GPS tracking broadcasts.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 7: LiveKit Audio & Communication Rules */}
          <section id="communication-rules" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <PhoneCall size={22} color="var(--color-mint-600, #059669)" /> 7. LiveKit Audio Communications & Code of Conduct
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Route M8 integrates LiveKit WebRTC encrypted calling capabilities to allow counterparties to coordinate physical
              handover details, parking instructions, or gate entrance codes:
            </p>
            <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem', margin: 0 }}>
              <li>
                <strong>Logistics Coordination Only:</strong> Voice calls and communication channels must be used strictly for
                legitimate delivery coordination. Unsolicited commercial solicitation, advertising, or post-delivery outreach is prohibited.
              </li>
              <li>
                <strong>Zero-Tolerance Harassment Policy:</strong> Any harassment, threatening behavior, foul language, stalking,
                sexual misconduct, or discriminatory behavior will result in immediate permanent expulsion and potential civil or
                criminal liability.
              </li>
              <li>
                <strong>No Phone Number Disclosure:</strong> LiveKit rooms operate via ephemeral tokens tied to delivery IDs without
                exposing personal cellular phone numbers directly between parties on the call.
              </li>
            </ul>
          </section>

          {/* SECTION 8: Pricing, Compensation, and Escrow */}
          <section id="pricing-escrow" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <DollarSign size={22} color="var(--color-mint-600, #059669)" /> 8. Compensation, Fees, and Cancellation
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Delivery compensation agreed upon at the time of request submission is held in escrow by the Platform or authorized
              payment processor until 4-digit PIN verification.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              <strong>Cancellations:</strong> Requesters may cancel a request without penalty prior to acceptance by a Transporter.
              If a Requester cancels after a Transporter has departed toward pickup or has already taken custody of the item, a
              cancellation fee may apply to compensate the Transporter for fuel and detour expenses. Transporters who abandon a package
              after pickup face account suspension and liability for the replacement cost of the goods.
            </p>
          </section>

          {/* SECTION 9: Warranty Disclaimers */}
          <section id="disclaimers" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <AlertTriangle size={22} color="var(--color-mint-600, #059669)" /> 9. Disclaimers of Warranties
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              THE PLATFORM, INCLUDING ALL ROUTING ALGORITHMS, DETOUR CALCULATIONS, REAL-TIME GPS BROADCASTS, AND LIVEKIT CALLING
              SERVICES, IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. TO THE MAXIMUM EXTENT PERMITTED UNDER
              APPLICABLE LAW, ROUTE M8 DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              We do not warrant that estimated times of arrival (ETAs) will be accurate under changing traffic conditions, that
              cellular coverage will remain uninterrupted, or that any specific delivery partner will be available at any given time.
            </p>
          </section>

          {/* SECTION 10: Limitation of Liability & Indemnity */}
          <section id="limitation-liability" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Scale size={22} color="var(--color-mint-600, #059669)" /> 10. Limitation of Liability & Indemnification
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              UNDER NO CIRCUMSTANCES SHALL ROUTE M8, ITS AFFILIATES, OFFICERS, DIRECTORS, OR AGENTS BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, EXEMPLARY, PUNITIVE, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, DATA LOSS, PERSONAL
              INJURY, OR PROPERTY DAMAGE ARISING OUT OF OR IN CONNECTION WITH THE USE OF THE PLATFORM OR ANY DELIVERY SERVICE
              ARRANGED THROUGH IT.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              TO THE FULLEST EXTENT PERMISSIBLE BY LAW, OUR TOTAL AGGREGATE LIABILITY ARISING UNDER OR RELATED TO ANY SPECIFIC
              DELIVERY SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL PLATFORM FEES PAID FOR THAT SPECIFIC DELIVERY, OR (B) $100.00 USD.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              <strong>Indemnification:</strong> You agree to defend, indemnify, and hold harmless Route M8 and its officers from
              any third-party claims, liabilities, damages, or costs (including legal fees) arising from your breach of these Terms,
              tender of prohibited goods, reckless vehicle operation, or violation of third-party rights.
            </p>
          </section>

          {/* SECTION 11: Dispute Resolution & Governing Law */}
          <section id="governing-law" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              <Scale size={22} color="var(--color-mint-600, #059669)" /> 11. Governing Law & Dispute Resolution
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              These Terms and any dispute or controversy arising out of or related to your use of Route M8 shall be governed by
              and construed in accordance with the substantive laws of <code>[JURISDICTION]</code>, without regard to conflict of
              law principles.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Prior to initiating formal legal proceedings, the parties agree to engage in good-faith informal negotiations for at
              least thirty (30) calendar days. If unresolved, any controversy shall be resolved exclusively through final and binding
              arbitration administered by <code>[ARBITRATION_FORUM]</code> under its commercial arbitration rules. All claims must be
              brought in an individual capacity and not as a plaintiff or class member in any class or collective proceeding.
            </p>
          </section>

          {/* SECTION 12: Contact Information */}
          <section
            id="contact-legal"
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
              <Building size={20} color="var(--color-mint-600, #059669)" /> 12. Contact Information & Legal Notices
            </h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              Formal legal notices, questions, or notices of violation regarding these Terms of Service must be directed to:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              <div><strong>Entity:</strong> [BUSINESS_ENTITY_NAME]</div>
              <div><strong>Physical Address:</strong> [BUSINESS_ADDRESS]</div>
              <div><strong>Legal Counsel Email:</strong> [LEGAL_EMAIL]</div>
              <div><strong>Customer Support:</strong> [CONTACT_EMAIL]</div>
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
              onClick={(e) => {
                e.preventDefault();
                setCurrentView('landing');
              }}
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              Home
            </a>
            <a
              href="/privacy-policy"
              onClick={(e) => {
                e.preventDefault();
                setCurrentView('privacy');
              }}
              style={{ color: 'var(--color-mint-600, #059669)', fontWeight: 600, textDecoration: 'none' }}
            >
              Privacy Policy
            </a>
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault();
                setCurrentView('dashboard');
              }}
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
