import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Package, 
  CheckCircle2, 
  Key, 
  AlertCircle, 
  PlusCircle,
} from 'lucide-react';

interface DeliveriesViewProps {
  onOpenCreateRequest: () => void;
}

export const DeliveriesView: React.FC<DeliveriesViewProps> = ({ onOpenCreateRequest }) => {
  const { requests, updateRequestStatus, setCurrentView, backendError } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const filtered = requests.filter(r => {
    if (activeTab === 'active') return r.status === 'open' || r.status === 'matched' || r.status === 'in_transit';
    if (activeTab === 'completed') return r.status === 'completed';
    return true;
  });

  const handleVerify = async (requestId: string) => {
    setFeedbackMsg(null);
    setIsVerifying(true);
    try {
      const res = await updateRequestStatus(requestId, 'completed', pinCode);
      if (res.success) {
        setFeedbackMsg({ text: 'PIN verified successfully! Handover completed and compensation released.', isError: false });
        setPinCode('');
        setTimeout(() => {
          setVerifyingId(null);
          setFeedbackMsg(null);
        }, 2000);
      } else {
        setFeedbackMsg({ text: res.message || 'Incorrect PIN code.', isError: true });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div style={{ padding: 'clamp(1.25rem, 3vw, 2.5rem)', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {backendError && (
        <div style={{
          backgroundColor: 'var(--status-cancelled-bg)',
          border: '1px solid var(--status-cancelled-border)',
          color: 'var(--status-cancelled-text)',
          borderRadius: 'var(--radius-md)',
          padding: '0.875rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Backend Notice:</strong> {backendError}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', margin: '0 0 0.375rem' }}>
            Delivery Operations & Handovers
          </h1>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Track in-transit parcels, verify recipient PINs, and review completed errands.
          </p>
        </div>

        <button
          onClick={onOpenCreateRequest}
          className="btn btn-primary"
        >
          <PlusCircle size={18} />
          <span>New Delivery Request</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-medium)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'all', label: 'All Deliveries', count: requests.length },
          { id: 'active', label: 'Active / Pending', count: requests.filter(r => r.status !== 'completed').length },
          { id: 'completed', label: 'Completed', count: requests.filter(r => r.status === 'completed').length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.875rem',
              fontWeight: 600,
              backgroundColor: activeTab === tab.id ? 'var(--color-forest-850)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
              border: '1px solid',
              borderColor: activeTab === tab.id ? 'var(--color-forest-850)' : 'var(--border-subtle)',
              transition: 'all var(--transition-fast)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem'
            }}
          >
            <span>{tab.label}</span>
            <span className="tabular-nums" style={{
              fontSize: '0.75rem',
              opacity: activeTab === tab.id ? 0.9 : 0.6,
              backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)',
              padding: '0.1rem 0.4rem',
              borderRadius: 'var(--radius-full)'
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filtered.map(req => (
            <div
              key={req.id}
              className="card-interactive"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--border-medium)',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span className={`badge badge-${req.status === 'completed' ? 'completed' : req.status === 'open' ? 'pending' : 'active'}`}>
                      {req.status.replace('_', ' ')}
                    </span>
                    <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Created {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>{req.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    {req.description}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Compensation
                  </div>
                  <div className="tabular-nums" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-forest-850)' }}>
                    ${req.compensation.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Waypoints */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-mint-600)', marginBottom: '0.25rem' }}>
                    Pickup Location
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {req.pickupAddress}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-forest-700)', marginBottom: '0.25rem' }}>
                    Dropoff Destination
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {req.dropoffAddress}
                  </div>
                </div>
              </div>

              {/* Handover & Status Controls */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    backgroundColor: 'var(--bg-brand-subtle)',
                    border: '1px dashed var(--color-forest-600)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.375rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem'
                  }}>
                    <Key size={14} color="var(--color-forest-800)" />
                    <span>Handover Verification PIN: <strong className="tabular-nums" style={{ letterSpacing: '0.08em' }}>{req.handoverPin}</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {req.status === 'open' && (
                    <button
                      onClick={() => setCurrentView('matching')}
                      className="btn btn-secondary btn-sm"
                    >
                      Find Route Match
                    </button>
                  )}

                  {req.status === 'matched' && (
                    <button
                      onClick={() => updateRequestStatus(req.id, 'in_transit')}
                      className="btn btn-secondary btn-sm"
                    >
                      Mark In Transit
                    </button>
                  )}

                  {req.status !== 'completed' && (
                    <button
                      onClick={() => setVerifyingId(verifyingId === req.id ? null : req.id)}
                      className="btn btn-accent btn-sm"
                    >
                      <CheckCircle2 size={15} />
                      <span>Verify Handover PIN</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Verify Handover Drawer */}
              {verifyingId === req.id && (
                <div style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  boxShadow: 'var(--shadow-md)',
                  animation: 'modal-fade-in 0.2s ease'
                }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Recipient Handover Code Verification:
                  </div>

                  {feedbackMsg && (
                    <div style={{
                      color: feedbackMsg.isError ? 'var(--status-danger-text)' : 'var(--status-active-text)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {feedbackMsg.isError ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                      <span>{feedbackMsg.text}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '320px' }}>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="4-digit PIN"
                      value={pinCode}
                      onChange={e => setPinCode(e.target.value)}
                      className="form-input tabular-nums"
                      style={{ textAlign: 'center', letterSpacing: '0.25em', fontWeight: 700, fontSize: '1.125rem' }}
                    />
                    <button
                      onClick={() => handleVerify(req.id)}
                      disabled={pinCode.length !== 4 || isVerifying}
                      className="btn btn-primary btn-sm"
                      style={{ minWidth: '85px' }}
                    >
                      {isVerifying ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
                      <span>{isVerifying ? 'Verifying...' : 'Verify'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state-box">
          <div className="empty-state-icon-wrap">
            <Package size={30} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>No Deliveries Found</h3>
            <p style={{ margin: '0.375rem 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Create a new delivery request or accept a candidate match on your commute route.
            </p>
          </div>
          <button
            onClick={onOpenCreateRequest}
            className="btn btn-primary btn-sm"
            style={{ marginTop: '0.5rem' }}
          >
            <PlusCircle size={15} />
            <span>Post an Item Delivery</span>
          </button>
        </div>
      )}

    </div>
  );
};
