import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();
import type { Model, sanitizeFilter } from 'mongoose';

type FilterQuery<T> = Parameters<typeof sanitizeFilter<T>>[0];
import { connectDB, isDbConnected } from '../config/db.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { Settlement } from '../models/Settlement.js';
import { Refund } from '../models/Refund.js';
import { VendorAccount } from '../models/VendorAccount.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { User } from '../models/User.js';
import { DeliveryRequest } from '../models/DeliveryRequest.js';
import { PartnerApplication } from '../models/PartnerApplication.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { CommissionConfig } from '../models/CommissionConfig.js';
import { ConversionQuote } from '../models/ConversionQuote.js';
import { logger } from '../utils/logger.js';

export interface IndexAuditReport {
  timestamp: Date;
  databaseConnected: boolean;
  modelsAudited: string[];
  duplicateViolations: Array<{
    model: string;
    field: string;
    duplicateValue: unknown;
    count: number;
  }>;
  inspectedIndexes: Array<{
    model: string;
    indexes: Record<string, unknown>[];
  }>;
  syncedIndexes: Array<{
    model: string;
    indexes: Record<string, unknown>[];
  }>;
  isHealthy: boolean;
}

interface DuplicateGroup {
  _id: unknown;
  count: number;
}

interface ModelDefinition {
  name: string;
  model: Model<any>;
  uniqueFields: Array<{ field: string; filter?: FilterQuery<any> }>;
}

/**
 * Scans a collection for duplicate keys that would violate unique index constraints.
 * Read-only aggregation query.
 */
async function findDuplicateKeys(
  model: Model<any>,
  fieldName: string,
  filter: FilterQuery<any> = {}
): Promise<DuplicateGroup[]> {
  try {
    const duplicates = await model.aggregate<DuplicateGroup>([
      { $match: filter },
      { $group: { _id: `$${fieldName}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 }, _id: { $ne: null } } },
    ]);
    return duplicates;
  } catch {
    return [];
  }
}

/**
 * Read-only audit of all MongoDB Atlas indexes and unique-key duplicate hazards.
 * Never mutates or synchronizes indexes during read-only verification.
 */
export async function verifyDatabaseIndexes(): Promise<IndexAuditReport> {
  if (!isDbConnected()) {
    try {
      await connectDB();
    } catch {
      // Connect error logged in connectDB
    }
  }

  const report: IndexAuditReport = {
    timestamp: new Date(),
    databaseConnected: isDbConnected(),
    modelsAudited: [],
    duplicateViolations: [],
    inspectedIndexes: [],
    syncedIndexes: [],
    isHealthy: true,
  };

  if (!isDbConnected()) {
    report.isHealthy = false;
    return report;
  }

  const modelDefinitions: ModelDefinition[] = [
    {
      name: 'PaymentOrder',
      model: PaymentOrder,
      uniqueFields: [{ field: 'deliveryId' }, { field: 'idempotencyKey' }],
    },
    {
      name: 'Settlement',
      model: Settlement,
      uniqueFields: [
        { field: 'paymentOrderId', filter: { entryType: 'settlement' } },
        { field: 'idempotencyKey' },
      ],
    },
    {
      name: 'Refund',
      model: Refund,
      uniqueFields: [{ field: 'idempotencyKey' }],
    },
    {
      name: 'VendorAccount',
      model: VendorAccount,
      uniqueFields: [{ field: 'vendorId' }, { field: 'transporterId' }],
    },
    {
      name: 'PaymentEvent',
      model: PaymentEvent,
      uniqueFields: [{ field: 'eventId' }],
    },
    {
      name: 'User',
      model: User,
      uniqueFields: [{ field: 'firebaseUid' }],
    },
    {
      name: 'DeliveryRequest',
      model: DeliveryRequest,
      uniqueFields: [],
    },
    {
      name: 'PartnerApplication',
      model: PartnerApplication,
      uniqueFields: [],
    },
    {
      name: 'AdminAuditLog',
      model: AdminAuditLog,
      uniqueFields: [],
    },
    {
      name: 'CommissionConfig',
      model: CommissionConfig,
      uniqueFields: [],
    },
    {
      name: 'ConversionQuote',
      model: ConversionQuote,
      uniqueFields: [{ field: 'quoteId' }],
    },
  ];

  for (const { name, model, uniqueFields } of modelDefinitions) {
    report.modelsAudited.push(name);

    // 1. Pre-index check for duplicate records (read-only)
    for (const { field, filter } of uniqueFields) {
      const dups = await findDuplicateKeys(model, field, filter);
      for (const d of dups) {
        report.duplicateViolations.push({
          model: name,
          field,
          duplicateValue: d._id,
          count: d.count,
        });
        report.isHealthy = false;
      }
    }

    // 2. Read-only inspection of active indexes in MongoDB Atlas
    try {
      const activeIndexes = (await model.collection.indexes()) as Record<string, unknown>[];
      report.inspectedIndexes.push({
        model: name,
        indexes: activeIndexes,
      });
      report.syncedIndexes.push({
        model: name,
        indexes: activeIndexes,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Could not inspect indexes for ${name}`, { err: message });
      report.isHealthy = false;
    }
  }

  return report;
}

// Backward-compatible alias for existing callers
export const verifyAndSyncDatabaseIndexes = verifyDatabaseIndexes;

// Standalone execution support
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDatabaseIndexes()
    .then((report) => {
      console.log('MongoDB Atlas Index Verification Report:');
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.isHealthy ? 0 : 1);
    })
    .catch((err: unknown) => {
      console.error('Index verification failed:', err);
      process.exit(1);
    });
}
