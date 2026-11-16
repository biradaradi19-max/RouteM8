import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Bike,
  Car,
  ChevronRight,
  ArrowRight,
  Edit3,
} from 'lucide-react';
import { partnerApi, type PartnerApplicationInfo } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { PartnerOnboardingModal } from './PartnerOnboardingModal';

export const PartnerOnboardingCard: React.FC = () => {
  const { user } = useAuth();
  const { setCurrentView } = useApp();

  const [application, setApplication] = useState<PartnerApplicationInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchStatus = useCallback(() => {
    if (!user) return;
    partnerApi
      .getApplication()
      .then((res) => {
        setApplication(res.application);
      })
      .catch(() => {
        setApplication(null);
      });
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const status = application?.status || 'none';

  return (
    <>
      <div
        className="mobility-card"
        style={{
          padding: '1.25rem 1.5rem',
          background:
            status === 'approved'
              ? 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(22, 168, 120, 0.08) 100%)'
              : status === 'rejected'
              ? 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(239, 68, 68, 0.06) 100%)'
              : 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(16, 28, 44, 0.03) 100%)',
          border:
            status === 'approved'
              ? '1px solid rgba(22, 168, 120, 0.3)'
              : status === 'rejected'
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor:
                  status === 'approved'
                    ? 'rgba(22, 168, 120, 0.15)'
                    : status === 'rejected'
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(16, 28, 44, 0.08)',
                color:
                  status === 'approved'
                    ? 'var(--color-mint-600)'
                    : status === 'rejected'
                    ? '#DC2626'
                    : 'var(--color-forest-900)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {status === 'approved' ? (
                <CheckCircle2 size={20} />
              ) : status === 'rejected' ? (
                <AlertCircle size={20} />
              ) : (
                <ShieldCheck size={20} />
              )}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {status === 'approved'
                    ? 'Approved Delivery Partner'
                    : status === 'under_review'
                    ? 'Partner Application Under Review'
                    : status === 'submitted' || status === 'verification_pending'
                    ? 'Partner Verification In Progress'
                    : status === 'rejected'
                    ? 'Partner Application Needs Attention'
                    : status === 'suspended'
                    ? 'Partner Account Suspended'
                    : 'Become a RouteM8 Delivery Partner'}
                </h3>
                {status !== 'none' && (
                  <span
                    className={`badge ${
                      status === 'approved'
                        ? 'badge-verified'
                        : status === 'rejected' || status === 'suspended'
                        ? 'badge-warning'
                        : 'badge-brand'
                    }`}
                    style={{
                      fontSize: '0.6875rem',
                      textTransform: 'capitalize',
                      backgroundColor:
                        status === 'rejected' || status === 'suspended' ? '#FEE2E2' : undefined,
                      color:
                        status === 'rejected' || status === 'suspended' ? '#991B1B' : undefined,
                    }}
                  >
                    {status.replace('_', ' ')}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                {status === 'approved'
                  ? `Active on RouteM8 mobility network • Commute Transport: ${application?.vehicleCategory || 'motorcycle'}`
                  : status === 'under_review'
                  ? 'Our compliance team is reviewing your vehicle category and identity credentials.'
                  : status === 'rejected'
                  ? `Review Feedback: ${application?.rejectionReason || 'Please update your details and resubmit.'}`
                  : status === 'suspended'
                  ? `Reason: ${application?.suspensionReason || 'Account suspended by platform administration.'}`
                  : 'Turn your regular commute into earnings by fulfilling neighbor deliveries along your route.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {status === 'approved' ? (
              <button
                onClick={() => setCurrentView('deliveries')}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <span>Switch to Transporter Mode</span>
                <ArrowRight size={14} />
              </button>
            ) : status === 'rejected' ? (
              <button
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#DC2626' }}
              >
                <Edit3 size={14} />
                <span>Edit & Resubmit</span>
              </button>
            ) : status === 'under_review' || status === 'submitted' || status === 'verification_pending' ? (
              <button
                onClick={() => setIsModalOpen(true)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <span>View Details</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <span>Apply to Deliver</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Feature Highlights when not yet applied */}
        {status === 'none' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <CheckCircle2 size={14} color="var(--color-mint-600)" />
              <span>100% Compensation released to you</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <Bike size={14} color="var(--color-mint-600)" />
              <span>Bicycles & walking messengers licence-exempt</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <Car size={14} color="var(--color-mint-600)" />
              <span>Deliver only along your existing travel path</span>
            </div>
          </div>
        )}
      </div>

      <PartnerOnboardingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onApplicationUpdated={fetchStatus}
      />
    </>
  );
};
