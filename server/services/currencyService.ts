/**
 * RouteM8 — Centralized Currency & Internationalization Service
 * ISO 4217 Currency Registry, Country-to-Currency Mapping, Decimal Precision & Minor Unit Math.
 */

export interface CurrencyConfig {
  code: string; // ISO 4217
  name: string;
  symbol: string;
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  flag: string; // Unicode flag emoji
  decimals: number;
  minorUnitRatio: number; // 100 for 2 decimal places, 1 for 0 decimal places
  minorUnitName: string;
  locale: string;
  supportsLivePayment: boolean; // India-first: true for INR, false for others (sandbox/mock only)
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    countryCode: 'IN',
    countryName: 'India',
    flag: '🇮🇳',
    decimals: 2,
    minorUnitRatio: 100,
    minorUnitName: 'paise',
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
    minorUnitName: 'cents',
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
    minorUnitName: 'pence',
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
    minorUnitName: 'cents',
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
    minorUnitName: 'cents',
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
    minorUnitName: 'cents',
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
    minorUnitName: 'fils',
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
    minorUnitName: 'cents',
    locale: 'en-SG',
    supportsLivePayment: false,
  },
};

export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_COUNTRY = 'IN';

/**
 * Country to Default Currency Mapping (ISO 3166-1 alpha-2 -> ISO 4217)
 */
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

/**
 * Validates if currency code is supported.
 */
export function isSupportedCurrency(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return Boolean(SUPPORTED_CURRENCIES[code.toUpperCase().trim()]);
}

/**
 * Resolves CurrencyConfig by code or fallback to DEFAULT_CURRENCY.
 */
export function getCurrencyConfig(code?: string): CurrencyConfig {
  const normalized = (code || DEFAULT_CURRENCY).toUpperCase().trim();
  return SUPPORTED_CURRENCIES[normalized] || SUPPORTED_CURRENCIES[DEFAULT_CURRENCY];
}

/**
 * Resolves default currency for a country code (e.g. 'US' -> 'USD', 'IN' -> 'INR').
 */
export function getCurrencyForCountry(countryCode?: string): string {
  if (!countryCode || typeof countryCode !== 'string') return DEFAULT_CURRENCY;
  const upper = countryCode.toUpperCase().trim();
  return COUNTRY_TO_CURRENCY_MAP[upper] || DEFAULT_CURRENCY;
}

/**
 * Asserts that a monetary value is an exact, non-negative integer within safe bounds.
 */
export function assertValidMinorUnits(amount: unknown, fieldName = 'amountMinorUnits'): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Number.isNaN(amount)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (!Number.isInteger(amount)) {
    throw new Error(`${fieldName} must be an integer minor unit (no fractional minor units)`);
  }
  if (amount < 0) {
    throw new Error(`${fieldName} cannot be negative`);
  }
  if (amount > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${fieldName} exceeds maximum safe financial integer limit`);
  }
  return amount;
}

/**
 * Safely parses any decimal representation (string or number) into exact integer minor units
 * without floating-point arithmetic errors.
 * Example: "19.99" -> 1999 paise/cents.
 */
export function safeParseDecimalToMinorUnits(input: string | number, currencyCode?: string): number {
  if (input === null || input === undefined) {
    throw new Error('Input amount cannot be null or undefined');
  }

  if (typeof input === 'number' && (Number.isNaN(input) || !Number.isFinite(input))) {
    throw new Error('Invalid monetary numerical value: must be finite');
  }

  if (typeof input === 'number' && input < 0) {
    throw new Error('Monetary amount cannot be negative');
  }

  const rawStr = typeof input === 'number' ? input.toString() : String(input).trim();

  if (rawStr.startsWith('-')) {
    throw new Error('Monetary amount cannot be negative');
  }

  if (!rawStr || !/^[0-9]+(\.[0-9]+)?$/.test(rawStr)) {
    throw new Error(`Invalid monetary decimal format: "${rawStr}"`);
  }

  const config = getCurrencyConfig(currencyCode);

  const [majorPart, minorPart = ''] = rawStr.split('.');
  const paddedMinor = minorPart.slice(0, config.decimals).padEnd(config.decimals, '0');

  let extraRounding = 0;
  if (minorPart.length > config.decimals) {
    const nextDigit = parseInt(minorPart[config.decimals], 10);
    if (nextDigit >= 5) {
      extraRounding = 1;
    }
  }

  const majorBig = BigInt(majorPart);
  const minorBig = BigInt(paddedMinor) + BigInt(extraRounding);
  const totalMinorBig = majorBig * BigInt(config.minorUnitRatio) + minorBig;

  if (totalMinorBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Monetary amount exceeds maximum safe integer capacity');
  }

  return Number(totalMinorBig);
}

/**
 * Converts a major currency unit (e.g. 15.50) to exact integer minor units (e.g. 1550).
 * Prevents floating point errors with strict Math.round and integer verification.
 */
export function toMinorUnits(amount: number, currencyCode?: string): number {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount < 0) {
    throw new Error('Invalid monetary amount');
  }
  return safeParseDecimalToMinorUnits(amount, currencyCode);
}

/**
 * Converts integer minor units (e.g. 1550) to decimal major units (e.g. 15.50).
 */
export function toMajorUnits(minorUnits: number, currencyCode?: string): number {
  if (!Number.isInteger(minorUnits)) {
    throw new Error('Minor units must be an exact integer');
  }
  const config = getCurrencyConfig(currencyCode);
  return Number((minorUnits / config.minorUnitRatio).toFixed(config.decimals));
}

/**
 * Formats a monetary amount in locale-specific style with correct currency symbol.
 */
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
    // Fallback if Intl fails
    return `${config.symbol}${majorAmount.toFixed(config.decimals)}`;
  }
}

/**
 * Detects country from HTTP headers (Vercel IP country, Cloudflare IP country, or x-country-code).
 * Privacy-conscious: inspects existing transport headers without tracking or storing user IPs.
 */
export function detectCountryFromHeaders(headers: Record<string, string | string[] | undefined>): {
  countryCode: string;
  currencyCode: string;
  source: 'vercel_ip' | 'cloudflare_ip' | 'custom_header' | 'default';
} {
  const headerVal = (key: string): string | null => {
    const val = headers[key] || headers[key.toLowerCase()];
    if (typeof val === 'string' && val.trim().length === 2) {
      return val.trim().toUpperCase();
    }
    if (Array.isArray(val) && val[0] && val[0].trim().length === 2) {
      return val[0].trim().toUpperCase();
    }
    return null;
  };

  const vercelCountry = headerVal('x-vercel-ip-country');
  if (vercelCountry) {
    return {
      countryCode: vercelCountry,
      currencyCode: getCurrencyForCountry(vercelCountry),
      source: 'vercel_ip',
    };
  }

  const cfCountry = headerVal('cf-ipcountry');
  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    return {
      countryCode: cfCountry,
      currencyCode: getCurrencyForCountry(cfCountry),
      source: 'cloudflare_ip',
    };
  }

  const customCountry = headerVal('x-country-code');
  if (customCountry) {
    return {
      countryCode: customCountry,
      currencyCode: getCurrencyForCountry(customCountry),
      source: 'custom_header',
    };
  }

  return {
    countryCode: DEFAULT_COUNTRY,
    currencyCode: DEFAULT_CURRENCY,
    source: 'default',
  };
}

