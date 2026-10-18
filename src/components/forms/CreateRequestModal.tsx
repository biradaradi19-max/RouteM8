import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { ItemSize, RequestCategory, RequestUrgency } from '../../types';
import { X, Package, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { LocationPickerInput } from './LocationPickerInput';
import { CreateRequestRouteMap } from './CreateRequestRouteMap';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Initial default locations in Bay Area corridor
const DEFAULT_PICKUP: { address: string; coords: [number, number] } = {
  address: 'Green Library, 557 Escondido Mall, Stanford, CA',
  coords: [37.4275, -122.1668],
};

const DEFAULT_DROPOFF: { address: string; coords: [number, number] } = {
  address: 'Castro St & El Camino Real, Mountain View, CA',
  coords: [37.3861, -122.0839],
};

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({ isOpen, onClose }) => {
  const { createRequest, setCurrentView } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RequestCategory>('campus-supplies');
  const [pickupAddress, setPickupAddress] = useState(DEFAULT_PICKUP.address);
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(DEFAULT_PICKUP.coords);
  const [dropoffAddress, setDropoffAddress] = useState(DEFAULT_DROPOFF.address);
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(DEFAULT_DROPOFF.coords);
  const [routeStats, setRouteStats] = useState<{ distanceKm: number; durationMin: number } | null>(null);

  const [itemSize, setItemSize] = useState<ItemSize>('small');
  const [compensation, setCompensation] = useState(15);
  const [urgency, setUrgency] = useState<RequestUrgency>('standard');
  const [neededBy, setNeededBy] = useState('Today, 19:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    // Coordinate validation requirement
    if (!pickupCoords || !dropoffCoords) {
      setErrorMsg('Please select a verified pickup location and destination with valid coordinates.');
      setIsSubmitting(false);
      return;
    }

    try {
      await createRequest({
        title,
        description,
        category,
        pickupAddress,
        pickupCoords,
        dropoffAddress,
        dropoffCoords,
        itemSize,
        compensation: Number(compensation),
        urgency,
        neededBy,
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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: '2rem' }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', color: 'var(--text-tertiary)' }}
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-forest-850)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-mint-400)'
          }}>
            <Package size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Peer Delivery
            </span>
            <h2 id="create-req-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              Request an Item Delivery
            </h2>
          </div>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      border: '1px solid',
                      borderColor: itemSize === size ? 'var(--color-forest-700)' : 'var(--border-medium)',
                      backgroundColor: itemSize === size ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                      color: itemSize === size ? 'var(--color-forest-900)' : 'var(--text-secondary)'
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

          {/* Google Places Autocomplete Pickup Picker */}
          <LocationPickerInput
            id="req-pickup-loc"
            label="Pickup Location (Along Highway/Local Corridor)"
            placeholder="Search pickup address, store, or campus building..."
            value={pickupAddress}
            coords={pickupCoords}
            onChange={(address, coords) => {
              setPickupAddress(address);
              setPickupCoords(coords);
            }}
            showCurrentLocation={true}
            required={true}
          />

          {/* Google Places Autocomplete Dropoff Picker */}
          <LocationPickerInput
            id="req-dropoff-loc"
            label="Destination / Dropoff Location"
            placeholder="Search dropoff destination address..."
            value={dropoffAddress}
            coords={dropoffCoords}
            onChange={(address, coords) => {
              setDropoffAddress(address);
              setDropoffCoords(coords);
            }}
            showCurrentLocation={false}
            required={true}
          />

          {/* Interactive Google Map Route Preview with markers & distance/ETA */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Interactive Route & Road Geometry Preview
              </label>
              {routeStats && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-mint-600)' }}>
                  {routeStats.distanceKm} km • ~{routeStats.durationMin} mins
                </span>
              )}
            </div>
            <CreateRequestRouteMap
              pickupCoords={pickupCoords}
              dropoffCoords={dropoffCoords}
              pickupAddress={pickupAddress}
              dropoffAddress={dropoffAddress}
              onRouteComputed={(stats) => setRouteStats(stats)}
            />
          </div>

          {/* Compensation & Urgency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label" htmlFor="req-comp">Transporter Compensation ($)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="req-comp"
                  type="number"
                  min="5"
                  max="100"
                  step="0.5"
                  required
                  value={compensation}
                  onChange={e => setCompensation(Number(e.target.value))}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                />
                <DollarSign size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
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
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    border: '1px solid',
                    borderColor: urgency === u ? 'var(--color-forest-700)' : 'var(--border-medium)',
                    backgroundColor: urgency === u ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                    color: urgency === u ? 'var(--color-forest-900)' : 'var(--text-secondary)'
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>


          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.875rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
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
        </form>
      </div>
    </div>
  );
};
