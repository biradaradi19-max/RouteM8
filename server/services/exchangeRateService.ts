/**
 * RouteM8 — Exchange Rate & Conversion Quote Service
 * Provider-independent exchange rate feed with Atlas M0 MongoDB persistence,
 * HMAC-SHA256 cryptographic quote signing for serverless cold-start resilience,
 * replay protection, and strict integer minor unit arithmetic.
 */

import crypto from 'node:crypto';
import {
  isSupportedCurrency,
  getCurrencyConfig,
  toMinorUnits,
  toMajorUnits,
  assertValidMinorUnits,
} from './currencyService.js';
import { ConversionQuote as ConversionQuoteModel, type RateType } from '../models/ConversionQuote.js';
import { isDbConnected } from '../config/db.js';

export interface ExchangeRateEntry {
  sourceCurrency: string;
  targetCurrency: string;
  rate: number; // 1 unit of sourceCurrency = rate units of targetCurrency
  timestamp: Date;
  source: string;
}

export interface ConversionQuote {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinorUnits: number;
  targetAmountMinorUnits: number;
  exchangeRate: number;
  rateType: RateType;
  source: string;
  signature: string;
  isUsed: boolean;
  usedAt?: Date;
  usedInOrderId?: string;
  createdAt: Date;
  expiresAt: Date;
}

// Default benchmark exchange rates relative to INR (1 INR = X targetCurrency)
// India-first architecture: INR is the base reference
const BENCHMARK_INR_RATES: Record<string, number> = {
  INR: 1.0,
  USD: 0.01198, // ~83.50 INR / USD
  EUR: 0.01108, // ~90.25 INR / EUR
  GBP: 0.00948, // ~105.50 INR / GBP
  CAD: 0.01634, // ~61.20 INR / CAD
  AUD: 0.01825, // ~54.80 INR / AUD
  AED: 0.04396, // ~22.75 INR / AED
  SGD: 0.01610, // ~62.10 INR / SGD
};

// In-memory quote cache (TTL: 10 minutes)
export const QUOTE_TTL_MS = 10 * 60 * 1000;
const inMemoryQuotes = new Map<string, ConversionQuote>();

// Internal secret for HMAC-SHA256 quote signing
const QUOTE_SECRET = process.env.EXCHANGE_QUOTE_SECRET || process.env.JWT_SECRET || 'routem8_internal_quote_secret_v1';

/**
 * Computes a cryptographic HMAC-SHA256 signature for a conversion quote.
 * Prevents client-side tampering of rates, amounts, or currency pairs.
 */
export function computeQuoteSignature(payload: {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinorUnits: number;
  targetAmountMinorUnits: number;
  exchangeRate: number;
  expiresAt: Date;
}): string {
  const data = `${payload.quoteId}:${payload.sourceCurrency}:${payload.targetCurrency}:${payload.sourceAmountMinorUnits}:${payload.targetAmountMinorUnits}:${payload.exchangeRate}:${payload.expiresAt.getTime()}`;
  return crypto.createHmac('sha256', QUOTE_SECRET).update(data).digest('hex');
}

/**
 * Validates an HMAC-SHA256 signature with constant-time equality check.
 */
