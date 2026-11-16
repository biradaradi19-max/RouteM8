import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Bike,
  Car,
  Truck,
  RefreshCw,
  FileText,
  Lock,
  ArrowRight,
  Edit3,
} from 'lucide-react';
import { partnerApi, type PartnerApplicationInfo } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

interface PartnerOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplicationUpdated?: () => void;
}

const VEHICLE_OPTIONS = [
  { id: 'bicycle', label: 'Bicycle / Cycle Courier', icon: Bike, isExempt: true, desc: 'Eco-friendly urban delivery, legally exempt from driving licence & registration' },
  { id: 'motorcycle', label: 'Motorcycle / Two-Wheeler', icon: Bike, isExempt: false, desc: 'Agile city transit with standard two-wheeler licence' },
  { id: 'scooter', label: 'Scooter / Moped', icon: Bike, isExempt: false, desc: 'Economical commuter courier with two-wheeler licence' },
  { id: 'car', label: 'Car / Sedan / Hatchback', icon: Car, isExempt: false, desc: 'Spacious parcel capacity with valid four-wheeler licence' },
  { id: 'ev', label: 'Electric Vehicle (EV)', icon: Car, isExempt: false, desc: 'Zero-emission transport with appropriate motor licence' },
  { id: 'van', label: 'Van / Small Commercial', icon: Truck, isExempt: false, desc: 'High-volume cargo and parcel courier transit' },
  { id: 'none', label: 'Walking / Foot Messenger', icon: Bike, isExempt: true, desc: 'Hyper-local transit, zero vehicle documentation needed' },
];

const ID_DOCUMENT_OPTIONS = [
  { id: 'aadhaar_offline', label: 'Aadhaar Offline e-KYC (Masked XML)' },
  { id: 'pan', label: 'PAN Card (Permanent Account Number)' },
  { id: 'voter_id', label: 'Voter ID (Election Photo ID)' },
  { id: 'passport', label: 'Indian Passport' },
  { id: 'driving_licence', label: 'Smart Card Driving Licence' },
];

