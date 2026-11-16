export interface CreatePaymentOrderInput {
  deliveryId: string;
  requesterId: string;
  requesterEmail: string;
  requesterPhone?: string;
  amountPaise: number; // Integer paise
  currency?: string;
  idempotencyKey: string;
}

export interface CreatePaymentOrderResult {
  providerOrderId: string;
  paymentSessionId?: string;
  amountPaise: number;
  currency: string;
  provider: 'mock' | 'cashfree' | 'razorpay';
}

export interface VerifyPaymentInput {
  providerOrderId: string;
  providerPaymentId?: string;
  paymentSignature?: string;
}

export interface VerifyPaymentResult {
  isValid: boolean;
  status: 'paid' | 'failed' | 'pending';
  amountPaise: number;
  paidAt?: Date;
  failureReason?: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  eventType: string;
  eventId: string;
  payload: Record<string, any>;
  error?: string;
}

export interface OnboardVendorInput {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  bankAccountMasked?: string;
  ifscCode?: string;
}

export interface OnboardVendorResult {
  providerVendorId: string;
  status: 'active' | 'pending_verification';
}

export interface ExecuteSplitSettlementInput {
  paymentOrderId: string;
  providerVendorId: string;
  transporterSharePaise: number;
  deliveryId: string;
  idempotencyKey: string;
}

export interface ExecuteSplitSettlementResult {
  providerTransferId: string;
  status: 'queued' | 'settled' | 'failed';
  amountPaise: number;
}

export interface InitiateRefundInput {
  paymentOrderId: string;
  amountPaise: number;
  reason: string;
  idempotencyKey: string;
}

export interface InitiateRefundResult {
  providerRefundId: string;
  status: 'initiated' | 'processing' | 'processed' | 'failed';
  amountPaise: number;
  failureReason?: string;
  requiresReconciliation?: boolean;
}

export interface GetPaymentStatusResult {
  providerOrderId: string;
  status: 'created' | 'pending' | 'paid' | 'failed' | 'refunded' | 'settled';
  amountPaise: number;
  currency: string;
}

export interface IPaymentProvider {
  readonly providerName: 'mock' | 'cashfree' | 'razorpay';

  createOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  verifyWebhook(rawBody: string, signatureHeader: string, timestampHeader?: string): Promise<WebhookVerificationResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string, timestampHeader?: string): Promise<WebhookVerificationResult>;
  refundPayment(input: InitiateRefundInput): Promise<InitiateRefundResult>;
  initiateRefund(input: InitiateRefundInput): Promise<InitiateRefundResult>;
  createSettlement(input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult>;
  executeSplitSettlement(input: ExecuteSplitSettlementInput): Promise<ExecuteSplitSettlementResult>;
  getPaymentStatus(providerOrderId: string): Promise<GetPaymentStatusResult>;
  reconcileRefund?(paymentOrderId: string, refundId: string): Promise<InitiateRefundResult>;
  onboardVendor?(input: OnboardVendorInput): Promise<OnboardVendorResult>;
}

