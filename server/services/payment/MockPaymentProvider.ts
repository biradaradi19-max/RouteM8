import crypto from 'node:crypto';
import type {
  IPaymentProvider,
  CreatePaymentOrderInput,
  CreatePaymentOrderResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookVerificationResult,
  OnboardVendorInput,
  OnboardVendorResult,
  ExecuteSplitSettlementInput,
  ExecuteSplitSettlementResult,
  InitiateRefundInput,
  InitiateRefundResult,
  GetPaymentStatusResult,
} from './IPaymentProvider.js';

export class MockPaymentProvider implements IPaymentProvider {
  readonly providerName = 'mock';

  private ensureNonProduction(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECURITY VIOLATION: MockPaymentProvider is strictly forbidden in production. Use Cashfree or Razorpay live adapters.'
      );
    }
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    this.ensureNonProduction();

    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new Error('Order amount must be a positive integer in paise');
    }

    const providerOrderId = `mock_order_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const paymentSessionId = `mock_session_${crypto.randomBytes(8).toString('hex')}`;

    return {
      providerOrderId,
      paymentSessionId,
      amountPaise: input.amountPaise,
      currency: input.currency || 'INR',
      provider: 'mock',
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    this.ensureNonProduction();

    // Verify presence of required order reference
    if (!input.providerOrderId) {
      return {
        isValid: false,
        status: 'failed',
        amountPaise: 0,
        failureReason: 'Missing provider order ID',
      };
    }

    return {
      isValid: true,
      status: 'paid',
      amountPaise: 50000,
      paidAt: new Date(),
    };
  }

  async verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    _timestampHeader?: string
  ): Promise<WebhookVerificationResult> {
    this.ensureNonProduction();

    if (!signatureHeader || signatureHeader.length < 8 || signatureHeader.toLowerCase().includes('invalid')) {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'invalid_event',
        payload: {},
        error: 'Invalid or unverified webhook HMAC signature header',
      };
    }

    try {
      const payload = JSON.parse(rawBody || '{}');
      return {
        isValid: true,
        eventType: payload.type || payload.eventType || payload.event || 'payment.success',
        eventId: payload.id || payload.eventId || `evt_${Date.now()}`,
        payload,
      };
    } catch {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'parse_error',
        payload: {},
        error: 'Malformed JSON payload in webhook body',
      };
    }
  }

  async onboardVendor(input: OnboardVendorInput): Promise<OnboardVendorResult> {
    this.ensureNonProduction();

    const providerVendorId = `mock_vendor_${input.userId.slice(-6)}_${crypto.randomBytes(3).toString('hex')}`;
    return {
      providerVendorId,
      status: 'active',
    };
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    timestampHeader?: string
  ): Promise<WebhookVerificationResult> {
    return this.verifyWebhookSignature(rawBody, signatureHeader, timestampHeader);
  }

  async refundPayment(input: InitiateRefundInput): Promise<InitiateRefundResult> {
    return this.initiateRefund(input);
  }

  async createSettlement(
    input: ExecuteSplitSettlementInput
  ): Promise<ExecuteSplitSettlementResult> {
    return this.executeSplitSettlement(input);
  }

  async getPaymentStatus(providerOrderId: string): Promise<GetPaymentStatusResult> {
    this.ensureNonProduction();

    return {
      providerOrderId,
      status: 'paid',
      amountPaise: 2500,
      currency: 'INR',
    };
  }

  async executeSplitSettlement(
    input: ExecuteSplitSettlementInput
  ): Promise<ExecuteSplitSettlementResult> {
    this.ensureNonProduction();

    if (!Number.isInteger(input.transporterSharePaise) || input.transporterSharePaise <= 0) {
      throw new Error('Transporter share must be a positive integer in paise');
    }

    const providerTransferId = `mock_transfer_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return {
      providerTransferId,
      status: 'settled',
      amountPaise: input.transporterSharePaise,
    };
  }

  async initiateRefund(input: InitiateRefundInput): Promise<InitiateRefundResult> {
    this.ensureNonProduction();

    const providerRefundId = `mock_refund_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return {
      providerRefundId,
      status: 'processed',
      amountPaise: input.amountPaise,
    };
  }
}

export const mockPaymentProvider = new MockPaymentProvider();

