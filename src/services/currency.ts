/**
 * RouteM8 — Frontend Currency & Internationalization System
 * Client-side currency registry, locale formatting, storage persistence,
 * and header/browser-based privacy-conscious location detection.
 */

import { paymentApi } from './api';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  countryCode: string;
  countryName: string;
  flag: string;
  decimals: number;
  minorUnitRatio: number;
  locale: string;
  supportsLivePayment: boolean;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyOption> = {
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    countryCode: 'IN',
    countryName: 'India',
    flag: '🇮🇳',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-IN',
    supportsLivePayment: true,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    countryCode: 'US',
    countryName: 'United States',
    flag: '🇺🇸',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-US',
    supportsLivePayment: false,
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-GB',
    supportsLivePayment: false,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    countryCode: 'DE',
    countryName: 'European Union',
    flag: '🇪🇺',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'de-DE',
    supportsLivePayment: false,
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: '$',
    countryCode: 'CA',
    countryName: 'Canada',
    flag: '🇨🇦',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-CA',
    supportsLivePayment: false,
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: '$',
    countryCode: 'AU',
    countryName: 'Australia',
    flag: '🇦🇺',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-AU',
    supportsLivePayment: false,
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    flag: '🇦🇪',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'ar-AE',
    supportsLivePayment: false,
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: '$',
    countryCode: 'SG',
    countryName: 'Singapore',
    flag: '🇸🇬',
    decimals: 2,
    minorUnitRatio: 100,
    locale: 'en-SG',
    supportsLivePayment: false,
  },
};

export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_COUNTRY = 'IN';

export const COUNTRY_TO_CURRENCY_MAP: Record<string, string> = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  IE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  CA: 'CAD',
  AU: 'AUD',
  AE: 'AED',
  SG: 'SGD',
};

const STORAGE_CURRENCY_KEY = 'routem8_preferred_currency';
const STORAGE_COUNTRY_KEY = 'routem8_preferred_country';
export const CURRENCY_CHANGED_EVENT = 'routem8:currency-changed';

export function getCurrencyConfig(code?: string): CurrencyOption {
  const normalized = (code || DEFAULT_CURRENCY).toUpperCase().trim();
  return SUPPORTED_CURRENCIES[normalized] || SUPPORTED_CURRENCIES[DEFAULT_CURRENCY];
}

export function isSupportedCurrency(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return Boolean(SUPPORTED_CURRENCIES[code.toUpperCase().trim()]);
}

export function toMinorUnits(amount: number, currencyCode?: string): number {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return 0;
  }
  const config = getCurrencyConfig(currencyCode);
  return Math.round(amount * config.minorUnitRatio);
}

export function toMajorUnits(minorUnits: number, currencyCode?: string): number {
  const config = getCurrencyConfig(currencyCode);
  return Number((minorUnits / config.minorUnitRatio).toFixed(config.decimals));
}

export function formatCurrency(
  amount: number,
  currencyCode?: string,
  options?: { isMinorUnits?: boolean; customLocale?: string }
): string {
  const config = getCurrencyConfig(currencyCode);
  const majorAmount = options?.isMinorUnits ? toMajorUnits(amount, config.code) : amount;
  const locale = options?.customLocale || config.locale;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(majorAmount);
  } catch {
    return `${config.symbol}${majorAmount.toFixed(config.decimals)}`;
  }
}

export function getStoredCurrency(): string {
  try {
    const val = localStorage.getItem(STORAGE_CURRENCY_KEY);
    if (val && isSupportedCurrency(val)) {
      return val.toUpperCase().trim();
    }
  } catch {
    // Ignore localStorage access failures
  }
  return DEFAULT_CURRENCY;
}

export function setStoredCurrency(code: string): void {
  const normalized = code.toUpperCase().trim();
  if (!isSupportedCurrency(normalized)) return;

  try {
    localStorage.setItem(STORAGE_CURRENCY_KEY, normalized);
    const config = getCurrencyConfig(normalized);
    localStorage.setItem(STORAGE_COUNTRY_KEY, config.countryCode);
  } catch {
    // Ignore localStorage access failures
  }

  // Notify any listening components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGED_EVENT, { detail: { currency: normalized } }));
  }
}

export function getStoredCountry(): string {
  try {
    const val = localStorage.getItem(STORAGE_COUNTRY_KEY);
    if (val && typeof val === 'string' && val.length === 2) {
      return val.toUpperCase().trim();
    }
  } catch {
    // Ignore localStorage access failures
  }
  return DEFAULT_COUNTRY;
}

export function setStoredCountry(countryCode: string): void {
  const upper = countryCode.toUpperCase().trim();
  try {
    localStorage.setItem(STORAGE_COUNTRY_KEY, upper);
  } catch {
    // Ignore localStorage access failures
  }

  const mappedCurrency = COUNTRY_TO_CURRENCY_MAP[upper] || DEFAULT_CURRENCY;
  setStoredCurrency(mappedCurrency);
}

export function detectBrowserCountry(): string {
  if (typeof navigator === 'undefined' || !navigator.language) {
    return DEFAULT_COUNTRY;
  }
  const lang = navigator.language;
  const parts = lang.split('-');
  if (parts.length > 1 && parts[1].length === 2) {
    const country = parts[1].toUpperCase();
    if (COUNTRY_TO_CURRENCY_MAP[country]) {
      return country;
    }
  }
  return DEFAULT_COUNTRY;
}

/**
 * Initializes location and currency preference asynchronously.
 * Respects explicit user overrides in localStorage before probing headers or browser locale.
 */
export async function initializeCurrency(): Promise<string> {
  try {
    const stored = localStorage.getItem(STORAGE_CURRENCY_KEY);
    if (stored && isSupportedCurrency(stored)) {
      return stored.toUpperCase().trim();
    }
  } catch {
    // Fallthrough
  }

  try {
    const detection = await paymentApi.detectCountry();
    if (detection.success && detection.currencyCode && isSupportedCurrency(detection.currencyCode)) {
      setStoredCountry(detection.countryCode || DEFAULT_COUNTRY);
      return detection.currencyCode;
    }
  } catch {
    // Network or offline fallback
  }

  const browserCountry = detectBrowserCountry();
  const browserCurrency = COUNTRY_TO_CURRENCY_MAP[browserCountry] || DEFAULT_CURRENCY;
  setStoredCountry(browserCountry);
  return browserCurrency;
}

