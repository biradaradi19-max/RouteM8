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

export interface CashfreeAdapterOptions {
  appId?: string;
  secretKey?: string;
  apiEndpoint?: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
}

/**
 * Cashfree Payments Sandbox / Live Adapter
 * Connects RouteM8 marketplace payment orchestration to Cashfree's official PG APIs.
 * Supports Order Creation, Payment Verification, HMAC-SHA256 Webhooks, and Timeout-Safe Refunds.
 */
export class CashfreePaymentAdapter implements IPaymentProvider {
  readonly providerName = 'cashfree' as const;
  private readonly appId?: string;
  private readonly secretKey?: string;
  protected readonly apiEndpoint: string;
  protected readonly apiVersion: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: CashfreeAdapterOptions) {
    this.appId = options?.appId || process.env.CASHFREE_APP_ID;
    this.secretKey = options?.secretKey || process.env.CASHFREE_SECRET_KEY;
    this.apiVersion = options?.apiVersion || process.env.CASHFREE_API_VERSION || '2023-08-01';
    this.apiEndpoint =
      options?.apiEndpoint ||
      (process.env.CASHFREE_ENV === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg');
    this.fetchFn = options?.fetchFn || globalThis.fetch.bind(globalThis);
  }

  private ensureConfigured(): void {
    if (!this.appId || !this.secretKey) {
      throw new Error(
        'Cashfree integration unconfigured: CASHFREE_APP_ID and CASHFREE_SECRET_KEY are required for CashfreePaymentAdapter.'
      );
    }
  }

  private getHeaders(): Record<string, string> {
    this.ensureConfigured();
    return {
      'x-client-id': this.appId!,
      'x-client-secret': this.secretKey!,
      'x-api-version': this.apiVersion,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Cashfree Order Creation (POST /orders)
   * Converts RouteM8 integer paise compensation into INR float and initiates checkout session.
   */
  async createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
    this.ensureConfigured();

    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new Error('Order amount must be a positive integer in paise');
    }

    const orderAmount = Number((input.amountPaise / 100).toFixed(2));
    const cleanPhone = (input.requesterPhone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';
    const orderId = `cf_ord_${input.deliveryId}_${Date.now()}`.slice(0, 45);

    const payload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: input.currency || 'INR',
      customer_details: {
        customer_id: input.requesterId.slice(0, 50),
        customer_email: input.requesterEmail || `${input.requesterId}@routem8.internal`,
        customer_phone: cleanPhone,
      },
      order_meta: {
        return_url: `${process.env.APP_BASE_URL || 'https://route-m8.vercel.app'}/dashboard?deliveryId=${input.deliveryId}&cf_order_id={order_id}`,
        notify_url: `${process.env.API_BASE_URL || 'https://route-m8.vercel.app'}/api/payments/webhook?provider=cashfree`,
      },
      order_note: `RouteM8 Delivery Payment: ${input.deliveryId}`,
    };

    const res = await this.fetchFn(`${this.apiEndpoint}/orders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorMsg = `Cashfree order creation failed (${res.status})`;
      try {
        const errJson: any = await res.json();
        errorMsg = errJson.message || errJson.error || errorMsg;
      } catch {
        // Fallback status text
      }
      throw new Error(errorMsg);
    }

    const data: any = await res.json();
    return {
      providerOrderId: data.order_id || data.cf_order_id,
      paymentSessionId: data.payment_session_id,
      amountPaise: input.amountPaise,
      currency: input.currency || 'INR',
      provider: 'cashfree',
    };
  }

  /**
   * Cashfree Server-Side Payment Verification (GET /orders/{order_id}/payments)
   * Never trusts client-side callbacks; verifies real transaction status with Cashfree.
   */
  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    this.ensureConfigured();

    if (!input.providerOrderId) {
      return {
        isValid: false,
        status: 'failed',
        amountPaise: 0,
        failureReason: 'Missing provider order ID',
      };
    }

    try {
      const res = await this.fetchFn(`${this.apiEndpoint}/orders/${input.providerOrderId}/payments`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        // Fallback: check order status directly
        const orderStatus = await this.getPaymentStatus(input.providerOrderId);
        if (orderStatus.status === 'paid') {
          return {
            isValid: true,
            status: 'paid',
            amountPaise: orderStatus.amountPaise,
            paidAt: new Date(),
          };
        }
        return {
          isValid: false,
          status: 'failed',
          amountPaise: 0,
          failureReason: `Cashfree payment verification rejected with status: ${res.status}`,
        };
      }

      const rawPayments: any = await res.json();
      const payments: any[] = Array.isArray(rawPayments) ? rawPayments : [];
      const successPayment = payments.find((p) => p.payment_status === 'SUCCESS');

      if (successPayment) {
        return {
          isValid: true,
          status: 'paid',
          amountPaise: Math.round(Number(successPayment.payment_amount) * 100),
          paidAt: successPayment.payment_completion_time ? new Date(successPayment.payment_completion_time) : new Date(),
        };
      }

      const failedPayment = payments.find((p) => ['FAILED', 'USER_DROPPED', 'CANCELLED'].includes(p.payment_status));
      return {
        isValid: false,
        status: 'failed',
        amountPaise: 0,
        failureReason: failedPayment ? `Cashfree transaction status: ${failedPayment.payment_status}` : 'No successful payment recorded',
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: 'failed',
        amountPaise: 0,
        failureReason: `Verification error: ${err.message}`,
      };
    }
  }

  /**
   * Cashfree Order Status Lookup (GET /orders/{order_id})
   */
  async getPaymentStatus(providerOrderId: string): Promise<GetPaymentStatusResult> {
    this.ensureConfigured();

    const res = await this.fetchFn(`${this.apiEndpoint}/orders/${providerOrderId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to retrieve Cashfree order status (${res.status})`);
    }

    const data: any = await res.json();
    let status: GetPaymentStatusResult['status'] = 'created';
    if (data.order_status === 'PAID') {
      status = 'paid';
    } else if (data.order_status === 'ACTIVE') {
      status = 'pending';
    } else if (['EXPIRED', 'TERMINATED'].includes(data.order_status)) {
      status = 'failed';
    }

    return {
      providerOrderId: data.order_id || providerOrderId,
      status,
      amountPaise: Math.round(Number(data.order_amount) * 100),
      currency: data.order_currency || 'INR',
    };
  }

  async verifyWebhook(rawBody: string, signatureHeader: string, timestampHeader?: string): Promise<WebhookVerificationResult> {
    return this.verifyWebhookSignature(rawBody, signatureHeader, timestampHeader);
  }

  /**
   * Validates Cashfree webhook signature according to official specification:
   * 1. Signature header: x-webhook-signature (Base64 HMAC-SHA256)
   * 2. Timestamp header: x-webhook-timestamp
   * 3. Signed payload: `${timestamp}${rawBody}`
   * 4. Timestamp freshness: Rejects if older than 5 minutes (replay protection)
   */
  async verifyWebhookSignature(rawBody: string, signatureHeader: string, timestampHeader?: string): Promise<WebhookVerificationResult> {
    if (!signatureHeader || signatureHeader.trim() === '') {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'missing_signature',
        payload: {},
        error: 'Missing Cashfree webhook signature header (x-webhook-signature)',
      };
    }

    if (!timestampHeader || timestampHeader.trim() === '') {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'missing_timestamp',
        payload: {},
        error: 'Missing Cashfree webhook timestamp header (x-webhook-timestamp)',
      };
    }

    // Timestamp replay protection: 5 minute window tolerance
    const tsNum = Number(timestampHeader);
    const tsMillis = tsNum > 1e11 ? tsNum : tsNum * 1000;
    if (isNaN(tsMillis) || Math.abs(Date.now() - tsMillis) > 5 * 60 * 1000) {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'timestamp_expired',
        payload: {},
        error: 'Cashfree webhook timestamp expired or invalid (replay protection)',
      };
    }

    const secret = this.secretKey;
    if (!secret) {
      return {
        isValid: false,
        eventType: 'unknown',
        eventId: 'unconfigured_secret',
        payload: {},
        error: 'Cashfree secret key not configured',
      };
    }

    try {
      const dataToSign = `${timestampHeader}${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToSign)
        .digest('base64');

      const sigBuf = Buffer.from(signatureHeader);
      const expectedBuf = Buffer.from(expectedSignature);

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return {
          isValid: false,
          eventType: 'unknown',
          eventId: 'invalid_signature',
          payload: {},
          error: 'Invalid Cashfree webhook HMAC signature',
        };
      }

      const payload = JSON.parse(rawBody || '{}');
      return {
        isValid: true,
        eventType: payload.type || payload.event || 'payment.success',
        eventId: payload.event_id || payload.data?.order?.order_id || `cf_evt_${Date.now()}`,
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

  /**
   * Cashfree Refund Processing (POST /orders/{order_id}/refunds)
   * Enforces strict timeout safety:
   * - Never releases atomic refund reservations on network timeouts / unconfirmed outcomes.
   * - Marks status as 'processing' with requiresReconciliation: true when network fails.
   * - Releases reservation ONLY on confirmed 4xx provider rejections.
   */
  async initiateRefund(input: InitiateRefundInput): Promise<InitiateRefundResult> {
    this.ensureConfigured();

    const refundAmount = Number((input.amountPaise / 100).toFixed(2));
    const refundId = input.idempotencyKey.slice(0, 40);

    const payload = {
      refund_id: refundId,
      refund_amount: refundAmount,
      refund_note: input.reason || 'RouteM8 Delivery Refund',
      refund_speed: 'STANDARD',
    };

    try {
      const res = await this.fetchFn(`${this.apiEndpoint}/orders/${input.paymentOrderId}/refunds`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errJson: any = {};
        try {
          errJson = await res.json();
        } catch {
          // Fallback
        }

        // Confirmed provider rejection (4xx status): Safe to release reservation
        if (res.status >= 400 && res.status < 500) {
          return {
            providerRefundId: `cf_fail_${refundId}`,
            status: 'failed',
            amountPaise: input.amountPaise,
            failureReason: errJson.message || `Cashfree refund rejected with status ${res.status}`,
            requiresReconciliation: false,
          };
        }

        // 5xx Gateway server error: Indeterminate outcome, MUST NOT release reservation
        return {
          providerRefundId: `pending_${refundId}`,
          status: 'processing',
          amountPaise: input.amountPaise,
          failureReason: `Cashfree gateway returned ${res.status}. Pending reconciliation.`,
          requiresReconciliation: true,
        };
      }

      const data: any = await res.json();
      let status: InitiateRefundResult['status'] = 'processed';
      if (data.refund_status === 'PENDING' || data.refund_status === 'ONGOING') {
        status = 'processing';
      } else if (data.refund_status === 'FAILED') {
        status = 'failed';
      }

      return {
        providerRefundId: data.cf_refund_id || data.refund_id || refundId,
        status,
        amountPaise: input.amountPaise,
        failureReason: data.status_description,
        requiresReconciliation: status === 'processing',
      };
    } catch (networkErr: any) {
      // Network timeout / socket hangup: INDETERMINATE. MUST NOT release reservation.
      return {
        providerRefundId: `pending_${refundId}`,
        status: 'processing',
        amountPaise: input.amountPaise,
        failureReason: `Network timeout: ${networkErr.message}. Marked processing for reconciliation.`,
        requiresReconciliation: true,
      };
    }
  }

  /**
   * Cashfree Refund Reconciliation (GET /orders/{order_id}/refunds/{refund_id})
   */
  async reconcileRefund(paymentOrderId: string, refundId: string): Promise<InitiateRefundResult> {
    this.ensureConfigured();

    const res = await this.fetchFn(`${this.apiEndpoint}/orders/${paymentOrderId}/refunds/${refundId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to reconcile Cashfree refund status (${res.status})`);
    }

    const data: any = await res.json();
    let status: InitiateRefundResult['status'] = 'processing';
    if (data.refund_status === 'SUCCESS') {
      status = 'processed';
    } else if (data.refund_status === 'FAILED') {
      status = 'failed';
    }

    return {
      providerRefundId: data.cf_refund_id || data.refund_id || refundId,
      status,
      amountPaise: Math.round(Number(data.refund_amount) * 100),
      failureReason: data.status_description,
      requiresReconciliation: status === 'processing',
    };
  }

  async createSettlement(input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult> {
    return this.executeSplitSettlement(input);
  }

  /**
   * Easy Split Marketplace Settlements (Strictly Stubbed)
   * Live payouts and bank transfers are deactivated per RouteM8 free-tier policy.
   */
  async executeSplitSettlement(input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult> {
    this.ensureConfigured();
    // Return simulated queued settlement without real bank transfers
    return {
      providerTransferId: `cf_split_stub_${input.paymentOrderId}`,
      status: 'queued',
      amountPaise: input.transporterSharePaise,
    };
  }
}
