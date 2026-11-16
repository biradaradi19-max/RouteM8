import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { ItemSize, RequestCategory, RequestUrgency } from '../../types';
import {
  X,
  Package,
  DollarSign,
  Clock,
  AlertCircle,
  MapPin,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';
import { LocationPickerInput } from './LocationPickerInput';
import { CreateRequestRouteMap } from './CreateRequestRouteMap';
import { geocodeAddress } from '../../services/places';
import { isValidCoordinate } from '../../services/geolocation';
import {
  getStoredCurrency,
  getCurrencyConfig,
  CURRENCY_CHANGED_EVENT,
} from '../../services/currency';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({ isOpen, onClose }) => {
  const { createRequest, setCurrentView } = useApp();

  // Wizard Step Control (1: Locations & Route, 2: Package & Details, 3: Pricing & Review)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('campus-supplies');
  const [isFragile, setIsFragile] = useState(false);
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [pickupPlaceId, setPickupPlaceId] = useState<string | undefined>();
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null);
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | undefined>();
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  const [itemSize, setItemSize] = useState<ItemSize>('small');
  const [activeCurrency, setActiveCurrency] = useState<string>(getStoredCurrency());
  const currencyConfig = getCurrencyConfig(activeCurrency);
  const defaultBaseComp = activeCurrency === 'INR' ? 150 : 15;
  const [compensation, setCompensation] = useState(defaultBaseComp);
  const [urgency, setUrgency] = useState<RequestUrgency>('standard');
  const [neededBy, setNeededBy] = useState('Today, 19:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    const handleCurrencyChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ currency: string }>;
      if (customEvent.detail?.currency) {
        const newCode = customEvent.detail.currency;
        setActiveCurrency(newCode);
        if (newCode === 'INR' && compensation < 50) {
          setCompensation(150);
        } else if (newCode !== 'INR' && compensation > 80) {
          setCompensation(15);
        }
      }
    };
    window.addEventListener(CURRENCY_CHANGED_EVENT, handleCurrencyChanged);
    return () => {
      window.removeEventListener(CURRENCY_CHANGED_EVENT, handleCurrencyChanged);
    };
  }, [compensation]);

  if (!isOpen) return null;

  const handleNextFromStep1 = () => {
    setErrorMsg(null);
    if (!pickupAddress.trim()) {
      setErrorMsg('Please specify a pickup location before proceeding.');
      return;
    }
    if (!dropoffAddress.trim()) {
      setErrorMsg('Please specify a dropoff destination before proceeding.');
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg('Item or errand title is required.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Handover instructions and details are required.');
      return;
    }
    setCurrentStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    // 1. Mandatory title and details check
    if (!title.trim()) {
      setErrorMsg('Item or errand title is required.');
      setCurrentStep(2);
      setIsSubmitting(false);
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Handover instructions and details are required.');
      setCurrentStep(2);
      setIsSubmitting(false);
      return;
    }

    // 2. Validate pickup address
    if (!pickupAddress.trim()) {
      setErrorMsg('Pickup location is required. Please search an address, pick on map, or click "Use My Current Location".');
      setCurrentStep(1);
      setIsSubmitting(false);
      return;
    }

    // 3. Resolve pickup coordinates if not yet verified
    let effectivePickupCoords = pickupCoords;
    let effectivePickupAddress = pickupAddress;
    if (!effectivePickupCoords) {
      try {
        const resolved = await geocodeAddress(pickupAddress.trim());
        if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
          effectivePickupCoords = resolved.coords;
          effectivePickupAddress = resolved.formattedAddress;
          setPickupCoords(resolved.coords);
          setPickupAddress(resolved.formattedAddress);
        }
      } catch {
        // Fall through to validation check
      }
    }

    if (!effectivePickupCoords || !isValidCoordinate(effectivePickupCoords[0], effectivePickupCoords[1])) {
      setErrorMsg('Please verify pickup coordinates by selecting an address from the suggestions or placing a pin on the map.');
      setCurrentStep(1);
      setIsSubmitting(false);
      return;
    }

    // 4. Validate dropoff destination
    if (!dropoffAddress.trim()) {
      setErrorMsg('Dropoff destination is required. Please search an address or place a pin on the map.');
      setCurrentStep(1);
      setIsSubmitting(false);
      return;
    }

    // 5. Resolve dropoff coordinates if not yet verified
    let effectiveDropoffCoords = dropoffCoords;
    let effectiveDropoffAddress = dropoffAddress;
    if (!effectiveDropoffCoords) {
      try {
        const resolved = await geocodeAddress(dropoffAddress.trim());
        if (resolved && isValidCoordinate(resolved.coords[0], resolved.coords[1])) {
          effectiveDropoffCoords = resolved.coords;
          effectiveDropoffAddress = resolved.formattedAddress;
          setDropoffCoords(resolved.coords);
          setDropoffAddress(resolved.formattedAddress);
        }
      } catch {
        // Fall through to validation check
      }
    }

    if (!effectiveDropoffCoords || !isValidCoordinate(effectiveDropoffCoords[0], effectiveDropoffCoords[1])) {
      setErrorMsg('Please verify dropoff destination coordinates by selecting an address from suggestions or placing a pin on the map.');
      setCurrentStep(1);
      setIsSubmitting(false);
      return;
    }

    try {
      const fullDesc = isFragile ? `[FRAGILE / HANDLE WITH CARE] ${description.trim()}` : description.trim();
      await createRequest({
        title: title.trim(),
        description: fullDesc,
        category,
        pickupAddress: effectivePickupAddress,
        pickupCoords: effectivePickupCoords,
        pickupPlaceId,
        dropoffAddress: effectiveDropoffAddress,
        dropoffCoords: effectiveDropoffCoords,
        dropoffPlaceId,
        itemSize,
        compensation: Number(compensation),
        currency: currencyConfig.code,
        currencyCode: currencyConfig.code,
        urgency,
        neededBy: neededBy.trim() || 'Today, 19:00',
        distanceKm: routeStats?.distanceKm,
        estimatedDurationMin: routeStats?.durationMin,
      } as any);

      onClose();
      setCurrentView('matching');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create delivery request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="create-req-title">
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          padding: 'clamp(1.5rem, 3vw, 2.25rem)',
          maxWidth: '680px',
          width: '100%',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 20px 60px rgba(16, 28, 44, 0.22)',
          border: '1px solid var(--border-medium)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-tertiary)', padding: '0.25rem' }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#101C2C',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#16A878',
            boxShadow: '0 4px 12px rgba(16, 28, 44, 0.15)'
          }}>
            <Package size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-emerald)', textTransform: 'uppercase' }}>
              Modern Mobility OS • Delivery Wizard
            </span>
            <h2 id="create-req-title" style={{ fontSize: '1.375rem', margin: 0, fontWeight: 800, color: 'var(--text-primary)' }}>
              Request an Item Delivery
            </h2>
          </div>
        </div>

        {/* Step Indicator Tabs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.5rem',
          padding: '0.375rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          marginBottom: '1.25rem',
        }}>
          {[
            { step: 1, label: '1. Route & Map', icon: MapPin },
            { step: 2, label: '2. Package & Size', icon: Package },
            { step: 3, label: '3. Pricing & Review', icon: DollarSign },
          ].map((item) => {
            const isActive = currentStep === item.step;
            const isDone = currentStep > item.step;
            const Icon = item.icon;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step as 1 | 2 | 3)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.375rem',
                  padding: '0.5rem 0.25rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: isActive ? '#101C2C' : isDone ? 'rgba(22, 168, 120, 0.1)' : 'transparent',
                  color: isActive ? '#FFFFFF' : isDone ? '#16A878' : 'var(--text-secondary)',
                  border: 'none',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {isDone ? <CheckCircle2 size={13} color="#16A878" /> : <Icon size={13} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid var(--status-danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            color: 'var(--status-danger-text)',
            fontSize: '0.8125rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* STEP 1: PICKUP & DESTINATION (With Interactive Route Map) */}
          <div style={{ display: currentStep === 1 ? 'flex' : 'none', flexDirection: 'column', gap: '1rem' }}>
            {/* Google Places / Free OSM Autocomplete Pickup Picker */}
            <LocationPickerInput
              id="req-pickup-loc"
              label="Pickup Location"
              placeholder="Search pickup address, village, landmark, or city..."
              value={pickupAddress}
              coords={pickupCoords}
              placeId={pickupPlaceId}
              onChange={(address, coords, pId) => {
                setPickupAddress(address);
                setPickupCoords(coords);
                setPickupPlaceId(pId);
              }}
              showCurrentLocation={true}
              required={true}
            />

            {/* Destination Picker */}
            <LocationPickerInput
              id="req-dropoff-loc"
              label="Destination / Dropoff Location"
              placeholder="Search dropoff destination address or city..."
              value={dropoffAddress}
              coords={dropoffCoords}
              placeId={dropoffPlaceId}
              onChange={(address, coords, pId) => {
                setDropoffAddress(address);
                setDropoffCoords(coords);
                setDropoffPlaceId(pId);
              }}
              showCurrentLocation={false}
              required={true}
            />

            {/* Interactive Route Preview Map */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <label className="form-label" style={{ margin: 0 }}>
                  Interactive Road Route & Pin Fine-Tuning
                </label>
                {routeStats && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A878' }}>
                    {routeStats.distanceKm} km • ~{routeStats.durationMin} mins
                  </span>
                )}
              </div>
              <CreateRequestRouteMap
                pickupCoords={pickupCoords}
                dropoffCoords={dropoffCoords}
                pickupAddress={pickupAddress}
                dropoffAddress={dropoffAddress}
                onPickupCoordsChanged={(coords, address) => {
                  setPickupCoords(coords);
                  if (address) setPickupAddress(address);
                  setErrorMsg(null);
                }}
                onDropoffCoordsChanged={(coords, address) => {
                  setDropoffCoords(coords);
                  if (address) setDropoffAddress(address);
                  setErrorMsg(null);
                }}
                onRouteComputed={(stats) => {
                  setRouteStats(stats);
                  if (stats?.distanceKm && stats.distanceKm > 0 && activeCurrency === 'INR') {
                    const authoritativeFare = Math.max(7, Math.round(stats.distanceKm * 7));
                    setCompensation(authoritativeFare);
                  }
                }}
              />
            </div>
          </div>

          {/* STEP 2: PACKAGE SIZE, DESCRIPTION, FRAGILE & URGENT OPTIONS */}
          <div style={{ display: currentStep === 2 ? 'flex' : 'none', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label" htmlFor="req-title">Item or Errand Title</label>
              <input
                id="req-title"
                type="text"
                required
                placeholder="e.g. Physics Course Reader or Curbside Prescription"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="form-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="form-label">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as RequestCategory)}
                  className="form-select"
                >
                  <option value="campus-supplies">Campus & Academic</option>
                  <option value="groceries">Groceries & Market</option>
                  <option value="pharmacy">Pharmacy & Health</option>
                  <option value="essentials">Daily Essentials</option>
                  <option value="electronics">Electronics & Tools</option>
                  <option value="other">Other Package</option>
                </select>
              </div>

              <div>
                <label className="form-label">Item Size</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
                  {(['small', 'medium', 'large'] as ItemSize[]).map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setItemSize(size)}
                      style={{
                        padding: '0.5rem 0.25rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        border: '1px solid',
                        borderColor: itemSize === size ? '#16A878' : 'var(--border-medium)',
                        backgroundColor: itemSize === size ? 'rgba(22, 168, 120, 0.12)' : 'var(--bg-surface)',
                        color: itemSize === size ? '#128861' : 'var(--text-secondary)'
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="form-label" htmlFor="req-desc">Details & Handover Instructions</label>
              <textarea
                id="req-desc"
                rows={2}
                required
                placeholder="Specify room number, store pickup order number, or item handling details..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="form-textarea"
              />
            </div>

            {/* Fragile & Special Handling Switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              backgroundColor: isFragile ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface-subtle)',
              border: `1px solid ${isFragile ? '#FCD34D' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <ShieldAlert size={18} color={isFragile ? '#D97706' : 'var(--text-tertiary)'} />
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Fragile / Handle With Extreme Care
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Flags package to commuter for secure placement in vehicle
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFragile(prev => !prev)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  backgroundColor: isFragile ? '#D97706' : 'var(--bg-surface)',
                  color: isFragile ? '#FFFFFF' : 'var(--text-secondary)',
                  border: '1px solid var(--border-medium)',
                }}
              >
                {isFragile ? 'Fragile' : 'Standard'}
              </button>
            </div>
          </div>

          {/* STEP 3: COMPENSATION, REVIEW & CONFIRMATION */}
          <div style={{ display: currentStep === 3 ? 'flex' : 'none', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="form-label" htmlFor="req-comp">
                  Delivery Fee — Authoritative Rate ₹7/km ({currencyConfig.symbol} {currencyConfig.code})
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="req-comp"
                    type="number"
                    min={activeCurrency === 'INR' ? 25 : 2}
                    max={activeCurrency === 'INR' ? 5000 : 250}
                    step={activeCurrency === 'INR' ? 5 : 0.5}
                    required
                    value={compensation}
                    onChange={e => setCompensation(Number(e.target.value))}
                    className="form-input"
                    style={{ paddingLeft: '2.25rem' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '0.875rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                    }}
                  >
                    {currencyConfig.symbol}
                  </span>
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="req-need">Needed By Time</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="req-need"
                    type="text"
                    required
                    placeholder="e.g. Today, 19:30"
                    value={neededBy}
                    onChange={e => setNeededBy(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.25rem' }}
                  />
                  <Clock size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                </div>
              </div>
            </div>

            {/* Quick Compensation Presets */}
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Recommended compensation chips ({currencyConfig.code}):
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                {(activeCurrency === 'INR' ? [100, 150, 200, 250, 350] : [10, 15, 20, 25, 35]).map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCompensation(amt)}
                    style={{
                      padding: '0.25rem 0.625rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: compensation === amt ? '#101C2C' : 'var(--bg-surface-subtle)',
                      color: compensation === amt ? '#FFFFFF' : 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {currencyConfig.symbol}{amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label">Urgency Level</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {(['standard', 'flexible', 'urgent'] as RequestUrgency[]).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgency(u)}
                    style={{
                      padding: '0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      border: '1px solid',
                      borderColor: urgency === u ? '#16A878' : 'var(--border-medium)',
                      backgroundColor: urgency === u ? 'rgba(22, 168, 120, 0.12)' : 'var(--bg-surface)',
                      color: urgency === u ? '#128861' : 'var(--text-secondary)'
                    }}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Modern Mobility OS Review Card */}
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontSize: '0.8125rem'
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Delivery Summary</span>
                <span style={{ color: '#16A878' }}>{currencyConfig.symbol}{Number(compensation).toFixed(2)} ({currencyConfig.code})</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                Authoritative pricing: ₹7/km (88% transporter earnings, 12% RouteM8 fee)
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                <strong>Route:</strong> {pickupAddress ? pickupAddress.split(',')[0] : 'Origin'} → {dropoffAddress ? dropoffAddress.split(',')[0] : 'Destination'}
              </div>
              {routeStats && (
                <div style={{ color: 'var(--text-secondary)' }}>
                  <strong>Transit:</strong> {routeStats.distanceKm} km (~{routeStats.durationMin} mins driving)
                </div>
              )}
              {isFragile && (
                <div style={{ color: '#D97706', fontWeight: 600 }}>
                  ⚠️ Special handling: Fragile package
                </div>
              )}
            </div>
          </div>

          {/* Wizard Footer Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '1rem',
            marginTop: '0.5rem',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => (prev - 1) as 1 | 2 | 3)}
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
            ) : <div />}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {currentStep === 1 && (
                <button
                  type="button"
                  onClick={handleNextFromStep1}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}
                >
                  <span>Step 2: Package</span>
                  <ChevronRight size={16} />
                </button>
              )}
              {currentStep === 2 && (
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}
                >
                  <span>Step 3: Pricing</span>
                  <ChevronRight size={16} />
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-emerald"
                style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem' }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner" style={{ width: 16, height: 16 }} />
                    <span>Publishing Request...</span>
                  </>
                ) : (
                  <span>Publish Delivery Request</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
