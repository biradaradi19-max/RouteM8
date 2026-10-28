import React, { useState, useRef, useEffect, useCallback } from 'react';
import { authApi } from '../../services/api';
import { ShieldCheck, Camera, RefreshCw, X, CheckCircle2, AlertCircle, Lock } from 'lucide-react';

interface PartnerIdentityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationSubmitted?: (status: string) => void;
}

export const PartnerIdentityVerificationModal: React.FC<PartnerIdentityVerificationModalProps> = ({
  isOpen,
  onClose,
  onVerificationSubmitted,
}) => {
  const [step, setStep] = useState<'consent' | 'camera' | 'preview' | 'success'>('consent');
  const [consentGiven, setConsentGiven] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera tracks helper
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // When modal closes, clean up stream
  const handleClose = () => {
    stopCamera();
    setStep('consent');
    setCapturedImage(null);
    setCameraError(null);
    setSubmitError(null);
    onClose();
  };

  // Start browser camera with explicit permission request
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by this browser.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      setStream(mediaStream);
      setStep('camera');

      // Attach stream to video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err: any) {
      console.warn('[Face Verification Camera Notice]', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please grant camera permissions in your browser address bar.');
      } else {
        setCameraError(err.message || 'Unable to access camera.');
      }
    }
  };

  // Capture still image snapshot from video
  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    setCapturedImage(dataUrl);
    stopCamera();
    setStep('preview');
  };

  // Retake photo
  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  // Submit captured selfie for pending review
  const submitVerification = async () => {
    if (!capturedImage) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await authApi.submitPartnerVerification({
        consentGiven: true,
        selfieBase64: capturedImage,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to submit verification');
      }

      setStep('success');
      onVerificationSubmitted?.(res.status || 'pending_review');
    } catch (err: any) {
      setSubmitError(err.message || 'Error submitting selfie. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-verification-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-surface, #ffffff)',
          color: 'var(--text-primary, #1e293b)',
          borderRadius: 'var(--radius-xl, 1rem)',
          maxWidth: '520px',
          width: '100%',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          border: '1px solid var(--border-medium, #e2e8f0)',
        }}
      >
        <button
          onClick={handleClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-tertiary, #94a3b8)',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md, 0.5rem)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-mint-600, #059669)',
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div>
            <h2 id="partner-verification-title" style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              Partner Identity Verification
            </h2>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary, #64748b)' }}>
              Community Trust & Safety Verification
            </p>
          </div>
        </div>

        {/* Step 1: Consent & Information */}
        {step === 'consent' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 'var(--radius-md, 0.5rem)',
                padding: '1rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary, #334155)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--color-forest-800, #1e3a8a)' }}>
                <Lock size={15} />
                <span>Privacy & Biometric Protection Notice</span>
              </div>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                To protect community safety and build trust, delivery partners complete a photo identity verification check.
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.5 }}>
                <li>Your selfie is strictly encrypted and used solely for human/partner safety review.</li>
                <li>Your verification photo is <strong>never</strong> exposed to requesters or public feeds.</li>
                <li>No automated bias or instantaneous facial rejection is performed.</li>
              </ul>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
            >
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                style={{ marginTop: '0.2rem', cursor: 'pointer' }}
                data-testid="verification-consent-checkbox"
              />
              <span>
                I voluntarily consent to capturing a real-time selfie snapshot using my device camera for Route M8 delivery partner identity verification.
              </span>
            </label>

            {cameraError && (
              <div
                style={{
                  color: 'var(--status-danger-text, #b91c1c)',
                  backgroundColor: 'var(--status-danger-bg, #fee2e2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{cameraError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={handleClose} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={startCamera}
                disabled={!consentGiven}
                className="btn btn-primary btn-sm"
                data-testid="start-camera-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Camera size={16} />
                <span>Enable Camera & Proceed</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Live Camera View */}
        {step === 'camera' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)', textAlign: 'center' }}>
              Center your face within the frame in good lighting and look directly at the camera.
            </p>

            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '400px',
                aspectRatio: '4/3',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                overflow: 'hidden',
                backgroundColor: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)', // Mirror video for natural selfie preview
                }}
              />
              {/* Face Guide Overlay */}
              <div
                style={{
                  position: 'absolute',
                  width: '180px',
                  height: '240px',
                  border: '2px dashed rgba(255, 255, 255, 0.75)',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '0.5rem' }}>
              <button type="button" onClick={handleClose} className="btn btn-secondary btn-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={captureSnapshot}
                className="btn btn-primary btn-sm"
                data-testid="capture-selfie-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Camera size={16} />
                <span>Take Photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview Captured Photo */}
        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)', textAlign: 'center' }}>
              Review your photo before submitting. Ensure your face is clearly visible.
            </p>

            {capturedImage && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '380px',
                  aspectRatio: '4/3',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-medium, #e2e8f0)',
                }}
              >
                <img
                  src={capturedImage}
                  alt="Captured Selfie"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            {submitError && (
              <div
                style={{
                  color: 'var(--status-danger-text, #b91c1c)',
                  backgroundColor: 'var(--status-danger-bg, #fee2e2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                }}
              >
                <AlertCircle size={16} />
                <span>{submitError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={retakePhoto}
                disabled={isSubmitting}
                className="btn btn-secondary btn-sm"
                data-testid="retake-selfie-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <RefreshCw size={14} />
                <span>Retake Photo</span>
              </button>
              <button
                type="button"
                onClick={submitVerification}
                disabled={isSubmitting}
                className="btn btn-primary btn-sm"
                data-testid="submit-verification-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {isSubmitting ? (
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success / Pending Review State */}
        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center', alignItems: 'center', padding: '1rem 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--color-amber-600, #d97706)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={32} />
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 700 }}>
                Verification Submitted — Pending Review
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
                Your selfie snapshot has been securely received with your consent. Partner verification status is set to{' '}
                <strong style={{ color: 'var(--color-amber-600, #d97706)' }}>Pending Review</strong>.
              </p>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 'var(--radius-md, 0.5rem)',
                padding: '0.875rem',
                fontSize: '0.8125rem',
                color: 'var(--text-secondary, #78350f)',
                textAlign: 'left',
              }}
            >
              <strong>System Notice:</strong> In compliance with privacy standards, partner verification is separated from login authentication and requires legitimate verification checks before final approval.
            </div>

            <button type="button" onClick={handleClose} className="btn btn-primary btn-sm" style={{ minWidth: '120px' }}>
              Done
            </button>
          </div>
        )}

        {/* Hidden canvas for image capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
};
