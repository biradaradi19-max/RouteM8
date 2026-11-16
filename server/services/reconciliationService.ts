import { PaymentOrder } from '../models/PaymentOrder.js';
import { Settlement } from '../models/Settlement.js';
import { Refund } from '../models/Refund.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { VendorAccount } from '../models/VendorAccount.js';

export type DiscrepancyType =
  | 'MISSING_SETTLEMENT'
  | 'DUPLICATE_SETTLEMENT'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'POST_SETTLEMENT_REFUND_EXPOSURE'
  | 'FAILED_SETTLEMENT'
  | 'INCONSISTENT_STATE'
  | 'DUPLICATE_REFUND'
  | 'DUPLICATE_REVERSAL'
  | 'INVALID_STATE_TRANSITION'
  | 'INCONSISTENT_VENDOR_BALANCE';

export interface DiscrepancyItem {
  id: string;
  type: DiscrepancyType;
  severity: 'high' | 'medium' | 'low';
  paymentOrderId?: string;
  deliveryId?: string;
  settlementId?: string;
  transporterId?: string;
  amountPaise: number;
  description: string;
  detectedAt: Date;
  resolved: boolean;
  resolutionNote?: string;
  resolvedBy?: { uid: string; email?: string };
  resolvedAt?: Date;
  resolutionResult?: string;
}

export interface FinancialReconciliationReport {
  timestamp: Date;
  summary: {
    totalGrossVolumePaise: number;
    totalPlatformCommissionPaise: number;
    totalTransporterPayablePaise: number;
    totalSettledPaise: number;
    totalPendingSettlementPaise: number;
    totalRefundedPaise: number;
    totalFailedSettlementPaise: number;
    totalNegativeExposurePaise: number;
    discrepancyCount: number;
    isClean: boolean;
  };
  discrepancies: DiscrepancyItem[];
}

// In-memory discrepancy storage for admin acknowledgment & resolutions
export const inMemoryDiscrepancies = new Map<string, DiscrepancyItem>();

/**
 * Runs a full financial reconciliation audit across PaymentOrders, Settlements, Refunds, Deliveries, and VendorAccounts.
 * Audits 10 discrepancy classes:
 * 1. MISSING_SETTLEMENT
 * 2. DUPLICATE_SETTLEMENT
 * 3. AMOUNT_MISMATCH
 * 4. POST_SETTLEMENT_REFUND_EXPOSURE
 * 5. FAILED_SETTLEMENT
 * 6. INCONSISTENT_STATE
 * 7. DUPLICATE_REFUND
 * 8. DUPLICATE_REVERSAL
 * 9. INVALID_STATE_TRANSITION
 * 10. INCONSISTENT_VENDOR_BALANCE
 */
