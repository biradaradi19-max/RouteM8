import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Package, AlertCircle, PlusCircle } from 'lucide-react';
import { DeliveryCard } from './DeliveryCard';

interface DeliveriesViewProps {
  onOpenCreateRequest: () => void;
}

export const DeliveriesView: React.FC<DeliveriesViewProps> = ({ onOpenCreateRequest }) => {
  const { requests, updateRequestStatus, setCurrentView, backendError } = useApp();
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'completed'>('all');

  const filtered = requests.filter((r) => {
    if (activeTab === 'active') return r.status === 'open' || r.status === 'matched' || r.status === 'in_transit';
    if (activeTab === 'completed') return r.status === 'completed';
    return true;
  });

  return (
    <div style={{ padding: 'clamp(1.25rem, 3vw, 2.5rem)', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {backendError && (
        <div
          style={{
            backgroundColor: 'var(--status-cancelled-bg)',
            border: '1px solid var(--status-cancelled-border)',
            color: 'var(--status-cancelled-text)',
            borderRadius: 'var(--radius-md)',
            padding: '0.875rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.875rem',
          }}
        >
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
            Delivery Operations & Live GPS
          </h1>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Track in-transit parcels in real time, verify recipient PINs, and manage commuter handovers.
          </p>
        </div>

        <button onClick={onOpenCreateRequest} className="btn btn-primary">
          <PlusCircle size={18} />
          <span>New Delivery Request</span>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-medium)', paddingBottom: '0.75rem' }}>
        {[
          { id: 'all', label: 'All Deliveries', count: requests.length },
          { id: 'active', label: 'Active / Pending', count: requests.filter((r) => r.status !== 'completed').length },
          { id: 'completed', label: 'Completed', count: requests.filter((r) => r.status === 'completed').length },
        ].map((tab) => (
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
              gap: '0.375rem',
            }}
          >
            <span>{tab.label}</span>
            <span
              className="tabular-nums"
              style={{
                fontSize: '0.75rem',
                opacity: activeTab === tab.id ? 0.9 : 0.6,
                backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)',
                padding: '0.1rem 0.4rem',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filtered.map((req) => (
            <DeliveryCard
              key={req.id}
              request={req}
              onInspectMatch={() => setCurrentView('matching')}
              onUpdateStatus={updateRequestStatus}
            />
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
          <button onClick={onOpenCreateRequest} className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem' }}>
            <PlusCircle size={15} />
            <span>Post an Item Delivery</span>
          </button>
        </div>
      )}
    </div>
  );
};
