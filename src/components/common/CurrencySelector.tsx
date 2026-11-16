import React, { useState, useEffect, useRef } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import {
  SUPPORTED_CURRENCIES,
  getStoredCurrency,
  setStoredCurrency,
  CURRENCY_CHANGED_EVENT,
  type CurrencyOption,
} from '../../services/currency';

interface CurrencySelectorProps {
  compact?: boolean;
  className?: string;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({ compact = false, className = '' }) => {
  const [currentCode, setCurrentCode] = useState<string>(getStoredCurrency());
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCurrencyChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ currency: string }>;
      if (customEvent.detail?.currency) {
        setCurrentCode(customEvent.detail.currency);
      }
    };

    window.addEventListener(CURRENCY_CHANGED_EVENT, handleCurrencyChanged);
    return () => {
      window.removeEventListener(CURRENCY_CHANGED_EVENT, handleCurrencyChanged);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const currentConfig = SUPPORTED_CURRENCIES[currentCode] || SUPPORTED_CURRENCIES.INR;

  const handleSelect = (code: string) => {
    setStoredCurrency(code);
    setCurrentCode(code);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`currency-selector-container ${className}`}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Select display currency, currently ${currentConfig.code}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: compact ? '0.25rem 0.5rem' : '0.375rem 0.625rem',
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
        title={`Change display currency (Current: ${currentConfig.name} - ${currentConfig.symbol})`}
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{currentConfig.flag}</span>
        <span style={{ fontWeight: 700 }}>{currentConfig.code}</span>
        <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{currentConfig.symbol}</span>
        <ChevronDown size={14} style={{ opacity: 0.6, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Supported Currencies"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 1000,
            minWidth: '240px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.375rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.125rem',
          }}
        >
          <div
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <Globe size={12} />
            <span>Marketplace Currency</span>
          </div>

          {Object.values(SUPPORTED_CURRENCIES).map((curr: CurrencyOption) => {
            const isSelected = curr.code === currentCode;
            return (
              <button
                key={curr.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(curr.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.625rem',
                  fontSize: '0.8125rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--bg-surface-raised, rgba(16, 28, 44, 0.06))' : 'transparent',
                  color: isSelected ? 'var(--color-brand-primary, #047857)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.125rem' }}>{curr.flag}</span>
                  <div>
                    <div style={{ fontWeight: isSelected ? 700 : 600, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span>{curr.code}</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({curr.symbol})</span>
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                      {curr.countryName}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {curr.supportsLivePayment ? (
                    <span
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        padding: '0.125rem 0.375rem',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                      }}
                    >
                      Gateway
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.625rem',
                        fontWeight: 600,
                        padding: '0.125rem 0.375rem',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(107, 114, 128, 0.12)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Sandbox
                    </span>
                  )}
                  {isSelected && <Check size={14} color="#059669" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

