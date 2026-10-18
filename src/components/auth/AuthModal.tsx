import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  Mail, 
  User, 
  Building2, 
  Car, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup' | 'forgot_password' | 'onboarding';
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
}) => {
  const { 
    signIn, 
    signUp, 
    signInWithGoogle,
    resetPassword, 
    updateProfile, 
    submitVerificationRequest, 
    isLoading, 
    error, 
    clearError 
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot_password' | 'onboarding'>(initialMode);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'both' | 'requester' | 'transporter'>('both');
  const [organization, setOrganization] = useState('');
  const [vehicle, setVehicle] = useState('Subaru Crosstrek (Hybrid)');
  const [bio, setBio] = useState('');

  // Status message for forgot password or email confirmation
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    clearError();
    setIsGoogleSigningIn(true);
    const ok = await signInWithGoogle();
    setIsGoogleSigningIn(false);
    if (ok) {
      onClose();
    }
  };


  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setInfoMessage(null);

    if (mode === 'signin') {
      const ok = await signIn(email, password);
      if (ok) {
        onClose();
      }
    } else if (mode === 'signup') {
      const res = await signUp(email, password, fullName, role, organization, username.trim() || undefined);
      if (res.success) {
        if (res.requiresEmailConfirmation) {
          setInfoMessage(res.message || 'Check your email inbox to verify your account before logging in.');
        } else {
          setMode('onboarding');
        }
      }
    } else if (mode === 'forgot_password') {
      const res = await resetPassword(email);
      if (res.success) {
        setInfoMessage(res.message);
      }
    } else if (mode === 'onboarding') {
      await updateProfile({
        role,
        organization: organization.trim() || undefined,
        commuteVehicle: vehicle.trim() || undefined,
        bio: bio.trim() || undefined,
      });

      if (organization.trim()) {
        const isEdu = organization.toLowerCase().includes('edu') || email.toLowerCase().includes('edu');
        await submitVerificationRequest({
          verificationType: isEdu ? 'student' : 'work',
          organizationName: organization.trim(),
          evidenceDomainOrId: email.split('@')[1] || organization.trim(),
          notes: 'Submitted during account onboarding',
        });
      }
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '2rem' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            color: 'var(--text-tertiary)',
            padding: '0.25rem',
            borderRadius: 'var(--radius-sm)'
          }}
        >
          <X size={20} />
        </button>

        {/* Brand Icon Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-forest-850)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-mint-400)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Route M8 Security
            </span>
            <h2 id="auth-modal-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              {mode === 'signin' && 'Welcome Back'}
              {mode === 'signup' && 'Create Your M8 Account'}
              {mode === 'forgot_password' && 'Password Recovery'}
              {mode === 'onboarding' && 'Personalize Your Profile'}
            </h2>
          </div>
        </div>

        {/* Subtitle / Explanation */}
        <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {mode === 'signin' && 'Access verified route matching, active delivery tracking and community trust points.'}
          {mode === 'signup' && 'Join thousands of commuters and peers sharing everyday routes sustainably.'}
          {mode === 'forgot_password' && 'Enter your registered email address to receive secure reset credentials.'}
          {mode === 'onboarding' && 'Verify your student or workplace affiliation to unlock highest priority matches.'}
        </p>

        {/* Global Error Banner */}
        {error && (
          <div style={{
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid var(--status-danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--status-danger-text)',
            marginBottom: '1.25rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Info Message */}
        {infoMessage && (
          <div style={{
            backgroundColor: 'var(--status-active-bg)',
            border: '1px solid var(--status-active-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: 'var(--status-active-text)',
            marginBottom: '1.25rem'
          }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Sign Up Fields */}
          {mode === 'signup' && (
            <>
              <div>
                <label className="form-label" htmlFor="auth-fullname">
                  Full Legal Name
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    placeholder="e.g. Jordan Hayes"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <User size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="auth-username">
                  Unique Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="e.g. jordan_hayes"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <span style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontWeight: 700, fontSize: '0.875rem' }}>@</span>
                </div>
                <span className="form-hint">
                  Unique, case-insensitive handle (3–30 letters, numbers, or underscores).
                </span>
              </div>
            </>
          )}

          {/* Email field (for signin, signup, forgot_password) */}
          {mode !== 'onboarding' && (
            <div>
              <label className="form-label" htmlFor="auth-email">
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-email"
                  type="email"
                  required
                  placeholder={mode === 'signup' ? 'name@campus.edu or name@company.com' : 'name@example.com'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Mail size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              </div>
              <span className="form-hint">
                {mode === 'signup' ? 'Use a .edu or company email for instant verified badge.' : 'Registered Route M8 account email.'}
              </span>
            </div>
          )}

          {/* Password field (for signin and signup) */}
          {(mode === 'signin' || mode === 'signup') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <label className="form-label" htmlFor="auth-password" style={{ margin: 0 }}>
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => { clearError(); setMode('forgot_password'); }}
                    style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600 }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          )}

          {/* Signup Specific: Role & Affiliation */}
          {mode === 'signup' && (
            <>
              <div>
                <label className="form-label">Primary Route Objective</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'both', label: 'Both' },
                    { id: 'requester', label: 'Requester' },
                    { id: 'transporter', label: 'Commuter' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRole(item.id as any)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: role === item.id ? 'var(--color-forest-700)' : 'var(--border-medium)',
                        backgroundColor: role === item.id ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                        color: role === item.id ? 'var(--color-forest-900)' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="auth-org">
                  Campus / Company Affiliation (Optional)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-org"
                    type="text"
                    placeholder="e.g. Stanford University or Google"
                    value={organization}
                    onChange={e => setOrganization(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Building2 size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                </div>
              </div>
            </>
          )}

          {/* Onboarding Specific: Commute Vehicle & Bio */}
          {mode === 'onboarding' && (
            <>
              <div>
                <label className="form-label">Preferred Platform Role</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { id: 'both', label: 'Both' },
                    { id: 'requester', label: 'Requester' },
                    { id: 'transporter', label: 'Delivery Partner' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRole(item.id as any)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: role === item.id ? 'var(--color-forest-700)' : 'var(--border-medium)',
                        backgroundColor: role === item.id ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                        color: role === item.id ? 'var(--color-forest-900)' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="onboard-vehicle">
                  Everyday Commute Mode / Vehicle
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="onboard-vehicle"
                    type="text"
                    placeholder="e.g. Subaru Crosstrek or E-Bike or Caltrain"
                    value={vehicle}
                    onChange={e => setVehicle(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Car size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="onboard-bio">
                  Community Bio
                </label>
                <textarea
                  id="onboard-bio"
                  rows={2}
                  placeholder="Share a short note about your frequent route corridor..."
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  className="form-textarea"
                />
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.8125rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                <span>Processing Request...</span>
              </>
            ) : mode === 'signin' ? (
              <>Sign In to Route M8 <ArrowRight size={16} /></>
            ) : mode === 'signup' ? (
              <>Complete Free Registration <ArrowRight size={16} /></>
            ) : mode === 'forgot_password' ? (
              <>Send Recovery Email <Mail size={16} /></>
            ) : (
              <>Enter Dashboard <CheckCircle2 size={16} /></>
            )}
          </button>

          {/* Google Sign-In Option for signin and signup modes */}
          {(mode === 'signin' || mode === 'signup') && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                margin: '0.25rem 0',
                color: 'var(--text-tertiary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                <span>or continue with</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading || isGoogleSigningIn}
                className="btn"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: 'var(--shadow-xs)'
                }}
              >
                {isGoogleSigningIn ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </>
          )}
        </form>

        {/* Modal Footer Mode Switchers */}
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)'
        }}>
          {mode === 'signin' && (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => { clearError(); setMode('signup'); }}
                style={{ color: 'var(--color-mint-600)', fontWeight: 700 }}
              >
                Create one now
              </button>
            </p>
          )}

          {(mode === 'signup' || mode === 'forgot_password') && (
            <p>
              Already a verified member?{' '}
              <button
                type="button"
                onClick={() => { clearError(); setMode('signin'); }}
                style={{ color: 'var(--color-mint-600)', fontWeight: 700 }}
              >
                Sign In
              </button>
            </p>
          )}

          {mode === 'onboarding' && (
            <button
              type="button"
              onClick={onClose}
              style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}
            >
              Skip setup for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
