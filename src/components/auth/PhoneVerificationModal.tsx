// ============================================================================
// ROUTE M8 — FIREBASE PHONE VERIFICATION MODAL
// Complete 6-Digit OTP Verification UI for Firebase Authentication.
// Supports Firebase Test Phone Numbers for the Free Spark Plan and
// is 100% production-ready for live cellular SMS OTP on the Blaze Plan.
// ============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  FIREBASE_TEST_PHONE_NUMBERS,
  createRecaptchaVerifier,
  sendFirebasePhoneOtp,
  confirmFirebasePhoneOtp,
  getFirebaseAuthErrorMessage,
  type FirebaseTestPhoneNumber,
  type ConfirmationResult,
} from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

interface PhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (phoneNumber: string) => void;
}

export const PhoneVerificationModal: React.FC<PhoneVerificationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, recordPhoneVerificationSuccess } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp' | 'success'>('phone');
  const [phoneNumber, setPhoneNumber] = useState<string>(user?.phone || '');
  const [selectedTestNumber, setSelectedTestNumber] = useState<FirebaseTestPhoneNumber | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<any>(null);

  // Initialize selected test phone number if user.phone matches one
  useEffect(() => {
    if (user?.phone) {
      const match = FIREBASE_TEST_PHONE_NUMBERS.find(
        (t) => t.phoneNumber.replace(/[\s()-]/g, '') === user.phone?.replace(/[\s()-]/g, '')
      );
      if (match) setSelectedTestNumber(match);
    }
  }, [user?.phone]);

  // Clean up timer and reCAPTCHA on unmount or close
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Ignore clear error
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  // Handle countdown timer for code resend
  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('phone');
      setError(null);
      setOtpDigits(['', '', '', '', '', '']);
      confirmationResultRef.current = null;
    }
  }, [isOpen]);

  const handleSelectTestNumber = (testNum: FirebaseTestPhoneNumber) => {
    setSelectedTestNumber(testNum);
    setPhoneNumber(testNum.phoneNumber);
    setError(null);
  };

  // Step 1: Send OTP Verification Code
  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const sanitized = phoneNumber.trim().replace(/[\s()-]/g, '');
    if (!sanitized) {
      setError('Please enter a phone number with country code (e.g., +1 650-555-1234).');
      return;
    }

    if (!sanitized.startsWith('+')) {
      setError('Phone number must start with international country code (e.g., +1 or +91).');
      return;
    }

    setIsLoading(true);

    try {
      // Re-create RecaptchaVerifier if needed
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = createRecaptchaVerifier('phone-recaptcha-container', {
          size: 'invisible',
        });
      }

      const confirmation = await sendFirebasePhoneOtp(sanitized, recaptchaVerifierRef.current);
      confirmationResultRef.current = confirmation;

      setStep('otp');
      setCountdown(45);
      setIsLoading(false);

      // Auto-focus first digit input on transition to OTP step
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      console.warn('[Phone Auth Send Code Error]', err);
      const userMessage = getFirebaseAuthErrorMessage(err);
      setError(userMessage);
      setIsLoading(false);

      // Reset recaptcha verifier on error so it can be re-rendered cleanly
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // Ignore
        }
        recaptchaVerifierRef.current = null;
      }
    }
  };

  // Handle digit typing & auto-advance
  const handleDigitChange = (index: number, value: string) => {
    const cleanDigit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanDigit;
    setOtpDigits(newDigits);
    setError(null);

    // Auto-advance to next box if digit entered
    if (cleanDigit && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }

    // Auto-verify if all 6 digits are filled
    if (cleanDigit && index === 5 && newDigits.every((d) => d !== '')) {
      handleConfirmOtp(newDigits.join(''));
    }
  };

  // Handle backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        digitInputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  // Handle paste of 6-digit code
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/\D/g, '');
    if (pastedData.length >= 6) {
      const sixDigits = pastedData.slice(0, 6).split('');
      setOtpDigits(sixDigits);
      digitInputRefs.current[5]?.focus();
      handleConfirmOtp(sixDigits.join(''));
    }
  };

  // Step 2: Confirm OTP Code
  const handleConfirmOtp = useCallback(
    async (codeToVerify?: string) => {
      const fullCode = codeToVerify || otpDigits.join('');
      if (fullCode.length !== 6) {
        setError('Please enter all 6 digits of the verification code.');
        return;
      }

      if (!confirmationResultRef.current) {
        setError('Verification session expired. Please request a new code.');
        setStep('phone');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await confirmFirebasePhoneOtp(confirmationResultRef.current, fullCode);

        // Record verified phone number in AuthContext and update trust score
        const sanitizedPhone = phoneNumber.trim().replace(/[\s()-]/g, '');
        await recordPhoneVerificationSuccess(sanitizedPhone);

        setStep('success');
        setIsLoading(false);

        if (onSuccess) {
          onSuccess(sanitizedPhone);
        }

        // Auto-close modal after brief celebration
        setTimeout(() => {
          onClose();
        }, 1600);
      } catch (err: any) {
        console.warn('[Phone Auth Confirm Error]', err);
        const userMessage = getFirebaseAuthErrorMessage(err);
        setError(userMessage);
        setIsLoading(false);
      }
    },
    [otpDigits, phoneNumber, recordPhoneVerificationSuccess, onSuccess, onClose]
  );

  // Quick fill predefined test code
  const handleFillTestCode = () => {
    if (selectedTestNumber?.code) {
      const digits = selectedTestNumber.code.split('');
      setOtpDigits(digits);
      handleConfirmOtp(selectedTestNumber.code);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        backgroundColor: 'rgba(6, 21, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      {/* Hidden reCAPTCHA container for Firebase Phone Auth */}
      <div id="phone-recaptcha-container" style={{ display: 'none' }} />

      <div
        className="card-elevated"
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--bg-surface, #FFFFFF)',
          borderRadius: 'var(--radius-2xl, 1.25rem)',
          border: '1px solid var(--border-medium, rgba(0,0,0,0.1))',
          boxShadow: 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.2))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            backgroundColor: 'var(--bg-base, #F8FAFC)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Phone size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                Phone Verification
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary, #64748B)' }}>
                Firebase Identity Security
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #64748B)',
              cursor: 'pointer',
              padding: '0.375rem',
              borderRadius: 'var(--radius-md, 0.375rem)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem' }}>
          {/* Spark Tier vs Blaze Notice Banner */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-lg, 0.75rem)',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              marginBottom: '1.25rem',
            }}
          >
            <Info size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.75rem', color: '#1E40AF', lineHeight: 1.45 }}>
              <strong>Firebase Free Spark Tier:</strong> Cellular SMS delivery is disabled on Spark (requires Blaze plan).
              For demonstration and testing, use the preconfigured test phone numbers below with fixed 6-digit OTP codes.
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-lg, 0.75rem)',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                marginBottom: '1rem',
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          {/* STEP 1: Phone Number Input */}
          {step === 'phone' && (
            <form onSubmit={handleSendCode}>
              {/* Test Phone Numbers Quick Select */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #64748B)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.375rem',
                  }}
                >
                  Spark Test Numbers (Instant $0 SMS)
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {FIREBASE_TEST_PHONE_NUMBERS.map((testNum) => {
                    const isSelected = selectedTestNumber?.phoneNumber === testNum.phoneNumber;
                    return (
                      <button
                        key={testNum.phoneNumber}
                        type="button"
                        onClick={() => handleSelectTestNumber(testNum)}
                        style={{
                          textAlign: 'left',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius-md, 0.375rem)',
                          border: isSelected
                            ? '1.5px solid #10B981'
                            : '1px solid var(--border-medium, rgba(0,0,0,0.1))',
                          backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-base, #F8FAFC)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
                            {testNum.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748B)' }}>
                            {testNum.phoneNumber}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            padding: '0.125rem 0.375rem',
                            borderRadius: 'var(--radius-full, 9999px)',
                            backgroundColor: isSelected ? '#10B981' : '#E2E8F0',
                            color: isSelected ? '#FFFFFF' : '#475569',
                            fontWeight: 700,
                          }}
                        >
                          Code: {testNum.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Phone Input Box */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="phoneNumberInput"
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary, #64748B)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '0.375rem',
                  }}
                >
                  Phone Number (E.164 with Country Code)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="phoneNumberInput"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setSelectedTestNumber(null);
                    }}
                    placeholder="+1 650-555-1234"
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '0.625rem 0.875rem',
                      fontSize: '0.9375rem',
                      borderRadius: 'var(--radius-lg, 0.75rem)',
                      border: '1px solid var(--border-medium, rgba(0,0,0,0.15))',
                      backgroundColor: 'var(--bg-surface, #FFFFFF)',
                      color: 'var(--text-primary, #0F172A)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <p style={{ margin: '0.375rem 0 0 0', fontSize: '0.6875rem', color: 'var(--text-secondary, #64748B)' }}>
                  Format: +[country code][number], e.g., +16505551234 or +919999912345
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !phoneNumber.trim()}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: isLoading || !phoneNumber.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !phoneNumber.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {isLoading ? (
                  <span>Requesting Code...</span>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* STEP 2: 6-Digit OTP Input */}
          {step === 'otp' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary, #64748B)' }}>
                  Enter the 6-digit verification code sent to:
                </p>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                  {phoneNumber}
                </div>

                {selectedTestNumber && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: 'var(--radius-full, 9999px)',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={handleFillTestCode}
                    title="Click to automatically fill predefined test code"
                  >
                    <Sparkles size={12} />
                    <span>Spark Test OTP: <strong>{selectedTestNumber.code}</strong> (Click to fill)</span>
                  </div>
                )}
              </div>

              {/* Six Digits Box Container */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.25rem',
                }}
              >
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      digitInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    style={{
                      width: '44px',
                      height: '52px',
                      fontSize: '1.375rem',
                      fontWeight: 700,
                      textAlign: 'center',
                      borderRadius: 'var(--radius-md, 0.5rem)',
                      border: digit
                        ? '2px solid #10B981'
                        : '1px solid var(--border-medium, rgba(0,0,0,0.2))',
                      backgroundColor: digit ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-surface, #FFFFFF)',
                      color: 'var(--text-primary, #0F172A)',
                      outline: 'none',
                      boxShadow: digit ? '0 0 0 1px #10B981' : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Verify OTP Button */}
              <button
                type="button"
                onClick={() => handleConfirmOtp()}
                disabled={isLoading || otpDigits.some((d) => !d)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-lg, 0.75rem)',
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  border: 'none',
                  cursor: isLoading || otpDigits.some((d) => !d) ? 'not-allowed' : 'pointer',
                  opacity: isLoading || otpDigits.some((d) => !d) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                {isLoading ? (
                  <span>Verifying Code...</span>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Verify & Link Phone Number</span>
                  </>
                )}
              </button>

              {/* Resend and Back Controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #64748B)',
                  paddingTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary, #64748B)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Change phone number
                </button>

                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  disabled={countdown > 0 || isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: countdown > 0 ? 'var(--text-muted, #94A3B8)' : '#059669',
                    cursor: countdown > 0 ? 'default' : 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: 0,
                  }}
                >
                  <RotateCcw size={12} />
                  <span>{countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Success Confirmation */}
          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem',
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                Phone Number Verified!
              </h3>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.875rem', color: 'var(--text-secondary, #64748B)' }}>
                {phoneNumber} is linked to your Firebase account. Your Route M8 Trust Score has been updated.
              </p>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.75rem',
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#059669',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={14} />
                <span>Verified Participant Status Active</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

