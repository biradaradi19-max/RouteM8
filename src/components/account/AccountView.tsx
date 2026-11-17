import React, { useState, useEffect } from 'react';
import {
  User,
  MapPin,
  Car,
  FileCheck,
  Sliders,
  Package,
  History,
  CreditCard,
  Wallet,
  Bell,
  Lock,
  HelpCircle,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Edit3,
  Save,
  ShieldCheck,
  Trash2,
  Plus,
  ChevronRight,
  Phone,
  Mail,
  Building,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../services/currency';
import { PartnerOnboardingModal } from '../partner/PartnerOnboardingModal';

export interface AccountViewProps {
  onBack: () => void;
  onOpenCreateRequest?: () => void;
  onOpenPublishJourney?: () => void;
  onOpenAuth?: () => void;
}

export type RequesterAccountTab =
  | 'personal'
  | 'addresses'
  | 'deliveries'
  | 'payments'
  | 'notifications'
  | 'security'
  | 'help';

export type TransporterAccountTab =
  | 'personal'
  | 'vehicle'
  | 'documents'
  | 'availability'
  | 'history'
  | 'earnings'
  | 'notifications'
  | 'security'
  | 'help';

export interface SavedAddress {
  id: string;
  name: string;
  phone: string;
  pincode: string;
  flat: string;
  area: string;
  city: string;
  state: string;
  type: 'home' | 'work' | 'other';
  isDefault: boolean;
}

export const AccountView: React.FC<AccountViewProps> = ({
  onBack,
  onOpenCreateRequest,
  onOpenPublishJourney,
  onOpenAuth,
}) => {
  const { user, isAuthenticated, signOut, updateProfile, resetPassword, openPhoneVerificationModal } = useAuth();
  const {
    activeRoleMode,
    setActiveRoleMode,
    requests,
    partnerAvailable,
    setPartnerAvailable,
    setCurrentView,
    updateRequestStatus,
  } = useApp();

  // Active Tab State
  const [activeTab, setActiveTab] = useState<string>('personal');

  // Partner Onboarding Modal
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);

  // Edit Personal Information Form State
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    fullName: '',
    phone: '',
    organization: '',
    bio: '',
  });
  const [personalSaveStatus, setPersonalSaveStatus] = useState<{ loading: boolean; success?: string; error?: string }>({
    loading: false,
  });

  // Edit Vehicle Information Form State
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    commuteVehicle: '',
  });
  const [vehicleSaveStatus, setVehicleSaveStatus] = useState<{ loading: boolean; success?: string; error?: string }>({
    loading: false,
  });

  // Manage Addresses State
  const ADDRESSES_STORAGE_KEY = `routem8_saved_addresses_${user?.id || 'guest'}`;
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => {
    try {
      const stored = localStorage.getItem(ADDRESSES_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    return [
      {
        id: 'addr-default-1',
        name: user?.fullName || 'Primary Residence',
        phone: user?.phone || '+91 98765 43210',
        pincode: '416118',
        flat: 'Flat 402, Green Meadows',
        area: 'Kolhapur - Sangli Highway, Near Atigre',
        city: 'Kolhapur',
        state: 'Maharashtra',
        type: 'home',
        isDefault: true,
      },
    ];
  });
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<SavedAddress, 'id' | 'isDefault'>>({
    name: '',
    phone: '',
    pincode: '',
    flat: '',
    area: '',
    city: '',
    state: 'Maharashtra',
    type: 'home',
  });

  // Notifications State
  const NOTIFICATIONS_STORAGE_KEY = `routem8_notif_prefs_${user?.id || 'guest'}`;
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    return {
      deliveryUpdates: true,
      liveTracking: true,
      corridorMatches: true,
      promotions: false,
    };
  });

  // Password reset message
  const [resetStatus, setResetStatus] = useState<{ loading: boolean; message?: string; error?: string }>({
    loading: false,
  });

  // Detour Tolerance State for Transporters
  const [detourMinutes, setDetourMinutes] = useState<number>(15);

  // Sync profile data to edit forms when user changes
  useEffect(() => {
    if (user) {
      setPersonalForm({
        fullName: user.fullName || '',
        phone: user.phone || '',
        organization: user.organization || '',
        bio: user.bio || '',
      });
      setVehicleForm({
        commuteVehicle: user.commuteVehicle || 'Car / Sedan',
      });
    }
  }, [user]);

  // Save addresses to localStorage
  const persistAddresses = (newAddrs: SavedAddress[]) => {
    setSavedAddresses(newAddrs);
    try {
      localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(newAddrs));
    } catch {
      // Ignore
    }
  };

  // Save notif preferences to localStorage
  const handleToggleNotif = (key: keyof typeof notifPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  // Save personal profile changes
  const handleSavePersonal = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setPersonalSaveStatus({ loading: true });
    try {
      const success = await updateProfile({
        fullName: personalForm.fullName.trim(),
        phone: personalForm.phone.trim(),
        organization: personalForm.organization.trim(),
        bio: personalForm.bio.trim(),
      });
      if (success) {
        setPersonalSaveStatus({ loading: false, success: 'Profile details saved successfully.' });
        setIsEditingPersonal(false);
      } else {
        setPersonalSaveStatus({ loading: false, error: 'Could not save profile changes. Please try again.' });
      }
    } catch (err: any) {
      setPersonalSaveStatus({ loading: false, error: err.message || 'Error updating profile.' });
    }
  };

  // Save vehicle changes
  const handleSaveVehicle = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setVehicleSaveStatus({ loading: true });
    try {
      const success = await updateProfile({
        commuteVehicle: vehicleForm.commuteVehicle.trim(),
      });
      if (success) {
        setVehicleSaveStatus({ loading: false, success: 'Vehicle information saved successfully.' });
        setIsEditingVehicle(false);
      } else {
        setVehicleSaveStatus({ loading: false, error: 'Could not update vehicle. Please try again.' });
      }
    } catch (err: any) {
      setVehicleSaveStatus({ loading: false, error: err.message || 'Error updating vehicle.' });
    }
  };

  // Save or Update Address
  const handleSaveAddress = (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!addressForm.name || !addressForm.phone || !addressForm.flat || !addressForm.city) return;

    if (editingAddressId) {
      const updated = savedAddresses.map((addr) =>
        addr.id === editingAddressId ? { ...addr, ...addressForm } : addr
      );
      persistAddresses(updated);
      setEditingAddressId(null);
    } else {
      const newAddr: SavedAddress = {
        ...addressForm,
        id: `addr-${Date.now()}`,
        isDefault: savedAddresses.length === 0,
      };
      persistAddresses([...savedAddresses, newAddr]);
      setIsAddingAddress(false);
    }

    setAddressForm({
      name: '',
      phone: '',
      pincode: '',
      flat: '',
      area: '',
      city: '',
      state: 'Maharashtra',
      type: 'home',
    });
  };

  const handleDeleteAddress = (id: string) => {
    const filtered = savedAddresses.filter((a) => a.id !== id);
    if (filtered.length > 0 && !filtered.some((a) => a.isDefault)) {
      filtered[0].isDefault = true;
    }
    persistAddresses(filtered);
  };

  const handleSetDefaultAddress = (id: string) => {
    const updated = savedAddresses.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    persistAddresses(updated);
  };

  // Password reset
  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setResetStatus({ loading: true });
    try {
      const res = await resetPassword(user.email);
      if (res.success) {
        setResetStatus({ loading: false, message: `Password reset instructions sent to ${user.email}. Check your inbox.` });
      } else {
        setResetStatus({ loading: false, error: res.message });
      }
    } catch (err: any) {
      setResetStatus({ loading: false, error: err.message || 'Failed to send password reset.' });
    }
  };

  // Filter user's requests
  const myRequesterDeliveries = requests.filter((r) => r.requesterId === user?.id);
  const myTransporterDeliveries = requests.filter((r) => r.transporterId === user?.id);

  // Financial calculations
  const totalSpent = myRequesterDeliveries.reduce((acc, curr) => acc + (curr.compensation || 0), 0);
  const totalGrossEarnings = myTransporterDeliveries
    .filter((r) => r.status === 'completed')
    .reduce((acc, curr) => acc + (curr.compensation || 0), 0);
  const platformFee = Math.round(totalGrossEarnings * 0.12);
  const netEarnings = totalGrossEarnings - platformFee;

  if (!isAuthenticated || !user) {
    return (
      <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          padding: '3rem 2rem',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-brand-subtle)',
            color: 'var(--color-emerald-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem'
          }}>
            <User size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            Sign In to Access My Account
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 2rem', fontSize: '0.9375rem' }}>
            Manage your personal profile, addresses, delivery history, vehicle documentation, and security settings.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={onOpenAuth}
              className="btn btn-primary"
              style={{ minWidth: '160px' }}
            >
              Sign In / Register
            </button>
            <button
              onClick={onBack}
              className="btn btn-secondary"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Define tab navigation based on role mode
  const requesterTabs = [
    { id: 'personal', label: 'Personal Information', icon: User },
    { id: 'addresses', label: 'Manage Addresses', icon: MapPin },
    { id: 'deliveries', label: 'My Deliveries', icon: Package, badge: myRequesterDeliveries.length ? `${myRequesterDeliveries.length}` : undefined },
    { id: 'payments', label: 'Payments & Transactions', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Login & Security', icon: Lock },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
  ];

  const transporterTabs = [
    { id: 'personal', label: 'Personal Information', icon: User },
    { id: 'vehicle', label: 'Vehicle Information', icon: Car },
    { id: 'documents', label: 'Verification Documents', icon: FileCheck },
    { id: 'availability', label: 'Availability Settings', icon: Sliders },
    { id: 'history', label: 'Delivery History', icon: History, badge: myTransporterDeliveries.length ? `${myTransporterDeliveries.length}` : undefined },
    { id: 'earnings', label: 'Earnings & Payouts', icon: Wallet },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Login & Security', icon: Lock },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
  ];

  const currentTabs = activeRoleMode === 'requester' ? requesterTabs : transporterTabs;

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Top Banner Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={onBack}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}
            title="Return to primary dashboard"
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              My Account
            </h1>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {activeRoleMode === 'requester' ? 'Requester Profile & Preferences' : 'Delivery Partner Workspace'}
            </span>
          </div>
        </div>

        {/* Role Switcher Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-medium)',
          }}>
            <button
              onClick={() => {
                setActiveRoleMode('requester');
                if (activeTab === 'vehicle' || activeTab === 'documents' || activeTab === 'availability' || activeTab === 'history' || activeTab === 'earnings') {
                  setActiveTab('personal');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeRoleMode === 'requester' ? 'var(--bg-surface)' : 'transparent',
                color: activeRoleMode === 'requester' ? 'var(--color-emerald-500)' : 'var(--text-secondary)',
                boxShadow: activeRoleMode === 'requester' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Package size={14} />
              <span>Requester View</span>
            </button>
            <button
              onClick={() => {
                setActiveRoleMode('transporter');
                if (activeTab === 'addresses' || activeTab === 'deliveries' || activeTab === 'payments') {
                  setActiveTab('personal');
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeRoleMode === 'transporter' ? 'var(--bg-surface)' : 'transparent',
                color: activeRoleMode === 'transporter' ? 'var(--color-emerald-500)' : 'var(--text-secondary)',
                boxShadow: activeRoleMode === 'transporter' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Car size={14} />
              <span>Partner View</span>
            </button>
          </div>

          {user.role === 'both' && (
            <button
              onClick={() => setCurrentView('admin')}
              className="btn btn-secondary btn-sm"
              title="Open Operations Command"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
            >
              <ShieldCheck size={14} />
              <span>Admin Console</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Flipkart-Style Layout: Left Navigation + Right Content */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 300px) 1fr',
        gap: '1.5rem',
        alignItems: 'start',
      }}>
        {/* Left Column: Profile Card + Nav Menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* User Profile Header Card */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-medium)',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)',
          }}>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--color-emerald-500)',
                }}
              />
            ) : (
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-navy-800)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.375rem',
                fontWeight: 700,
                border: '2px solid var(--color-emerald-500)',
              }}>
                {user.fullName ? user.fullName[0].toUpperCase() : 'M'}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                Hello,
              </div>
              <div style={{
                fontSize: '1rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.fullName || 'RouteM8 Member'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: 'var(--color-emerald-50)',
                  color: 'var(--color-emerald-600)',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '4px',
                  border: '1px solid var(--color-emerald-200)',
                }}>
                  <ShieldCheck size={11} /> Trust {user.trustScore}%
                </span>
              </div>
            </div>
          </div>

          {/* Flipkart-Style Vertical Navigation Card */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-medium)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
              Account Settings
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column' }}>
              {currentTabs.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.875rem 1.125rem',
                      border: 'none',
                      borderLeft: isActive ? '4px solid var(--color-emerald-500)' : '4px solid transparent',
                      backgroundColor: isActive ? 'var(--bg-brand-subtle)' : 'transparent',
                      color: isActive ? 'var(--color-emerald-600)' : 'var(--text-primary)',
                      fontSize: '0.875rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <IconComponent size={17} color={isActive ? 'var(--color-emerald-500)' : 'var(--text-secondary)'} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.badge ? (
                      <span style={{
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        backgroundColor: isActive ? 'var(--color-emerald-500)' : 'var(--bg-surface-subtle)',
                        color: isActive ? 'white' : 'var(--text-secondary)',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '10px',
                      }}>
                        {tab.badge}
                      </span>
                    ) : (
                      <ChevronRight size={14} color={isActive ? 'var(--color-emerald-500)' : 'var(--text-tertiary)'} />
                    )}
                  </button>
                );
              })}

              {/* Log Out CTA in Menu */}
              <button
                onClick={() => signOut()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.875rem 1.125rem',
                  border: 'none',
                  borderLeft: '4px solid transparent',
                  backgroundColor: 'transparent',
                  color: 'var(--color-crimson-600, #DC2626)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <LogOut size={16} />
                <span>Log Out of RouteM8</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Right Column: Active Content Panel */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-sm)',
          minHeight: '520px',
        }}>
          {/* TAB 1: PERSONAL INFORMATION */}
          {activeTab === 'personal' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Personal Information
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Manage your verified name, contact details, and organization association.
                  </p>
                </div>
                {!isEditingPersonal && (
                  <button
                    onClick={() => {
                      setIsEditingPersonal(true);
                      setPersonalSaveStatus({ loading: false });
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Edit3 size={14} />
                    <span>Edit Profile</span>
                  </button>
                )}
              </div>

              {personalSaveStatus.success && (
                <div style={{ backgroundColor: 'var(--color-emerald-50)', color: 'var(--color-emerald-700)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', border: '1px solid var(--color-emerald-200)' }}>
                  <CheckCircle2 size={16} />
                  <span>{personalSaveStatus.success}</span>
                </div>
              )}

              {personalSaveStatus.error && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle size={16} />
                  <span>{personalSaveStatus.error}</span>
                </div>
              )}

              {isEditingPersonal ? (
                <form onSubmit={handleSavePersonal} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={personalForm.fullName}
                        onChange={(e) => setPersonalForm({ ...personalForm, fullName: e.target.value })}
                        required
                        className="input-field"
                        style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                        Mobile Phone Number
                      </label>
                      <input
                        type="text"
                        value={personalForm.phone}
                        onChange={(e) => setPersonalForm({ ...personalForm, phone: e.target.value })}
                        placeholder="+91 98765 43210"
                        className="input-field"
                        style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                        Organization / University / Workplace
                      </label>
                      <input
                        type="text"
                        value={personalForm.organization}
                        onChange={(e) => setPersonalForm({ ...personalForm, organization: e.target.value })}
                        placeholder="e.g. Sanjay Ghodawat University, Kolhapur"
                        className="input-field"
                        style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                      About / Commuter Bio
                    </label>
                    <textarea
                      rows={3}
                      value={personalForm.bio}
                      onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })}
                      placeholder="Share your daily commuter route, frequency, or courier preferences..."
                      style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)', fontFamily: 'inherit', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                    <button
                      type="submit"
                      onClick={(e) => handleSavePersonal(e)}
                      disabled={personalSaveStatus.loading}
                      className="btn btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                    >
                      <Save size={15} />
                      <span>{personalSaveStatus.loading ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingPersonal(false)}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Full Name
                      </div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {user.fullName || 'Not provided'}
                      </div>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Email Address
                      </div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Mail size={14} color="var(--color-emerald-500)" />
                        <span>{user.email}</span>
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--color-emerald-600)', fontWeight: 600 }}>
                        Verified Login Identity
                      </span>
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Phone Number
                      </div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Phone size={14} color="var(--color-emerald-500)" />
                        <span>{user.phone || 'Not linked'}</span>
                      </div>
                      {user.isPhoneVerified ? (
                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-emerald-600)', fontWeight: 600 }}>
                          Verified Phone
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={openPhoneVerificationModal}
                          style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.6875rem', color: 'var(--color-emerald-600)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Verify Phone Now
                        </button>
                      )}
                    </div>

                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Organization / Campus
                      </div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Building size={14} color="var(--color-emerald-500)" />
                        <span>{user.organization || 'General Commuter'}</span>
                      </div>
                    </div>
                  </div>

                  {user.bio && (
                    <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        About & Commuter Bio
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {user.bio}
                      </p>
                    </div>
                  )}

                  {/* Trust Score & Verification Summary Card */}
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '1.25rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-emerald-50)',
                    border: '1px solid var(--color-emerald-200)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-navy-900)' }}>
                        RouteM8 Mutual Trust Rating: {user.trustScore} / 100
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-navy-700)', marginTop: '0.125rem' }}>
                        Calculated from phone verification, on-time pickups, and successful 4-digit PIN handovers.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', backgroundColor: 'white', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-emerald-600)', border: '1px solid var(--color-emerald-200)' }}>
                        {user.completedDeliveries} Deliveries Completed
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANAGE ADDRESSES (REQUESTER) */}
          {activeTab === 'addresses' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Manage Saved Addresses
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Quickly select saved pickup and dropoff points for future item requests.
                  </p>
                </div>
                {!isAddingAddress && !editingAddressId && (
                  <button
                    onClick={() => {
                      setIsAddingAddress(true);
                      setAddressForm({
                        name: user.fullName || '',
                        phone: user.phone || '',
                        pincode: '416118',
                        flat: '',
                        area: '',
                        city: 'Kolhapur',
                        state: 'Maharashtra',
                        type: 'home',
                      });
                    }}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Plus size={15} />
                    <span>Add New Address</span>
                  </button>
                )}
              </div>

              {(isAddingAddress || editingAddressId) && (
                <form onSubmit={handleSaveAddress} style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-medium)', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                    {editingAddressId ? 'Edit Address' : 'Add New Delivery Address'}
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        Contact Name *
                      </label>
                      <input
                        type="text"
                        value={addressForm.name}
                        onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                        required
                        className="input-field"
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        10-Digit Mobile Phone *
                      </label>
                      <input
                        type="text"
                        value={addressForm.phone}
                        onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                        required
                        className="input-field"
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        Pincode *
                      </label>
                      <input
                        type="text"
                        value={addressForm.pincode}
                        onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                        required
                        className="input-field"
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      Flat / House No. / Building / Landmark *
                    </label>
                    <input
                      type="text"
                      value={addressForm.flat}
                      onChange={(e) => setAddressForm({ ...addressForm, flat: e.target.value })}
                      required
                      placeholder="e.g. Near Sanjay Ghodawat University Campus Gate"
                      className="input-field"
                      style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        Area / Street / Village
                      </label>
                      <input
                        type="text"
                        value={addressForm.area}
                        onChange={(e) => setAddressForm({ ...addressForm, area: e.target.value })}
                        placeholder="e.g. Atigre, Hatkanangale"
                        className="input-field"
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        City / District *
                      </label>
                      <input
                        type="text"
                        value={addressForm.city}
                        onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                        required
                        className="input-field"
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        Address Type
                      </label>
                      <select
                        value={addressForm.type}
                        onChange={(e) => setAddressForm({ ...addressForm, type: e.target.value as any })}
                        style={{ width: '100%', padding: '0.5rem 0.625rem', borderRadius: '4px', border: '1px solid var(--border-medium)', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <option value="home">Home (All-day delivery)</option>
                        <option value="work">Work / Office / Campus (10 AM - 6 PM)</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="submit" className="btn btn-primary btn-sm">
                      Save Address
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingAddress(false);
                        setEditingAddressId(null);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Address List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '8px',
                      border: addr.isDefault ? '2px solid var(--color-emerald-500)' : '1px solid var(--border-medium)',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', backgroundColor: 'var(--bg-surface-subtle)', padding: '0.125rem 0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                          {addr.type}
                        </span>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {addr.name}
                        </span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {addr.phone}
                        </span>
                        {addr.isDefault && (
                          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-emerald-600)', backgroundColor: 'var(--color-emerald-50)', padding: '0.125rem 0.375rem', borderRadius: '4px' }}>
                            Default
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {addr.flat}, {addr.area}, {addr.city}, {addr.state} - {addr.pincode}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      {!addr.isDefault && (
                        <button
                          onClick={() => handleSetDefaultAddress(addr.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Make Default
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingAddressId(addr.id);
                          setAddressForm({
                            name: addr.name,
                            phone: addr.phone,
                            pincode: addr.pincode,
                            flat: addr.flat,
                            area: addr.area,
                            city: addr.city,
                            state: addr.state,
                            type: addr.type,
                          });
                        }}
                        className="icon-btn"
                        title="Edit Address"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="icon-btn"
                        title="Delete Address"
                        style={{ color: '#DC2626' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MY DELIVERIES (REQUESTER) */}
          {activeTab === 'deliveries' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    My Item Delivery Requests ({myRequesterDeliveries.length})
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Track ongoing parcel jobs, view historical deliveries, and inspect counterparty details.
                  </p>
                </div>
                {onOpenCreateRequest && (
                  <button
                    onClick={onOpenCreateRequest}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Plus size={15} />
                    <span>New Delivery Request</span>
                  </button>
                )}
              </div>

              {myRequesterDeliveries.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <Package size={40} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    No delivery requests yet
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '360px', margin: '0.25rem auto 1.25rem' }}>
                    Send personal items, documents, keys, or chargers along existing daily commuter routes.
                  </p>
                  {onOpenCreateRequest && (
                    <button onClick={onOpenCreateRequest} className="btn btn-primary btn-sm">
                      Create First Delivery Request
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {myRequesterDeliveries.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        backgroundColor: 'var(--bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {req.title}
                          </span>
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            #{req.id.slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.25rem 0.625rem',
                            borderRadius: '12px',
                            backgroundColor:
                              req.status === 'completed'
                                ? 'var(--color-emerald-50)'
                                : req.status === 'in_transit'
                                ? 'rgba(245, 158, 11, 0.1)'
                                : 'var(--bg-brand-subtle)',
                            color:
                              req.status === 'completed'
                                ? 'var(--color-emerald-600)'
                                : req.status === 'in_transit'
                                ? '#D97706'
                                : 'var(--color-navy-800)',
                          }}>
                            {req.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-navy-900)' }}>
                            {formatCurrency(req.compensation, 'INR')}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem' }}>
                        <div><strong>From:</strong> {req.pickupAddress}</div>
                        <div><strong>To:</strong> {req.dropoffAddress}</div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          Size: {req.itemSize} • Urgency: {req.urgency}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => setCurrentView('deliveries')}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            Live Tracking
                          </button>
                          {req.status === 'open' && (
                            <button
                              onClick={() => updateRequestStatus(req.id, 'cancelled')}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#DC2626' }}
                            >
                              Cancel Request
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VEHICLE INFORMATION (TRANSPORTER) */}
          {activeTab === 'vehicle' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Vehicle Information
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Registered commute vehicle used for peer-to-peer package transport.
                  </p>
                </div>
                {!isEditingVehicle && (
                  <button
                    onClick={() => {
                      setIsEditingVehicle(true);
                      setVehicleSaveStatus({ loading: false });
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Edit3 size={14} />
                    <span>Edit Vehicle</span>
                  </button>
                )}
              </div>

              {vehicleSaveStatus.success && (
                <div style={{ backgroundColor: 'var(--color-emerald-50)', color: 'var(--color-emerald-700)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', border: '1px solid var(--color-emerald-200)' }}>
                  <CheckCircle2 size={16} />
                  <span>{vehicleSaveStatus.success}</span>
                </div>
              )}

              {isEditingVehicle ? (
                <form onSubmit={handleSaveVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                      Vehicle Class & Model Description *
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.commuteVehicle}
                      onChange={(e) => setVehicleForm({ ...vehicleForm, commuteVehicle: e.target.value })}
                      placeholder="e.g. Maruti Suzuki Swift / Honda Activa 6G / Tata Nexon EV"
                      required
                      className="input-field"
                      style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                      Specifying your vehicle allows senders to match package sizes accurately.
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="submit"
                      onClick={(e) => handleSaveVehicle(e)}
                      disabled={vehicleSaveStatus.loading}
                      className="btn btn-primary"
                    >
                      <Save size={15} />
                      <span>{vehicleSaveStatus.loading ? 'Saving...' : 'Save Vehicle'}</span>
                    </button>
                    <button type="button" onClick={() => setIsEditingVehicle(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ padding: '1.5rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: 'var(--bg-brand-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-navy-800)' }}>
                      <Car size={28} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Active Commute Vehicle
                      </div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {user.commuteVehicle || 'Car / Sedan / Two-Wheeler'}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-emerald-600)', fontWeight: 600 }}>
                        Approved for Small & Medium Packages
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                      Partner Vehicle Documentation
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                      Vehicle registration (RC) and driving license verification are managed through the official RouteM8 partner onboarding pipeline.
                    </p>
                    <button
                      onClick={() => setIsPartnerModalOpen(true)}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                    >
                      <FileCheck size={14} />
                      <span>Review Onboarding Documentation</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: VERIFICATION DOCUMENTS (TRANSPORTER) */}
          {activeTab === 'documents' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Verification Documents
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Government identification, motor vehicle license, and security credentials.
                  </p>
                </div>
                <button
                  onClick={() => setIsPartnerModalOpen(true)}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  <RefreshCw size={14} />
                  <span>Update Documents</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <ShieldCheck size={20} color="var(--color-emerald-500)" />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Government Photo ID (Aadhaar / PAN / Passport)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Identity verified for peer courier authorization
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-emerald-600)', backgroundColor: 'var(--color-emerald-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    Verified
                  </span>
                </div>

                <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Car size={20} color="var(--color-emerald-500)" />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Driving Licence & Motor Vehicle Authorization
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Valid motor vehicle licence on file
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-emerald-600)', backgroundColor: 'var(--color-emerald-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    Active
                  </span>
                </div>

                <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Phone size={20} color="var(--color-emerald-500)" />
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        SMS Phone OTP & LiveKit WebRTC Clearance
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {user.isPhoneVerified ? `Linked to ${user.phone}` : 'Required for audio call rooms'}
                      </div>
                    </div>
                  </div>
                  {user.isPhoneVerified ? (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-emerald-600)', backgroundColor: 'var(--color-emerald-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                      Phone Verified
                    </span>
                  ) : (
                    <button
                      onClick={openPhoneVerificationModal}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Verify Phone
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: AVAILABILITY SETTINGS (TRANSPORTER) */}
          {activeTab === 'availability' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Availability & Detour Settings
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Control your courier discoverability and maximum route detour preferences.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Master Live Availability Switch */}
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  backgroundColor: partnerAvailable ? 'var(--color-emerald-50)' : 'var(--bg-surface-subtle)',
                  border: partnerAvailable ? '1px solid var(--color-emerald-200)' : '1px solid var(--border-medium)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: partnerAvailable ? 'var(--color-emerald-900)' : 'var(--text-primary)' }}>
                      {partnerAvailable ? 'Active & Available for Deliveries' : 'Offline / Commuting Privately'}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: partnerAvailable ? 'var(--color-emerald-700)' : 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      {partnerAvailable
                        ? 'Your published journeys will match senders along your corridor in real-time.'
                        : 'You will not receive proximity matches or notification pings for parcels.'}
                    </div>
                  </div>

                  <button
                    onClick={() => setPartnerAvailable(!partnerAvailable)}
                    className={partnerAvailable ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ flexShrink: 0 }}
                  >
                    {partnerAvailable ? 'Go Offline' : 'Go Online'}
                  </button>
                </div>

                {/* Detour Minutes Selector */}
                <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    Maximum Commute Detour: {detourMinutes} Minutes
                  </label>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    RouteM8 calculates OSRM driving detours. We will only match parcels adding $\le$ {detourMinutes} minutes to your trip.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[5, 10, 15, 20, 30].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setDetourMinutes(mins)}
                        style={{
                          padding: '0.375rem 0.875rem',
                          borderRadius: '6px',
                          border: detourMinutes === mins ? '2px solid var(--color-emerald-500)' : '1px solid var(--border-medium)',
                          backgroundColor: detourMinutes === mins ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                          color: detourMinutes === mins ? 'var(--color-emerald-600)' : 'var(--text-primary)',
                          fontWeight: detourMinutes === mins ? 700 : 500,
                          fontSize: '0.8125rem',
                          cursor: 'pointer',
                        }}
                      >
                        +{mins} mins
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: DELIVERY HISTORY (TRANSPORTER) */}
          {activeTab === 'history' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Transporter Delivery History ({myTransporterDeliveries.length})
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                    Past deliveries completed, packages in transit, and verification logs.
                  </p>
                </div>
                {onOpenPublishJourney && (
                  <button
                    onClick={onOpenPublishJourney}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                  >
                    <Plus size={15} />
                    <span>Publish Daily Commute</span>
                  </button>
                )}
              </div>

              {myTransporterDeliveries.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <History size={40} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    No assigned deliveries yet
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '360px', margin: '0.25rem auto 1.25rem' }}>
                    Publish your daily travel corridor to receive automated matches and earn ₹7/km on your usual commute.
                  </p>
                  <button onClick={() => setCurrentView('matching')} className="btn btn-primary btn-sm">
                    Find Corridor Requests
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {myTransporterDeliveries.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: '1.25rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        backgroundColor: 'var(--bg-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {req.title}
                          </span>
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            for {req.requesterName || 'Sender'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '0.25rem 0.625rem',
                            borderRadius: '12px',
                            backgroundColor: req.status === 'completed' ? 'var(--color-emerald-50)' : 'var(--bg-brand-subtle)',
                            color: req.status === 'completed' ? 'var(--color-emerald-600)' : 'var(--color-navy-800)',
                          }}>
                            {req.status.replace('_', ' ').toUpperCase()}
                          </span>
                          <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-navy-900)' }}>
                            {formatCurrency(req.compensation, 'INR')}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        <strong>Route:</strong> {req.pickupAddress} $\rightarrow$ {req.dropoffAddress}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: PAYMENTS & TRANSACTIONS (REQUESTER) */}
          {activeTab === 'payments' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Payments & Transactions
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Overview of spending, delivery receipts, and preferred payment gateways.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Total Deliveries Paid
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {myRequesterDeliveries.filter((r) => r.status === 'completed').length}
                  </div>
                </div>

                <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Total Amount Spent
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-navy-900)', marginTop: '0.25rem' }}>
                    {formatCurrency(totalSpent, 'INR')}
                  </div>
                </div>

                <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Settlement Currency
                  </div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-emerald-600)', marginTop: '0.25rem' }}>
                    INR (₹ Indian Rupee)
                  </div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Transparent Pricing Rules
                </h3>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <li>Deliveries are calculated strictly by actual road distance at ₹7/km.</li>
                  <li>Platform commission of 12% is included in the fare for continuous corridor telemetry.</li>
                  <li>Fares are settled only upon successful recipient 4-digit PIN verification.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 9: EARNINGS & PAYOUTS (TRANSPORTER) */}
          {activeTab === 'earnings' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Earnings & Payouts
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Track your commuter compensation, platform commission, and settlement schedule.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Gross Fares Earned
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {formatCurrency(totalGrossEarnings, 'INR')}
                  </div>
                </div>

                <div style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Platform Commission (12%)
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {formatCurrency(platformFee, 'INR')}
                  </div>
                </div>

                <div style={{ padding: '1.25rem', backgroundColor: 'var(--color-emerald-50)', borderRadius: '8px', border: '1px solid var(--color-emerald-200)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-emerald-700)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Net Commuter Payout
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-emerald-800)', marginTop: '0.25rem' }}>
                    {formatCurrency(netEarnings, 'INR')}
                  </div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-medium)', backgroundColor: 'var(--bg-surface)' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  Direct Payout & Bank Settlement Details
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Earnings are settled directly into your linked bank account or UPI VPA within 24 hours of successful package PIN handover.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>ACCOUNT HOLDER</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>{user.fullName}</div>
                  </div>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>SETTLEMENT METHOD</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>Direct UPI / NEFT Bank Transfer</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Notification Preferences
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Choose how and when RouteM8 reaches you regarding your deliveries and travel routes.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Delivery Status Updates
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Receive notifications when a package is matched, picked up, or delivered.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPrefs.deliveryUpdates}
                    onChange={() => handleToggleNotif('deliveryUpdates')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-emerald-500)' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Live GPS Tracking & Proximity Alerts
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Alerts when your delivery partner is approaching the curbside handover location.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPrefs.liveTracking}
                    onChange={() => handleToggleNotif('liveTracking')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-emerald-500)' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Corridor Match Opportunities
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Instant alerts when an item matches your daily published commute corridor.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPrefs.corridorMatches}
                    onChange={() => handleToggleNotif('corridorMatches')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-emerald-500)' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Product Updates & Community News
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Feature releases, route expansion, and regional mobility initiatives.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifPrefs.promotions}
                    onChange={() => handleToggleNotif('promotions')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-emerald-500)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 11: LOGIN & SECURITY */}
          {activeTab === 'security' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Login & Security
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Safeguard your RouteM8 account authentication and credential management.
                </p>
              </div>

              {resetStatus.message && (
                <div style={{ backgroundColor: 'var(--color-emerald-50)', color: 'var(--color-emerald-700)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', border: '1px solid var(--color-emerald-200)' }}>
                  <CheckCircle2 size={16} />
                  <span>{resetStatus.message}</span>
                </div>
              )}

              {resetStatus.error && (
                <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle size={16} />
                  <span>{resetStatus.error}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Account Login Email
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                      {user.email}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-emerald-600)', backgroundColor: 'var(--color-emerald-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    Active & Authenticated
                  </span>
                </div>

                <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Password & Authentication
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                      Reset your password via verified Firebase Authentication email link.
                    </div>
                  </div>
                  <button
                    onClick={handleSendPasswordReset}
                    disabled={resetStatus.loading}
                    className="btn btn-secondary btn-sm"
                  >
                    {resetStatus.loading ? 'Sending...' : 'Send Password Reset Email'}
                  </button>
                </div>

                <div style={{ padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.03)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#DC2626' }}>
                    Account & Data Privacy
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0.75rem', lineHeight: 1.5 }}>
                    Under our privacy commitment, you can request an export of your delivery records or full deletion of your profile by emailing operator support.
                  </p>
                  <a
                    href="mailto:biradaradi19@gmail.com?subject=RouteM8%20Account%20Deletion%20Request"
                    style={{ fontSize: '0.8125rem', color: '#DC2626', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Request Account Deletion (biradaradi19@gmail.com)
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 12: HELP & SUPPORT */}
          {activeTab === 'help' && (
            <div>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 style={{ fontSize: '1.1875rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Help & Support
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  Frequently asked questions, courier rules, and support escalation channels.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1.25rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                    How is delivery pricing calculated?
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    RouteM8 uses a standardized formula: Base Fare = Actual Road Distance $\times$ ₹7/km. A 12% platform commission covers real-time GPS tracking and mutual insurance.
                  </p>
                </div>

                <div style={{ padding: '1.25rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                    How does 4-digit PIN verification protect packages?
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    When a delivery starts, a secure 4-digit PIN is generated exclusively for the recipient. The transporter cannot mark the job complete without this code.
                  </p>
                </div>

                <div style={{ padding: '1.25rem', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>
                    How do I get in touch with RouteM8 Support?
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    You can contact our support team 24/7 at <a href="mailto:biradaradi19@gmail.com" style={{ color: 'var(--color-emerald-600)', fontWeight: 600 }}>biradaradi19@gmail.com</a>.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setCurrentView('privacy')}
                    className="btn btn-secondary btn-sm"
                  >
                    Privacy Policy
                  </button>
                  <button
                    onClick={() => setCurrentView('terms')}
                    className="btn btn-secondary btn-sm"
                  >
                    Terms of Service
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Partner Onboarding Modal */}
      <PartnerOnboardingModal
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
      />
    </div>
  );
};