export function verifyQuoteSignature(quote: {
  quoteId: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmountMinorUnits: number;
  targetAmountMinorUnits: number;
  exchangeRate: number;
  expiresAt: Date;
  signature?: string;
}): boolean {
  if (!quote.signature || typeof quote.signature !== 'string') return false;
  try {
    const expectedSig = computeQuoteSignature(quote);
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const actualBuf = Buffer.from(quote.signature, 'hex');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Resolves the exchange rate between any two supported currencies.
 * Returns how many units of targetCurrency 1 unit of sourceCurrency buys.
 */
export function getExchangeRate(
  sourceCurrency: string,
  targetCurrency: string
): { rate: number; timestamp: Date; source: string } {
  const src = sourceCurrency.toUpperCase().trim();
  const tgt = targetCurrency.toUpperCase().trim();

  if (!isSupportedCurrency(src) || !isSupportedCurrency(tgt)) {
    throw new Error(`Unsupported currency conversion from ${src} to ${tgt}`);
  }

  if (src === tgt) {
    return {
      rate: 1.0,
      timestamp: new Date(),
      source: 'identity',
    };
  }

  // Cross rate calculation via INR base
  const rateInrToSrc = BENCHMARK_INR_RATES[src];
  const rateInrToTgt = BENCHMARK_INR_RATES[tgt];

  if (!rateInrToSrc || !rateInrToTgt) {
    throw new Error(`Exchange rate unavailable for pair ${src}/${tgt}`);
  }

  const rate = (1 / rateInrToSrc) * rateInrToTgt;

  return {
    rate: Number(rate.toFixed(6)),
    timestamp: new Date(),
    source: 'mock_ecb_feed_v1',
  };
}

/**
 * Creates an authoritative conversion quote with strict integer minor-unit math.
 * The quote is cryptographically signed with HMAC-SHA256 and persisted in MongoDB
 * with an Atlas M0 TTL index for automatic expiration cleanup.
 */
export function createConversionQuote(
  sourceAmountMinorUnits: number,
  sourceCurrency: string,
  targetCurrency: string
): ConversionQuote {
  assertValidMinorUnits(sourceAmountMinorUnits, 'sourceAmountMinorUnits');

  const src = sourceCurrency.toUpperCase().trim();
  const tgt = targetCurrency.toUpperCase().trim();

  const srcConfig = getCurrencyConfig(src);
  const tgtConfig = getCurrencyConfig(tgt);

  const { rate, source } = getExchangeRate(src, tgt);

  // Convert minor units through major units to respect decimal scale differences
  const sourceMajor = toMajorUnits(sourceAmountMinorUnits, src);
  const targetMajor = sourceMajor * rate;
  const targetAmountMinorUnits = toMinorUnits(targetMajor, tgt);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS);
  const quoteId = `quote_${crypto.randomUUID()}`;

  const signature = computeQuoteSignature({
    quoteId,
    sourceCurrency: srcConfig.code,
    targetCurrency: tgtConfig.code,
    sourceAmountMinorUnits,
    targetAmountMinorUnits,
    exchangeRate: rate,
    expiresAt,
  });

  const quote: ConversionQuote = {
    quoteId,
    sourceCurrency: srcConfig.code,
    targetCurrency: tgtConfig.code,
    sourceAmountMinorUnits,
    targetAmountMinorUnits,
    exchangeRate: rate,
    rateType: 'benchmark',
    source,
    signature,
    isUsed: false,
    createdAt: now,
    expiresAt,
  };

  inMemoryQuotes.set(quoteId, quote);

  if (isDbConnected()) {
    ConversionQuoteModel.create(quote).catch(() => {});
  }

  return quote;
}

/**
 * Authoritatively validates a conversion quote synchronously (in-memory / fast-path).
 * Rejects expired quotes, replayed quotes, missing quotes, or quotes whose amounts,
 * signatures or currency pairs do not match.
 */
export function validateConversionQuote(
  quoteId: string,
  expectedSourceAmountMinorUnits?: number,
  expectedSourceCurrency?: string,
  expectedTargetCurrency?: string
): { isValid: boolean; quote?: ConversionQuote; error?: string } {
  const quote = inMemoryQuotes.get(quoteId);

  if (!quote) {
    return { isValid: false, error: 'Conversion quote not found or has expired' };
  }

  const now = new Date();
  if (now.getTime() > quote.expiresAt.getTime()) {
    inMemoryQuotes.delete(quoteId);
    return { isValid: false, error: 'Conversion quote has expired. Please refresh rate quote.' };
  }

  if (quote.isUsed) {
    return {
      isValid: false,
      error: 'Conversion quote has already been consumed by an order. Quote replay prevented.',
    };
  }

  if (!verifyQuoteSignature(quote)) {
    return {
      isValid: false,
      error: 'Cryptographic signature verification failed: quote tampering detected.',
    };
  }

  if (
    expectedSourceAmountMinorUnits !== undefined &&
    quote.sourceAmountMinorUnits !== expectedSourceAmountMinorUnits
  ) {
    return {
      isValid: false,
      error: `Quote source amount mismatch: expected ${expectedSourceAmountMinorUnits}, got ${quote.sourceAmountMinorUnits}`,
    };
  }

  if (
    expectedSourceCurrency &&
    quote.sourceCurrency.toUpperCase() !== expectedSourceCurrency.toUpperCase()
  ) {
    return {
      isValid: false,
      error: `Quote source currency mismatch: expected ${expectedSourceCurrency}, got ${quote.sourceCurrency}`,
    };
  }

  if (
    expectedTargetCurrency &&
    quote.targetCurrency.toUpperCase() !== expectedTargetCurrency.toUpperCase()
  ) {
    return {
      isValid: false,
      error: `Quote target currency mismatch: expected ${expectedTargetCurrency}, got ${quote.targetCurrency}`,
    };
  }

  return { isValid: true, quote };
}

/**
 * Authoritatively validates a conversion quote asynchronously with Atlas M0 MongoDB lookup.
 * Reliable across Vercel serverless cold starts and independent compute instances.
 */
export async function validateConversionQuoteAsync(
  quoteId: string,
  expectedSourceAmountMinorUnits?: number,
  expectedSourceCurrency?: string,
  expectedTargetCurrency?: string
): Promise<{ isValid: boolean; quote?: ConversionQuote; error?: string }> {
  let quote: ConversionQuote | undefined;

  if (isDbConnected()) {
    try {
      const dbDoc = await ConversionQuoteModel.findOne({ quoteId }).lean();
      if (dbDoc) {
        quote = {
          quoteId: dbDoc.quoteId,
          sourceCurrency: dbDoc.sourceCurrency,
          targetCurrency: dbDoc.targetCurrency,
          sourceAmountMinorUnits: dbDoc.sourceAmountMinorUnits,
          targetAmountMinorUnits: dbDoc.targetAmountMinorUnits,
          exchangeRate: dbDoc.exchangeRate,
          rateType: dbDoc.rateType,
          source: dbDoc.source,
          signature: dbDoc.signature,
          isUsed: Boolean(dbDoc.isUsed),
          usedAt: dbDoc.usedAt,
          usedInOrderId: dbDoc.usedInOrderId,
          createdAt: dbDoc.createdAt,
          expiresAt: dbDoc.expiresAt,
        };
      }
    } catch {
      // Fall through to in-memory lookup
    }
  }

  if (!quote) {
    quote = inMemoryQuotes.get(quoteId);
  }

  if (!quote) {
    return { isValid: false, error: 'Conversion quote not found or has expired' };
  }

  const now = new Date();
  if (now.getTime() > quote.expiresAt.getTime()) {
    inMemoryQuotes.delete(quoteId);
    return { isValid: false, error: 'Conversion quote has expired. Please refresh rate quote.' };
  }

  if (quote.isUsed) {
    return {
      isValid: false,
      error: 'Conversion quote has already been consumed by an order. Quote replay prevented.',
    };
  }

  if (!verifyQuoteSignature(quote)) {
    return {
      isValid: false,
      error: 'Cryptographic signature verification failed: quote tampering detected.',
    };
  }

  if (
    expectedSourceAmountMinorUnits !== undefined &&
    quote.sourceAmountMinorUnits !== expectedSourceAmountMinorUnits
  ) {
    return {
      isValid: false,
      error: `Quote source amount mismatch: expected ${expectedSourceAmountMinorUnits}, got ${quote.sourceAmountMinorUnits}`,
    };
  }

  if (
    expectedSourceCurrency &&
    quote.sourceCurrency.toUpperCase() !== expectedSourceCurrency.toUpperCase()
  ) {
    return {
      isValid: false,
      error: `Quote source currency mismatch: expected ${expectedSourceCurrency}, got ${quote.sourceCurrency}`,
    };
  }

  if (
    expectedTargetCurrency &&
    quote.targetCurrency.toUpperCase() !== expectedTargetCurrency.toUpperCase()
  ) {
    return {
      isValid: false,
      error: `Quote target currency mismatch: expected ${expectedTargetCurrency}, got ${quote.targetCurrency}`,
    };
  }

  return { isValid: true, quote };
}

/**
 * Atomically consumes a conversion quote, preventing any subsequent re-use / replay attack.
 */
export async function consumeConversionQuote(
  quoteId: string,
  orderId: string
): Promise<boolean> {
  const inMem = inMemoryQuotes.get(quoteId);
  if (inMem) {
    inMem.isUsed = true;
    inMem.usedAt = new Date();
    inMem.usedInOrderId = orderId;
  }

  if (isDbConnected()) {
    try {
      const updated = await ConversionQuoteModel.findOneAndUpdate(
        { quoteId, isUsed: false, expiresAt: { $gt: new Date() } },
        { $set: { isUsed: true, usedAt: new Date(), usedInOrderId: orderId } },
        { new: true }
      );
      return Boolean(updated);
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Clears expired quotes from in-memory cache.
 */
export function purgeExpiredQuotes(): number {
  const now = Date.now();
  let purged = 0;
  for (const [id, q] of inMemoryQuotes.entries()) {
    if (now > q.expiresAt.getTime()) {
      inMemoryQuotes.delete(id);
      purged++;
    }
  }
  return purged;
}

// For unit testing inspection
export { inMemoryQuotes };
