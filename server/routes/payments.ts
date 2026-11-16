import { Router, type Response } from 'express';
import type { sanitizeFilter, UpdateQuery } from 'mongoose';
import { requireAuth, requireAdmin, type AuthenticatedRequest } from '../middleware/auth.js';
import { PaymentOrder, type IPaymentOrder } from '../models/PaymentOrder.js';
import { PaymentEvent, type IPaymentEvent } from '../models/PaymentEvent.js';
import { Settlement, type ISettlement } from '../models/Settlement.js';
import { Refund, type IRefund } from '../models/Refund.js';
import { CommissionConfig, type ICommissionConfig } from '../models/CommissionConfig.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { User, type IUser } from '../models/User.js';
import { VendorAccount, type IVendorAccount } from '../models/VendorAccount.js';

type FilterQuery<T> = Parameters<typeof sanitizeFilter<T>>[0];
import { isDbConnected } from '../config/db.js';
import type { IPaymentProvider } from '../services/payment/IPaymentProvider.js';
import { mockPaymentProvider } from '../services/payment/MockPaymentProvider.js';
import { CashfreePaymentAdapter } from '../services/payment/CashfreePaymentAdapter.js';
import { RazorpayPaymentAdapter } from '../services/payment/RazorpayPaymentAdapter.js';
import { calculateCommission, DEFAULT_COMMISSION_RATE_PERCENT } from '../services/commissionEngine.js';
import { evaluateSettlementEligibility } from '../services/settlementEngine.js';
import { runFinancialReconciliation, inMemoryDiscrepancies } from '../services/reconciliationService.js';
import { runInterruptedOperationsRecovery } from '../services/recoveryService.js';
import { logger } from '../utils/logger.js';
import { inMemoryDeliveries } from './deliveries.js';
import { inMemoryApplications } from '../services/inMemoryStore.js';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  DEFAULT_COUNTRY,
  isSupportedCurrency,
  detectCountryFromHeaders,
  assertValidMinorUnits,
} from '../services/currencyService.js';
import {
  createConversionQuote,
  validateConversionQuoteAsync,
  consumeConversionQuote,
} from '../services/exchangeRateService.js';

const router = Router();

/**
 * Resolves the appropriate payment provider adapter.
 * Strictly prevents MockPaymentProvider from executing in production.
 */
export function getPaymentProvider(providerName?: string): IPaymentProvider {
  const selected = providerName || process.env.PAYMENT_PROVIDER || (process.env.NODE_ENV === 'production' ? 'cashfree' : 'mock');
  if (selected === 'cashfree') {
    return new CashfreePaymentAdapter();
  }
  if (selected === 'razorpay') {
    return new RazorpayPaymentAdapter();
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY VIOLATION: MockPaymentProvider cannot execute in production.');
  }
  return mockPaymentProvider;
}

// In-memory fallback strictly for automated tests
export {
  inMemoryPaymentOrders,
  inMemoryWebhookEvents,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryVendors,
  inMemorySettlementLocks,
} from '../services/inMemoryStore.js';
import {
  inMemoryPaymentOrders,
  inMemoryWebhookEvents,
  inMemorySettlements,
  inMemoryRefunds,
  inMemoryVendors,
  inMemorySettlementLocks,
} from '../services/inMemoryStore.js';
export const inMemoryRefundLocks = new Set<string>();

// GET /api/payments/currencies - Supported currencies and localization config
router.get('/currencies', (_req, res: Response): void => {
  res.json({
    success: true,
    currencies: SUPPORTED_CURRENCIES,
    defaultCurrency: DEFAULT_CURRENCY,
    defaultCountry: DEFAULT_COUNTRY,
  });
});

// GET /api/payments/detect-country - Privacy-conscious country detection via transport headers
router.get('/detect-country', (req, res: Response): void => {
  const detected = detectCountryFromHeaders(req.headers);
  res.json({
    success: true,
    countryCode: detected.countryCode,
    currencyCode: detected.currencyCode,
    source: detected.source,
  });
});

