import React, { useState } from 'react';
import { 
  ArrowRight, 
  ShieldCheck, 
  Car, 
  Package, 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  GraduationCap, 
  Briefcase, 
  ChevronDown, 
  ChevronUp, 
  Leaf, 
  Lock, 
  Compass, 
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';


interface LandingViewProps {
  onOpenCreateRequest: () => void;
  onOpenPublishJourney: () => void;
  onGoToDashboard: () => void;
  onOpenAuth: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onOpenCreateRequest,
  onOpenPublishJourney,
  onGoToDashboard,
  onOpenAuth
}) => {
  const { setCurrentView } = useApp();
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(prev => prev === index ? null : index);
  };

  const faqs = [
    {
      q: 'How does Route M8 prevent drivers from taking long, inconvenient detours?',
      a: 'Transporters set a strict maximum detour threshold (e.g. 5, 10, or 15 minutes). Our real road-network algorithm (powered by OSRM) analyzes turn-by-turn geometry and guarantees that candidate pickups and dropoffs stay within your specified detour window.'
    },
    {
      q: 'How does the 4-digit Handover PIN ensure delivery security?',
      a: 'When a request is published, a unique cryptographically generated 4-digit PIN is provided exclusively to the recipient. When the commuter hands over the item physically, the recipient shares their PIN. The platform only completes the transaction and releases compensation once this PIN is verified.'
    },
    {
      q: 'How are student and workplace affiliations verified?',
      a: 'Users can link their academic (.edu) or corporate email domain. We cross-verify institution credentials to award Verified Student or Verified Employee trust badges, allowing communities to create trusted micro-networks on campus or along business parks.'
    },
    {
      q: 'What types of items can be transported?',
      a: 'Items range from urgent campus readers and laptop chargers to sealed pharmacy prescriptions and curbside groceries. All items must comply with community safety standards and fit comfortably within the commuter’s chosen capacity (small, medium, or large parcel).'
    },
    {
      q: 'How does Route M8 support environmental sustainability?',
      a: 'Instead of dispatching dedicated on-demand delivery vans that generate extra vehicle miles, Route M8 piggybacks on existing trips already happening along highway and arterial corridors, cutting incremental CO₂ emissions by over 80%.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5rem', paddingBottom: '4rem' }}>
      
      {/* 1. HERO SECTION */}
      <section style={{
        paddingTop: 'clamp(3rem, 6vw, 6rem)',
        paddingBottom: 'clamp(2rem, 4vw, 4rem)',
        backgroundColor: 'var(--bg-app)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Soft Ambient Radial Blur */}
        <div style={{
          position: 'absolute',
          top: '0',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '420px',
          background: 'radial-gradient(ellipse at top, rgba(45, 212, 191, 0.15), transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            maxWidth: '860px',
            margin: '0 auto',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem'
          }}>
            {/* Tagline Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.875rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-brand-subtle)',
              border: '1px solid rgba(18, 53, 39, 0.15)',
              color: 'var(--color-forest-800)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              boxShadow: 'var(--shadow-xs)'
            }}>
              <Sparkles size={14} color="var(--color-mint-500)" />
              <span>Your route. Someone's need. One connected community.</span>
            </div>

            {/* Main Headline */}
            <h1 style={{
              fontSize: 'clamp(2.25rem, 5vw, 4rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              fontWeight: 800,
              color: 'var(--text-primary)'
            }}>
              Everyday journeys deliver{' '}
              <span style={{
                color: 'var(--color-forest-700)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--color-mint-400)',
                textUnderlineOffset: '6px'
              }}>
                local community needs.
              </span>
            </h1>

            {/* Concise Explanation */}
            <p style={{
              fontSize: 'clamp(1rem, 2vw, 1.25rem)',
              color: 'var(--text-secondary)',
              maxWidth: '680px',
              lineHeight: 1.6
            }}>
              Connect with verified students and commuters traveling along your everyday route. Share errands, exchange parcels, and unlock near-zero detour mobility with trusted physical handovers.
            </p>

            {/* Primary Action Buttons */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              marginTop: '0.5rem'
            }}>
              <button
                onClick={onOpenCreateRequest}
                className="btn btn-primary btn-lg"
                style={{ minWidth: '190px' }}
              >
                <Package size={20} />
                <span>Request an Item</span>
              </button>

              <button
                onClick={onOpenPublishJourney}
                className="btn btn-secondary btn-lg"
                style={{ minWidth: '190px' }}
              >
                <Car size={20} />
                <span>Offer a Ride / Commute</span>
              </button>

              <button
                onClick={onGoToDashboard}
                className="btn btn-ghost btn-lg"
                style={{ color: 'var(--color-mint-600)', fontWeight: 700 }}
              >
                <span>Live Interactive Dashboard</span>
                <ArrowRight size={18} />
              </button>
            </div>

            {/* Micro Trust Proof */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              fontSize: '0.8125rem',
              color: 'var(--text-tertiary)',
              marginTop: '1rem',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <ShieldCheck size={16} color="var(--color-mint-500)" /> .Edu & Corporate Verified
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Lock size={16} color="var(--color-mint-500)" /> 4-Digit PIN Handover
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Leaf size={16} color="var(--color-mint-500)" /> 82% Lower Carbon Footprint
              </span>
            </div>
          </div>

          {/* Interactive Hero Route Visualizer Card */}
          <div style={{
            marginTop: '3.5rem',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-2xl)',
            border: '1px solid var(--border-medium)',
            boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden',
            maxWidth: '1000px',
            margin: '3.5rem auto 0'
          }}>
            {/* Top Toolbar */}
            <div style={{
              padding: '1rem 1.5rem',
              backgroundColor: 'var(--bg-surface-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--color-mint-500)' }} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Live Corridor Simulation: Palo Alto ➔ Mountain View
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>Real-Time OSRM Calculation</span>
                <span className="badge badge-brand">+4 min estimated detour</span>
              </div>
            </div>

            {/* Visual Route Connector Showcase */}
            <div style={{
              padding: '2rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.5rem',
              alignItems: 'center'
            }}>
              {/* Commuter Journey Card */}
              <div className="card-interactive" style={{
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                border: '1px solid var(--border-medium)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span className="badge badge-brand">Transporter Route</span>
                  <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Departing 17:45</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
                    alt="Elena R."
                    style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Elena Rostova</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <GraduationCap size={13} /> <span className="tabular-nums">Stanford CS Grad (98% Trust)</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <div><strong>Origin:</strong> Stanford Oval Campus</div>
                  <div><strong>Destination:</strong> Googleplex, Mountain View</div>
                  <div><strong>Vehicle:</strong> Volvo EX30 (Zero Emission)</div>
                </div>
              </div>

              {/* Match Connector Indicator */}
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-forest-850)',
                  color: 'var(--color-mint-400)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  <Sparkles size={26} />
                </div>
                <div className="tabular-nums" style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-mint-600)' }}>
                  97% Match
                </div>
                <div className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', maxWidth: '180px' }}>
                  Only 1.4 km additional detour from highway route
                </div>
                <button
                  onClick={() => setCurrentView('matching')}
                  className="btn btn-accent btn-sm"
                  style={{ marginTop: '0.25rem' }}
                >
                  Inspect on Interactive Map
                </button>
              </div>

              {/* Item Request Card */}
              <div className="card-interactive" style={{
                backgroundColor: 'var(--bg-app)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                border: '1px solid var(--border-medium)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span className="badge badge-active">Active Errand Need</span>
                  <span className="tabular-nums" style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-forest-800)' }}>$14.50 reward</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>
                  Lab Notebook & Circuit Breadboard
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
                  Needed at Mountain View maker garage by 7:00 PM for project submission.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Pickup:</strong> Gates CS Bldg, Room 240</div>
                  <div><strong>Dropoff:</strong> Castro St, Mountain View</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS */}
      <section className="container">
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 3rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-mint-600)' }}>
            Transparent Protocol
          </span>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', margin: '0.5rem 0' }}>
            How Route M8 Works
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Zero artificial routing. Real road data matching commuters with community errand needs in four reliable steps.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem'
        }}>
          {[
            {
              step: '01',
              title: 'Publish Trip or Need',
              desc: 'Commuters register their everyday route and detour tolerance. Requesters post items with pickup/dropoff locations and fair compensation.',
              icon: MapPin,
            },
            {
              step: '02',
              title: 'Deterministic Detour Match',
              desc: 'Our engine uses OSRM real road coordinates to calculate the exact detour minutes and additional distance. No unexpected miles.',
              icon: Compass,
            },
            {
              step: '03',
              title: 'Physical PIN Handover',
              desc: 'Every delivery generates a secure 4-digit code given solely to the recipient. Handover is finalized in person via instant verification.',
              icon: Lock,
            },
            {
              step: '04',
              title: 'Fair Escrow Release',
              desc: 'Compensation is automatically released upon PIN validation. Both parties earn community trust scores and lower their carbon footprint.',
              icon: ShieldCheck,
            },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="card-interactive"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--border-medium)',
                  padding: '2rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-xs)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--bg-brand-subtle)',
                    color: 'var(--color-forest-800)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={22} />
                  </div>
                  <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-mint-500)' }}>
                    {item.step}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1875rem', margin: 0 }}>{item.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. USE CASES (STUDENTS & COMMUTERS) */}
      <section style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '5rem 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 3rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-mint-600)' }}>
              Built For Real Life
            </span>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', margin: '0.5rem 0' }}>
              Designed For Students and Commuters
            </h2>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              Whether you are balancing class schedules or daily office transit, Route M8 fits smoothly into your routine.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '2rem'
          }}>
            {/* Student Persona Card */}
            <div className="card-interactive" style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-medium)',
              padding: '2.25rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'var(--color-mint-100)', color: 'var(--color-mint-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GraduationCap size={26} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', margin: 0 }}>For University Students</h3>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>Campus verified networks</span>
                </div>
              </div>

              <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', margin: 0 }}>
                Never get stranded without vital equipment. Connect with peers heading between campus libraries, off-campus apartments, and research centers.
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.625rem', padding: 0 }}>
                {[
                  'Urgent course readers, lab notebooks & hardware kits',
                  'Weekend campus-to-hometown luggage or laundry dropoffs',
                  'Shared ride micro-splits for airport & train station runs',
                  'Earn pocket funds on your daily bike or car trip'
                ].map((txt, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <CheckCircle2 size={16} color="var(--color-mint-500)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{txt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Commuter Persona Card */}
            <div className="card-interactive" style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-medium)',
              padding: '2.25rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'var(--bg-brand-subtle)', color: 'var(--color-forest-800)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Briefcase size={26} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', margin: 0 }}>For Daily Commuters</h3>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-forest-700)', fontWeight: 600 }}>Suburban & corporate corridors</span>
                </div>
              </div>

              <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', margin: 0 }}>
                Offset fuel or charging costs on trips you already make every single workday. Pick up packages within 3-8 minutes of your main highway exit.
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.625rem', padding: 0 }}>
                {[
                  'Monetize unused cargo trunk space on routine drives',
                  'Pick up pre-ordered grocery bags or pharmacy items on your way home',
                  'Strict detour limits ensure you are never late for dinner or meetings',
                  'Reduce congestion by replacing dedicated delivery vans'
                ].map((txt, idx) => (
                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.875rem' }}>
                    <CheckCircle2 size={16} color="var(--color-forest-700)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{txt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TRUST & SAFETY FEATURES */}
      <section className="container">
        <div style={{
          backgroundColor: 'var(--color-forest-900)',
          color: 'white',
          borderRadius: 'var(--radius-2xl)',
          padding: 'clamp(2rem, 5vw, 4rem)',
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ maxWidth: '640px', marginBottom: '2.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-mint-300)' }}>
              Trust & Community Integrity
            </span>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', color: 'white', margin: '0.5rem 0 1rem' }}>
              Engineered for absolute safety and mutual accountability.
            </h2>
            <p style={{ color: 'var(--color-charcoal-200)', fontSize: '1rem', lineHeight: 1.6 }}>
              Route M8 relies on cryptographic verification, verified organizational IDs, and community trust escrow to ensure every interaction is protected.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem'
          }}>
            {[
              {
                title: '4-Digit Handover PIN',
                desc: 'Payment escrow is locked until the recipient verifies the private 4-digit code in the app during physical item receipt.',
                icon: Lock
              },
              {
                title: 'Institutional Verification',
                desc: 'Members link their .edu campus or corporate work email to receive verifiable identity badges.',
                icon: ShieldCheck
              },
              {
                title: 'Community Trust Score',
                desc: 'Every completed delivery and verified detour contributes to a publicly visible rating and trust tier (0–100%).',
                icon: Users
              },
              {
                title: 'Strict Detour Limits',
                desc: 'Routing algorithms enforce hard limits on detours. Transporters never face unpredictable itinerary shifts.',
                icon: Compass
              }
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ color: 'var(--color-mint-300)' }}>
                    <Icon size={24} />
                  </div>
                  <h4 style={{ color: 'white', fontSize: '1.125rem', margin: 0 }}>{f.title}</h4>
                  <p style={{ color: 'var(--color-charcoal-200)', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. INTERACTIVE FAQS */}
      <section className="container" style={{ maxWidth: '820px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-mint-600)' }}>
            Got Questions?
          </span>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.25rem)', margin: '0.5rem 0' }}>
            Frequently Asked Questions
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div
                key={index}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-medium)',
                  overflow: 'hidden',
                  transition: 'border-color var(--transition-fast)'
                }}
              >
                <button
                  onClick={() => toggleFaq(index)}
                  style={{
                    width: '100%',
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={20} color="var(--color-mint-600)" /> : <ChevronDown size={20} color="var(--text-tertiary)" />}
                </button>
                {isOpen && (
                  <div style={{ padding: '0 1.5rem 1.25rem', color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. PROFESSIONAL FOOTER */}
      <footer style={{
        borderTop: '1px solid var(--border-medium)',
        backgroundColor: 'var(--bg-surface)',
        paddingTop: '4rem',
        paddingBottom: '2rem'
      }}>
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '2.5rem'
          }}>
            {/* Brand column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--color-forest-850)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="22" height="22" viewBox="0 0 64 64" fill="none">
                    <path d="M18 46C18 36 28 34 32 32C36 30 46 28 46 18" stroke="#2DD4BF" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="18" cy="46" r="6" fill="#0E291E" stroke="#2DD4BF" strokeWidth="4" />
                    <circle cx="46" cy="18" r="6" fill="#0E291E" stroke="#A7F3D0" strokeWidth="4" />
                  </svg>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.25rem' }}>
                  Route M8
                </span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Your route. Someone's need. One connected community. Sustainable, verified peer mobility along everyday routes.
              </p>
            </div>

            {/* Navigation Column 1 */}
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Platform
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <a href="#how-it-works" onClick={e => { e.preventDefault(); setCurrentView('matching'); }}>Route Matching</a>
                <a href="#deliveries" onClick={e => { e.preventDefault(); setCurrentView('deliveries'); }}>Active Deliveries</a>
                <a href="#dashboard" onClick={e => { e.preventDefault(); setCurrentView('dashboard'); }}>Community Dashboard</a>
                <a href="#auth" onClick={e => { e.preventDefault(); onOpenAuth(); }}>Member Sign In</a>
              </div>
            </div>

            {/* Navigation Column 2 */}
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Trust & Verification
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <span>4-Digit PIN Security</span>
                <span>Campus Affiliation Badges</span>
                <span>Community Escrow</span>
                <span>Safety Guidelines</span>
              </div>
            </div>

            {/* Navigation Column 3 */}
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', color: 'var(--text-primary)' }}>
                Architecture
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <span>OSRM Routing Engine</span>
                <span>Firebase Auth & Analytics</span>
                <span>Leaflet Geospatial Mapping</span>
                <span>Zero-Config Fallback</span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingTop: '2rem',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8125rem',
            color: 'var(--text-tertiary)'
          }}>
            <div>
              © 2026 Route M8 Technologies Inc. All rights reserved.
            </div>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Community Code of Conduct</span>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
};
