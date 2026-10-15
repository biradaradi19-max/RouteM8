import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { ItemSize } from '../../types';
import { X, Car, Clock, AlertCircle } from 'lucide-react';


interface PublishJourneyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMUTE_PRESETS: Array<{ label: string; address: string; coords: [number, number] }> = [
  { label: 'Stanford Oval / Campus Center', address: 'Stanford Oval, Stanford, CA', coords: [37.4328, -122.1697] },
  { label: 'Downtown Palo Alto (University Ave)', address: 'University Ave & High St, Palo Alto, CA', coords: [37.4445, -122.1633] },
  { label: 'Sand Hill Road Venture Corridor', address: 'Sand Hill Rd & Pasteur Dr, Menlo Park, CA', coords: [37.4372, -122.1895] },
  { label: 'Googleplex (Mountain View)', address: '1600 Amphitheatre Pkwy, Mountain View, CA', coords: [37.4220, -122.0841] },
  { label: 'Downtown Mountain View (Castro St)', address: 'Castro St & El Camino Real, Mountain View, CA', coords: [37.3861, -122.0839] },
  { label: 'Sunnyvale Tech Campus Center', address: 'Sunnyvale Town Center, CA', coords: [37.3719, -122.0301] },
  { label: 'North San Jose Innovation Park', address: 'North 1st St & Brokaw Rd, San Jose, CA', coords: [37.3731, -121.9168] },
];

export const PublishJourneyModal: React.FC<PublishJourneyModalProps> = ({ isOpen, onClose }) => {
  const { publishJourney, setCurrentView } = useApp();

  const [originIndex, setOriginIndex] = useState(0);
  const [destIndex, setDestIndex] = useState(3);
  const [vehicle, setVehicle] = useState('Volvo EX30 (Electric)');
  const [departureTime, setDepartureTime] = useState('Today, 17:45');
  const [maxDetourMinutes, setMaxDetourMinutes] = useState(12);
  const [capacity, setCapacity] = useState<ItemSize>('medium');
  const [notes, setNotes] = useState('Daily commute home. Trunk space available for grocery bags or parcels.');
  const [recurringDays, setRecurringDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleDay = (day: string) => {
    setRecurringDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const origin = COMMUTE_PRESETS[originIndex];
      const dest = COMMUTE_PRESETS[destIndex];

      await publishJourney({
        vehicle,
        originAddress: origin.address,
        originCoords: origin.coords,
        destAddress: dest.address,
        destCoords: dest.coords,
        departureTime,
        maxDetourMinutes: Number(maxDetourMinutes),
        capacity,
        recurringDays,
        notes,
      });

      onClose();
      setCurrentView('matching');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to publish commute route.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="publish-journey-title">
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
            <Car size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-mint-600)', textTransform: 'uppercase' }}>
              Commuter Route
            </span>
            <h2 id="publish-journey-title" style={{ fontSize: '1.375rem', margin: 0 }}>
              Publish Your Commute
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
            <label className="form-label">Commute Starting Point (Origin)</label>
            <select
              value={originIndex}
              onChange={e => setOriginIndex(Number(e.target.value))}
              className="form-select"
            >
              {COMMUTE_PRESETS.map((item, idx) => (
                <option key={idx} value={idx}>{item.label} — {item.address}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Commute Destination (Final Drop)</label>
            <select
              value={destIndex}
              onChange={e => setDestIndex(Number(e.target.value))}
              className="form-select"
            >
              {COMMUTE_PRESETS.map((item, idx) => (
                <option key={idx} value={idx}>{item.label} — {item.address}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="form-label" htmlFor="jrn-vehicle">Vehicle / Mode</label>
              <input
                id="jrn-vehicle"
                type="text"
                required
                value={vehicle}
                onChange={e => setVehicle(e.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label" htmlFor="jrn-time">Departure Time</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="jrn-time"
                  type="text"
                  required
                  value={departureTime}
                  onChange={e => setDepartureTime(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.25rem' }}
                />
                <Clock size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          </div>

          {/* Max Detour Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Max Acceptable Detour</label>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-forest-800)' }}>
                +{maxDetourMinutes} minutes
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="25"
              step="1"
              value={maxDetourMinutes}
              onChange={e => setMaxDetourMinutes(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-mint-500)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              <span>Quick curb drop (3m)</span>
              <span>Flexible detour (25m)</span>
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label className="form-label">Available Trunk / Bag Capacity</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {(['small', 'medium', 'large'] as ItemSize[]).map(size => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setCapacity(size)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    border: '1px solid',
                    borderColor: capacity === size ? 'var(--color-forest-700)' : 'var(--border-medium)',
                    backgroundColor: capacity === size ? 'var(--bg-brand-subtle)' : 'var(--bg-surface)',
                    color: capacity === size ? 'var(--color-forest-900)' : 'var(--text-secondary)'
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Recurring Days */}
          <div>
            <label className="form-label">Recurring Days</label>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                const isSelected = recurringDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    style={{
                      flex: 1,
                      padding: '0.4rem 0.2rem',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: '1px solid',
                      borderColor: isSelected ? 'var(--color-mint-500)' : 'var(--border-medium)',
                      backgroundColor: isSelected ? 'var(--color-mint-100)' : 'var(--bg-surface)',
                      color: isSelected ? 'var(--color-forest-900)' : 'var(--text-tertiary)',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes for Requesters */}
          <div>
            <label className="form-label" htmlFor="jrn-notes">Commuter Notes</label>
            <textarea
              id="jrn-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Clean parcel trunk space, flexible within 10 min window..."
              className="form-textarea"
            />
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
                <span>Publishing Route...</span>
              </>
            ) : (
              <span>Publish Commuter Route</span>
            )}
          </button>

        </form>
      </div>
    </div>
  );
};
