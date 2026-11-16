// @vitest-environment node
/**
 * RouteM8 — Phase 6.2.1 Multi-Currency Financial Integrity & Hardening Test Suite
 * Validates integer minor unit arithmetic, floating-point immunity,
 * HMAC-SHA256 cryptographic signing, replay attack prevention, and reconciliation checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  safeParseDecimalToMinorUnits,
  assertValidMinorUnits,
  toMinorUnits,
  toMajorUnits,
  formatCurrency,
} from '../services/currencyService.js';
import {
  createConversionQuote,
  validateConversionQuote,
  validateConversionQuoteAsync,
  consumeConversionQuote,
  computeQuoteSignature,
  verifyQuoteSignature,
  inMemoryQuotes,
} from '../services/exchangeRateService.js';
import { runFinancialReconciliation } from '../services/reconciliationService.js';

describe('Phase 6.2.1 — Multi-Currency Financial Integrity & Hardening', () => {
  beforeEach(() => {
    inMemoryQuotes.clear();
  });

  describe('1. Integer Minor Unit Arithmetic & Safe Decimal Parsing', () => {
    it('eliminates JavaScript floating-point drift on 19.99 * 100', () => {
      // In raw JS floating-point arithmetic:
      const floatMultiplication = 19.99 * 100;
      expect(floatMultiplication).toBe(1998.9999999999998); // Demonstration of IEEE 754 hazard

      // Our safe parser guarantees exact integer minor units
      const parsed = safeParseDecimalToMinorUnits('19.99', 'USD');
      expect(parsed).toBe(1999);
      expect(Number.isInteger(parsed)).toBe(true);
    });

    it('accurately parses standard decimal strings across 2-decimal currencies', () => {
      expect(safeParseDecimalToMinorUnits('0.01', 'USD')).toBe(1);
      expect(safeParseDecimalToMinorUnits('0.99', 'EUR')).toBe(99);
      expect(safeParseDecimalToMinorUnits('1.00', 'GBP')).toBe(100);
      expect(safeParseDecimalToMinorUnits('1234.56', 'CAD')).toBe(123456);
      expect(safeParseDecimalToMinorUnits('999999.99', 'INR')).toBe(99999999);
    });

    it('handles numeric input routed through toMinorUnits safely', () => {
      expect(toMinorUnits(19.99, 'USD')).toBe(1999);
      expect(toMinorUnits(0.05, 'EUR')).toBe(5);
      expect(toMinorUnits(100, 'INR')).toBe(10000);
      expect(toMajorUnits(1999, 'USD')).toBe(19.99);
      expect(formatCurrency(1999, 'USD', { isMinorUnits: true })).toContain('19.99');
    });

    it('safely rounds fractional fractions beyond currency decimal scale with half-up rule', () => {
      // 19.995 rounds up to 20.00 (2000 cents)
      expect(safeParseDecimalToMinorUnits('19.995', 'USD')).toBe(2000);
      // 19.994 rounds down to 19.99 (1999 cents)
      expect(safeParseDecimalToMinorUnits('19.994', 'USD')).toBe(1999);
    });

    it('rejects invalid or unsafe inputs with descriptive errors', () => {
      // Negative amounts
      expect(() => safeParseDecimalToMinorUnits('-5.00', 'USD')).toThrow(/cannot be negative/);
      expect(() => safeParseDecimalToMinorUnits(-10, 'INR')).toThrow(/cannot be negative/);

      // Non-numeric strings
      expect(() => safeParseDecimalToMinorUnits('abc', 'USD')).toThrow(/Invalid monetary decimal format/);
      expect(() => safeParseDecimalToMinorUnits('12.34.56', 'EUR')).toThrow(/Invalid monetary decimal format/);

      // NaN or Infinity
      expect(() => safeParseDecimalToMinorUnits(Number.NaN, 'USD')).toThrow();
      expect(() => safeParseDecimalToMinorUnits(Number.POSITIVE_INFINITY, 'USD')).toThrow();
    });

    it('assertValidMinorUnits enforces non-negative safe integers', () => {
      expect(() => assertValidMinorUnits(0, 'test')).not.toThrow();
      expect(() => assertValidMinorUnits(100, 'test')).not.toThrow();
      expect(() => assertValidMinorUnits(100.5, 'test')).toThrow(/integer/);
      expect(() => assertValidMinorUnits(-1, 'test')).toThrow(/cannot be negative/);
      expect(() => assertValidMinorUnits(Number.MAX_SAFE_INTEGER + 1, 'test')).toThrow(/safe financial integer limit/);
    });
  });

  describe('2. Cryptographic HMAC-SHA256 Quote Signing & Tamper Resistance', () => {
    it('generates a valid cryptographic signature for a conversion quote', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD'); // ₹100.00 to USD
      expect(quote.signature).toBeDefined();
      expect(typeof quote.signature).toBe('string');
      expect(quote.signature.length).toBe(64); // SHA-256 hex string

      const expectedSig = computeQuoteSignature(quote);
      expect(quote.signature).toBe(expectedSig);

      const isValid = verifyQuoteSignature(quote);
      expect(isValid).toBe(true);
    });

    it('rejects tampered source amount', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD');
      const tamperedQuote = { ...quote, sourceAmountMinorUnits: 9999 };
      expect(verifyQuoteSignature(tamperedQuote)).toBe(false);

      const validation = validateConversionQuote(quote.quoteId, 9999, 'INR', 'USD');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toMatch(/source amount mismatch/i);
    });

    it('rejects tampered target amount', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD');
      // Attacker attempts to increase target USD cents
      const tamperedQuote = { ...quote, targetAmountMinorUnits: quote.targetAmountMinorUnits + 500 };
      expect(verifyQuoteSignature(tamperedQuote)).toBe(false);
    });

    it('rejects tampered exchange rate', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD');
      const tamperedQuote = { ...quote, exchangeRate: 0.99 };
      expect(verifyQuoteSignature(tamperedQuote)).toBe(false);
    });

    it('rejects tampered currency pair', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD');
      const tamperedQuote = { ...quote, targetCurrency: 'EUR' };
      expect(verifyQuoteSignature(tamperedQuote)).toBe(false);

      const validation = validateConversionQuote(quote.quoteId, 10000, 'INR', 'EUR');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toMatch(/target currency mismatch/i);
    });

    it('rejects expired quotes', () => {
      const quote = createConversionQuote(10000, 'INR', 'USD');
      // Backdate expiresAt to the past
      quote.expiresAt = new Date(Date.now() - 1000);

      const validation = validateConversionQuote(quote.quoteId, 10000, 'INR', 'USD');
      expect(validation.isValid).toBe(false);
      expect(validation.error).toMatch(/expired/i);
    });
  });

  describe('3. Quote Replay Attack Prevention', () => {
    it('prevents reusing a conversion quote across multiple transactions', async () => {
      const quote = createConversionQuote(5000, 'INR', 'USD');
      const quoteId = quote.quoteId;

      // First validation passes
      const firstCheck = await validateConversionQuoteAsync(quoteId, 5000, 'INR', 'USD');
      expect(firstCheck.isValid).toBe(true);

      // Order consumes quote
      const consumed = await consumeConversionQuote(quoteId, 'order_12345');
      expect(consumed).toBe(true);

      // Second attempt to use the same quote must be strictly rejected
      const secondCheck = await validateConversionQuoteAsync(quoteId, 5000, 'INR', 'USD');
      expect(secondCheck.isValid).toBe(false);
      expect(secondCheck.error).toMatch(/already been consumed.*replay prevented/i);
    });
  });

  describe('4. Serverless & Cold-Start Resilience', () => {
    it('validates quotes through validateConversionQuoteAsync', async () => {
      const quote = createConversionQuote(2500, 'INR', 'EUR');
      const result = await validateConversionQuoteAsync(quote.quoteId, 2500, 'INR', 'EUR');

      expect(result.isValid).toBe(true);
      expect(result.quote).toBeDefined();
      expect(result.quote?.targetAmountMinorUnits).toBe(quote.targetAmountMinorUnits);
      expect(result.quote?.rateType).toBe('benchmark');
    });

    it('rejects non-existent quote gracefully', async () => {
      const result = await validateConversionQuoteAsync('non_existent_quote_id', 1000, 'INR', 'USD');
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/not found or has expired/i);
    });
  });

  describe('5. Multi-Currency Reconciliation Audit (CURRENCY_MISMATCH)', () => {
    it('flags CURRENCY_MISMATCH when settlement currency differs from payment order currency', async () => {
      const mockOrder = {
        _id: 'order_usd_1',
        deliveryId: 'del_1',
        transporterId: 'transporter_1',
        currencyCode: 'USD',
        currency: 'USD',
        amountPaise: 2500, // 25.00 USD
        status: 'settled',
        commissionSnapshot: {
          platformSharePaise: 250,
          partnerSharePaise: 2250,
        },
      };

      const mismatchedSettlement = {
        _id: 'settle_inr_1',
        paymentOrderId: 'order_usd_1',
        deliveryId: 'del_1',
        transporterId: 'transporter_1',
        currencyCode: 'INR', // MISMATCH: Order is USD, settlement is INR
        currency: 'INR',
        amountPaise: 2250,
        status: 'settled',
        entryType: 'settlement',
      };

      const report = await runFinancialReconciliation({
        orders: [mockOrder],
        settlements: [mismatchedSettlement],
        refunds: [],
        deliveries: [{ _id: 'del_1', status: 'completed' }],
        vendors: [],
      });

      const currencyMismatch = report.discrepancies.find((d) => d.type === 'CURRENCY_MISMATCH');
      expect(currencyMismatch).toBeDefined();
      expect(currencyMismatch?.severity).toBe('high');
      expect(currencyMismatch?.description).toContain('PaymentOrder currency is \'USD\' but Settlement currency is \'INR\'');
    });

    it('flags CURRENCY_MISMATCH when refund currency differs from payment order currency', async () => {
      const mockOrder = {
        _id: 'order_eur_1',
        deliveryId: 'del_2',
        transporterId: 'transporter_2',
        currencyCode: 'EUR',
        currency: 'EUR',
        amountPaise: 5000, // 50.00 EUR
        status: 'partially_refunded',
        refundedAmountPaise: 1000,
        commissionSnapshot: {
          platformSharePaise: 500,
          partnerSharePaise: 4500,
        },
      };

      const mismatchedRefund = {
        _id: 'refund_usd_1',
        paymentOrderId: 'order_eur_1',
        deliveryId: 'del_2',
        currencyCode: 'USD', // MISMATCH: Order is EUR, refund is USD
        currency: 'USD',
        amountPaise: 1000,
        status: 'processed',
      };

      const report = await runFinancialReconciliation({
        orders: [mockOrder],
        settlements: [],
        refunds: [mismatchedRefund],
        deliveries: [{ _id: 'del_2', status: 'assigned' }],
        vendors: [],
      });

      const currencyMismatch = report.discrepancies.find((d) => d.type === 'CURRENCY_MISMATCH');
      expect(currencyMismatch).toBeDefined();
      expect(currencyMismatch?.severity).toBe('high');
      expect(currencyMismatch?.description).toContain('PaymentOrder currency is \'EUR\' but Refund currency is \'USD\'');
    });

    it('passes cleanly without CURRENCY_MISMATCH when all records use matching currency', async () => {
      const mockOrder = {
        _id: 'order_usd_clean',
        deliveryId: 'del_clean',
        transporterId: 'transporter_clean',
        currencyCode: 'USD',
        currency: 'USD',
        amountPaise: 2500,
        status: 'settled',
        commissionSnapshot: {
          platformSharePaise: 250,
          partnerSharePaise: 2250,
        },
      };

      const matchedSettlement = {
        _id: 'settle_usd_clean',
        paymentOrderId: 'order_usd_clean',
        deliveryId: 'del_clean',
        transporterId: 'transporter_clean',
        currencyCode: 'USD',
        currency: 'USD',
        amountPaise: 2250,
        status: 'settled',
        entryType: 'settlement',
      };

      const report = await runFinancialReconciliation({
        orders: [mockOrder],
        settlements: [matchedSettlement],
        refunds: [],
        deliveries: [{ _id: 'del_clean', status: 'completed' }],
        vendors: [],
      });

      const currencyMismatches = report.discrepancies.filter((d) => d.type === 'CURRENCY_MISMATCH');
      expect(currencyMismatches.length).toBe(0);
    });
  });
});
