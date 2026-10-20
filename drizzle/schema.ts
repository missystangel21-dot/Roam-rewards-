import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Cached projections are updated in the same DB transaction as their immutable events. */
export const rewardAccounts = mysqlTable("reward_accounts", {
  userId: int("userId").primaryKey(),
  trailPointBalance: int("trailPointBalance").notNull().default(0),
  explorerXpBalance: int("explorerXpBalance").notNull().default(0),
  ledgerVersion: int("ledgerVersion").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const trailPointLedgerEntries = mysqlTable(
  "trail_point_ledger_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    points: int("points").notNull(),
    direction: mysqlEnum("direction", ["CREDIT", "DEBIT"]).notNull(),
    entryType: mysqlEnum("entryType", ["QUEST_CREDIT", "REDEMPTION_RESERVATION_DEBIT", "REDEMPTION_COMPENSATION_CREDIT", "ADMIN_CORRECTION"]).notNull(),
    sourceId: varchar("sourceId", { length: 96 }),
    redemptionRequestId: varchar("redemptionRequestId", { length: 36 }),
    idempotencyKey: varchar("idempotencyKey", { length: 36 }).notNull(),
    correlationId: varchar("correlationId", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("ix_trail_ledger_user_time").on(table.userId, table.createdAt),
    uniqueIndex("uq_trail_ledger_user_idempotency").on(table.userId, table.idempotencyKey, table.entryType),
    uniqueIndex("uq_trail_ledger_redemption_reservation").on(table.redemptionRequestId, table.entryType),
  ],
);

export const explorerXpEvents = mysqlTable(
  "explorer_xp_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    xpDelta: int("xpDelta").notNull(),
    eventType: mysqlEnum("eventType", ["SIMULATED_AD_COSMETIC", "VERIFIED_AD_COSMETIC", "COSMETIC_ADMIN_ADJUSTMENT"]).notNull(),
    sourceId: varchar("sourceId", { length: 96 }),
    idempotencyKey: varchar("idempotencyKey", { length: 36 }).notNull(),
    correlationId: varchar("correlationId", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("ix_xp_events_user_time").on(table.userId, table.createdAt),
    uniqueIndex("uq_xp_events_user_idempotency").on(table.userId, table.idempotencyKey),
    uniqueIndex("uq_xp_events_cosmetic_source").on(table.userId, table.sourceId, table.eventType),
  ],
);

export const redemptionRequests = mysqlTable(
  "redemption_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    requestedPoints: int("requestedPoints").notNull(),
    status: mysqlEnum("status", ["REQUESTED", "UNDER_REVIEW", "APPROVED", "SUBMITTED_TO_PROVIDER", "PAID", "REJECTED", "CANCELLED", "FAILED"]).notNull().default("REQUESTED"),
    idempotencyKey: varchar("idempotencyKey", { length: 36 }).notNull(),
    correlationId: varchar("correlationId", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    terminalAt: timestamp("terminalAt"),
  },
  (table) => [
    index("ix_redemption_requests_user_time").on(table.userId, table.createdAt),
    index("ix_redemption_requests_status_time").on(table.status, table.createdAt),
    uniqueIndex("uq_redemption_requests_user_idempotency").on(table.userId, table.idempotencyKey),
  ],
);

/** Immutable review decisions made by administrators. The player never writes to this table. */
export const redemptionReviewEvents = mysqlTable(
  "redemption_review_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    redemptionRequestId: varchar("redemptionRequestId", { length: 36 }).notNull(),
    adminUserId: int("adminUserId").notNull(),
    action: mysqlEnum("action", ["REVIEW_STARTED", "APPROVAL_RECORDED", "APPROVED", "REJECTED"]).notNull(),
    fromStatus: varchar("fromStatus", { length: 32 }).notNull(),
    toStatus: varchar("toStatus", { length: 32 }).notNull(),
    reasonCode: varchar("reasonCode", { length: 64 }),
    internalNote: text("internalNote"),
    idempotencyKey: varchar("idempotencyKey", { length: 36 }).notNull(),
    correlationId: varchar("correlationId", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("ix_redemption_review_events_request_time").on(table.redemptionRequestId, table.createdAt),
    uniqueIndex("uq_redemption_review_events_idempotency").on(table.redemptionRequestId, table.idempotencyKey),
  ],
);

export type RewardAccount = typeof rewardAccounts.$inferSelect;
export type TrailPointLedgerEntry = typeof trailPointLedgerEntries.$inferSelect;
export type ExplorerXpEvent = typeof explorerXpEvents.$inferSelect;
export type RedemptionRequest = typeof redemptionRequests.$inferSelect;
export type RedemptionReviewEvent = typeof redemptionReviewEvents.$inferSelect;

/** Immutable results received from the protected GitHub Android release workflow. */
export const androidVerificationResults = mysqlTable(
  "android_verification_results",
  {
    id: int("id").autoincrement().primaryKey(),
    status: mysqlEnum("status", ["VERIFIED", "FAILED", "PENDING"]).notNull(),
    packageName: varchar("packageName", { length: 255 }).notNull(),
    certificateSha256: varchar("certificateSha256", { length: 95 }).notNull(),
    apkSha256: varchar("apkSha256", { length: 64 }).notNull(),
    releaseTag: varchar("releaseTag", { length: 128 }),
    verifiedAt: timestamp("verifiedAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("ix_android_verification_status_time").on(table.status, table.verifiedAt),
    index("ix_android_verification_time").on(table.verifiedAt),
  ],
);

export type AndroidVerificationResultRow = typeof androidVerificationResults.$inferSelect;
