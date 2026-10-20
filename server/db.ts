import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { androidVerificationResults, explorerXpEvents, InsertUser, redemptionRequests, redemptionReviewEvents, rewardAccounts, trailPointLedgerEntries, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getAdminRedemptionTransition, getApprovalDecision, type RedemptionStatus } from "./redemption-review-rules";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

const POINTS_PER_DOLLAR = 100;
const SIMULATED_REDEMPTION_MINIMUM = 500;
const EXPLORER_XP_PER_LEVEL = 100;

export async function insertAndroidVerificationResult(input: { status: "VERIFIED" | "FAILED" | "PENDING"; packageName: string; certificateSha256: string; apkSha256: string; releaseTag: string | null; verifiedAt: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(androidVerificationResults).values({ ...input, verifiedAt: new Date(input.verifiedAt) });
  return true;
}

export async function getAndroidVerificationHistory(input: { limit: number; page: number; status?: "VERIFIED" | "FAILED" | "PENDING"; dateFrom?: Date; dateTo?: Date }) {
  const db = await getDb();
  if (!db) return null;
  const filters = [
    input.status ? eq(androidVerificationResults.status, input.status) : undefined,
    input.dateFrom ? gte(androidVerificationResults.verifiedAt, input.dateFrom) : undefined,
    input.dateTo ? lt(androidVerificationResults.verifiedAt, input.dateTo) : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  const rows = await db
    .select({ status: androidVerificationResults.status, packageName: androidVerificationResults.packageName, apkSha256: androidVerificationResults.apkSha256, releaseTag: androidVerificationResults.releaseTag, verifiedAt: androidVerificationResults.verifiedAt })
    .from(androidVerificationResults)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(androidVerificationResults.verifiedAt), desc(androidVerificationResults.id))
    .limit(input.limit + 1)
    .offset(input.page * input.limit);
  const hasMore = rows.length > input.limit;
  return { items: rows.slice(0, input.limit).map((row) => ({ ...row, verifiedAt: row.verifiedAt.toISOString() })), hasMore };
}

export class RewardTransactionError extends Error {
  constructor(public readonly code: "INSUFFICIENT_TRAIL_POINTS" | "REDEMPTION_MINIMUM_NOT_MET" | "INVALID_REDEMPTION_AMOUNT" | "DATABASE_UNAVAILABLE" | "REDEMPTION_NOT_FOUND" | "INVALID_REDEMPTION_STATE") {
    super(code);
  }
}

function calculateLevelProgress(totalXp: number) {
  const safeXp = Math.max(0, totalXp);
  const level = Math.floor(safeXp / EXPLORER_XP_PER_LEVEL) + 1;
  const currentLevelXp = safeXp % EXPLORER_XP_PER_LEVEL;
  return {
    totalXp: safeXp,
    level,
    currentLevelXp,
    xpPerLevel: EXPLORER_XP_PER_LEVEL,
    remainingXp: EXPLORER_XP_PER_LEVEL - currentLevelXp,
    cashValue: null,
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new RewardTransactionError("DATABASE_UNAVAILABLE");
  return db;
}

async function ensureRewardAccount(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  if (!db) throw new RewardTransactionError("DATABASE_UNAVAILABLE");
  await db.insert(rewardAccounts).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
}

export async function getRewardSummary(userId: number) {
  const db = await requireDb();
  await ensureRewardAccount(db, userId);
  const account = (await db.select().from(rewardAccounts).where(eq(rewardAccounts.userId, userId)).limit(1))[0];
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayCredits = await db
    .select({ total: sql<number>`coalesce(sum(case when ${trailPointLedgerEntries.direction} = 'CREDIT' then ${trailPointLedgerEntries.points} else 0 end), 0)` })
    .from(trailPointLedgerEntries)
    .where(and(eq(trailPointLedgerEntries.userId, userId), gte(trailPointLedgerEntries.createdAt, todayStart)));
  const availablePoints = account?.trailPointBalance ?? 0;
  return {
    trailPoints: {
      availablePoints,
      todayEarnedPoints: Number(todayCredits[0]?.total ?? 0),
      dailyCapPoints: 250,
      displayedConversion: { pointsPerDollar: POINTS_PER_DOLLAR, displayedCashEquivalent: (availablePoints / POINTS_PER_DOLLAR).toFixed(2) },
      redemptionMinimumPoints: SIMULATED_REDEMPTION_MINIMUM,
    },
    explorerXp: calculateLevelProgress(account?.explorerXpBalance ?? 0),
    payoutMode: "SIMULATED_ONLY" as const,
  };
}

export async function getTrailPointLedger(userId: number, limit: number) {
  const db = await requireDb();
  return db.select().from(trailPointLedgerEntries).where(eq(trailPointLedgerEntries.userId, userId)).orderBy(desc(trailPointLedgerEntries.createdAt)).limit(limit);
}

export async function getExplorerXpActivity(userId: number, limit: number) {
  const db = await requireDb();
  const events = await db.select().from(explorerXpEvents).where(eq(explorerXpEvents.userId, userId)).orderBy(desc(explorerXpEvents.createdAt)).limit(limit);
  const account = (await db.select().from(rewardAccounts).where(eq(rewardAccounts.userId, userId)).limit(1))[0];
  return { events, progress: calculateLevelProgress(account?.explorerXpBalance ?? 0) };
}

/**
 * Internal-only hook for a server-verified advertising completion. Do not expose this through a player tRPC procedure.
 * It updates cosmetic XP only; no Trail Points, redemption rows, or payout values are touched.
 */
export async function grantCosmeticXpForVerifiedAd(input: { userId: number; sourceId: string; idempotencyKey: string; correlationId: string; xpDelta: number }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(explorerXpEvents).where(and(eq(explorerXpEvents.userId, input.userId), eq(explorerXpEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing[0]) return { idempotent: true, event: existing[0] };
    await tx.insert(rewardAccounts).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
    await tx.insert(explorerXpEvents).values({ id: crypto.randomUUID(), userId: input.userId, xpDelta: input.xpDelta, eventType: "VERIFIED_AD_COSMETIC", sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    await tx.update(rewardAccounts).set({ explorerXpBalance: sql`${rewardAccounts.explorerXpBalance} + ${input.xpDelta}`, ledgerVersion: sql`${rewardAccounts.ledgerVersion} + 1` }).where(eq(rewardAccounts.userId, input.userId));
    return { idempotent: false };
  });
}

export async function createSimulatedRedemptionRequest(input: { userId: number; requestedPoints: number; idempotencyKey: string; correlationId: string }) {
  if (input.requestedPoints % POINTS_PER_DOLLAR !== 0 || input.requestedPoints <= 0) throw new RewardTransactionError("INVALID_REDEMPTION_AMOUNT");
  if (input.requestedPoints < SIMULATED_REDEMPTION_MINIMUM) throw new RewardTransactionError("REDEMPTION_MINIMUM_NOT_MET");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(redemptionRequests).where(and(eq(redemptionRequests.userId, input.userId), eq(redemptionRequests.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing[0]) return { request: existing[0], idempotent: true };

    await tx.insert(rewardAccounts).values({ userId: input.userId }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
    const requestId = crypto.randomUUID();
    const debit = await tx
      .update(rewardAccounts)
      .set({ trailPointBalance: sql`${rewardAccounts.trailPointBalance} - ${input.requestedPoints}`, ledgerVersion: sql`${rewardAccounts.ledgerVersion} + 1` })
      .where(and(eq(rewardAccounts.userId, input.userId), gte(rewardAccounts.trailPointBalance, input.requestedPoints)));
    if (debit[0].affectedRows !== 1) throw new RewardTransactionError("INSUFFICIENT_TRAIL_POINTS");

    await tx.insert(redemptionRequests).values({ id: requestId, userId: input.userId, requestedPoints: input.requestedPoints, status: "REQUESTED", idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    await tx.insert(trailPointLedgerEntries).values({ id: crypto.randomUUID(), userId: input.userId, points: input.requestedPoints, direction: "DEBIT", entryType: "REDEMPTION_RESERVATION_DEBIT", redemptionRequestId: requestId, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    const request = (await tx.select().from(redemptionRequests).where(eq(redemptionRequests.id, requestId)).limit(1))[0];
    return { request, idempotent: false };
  });
}

export async function getAdminRedemptionQueue(limit: number) {
  const db = await requireDb();
  return db.select().from(redemptionRequests).where(inArray(redemptionRequests.status, ["REQUESTED", "UNDER_REVIEW"])).orderBy(redemptionRequests.createdAt).limit(limit);
}

export async function startRedemptionReview(input: { redemptionRequestId: string; adminUserId: number; idempotencyKey: string; correlationId: string }) {
  return transitionRedemptionForAdmin({ ...input, action: "REVIEW_STARTED", requiredStatuses: ["REQUESTED"], nextStatus: "UNDER_REVIEW" });
}

export async function approveRedemptionRequest(input: { redemptionRequestId: string; adminUserId: number; idempotencyKey: string; correlationId: string; reasonCode: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existingReview = await tx.select().from(redemptionReviewEvents).where(and(eq(redemptionReviewEvents.redemptionRequestId, input.redemptionRequestId), eq(redemptionReviewEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    const request = (await tx.select().from(redemptionRequests).where(eq(redemptionRequests.id, input.redemptionRequestId)).limit(1))[0];
    if (!request) throw new RewardTransactionError("REDEMPTION_NOT_FOUND");
    if (existingReview[0]) return { request, idempotent: true, approvalCount: 0, requiredApprovals: request.requestedPoints >= 5_000 ? 2 : 1 };

    const priorApprovals = await tx.select({ adminUserId: redemptionReviewEvents.adminUserId }).from(redemptionReviewEvents).where(and(eq(redemptionReviewEvents.redemptionRequestId, request.id), eq(redemptionReviewEvents.action, "APPROVAL_RECORDED")));
    const decision = getApprovalDecision({ fromStatus: request.status as RedemptionStatus, requestedPoints: request.requestedPoints, priorApprovalAdminIds: priorApprovals.map((event) => event.adminUserId), actingAdminUserId: input.adminUserId });
    if (!decision) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");

    if (decision.toStatus !== request.status) {
      const requestUpdate = await tx.update(redemptionRequests).set({ status: decision.toStatus }).where(and(eq(redemptionRequests.id, request.id), eq(redemptionRequests.status, request.status)));
      if (requestUpdate[0].affectedRows !== 1) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");
    }
    await tx.insert(redemptionReviewEvents).values({ id: crypto.randomUUID(), redemptionRequestId: request.id, adminUserId: input.adminUserId, action: decision.action, fromStatus: request.status, toStatus: decision.toStatus, reasonCode: input.reasonCode, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    return { request: { ...request, status: decision.toStatus }, idempotent: false, approvalCount: decision.approvalCount, requiredApprovals: decision.requiredApprovals };
  });
}

export async function rejectRedemptionRequest(input: { redemptionRequestId: string; adminUserId: number; idempotencyKey: string; correlationId: string; reasonCode: string; internalNote?: string }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existingReview = await tx.select().from(redemptionReviewEvents).where(and(eq(redemptionReviewEvents.redemptionRequestId, input.redemptionRequestId), eq(redemptionReviewEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    const request = (await tx.select().from(redemptionRequests).where(eq(redemptionRequests.id, input.redemptionRequestId)).limit(1))[0];
    if (!request) throw new RewardTransactionError("REDEMPTION_NOT_FOUND");
    if (existingReview[0]) return { request, idempotent: true };
    const transition = getAdminRedemptionTransition(request.status as RedemptionStatus, "REJECTED");
    if (!transition) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");

    const requestUpdate = await tx.update(redemptionRequests).set({ status: transition.toStatus, terminalAt: new Date() }).where(and(eq(redemptionRequests.id, request.id), eq(redemptionRequests.status, request.status)));
    if (requestUpdate[0].affectedRows !== 1) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");
    const accountUpdate = await tx.update(rewardAccounts).set({ trailPointBalance: sql`${rewardAccounts.trailPointBalance} + ${request.requestedPoints}`, ledgerVersion: sql`${rewardAccounts.ledgerVersion} + 1` }).where(eq(rewardAccounts.userId, request.userId));
    if (accountUpdate[0].affectedRows !== 1) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");
    await tx.insert(trailPointLedgerEntries).values({ id: crypto.randomUUID(), userId: request.userId, points: request.requestedPoints, direction: "CREDIT", entryType: "REDEMPTION_COMPENSATION_CREDIT", redemptionRequestId: request.id, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    await tx.insert(redemptionReviewEvents).values({ id: crypto.randomUUID(), redemptionRequestId: request.id, adminUserId: input.adminUserId, action: "REJECTED", fromStatus: request.status, toStatus: transition.toStatus, reasonCode: input.reasonCode, internalNote: input.internalNote ?? null, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    return { request: { ...request, status: transition.toStatus, terminalAt: new Date() }, idempotent: false };
  });
}

async function transitionRedemptionForAdmin(input: { redemptionRequestId: string; adminUserId: number; idempotencyKey: string; correlationId: string; action: "REVIEW_STARTED"; requiredStatuses: readonly ["REQUESTED"]; nextStatus: "UNDER_REVIEW" }) {
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const existingReview = await tx.select().from(redemptionReviewEvents).where(and(eq(redemptionReviewEvents.redemptionRequestId, input.redemptionRequestId), eq(redemptionReviewEvents.idempotencyKey, input.idempotencyKey))).limit(1);
    const request = (await tx.select().from(redemptionRequests).where(eq(redemptionRequests.id, input.redemptionRequestId)).limit(1))[0];
    if (!request) throw new RewardTransactionError("REDEMPTION_NOT_FOUND");
    if (existingReview[0]) return { request, idempotent: true };
    const transition = getAdminRedemptionTransition(request.status as RedemptionStatus, input.action);
    if (!transition || transition.toStatus !== input.nextStatus || request.status !== "REQUESTED") throw new RewardTransactionError("INVALID_REDEMPTION_STATE");

    const requestUpdate = await tx.update(redemptionRequests).set({ status: input.nextStatus }).where(and(eq(redemptionRequests.id, request.id), eq(redemptionRequests.status, request.status)));
    if (requestUpdate[0].affectedRows !== 1) throw new RewardTransactionError("INVALID_REDEMPTION_STATE");
    await tx.insert(redemptionReviewEvents).values({ id: crypto.randomUUID(), redemptionRequestId: request.id, adminUserId: input.adminUserId, action: input.action, fromStatus: request.status, toStatus: input.nextStatus, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    return { request: { ...request, status: input.nextStatus }, idempotent: false };
  });
}

export async function getAdminProviderFailures(since: Date, limit: number, cursor?: { createdAt: Date; id: string }, filters: { severity: "ALL" | "CRITICAL" | "STANDARD"; dateWindow: "ALL" | "FIVE_MINUTES" | "FIFTEEN_MINUTES" } = { severity: "ALL", dateWindow: "ALL" }) {
  const db = await requireDb();
  const dateWindowMs = filters.dateWindow === "FIVE_MINUTES" ? 5 * 60_000 : filters.dateWindow === "FIFTEEN_MINUTES" ? 15 * 60_000 : null;
  const effectiveSince = dateWindowMs === null ? since : new Date(Math.max(since.getTime(), Date.now() - dateWindowMs));
  const severityCondition = filters.severity === "CRITICAL" ? gte(redemptionRequests.requestedPoints, 5_000) : filters.severity === "STANDARD" ? lt(redemptionRequests.requestedPoints, 5_000) : undefined;
  const cursorCondition = cursor
    ? or(lt(redemptionRequests.createdAt, cursor.createdAt), and(eq(redemptionRequests.createdAt, cursor.createdAt), lt(redemptionRequests.id, cursor.id)))
    : undefined;
  const rows = await db
    .select({
      id: redemptionRequests.id,
      requestedPoints: redemptionRequests.requestedPoints,
      status: redemptionRequests.status,
      correlationId: redemptionRequests.correlationId,
      createdAt: redemptionRequests.createdAt,
    })
    .from(redemptionRequests)
    .where(and(eq(redemptionRequests.status, "FAILED"), gte(redemptionRequests.createdAt, effectiveSince), severityCondition, cursorCondition))
    .orderBy(desc(redemptionRequests.createdAt), desc(redemptionRequests.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: new Date(last.createdAt).toISOString(), id: last.id } : null,
  };
}
