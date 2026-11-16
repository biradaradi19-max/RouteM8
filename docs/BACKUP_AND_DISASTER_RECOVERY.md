# RouteM8 — Backup & Disaster Recovery Runbook

This document defines the operational procedures for data backup, corruption remediation, and disaster recovery under RouteM8's free-tier infrastructure.

---

## 1. MongoDB Atlas M0 Tier Backup Limitations

> [!WARNING]
> **No Automated Cloud Backups on M0 Free Tier**
> MongoDB Atlas M0 (Shared Cluster) **does NOT include automated point-in-time recovery (PITR), scheduled continuous cloud backups, or automated snapshot restorations**. These are reserved for Atlas M10+ dedicated tiers.
>
> **Operational Rule**: Never assume a backup exists unless manually exported and verified.

---

## 2. Manual Export & Backup Procedures

### A. Full Database Binary Dump via `mongodump`

For a complete schema and BSON data dump of all collections:

```bash
# Set connection string (redacted example)
export MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/routem8?retryWrites=true&w=majority"
export BACKUP_DIR="./backups/$(date +%Y-%m-%d_%H%M%S)"

# Run mongodump with gzip compression
mongodump --uri="$MONGODB_URI" --gzip --out="$BACKUP_DIR"

# Verify backup integrity
ls -la "$BACKUP_DIR/routem8"
```

### B. Targeted Financial Collections Export via `mongoexport`

To export human-readable JSON lines (JSONL) of financial ledgers for audits:

```bash
# Export PaymentOrders
mongoexport --uri="$MONGODB_URI" --collection=paymentorders --out="./backups/financial/paymentorders.jsonl"

# Export Settlements
mongoexport --uri="$MONGODB_URI" --collection=settlements --out="./backups/financial/settlements.jsonl"

# Export Refunds
mongoexport --uri="$MONGODB_URI" --collection=refunds --out="./backups/financial/refunds.jsonl"

# Export Vendor Accounts
mongoexport --uri="$MONGODB_URI" --collection=vendoraccounts --out="./backups/financial/vendoraccounts.jsonl"

# Export Payment Webhook Events
mongoexport --uri="$MONGODB_URI" --collection=paymentevents --out="./backups/financial/paymentevents.jsonl"
```

---

## 3. Restoration Procedures

### A. Full Cluster Restoration via `mongorestore`

```bash
# Restore entire database from gzipped dump (preserves indexes)
mongorestore --uri="$MONGODB_URI" --gzip --drop "$BACKUP_DIR"
```

> [!CAUTION]
> The `--drop` flag will delete existing collections before restoring. Only use `--drop` during disaster recovery of a corrupted cluster.

### B. Targeted Collection Restoration via `mongoimport`

```bash
# Restore specific collection without dropping entire DB
mongoimport --uri="$MONGODB_URI" --collection=settlements --file="./backups/financial/settlements.jsonl" --mode=upsert --upsertFields="_id"
```

---

## 4. Disaster Recovery & Data Corruption Protocols

### Scenario 1: Stuck Intermediate Financial State (`split_pending`)
If a Node process crashes while a payout is being executed, an order may be left in `split_pending`.
- **Automated Fix**: Trigger the admin recovery sweep:
  ```bash
  curl -X POST "https://route-m8.vercel.app/api/payments/recover" \
    -H "Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>"
  ```
- **Result**: The recovery engine queries the provider authoritative status:
  - If the payout was completed at the provider, the order transitions to `settled`.
  - If the payout was not completed, the `split_pending` lock is safely released back to `paid` or `partially_refunded` so it can be retried.

### Scenario 2: Indeterminate Refund Reservation (`processing`)
If a network timeout occurs during buyer refund processing:
- The reservation is preserved on `PaymentOrder` to prevent over-refunds.
- Run `/api/payments/recover` to query the provider. If the refund failed or never executed at the provider, the reservation is safely restored to the customer's balance.

### Scenario 3: Accidental Database Deletion or Corruption
1. Immediately isolate traffic by setting `MAINTENANCE_MODE=true` on Vercel environment variables.
2. Locate the most recent verified manual backup directory (`./backups/<timestamp>`).
3. Execute `mongorestore --uri="$MONGODB_URI" --gzip --drop <backup_path>`.
4. Run the index verification script to re-validate and synchronize indexes:
   ```bash
   npx tsx server/scripts/verifyIndexes.ts
   ```
5. Run the financial reconciliation sweep:
   ```bash
   curl -X GET "https://route-m8.vercel.app/api/payments/reconciliation" \
     -H "Authorization: Bearer <ADMIN_FIREBASE_ID_TOKEN>"
   ```
6. Verify `summary.isClean === true` before reopening public traffic.