export async function runFinancialReconciliation(customData?: {
  orders?: any[];
  settlements?: any[];
  refunds?: any[];
  deliveries?: any[];
  vendors?: any[];
}): Promise<FinancialReconciliationReport> {
  let orders: any[] = [];
  let settlements: any[] = [];
  let refunds: any[] = [];
  let deliveries: any[] = [];
  let vendors: any[] = [];

  if (customData) {
    orders = customData.orders || [];
    settlements = customData.settlements || [];
    refunds = customData.refunds || [];
    deliveries = customData.deliveries || [];
    vendors = customData.vendors || [];
  } else {
    try {
      orders = await PaymentOrder.find().lean();
      settlements = await Settlement.find().lean();
      refunds = await Refund.find().lean();
      deliveries = await DeliveryRequest.find().lean();
      vendors = await VendorAccount.find().lean();
    } catch {
      orders = [];
      settlements = [];
      refunds = [];
      deliveries = [];
      vendors = [];
    }
  }

  const discrepancies: DiscrepancyItem[] = [];

  let totalGrossVolumePaise = 0;
  let totalPlatformCommissionPaise = 0;
  let totalTransporterPayablePaise = 0;
  let totalSettledPaise = 0;
  let totalPendingSettlementPaise = 0;
  let totalRefundedPaise = 0;
  let totalFailedSettlementPaise = 0;
  let totalNegativeExposurePaise = 0;

  // Index collections for rapid cross-referencing
  const settlementsByOrder = new Map<string, any[]>();
  const reversalsByOriginalId = new Map<string, any[]>();

  for (const s of settlements) {
    const list = settlementsByOrder.get(s.paymentOrderId) || [];
    list.push(s);
    settlementsByOrder.set(s.paymentOrderId, list);

    if (s.entryType === 'reversal' && s.originalSettlementId) {
      const revList = reversalsByOriginalId.get(s.originalSettlementId) || [];
      revList.push(s);
      reversalsByOriginalId.set(s.originalSettlementId, revList);
    }

    if (s.status === 'settled' && s.entryType !== 'reversal') {
      totalSettledPaise += s.amountPaise || 0;
    } else if (s.status === 'failed') {
      totalFailedSettlementPaise += s.amountPaise || 0;
    }
  }

  const refundsByOrder = new Map<string, any[]>();
  for (const r of refunds) {
    const list = refundsByOrder.get(r.paymentOrderId) || [];
    list.push(r);
    refundsByOrder.set(r.paymentOrderId, list);

    if (r.status === 'processed') {
      totalRefundedPaise += r.amountPaise || 0;
    }
  }

  const deliveriesById = new Map<string, any>();
  for (const d of deliveries) {
    const idKey = (d._id || d.id || '').toString();
    deliveriesById.set(idKey, d);
  }

  const postSettlementExposureByTransporter = new Map<string, number>();

  // 1. Audit Orders
  for (const order of orders) {
    const orderId = (order._id || order.id || '').toString();
    const delivery = deliveriesById.get(order.deliveryId);
    const orderSettlements = settlementsByOrder.get(orderId) || [];
    const settledRecords = orderSettlements.filter(
      (s) => s.status === 'settled' && s.entryType !== 'reversal'
    );
    const orderRefunds = refundsByOrder.get(orderId) || [];
    const processedRefunds = orderRefunds.filter((r) => r.status === 'processed');

    const isCaptured = ['paid', 'partially_refunded', 'settled'].includes(order.status);
    if (isCaptured) {
      totalGrossVolumePaise += order.amountPaise || 0;
      totalPlatformCommissionPaise += order.commissionSnapshot?.platformSharePaise || 0;
      totalTransporterPayablePaise += order.commissionSnapshot?.partnerSharePaise || 0;
    }

    // A. Commission snapshot arithmetic integrity check
    if (order.commissionSnapshot) {
      const sumShares =
        (order.commissionSnapshot.platformSharePaise || 0) +
        (order.commissionSnapshot.partnerSharePaise || 0);
      if (sumShares !== order.amountPaise) {
        discrepancies.push({
          id: `disc_amount_mismatch_${orderId}`,
          type: 'AMOUNT_MISMATCH',
          severity: 'high',
          paymentOrderId: orderId,
          deliveryId: order.deliveryId,
          transporterId: order.transporterId,
          amountPaise: Math.abs(order.amountPaise - sumShares),
          description: `Order amount (₹${(order.amountPaise / 100).toFixed(2)}) does not equal platform commission + partner share (₹${(sumShares / 100).toFixed(2)})`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    // A2. Multi-currency consistency check across settlements and refunds
    const orderCurrency = String(order.currencyCode || order.currency || 'INR').toUpperCase().trim();
    for (const s of orderSettlements) {
      const settlementCurrency = String(s.currencyCode || s.currency || 'INR').toUpperCase().trim();
      if (settlementCurrency !== orderCurrency) {
        discrepancies.push({
          id: `disc_currency_mismatch_settle_${s._id || s.id || orderId}`,
          type: 'CURRENCY_MISMATCH',
          severity: 'high',
          paymentOrderId: orderId,
          deliveryId: order.deliveryId,
          settlementId: (s._id || s.id || '').toString(),
          transporterId: order.transporterId,
          amountPaise: s.amountPaise || 0,
          description: `Currency mismatch: PaymentOrder currency is '${orderCurrency}' but Settlement currency is '${settlementCurrency}'`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    for (const r of orderRefunds) {
      const refundCurrency = String(r.currencyCode || r.currency || 'INR').toUpperCase().trim();
      if (refundCurrency !== orderCurrency) {
        discrepancies.push({
          id: `disc_currency_mismatch_refund_${r._id || r.id || orderId}`,
          type: 'CURRENCY_MISMATCH',
          severity: 'high',
          paymentOrderId: orderId,
          deliveryId: order.deliveryId,
          transporterId: order.transporterId,
          amountPaise: r.amountPaise || 0,
          description: `Currency mismatch: PaymentOrder currency is '${orderCurrency}' but Refund currency is '${refundCurrency}'`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    // B. Missing settlement check: Paid & completed, but not settled
    if (isCaptured && delivery?.status === 'completed' && settledRecords.length === 0) {
      const expectedNetShare = Math.max(
        0,
        (order.commissionSnapshot?.partnerSharePaise || 0) - (order.refundedAmountPaise || 0)
      );
      if (expectedNetShare > 0) {
        totalPendingSettlementPaise += expectedNetShare;
        discrepancies.push({
          id: `disc_missing_settlement_${orderId}`,
          type: 'MISSING_SETTLEMENT',
          severity: 'medium',
          paymentOrderId: orderId,
          deliveryId: order.deliveryId,
          transporterId: order.transporterId,
          amountPaise: expectedNetShare,
          description: `Delivery completed and payment captured, but pending transporter settlement of ₹${(expectedNetShare / 100).toFixed(2)}`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    // C. Duplicate settlements check
    if (settledRecords.length > 1) {
      const totalSettledForOrder = settledRecords.reduce((sum, s) => sum + s.amountPaise, 0);
      discrepancies.push({
        id: `disc_dup_settlement_${orderId}`,
        type: 'DUPLICATE_SETTLEMENT',
        severity: 'high',
        paymentOrderId: orderId,
        deliveryId: order.deliveryId,
        transporterId: order.transporterId,
        amountPaise: totalSettledForOrder - settledRecords[0].amountPaise,
        description: `Order has ${settledRecords.length} duplicate settled records totaling ₹${(totalSettledForOrder / 100).toFixed(2)}`,
        detectedAt: new Date(),
        resolved: false,
      });
    }

    // D. Duplicate refund check (exceeds order amount or duplicate idempotency keys)
    const sumRefunded = processedRefunds.reduce((sum, r) => sum + (r.amountPaise || 0), 0);
    if (sumRefunded > order.amountPaise) {
      discrepancies.push({
        id: `disc_dup_refund_${orderId}`,
        type: 'DUPLICATE_REFUND',
        severity: 'high',
        paymentOrderId: orderId,
        deliveryId: order.deliveryId,
        transporterId: order.transporterId,
        amountPaise: sumRefunded - order.amountPaise,
        description: `Order cumulative refunds (₹${(sumRefunded / 100).toFixed(2)}) exceed total captured order amount (₹${(order.amountPaise / 100).toFixed(2)})`,
        detectedAt: new Date(),
        resolved: false,
      });
    }

    // E. Invalid State Transition: order marked settled without settled settlement record
    if (order.status === 'settled' && settledRecords.length === 0) {
      discrepancies.push({
        id: `disc_invalid_state_${orderId}`,
        type: 'INVALID_STATE_TRANSITION',
        severity: 'high',
        paymentOrderId: orderId,
        deliveryId: order.deliveryId,
        transporterId: order.transporterId,
        amountPaise: order.amountPaise || 0,
        description: `Payment order is marked 'settled', but no completed settlement record exists in ledger`,
        detectedAt: new Date(),
        resolved: false,
      });
    }

    // F. Post-settlement refund / negative transporter balance exposure
    if (settledRecords.length > 0 && processedRefunds.length > 0) {
      const earliestSettlementDate = new Date(settledRecords[0].settledAt || settledRecords[0].createdAt || 0);
      let postSettlementRefundsPaise = 0;

      for (const r of processedRefunds) {
        const refundDate = new Date(r.processedAt || r.createdAt || 0);
        if (refundDate >= earliestSettlementDate) {
          postSettlementRefundsPaise += r.amountPaise;
        }
      }

      if (postSettlementRefundsPaise > 0) {
        totalNegativeExposurePaise += postSettlementRefundsPaise;
        if (order.transporterId) {
          const prev = postSettlementExposureByTransporter.get(order.transporterId) || 0;
          postSettlementExposureByTransporter.set(order.transporterId, prev + postSettlementRefundsPaise);
        }

        discrepancies.push({
          id: `disc_post_settle_refund_${orderId}`,
          type: 'POST_SETTLEMENT_REFUND_EXPOSURE',
          severity: 'high',
          paymentOrderId: orderId,
          deliveryId: order.deliveryId,
          transporterId: order.transporterId,
          amountPaise: postSettlementRefundsPaise,
          description: `Customer refund of ₹${(postSettlementRefundsPaise / 100).toFixed(2)} was processed after transporter settlement completed. Creates negative transporter balance exposure.`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }
  }

  // 2. Audit Settlements for Failed Status, Inconsistent State, & Duplicate Reversals
  for (const s of settlements) {
    const sId = (s._id || s.id || '').toString();

    // Check duplicate reversals linked to the same original settlement
    if (s.entryType !== 'reversal') {
      const linkedReversals = reversalsByOriginalId.get(sId) || [];
      if (linkedReversals.length > 1) {
        discrepancies.push({
          id: `disc_dup_reversal_${sId}`,
          type: 'DUPLICATE_REVERSAL',
          severity: 'high',
          paymentOrderId: s.paymentOrderId,
          deliveryId: s.deliveryId,
          settlementId: sId,
          transporterId: s.transporterId,
          amountPaise: s.amountPaise || 0,
          description: `Settlement has ${linkedReversals.length} duplicate compensating reversal entries linked to it`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }

    if (s.status === 'failed') {
      discrepancies.push({
        id: `disc_failed_settle_${sId}`,
        type: 'FAILED_SETTLEMENT',
        severity: 'medium',
        paymentOrderId: s.paymentOrderId,
        deliveryId: s.deliveryId,
        settlementId: sId,
        transporterId: s.transporterId,
        amountPaise: s.amountPaise || 0,
        description: `Settlement transfer of ₹${((s.amountPaise || 0) / 100).toFixed(2)} failed: ${s.failureReason || 'Provider transfer failure'}`,
        detectedAt: new Date(),
        resolved: false,
      });
    }

    if (s.status === 'settled' && s.entryType !== 'reversal') {
      const delivery = deliveriesById.get(s.deliveryId);
      if (delivery && delivery.status !== 'completed') {
        discrepancies.push({
          id: `disc_inconsistent_${sId}`,
          type: 'INCONSISTENT_STATE',
          severity: 'high',
          paymentOrderId: s.paymentOrderId,
          deliveryId: s.deliveryId,
          settlementId: sId,
          transporterId: s.transporterId,
          amountPaise: s.amountPaise || 0,
          description: `Settlement record marked 'settled', but delivery status is '${delivery.status}' (must be 'completed')`,
          detectedAt: new Date(),
          resolved: false,
        });
      }
    }
  }

  // 3. Audit Vendor Accounts for Inconsistent Negative Balances
  for (const v of vendors) {
    const transporterId = v.transporterId;
    const trackedExposure = postSettlementExposureByTransporter.get(transporterId) || 0;
    const currentUnresolved = v.unresolvedNegativeBalancePaise || 0;
    const totalRecovered = v.totalNegativeExposureRecoveredPaise || 0;

    // Discrepancy if current unresolved + recovered is wildly disconnected from tracked post-settlement refunds
    if (trackedExposure > 0 && currentUnresolved + totalRecovered < trackedExposure) {
      discrepancies.push({
        id: `disc_inconsistent_vendor_${transporterId}`,
        type: 'INCONSISTENT_VENDOR_BALANCE',
        severity: 'high',
        transporterId,
        amountPaise: trackedExposure - (currentUnresolved + totalRecovered),
        description: `Transporter vendor negative balance (₹${(currentUnresolved / 100).toFixed(2)} active, ₹${(totalRecovered / 100).toFixed(2)} recovered) does not match post-settlement refund exposure of ₹${(trackedExposure / 100).toFixed(2)}`,
        detectedAt: new Date(),
        resolved: false,
      });
    }
  }

  // Preserve in-memory resolution states if resolved before
  for (const disc of discrepancies) {
    if (inMemoryDiscrepancies.has(disc.id)) {
      const existing = inMemoryDiscrepancies.get(disc.id)!;
      disc.resolved = existing.resolved;
      disc.resolutionNote = existing.resolutionNote;
      disc.resolvedBy = existing.resolvedBy;
      disc.resolvedAt = existing.resolvedAt;
      disc.resolutionResult = existing.resolutionResult;
    } else {
      inMemoryDiscrepancies.set(disc.id, disc);
    }
  }

  const unresolvedCount = discrepancies.filter((d) => !d.resolved).length;

  return {
    timestamp: new Date(),
    summary: {
      totalGrossVolumePaise,
      totalPlatformCommissionPaise,
      totalTransporterPayablePaise,
      totalSettledPaise,
      totalPendingSettlementPaise,
      totalRefundedPaise,
      totalFailedSettlementPaise,
      totalNegativeExposurePaise,
      discrepancyCount: unresolvedCount,
      isClean: unresolvedCount === 0,
    },
    discrepancies,
  };
}
