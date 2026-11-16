import crypto from 'node:crypto';
import type {
  IPaymentProvider,
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookVerificationResult,
  ExecuteSplitSettlementInput,
  ExecuteSplitSettlementResult,
  InitiateRefundInput,
  InitiateRefundResult,
  GetPaymentStatusResult,
} from './IPaymentProvider.js';

/**
 * Razorpay Route Payment Adapter (Sandbox / Production Architecture)
 * Keeps Razorpay API integration strictly isolated from domain business logic.
 * Implements Razorpay webhook signature specification using HMAC-SHA256.
 */
export class RazorpayPaymentAdapter implements IPaymentProvider {
  readonly providerName = 'razorpay' as const;
  private readonly keyId?: string;
  private readonly keySecret?: string;
  private readonly webhookSecret?: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
  }

  private ensureConfigured(): void {
    if (!this.keyId || !this.keySecret) {
      throw new Error(
        'Razorpay integration unconfigured: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required for RazorpayPaymentAdapter.'
      );
    }
  }

  async createOrder(_input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    this.ensureConfigured();
    throw new Error('Razorpay live API not activated: Free tier policy strictly uses MockPaymentProvider.');
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    this.ensureConfigured();
    throw new Error('Razorpay live API not activated: Free tier policy strictly uses MockPaymentProvider.');
  }

  async verifyWebhook(rawBody: string, signatureHeader: string, timestampHeader?: string): Promise<WebhookVerificationResult> {
    return this.verifyWebhookSignature(rawBody, signatureHeader, timestampHeader);
  }

  /**
   * Validates Razorpay webhook signature according to official specification:
   * 1. Signature header: x-razorpay-signature (Hex HMAC-SHA256)
   * 2. Signed payload: rawBody
   * 3. Secret: RAZORPAY_WEBHOOK_SECRET or RAZORPAY_KEY_SECRET
   */
  async verifyWebhookSignature(rawBody: string, signatureHeader: string, _timestampHeader?: string): Promise<WebhookVerificationResult> {
    if (!signatureHeader || signatureHeader.trim() === '') {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'missing_signature',
        payload: {},
        error: 'Missing Razorpay webhook signature header (x-razorpay-signature)',
      };
    }

    const secret = this.webhookSecret || this.keySecret;
    if (!secret) {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'unconfigured_secret',
        payload: {},
        error: 'Razorpay webhook secret not configured',
      };
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signatureHeader);
      const expectedBuf = Buffer.from(expectedSignature);

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return {
          isValid: false,
          eventType: 'unknown',
          eventId: 'invalid_signature',
          payload: {},
          error: 'Invalid Razorpay webhook HMAC signature',
        };
      }

      const payload = JSON.parse(rawBody || '{}');
      return {
        isValid: true,
        eventType: payload.event || 'payment.captured',
        eventId: payload.event_id || payload.payload?.payment?.entity?.id || `rzp_evt_${Date.now()}`,
        payload,
      };
    } catch {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'malformed_payload',
        payload: {},
        error: 'Malformed JSON payload in webhook body',
      };
    }
  }

  async refundPayment(input: InitiateRefundInput): Promise<InitiateRefundResult> {
    return this.initiateRefund(input);
  }

  async initiateRefund(_input: InitiateRefundInput): Promise<InitiateRefundResult> {
    this.ensureConfigured();
    throw new Error('Razorpay live API not activated: Free tier policy strictly uses MockPaymentProvider.');
  }

  async createSettlement(input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult> {
    return this.executeSplitSettlement(input);
  }

  async executeSplitSettlement(_input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult> {
    this.ensureConfigured();
    throw new Error('Razorpay live API not activated: Free tier policy strictly uses MockPaymentProvider.');
  }

  async getPaymentStatus(_providerOrderId: string): Promise<GetPaymentStatusResult> {
    this.ensureConfigured();
    throw new Error('Razorpay live API not activated: Free tier policy strictly uses MockPaymentProvider.');
  }
}
