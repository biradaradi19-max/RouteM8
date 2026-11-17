import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatCurrency,
  toMinorUnits,
  toMajorUnits,
  initializeCurrency,
  getStoredCurrency,
  setStoredCurrency,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
} from './currency';
import {
  calculateAuthoritativeDeliveryPrice,
  resolveAuthoritativeDistance,
  RATE_PER_KM_INR,
  MIN_FARE_INR,
} from '../../server/services/pricingEngine';
import {
  calculateCommissionSync,
  DEFAULT_COMMISSION_RATE_PERCENT,
} from '../../server/services/commissionEngine';

describe('RouteM8: Pricing Calculation & INR Currency Standardization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Authoritative Business Rules & Constants', () => {
    it('enforces ₹7 per km rate and ₹7 minimum fare', () => {
      expect(RATE_PER_KM_INR).toBe(7.0);
      expect(MIN_FARE_INR).toBe(7.0);
    });

    it('enforces 12.0% platform commission', () => {
      expect(DEFAULT_COMMISSION_RATE_PERCENT).toBe(12.0);
    });

    it('defines INR as the default currency with ₹ symbol and en-IN locale', () => {
      expect(DEFAULT_CURRENCY).toBe('INR');
      const inrConfig = SUPPORTED_CURRENCIES.INR;
      expect(inrConfig.symbol).toBe('₹');
      expect(inrConfig.locale).toBe('en-IN');
      expect(inrConfig.decimals).toBe(2);
      expect(inrConfig.minorUnitRatio).toBe(100);
    });
  });

  describe('2. Four Specific Real-World Route Calculations (Actual Road Distances)', () => {
    it('Route 1: Hatkanangle -> Sangli (34.00 km)', () => {
      const roadDistanceKm = 34.00;
      const price = calculateAuthoritativeDeliveryPrice(roadDistanceKm);
      const commission = calculateCommissionSync(price.amountPaise, 12.0);

      // Base fare: 34.00 * 7 = 238.00 INR = 23,800 paise
      expect(price.amountRupees).toBe(238.00);
      expect(price.amountPaise).toBe(23800);

      // Commission (12%): 238.00 * 0.12 = 28.56 INR = 2,856 paise
      expect(commission.platformSharePaise).toBe(2856);
      expect(toMajorUnits(commission.platformSharePaise, 'INR')).toBe(28.56);

      // Transporter share (88%): 238.00 - 28.56 = 209.44 INR = 20,944 paise
      expect(commission.partnerSharePaise).toBe(20944);
      expect(toMajorUnits(commission.partnerSharePaise, 'INR')).toBe(209.44);

      // Exact sum invariant
      expect(commission.platformSharePaise + commission.partnerSharePaise).toBe(price.amountPaise);

      // Formatting
      expect(formatCurrency(price.amountRupees, 'INR')).toMatch(/₹\s?238\.00/);
    });

    it('Route 2: Atigre -> Kolhapur (16.05 km)', () => {
      const roadDistanceKm = 16.05;
      const price = calculateAuthoritativeDeliveryPrice(roadDistanceKm);
      const commission = calculateCommissionSync(price.amountPaise, 12.0);

      // Base fare: 16.05 * 7 = 112.35 INR = 11,235 paise
      expect(price.amountRupees).toBe(112.35);
      expect(price.amountPaise).toBe(11235);

      // Commission (12%): 11235 * 0.12 = 1348.2 -> 1,348 paise = 13.48 INR
      expect(commission.platformSharePaise).toBe(1348);
      expect(toMajorUnits(commission.platformSharePaise, 'INR')).toBe(13.48);

      // Transporter share: 11235 - 1348 = 9,887 paise = 98.87 INR
      expect(commission.partnerSharePaise).toBe(9887);
      expect(toMajorUnits(commission.partnerSharePaise, 'INR')).toBe(98.87);

      expect(commission.platformSharePaise + commission.partnerSharePaise).toBe(price.amountPaise);
      expect(formatCurrency(price.amountRupees, 'INR')).toMatch(/₹\s?112\.35/);
    });

    it('Route 3: Majalgaon -> Beed (52.74 km)', () => {
      const roadDistanceKm = 52.74;
      const price = calculateAuthoritativeDeliveryPrice(roadDistanceKm);
      const commission = calculateCommissionSync(price.amountPaise, 12.0);

      // Base fare: 52.74 * 7 = 369.18 INR = 36,918 paise
      expect(price.amountRupees).toBe(369.18);
      expect(price.amountPaise).toBe(36918);

      // Commission (12%): 36918 * 0.12 = 4430.16 -> 4,430 paise = 44.30 INR
      expect(commission.platformSharePaise).toBe(4430);
      expect(toMajorUnits(commission.platformSharePaise, 'INR')).toBe(44.30);

      // Transporter share: 36918 - 4430 = 32,488 paise = 324.88 INR
      expect(commission.partnerSharePaise).toBe(32488);
      expect(toMajorUnits(commission.partnerSharePaise, 'INR')).toBe(324.88);

      expect(commission.platformSharePaise + commission.partnerSharePaise).toBe(price.amountPaise);
      expect(formatCurrency(price.amountRupees, 'INR')).toMatch(/₹\s?369\.18/);
    });

    it('Route 4: Mumbai -> Pune (147.04 km)', () => {
      const roadDistanceKm = 147.04;
      const price = calculateAuthoritativeDeliveryPrice(roadDistanceKm);
      const commission = calculateCommissionSync(price.amountPaise, 12.0);

      // Base fare: 147.04 * 7 = 1029.28 INR = 102,928 paise
      expect(price.amountRupees).toBe(1029.28);
      expect(price.amountPaise).toBe(102928);

      // Commission (12%): 102928 * 0.12 = 12351.36 -> 12,351 paise = 123.51 INR
      expect(commission.platformSharePaise).toBe(12351);
      expect(toMajorUnits(commission.platformSharePaise, 'INR')).toBe(123.51);

      // Transporter share: 102928 - 12351 = 90,577 paise = 905.77 INR
      expect(commission.partnerSharePaise).toBe(90577);
      expect(toMajorUnits(commission.partnerSharePaise, 'INR')).toBe(905.77);

      expect(commission.platformSharePaise + commission.partnerSharePaise).toBe(price.amountPaise);
      expect(formatCurrency(price.amountRupees, 'INR')).toMatch(/₹\s?1,029\.28/);
    });
  });

  describe('3. Distance Resolution & Road vs Haversine Verification', () => {
    it('accepts valid road distance within realistic bounds of straight-line haversine distance', () => {
      const haversineKm = 10.0;
      const roadKm = 13.5; // realistic road detour factor ~ 1.35x
      const authoritative = resolveAuthoritativeDistance(haversineKm, roadKm);
      expect(authoritative).toBe(13.5);
    });

    it('falls back safely to straight-line distance when client road distance is omitted, negative or spoofed', () => {
      const haversineKm = 20.0;
      expect(resolveAuthoritativeDistance(haversineKm, undefined)).toBe(20.0);
      expect(resolveAuthoritativeDistance(haversineKm, -5.0)).toBe(20.0);
      // Maliciously inflated distance (> 3.5x haversine)
      expect(resolveAuthoritativeDistance(haversineKm, 100.0)).toBe(20.0);
      // Impossible road distance (< 0.95x haversine)
      expect(resolveAuthoritativeDistance(haversineKm, 15.0)).toBe(20.0);
    });
  });

  describe('4. INR Currency Formatting & Localization', () => {
    it('formats amounts in Indian Rupees with correct en-IN comma separation', () => {
      const formattedSmall = formatCurrency(367.36, 'INR');
      expect(formattedSmall).toMatch(/₹\s?367\.36/);
      expect(formattedSmall).not.toContain('$');

      const formattedThousand = formatCurrency(1250.00, 'INR');
      expect(formattedThousand).toMatch(/₹\s?1,250\.00/);

      const formattedLakh = formatCurrency(12500.00, 'INR');
      expect(formattedLakh).toMatch(/₹\s?12,500\.00/);
    });

    it('never formats INR as USD or displays dollar symbol for Indian transactions', () => {
      const amounts = [7, 14.5, 25, 70, 175, 238, 1029.28];
      for (const amt of amounts) {
        const formatted = formatCurrency(amt, 'INR');
        expect(formatted).not.toContain('$');
        expect(formatted).toContain('₹');
      }
    });

    it('converts to/from minor units (paise) with exact integer fidelity', () => {
      expect(toMinorUnits(7.00, 'INR')).toBe(700);
      expect(toMinorUnits(112.35, 'INR')).toBe(11235);
      expect(toMajorUnits(11235, 'INR')).toBe(112.35);
      expect(toMajorUnits(700, 'INR')).toBe(7.00);
    });
  });

  describe('5. Initialization & Storage Persistence', () => {
    it('initializeCurrency defaults strictly to INR and persists it in localStorage', async () => {
      localStorage.clear();
      const curr = await initializeCurrency();
      expect(curr).toBe('INR');
      expect(getStoredCurrency()).toBe('INR');
      expect(localStorage.getItem('routem8_preferred_currency')).toBe('INR');
      expect(localStorage.getItem('routem8_preferred_country')).toBe('IN');
    });

    it('respects explicitly user-selected stored currency', async () => {
      setStoredCurrency('EUR');
      const curr = await initializeCurrency();
      expect(curr).toBe('EUR');
      expect(getStoredCurrency()).toBe('EUR');
    });
  });
});