export const PartnerOnboardingModal: React.FC<PartnerOnboardingModalProps> = ({
  isOpen,
  onClose,
  onApplicationUpdated,
}) => {
  const { user } = useAuth();
  const { setCurrentView } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [existingApp, setExistingApp] = useState<PartnerApplicationInfo | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [vehicleCategory, setVehicleCategory] = useState<string>('motorcycle');
  const [phone, setPhone] = useState<string>(user?.phone || '');
  const [notes, setNotes] = useState<string>('');
  const [idType, setIdType] = useState<string>('aadhaar_offline');
  const [mockIdNumber, setMockIdNumber] = useState<string>('');
  const [drivingLicenceNumber, setDrivingLicenceNumber] = useState<string>('');
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [consentObtained, setConsentObtained] = useState<boolean>(false);

  // UI message state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Fetch current application on modal open
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    partnerApi
      .getApplication()
      .then((res) => {
        if (res.application) {
          setExistingApp(res.application);
          setVehicleCategory(res.application.vehicleCategory || 'motorcycle');
          if (res.application.phone) setPhone(res.application.phone);
          if (res.application.notes) setNotes(res.application.notes);
          if (res.application.status === 'rejected') {
            setIsEditing(true);
          } else {
            setIsEditing(false);
          }
        } else {
          setExistingApp(null);
          setIsEditing(true);
        }
      })
      .catch((err) => {
        console.warn('[PartnerOnboarding] Could not fetch application:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedVehicleObj = VEHICLE_OPTIONS.find((v) => v.id === vehicleCategory) || VEHICLE_OPTIONS[1];
  const isVehicleExempt = selectedVehicleObj.isExempt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!consentObtained) {
      setErrorMsg('Explicit user consent is required before initiating partner credential verification.');
      return;
    }

    if (!isVehicleExempt && !drivingLicenceNumber.trim()) {
      setErrorMsg('Driving licence number is required for motorized vehicles.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Submit application (or resubmit if rejected)
      const applyRes = await partnerApi.apply({
        vehicleCategory,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!applyRes.success) {
        throw new Error(applyRes.error || 'Failed to submit partner application');
      }

      // 2. Perform identity verification (Mock provider)
      const idRes = await partnerApi.verifyIdentity({
        idType,
        consentObtained: true,
        consentVersion: 'v2.0-2026',
      });

      if (!idRes.success) {
        throw new Error(idRes.error || 'Identity credential verification failed');
      }

      // 3. Perform vehicle verification
      const vehRes = await partnerApi.verifyVehicle({
        vehicleCategory,
        drivingLicenceNumber: isVehicleExempt ? undefined : drivingLicenceNumber.trim(),
        registrationNumber: isVehicleExempt ? undefined : registrationNumber.trim(),
      });

      if (!vehRes.success) {
        throw new Error(vehRes.error || 'Vehicle credential verification failed');
      }

      // 4. Submit for administrative review
      const reviewRes = await partnerApi.submitForReview();
      if (!reviewRes.success) {
        throw new Error(reviewRes.error || 'Failed to submit application for review');
      }

      setExistingApp(reviewRes.application || applyRes.application || null);
      setIsEditing(false);
      setSuccessMsg('Your delivery partner application has been submitted and is currently under administrative review!');
      onApplicationUpdated?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting your application.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="badge badge-verified" style={{ fontSize: '0.8125rem' }}>
            <CheckCircle2 size={13} /> Approved Partner
          </span>
        );
      case 'under_review':
        return (
          <span className="badge badge-brand" style={{ fontSize: '0.8125rem' }}>
            <RefreshCw size={13} className="spinner" /> Under Review
          </span>
        );
      case 'verification_pending':
      case 'submitted':
        return (
          <span className="badge badge-brand" style={{ fontSize: '0.8125rem' }}>
            <FileText size={13} /> Verification Pending
          </span>
        );
      case 'rejected':
        return (
          <span className="badge badge-warning" style={{ fontSize: '0.8125rem', backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
            <AlertCircle size={13} /> Needs Attention
          </span>
        );
      case 'suspended':
        return (
          <span className="badge badge-warning" style={{ fontSize: '0.8125rem', backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
            <AlertCircle size={13} /> Suspended
          </span>
        );
      default:
        return (
          <span className="badge" style={{ fontSize: '0.8125rem' }}>
            Draft
          </span>
        );
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(16, 28, 44, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="mobility-card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(22, 168, 120, 0.06) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(22, 168, 120, 0.12)',
                color: 'var(--color-mint-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Become a RouteM8 Delivery Partner
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                Earn supplemental compensation along your daily commute corridor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div
              style={{
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--status-cancelled-bg)',
                color: 'var(--status-cancelled-text)',
                border: '1px solid var(--status-cancelled-border)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-mint-50)',
                color: 'var(--color-mint-700)',
                border: '1px solid var(--color-mint-200)',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Existing Application Status View */}
          {existingApp && !isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  padding: '1.25rem',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      Application Overview
                    </span>
                    {renderStatusBadge(existingApp.status)}
                  </div>
                  {existingApp.submittedAt && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Submitted {new Date(existingApp.submittedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Vehicle Category</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                      {existingApp.vehicleCategory} {existingApp.vehicleCategory === 'bicycle' && '(Exempt)'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Applicant Name</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{existingApp.applicantName}</span>
                  </div>
                  {existingApp.phone && (
                    <div>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Contact Phone</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{existingApp.phone}</span>
                    </div>
                  )}
                </div>

                {/* Rejection Feedback */}
                {existingApp.status === 'rejected' && (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#991B1B',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                      <AlertCircle size={15} /> Review Feedback from RouteM8 Admin:
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                      {existingApp.rejectionReason || 'Please verify your submitted documentation and vehicle credentials.'}
                    </p>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Edit3 size={14} />
                      <span>Edit & Resubmit Application</span>
                    </button>
                  </div>
                )}

                {/* Suspended Notice */}
                {existingApp.status === 'suspended' && (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#991B1B',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                      <AlertCircle size={15} /> Partner Privileges Suspended:
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                      {existingApp.suspensionReason || 'Your partner account has been suspended by administration. Please contact platform support.'}
                    </p>
                  </div>
                )}

                {/* Under Review Notice */}
                {existingApp.status === 'under_review' && (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(22, 168, 120, 0.08)',
                      border: '1px solid rgba(22, 168, 120, 0.25)',
                      color: 'var(--color-forest-900)',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
                      <RefreshCw size={15} className="spinner" /> Safety Review in Progress
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      Our community safety team is reviewing your vehicle category and identity credentials. You will retain full requester functionality while this is evaluated.
                    </p>
                  </div>
                )}

                {/* Approved Partner Notice */}
                {existingApp.status === 'approved' && (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-mint-50)',
                      border: '1px solid var(--color-mint-200)',
                      color: 'var(--color-mint-700)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <CheckCircle2 size={16} /> Partner Status Approved & Active
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                      You are an approved delivery partner! You can now view open deliveries and accept transit requests along your published corridors.
                    </p>
                    <button
                      onClick={() => {
                        onClose();
                        setCurrentView('deliveries');
                      }}
                      className="btn btn-primary btn-sm"
                      style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <span>Go to Transporter Dashboard</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Application Submission / Resubmission Form */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Value Proposition & Eligibility Banner */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(22, 168, 120, 0.06)',
                  border: '1px solid rgba(22, 168, 120, 0.2)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-forest-900)', fontSize: '0.875rem' }}>
                  Platform Partner Terms & Eligibility
                </div>
                <div>• Must be at least 18 years of age with valid government identification.</div>
                <div>• Zero platform commission during active beta — keep 100% of agreed delivery compensation.</div>
                <div>• Non-motorized transports (Bicycles, Walking) are legally exempt from vehicle registration.</div>
              </div>

              {/* 1. Vehicle Selection */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  1. Select Commute & Delivery Transport
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.625rem' }}>
                  {VEHICLE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = vehicleCategory === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setVehicleCategory(opt.id)}
                        style={{
                          padding: '0.75rem 0.875rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1.5px solid ${isSelected ? 'var(--color-mint-500)' : 'var(--border-subtle)'}`,
                          backgroundColor: isSelected ? 'rgba(22, 168, 120, 0.05)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Icon size={16} color={isSelected ? 'var(--color-mint-600)' : 'var(--text-secondary)'} />
                          <span style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                            {opt.label}
                          </span>
                        </div>
                        {opt.isExempt && (
                          <span style={{ fontSize: '0.6875rem', color: 'var(--color-mint-600)', fontWeight: 600 }}>
                            ★ Licence Exempt
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Contact Information */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                    Corridor Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Daily commute 9am & 6pm"
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              {/* 3. Government Identity Verification */}
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  2. Government Identity Verification (Mock KYC Provider)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 500, fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                      Identity Document Type
                    </label>
                    <select
                      value={idType}
                      onChange={(e) => setIdType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-medium)',
                        fontSize: '0.8125rem',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {ID_DOCUMENT_OPTIONS.map((idOpt) => (
                        <option key={idOpt.id} value={idOpt.id}>
                          {idOpt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 500, fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                      Document / Test Identifier
                    </label>
                    <input
                      type="text"
                      value={mockIdNumber}
                      onChange={(e) => setMockIdNumber(e.target.value)}
                      placeholder="e.g. XXXXXXXX8901"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-medium)',
                        fontSize: '0.8125rem',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* 4. Vehicle Verification (Motorized only) */}
              {!isVehicleExempt ? (
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                    3. Vehicle & Driving Credentials
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 500, fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                        Driving Licence Number *
                      </label>
                      <input
                        type="text"
                        value={drivingLicenceNumber}
                        onChange={(e) => setDrivingLicenceNumber(e.target.value)}
                        placeholder="e.g. DL-0420110012345"
                        required
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-medium)',
                          fontSize: '0.8125rem',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontWeight: 500, fontSize: '0.75rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                        Vehicle Registration (RC) Number
                      </label>
                      <input
                        type="text"
                        value={registrationNumber}
                        onChange={(e) => setRegistrationNumber(e.target.value)}
                        placeholder="e.g. MH-12-AB-1234"
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-medium)',
                          fontSize: '0.8125rem',
                          backgroundColor: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(22, 168, 120, 0.05)',
                    border: '1px dashed var(--color-mint-500)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                  }}
                >
                  <CheckCircle2 size={16} color="var(--color-mint-600)" />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    <strong>Vehicle Exemption Active:</strong> Non-motorized transport ({selectedVehicleObj.label}) does not require driving licence or motor registration.
                  </span>
                </div>
              )}

              {/* 5. User Consent & Sandbox Disclaimer */}
              <div
                style={{
                  padding: '0.875rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={consentObtained}
                    onChange={(e) => setConsentObtained(e.target.checked)}
                    style={{ marginTop: '0.125rem' }}
                  />
                  <span>
                    I confirm that the details provided are authentic and give explicit consent to RouteM8 to verify my identity and vehicle credentials for safety. (Development/Testing Mode: Mock KYC Provider; no raw government Aadhaar or biometric data is stored).
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                {existingApp && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn btn-secondary btn-sm"
                    disabled={isLoading}
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: '160px', justifyContent: 'center' }}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={15} className="spinner" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={15} />
                      <span>Submit Application</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
