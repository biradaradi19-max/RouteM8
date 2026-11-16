// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApp } from '../app.js';
import {
  isSupportedCurrency,
  getCurrencyConfig,
  getCurrencyForCountry,
  toMinorUnits,
  toMajorUnits,
  formatCurrency,
  detectCountryFromHeaders,
} from '../services/currencyService.js';
import {
  getExchangeRate,
  createConversionQuote,
  validateConversionQuote,
} from '../services/exchangeRateService.js';
import {
  inMemoryPaymentOrders,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryWebhookEvents,
  inMemoryVendors,
} from '../routes/payments.js';
import { inMemoryDeliveries } from '../routes/deliveries.js';
import { inMemoryApplications } from '../routes/partnerApplication.js';

describe('RouteM8 Phase 6.2: Location-Based Currency & Internationalization System', () => {
  let server: Server;
  let baseUrl: string;

  const requesterUid = 'requester-intl-101';
  const requesterToken = 'Bearer mock-token-requester-intl-101';
  const transporterUid = 'transporter-intl-202';
  const adminToken = 'Bearer mock-token-admin-intl';

  const testInrDeliveryId = 'del-intl-inr-001';
  const testUsdDeliveryId = 'del-intl-usd-002';
  const testEurDeliveryId = 'del-intl-eur-003';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_TEST_TOKENS = 'true';

    // Clear test in-memory stores
    inMemoryPaymentOrders.clear();
    inMemorySettlements.clear();
    inMemoryRefunds.clear();
    inMemoryWebhookEvents.clear();
    inMemoryVendors.clear();
    inMemoryDeliveries.length = 0;
    inMemoryApplications.clear();

    // Setup deliveries
    inMemoryDeliveries.push(
      {
        _id: testInrDeliveryId,
        id: testInrDeliveryId,
        requesterId: requesterUid,
        transporterId: transporterUid,
        compensation: 50, // ₹50.00 = 5000 paise
        status: 'completed',
        pickupAddress: 'Mumbai, India',
        dropoffAddress: 'Thane, India',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        _id: testUsdDeliveryId,
        id: testUsdDeliveryId,
        requesterId: requesterUid,
        transporterId: transporterUid,
        compensation: 100, // ₹100.00 base = 10000 paise
        status: 'completed',
        pickupAddress: 'New York, USA',
        dropoffAddress: 'Brooklyn, USA',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
      {
        _id: testEurDeliveryId,
        id: testEurDeliveryId,
        requesterId: requesterUid,
        transporterId: transporterUid,
        compensation: 80, // ₹80.00 base = 8000 paise
        status: 'completed',
        pickupAddress: 'Berlin, Germany',
        dropoffAddress: 'Potsdam, Germany',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any
    );

    // Seed approved transporter
    inMemoryApplications.set(transporterUid, {
      _id: `app-${transporterUid}`,
      applicantId: transporterUid,
      status: 'approved',
      vehicleCategory: 'motorcycle',
    });

    inMemoryVendors.set(transporterUid, {
      vendorId: `vend_mock_${transporterUid}`,
      transporterId: transporterUid,
      transporterName: 'Transporter Partner Intl',
      verificationStatus: 'verified',
      bankAccountRef: 'HDFC-****4821',
      ifscCode: 'HDFC0001234',
      isEligibleForSettlement: true,
      unresolvedNegativeBalancePaise: 0,
      totalNegativeExposureRecoveredPaise: 0,
      isMock: true,
    } as any);

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // =========================================================================
  // 1. CURRENCY SERVICE & MATHEMATICAL INTEGRITY
  // =========================================================================
  describe('1. Currency Configuration & Minor Unit Mathematics', () => {
    it('supports all 8 target currencies with correct metadata', () => {
      const expectedCodes = ['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'AED', 'SGD'];
      for (const code of expectedCodes) {
        expect(isSupportedCurrency(code)).toBe(true);
        const config = getCurrencyConfig(code);
        expect(config.code).toBe(code);
        expect(config.symbol).toBeTruthy();
        expect(config.flag).toBeTruthy();
        expect(config.decimals).toBe(2);
        expect(config.minorUnitRatio).toBe(100);
      }
    });

    it('rejects unsupported currency symbols/codes', () => {
      expect(isSupportedCurrency('XYZ')).toBe(false);
      expect(isSupportedCurrency('BTC')).toBe(false);
      expect(isSupportedCurrency('')).toBe(false);
      expect(isSupportedCurrency(undefined)).toBe(false);
    });

    it('correctly maps ISO country codes to currencies', () => {
      expect(getCurrencyForCountry('IN')).toBe('INR');
      expect(getCurrencyForCountry('US')).toBe('USD');
      expect(getCurrencyForCountry('GB')).toBe('GBP');
      expect(getCurrencyForCountry('DE')).toBe('EUR');
      expect(getCurrencyForCountry('FR')).toBe('EUR');
      expect(getCurrencyForCountry('CA')).toBe('CAD');
      expect(getCurrencyForCountry('AU')).toBe('AUD');
      expect(getCurrencyForCountry('AE')).toBe('AED');
      expect(getCurrencyForCountry('SG')).toBe('SGD');
      expect(getCurrencyForCountry('UNKNOWN')).toBe('INR'); // Default India-first
    });

    it('strictly converts between major and integer minor units without floating-point drift', () => {
      expect(toMinorUnits(15.5, 'USD')).toBe(1550);
      expect(toMinorUnits(25.99, 'EUR')).toBe(2599);
      expect(toMinorUnits(0.01, 'GBP')).toBe(1);
      expect(toMinorUnits(100.0, 'INR')).toBe(10000);

      expect(toMajorUnits(1550, 'USD')).toBe(15.5);
      expect(toMajorUnits(2599, 'EUR')).toBe(25.99);
      expect(toMajorUnits(1, 'GBP')).toBe(0.01);
      expect(toMajorUnits(10000, 'INR')).toBe(100.0);
    });

    it('formats currency correctly in locale-specific representation', () => {
      const formattedInr = formatCurrency(5000, 'INR', { isMinorUnits: true });
      expect(formattedInr).toContain('50');

      const formattedUsd = formatCurrency(1234, 'USD', { isMinorUnits: true });
      expect(formattedUsd).toContain('12.34');
      expect(formattedUsd).toContain('$');

      const formattedGbp = formatCurrency(1050, 'GBP', { isMinorUnits: true });
      expect(formattedGbp).toContain('10.50');
      expect(formattedGbp).toContain('£');
    });

    it('detects country from transport headers without inspecting or logging user IP', () => {
      // Vercel header
      const vercelRes = detectCountryFromHeaders({ 'x-vercel-ip-country': 'US' });
      expect(vercelRes.countryCode).toBe('US');
      expect(vercelRes.currencyCode).toBe('USD');
      expect(vercelRes.source).toBe('vercel_ip');

      // Cloudflare header
      const cfRes = detectCountryFromHeaders({ 'cf-ipcountry': 'GB' });
      expect(cfRes.countryCode).toBe('GB');
      expect(cfRes.currencyCode).toBe('GBP');
      expect(cfRes.source).toBe('cloudflare_ip');

      // Custom header
      const customRes = detectCountryFromHeaders({ 'x-country-code': 'DE' });
      expect(customRes.countryCode).toBe('DE');
      expect(customRes.currencyCode).toBe('EUR');
      expect(customRes.source).toBe('custom_header');

      // Default fallback
      const defaultRes = detectCountryFromHeaders({});
      expect(defaultRes.countryCode).toBe('IN');
      expect(defaultRes.currencyCode).toBe('INR');
      expect(defaultRes.source).toBe('default');
    });
  });

  // =========================================================================
  // 2. EXCHANGE RATE & CONVERSION QUOTE SERVICE
  // =========================================================================
  describe('2. Authoritative Exchange Rate Quotes & Expiration', () => {
    it('returns 1.0 identity rate for identical currency pairs', () => {
      const inrRate = getExchangeRate('INR', 'INR');
      expect(inrRate.rate).toBe(1.0);
      expect(inrRate.source).toBe('identity');

      const usdRate = getExchangeRate('USD', 'USD');
      expect(usdRate.rate).toBe(1.0);
    });

    it('calculates cross-rates deterministically via INR reference', () => {
      const inrToUsd = getExchangeRate('INR', 'USD');
      expect(inrToUsd.rate).toBeGreaterThan(0.01);
      expect(inrToUsd.rate).toBeLessThan(0.02);

      const usdToInr = getExchangeRate('USD', 'INR');
      expect(usdToInr.rate).toBeGreaterThan(70);
      expect(usdToInr.rate).toBeLessThan(100);
    });

    it('generates an authoritative conversion quote with 10-minute TTL', () => {
      const sourceAmountMinor = 5000; // 50.00 INR
      const quote = createConversionQuote(sourceAmountMinor, 'INR', 'USD');

      expect(quote.quoteId).toMatch(/^quote_/);
      expect(quote.sourceCurrency).toBe('INR');
      expect(quote.targetCurrency).toBe('USD');
      expect(quote.sourceAmountMinorUnits).toBe(5000);
      expect(Number.isInteger(quote.targetAmountMinorUnits)).toBe(true);
      expect(quote.targetAmountMinorUnits).toBeGreaterThan(0);

      const ttlMs = quote.expiresAt.getTime() - quote.createdAt.getTime();
      expect(ttlMs).toBe(10 * 60 * 1000); // Exactly 10 minutes
    });

    it('authoritatively validates an unaltered quote', () => {
      const quote = createConversionQuote(10000, 'INR', 'EUR');
      const validation = validateConversionQuote(quote.quoteId, 10000, 'INR', 'EUR');
      expect(validation.isValid).toBe(true);
      expect(validation.quote).toBeDefined();
    });

    it('detects and rejects tampered conversion quotes', () => {
      const quote = createConversionQuote(10000, 'INR', 'GBP');

      // Tampered amount
      const amountMismatch = validateConversionQuote(quote.quoteId, 5000, 'INR', 'GBP');
      expect(amountMismatch.isValid).toBe(false);
      expect(amountMismatch.error).toContain('Quote source amount mismatch');

      // Tampered source currency
      const srcMismatch = validateConversionQuote(quote.quoteId, 10000, 'USD', 'GBP');
      expect(srcMismatch.isValid).toBe(false);
      expect(srcMismatch.error).toContain('Quote source currency mismatch');

      // Tampered target currency
      const tgtMismatch = validateConversionQuote(quote.quoteId, 10000, 'INR', 'EUR');
      expect(tgtMismatch.isValid).toBe(false);
      expect(tgtMismatch.error).toContain('Quote target currency mismatch');
    });

    it('rejects expired quotes', () => {
      const quote = createConversionQuote(5000, 'INR', 'CAD');
      // Artificially expire the quote
      quote.expiresAt = new Date(Date.now() - 1000);

      const validation = validateConversionQuote(quote.quoteId);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('expired');
    });
  });

  // =========================================================================
  // 3. API ENDPOINTS: /currencies, /detect-country, /exchange-quote
  // =========================================================================
  describe('3. Public Internationalization API Endpoints', () => {
    it('GET /api/payments/currencies returns all supported currencies', async () => {
      const res = await fetch(`${baseUrl}/api/payments/currencies`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.defaultCurrency).toBe('INR');
      expect(data.defaultCountry).toBe('IN');
      expect(data.currencies.INR).toBeDefined();
      expect(data.currencies.USD).toBeDefined();
      expect(data.currencies.EUR).toBeDefined();
    });

    it('GET /api/payments/detect-country detects country from Vercel header', async () => {
      const resUs = await fetch(`${baseUrl}/api/payments/detect-country`, {
        headers: { 'x-vercel-ip-country': 'US' },
      });
      const dataUs: any = await resUs.json();
      expect(dataUs.success).toBe(true);
      expect(dataUs.countryCode).toBe('US');
      expect(dataUs.currencyCode).toBe('USD');
      expect(dataUs.source).toBe('vercel_ip');
    });

    it('GET /api/payments/detect-country detects country from Cloudflare header', async () => {
      const resGb = await fetch(`${baseUrl}/api/payments/detect-country`, {
        headers: { 'cf-ipcountry': 'GB' },
      });
      const dataGb: any = await resGb.json();
      expect(dataGb.success).toBe(true);
      expect(dataGb.countryCode).toBe('GB');
      expect(dataGb.currencyCode).toBe('GBP');
      expect(dataGb.source).toBe('cloudflare_ip');
    });

    it('GET /api/payments/detect-country falls back to default IN/INR', async () => {
      const resDef = await fetch(`${baseUrl}/api/payments/detect-country`);
      const dataDef: any = await resDef.json();
      expect(dataDef.success).toBe(true);
      expect(dataDef.countryCode).toBe('IN');
      expect(dataDef.currencyCode).toBe('INR');
      expect(dataDef.source).toBe('default');
    });

    it('POST /api/payments/exchange-quote generates valid quote', async () => {
      const res = await fetch(`${baseUrl}/api/payments/exchange-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAmountMinorUnits: 5000,
          sourceCurrency: 'INR',
          targetCurrency: 'USD',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.quote.quoteId).toBeTruthy();
      expect(data.quote.sourceAmountMinorUnits).toBe(5000);
      expect(data.quote.targetCurrency).toBe('USD');
    });

    it('POST /api/payments/exchange-quote rejects invalid currency or negative amounts', async () => {
      const resInvalidCurr = await fetch(`${baseUrl}/api/payments/exchange-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAmountMinorUnits: 5000,
          sourceCurrency: 'XYZ',
          targetCurrency: 'USD',
        }),
      });
      expect(resInvalidCurr.status).toBe(400);

      const resNegative = await fetch(`${baseUrl}/api/payments/exchange-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAmountMinorUnits: -100,
          sourceCurrency: 'INR',
          targetCurrency: 'USD',
        }),
      });
      expect(resNegative.status).toBe(400);
    });
  });

  // =========================================================================
  // 4. ORDER CREATION WITH MULTI-CURRENCY SUPPORT
  // =========================================================================
  describe('4. Multi-Currency Payment Order Creation', () => {
    it('creates domestic INR order with isInternationalSimulation: false', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testInrDeliveryId,
          currencyCode: 'INR',
          idempotencyKey: 'idemp_inr_test_001',
        }),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.order.currency).toBe('INR');
      expect(data.order.currencyCode).toBe('INR');
      expect(data.order.amountPaise).toBe(5000);
      expect(data.order.amountMinorUnits).toBe(5000);
      expect(data.order.originalCurrencyCode).toBe('INR');
      expect(data.order.exchangeRate).toBe(1.0);
      expect(data.isInternationalSimulation).toBe(false);
    });

    it('creates international USD order routed to mock sandbox with isInternationalSimulation: true', async () => {
      // First get an exchange quote
      const quoteRes = await fetch(`${baseUrl}/api/payments/exchange-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAmountMinorUnits: 10000, // ₹100.00
          sourceCurrency: 'INR',
          targetCurrency: 'USD',
        }),
      });
      const quoteData: any = await quoteRes.json();
      const quoteId = quoteData.quote.quoteId;

      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testUsdDeliveryId,
          currencyCode: 'USD',
          conversionQuoteId: quoteId,
          idempotencyKey: 'idemp_usd_test_002',
        }),
      });

      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.order.currency).toBe('USD');
      expect(data.order.currencyCode).toBe('USD');
      expect(data.order.originalCurrencyCode).toBe('INR');
      expect(data.order.originalAmountMinorUnits).toBe(10000);
      expect(data.order.amountMinorUnits).toBe(quoteData.quote.targetAmountMinorUnits);
      expect(data.order.conversionQuoteId).toBe(quoteId);
      expect(data.order.provider).toBe('mock'); // Forced to mock sandbox for non-INR
      expect(data.isInternationalSimulation).toBe(true);
    });

    it('rejects order creation with expired or tampered conversion quote', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testEurDeliveryId,
          currencyCode: 'EUR',
          conversionQuoteId: 'quote_non_existent_fake_id',
          idempotencyKey: 'idemp_fake_quote_001',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Invalid or expired exchange quote');
    });

    it('rejects unsupported currency code during order creation', async () => {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: testEurDeliveryId,
          currencyCode: 'XYZ',
          idempotencyKey: 'idemp_invalid_curr_001',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Unsupported currency code');
    });
  });

  // =========================================================================
  // 5. SETTLEMENT & REFUND CURRENCY CONSISTENCY
  // =========================================================================
  describe('5. Settlement & Refund Currency Consistency Enforcement', () => {
    let paidInrOrderId: string;
    let paidUsdOrderId: string;

    beforeAll(async () => {
      // Mark INR order as paid
      const inrOrder = inMemoryPaymentOrders.get(testInrDeliveryId);
      if (inrOrder) {
        inrOrder.status = 'paid';
        inrOrder.transporterId = transporterUid;
        paidInrOrderId = inrOrder._id;
      }

      // Mark USD order as paid
      const usdOrder = inMemoryPaymentOrders.get(testUsdDeliveryId);
      if (usdOrder) {
        usdOrder.status = 'paid';
        usdOrder.transporterId = transporterUid;
        paidUsdOrderId = usdOrder._id;
      }
    });

    it('executes settlement successfully when matching order currency', async () => {
      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: paidInrOrderId,
          currencyCode: 'INR',
          idempotencyKey: 'settle_inr_valid_001',
        }),
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.success).toBe(true);
      expect(data.settlement.currency).toBe('INR');
      expect(data.settlement.currencyCode).toBe('INR');
      expect(data.settlement.amountMinorUnits).toBeGreaterThan(0);
    });

    it('rejects settlement when requested currency does not match order currency', async () => {
      const res = await fetch(`${baseUrl}/api/payments/settle`, {
        method: 'POST',
        headers: {
          Authorization: adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: paidUsdOrderId,
          currencyCode: 'EUR', // USD order settled in EUR -> Mismatch!
          idempotencyKey: 'settle_mismatch_001',
        }),
      });

      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toContain('Currency mismatch');
    });

    it('executes refund successfully when matching order currency', async () => {
      // Create fresh paid order for refund testing
      const refundDeliveryId = 'del-refund-match-001';
      inMemoryDeliveries.push({
        _id: refundDeliveryId,
        id: refundDeliveryId,
        requesterId: requesterUid,
        transporterId: transporterUid,
        compensation: 100, // ₹100 = 120 USD cents, ample for a 50 cents refund
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Create order
      const createRes = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deliveryId: refundDeliveryId,
          currencyCode: 'USD',
          idempotencyKey: 'idemp_refund_order_001',
        }),
      });
      await createRes.json();
      const order = inMemoryPaymentOrders.get(refundDeliveryId);
      order.status = 'paid';

      // Execute matching refund
      const refundRes = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: order._id,
          reason: 'Package not received',
          currencyCode: 'USD',
          amountMinorUnits: 50,
          idempotencyKey: 'refund_usd_valid_001',
        }),
      });

      expect(refundRes.status).toBe(200);
      const refundData: any = await refundRes.json();
      expect(refundData.success).toBe(true);
      expect(refundData.refund.currency).toBe('USD');
      expect(refundData.refund.amountMinorUnits).toBe(50);
    });

    it('rejects cross-currency refund when requested currency does not match order currency', async () => {
      const inrOrder = inMemoryPaymentOrders.get(testInrDeliveryId);

      const refundRes = await fetch(`${baseUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          Authorization: requesterToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentOrderId: inrOrder._id,
          reason: 'Currency mismatch test',
          currencyCode: 'USD', // INR order refunded in USD -> Rejected!
          idempotencyKey: 'refund_mismatch_001',
        }),
      });

      expect(refundRes.status).toBe(400);
      const data: any = await refundRes.json();
      expect(data.error).toContain('Currency mismatch');
    });
  });
});
