import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as db from "./db";
import { adminProcedure, adminRateLimiter, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { adminRateLimitMetrics, type OffenderWindow } from "./_core/admin-rate-limit-metrics";
import { getAndroidVerificationStatus } from "./_core/android-release-verification";
import { approvalReasonCodes, rejectionReasonCodes, reviewerReasonCodeTemplates } from "./redemption-review-rules";
import { validateRejectionInternalNote } from "./rejection-note-rules";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  rewards: router({
    summary: protectedProcedure.query(({ ctx }) => db.getRewardSummary(ctx.user.id)),
    trailPointLedger: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).default({ limit: 25 }))
      .query(({ ctx, input }) => db.getTrailPointLedger(ctx.user.id, input.limit)),
    explorerXpActivity: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).default({ limit: 25 }))
      .query(({ ctx, input }) => db.getExplorerXpActivity(ctx.user.id, input.limit)),
    requestSimulatedRedemption: protectedProcedure
      .input(z.object({ requestedPoints: z.number().int().positive().max(25_000), idempotencyKey: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          const correlationId = crypto.randomUUID();
          const result = await db.createSimulatedRedemptionRequest({ userId: ctx.user.id, ...input, correlationId });
          return { redemptionId: result.request.id, status: result.request.status, requestedPoints: result.request.requestedPoints, idempotent: result.idempotent, payoutMode: "SIMULATED_ONLY" as const };
        } catch (error) {
          if (error instanceof db.RewardTransactionError) {
            const messages = {
              DATABASE_UNAVAILABLE: "Rewards are temporarily unavailable.",
              INSUFFICIENT_TRAIL_POINTS: "You do not have enough available Trail Points.",
              INVALID_REDEMPTION_AMOUNT: "Redemptions must use a positive whole cash-equivalent amount.",
              REDEMPTION_MINIMUM_NOT_MET: "This request is below the redemption minimum.",
              REDEMPTION_NOT_FOUND: "The redemption request was not found.",
              INVALID_REDEMPTION_STATE: "This redemption request cannot be changed in its current state.",
            } as const;
            throw new TRPCError({ code: error.code === "DATABASE_UNAVAILABLE" ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST", message: messages[error.code] });
          }
          throw error;
        }
      }),
  }),

  adminRedemptions: router({
    metrics: adminProcedure
      .input(z.object({ offenderWindow: z.enum(["FIFTEEN_MINUTES", "ONE_HOUR", "TWENTY_FOUR_HOURS", "SEVEN_DAYS", "THIRTY_DAYS"]).default("SEVEN_DAYS") }).optional())
      .query(({ input }) => adminRateLimitMetrics.snapshot((input?.offenderWindow ?? "SEVEN_DAYS") as OffenderWindow)),
    androidReleaseVerification: adminProcedure.query(() => {
      return getAndroidVerificationStatus();
    }),
    privacySettings: adminProcedure.query(() => adminRateLimitMetrics.getPrivacySettings()),
    privacyAudit: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(10), page: z.number().int().min(0).default(0), dateFrom: z.string().datetime().optional(), dateTo: z.string().datetime().optional() }).optional())
      .query(({ input }) => adminRateLimitMetrics.auditEvents({ limit: input?.limit ?? 10, page: input?.page ?? 0, dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input?.dateTo ? new Date(input.dateTo) : undefined })),
    updatePrivacySettings: adminProcedure
      .input(z.object({ retentionDays: z.number().int().min(1).max(30).optional(), identifierVisibility: z.enum(["MASKED", "FULL"]).optional(), spikeThreshold: z.number().int().min(1).max(1_000_000).optional(), spikeMultiplier: z.number().min(1).max(100).optional() }))
      .mutation(({ ctx, input }) => adminRateLimitMetrics.updatePrivacySettings(ctx.user.id, input)),
    simulateRateLimitTraffic: adminProcedure
      .input(z.object({ requests: z.number().int().min(1).max(100), keySuffix: z.string().min(1).max(64).optional() }))
      .mutation(async ({ ctx, input }) => {
        const key = `simulation:${ctx.user.id}:${input.keySuffix ?? "default"}`;
        const decisions = [];
        for (let index = 0; index < input.requests; index += 1) {
          decisions.push(await adminRateLimiter.consume(key));
        }
        return {
          requests: input.requests,
          allowed: decisions.filter((decision) => decision.allowed).length,
          denied: decisions.filter((decision) => !decision.allowed).length,
          retryAfterMs: Math.max(...decisions.map((decision) => decision.retryAfterMs)),
        };
      }),
    reasonCodeTemplates: adminProcedure.query(() => reviewerReasonCodeTemplates),
    queue: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).default({ limit: 25 }))
      .query(({ input }) => db.getAdminRedemptionQueue(input.limit)),
    providerFailures: adminProcedure
      .input(z.object({ since: z.string().datetime(), limit: z.number().int().min(1).max(25).default(10), severity: z.enum(["ALL", "CRITICAL", "STANDARD"]).default("ALL"), dateWindow: z.enum(["ALL", "FIVE_MINUTES", "FIFTEEN_MINUTES"]).default("ALL"), cursor: z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(128) }).optional() }))
      .query(({ input }) => db.getAdminProviderFailures(new Date(input.since), input.limit, input.cursor ? { createdAt: new Date(input.cursor.createdAt), id: input.cursor.id } : undefined, { severity: input.severity, dateWindow: input.dateWindow })),
    startReview: adminProcedure
      .input(z.object({ redemptionRequestId: z.string().uuid(), idempotencyKey: z.string().uuid() }))
      .mutation(({ ctx, input }) => handleAdminTransition(() => db.startRedemptionReview({ ...input, adminUserId: ctx.user.id, correlationId: crypto.randomUUID() }))),
    approve: adminProcedure
      .input(z.object({ redemptionRequestId: z.string().uuid(), idempotencyKey: z.string().uuid(), reasonCode: z.enum(approvalReasonCodes) }))
      .mutation(({ ctx, input }) => handleAdminTransition(() => db.approveRedemptionRequest({ ...input, adminUserId: ctx.user.id, correlationId: crypto.randomUUID() }))),
    reject: adminProcedure
      .input(z.object({ redemptionRequestId: z.string().uuid(), idempotencyKey: z.string().uuid(), reasonCode: z.enum(rejectionReasonCodes), internalNote: z.string().max(2_000).optional() }))
      .mutation(({ ctx, input }) => {
        const validation = validateRejectionInternalNote(input.reasonCode, input.internalNote);
        if (!validation.ok) {
          const messages = {
            INTERNAL_NOTE_REQUIRED: "Add an internal note explaining the risk-related decision before rejecting this request.",
            INTERNAL_NOTE_TOO_SHORT: "The internal note must be at least 20 characters.",
            INTERNAL_NOTE_TOO_LONG: "The internal note is too long.",
            INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA: "Remove sensitive payment, identity, or credential data from the internal note.",
            OK: "",
          } as const;
          throw new TRPCError({ code: "BAD_REQUEST", message: messages[validation.code] });
        }
        return handleAdminTransition(() => db.rejectRedemptionRequest({ ...input, internalNote: validation.normalizedNote ?? undefined, adminUserId: ctx.user.id, correlationId: crypto.randomUUID() }));
      }),
  }),

});

