import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle/schema";
import * as db from "../server/db";
import { appRouter } from "../server/routers";
import { getAdminRateLimitOptionsFromEnv } from "../server/_core/admin-rate-limit";
import { adminRateLimiter } from "../server/_core/trpc";
import type { TrpcContext } from "../server/_core/context";

const now = new Date("2026-09-19T05:00:00.000Z");

function makeUser(role: User["role"], id: number): User {
  return {
    id,
    openId: `${role}-test-user-${id}`,
    name: role === "admin" ? "Test Admin" : "Test Player",
    email: `${role}-${id}@example.test`,
    loginMethod: "vitest",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

function makeContext(user: User | null): TrpcContext {
  return {
    user,
    // The authorization procedures do not inspect req/res, so lightweight
    // test doubles keep this test independent of Express.
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("tRPC authentication and authorization procedures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    adminRateLimiter.configure(getAdminRateLimitOptionsFromEnv());
  });

  it("returns UNAUTHORIZED for an unauthenticated protected procedure", async () => {
    const caller = appRouter.createCaller(makeContext(null));

    await expect(caller.rewards.summary()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Please login (10001)",
    });
  });

  it("allows a regular authenticated user through protectedProcedure", async () => {
    const summary = {
      trailPoints: {
        availablePoints: 125,
        todayEarnedPoints: 25,
        dailyCapPoints: 250,
        displayedConversion: {
          pointsPerDollar: 100,
          displayedCashEquivalent: "1.25",
        },
        redemptionMinimumPoints: 500,
      },
      explorerXp: {
        totalXp: 40,
        level: 1,
        currentLevelXp: 40,
        xpPerLevel: 100,
        remainingXp: 60,
        cashValue: null,
      },
      payoutMode: "SIMULATED_ONLY" as const,
    };
    const summarySpy = vi.spyOn(db, "getRewardSummary").mockResolvedValue(summary);
    const caller = appRouter.createCaller(makeContext(makeUser("user", 101)));

    await expect(caller.rewards.summary()).resolves.toEqual(summary);
    expect(summarySpy).toHaveBeenCalledWith(101);
  });

  it("returns FORBIDDEN for an unauthenticated admin procedure", async () => {
    const caller = appRouter.createCaller(makeContext(null));

    await expect(
      caller.adminRedemptions.providerFailures({
        since: now.toISOString(),
        limit: 10,
        severity: "ALL",
        dateWindow: "ALL",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have required permission (10002)",
    });
  });

  it("returns FORBIDDEN for a regular authenticated user calling Provider Alerts", async () => {
    const providerFailuresSpy = vi.spyOn(db, "getAdminProviderFailures");
    const caller = appRouter.createCaller(makeContext(makeUser("user", 102)));

    await expect(
      caller.adminRedemptions.providerFailures({
        since: now.toISOString(),
        limit: 10,
        severity: "ALL",
        dateWindow: "ALL",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have required permission (10002)",
    });

    expect(providerFailuresSpy).not.toHaveBeenCalled();
  });

  it("allows an admin to reach Provider Alerts and forwards the query", async () => {
    const result = {
      items: [],
      hasMore: false,
      nextCursor: null,
    };
    const providerFailuresSpy = vi
      .spyOn(db, "getAdminProviderFailures")
      .mockResolvedValue(result);
    const caller = appRouter.createCaller(makeContext(makeUser("admin", 103)));
    const input = {
      since: now.toISOString(),
      limit: 10,
      severity: "CRITICAL" as const,
      dateWindow: "FIVE_MINUTES" as const,
    };

    await expect(caller.adminRedemptions.providerFailures(input)).resolves.toEqual(result);
    expect(providerFailuresSpy).toHaveBeenCalledOnce();
    expect(providerFailuresSpy).toHaveBeenCalledWith(
      now,
      10,
      undefined,
      { severity: "CRITICAL", dateWindow: "FIVE_MINUTES" },
    );
  });

  it("propagates a TIMEOUT when an authorized admin Provider Alerts request exceeds its data-source deadline", async () => {
    const timeout = new TRPCError({
      code: "TIMEOUT",
      message: "Provider alert query timed out",
    });
    const providerFailuresSpy = vi
      .spyOn(db, "getAdminProviderFailures")
      .mockRejectedValue(timeout);
    const caller = appRouter.createCaller(makeContext(makeUser("admin", 105)));

    await expect(
      caller.adminRedemptions.providerFailures({
        since: now.toISOString(),
        limit: 10,
        severity: "ALL",
        dateWindow: "ALL",
      }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Provider alert query timed out",
    });

    expect(providerFailuresSpy).toHaveBeenCalledOnce();
  });

  it("returns TOO_MANY_REQUESTS and then admits traffic as the sliding window moves", async () => {
    vi.useFakeTimers({ now });
    adminRateLimiter.configure({ maxRequests: 2, windowMs: 100 });
    vi.spyOn(db, "getAdminProviderFailures").mockResolvedValue({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    const caller = appRouter.createCaller(makeContext(makeUser("admin", 106)));
    const input = {
      since: now.toISOString(),
      limit: 10,
      severity: "ALL" as const,
      dateWindow: "ALL" as const,
    };

    await expect(caller.adminRedemptions.providerFailures(input)).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    await expect(caller.adminRedemptions.providerFailures(input)).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });

    await expect(caller.adminRedemptions.providerFailures(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("Too many admin API requests"),
    });

    vi.advanceTimersByTime(101);
    await expect(caller.adminRedemptions.providerFailures(input)).resolves.toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("exposes metrics and simulator results only through the admin procedure", async () => {
    adminRateLimiter.configure({ maxRequests: 10, windowMs: 60_000 });
    const adminCaller = appRouter.createCaller(makeContext(makeUser("admin", 107)));
    const userCaller = appRouter.createCaller(makeContext(makeUser("user", 108)));

    await expect(adminCaller.adminRedemptions.metrics()).resolves.toMatchObject({
      allowedRequests: expect.any(Number),
      deniedRequests: expect.any(Number),
      recentRedisLatencyMs: expect.any(Array),
    });
    await expect(adminCaller.adminRedemptions.metrics({ offenderWindow: "FIFTEEN_MINUTES" })).resolves.toMatchObject({ offenderWindow: "FIFTEEN_MINUTES" });
    await expect(adminCaller.adminRedemptions.metrics({ offenderWindow: "THIRTY_DAYS" })).resolves.toMatchObject({ offenderWindow: "THIRTY_DAYS" });
    await expect(adminCaller.adminRedemptions.simulateRateLimitTraffic({ requests: 4 })).resolves.toMatchObject({
      requests: 4,
      allowed: 4,
      denied: 0,
    });
    await expect(userCaller.adminRedemptions.metrics()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userCaller.adminRedemptions.simulateRateLimitTraffic({ requests: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("exposes APK identity verification status only to admins", async () => {
    const previousStatus = process.env.APK_IDENTITY_VERIFICATION_STATUS;
    const previousCertificate = process.env.EXPECTED_CERT_SHA256;
    process.env.APK_IDENTITY_VERIFICATION_STATUS = "VERIFIED";
    process.env.EXPECTED_CERT_SHA256 = "AA:BB:CC";
    try {
      const adminCaller = appRouter.createCaller(makeContext(makeUser("admin", 113)));
      const userCaller = appRouter.createCaller(makeContext(makeUser("user", 114)));
      await expect(adminCaller.adminRedemptions.androidReleaseVerification()).resolves.toMatchObject({
        status: "VERIFIED",
        packageName: "com.app.roamrewards",
        certificateConfigured: true,
      });
      await expect(userCaller.adminRedemptions.androidReleaseVerification()).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (previousStatus === undefined) delete process.env.APK_IDENTITY_VERIFICATION_STATUS;
      else process.env.APK_IDENTITY_VERIFICATION_STATUS = previousStatus;
      if (previousCertificate === undefined) delete process.env.EXPECTED_CERT_SHA256;
      else process.env.EXPECTED_CERT_SHA256 = previousCertificate;
    }
  });

  it("records privacy and spike-setting changes in the protected audit log", async () => {
    const adminCaller = appRouter.createCaller(makeContext(makeUser("admin", 111)));
    const userCaller = appRouter.createCaller(makeContext(makeUser("user", 112)));

    await expect(adminCaller.adminRedemptions.updatePrivacySettings({ retentionDays: 14, identifierVisibility: "MASKED", spikeThreshold: 50, spikeMultiplier: 3 })).resolves.toMatchObject({
      settings: { retentionDays: 14, identifierVisibility: "MASKED", spikeThreshold: 50, spikeMultiplier: 3 },
      changes: expect.arrayContaining([
        expect.objectContaining({ setting: "retentionDays", nextValue: "14", adminUserId: 111 }),
        expect.objectContaining({ setting: "spikeThreshold", nextValue: "50", adminUserId: 111 }),
      ]),
    });
    await expect(adminCaller.adminRedemptions.privacyAudit({ limit: 10 })).resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ adminUserId: 111 })]) });
    await expect(adminCaller.adminRedemptions.privacyAudit({ limit: 1, page: 0 })).resolves.toMatchObject({ page: 0, items: expect.any(Array), hasMore: expect.any(Boolean) });
    await expect(adminCaller.adminRedemptions.privacyAudit({ limit: 10, dateFrom: "2099-01-01T00:00:00.000Z", dateTo: "2099-01-02T00:00:00.000Z" })).resolves.toMatchObject({ items: [], hasMore: false });
    await expect(userCaller.adminRedemptions.privacySettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(userCaller.adminRedemptions.privacyAudit({ limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("ranks denied requests by normalized admin user subject", async () => {
    adminRateLimiter.configure({ maxRequests: 1, windowMs: 60_000 });
    vi.spyOn(db, "getAdminProviderFailures").mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    const offender = appRouter.createCaller(makeContext(makeUser("admin", 109)));
    const dashboardViewer = appRouter.createCaller(makeContext(makeUser("admin", 110)));
    const input = { since: now.toISOString(), limit: 10, severity: "ALL" as const, dateWindow: "ALL" as const };

    await offender.adminRedemptions.providerFailures(input);
    await expect(offender.adminRedemptions.providerFailures(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const metrics = await dashboardViewer.adminRedemptions.metrics();

    expect(metrics.topDeniedSubjects[0].deniedRequests).toBe(1);
    expect(metrics.topDeniedSubjects[0].subject).toMatch(/^admin-[a-f0-9]{12}$/);
  });

  it("rejects malformed Provider Alerts input before the database is called", async () => {
    const providerFailuresSpy = vi.spyOn(db, "getAdminProviderFailures");
    const caller = appRouter.createCaller(makeContext(makeUser("admin", 104)));

    await expect(
      caller.adminRedemptions.providerFailures({
        since: "not-a-date",
        limit: 10,
        severity: "ALL",
        dateWindow: "ALL",
      } as never),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(providerFailuresSpy).not.toHaveBeenCalled();
  });
});
