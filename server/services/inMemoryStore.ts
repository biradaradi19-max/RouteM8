// Shared in-memory state stores for tests and offline mocks
// Decouples route circular dependencies across ESM modules

export const inMemoryApplications = new Map<string, any>();
export const inMemoryAuditLogs: any[] = [];
export const inMemoryPaymentOrders = new Map<string, any>();
export const inMemoryWebhookEvents = new Set<string>();
export const inMemorySettlements = new Map<string, any>();
export const inMemoryRefunds = new Map<string, any>();
export const inMemoryVendors = new Map<string, any>();
export const inMemorySettlementLocks = new Set<string>();
export const inMemoryDiscrepancies = new Map<string, any>();

