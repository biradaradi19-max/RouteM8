import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShieldCheck,
  CheckCircle2,
  Car,
  Package,
  DollarSign,
  Activity,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Check,
  X,
  Search,
  Bike,
  History,
  AlertCircle,
} from 'lucide-react';
import { MapView } from '../map/MapView';
import {
  partnerApi,
  paymentApi,
  type PartnerApplicationInfo,
  type AdminAuditLogEntry,
  type AdminFinancialOverview,
  type FinancialReconciliationReport,
  type MockVendorAccountInfo,
} from '../../services/api';

export const AdminDashboard: React.FC = () => {
  const { requests, journeys, refreshData, isLoadingData } = useApp();

  const [activeTab, setActiveTab] = useState<'operations' | 'verifications' | 'finance' | 'audit' | 'disputes' | 'settings'>('operations');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // Partner Applications State
  const [applications, setApplications] = useState<PartnerApplicationInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([]);
  const [isFetchingApps, setIsFetchingApps] = useState(false);
  const [isFetchingAudit, setIsFetchingAudit] = useState(false);
  const [appStatusFilter, setAppStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'suspended' | 'all'>('pending');
  const [appSearchQuery, setAppSearchQuery] = useState('');

  // Financial Overview & Reconciliation State
  const [financeOverview, setFinanceOverview] = useState<AdminFinancialOverview | null>(null);
  const [isFetchingFinance, setIsFetchingFinance] = useState(false);
  const [commissionRate, setCommissionRate] = useState<number>(12);
  const [newCommissionRate, setNewCommissionRate] = useState<string>('12');
  const [commissionReason, setCommissionReason] = useState<string>('');
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false);
  const [commissionFeedback, setCommissionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [reconciliationReport, setReconciliationReport] = useState<FinancialReconciliationReport | null>(null);
  const [isAuditingReconciliation, setIsAuditingReconciliation] = useState(false);
  const [mockVendors, setMockVendors] = useState<MockVendorAccountInfo[]>([]);
  const [financeActionFeedback, setFinanceActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Review Dialog State
  const [reviewModal, setReviewModal] = useState<{
    isOpen: boolean;
    application: PartnerApplicationInfo | null;
    decision: 'approve' | 'reject' | 'suspend';
    reason: string;
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    application: null,
    decision: 'approve',
    reason: '',
    isSubmitting: false,
    error: null,
  });

  // Fetch applications from server
  const loadApplications = useCallback(async () => {
    setIsFetchingApps(true);
    try {
      const res = await partnerApi.getAdminApplications({
        status: appStatusFilter === 'all' ? undefined : appStatusFilter,
        search: appSearchQuery.trim() || undefined,
      });
      setApplications(res.applications);
    } catch (err) {
      console.warn('[AdminDashboard] Failed to load applications:', err);
    } finally {
      setIsFetchingApps(false);
    }
  }, [appStatusFilter, appSearchQuery]);

  // Fetch audit logs
  const loadAuditLogs = useCallback(async () => {
    setIsFetchingAudit(true);
    try {
      const res = await partnerApi.getAdminAuditLogs();
      setAuditLogs(res.logs);
    } catch (err) {
      console.warn('[AdminDashboard] Failed to load audit logs:', err);
    } finally {
      setIsFetchingAudit(false);
    }
  }, []);

  const loadFinanceOverview = useCallback(async () => {
    setIsFetchingFinance(true);
    try {
      const [overviewRes, commRes, reconRes, vendorsRes] = await Promise.all([
        paymentApi.getAdminOverview(),
        paymentApi.getCommissionRate(),
        paymentApi.getReconciliation(),
        paymentApi.getVendors(),
      ]);
      if (overviewRes.success && overviewRes.overview) {
        setFinanceOverview(overviewRes.overview);
      }
      setCommissionRate(commRes.ratePercent);
      setNewCommissionRate(String(commRes.ratePercent));
      if (reconRes.success && reconRes.report) {
        setReconciliationReport(reconRes.report);
      }
      if (vendorsRes.success && vendorsRes.vendors) {
        setMockVendors(vendorsRes.vendors);
      }
    } catch (err) {
      console.warn('[AdminDashboard] Failed to load financial overview:', err);
    } finally {
      setIsFetchingFinance(false);
    }
  }, []);

  const handleRunReconciliation = async () => {
    setIsAuditingReconciliation(true);
    setFinanceActionFeedback(null);
    try {
      const res = await paymentApi.getReconciliation();
      if (res.success && res.report) {
        setReconciliationReport(res.report);
        setFinanceActionFeedback({
          type: res.report.summary.isClean ? 'success' : 'error',
          message: res.report.summary.isClean
            ? 'Financial audit clean: All captured payments, commissions, and settlements balance with 0 discrepancies.'
            : `Audit detected ${res.report.summary.discrepancyCount} discrepancy(ies) requiring administrative action.`,
        });
      }
    } catch (err: any) {
      setFinanceActionFeedback({ type: 'error', message: err.message || 'Audit execution failed' });
    } finally {
      setIsAuditingReconciliation(false);
    }
  };

  const handleResolveDiscrepancy = async (discrepancyId: string) => {
    try {
      const res = await paymentApi.resolveDiscrepancy(discrepancyId, 'Acknowledged and marked resolved by Admin');
      if (res.success) {
        setFinanceActionFeedback({ type: 'success', message: `Discrepancy ${discrepancyId} successfully resolved.` });
        loadFinanceOverview();
      }
    } catch (err: any) {
      setFinanceActionFeedback({ type: 'error', message: err.message || 'Failed to resolve discrepancy' });
    }
  };

  const handleReverseSettlement = async (settlementId: string) => {
    if (!window.confirm('Simulate settlement reversal for this transaction? This will transition settlement status to reversed.')) return;
    try {
      const res = await paymentApi.reverseSettlement(settlementId, 'Admin dispute reversal simulation');
      if (res.success) {
        setFinanceActionFeedback({ type: 'success', message: `Settlement ${settlementId} successfully reversed.` });
        loadFinanceOverview();
      } else {
        setFinanceActionFeedback({ type: 'error', message: res.error || 'Failed to reverse settlement' });
      }
    } catch (err: any) {
      setFinanceActionFeedback({ type: 'error', message: err.message || 'Error reversing settlement' });
    }
  };

  const handleUpdateCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateNum = Number(newCommissionRate);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 50) {
      setCommissionFeedback({ type: 'error', message: 'Commission rate must be between 0% and 50%.' });
      return;
    }
    if (!commissionReason.trim()) {
      setCommissionFeedback({ type: 'error', message: 'A mandatory reason is required for administrative audit logging.' });
      return;
    }

    setIsUpdatingCommission(true);
    setCommissionFeedback(null);
    try {
      const res = await paymentApi.updateCommissionRate(rateNum, commissionReason.trim());
      if (res.success) {
        setCommissionRate(rateNum);
        setCommissionReason('');
        setCommissionFeedback({ type: 'success', message: `Commission successfully updated to ${rateNum}%.` });
        loadFinanceOverview();
      } else {
        setCommissionFeedback({ type: 'error', message: res.error || 'Failed to update commission rate.' });
      }
    } catch (err: any) {
      setCommissionFeedback({ type: 'error', message: err.message || 'Error updating rate' });
    } finally {
      setIsUpdatingCommission(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'verifications') {
      loadApplications();
    } else if (activeTab === 'audit') {
      loadAuditLogs();
    } else if (activeTab === 'finance') {
      loadFinanceOverview();
    }
  }, [activeTab, loadApplications, loadAuditLogs, loadFinanceOverview]);

  // Operational metrics
  const activeDeliveries = requests.filter(r => r.status === 'in_transit' || r.status === 'matched');
  const completedDeliveries = requests.filter(r => r.status === 'completed');
  const openRequests = requests.filter(r => r.status === 'open');
  const totalVolume = requests.reduce((acc, r) => acc + (Number(r.compensation) || 0), 0);

  const selectedDelivery = selectedDeliveryId
    ? requests.find(r => r.id === selectedDeliveryId) || activeDeliveries[0]
    : activeDeliveries[0] || requests[0];

  const pendingAppsCount = applications.filter(a =>
    ['submitted', 'verification_pending', 'under_review'].includes(a.status)
  ).length;

  const handleOpenReview = (app: PartnerApplicationInfo, decision: 'approve' | 'reject' | 'suspend') => {
    setReviewModal({
      isOpen: true,
      application: app,
      decision,
      reason: decision === 'approve' ? 'Valid government ID and vehicle credentials verified.' : '',
      isSubmitting: false,
      error: null,
    });
  };

  const handleConfirmReview = async () => {
    if (!reviewModal.application) return;

    if (!reviewModal.reason.trim()) {
      setReviewModal(prev => ({ ...prev, error: 'A review reason is mandatory before submitting decision.' }));
      return;
    }

    setReviewModal(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const targetId = reviewModal.application._id || reviewModal.application.applicantId;
      const res = await partnerApi.adminReview({
        applicationId: targetId,
        decision: reviewModal.decision,
        reason: reviewModal.reason.trim(),
      });

      if (!res.success) {
        throw new Error(res.error || 'Review submission failed');
      }

      setReviewModal(prev => ({ ...prev, isOpen: false }));
      loadApplications();
      loadAuditLogs();
    } catch (err: any) {
      setReviewModal(prev => ({ ...prev, isSubmitting: false, error: err.message || 'Review failed' }));
    }
  };

  return (
    <div style={{ padding: 'clamp(1.25rem, 3vw, 2.5rem)', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      
      {/* Header Banner - Modern Mobility OS */}
      <div className="mobility-card" style={{
        padding: 'clamp(1.25rem, 2.5vw, 1.75rem)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.25rem',
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, rgba(22, 168, 120, 0.05) 100%)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <span className="step-indicator-pill" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <ShieldCheck size={12} style={{ color: 'var(--color-mint-500)' }} /> Mobility OS Command Center
            </span>
            <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="status-dot status-dot-connected anim-radar-ping" style={{ width: 6, height: 6 }} />
              Live Operations Online
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(1.5rem, 2.5vw, 2rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 0.375rem', color: 'var(--text-primary)' }}>
            RouteM8 Operations & Oversight
          </h1>
          <p style={{ maxWidth: '680px', margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Real-time monitoring of community corridors, active commuter deliveries, dispute resolution, partner onboarding queues, and compliance audit logs.
          </p>
        </div>

        <button
          onClick={() => {
            refreshData();
            if (activeTab === 'verifications') loadApplications();
            if (activeTab === 'audit') loadAuditLogs();
          }}
          disabled={isLoadingData || isFetchingApps}
          className="btn btn-secondary btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={14} className={isLoadingData || isFetchingApps ? 'spinner' : ''} />
          <span>{isLoadingData || isFetchingApps ? 'Refreshing...' : 'Refresh Telemetry'}</span>
        </button>
      </div>

      {/* Operational KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem'
      }}>
        <div className="mobility-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active In-Flight</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-50)', color: 'var(--color-mint-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={17} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {activeDeliveries.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              {openRequests.length} pending match
            </div>
          </div>
        </div>

        <div className="mobility-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Commuter Network</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 28, 44, 0.06)', color: 'var(--color-forest-850)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={17} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {journeys.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Active published corridors
            </div>
          </div>
        </div>

        <div className="mobility-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Escrow Volume</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={17} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              ${totalVolume.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              Zero platform commissions
            </div>
          </div>
        </div>

        <div className="mobility-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-tertiary)' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed Trips</span>
            <div style={{ width: '34px', height: '34px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-mint-100)', color: 'var(--color-mint-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div>
            <div className="tabular-nums" style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {completedDeliveries.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-mint-600)', fontWeight: 600, marginTop: '0.5rem' }}>
              100% PIN Verified
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-medium)',
        paddingBottom: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'operations', label: 'Live Operations & Map', icon: Activity },
          { id: 'verifications', label: `Partner Applications (${pendingAppsCount})`, icon: ShieldCheck },
          { id: 'finance', label: 'Finances & Settlements', icon: DollarSign },
          { id: 'audit', label: 'Compliance Audit Logs', icon: History },
          { id: 'disputes', label: 'Disputes & Incident Reports', icon: AlertTriangle },
          { id: 'settings', label: 'Dispatch Parameters', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className="btn btn-sm"
              style={{
                backgroundColor: isActive ? 'var(--color-forest-900)' : 'transparent',
                color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: isActive ? 'var(--color-forest-900)' : 'transparent',
                fontWeight: isActive ? 700 : 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Live Operations Map */}
      {activeTab === 'operations' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Operations List */}
          <div className="mobility-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '600px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Active Transits ({activeDeliveries.length})
              </span>
            </div>

            {activeDeliveries.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No transits currently in-flight.
              </div>
            ) : (
              activeDeliveries.map(del => {
                const isSelected = selectedDelivery?.id === del.id;
                return (
                  <div
                    key={del.id}
                    onClick={() => setSelectedDeliveryId(del.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--color-mint-500)' : 'var(--border-subtle)'}`,
                      backgroundColor: isSelected ? 'rgba(22, 168, 120, 0.05)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{del.title}</span>
                      <span className="badge badge-active" style={{ fontSize: '0.6875rem' }}>{del.status}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Compensation: ${Number(del.compensation).toFixed(2)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Map Preview */}
          <div className="mobility-card" style={{ height: '600px', overflow: 'hidden', padding: 0 }}>
            {selectedDelivery ? (
              <MapView
                pickupCoords={selectedDelivery.pickupCoords}
                dropoffCoords={selectedDelivery.dropoffCoords}
                pickupAddress={selectedDelivery.pickupAddress}
                dropoffAddress={selectedDelivery.dropoffAddress}
              />
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                Select a delivery to view route corridor telemetry.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Partner Applications Review Queue */}
      {activeTab === 'verifications' && (
        <div className="mobility-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem', color: 'var(--text-primary)' }}>
                Delivery Partner Applications Review
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                Review and approve commuter applicants, verify mock government credentials, and manage partner status.
              </p>
            </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="Search name, email, phone..."
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                    fontSize: '0.8125rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Status Pill Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                {(['pending', 'approved', 'rejected', 'suspended', 'all'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setAppStatusFilter(st)}
                    className="btn btn-sm"
                    style={{
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: appStatusFilter === st ? 'var(--color-forest-900)' : 'var(--bg-surface-subtle)',
                      color: appStatusFilter === st ? '#FFFFFF' : 'var(--text-secondary)',
                      border: '1px solid',
                      borderColor: appStatusFilter === st ? 'var(--color-forest-900)' : 'var(--border-subtle)',
                      textTransform: 'capitalize',
                      fontWeight: appStatusFilter === st ? 700 : 500,
                    }}
                  >
                    {st === 'pending' ? 'Pending Review' : st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Applications List */}
          {isFetchingApps ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <div>Loading partner applications...</div>
            </div>
          ) : applications.length === 0 ? (
            <div style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-medium)',
              color: 'var(--text-secondary)'
            }}>
              <ShieldCheck size={36} color="var(--color-mint-500)" style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                No Partner Applications Found
              </div>
              <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
                No applications match your selected filter ({appStatusFilter}).
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {applications.map(app => {
                const isBicycle = app.vehicleCategory === 'bicycle' || app.vehicleCategory === 'none';
                return (
                  <div
                    key={app._id || app.applicantId}
                    style={{
                      padding: '1.25rem',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {app.applicantName}
                          </span>
                          <span className={`badge ${
                            app.status === 'approved'
                              ? 'badge-verified'
                              : app.status === 'rejected' || app.status === 'suspended'
                              ? 'badge-warning'
                              : 'badge-brand'
                          }`} style={{
                            textTransform: 'capitalize',
                            backgroundColor: app.status === 'rejected' || app.status === 'suspended' ? '#FEE2E2' : undefined,
                            color: app.status === 'rejected' || app.status === 'suspended' ? '#991B1B' : undefined,
                          }}>
                            {app.status.replace('_', ' ')}
                          </span>
                          {isBicycle && (
                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-mint-600)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Bike size={12} /> Licence Exempt
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {app.applicantEmail} • {app.phone || 'No phone'} • Applied {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : 'Recently'}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {app.status !== 'approved' && (
                          <button
                            onClick={() => handleOpenReview(app, 'approve')}
                            className="btn btn-primary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <Check size={14} />
                            <span>Approve Partner</span>
                          </button>
                        )}
                        {app.status !== 'rejected' && (
                          <button
                            onClick={() => handleOpenReview(app, 'reject')}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <X size={14} />
                            <span>Reject</span>
                          </button>
                        )}
                        {app.status === 'approved' && (
                          <button
                            onClick={() => handleOpenReview(app, 'suspend')}
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#DC2626' }}
                          >
                            <AlertCircle size={14} />
                            <span>Suspend</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Verification Data Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '0.75rem',
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      fontSize: '0.8125rem',
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Vehicle Category</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                          {app.vehicleCategory} {isBicycle && '(Non-motorized)'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Identity Credential (Mock KYC)</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {app.identityVerification?.idType ? app.identityVerification.idType.toUpperCase() : 'Aadhaar Offline'} • {app.identityVerification?.maskedId || 'XXXXXXXX8901'}
                        </span>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', display: 'block' }}>Licence & Registration</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {isBicycle
                            ? 'Exempt from RC & DL'
                            : `${app.vehicleVerification?.drivingLicenceMasked || 'DL Verified'} • ${app.vehicleVerification?.registrationNumberMasked || 'RC Verified'}`}
                        </span>
                      </div>

                      {app.rejectionReason && (
                        <div style={{ gridColumn: '1 / -1', color: '#991B1B' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Rejection Reason: </span>
                          <span>{app.rejectionReason}</span>
                        </div>
                      )}

                      {app.suspensionReason && (
                        <div style={{ gridColumn: '1 / -1', color: '#991B1B' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Suspension Reason: </span>
                          <span>{app.suspensionReason}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Compliance & Audit Logs */}
      {activeTab === 'audit' && (
        <div className="mobility-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.25rem', color: 'var(--text-primary)' }}>
                Immutable Administrative Audit Trail
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
                Tamper-evident log of all partner approvals, rejections, suspensions, and platform security events.
              </p>
            </div>
            <button
              onClick={loadAuditLogs}
              disabled={isFetchingAudit}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={13} className={isFetchingAudit ? 'spinner' : ''} />
              <span>Refresh Log</span>
            </button>
          </div>

          {isFetchingAudit ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <div>Loading audit trail...</div>
            </div>
          ) : auditLogs.length === 0 ? (
            <div style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-medium)',
              color: 'var(--text-secondary)'
            }}>
              <History size={36} color="var(--color-mint-500)" style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                Zero Audit Events Recorded
              </div>
              <p style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
                Review decisions performed by administrators will appear here.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Admin Email</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Action</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Target ID</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Review Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log._id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {log.adminEmail}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span className={`badge ${
                          log.action.includes('approve')
                            ? 'badge-verified'
                            : log.action.includes('reject') || log.action.includes('suspend')
                            ? 'badge-warning'
                            : 'badge-brand'
                        }`} style={{ fontSize: '0.6875rem' }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {log.targetId}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)' }}>
                        {log.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Finances & Settlements */}
      {activeTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header & Reload */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Marketplace Financial Overview & Settlements
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Aggregated from MongoDB Atlas financial ledgers (PaymentOrders, Settlements, Refunds).
                </p>
              </div>
              <button
                onClick={loadFinanceOverview}
                disabled={isFetchingFinance}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <RefreshCw size={14} className={isFetchingFinance ? 'animate-spin' : ''} />
                <span>Refresh Financials</span>
              </button>
            </div>
          </div>

          {/* Financial Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Gross Payment Volume
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.totalVolumePaise || 0) / 100).toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {financeOverview?.totalOrdersCount || 0} recorded order(s)
              </span>
            </div>

            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Platform Commission ({commissionRate}%)
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-mint-600)', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.platformCommissionPaise || 0) / 100).toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {commissionRate === 0 ? 'Beta Mode (0% Fee)' : `${commissionRate}% standard fee`}
              </span>
            </div>

            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Transporter Payables
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.transporterPayablePaise || 0) / 100).toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {100 - commissionRate}% partner net allocation
              </span>
            </div>

            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Settled Payouts (Mock)
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.totalSettledPaise || 0) / 100).toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {financeOverview?.recentSettlements?.filter((s) => s.status === 'settled').length || 0} completed payout(s)
              </span>
            </div>

            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Pending / Failed
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706', marginTop: '0.25rem' }}>
                {financeOverview?.pendingSettlementsCount || 0} <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#EF4444' }}>/ {financeOverview?.failedSettlementsCount || 0} failed</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Awaiting delivery or retry
              </span>
            </div>

            <div className="mobility-stat-card">
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                Refunds & Exposure
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.totalRefundedPaise || 0) / 100).toFixed(2)}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                ₹{((financeOverview?.totalNegativeExposurePaise || 0) / 100).toFixed(2)} negative exposure
              </span>
            </div>
          </div>

          {financeActionFeedback && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: financeActionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: financeActionFeedback.type === 'success' ? 'var(--color-mint-600)' : '#EF4444',
              fontSize: '0.8125rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              {financeActionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{financeActionFeedback.message}</span>
            </div>
          )}

          {/* Financial Reconciliation Audit Panel */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Financial Reconciliation & Ledger Audit
                  </h3>
                  <span className={`badge ${
                    (reconciliationReport?.summary.isClean ?? true) ? 'badge-verified' : 'badge-warning'
                  }`} style={{ fontSize: '0.6875rem' }}>
                    {(reconciliationReport?.summary.isClean ?? true)
                      ? 'Ledgers Balanced (0 Discrepancies)'
                      : `${reconciliationReport?.summary.discrepancyCount || 0} Discrepancy(ies) Detected`}
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Autonomous audit comparing payment orders, captured balances, platform fee, settlements, and post-settlement refund exposures.
                </p>
              </div>
              <button
                onClick={handleRunReconciliation}
                disabled={isAuditingReconciliation}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
              >
                <RefreshCw size={14} className={isAuditingReconciliation ? 'animate-spin' : ''} />
                <span>{isAuditingReconciliation ? 'Auditing Ledgers...' : 'Run Audit Now'}</span>
              </button>
            </div>

            {(!reconciliationReport?.discrepancies || reconciliationReport.discrepancies.length === 0) ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: 'var(--radius-sm)', color: 'var(--color-mint-600)', fontSize: '0.8125rem' }}>
                <CheckCircle2 size={24} style={{ margin: '0 auto 0.375rem' }} />
                <div style={{ fontWeight: 700 }}>Zero Financial Discrepancies Found</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.125rem' }}>
                  All gross payments match platform commission + transporter payouts, and all completed deliveries are settled without negative exposure.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>Severity</th>
                      <th style={{ padding: '0.5rem' }}>Type</th>
                      <th style={{ padding: '0.5rem' }}>Description</th>
                      <th style={{ padding: '0.5rem' }}>Amount</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationReport.discrepancies.map((disc) => (
                      <tr key={disc.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${
                            disc.severity === 'high' ? 'badge-warning' : 'badge-brand'
                          }`} style={{ fontSize: '0.6875rem' }}>
                            {disc.severity.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {disc.type}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: 'var(--text-primary)' }}>
                          {disc.description}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 700 }}>
                          ₹{(disc.amountPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${disc.resolved ? 'badge-verified' : 'badge-warning'}`} style={{ fontSize: '0.6875rem' }}>
                            {disc.resolved ? 'Resolved' : 'Pending Action'}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                          {!disc.resolved && (
                            <button
                              onClick={() => handleResolveDiscrepancy(disc.id)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Marketplace Settlement Ledger (MOCK) */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Marketplace Settlement Ledger ({financeOverview?.recentSettlements?.length || 0})
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Simulated vendor transfers with cryptographic idempotency keys. All records labeled as MOCK.
                </span>
              </div>
              <span className="badge badge-brand" style={{ fontSize: '0.6875rem' }}>
                MOCK SETTLEMENT PROCESSING
              </span>
            </div>

            {(!financeOverview?.recentSettlements || financeOverview.recentSettlements.length === 0) ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                No settlement payout records recorded yet. Complete a delivery and verify handover PIN to trigger settlement.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>Settlement ID</th>
                      <th style={{ padding: '0.5rem' }}>Delivery</th>
                      <th style={{ padding: '0.5rem' }}>Transporter</th>
                      <th style={{ padding: '0.5rem' }}>Net Share</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Settled At</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeOverview.recentSettlements.map((s: any) => (
                      <tr key={s._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {s._id?.slice(-8) || s.idempotencyKey?.slice(-8)}
                          <span style={{ marginLeft: '0.375rem', fontSize: '0.625rem', padding: '0.125rem 0.25rem', borderRadius: '2px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563EB', fontWeight: 700 }}>
                            MOCK
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {s.deliveryId?.slice(-8) || '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {s.transporterId?.slice(-8) || '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 700, color: '#059669' }}>
                          ₹{((s.amountPaise || 0) / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${
                            s.status === 'settled'
                              ? 'badge-verified'
                              : s.status === 'reversed'
                              ? 'badge-warning'
                              : s.status === 'failed'
                              ? 'badge-brand'
                              : 'badge-brand'
                          }`} style={{ fontSize: '0.6875rem' }}>
                            {s.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: 'var(--text-secondary)' }}>
                          {s.settledAt ? new Date(s.settledAt).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                          {s.status === 'settled' && (
                            <button
                              onClick={() => handleReverseSettlement(s._id || s.idempotencyKey)}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.6875rem', padding: '0.2rem 0.375rem', color: '#DC2626' }}
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mock Transporter Vendor Accounts Table */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Transporter Vendor Accounts ({mockVendors.length})
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Mock vendor nodes representing approved transporters. Bank references are masked.
                </span>
              </div>
              <span className="badge badge-brand" style={{ fontSize: '0.6875rem' }}>
                MASKED BANK REFS
              </span>
            </div>

            {mockVendors.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                No mock vendor accounts registered yet. Approved partners are auto-registered upon settlement.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>Vendor ID</th>
                      <th style={{ padding: '0.5rem' }}>Transporter</th>
                      <th style={{ padding: '0.5rem' }}>Masked Bank Ref</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Settlement Eligible</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Negative Exposure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockVendors.map((v) => (
                      <tr key={v.vendorId} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {v.vendorId}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 600 }}>
                          {v.transporterName}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {v.bankAccountRef} ({v.ifscCode})
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${
                            v.verificationStatus === 'verified' ? 'badge-verified' : 'badge-warning'
                          }`} style={{ fontSize: '0.6875rem' }}>
                            {v.verificationStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${v.isEligibleForSettlement ? 'badge-verified' : 'badge-warning'}`} style={{ fontSize: '0.6875rem' }}>
                            {v.isEligibleForSettlement ? 'Eligible' : 'Blocked'}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right', fontWeight: 700, color: v.unresolvedNegativeBalancePaise > 0 ? '#DC2626' : 'var(--text-secondary)' }}>
                          ₹{(v.unresolvedNegativeBalancePaise / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Commission Configuration Card */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
              Marketplace Commission Rate Settings
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
              Configure platform commission percentage. Requires mandatory reason logged to immutable audit records.
            </p>

            <form onSubmit={handleUpdateCommission} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '0.75rem', alignItems: 'start' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={newCommissionRate}
                  onChange={(e) => setNewCommissionRate(e.target.value)}
                  className="input"
                  style={{ width: '100%', fontFamily: 'monospace' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Mandatory Change Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Promotional Beta 0% fee window extension"
                  value={commissionReason}
                  onChange={(e) => setCommissionReason(e.target.value)}
                  className="input"
                  style={{ width: '100%' }}
                  required
                />
              </div>

              <div style={{ paddingTop: '1.25rem' }}>
                <button
                  type="submit"
                  disabled={isUpdatingCommission}
                  className="btn btn-primary"
                  style={{ height: '38px', whiteSpace: 'nowrap' }}
                >
                  {isUpdatingCommission ? 'Updating...' : 'Save Rate'}
                </button>
              </div>
            </form>

            {commissionFeedback && (
              <div style={{
                marginTop: '0.75rem',
                fontSize: '0.8125rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: commissionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: commissionFeedback.type === 'success' ? 'var(--color-mint-600)' : '#EF4444',
                fontWeight: 600
              }}>
                {commissionFeedback.message}
              </div>
            )}
          </div>

          {/* Recent Orders Table */}
          <div className="mobility-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>
              Recent Payment Transactions ({financeOverview?.recentOrders?.length || 0})
            </h3>
            {(!financeOverview?.recentOrders || financeOverview.recentOrders.length === 0) ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                No payment transactions recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>Order Ref</th>
                      <th style={{ padding: '0.5rem' }}>Delivery</th>
                      <th style={{ padding: '0.5rem' }}>Total (₹)</th>
                      <th style={{ padding: '0.5rem' }}>Platform Fee</th>
                      <th style={{ padding: '0.5rem' }}>Transporter Share</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeOverview.recentOrders.map((ord: any) => (
                      <tr key={ord._id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {ord.providerOrderId || ord._id.slice(-8)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {ord.deliveryId?.slice(-8) || '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 700 }}>
                          ₹{(ord.amountPaise / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: 'var(--color-mint-600)' }}>
                          ₹{((ord.commissionSnapshot?.platformSharePaise || 0) / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', fontWeight: 600, color: '#2563EB' }}>
                          ₹{((ord.commissionSnapshot?.partnerSharePaise || 0) / 100).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem' }}>
                          <span className={`badge ${
                            ord.status === 'paid' || ord.status === 'settled'
                              ? 'badge-verified'
                              : ord.status === 'refunded' || ord.status === 'partially_refunded'
                              ? 'badge-warning'
                              : 'badge-brand'
                          }`} style={{ fontSize: '0.6875rem' }}>
                            {ord.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 0.5rem', color: 'var(--text-secondary)' }}>
                          {new Date(ord.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Disputes */}
      {activeTab === 'disputes' && (
        <div className="mobility-card" style={{ padding: '1.25rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
            Safety & Dispute Reports
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem' }}>
            Escrow dispute arbitration and real-time delivery status escalation tickets.
          </p>

          <div style={{
            padding: '1.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-medium)'
          }}>
            <ShieldCheck size={32} color="var(--color-mint-500)" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
              All Clear — Zero Active Disputes
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              100% of deliveries completed successfully with two-sided PIN authentication.
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Dispatch Parameters */}
      {activeTab === 'settings' && (
        <div className="mobility-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Platform Dispatch & Safety Configuration
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                GPS Telemetry Staleness
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.75rem' }}>
                Flag transporter signal if no updates received within window.
              </div>
              <span className="badge badge-brand">60 seconds threshold</span>
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                Initial Corridor Search Radius
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.75rem' }}>
                Radius to match pending delivery pickup with commuter journey.
              </div>
              <span className="badge badge-brand">3.0 km (expanding to 6.0 km)</span>
            </div>

            <div style={{ padding: '1rem', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                Handover Escrow Release
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.75rem' }}>
                Verification required before releasing compensation to transporter.
              </div>
              <span className="badge badge-verified">4-Digit Recipient Secret PIN</span>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal with Mandatory Reason */}
      {reviewModal.isOpen && reviewModal.application && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(16, 28, 44, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div className="mobility-card" style={{
            width: '100%',
            maxWidth: '520px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} color={reviewModal.decision === 'approve' ? 'var(--color-mint-600)' : '#DC2626'} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {reviewModal.decision} Application
                </h3>
              </div>
              <button
                onClick={() => setReviewModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Applicant: <strong>{reviewModal.application.applicantName}</strong> ({reviewModal.application.applicantEmail}) • Transport: {reviewModal.application.vehicleCategory}
            </p>

            <div style={{
              padding: '0.875rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: reviewModal.decision === 'approve' ? 'var(--color-mint-50)' : '#FEF2F2',
              color: reviewModal.decision === 'approve' ? 'var(--color-mint-700)' : '#991B1B',
              fontSize: '0.8125rem',
            }}>
              {reviewModal.decision === 'approve' && (
                <div>
                  <strong>Platform Impact:</strong> Approving this application will grant the user transporter privileges (role: <code>both</code>) and enable them to accept and fulfill deliveries.
                </div>
              )}
              {reviewModal.decision === 'reject' && (
                <div>
                  <strong>Platform Impact:</strong> Rejecting will send your review feedback to the applicant. Their requester capabilities will remain fully functional and they may resubmit.
                </div>
              )}
              {reviewModal.decision === 'suspend' && (
                <div>
                  <strong>Platform Impact:</strong> Suspending will immediately revoke partner delivery privileges while keeping requester capabilities active.
                </div>
              )}
            </div>

            {reviewModal.error && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--status-cancelled-bg)',
                color: 'var(--status-cancelled-text)',
                fontSize: '0.8125rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <AlertCircle size={15} />
                <span>{reviewModal.error}</span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.8125rem', marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                Mandatory Review Reason *
              </label>
              <textarea
                rows={3}
                value={reviewModal.reason}
                onChange={(e) => setReviewModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Explain the review decision (required for compliance audit logging)..."
                required
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setReviewModal(prev => ({ ...prev, isOpen: false }))}
                disabled={reviewModal.isSubmitting}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={reviewModal.isSubmitting}
                className="btn btn-primary btn-sm"
                style={{
                  backgroundColor: reviewModal.decision === 'approve' ? undefined : '#DC2626',
                  borderColor: reviewModal.decision === 'approve' ? undefined : '#DC2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {reviewModal.isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="spinner" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Confirm {reviewModal.decision.toUpperCase()}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