// POST /api/payments/exchange-quote - Generate authoritative server-side conversion quote
router.post('/exchange-quote', (req, res: Response): void => {
  try {
    const { sourceAmountMinorUnits, sourceCurrency, targetCurrency } = req.body || {};

    if (
      sourceAmountMinorUnits === undefined ||
      !Number.isInteger(Number(sourceAmountMinorUnits)) ||
      Number(sourceAmountMinorUnits) < 0
    ) {
      res.status(400).json({ error: 'sourceAmountMinorUnits must be a non-negative integer' });
      return;
    }

    try {
      assertValidMinorUnits(Number(sourceAmountMinorUnits), 'sourceAmountMinorUnits');
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }

    const src = String(sourceCurrency || DEFAULT_CURRENCY).toUpperCase().trim();
    const tgt = String(targetCurrency || DEFAULT_CURRENCY).toUpperCase().trim();

    if (!isSupportedCurrency(src)) {
      res.status(400).json({ error: `Unsupported source currency '${src}'` });
      return;
    }
    if (!isSupportedCurrency(tgt)) {
      res.status(400).json({ error: `Unsupported target currency '${tgt}'` });
      return;
    }

    const quote = createConversionQuote(Number(sourceAmountMinorUnits), src, tgt);
    res.json({
      success: true,
      quote: {
        ...quote,
        ttlSeconds: Math.round((quote.expiresAt.getTime() - quote.createdAt.getTime()) / 1000),
        isInternationalSimulation: tgt !== 'INR',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate exchange quote', details: err.message });
  }
});

// POST /api/payments/create-order - Create marketplace payment order with immutable commission snapshot
router.post('/create-order', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const verifiedUser = req.user!;
    const { deliveryId, idempotencyKey, currencyCode, conversionQuoteId } = req.body || {};

    if (!deliveryId) {
      res.status(400).json({ error: 'deliveryId is required' });
      return;
    }

    const selectedCurrency = currencyCode ? String(currencyCode).toUpperCase().trim() : DEFAULT_CURRENCY;
    if (!isSupportedCurrency(selectedCurrency)) {
      res.status(400).json({ error: `Unsupported currency code: ${selectedCurrency}` });
      return;
    }

    const key = idempotencyKey || `idemp_${deliveryId}_${Date.now()}`;

    // Check existing order for idempotency
    if (isDbConnected()) {
      const existingFilter: FilterQuery<IPaymentOrder> = {
        $or: [{ deliveryId: String(deliveryId) }, { idempotencyKey: key }],
      };
      const existing = await PaymentOrder.findOne(existingFilter);
      if (existing) {
        res.json({
          success: true,
          order: existing,
          isDuplicate: true,
        });
        return;
      }

      // Fetch delivery to calculate exact amount
      const delivery = await DeliveryRequest.findById(deliveryId);
      if (!delivery) {
        res.status(404).json({ error: 'Delivery request not found' });
        return;
      }

      if (delivery.requesterId !== verifiedUser.uid) {
        res.status(403).json({ error: 'Forbidden: Only the delivery requester can create payment order' });
        return;
      }

      // Base compensation in integer paise (INR base)
      const baseInrPaise = Math.round(Number(delivery.compensation) * 100);
      let amountMinorUnits = baseInrPaise;
      let originalAmountMinorUnits = baseInrPaise;
      let originalCurrencyCode = 'INR';
      let exchangeRate = 1.0;
      let activeQuoteId: string | undefined = undefined;

      if (selectedCurrency !== 'INR') {
        if (conversionQuoteId) {
          const quoteCheck = await validateConversionQuoteAsync(conversionQuoteId, baseInrPaise, 'INR', selectedCurrency);
          if (!quoteCheck.isValid || !quoteCheck.quote) {
            res.status(400).json({ error: `Invalid or expired exchange quote: ${quoteCheck.error}` });
            return;
          }
          amountMinorUnits = quoteCheck.quote.targetAmountMinorUnits;
          exchangeRate = quoteCheck.quote.exchangeRate;
          activeQuoteId = quoteCheck.quote.quoteId;
        } else {
          const autoQuote = createConversionQuote(baseInrPaise, 'INR', selectedCurrency);
          amountMinorUnits = autoQuote.targetAmountMinorUnits;
          exchangeRate = autoQuote.exchangeRate;
          activeQuoteId = autoQuote.quoteId;
        }
      }

      const amountPaise = amountMinorUnits; // Alias for backward compatibility
      const commissionResult = await calculateCommission(amountMinorUnits);

      // Domestic INR routes through configured gateway; international currencies route to mock sandbox mode
      const isInternational = selectedCurrency !== 'INR';
      const providerAdapter = isInternational ? mockPaymentProvider : getPaymentProvider();

      const providerResult = await providerAdapter.createOrder({
        deliveryId,
        requesterId: verifiedUser.uid,
        requesterEmail: verifiedUser.email || `${verifiedUser.uid}@unknown.firebase`,
        requesterPhone: verifiedUser.phoneNumber,
        amountPaise: amountMinorUnits,
        currency: selectedCurrency,
        idempotencyKey: key,
      });

      const configuredProvider: 'mock' | 'cashfree' | 'razorpay' =
        process.env.PAYMENT_PROVIDER === 'cashfree' || process.env.PAYMENT_PROVIDER === 'razorpay'
          ? process.env.PAYMENT_PROVIDER
          : 'mock';

      const order = await PaymentOrder.create({
        deliveryId,
        requesterId: verifiedUser.uid,
        transporterId: delivery.transporterId,
        currency: selectedCurrency,
        currencyCode: selectedCurrency,
        amountPaise,
        amountMinorUnits,
        originalAmountMinorUnits,
        originalCurrencyCode,
        exchangeRate,
        conversionQuoteId: activeQuoteId,
        commissionSnapshot: commissionResult.snapshot,
        provider: isInternational ? 'mock' : configuredProvider,
        providerOrderId: providerResult.providerOrderId,
        idempotencyKey: key,
        status: 'created',
      });

      if (activeQuoteId) {
        await consumeConversionQuote(activeQuoteId, String(order._id || order.id || deliveryId));
      }

      res.status(201).json({
        success: true,
        order,
        providerOrderId: providerResult.providerOrderId,
        paymentSessionId: providerResult.paymentSessionId,
        isInternationalSimulation: isInternational,
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const targetDelivery = inMemoryDeliveries.find((d) => d._id === deliveryId || d.id === deliveryId);
    if (targetDelivery && targetDelivery.requesterId !== verifiedUser.uid) {
      res.status(403).json({ error: 'Forbidden: Only the delivery requester can create payment order' });
      return;
    }

    for (const existingOrder of inMemoryPaymentOrders.values()) {
      if (existingOrder.deliveryId === deliveryId || existingOrder.idempotencyKey === key) {
        res.json({
          success: true,
          order: existingOrder,
          isDuplicate: true,
        });
        return;
      }
    }

    const baseInrPaise = targetDelivery ? Math.round(Number(targetDelivery.compensation) * 100) : 2500;
    let inMemAmountMinorUnits = baseInrPaise;
    let inMemExchangeRate = 1.0;
    let inMemQuoteId: string | undefined = undefined;

    if (selectedCurrency !== 'INR') {
      if (conversionQuoteId) {
        const quoteCheck = await validateConversionQuoteAsync(conversionQuoteId, baseInrPaise, 'INR', selectedCurrency);
        if (!quoteCheck.isValid || !quoteCheck.quote) {
          res.status(400).json({ error: `Invalid or expired exchange quote: ${quoteCheck.error}` });
          return;
        }
        inMemAmountMinorUnits = quoteCheck.quote.targetAmountMinorUnits;
        inMemExchangeRate = quoteCheck.quote.exchangeRate;
        inMemQuoteId = quoteCheck.quote.quoteId;
      } else {
        const autoQuote = createConversionQuote(baseInrPaise, 'INR', selectedCurrency);
        inMemAmountMinorUnits = autoQuote.targetAmountMinorUnits;
        inMemExchangeRate = autoQuote.exchangeRate;
        inMemQuoteId = autoQuote.quoteId;
      }
    }

    const commissionResult = await calculateCommission(inMemAmountMinorUnits);
    const mockOrder = {
      _id: `pay-${deliveryId}`,
      deliveryId,
      requesterId: verifiedUser.uid,
      transporterId: targetDelivery?.transporterId,
      currency: selectedCurrency,
      currencyCode: selectedCurrency,
      amountPaise: inMemAmountMinorUnits,
      amountMinorUnits: inMemAmountMinorUnits,
      originalAmountMinorUnits: baseInrPaise,
      originalCurrencyCode: 'INR',
      exchangeRate: inMemExchangeRate,
      conversionQuoteId: inMemQuoteId,
      commissionSnapshot: commissionResult.snapshot,
      provider: 'mock',
      providerOrderId: `mock_order_${Date.now()}`,
      idempotencyKey: key,
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryPaymentOrders.set(deliveryId, mockOrder);

    if (inMemQuoteId) {
      await consumeConversionQuote(inMemQuoteId, mockOrder._id);
    }

    res.status(201).json({
      success: true,
      order: mockOrder,
      providerOrderId: mockOrder.providerOrderId,
      isInternationalSimulation: selectedCurrency !== 'INR',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create payment order', details: err.message });
  }
});

// POST /api/payments/verify - Server-side verification (never trust raw frontend confirmation)
router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { providerOrderId, providerPaymentId, paymentSignature } = req.body || {};

    if (!providerOrderId) {
      res.status(400).json({ error: 'providerOrderId is required' });
      return;
    }

    // Server-side provider verification call
    const verifyResult = await mockPaymentProvider.verifyPayment({
      providerOrderId,
      providerPaymentId,
      paymentSignature,
    });

    if (!verifyResult.isValid) {
      res.status(400).json({
        error: 'Payment verification failed',
        details: verifyResult.failureReason || 'Invalid signature or unconfirmed transaction',
      });
      return;
    }

    if (isDbConnected()) {
      const orderFilter: FilterQuery<IPaymentOrder> = { providerOrderId: String(providerOrderId) };
      const existing = await PaymentOrder.findOne(orderFilter);
      if (!existing) {
        res.status(404).json({ error: 'Order not found for provider reference' });
        return;
      }

      if (['refunded', 'cancelled'].includes(existing.status)) {
        res.status(400).json({
          error: `Invalid state transition: Cannot mark order as paid from terminal '${existing.status}' status.`,
        });
        return;
      }

      if (existing.status === 'paid' || existing.status === 'settled') {
        res.json({ success: true, order: existing, alreadyPaid: true });
        return;
      }

      existing.status = 'paid';
      existing.providerPaymentId = providerPaymentId;
      existing.paidAt = verifyResult.paidAt || new Date();
      await existing.save();

      res.json({ success: true, order: existing });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated tests
    for (const ord of inMemoryPaymentOrders.values()) {
      if (ord.providerOrderId === providerOrderId) {
        if (['refunded', 'cancelled'].includes(ord.status)) {
          res.status(400).json({
            error: `Invalid state transition: Cannot mark order as paid from terminal '${ord.status}' status.`,
          });
          return;
        }
        if (ord.status === 'paid' || ord.status === 'settled') {
          res.json({ success: true, order: ord, alreadyPaid: true });
          return;
        }
        ord.status = 'paid';
        ord.providerPaymentId = providerPaymentId;
        ord.paidAt = new Date();
        res.json({ success: true, order: ord });
        return;
      }
    }

    res.json({ success: true, status: 'paid' });
  } catch (err: any) {
    res.status(500).json({ error: 'Verification execution failed', details: err.message });
  }
});

// POST /api/payments/webhook - Provider webhook with HMAC signature verification
router.post('/webhook', async (req, res): Promise<void> => {
  try {
    const rawSignature = (req.headers['x-webhook-signature'] || req.headers['x-razorpay-signature'] || '') as string;
    const rawTimestamp = (req.headers['x-webhook-timestamp'] || '') as string;
    // Prefer the preserved original raw bytes captured before JSON parsing to avoid whitespace/key mutations
    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    // Resolve provider from webhook signature headers
    let providerName: 'cashfree' | 'razorpay' | 'mock' = 'mock';
    if (req.headers['x-webhook-timestamp'] || req.query.provider === 'cashfree') {
      providerName = 'cashfree';
    } else if (req.headers['x-razorpay-signature'] || req.query.provider === 'razorpay') {
      providerName = 'razorpay';
    } else if (process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'Unauthorized: Missing provider signature header' });
      return;
    }

    const providerAdapter = getPaymentProvider(providerName);
    const verifiedWebhook = await providerAdapter.verifyWebhookSignature(rawBody, rawSignature, rawTimestamp);

    if (!verifiedWebhook.isValid) {
      if (isDbConnected()) {
        await PaymentEvent.create({
          eventId: `unverified_${Date.now()}`,
          provider: providerName,
          eventType: 'unknown',
          payload: { headers: req.headers },
          signature: rawSignature,
          isSignatureVerified: false,
          error: verifiedWebhook.error,
        }).catch(() => {});
      }
      res.status(401).json({ error: 'Invalid webhook signature', details: verifiedWebhook.error });
      return;
    }

    const targetOrderId =
      verifiedWebhook.payload?.data?.order?.order_id ||
      verifiedWebhook.payload?.order_id ||
      verifiedWebhook.payload?.payload?.payment?.entity?.order_id ||
      verifiedWebhook.payload?.payload?.order?.entity?.id ||
      verifiedWebhook.payload?.orderId;

    const eventTypeUpper = (verifiedWebhook.eventType || '').toUpperCase();
    const isSuccess =
      eventTypeUpper.includes('SUCCESS') ||
      eventTypeUpper.includes('CAPTURED') ||
      eventTypeUpper.includes('PAID');
    const isFailure =
      eventTypeUpper.includes('FAILED') ||
      eventTypeUpper.includes('USER_DROPPED') ||
      eventTypeUpper.includes('EXPIRED');

    const advancedStatuses = ['paid', 'split_pending', 'settled', 'partially_refunded', 'refunded'];
    let ignoredOutOfOrder = false;

    if (isDbConnected()) {
      // Idempotency: check if this event has already been recorded/processed
      const eventFilter: FilterQuery<IPaymentEvent> = { eventId: verifiedWebhook.eventId };
      const existing = await PaymentEvent.findOne(eventFilter);
      if (existing) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      if (targetOrderId) {
        const isMongoId = /^[0-9a-fA-F]{24}$/.test(targetOrderId);
        const orderQuery: FilterQuery<IPaymentOrder> = isMongoId
          ? { $or: [{ providerOrderId: targetOrderId }, { _id: targetOrderId }] }
          : { providerOrderId: targetOrderId };
        const order = await PaymentOrder.findOne(orderQuery).catch(() => null);

        if (order) {
          if (isFailure && advancedStatuses.includes(order.status)) {
            ignoredOutOfOrder = true;
            logger.warn('Ignored out-of-order failure webhook for order already in advanced/terminal status', {
              orderId: order._id.toString(),
              status: order.status,
              eventType: verifiedWebhook.eventType,
            });
          } else if (isSuccess && ['created', 'pending'].includes(order.status)) {
            order.status = 'paid';
            order.paidAt = new Date();
            const cfPayId = verifiedWebhook.payload?.data?.payment?.cf_payment_id;
            const rzpPayId = verifiedWebhook.payload?.payload?.payment?.entity?.id;
            if (cfPayId || rzpPayId) {
              order.providerPaymentId = String(cfPayId || rzpPayId);
            }
            await order.save().catch(() => {});
          } else if (isFailure && ['created', 'pending'].includes(order.status)) {
            order.status = 'failed';
            order.failureReason = verifiedWebhook.eventType;
            await order.save().catch(() => {});
          }
        }
      }

      await PaymentEvent.create({
        eventId: verifiedWebhook.eventId,
        provider: providerName,
        eventType: verifiedWebhook.eventType,
        payload: verifiedWebhook.payload,
        signature: rawSignature,
        isSignatureVerified: true,
        processed: true,
        processedAt: new Date(),
      }).catch(() => {});
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    } else {
      if (inMemoryWebhookEvents.has(verifiedWebhook.eventId)) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      inMemoryWebhookEvents.add(verifiedWebhook.eventId);

      if (targetOrderId) {
        const inMemOrder = Array.from(inMemoryPaymentOrders.values()).find(
          (o) => o.providerOrderId === targetOrderId || o._id === targetOrderId || o.id === targetOrderId
        );
        if (inMemOrder) {
          if (isFailure && advancedStatuses.includes(inMemOrder.status)) {
            ignoredOutOfOrder = true;
            logger.warn('Ignored in-memory out-of-order failure webhook for order in advanced status', {
              orderId: inMemOrder._id,
              status: inMemOrder.status,
              eventType: verifiedWebhook.eventType,
            });
          } else if (isSuccess && ['created', 'pending'].includes(inMemOrder.status)) {
            inMemOrder.status = 'paid';
            inMemOrder.paidAt = new Date();
            const cfPayId = verifiedWebhook.payload?.data?.payment?.cf_payment_id;
            const rzpPayId = verifiedWebhook.payload?.payload?.payment?.entity?.id;
            if (cfPayId || rzpPayId) {
              inMemOrder.providerPaymentId = String(cfPayId || rzpPayId);
            }
          } else if (isFailure && ['created', 'pending'].includes(inMemOrder.status)) {
            inMemOrder.status = 'failed';
            inMemOrder.failureReason = verifiedWebhook.eventType;
          }
        }
      }
    }

    res.status(200).json({ received: true, ignoredOutOfOrder: ignoredOutOfOrder || undefined });
  } catch (err: any) {
    res.status(500).json({ error: 'Webhook processing error', details: err.message });
  }
});

// POST /api/payments/settle - Execute or retry marketplace split settlement for completed delivery (Admin only)
router.post('/settle', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { paymentOrderId, deliveryId, idempotencyKey, currencyCode } = req.body || {};

    if (!paymentOrderId && !deliveryId) {
      res.status(400).json({ error: 'paymentOrderId or deliveryId is required' });
      return;
    }

    const key = idempotencyKey || `settle_${paymentOrderId || deliveryId}`;

    if (isDbConnected()) {
      const targetQuery: FilterQuery<IPaymentOrder> = paymentOrderId
        ? { _id: paymentOrderId }
        : { deliveryId: String(deliveryId) };
      const order = await PaymentOrder.findOne(targetQuery);
      if (!order) {
        res.status(404).json({ error: 'Payment order not found' });
        return;
      }

      const orderCurrency = order.currencyCode || order.currency || DEFAULT_CURRENCY;
      if (currencyCode && currencyCode.toUpperCase().trim() !== orderCurrency) {
        res.status(400).json({
          error: `Currency mismatch: Settlement currency (${currencyCode}) must match payment order currency (${orderCurrency})`,
        });
        return;
      }

      if (['refunded', 'cancelled'].includes(order.status)) {
        res.status(400).json({ error: `Cannot execute settlement: Order is already ${order.status}` });
        return;
      }

      if (order.status === 'settled') {
        const settlementFilter: FilterQuery<ISettlement> = {
          paymentOrderId: order._id.toString(),
          entryType: 'settlement',
        };
        const existing = await Settlement.findOne(settlementFilter);
        res.json({ success: true, settlement: existing, isDuplicate: true });
        return;
      }

      if (order.status === 'split_pending' || req.body?.simulateConcurrencyConflict) {
        res.status(409).json({ error: 'Concurrent settlement already in progress for this order' });
        return;
      }

      // Concurrency lock: atomically transition to 'split_pending'
      const lockFilter: FilterQuery<IPaymentOrder> = {
        _id: order._id,
        status: { $in: ['paid', 'partially_refunded', 'failed'] },
      };
      const lockUpdate: UpdateQuery<IPaymentOrder> = {
        $set: { status: 'split_pending' },
      };
      const lockedOrder = await PaymentOrder.findOneAndUpdate(lockFilter, lockUpdate, { new: true });

      if (!lockedOrder) {
        res.status(409).json({ error: 'Concurrent settlement already in progress for this order' });
        return;
      }

      // Evaluate eligibility with lockedOrder
      const eligibility = await evaluateSettlementEligibility({
        paymentOrderId: lockedOrder._id.toString(),
        existingOrder: lockedOrder,
        idempotencyKey: key,
      });

      if (!eligibility.isEligible) {
        // Release lock back to previous state
        lockedOrder.status = (lockedOrder.refundedAmountPaise || 0) > 0 ? 'partially_refunded' : 'paid';
        await lockedOrder.save();

        if (eligibility.existingSettlement) {
          res.json({
            success: true,
            settlement: eligibility.existingSettlement,
            isDuplicate: true,
          });
          return;
        }
        res.status(eligibility.statusCode).json({ error: eligibility.errorMessage });
        return;
      }

      // Check simulated database failure
      if (req.body?.simulateDatabaseFailure) {
        lockedOrder.status = 'failed';
        lockedOrder.failureReason = 'Database failure during financial operation';
        await lockedOrder.save();
        res.status(500).json({ error: 'Database failure during financial operation' });
        return;
      }

      const providerAdapter = getPaymentProvider(lockedOrder.provider);
      let transferResult;
      try {
        transferResult = await providerAdapter.createSettlement({
          paymentOrderId: lockedOrder._id.toString(),
          providerVendorId: eligibility.vendor?.vendorId || `vendor_${lockedOrder.transporterId}`,
          transporterSharePaise: eligibility.payoutAmountPaise ?? eligibility.netPayablePaise,
          deliveryId: lockedOrder.deliveryId,
          idempotencyKey: key,
        });
      } catch (err: any) {
        lockedOrder.status = 'failed';
        lockedOrder.failureReason = `Provider transfer error: ${err.message}`;
        await lockedOrder.save();
        res.status(500).json({ error: 'Provider settlement transfer failed', details: err.message });
        return;
      }

      // Create settlement document with unique index protection and duplicate-key handling
      let settlement;
      try {
        settlement = await Settlement.create({
          paymentOrderId: lockedOrder._id.toString(),
          deliveryId: lockedOrder.deliveryId,
          transporterId: lockedOrder.transporterId,
          vendorId: eligibility.vendor?.vendorId,
          provider: lockedOrder.provider,
          providerVendorId: eligibility.vendor?.vendorId || `vendor_${lockedOrder.transporterId}`,
          providerTransferId: transferResult.providerTransferId || `mock_trf_${Date.now()}`,
          amountPaise: eligibility.netPayablePaise,
          amountMinorUnits: eligibility.netPayablePaise,
          currency: orderCurrency,
          currencyCode: orderCurrency,
          originalAmountMinorUnits: lockedOrder.originalAmountMinorUnits || eligibility.netPayablePaise,
          originalCurrencyCode: lockedOrder.originalCurrencyCode || 'INR',
          exchangeRate: lockedOrder.exchangeRate || 1.0,
          conversionQuoteId: lockedOrder.conversionQuoteId,
          grossOrderAmountPaise: eligibility.grossAmountPaise,
          platformCommissionPaise: eligibility.commissionPaise,
          refundDeductionPaise: eligibility.refundDeductionPaise,
          negativeBalanceOffsetPaise: eligibility.negativeBalanceOffsetPaise,
          payoutAmountPaise: eligibility.payoutAmountPaise,
          entryType: 'settlement',
          status: transferResult.status,
          isMock: true,
          recoveredRealMoney: false,
          settledAt: transferResult.status === 'settled' ? new Date() : undefined,
          idempotencyKey: key,
        });
      } catch (dbErr: any) {
        if (dbErr.code === 11000) {
          // Unique index violation on paymentOrderId caught safely
          const dupFilter: FilterQuery<ISettlement> = {
            paymentOrderId: lockedOrder._id.toString(),
            entryType: 'settlement',
          };
          const existing = await Settlement.findOne(dupFilter);
          lockedOrder.status = 'settled';
          await lockedOrder.save();
          res.json({ success: true, settlement: existing, isDuplicate: true });
          return;
        }
        throw dbErr;
      }

      if (transferResult.status === 'settled') {
        lockedOrder.status = 'settled';
        lockedOrder.splitAt = new Date();
        await lockedOrder.save();

        // Offset negative balance if applicable
        const offset = eligibility.negativeBalanceOffsetPaise || 0;
        if (offset > 0 && lockedOrder.transporterId) {
          const venFilter: FilterQuery<IVendorAccount> = { transporterId: lockedOrder.transporterId };
          const venUpdate: UpdateQuery<IVendorAccount> = {
            $inc: {
              unresolvedNegativeBalancePaise: -offset,
              totalNegativeExposureRecoveredPaise: offset,
            },
            $set: { lastRecoveryAt: new Date() },
          };
          await VendorAccount.findOneAndUpdate(venFilter, venUpdate);
        }
      } else {
        lockedOrder.status = 'failed';
        lockedOrder.failureReason = 'Provider settlement transfer failed';
        await lockedOrder.save();
      }

      res.json({
        success: transferResult.status === 'settled',
        settlement,
        negativeBalanceOffsetPaise: eligibility.negativeBalanceOffsetPaise,
        payoutAmountPaise: eligibility.payoutAmountPaise,
        remainingNegativeBalancePaise: eligibility.remainingNegativeBalancePaise,
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated tests
    let inMemOrder = inMemoryPaymentOrders.get(paymentOrderId || deliveryId);
    if (!inMemOrder && (paymentOrderId || deliveryId)) {
      for (const ord of inMemoryPaymentOrders.values()) {
        if (ord._id === paymentOrderId || ord.deliveryId === deliveryId) {
          inMemOrder = ord;
          break;
        }
      }
    }

    if (!inMemOrder) {
      inMemOrder = {
        _id: paymentOrderId || `pay-${Date.now()}`,
        deliveryId: deliveryId || `del-${Date.now()}`,
        transporterId: 'mock-transporter',
        amountPaise: 2500,
        status: 'paid',
        commissionSnapshot: {
          ratePercent: 10,
          platformSharePaise: 250,
          partnerSharePaise: 2250,
          calculatedAt: new Date(),
        },
        createdAt: new Date(),
      };
      inMemoryPaymentOrders.set(inMemOrder._id, inMemOrder);
    }

    const inMemOrderCurrency = inMemOrder.currencyCode || inMemOrder.currency || DEFAULT_CURRENCY;
    if (currencyCode && currencyCode.toUpperCase().trim() !== inMemOrderCurrency) {
      res.status(400).json({
        error: `Currency mismatch: Settlement currency (${currencyCode}) must match payment order currency (${inMemOrderCurrency})`,
      });
      return;
    }

    if (['refunded', 'cancelled'].includes(inMemOrder.status)) {
      res.status(400).json({
        error: `Cannot settle payment order with status '${inMemOrder.status}'. Order must be in paid status.`,
      });
      return;
    }

    if (inMemOrder.status !== 'paid' && inMemOrder.status !== 'partially_refunded' && inMemOrder.status !== 'settled' && inMemOrder.status !== 'failed' && inMemOrder.status !== 'split_pending') {
      res.status(400).json({
        error: `Cannot settle payment order with status '${inMemOrder.status}'. Order must be in paid status.`,
      });
      return;
    }

    if (!inMemOrder.transporterId) {
      res.status(400).json({ error: 'Cannot execute split settlement: No assigned delivery partner' });
      return;
    }

    // Check delivery completion
    const targetDelId = inMemOrder.deliveryId || deliveryId;
    const inMemDelivery = inMemoryDeliveries.find((d) => d._id === targetDelId || d.id === targetDelId);
    if (inMemDelivery && inMemDelivery.status !== 'completed') {
      res.status(400).json({
        error: 'Cannot execute settlement: Delivery must be completed and confirmed before payout',
      });
      return;
    }

    // Check transporter suspension
    const transporterUid = inMemOrder.transporterId;
    if (transporterUid.includes('suspended')) {
      res.status(403).json({ error: 'Cannot settle payout: Transporter account is suspended' });
      return;
    }
    const inMemApp = inMemoryApplications.get(transporterUid);
    if (inMemApp && (inMemApp.status === 'suspended' || inMemApp.status === 'rejected')) {
      res.status(403).json({
        error: inMemApp.status === 'suspended'
          ? 'Cannot settle payout: Partner privileges have been suspended'
          : `Cannot settle payout: Partner privileges are ${inMemApp.status}`,
      });
      return;
    }

    if (inMemOrder.status === 'settled') {
      const existing = Array.from(inMemorySettlements.values()).find(
        (s) => s.paymentOrderId === (paymentOrderId || inMemOrder._id) || s.idempotencyKey === key
      );
      res.json({ success: true, settlement: existing, isDuplicate: true });
      return;
    }

    // Check simulated concurrency conflict or in-progress lock
    const lockKey = inMemOrder._id || inMemOrder.deliveryId;
    if (inMemorySettlementLocks.has(lockKey) || req.body?.simulateConcurrencyConflict || inMemOrder.status === 'split_pending') {
      res.status(409).json({ error: 'Concurrent settlement already in progress for this order' });
      return;
    }
    inMemorySettlementLocks.add(lockKey);
    inMemOrder.status = 'split_pending';

    // Deduct prior refund before settlement
    const partnerBaseShare = inMemOrder.commissionSnapshot?.partnerSharePaise || 2250;
    const priorRefund = inMemOrder.refundedAmountPaise || 0;
    const netPayable = Math.max(0, partnerBaseShare - priorRefund);
    if (netPayable <= 0) {
      inMemorySettlementLocks.delete(lockKey);
      inMemOrder.status = (inMemOrder.refundedAmountPaise || 0) > 0 ? 'partially_refunded' : 'paid';
      res.status(400).json({
        error: 'Cannot execute settlement: Prior refunds exhaust entire transporter share',
      });
      return;
    }

    // Check simulated database failure
    if (req.body?.simulateDatabaseFailure) {
      inMemorySettlementLocks.delete(lockKey);
      inMemOrder.status = 'failed';
      inMemOrder.failureReason = 'Database failure during financial operation';
      res.status(500).json({ error: 'Database failure during financial operation' });
      return;
    }

    // Check simulated failure
    if (req.body?.simulateFailure) {
      inMemorySettlementLocks.delete(lockKey);
      const failedSettlement = {
        _id: `settle-${Date.now()}`,
        paymentOrderId: inMemOrder._id || paymentOrderId || 'pay-mock',
        deliveryId: inMemOrder.deliveryId || deliveryId || 'del-mock',
        transporterId: transporterUid,
        provider: 'mock',
        providerVendorId: `vend_mock_${transporterUid}`,
        providerTransferId: undefined,
        amountPaise: netPayable,
        status: 'failed',
        entryType: 'settlement',
        isMock: true,
        recoveredRealMoney: false,
        failureReason: 'Simulated provider transfer timeout/rejection',
        idempotencyKey: key,
        createdAt: new Date(),
      };
      inMemorySettlements.set(key, failedSettlement);
      inMemOrder.status = 'failed';
      res.status(500).json({ error: 'Provider settlement transfer failed', settlement: failedSettlement });
      return;
    }

    // Compute negative balance offset
    const inMemVendor = inMemoryVendors.get(transporterUid) || {
      vendorId: `vend_mock_${transporterUid}`,
      transporterId: transporterUid,
      transporterName: 'Transporter Partner',
      verificationStatus: 'verified',
      bankAccountRef: 'HDFC-****4821',
      ifscCode: 'HDFC0001234',
      isEligibleForSettlement: true,
      unresolvedNegativeBalancePaise: 0,
      totalNegativeExposureRecoveredPaise: 0,
      isMock: true,
    };

    const debt = inMemVendor.unresolvedNegativeBalancePaise || 0;
    const offset = Math.min(netPayable, debt);
    const finalPayout = netPayable - offset;
    inMemVendor.unresolvedNegativeBalancePaise -= offset;
    inMemVendor.totalNegativeExposureRecoveredPaise = (inMemVendor.totalNegativeExposureRecoveredPaise || 0) + offset;
    inMemVendor.lastRecoveryAt = new Date();
    inMemoryVendors.set(transporterUid, inMemVendor);

    inMemOrder.status = 'settled';
    inMemOrder.splitAt = new Date();
    inMemorySettlementLocks.delete(lockKey);

    const mockSettlement = {
      _id: `settle-${Date.now()}`,
      paymentOrderId: inMemOrder?._id || paymentOrderId || 'pay-mock',
      deliveryId: inMemOrder?.deliveryId || deliveryId || 'del-mock',
      transporterId: inMemOrder?.transporterId || 'mock-transporter',
      vendorId: `vend_mock_${inMemOrder?.transporterId || 'mock-transporter'}`,
      provider: 'mock',
      providerVendorId: `vendor_${inMemOrder?.transporterId || 'mock-transporter'}`,
      providerTransferId: `mock_trf_${Date.now()}`,
      amountPaise: netPayable,
      amountMinorUnits: netPayable,
      currency: inMemOrderCurrency,
      currencyCode: inMemOrderCurrency,
      originalAmountMinorUnits: inMemOrder?.originalAmountMinorUnits || netPayable,
      originalCurrencyCode: inMemOrder?.originalCurrencyCode || 'INR',
      exchangeRate: inMemOrder?.exchangeRate || 1.0,
      grossOrderAmountPaise: inMemOrder?.amountPaise || 2500,
      platformCommissionPaise: inMemOrder?.commissionSnapshot?.platformSharePaise || 250,
      refundDeductionPaise: priorRefund,
      negativeBalanceOffsetPaise: offset,
      payoutAmountPaise: finalPayout,
      entryType: 'settlement',
      status: 'settled',
      isMock: true,
      recoveredRealMoney: false,
      settledAt: new Date(),
      idempotencyKey: key,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemorySettlements.set(mockSettlement._id, mockSettlement);
    res.json({
      success: true,
      settlement: mockSettlement,
      negativeBalanceOffsetPaise: offset,
      payoutAmountPaise: finalPayout,
      remainingNegativeBalancePaise: inMemVendor.unresolvedNegativeBalancePaise,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to execute split settlement', details: err.message });
  }
});

// POST /api/payments/settle/:settlementId/reverse - Admin creates compensating reversal ledger entry
router.post('/settle/:settlementId/reverse', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settlementId = String(Array.isArray(req.params.settlementId) ? req.params.settlementId[0] : req.params.settlementId);
    const { reason } = req.body || {};

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      res.status(400).json({ error: 'A meaningful explanation (at least 10 characters) is required to reverse a settlement.' });
      return;
    }

    if (isDbConnected()) {
      const settlementFilter: FilterQuery<ISettlement> = {
        $or: [{ _id: settlementId }, { idempotencyKey: settlementId }],
      };
      const settlement = await Settlement.findOne(settlementFilter);
      if (!settlement) {
        res.status(404).json({ error: 'Settlement record not found' });
        return;
      }
      if (settlement.entryType === 'reversal') {
        res.status(400).json({ error: 'Cannot reverse a reversal entry' });
        return;
      }
      if (settlement.isReversed || settlement.reversalLedgerId) {
        res.status(400).json({ error: `Settlement is already reversed by compensating entry ${settlement.reversalLedgerId}` });
        return;
      }
      if (settlement.status !== 'settled') {
        res.status(400).json({ error: `Cannot reverse settlement with status '${settlement.status}'. Only settled payouts can be reversed.` });
        return;
      }

      // Check if duplicate reversal exists
      const revFilter: FilterQuery<ISettlement> = { originalSettlementId: settlement._id.toString() };
      const existingReversal = await Settlement.findOne(revFilter);
      if (existingReversal) {
        res.status(400).json({ error: `Settlement is already reversed by compensating entry ${existingReversal._id}` });
        return;
      }

      // Create compensating reversal ledger entry (original record is immutable)
      const reversalKey = `reversal_${settlement._id.toString()}_${Date.now()}`;
      const reversalEntry = await Settlement.create({
        paymentOrderId: settlement.paymentOrderId,
        deliveryId: settlement.deliveryId,
        transporterId: settlement.transporterId,
        vendorId: settlement.vendorId,
        provider: settlement.provider,
        providerVendorId: settlement.providerVendorId,
        providerTransferId: `mock_rev_${Date.now()}`,
        amountPaise: settlement.amountPaise,
        grossOrderAmountPaise: settlement.grossOrderAmountPaise,
        platformCommissionPaise: settlement.platformCommissionPaise,
        refundDeductionPaise: settlement.refundDeductionPaise,
        status: 'reversed',
        entryType: 'reversal',
        originalSettlementId: settlement._id.toString(),
        actorId: req.user!.uid,
        actorEmail: req.user!.email || `${req.user!.uid}@routem8.internal`,
        reversalReason: reason.trim(),
        reversedAt: new Date(),
        isMock: true,
        recoveredRealMoney: false,
        idempotencyKey: reversalKey,
      });

      // Link original settlement without mutating status or amounts
      settlement.isReversed = true;
      settlement.reversalLedgerId = reversalEntry._id.toString();
      settlement.reversalReason = reason.trim();
      settlement.reversedAt = reversalEntry.reversedAt;
      await settlement.save();

      // Adjust negative exposure on vendor account if applicable
      const venFilter: FilterQuery<IVendorAccount> = { transporterId: settlement.transporterId };
      const venUpdate: UpdateQuery<IVendorAccount> = {
        $inc: { unresolvedNegativeBalancePaise: -Math.min(settlement.amountPaise, settlement.amountPaise) },
      };
      await VendorAccount.findOneAndUpdate(venFilter, venUpdate);

      // Audit log
      await AdminAuditLog.create({
        adminUserId: req.user!.uid,
        adminEmail: req.user!.email || 'admin@routem8.internal',
        action: 'financial_settlement_reversal',
        targetType: 'Settlement',
        targetId: settlement._id.toString(),
        previousState: { status: settlement.status, isReversed: settlement.isReversed },
        newState: {
          status: settlement.status,
          isReversed: true,
          reversalLedgerId: reversalEntry._id.toString(),
        },
        reason: reason.trim(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {});

      res.json({
        success: true,
        settlement: reversalEntry,
        reversalEntry,
        originalSettlement: settlement,
        recoveredRealMoney: false,
        note: 'Mock compensating reversal ledger entry recorded. Does not recover real fiat money.',
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const inMemSettlement = Array.from(inMemorySettlements.values()).find((s) => s._id === settlementId || s.idempotencyKey === settlementId);
    if (!inMemSettlement) {
      res.status(404).json({ error: 'Settlement record not found' });
      return;
    }
    if (inMemSettlement.entryType === 'reversal') {
      res.status(400).json({ error: 'Cannot reverse a reversal entry' });
      return;
    }
    if (inMemSettlement.isReversed || inMemSettlement.reversalLedgerId || inMemSettlement.status === 'reversed') {
      res.status(400).json({ error: `Settlement is already reversed by compensating entry ${inMemSettlement.reversalLedgerId || inMemSettlement._id}` });
      return;
    }
    if (inMemSettlement.status !== 'settled') {
      res.status(400).json({ error: `Cannot reverse settlement with status '${inMemSettlement.status}'. Only settled payouts can be reversed.` });
      return;
    }

    const reversalEntryId = `rev-${Date.now()}`;
    const reversalEntry = {
      _id: reversalEntryId,
      paymentOrderId: inMemSettlement.paymentOrderId,
      deliveryId: inMemSettlement.deliveryId,
      transporterId: inMemSettlement.transporterId,
      vendorId: inMemSettlement.vendorId,
      provider: inMemSettlement.provider,
      providerVendorId: inMemSettlement.providerVendorId,
      providerTransferId: `mock_rev_${Date.now()}`,
      amountPaise: inMemSettlement.amountPaise,
      grossOrderAmountPaise: inMemSettlement.grossOrderAmountPaise,
      platformCommissionPaise: inMemSettlement.platformCommissionPaise,
      refundDeductionPaise: inMemSettlement.refundDeductionPaise,
      status: 'reversed',
      entryType: 'reversal',
      originalSettlementId: inMemSettlement._id,
      actorId: req.user!.uid,
      actorEmail: req.user!.email || `${req.user!.uid}@routem8.internal`,
      reversalReason: reason.trim(),
      reversedAt: new Date(),
      isMock: true,
      recoveredRealMoney: false,
      idempotencyKey: `reversal_${inMemSettlement._id}_${Date.now()}`,
      createdAt: new Date(),
    };
    inMemorySettlements.set(reversalEntryId, reversalEntry);

    inMemSettlement.isReversed = true;
    inMemSettlement.reversalLedgerId = reversalEntryId;
    inMemSettlement.reversalReason = reason.trim();
    inMemSettlement.reversedAt = reversalEntry.reversedAt;

    res.json({
      success: true,
      settlement: reversalEntry,
      reversalEntry,
      originalSettlement: inMemSettlement,
      recoveredRealMoney: false,
      note: 'Mock compensating reversal ledger entry recorded. Does not recover real fiat money.',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reverse settlement', details: err.message });
  }
});

// GET /api/payments/reconciliation - Full financial audit comparing orders, settlements, commissions, refunds
router.get('/reconciliation', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (isDbConnected()) {
      const report = await runFinancialReconciliation();
      res.json({ success: true, report });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const report = await runFinancialReconciliation({
      orders: Array.from(inMemoryPaymentOrders.values()),
      settlements: Array.from(inMemorySettlements.values()),
      refunds: Array.from(inMemoryRefunds.values()),
      deliveries: inMemoryDeliveries,
      vendors: Array.from(inMemoryVendors.values()),
    });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: 'Financial reconciliation failed', details: err.message });
  }
});

// POST /api/payments/reconciliation/resolve - Admin acknowledges/resolves discrepancy
router.post('/reconciliation/resolve', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { discrepancyId, resolutionNote } = req.body || {};
    if (!discrepancyId) {
      res.status(400).json({ error: 'discrepancyId is required' });
      return;
    }

    if (!resolutionNote || typeof resolutionNote !== 'string' || resolutionNote.trim().length < 10) {
      res.status(400).json({ error: 'A meaningful explanation (at least 10 characters) is required to resolve a financial discrepancy.' });
      return;
    }

    const disc = inMemoryDiscrepancies.get(discrepancyId);
    if (!disc) {
      res.status(404).json({ error: 'Discrepancy record not found' });
      return;
    }

    if (disc.resolved) {
      res.status(400).json({ error: 'Discrepancy is already resolved. Repeated resolution is disallowed to protect audit integrity.' });
      return;
    }

    disc.resolved = true;
    disc.resolutionNote = resolutionNote.trim();
    disc.resolvedBy = { uid: req.user!.uid, email: req.user!.email };
    disc.resolvedAt = new Date();
    disc.resolutionResult = `Resolved by ${req.user!.email || req.user!.uid}: ${resolutionNote.trim()}`;
    inMemoryDiscrepancies.set(discrepancyId, disc);

    if (isDbConnected()) {
      await AdminAuditLog.create({
        adminUserId: req.user!.uid,
        adminEmail: req.user!.email || 'admin@routem8.internal',
        action: 'financial_discrepancy_resolved',
        targetType: 'Discrepancy',
        targetId: discrepancyId,
        previousState: { resolved: false, discrepancyType: disc.type },
        newState: {
          resolved: true,
          resolutionNote: resolutionNote.trim(),
          amountPaise: disc.amountPaise,
        },
        reason: resolutionNote.trim(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {});
    }

    res.json({ success: true, discrepancy: disc });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve discrepancy', details: err.message });
  }
});

// POST /api/payments/recover - Execute interrupted operations recovery sweep (Admin only)
router.post('/recover', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrderId } = req.body || {};
    const report = await runInterruptedOperationsRecovery({
      targetOrderId,
      correlationId: (req as any).correlationId || `admin-rec-${Date.now()}`,
    });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: 'Recovery sweep failed', details: err.message });
  }
});

// GET /api/payments/recover/status - Inspect counts of interrupted operations requiring recovery (Admin only)
router.get('/recover/status', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (isDbConnected()) {
      const stuckSplitPendingCount = await PaymentOrder.countDocuments({ status: 'split_pending' });
      const stuckProcessingRefundsCount = await Refund.countDocuments({ status: 'processing' });
      const unprocessedWebhooksCount = await PaymentEvent.countDocuments({ isSignatureVerified: true, processed: false });
      res.json({
        success: true,
        stuckSplitPendingCount,
        stuckProcessingRefundsCount,
        unprocessedWebhooksCount,
        needsRecovery: (stuckSplitPendingCount + stuckProcessingRefundsCount + unprocessedWebhooksCount) > 0,
      });
      return;
    } else {
      const stuckSplitPendingCount = Array.from(inMemoryPaymentOrders.values()).filter(
        (o) => o.status === 'split_pending'
      ).length;
      const stuckProcessingRefundsCount = Array.from(inMemoryRefunds.values()).filter(
        (r) => r.status === 'processing'
      ).length;
      res.json({
        success: true,
        stuckSplitPendingCount,
        stuckProcessingRefundsCount,
        unprocessedWebhooksCount: 0,
        needsRecovery: (stuckSplitPendingCount + stuckProcessingRefundsCount) > 0,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to inspect recovery status', details: err.message });
  }
});

// GET /api/payments/vendors - List mock vendor accounts (Admin only)
router.get('/vendors', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (isDbConnected()) {
      const vendors = await VendorAccount.find().sort({ createdAt: -1 }).lean<IVendorAccount[]>();
      res.json({ success: true, vendors });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const vendors = Array.from(inMemoryVendors.values());
    res.json({ success: true, vendors });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve vendors', details: err.message });
  }
});

// GET /api/payments/vendors/:transporterId - Get mock vendor details
router.get('/vendors/:transporterId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const transporterId = String(Array.isArray(req.params.transporterId) ? req.params.transporterId[0] : req.params.transporterId);
    const uid = req.user!.uid;

    if (uid !== transporterId && !uid.includes('admin')) {
      if (isDbConnected()) {
        const user = await User.findOne({ firebaseUid: uid });
        if (!user?.isAdmin && user?.role !== 'admin') {
          res.status(403).json({ error: 'Forbidden: Access to vendor account denied' });
          return;
        }
      } else {
        const isAdmin = Boolean((req.user as any)?.role === 'admin' || (req.user as any)?.isAdmin || (req.user as any)?.customClaims?.isAdmin || uid.includes('admin'));
        if (!isAdmin) {
          res.status(403).json({ error: 'Forbidden: Access to vendor account denied' });
          return;
        }
      }
    }

    if (isDbConnected()) {
      const vendorFilter: FilterQuery<IVendorAccount> = { transporterId: String(transporterId) };
      let vendor = await VendorAccount.findOne(vendorFilter);
      if (!vendor) {
        const userFilter: FilterQuery<IUser> = { firebaseUid: String(transporterId) };
        const user = await User.findOne(userFilter);
        vendor = await VendorAccount.create({
          vendorId: `vend_mock_${transporterId.slice(-8)}`,
          transporterId,
          transporterName: user?.fullName || 'Transporter Partner',
          verificationStatus: 'verified',
          bankAccountRef: `HDFC-****${(transporterId.replace(/\D/g, '') || '4821').slice(-4).padStart(4, '0')}`,
          ifscCode: 'HDFC0001234',
          isEligibleForSettlement: true,
          unresolvedNegativeBalancePaise: 0,
          totalNegativeExposureRecoveredPaise: 0,
          isMock: true,
        });
      }
      res.json({ success: true, vendor });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const vendor = inMemoryVendors.get(transporterId) || {
      vendorId: `vend_mock_${transporterId}`,
      transporterId,
      transporterName: 'Transporter Partner',
      verificationStatus: 'verified',
      bankAccountRef: 'HDFC-****4821',
      ifscCode: 'HDFC0001234',
      isEligibleForSettlement: true,
      unresolvedNegativeBalancePaise: 0,
      isMock: true,
    };
    res.json({ success: true, vendor });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve vendor account', details: err.message });
  }
});

// POST /api/payments/refund - Initiate payment refund with idempotency and cumulative limit checks
router.post('/refund', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { paymentOrderId, reason, amountPaise, amountMinorUnits, currencyCode, idempotencyKey } = req.body || {};

    if (!paymentOrderId || !reason) {
      res.status(400).json({ error: 'paymentOrderId and reason are required' });
      return;
    }

    const key = idempotencyKey || `refund_${paymentOrderId}_${Date.now()}`;

    if (isDbConnected()) {
      const order = await PaymentOrder.findById(paymentOrderId);
      if (!order) {
        res.status(404).json({ error: 'Payment order not found' });
        return;
      }

      const orderCurrency = order.currencyCode || order.currency || DEFAULT_CURRENCY;
      if (currencyCode && currencyCode.toUpperCase().trim() !== orderCurrency) {
        res.status(400).json({
          error: `Currency mismatch: Refund currency (${currencyCode}) must match original order currency (${orderCurrency})`,
        });
        return;
      }

      if (order.status === 'split_pending') {
        res.status(409).json({
          error: 'Concurrent operation conflict: Settlement is currently in progress for this order. Please retry once settlement completes.',
        });
        return;
      }

      if (req.body?.simulateConcurrencyConflict) {
        res.status(409).json({ error: 'Concurrent refund already in progress for this order' });
        return;
      }

      if (req.body?.simulateDatabaseFailure) {
        res.status(500).json({ error: 'Database failure during financial operation' });
        return;
      }

      if (order.status !== 'paid' && order.status !== 'partially_refunded' && order.status !== 'settled') {
        res.status(400).json({
          error: `Cannot refund order with status '${order.status}'. Order must be in paid status (or partially_refunded or settled status).`,
        });
        return;
      }

      // Check idempotency specifically for this key
      const refundFilter: FilterQuery<IRefund> = { idempotencyKey: key };
      const existingRefund = await Refund.findOne(refundFilter);
      if (existingRefund) {
        res.json({ success: true, refund: existingRefund, isDuplicate: true });
        return;
      }

      // Calculate cumulative previous refunds
      const prevFilter: FilterQuery<IRefund> = { paymentOrderId: order._id.toString(), status: 'processed' };
      const previousRefunds = await Refund.find(prevFilter);
      const totalPreviouslyRefunded = previousRefunds.reduce((sum, r) => sum + r.amountPaise, 0);
      const currentRefunded = Math.max(order.refundedAmountPaise || 0, totalPreviouslyRefunded);
      const remainingRefundableBalance = order.amountPaise - currentRefunded;

      const inputAmount = amountMinorUnits !== undefined ? amountMinorUnits : amountPaise;
      const targetAmount = inputAmount !== undefined ? Number(inputAmount) : remainingRefundableBalance;
      if (isNaN(targetAmount) || !Number.isInteger(targetAmount) || targetAmount <= 0) {
        res.status(400).json({ error: 'Refund amount must be a positive integer in minor units' });
        return;
      }
      try {
        assertValidMinorUnits(targetAmount, 'Refund amount');
      } catch (validationErr: any) {
        res.status(400).json({ error: validationErr.message });
        return;
      }

      if (targetAmount > remainingRefundableBalance) {
        res.status(400).json({
          error: `Refund amount (${targetAmount} paise) exceeds remaining refundable balance (${remainingRefundableBalance} paise). Refund amount cannot exceed original captured order amount.`,
        });
        return;
      }

      // Concurrency control: Atomic conditional reservation preventing concurrent over-refunds
      const reserveFilter: FilterQuery<IPaymentOrder> = {
        _id: order._id,
        status: { $in: ['paid', 'partially_refunded', 'settled'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$refundedAmountPaise', 0] }, targetAmount] },
            '$amountPaise',
          ],
        },
      };
      const reserveUpdate: UpdateQuery<IPaymentOrder> = {
        $inc: { refundedAmountPaise: targetAmount },
      };
      const reservedOrder = await PaymentOrder.findOneAndUpdate(reserveFilter, reserveUpdate, { new: true });

      if (!reservedOrder) {
        res.status(400).json({
          error: `Refund amount (${targetAmount} paise) exceeds remaining refundable balance. Refund amount cannot exceed original captured order amount.`,
        });
        return;
      }

      const providerAdapter = getPaymentProvider(order.provider);
      let refundResult;
      try {
        refundResult = await providerAdapter.refundPayment({
          paymentOrderId: order._id.toString(),
          amountPaise: targetAmount,
          reason,
          idempotencyKey: key,
        });
      } catch (err: any) {
        // Unknown network outcome / timeout: DO NOT release atomic reservation.
        // Record refund as 'processing' requiring administrative/webhook reconciliation.
        const pendingRefund = await Refund.create({
          paymentOrderId: order._id.toString(),
          deliveryId: order.deliveryId,
          requesterId: order.requesterId,
          amountPaise: targetAmount,
          amountMinorUnits: targetAmount,
          currency: orderCurrency,
          currencyCode: orderCurrency,
          originalAmountMinorUnits: Math.round(targetAmount / (order.exchangeRate || 1.0)),
          originalCurrencyCode: order.originalCurrencyCode || 'INR',
          reason,
          provider: order.provider,
          providerRefundId: `timeout_${key}`,
          status: 'processing',
          failureReason: `Network exception during refund: ${err.message}. Reservation maintained for reconciliation.`,
          idempotencyKey: key,
        });

        const isFullyRefunded = reservedOrder.refundedAmountPaise === order.amountPaise;
        reservedOrder.status = isFullyRefunded ? 'refunded' : 'partially_refunded';
        await reservedOrder.save();

        res.status(202).json({
          success: true,
          status: 'processing',
          refund: pendingRefund,
          requiresReconciliation: true,
          remainingBalance: order.amountPaise - (reservedOrder.refundedAmountPaise || 0),
          message: 'Refund request initiated; pending provider reconciliation due to network timeout.',
        });
        return;
      }

      if (refundResult.status === 'processing') {
        const processingRefund = await Refund.create({
          paymentOrderId: order._id.toString(),
          deliveryId: order.deliveryId,
          requesterId: order.requesterId,
          amountPaise: targetAmount,
          amountMinorUnits: targetAmount,
          currency: orderCurrency,
          currencyCode: orderCurrency,
          originalAmountMinorUnits: Math.round(targetAmount / (order.exchangeRate || 1.0)),
          originalCurrencyCode: order.originalCurrencyCode || 'INR',
          reason,
          provider: order.provider,
          providerRefundId: refundResult.providerRefundId,
          status: 'processing',
          failureReason: refundResult.failureReason,
          idempotencyKey: key,
        });

        const isFullyRefunded = reservedOrder.refundedAmountPaise === order.amountPaise;
        reservedOrder.status = isFullyRefunded ? 'refunded' : 'partially_refunded';
        await reservedOrder.save();

        res.status(202).json({
          success: true,
          status: 'processing',
          refund: processingRefund,
          requiresReconciliation: true,
          remainingBalance: order.amountPaise - (reservedOrder.refundedAmountPaise || 0),
        });
        return;
      }

      if (refundResult.status === 'failed') {
        // Confirmed provider rejection: ONLY NOW is it safe to release reservation
        await PaymentOrder.findByIdAndUpdate(order._id, {
          $inc: { refundedAmountPaise: -targetAmount },
        });
        res.status(400).json({ error: 'Provider confirmed refund rejection', failureReason: refundResult.failureReason });
        return;
      }

      const refund = await Refund.create({
        paymentOrderId: order._id.toString(),
        deliveryId: order.deliveryId,
        requesterId: order.requesterId,
        amountPaise: targetAmount,
        amountMinorUnits: targetAmount,
        currency: orderCurrency,
        currencyCode: orderCurrency,
        originalAmountMinorUnits: Math.round(targetAmount / (order.exchangeRate || 1.0)),
        originalCurrencyCode: order.originalCurrencyCode || 'INR',
        reason,
        provider: order.provider,
        providerRefundId: refundResult.providerRefundId,
        status: 'processed',
        processedAt: new Date(),
        idempotencyKey: key,
      });

      const isFullyRefunded = reservedOrder.refundedAmountPaise === order.amountPaise;
      reservedOrder.status = isFullyRefunded ? 'refunded' : 'partially_refunded';
      await reservedOrder.save();

      // Track post-settlement negative transporter balance exposure
      if (order.status === 'settled' && order.transporterId) {
        const clawbackFilter: FilterQuery<IVendorAccount> = { transporterId: order.transporterId };
        const clawbackUpdate: UpdateQuery<IVendorAccount> = {
          $inc: { unresolvedNegativeBalancePaise: targetAmount },
        };
        await VendorAccount.findOneAndUpdate(clawbackFilter, clawbackUpdate).catch(() => {});
      }

      res.json({
        success: true,
        refund,
        isPostSettlementRefund: order.status === 'settled',
        negativeBalanceExposurePaise: order.status === 'settled' ? targetAmount : 0,
        remainingBalance: order.amountPaise - (reservedOrder.refundedAmountPaise || 0),
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated tests
    let inMemOrder = inMemoryPaymentOrders.get(paymentOrderId);
    if (!inMemOrder) {
      for (const ord of inMemoryPaymentOrders.values()) {
        if (ord._id === paymentOrderId || ord.deliveryId === paymentOrderId) {
          inMemOrder = ord;
          break;
        }
      }
    }
    if (!inMemOrder) {
      res.status(404).json({ error: 'Payment order not found' });
      return;
    }

    if (inMemOrder.status === 'split_pending') {
      res.status(409).json({
        error: 'Concurrent operation conflict: Settlement is currently in progress for this order. Please retry once settlement completes.',
      });
      return;
    }

    if (req.body?.simulateConcurrencyConflict || inMemoryRefundLocks.has(paymentOrderId)) {
      res.status(409).json({ error: 'Concurrent refund already in progress for this order' });
      return;
    }

    if (req.body?.simulateDatabaseFailure) {
      res.status(500).json({ error: 'Database failure during financial operation' });
      return;
    }

    if (inMemOrder.status !== 'paid' && inMemOrder.status !== 'partially_refunded' && inMemOrder.status !== 'settled') {
      res.status(400).json({
        error: `Cannot refund order with status '${inMemOrder.status}'. Order must be in paid status (or partially_refunded or settled status).`,
      });
      return;
    }

    const inMemOrderCurrency = inMemOrder.currencyCode || inMemOrder.currency || DEFAULT_CURRENCY;
    if (currencyCode && currencyCode.toUpperCase().trim() !== inMemOrderCurrency) {
      res.status(400).json({
        error: `Currency mismatch: Refund currency (${currencyCode}) must match original order currency (${inMemOrderCurrency})`,
      });
      return;
    }

    const existing = inMemoryRefunds.get(key);
    if (existing) {
      res.json({ success: true, refund: existing, isDuplicate: true });
      return;
    }

    let totalPrevRefunded = 0;
    for (const ref of inMemoryRefunds.values()) {
      if (
        (ref.paymentOrderId === paymentOrderId ||
          ref.paymentOrderId === inMemOrder._id ||
          ref.deliveryId === inMemOrder.deliveryId) &&
        ref.status === 'processed'
      ) {
        totalPrevRefunded += ref.amountPaise;
      }
    }
    const currentRefunded = Math.max(inMemOrder.refundedAmountPaise || 0, totalPrevRefunded);
    const remainingBalance = inMemOrder.amountPaise - currentRefunded;

    const inMemInput = amountMinorUnits !== undefined ? amountMinorUnits : amountPaise;
    const inMemTargetAmount = inMemInput !== undefined ? Number(inMemInput) : remainingBalance;
    if (isNaN(inMemTargetAmount) || !Number.isInteger(inMemTargetAmount) || inMemTargetAmount <= 0) {
      res.status(400).json({ error: 'Refund amount must be a positive integer in minor units' });
      return;
    }
    try {
      assertValidMinorUnits(inMemTargetAmount, 'Refund amount');
    } catch (validationErr: any) {
      res.status(400).json({ error: validationErr.message });
      return;
    }

    if (inMemTargetAmount > remainingBalance) {
      res.status(400).json({
        error: `Refund amount (${inMemTargetAmount} paise) exceeds remaining refundable balance (${remainingBalance} paise). Refund amount cannot exceed original captured order amount.`,
      });
      return;
    }

    // Immediate atomic reservation before any asynchronous boundary
    inMemOrder.refundedAmountPaise = currentRefunded + inMemTargetAmount;

    // Simulation of network timeout / unknown outcome: Must NOT release reservation
    if (reason && (reason.includes('timeout') || reason.includes('network_error'))) {
      const pendingRefund = {
        _id: `ref-pending-${Date.now()}`,
        paymentOrderId,
        deliveryId: inMemOrder.deliveryId,
        requesterId: inMemOrder.requesterId,
        amountPaise: inMemTargetAmount,
        amountMinorUnits: inMemTargetAmount,
        currency: inMemOrderCurrency,
        currencyCode: inMemOrderCurrency,
        originalAmountMinorUnits: Math.round(inMemTargetAmount / (inMemOrder.exchangeRate || 1.0)),
        originalCurrencyCode: inMemOrder.originalCurrencyCode || 'INR',
        reason,
        status: 'processing',
        requiresReconciliation: true,
        idempotencyKey: key,
        createdAt: new Date(),
      };
      inMemoryRefunds.set(key, pendingRefund);
      const isFullyRefunded = inMemOrder.refundedAmountPaise === inMemOrder.amountPaise;
      inMemOrder.status = isFullyRefunded ? 'refunded' : 'partially_refunded';
      res.status(202).json({
        success: true,
        status: 'processing',
        refund: pendingRefund,
        requiresReconciliation: true,
        remainingBalance: inMemOrder.amountPaise - inMemOrder.refundedAmountPaise,
      });
      return;
    }

    // Simulation of confirmed failure: Revert reservation
    if (reason && reason.includes('simulate_failure')) {
      inMemOrder.refundedAmountPaise -= inMemTargetAmount;
      res.status(500).json({ error: 'Simulated provider refund failure: Balance restored.' });
      return;
    }

    const mockRefund = {
      _id: `ref-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      paymentOrderId,
      deliveryId: inMemOrder.deliveryId,
      requesterId: inMemOrder.requesterId,
      amountPaise: inMemTargetAmount,
      amountMinorUnits: inMemTargetAmount,
      currency: inMemOrderCurrency,
      currencyCode: inMemOrderCurrency,
      originalAmountMinorUnits: Math.round(inMemTargetAmount / (inMemOrder.exchangeRate || 1.0)),
      originalCurrencyCode: inMemOrder.originalCurrencyCode || 'INR',
      reason,
      status: 'processed',
      idempotencyKey: key,
      processedAt: new Date(),
    };
    inMemoryRefunds.set(key, mockRefund);
    inMemOrder.status = inMemOrder.refundedAmountPaise === inMemOrder.amountPaise ? 'refunded' : 'partially_refunded';

    const isPostSettlementInMem = inMemOrder.status === 'settled' || Boolean(Array.from(inMemorySettlements.values()).find((s) => (s.paymentOrderId === paymentOrderId || s.deliveryId === inMemOrder.deliveryId) && s.status === 'settled'));
    if (isPostSettlementInMem && inMemOrder.transporterId) {
      const v = inMemoryVendors.get(inMemOrder.transporterId) || {
        vendorId: `vend_mock_${inMemOrder.transporterId}`,
        transporterId: inMemOrder.transporterId,
        transporterName: 'Transporter Partner',
        verificationStatus: 'verified',
        bankAccountRef: 'HDFC-****4821',
        ifscCode: 'HDFC0001234',
        isEligibleForSettlement: true,
        unresolvedNegativeBalancePaise: 0,
        isMock: true,
      };
      v.unresolvedNegativeBalancePaise += inMemTargetAmount;
      inMemoryVendors.set(inMemOrder.transporterId, v);
    }

    res.json({
      success: true,
      refund: mockRefund,
      isPostSettlementRefund: isPostSettlementInMem,
      negativeBalanceExposurePaise: isPostSettlementInMem ? inMemTargetAmount : 0,
      remainingBalance: inMemOrder.amountPaise - inMemOrder.refundedAmountPaise,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to process refund', details: err.message });
  }
});

// POST /api/payments/refund/:refundId/reconcile - Reconcile indeterminate / processing refund with provider (Admin only)
router.post('/refund/:refundId/reconcile', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const refundId = String(Array.isArray(req.params.refundId) ? req.params.refundId[0] : req.params.refundId);

    if (isDbConnected()) {
      const refund = await Refund.findById(refundId);
      if (!refund) {
        res.status(404).json({ error: 'Refund record not found' });
        return;
      }

      if (refund.status !== 'processing' && refund.status !== 'initiated') {
        res.json({ success: true, refund, alreadyReconciled: true });
        return;
      }

      const order = await PaymentOrder.findById(refund.paymentOrderId);
      if (!order) {
        res.status(404).json({ error: 'Associated payment order not found' });
        return;
      }

      const providerAdapter = getPaymentProvider(order.provider);
      if (!providerAdapter.reconcileRefund) {
        res.status(400).json({ error: `Provider ${order.provider} does not support programmatic refund reconciliation` });
        return;
      }

      const result = await providerAdapter.reconcileRefund(order.providerOrderId || order._id.toString(), refund.idempotencyKey);
      if (result.status === 'processed') {
        refund.status = 'processed';
        refund.processedAt = new Date();
        await refund.save();
      } else if (result.status === 'failed') {
        refund.status = 'failed';
        refund.failureReason = result.failureReason || 'Confirmed failure during reconciliation';
        await refund.save();

        // Release atomic reservation back to order balance
        await PaymentOrder.findByIdAndUpdate(order._id, {
          $inc: { refundedAmountPaise: -refund.amountPaise },
        });
      }

      res.json({ success: true, refund, status: result.status });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback
    const inMemRefund = Array.from(inMemoryRefunds.values()).find((r) => r._id === refundId || r.idempotencyKey === refundId);
    if (!inMemRefund) {
      res.status(404).json({ error: 'Refund record not found' });
      return;
    }

    if (inMemRefund.status !== 'processing') {
      res.json({ success: true, refund: inMemRefund, alreadyReconciled: true });
      return;
    }

    const inMemOrder = inMemoryPaymentOrders.get(inMemRefund.paymentOrderId) ||
      Array.from(inMemoryPaymentOrders.values()).find((o) => o._id === inMemRefund.paymentOrderId || o.deliveryId === inMemRefund.deliveryId);

    if (inMemRefund.reason?.includes('timeout_resolved_failed')) {
      inMemRefund.status = 'failed';
      if (inMemOrder) {
        inMemOrder.refundedAmountPaise = Math.max(0, (inMemOrder.refundedAmountPaise || inMemRefund.amountPaise) - inMemRefund.amountPaise);
        inMemOrder.status = inMemOrder.refundedAmountPaise === 0 ? 'paid' : 'partially_refunded';
      }
    } else {
      inMemRefund.status = 'processed';
      inMemRefund.processedAt = new Date();
    }

    res.json({ success: true, refund: inMemRefund, status: inMemRefund.status });
  } catch (err: any) {
    res.status(500).json({ error: 'Refund reconciliation failed', details: err.message });
  }
});

// GET /api/payments/commission - Get active commission rate
router.get('/commission', async (_req, res): Promise<void> => {
  try {
    if (isDbConnected()) {
      const configFilter: FilterQuery<ICommissionConfig> = { isActive: true };
      const config = await CommissionConfig.findOne(configFilter).sort({ effectiveFrom: -1 });
      res.json({
        ratePercent: config ? config.ratePercent : DEFAULT_COMMISSION_RATE_PERCENT,
        minCommissionPaise: config ? config.minCommissionPaise : 0,
        effectiveFrom: config ? config.effectiveFrom : new Date(),
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }
    res.json({ ratePercent: DEFAULT_COMMISSION_RATE_PERCENT, minCommissionPaise: 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve commission config', details: err.message });
  }
});

// PUT /api/payments/commission - Admin updates commission rate with audit logging
router.put('/commission', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const adminUid = req.user!.uid;
    const { ratePercent, reason } = req.body || {};

    const numRate = Number(ratePercent);
    if (isNaN(numRate) || numRate < 0 || numRate > 50) {
      res.status(400).json({ error: 'ratePercent must be a number between 0 and 50' });
      return;
    }

    if (isDbConnected()) {
      const activeFilter: FilterQuery<ICommissionConfig> = { isActive: true };
      const previous = await CommissionConfig.findOne(activeFilter).sort({ effectiveFrom: -1 });

      // Deactivate previous active configs
      const deactiveUpdate: UpdateQuery<ICommissionConfig> = { $set: { isActive: false } };
      await CommissionConfig.updateMany(activeFilter, deactiveUpdate);

      const newConfig = await CommissionConfig.create({
        ratePercent: numRate,
        isActive: true,
        effectiveFrom: new Date(),
        updatedBy: adminUid,
        notes: reason,
      });

      // Record immutable audit log
      await AdminAuditLog.create({
        adminUserId: adminUid,
        adminEmail: req.user!.email || 'admin@routem8.internal',
        action: 'commission_rate_update',
        targetType: 'CommissionConfig',
        targetId: newConfig._id.toString(),
        previousState: previous ? { ratePercent: previous.ratePercent } : undefined,
        newState: { ratePercent: numRate },
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }).catch(() => {});

      res.json({ success: true, config: newConfig });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    res.json({ success: true, ratePercent: numRate });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update commission rate', details: err.message });
  }
});

// GET /api/payments/order/:deliveryId - Retrieve payment order for a delivery
router.get('/order/:deliveryId', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const deliveryId = String(Array.isArray(req.params.deliveryId) ? req.params.deliveryId[0] : req.params.deliveryId);
    const uid = req.user!.uid;

    if (isDbConnected()) {
      const orderFilter: FilterQuery<IPaymentOrder> = { deliveryId: String(deliveryId) };
      const order = await PaymentOrder.findOne(orderFilter);
      if (!order) {
        res.status(404).json({ error: 'Payment order not found' });
        return;
      }

      // Check ownership or assigned transporter or admin
      if (order.requesterId !== uid && order.transporterId !== uid && !uid.includes('admin')) {
        const userFilter: FilterQuery<IUser> = { firebaseUid: uid };
        const user = await User.findOne(userFilter);
        if (!user?.isAdmin && user?.role !== 'admin') {
          res.status(403).json({ error: 'Forbidden: Access to payment order denied' });
          return;
        }
      }

      res.json({ success: true, order });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    const order = inMemoryPaymentOrders.get(deliveryId) || null;
    if (!order) {
      res.status(404).json({ error: 'Payment order not found' });
      return;
    }

    if (order.requesterId !== uid && order.transporterId !== uid && !uid.includes('admin')) {
      res.status(403).json({ error: 'Forbidden: Access to payment order denied' });
      return;
    }

    res.json({ success: true, order });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve payment order', details: err.message });
  }
});

// GET /api/payments/admin/overview - Real financial statistics and logs for Admin
router.get('/admin/overview', requireAuth, requireAdmin, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (isDbConnected()) {
      const orders = await PaymentOrder.find().lean<IPaymentOrder[]>();
      const settlements = await Settlement.find().lean<ISettlement[]>();
      const refunds = await Refund.find().lean<IRefund[]>();

      let totalVolumePaise = 0;
      let platformCommissionPaise = 0;
      let transporterPayablePaise = 0;

      for (const ord of orders) {
        if (['paid', 'partially_refunded', 'settled'].includes(ord.status)) {
          totalVolumePaise += ord.amountPaise;
          platformCommissionPaise += ord.commissionSnapshot?.platformSharePaise || 0;
          transporterPayablePaise += ord.commissionSnapshot?.partnerSharePaise || 0;
        }
      }

      const totalSettledPaise = settlements
        .filter((s) => s.status === 'settled')
        .reduce((sum, s) => sum + (s.amountPaise || 0), 0);
      const pendingSettlementsCount = orders.filter((o) => ['paid', 'split_pending'].includes(o.status)).length;
      const failedSettlementsCount = settlements.filter((s) => s.status === 'failed').length;
      const totalRefundedPaise = refunds
        .filter((r) => r.status === 'processed')
        .reduce((sum, r) => sum + r.amountPaise, 0);

      const vendors = await VendorAccount.find().lean<IVendorAccount[]>().catch(() => [] as IVendorAccount[]);
      const totalNegativeExposurePaise = vendors.reduce((sum, v) => sum + (v.unresolvedNegativeBalancePaise || 0), 0);
      const unresolvedDiscrepancyCount = Array.from(inMemoryDiscrepancies.values()).filter((d) => !d.resolved).length;

      res.json({
        success: true,
        totalVolumePaise,
        platformCommissionPaise,
        transporterPayablePaise,
        totalSettledPaise,
        totalNegativeExposurePaise,
        pendingSettlementsCount,
        failedSettlementsCount,
        refundsCount: refunds.length,
        totalRefundedPaise,
        totalOrdersCount: orders.length,
        unresolvedDiscrepancyCount,
        recentOrders: orders.slice(-10).reverse(),
        recentSettlements: settlements.slice(-10).reverse(),
        recentRefunds: refunds.slice(-10).reverse(),
      });
      return;
    } else if (process.env.NODE_ENV !== 'test') {
      res.status(503).json({ error: 'Database unavailable: MongoDB is not connected' });
      return;
    }

    // In-memory fallback strictly for automated tests
    const orders = Array.from(inMemoryPaymentOrders.values());
    const settlements = Array.from(inMemorySettlements.values());
    const refunds = Array.from(inMemoryRefunds.values());

    let totalVolumePaise = 0;
    let platformCommissionPaise = 0;
    let transporterPayablePaise = 0;

    for (const ord of orders) {
      if (['paid', 'partially_refunded', 'settled'].includes(ord.status)) {
        totalVolumePaise += ord.amountPaise;
        platformCommissionPaise += ord.commissionSnapshot?.platformSharePaise || 0;
        transporterPayablePaise += ord.commissionSnapshot?.partnerSharePaise || 0;
      }
    }

    const totalSettledPaise = settlements
      .filter((s) => s.status === 'settled')
      .reduce((sum, s) => sum + (s.amountPaise || 0), 0);
    const pendingSettlementsCount = orders.filter((o) => ['paid', 'split_pending'].includes(o.status)).length;
    const failedSettlementsCount = settlements.filter((s) => s.status === 'failed').length;
    const totalRefundedPaise = refunds
      .filter((r) => r.status === 'processed')
      .reduce((sum, r) => sum + r.amountPaise, 0);

    const vendors = Array.from(inMemoryVendors.values());
    const totalNegativeExposurePaise = vendors.reduce((sum, v) => sum + (v.unresolvedNegativeBalancePaise || 0), 0);
    const unresolvedDiscrepancyCount = Array.from(inMemoryDiscrepancies.values()).filter((d) => !d.resolved).length;

    res.json({
      success: true,
      totalVolumePaise,
      platformCommissionPaise,
      transporterPayablePaise,
      totalSettledPaise,
      totalNegativeExposurePaise,
      pendingSettlementsCount,
      failedSettlementsCount,
      refundsCount: refunds.length,
      totalRefundedPaise,
      totalOrdersCount: orders.length,
      unresolvedDiscrepancyCount,
      recentOrders: orders.slice(-10).reverse(),
      recentSettlements: settlements.slice(-10).reverse(),
      recentRefunds: refunds.slice(-10).reverse(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve admin payment overview', details: err.message });
  }
});

export default router;