async function handleAdminTransition(operation: () => Promise<{ request: { id: string; status: string; requestedPoints: number }; idempotent: boolean; approvalCount?: number; requiredApprovals?: number }>) {
  try {
    const result = await operation();
    return { redemptionId: result.request.id, status: result.request.status, requestedPoints: result.request.requestedPoints, idempotent: result.idempotent, approvalCount: result.approvalCount, requiredApprovals: result.requiredApprovals, payoutMode: "SIMULATED_ONLY" as const };
  } catch (error) {
    if (error instanceof db.RewardTransactionError) {
      const messages = {
        DATABASE_UNAVAILABLE: "Redemption review is temporarily unavailable.",
        INSUFFICIENT_TRAIL_POINTS: "The request cannot be reviewed because its reserved balance is unavailable.",
        INVALID_REDEMPTION_AMOUNT: "The request amount is invalid.",
        REDEMPTION_MINIMUM_NOT_MET: "The request amount is below the configured minimum.",
        REDEMPTION_NOT_FOUND: "The redemption request was not found.",
        INVALID_REDEMPTION_STATE: "This redemption request cannot move through that review transition.",
      } as const;
      throw new TRPCError({ code: error.code === "DATABASE_UNAVAILABLE" ? "INTERNAL_SERVER_ERROR" : "CONFLICT", message: messages[error.code] });
    }
    throw error;
  }
}

export type AppRouter = typeof appRouter;
