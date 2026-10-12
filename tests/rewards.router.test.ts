import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../server/_core/context";

const rewardDb = vi.hoisted(() => ({
  getRewardSummary: vi.fn(),
  getTrailPointLedger: vi.fn(),
  getExplorerXpActivity: vi.fn(),
  createSimulatedRedemptionRequest: vi.fn(),
  getAdminRedemptionQueue: vi.fn(),
  getAdminProviderFailures: vi.fn(),
  startRedemptionReview: vi.fn(),
  approveRedemptionRequest: vi.fn(),
  rejectRedemptionRequest: vi.fn(),
  RewardTransactionError: class RewardTransactionError extends Error {
    constructor(public readonly code: string) { super(code); }
  },
}));

vi.mock("../server/db", () => rewardDb);

import { appRouter } from "../server/routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(userId = 41, role: AuthenticatedUser["role"] = "user"): TrpcContext {
  const user: AuthenticatedUser = { id: userId, openId: `player-${userId}`, email: null, name: "Player", loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function createAnonymousContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("rewards tRPC router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewardDb.getRewardSummary.mockResolvedValue({ trailPoints: { availablePoints: 640 }, explorerXp: { totalXp: 125 }, payoutMode: "SIMULATED_ONLY" });
    rewardDb.getTrailPointLedger.mockResolvedValue([{ id: "ledger-1", userId: 41, points: 60, direction: "CREDIT" }]);
    rewardDb.getExplorerXpActivity.mockResolvedValue({ events: [{ id: "xp-1", userId: 41, xpDelta: 25 }], progress: { totalXp: 125, level: 2 } });
    rewardDb.createSimulatedRedemptionRequest.mockResolvedValue({ request: { id: "redemption-1", status: "REQUESTED", requestedPoints: 500 }, idempotent: false });
    rewardDb.getAdminRedemptionQueue.mockResolvedValue([{ id: "redemption-1", userId: 41, status: "REQUESTED", requestedPoints: 500 }]);
    rewardDb.getAdminProviderFailures.mockResolvedValue([]);
    rewardDb.startRedemptionReview.mockResolvedValue({ request: { id: "redemption-1", status: "UNDER_REVIEW", requestedPoints: 500 }, idempotent: false });
    rewardDb.approveRedemptionRequest.mockResolvedValue({ request: { id: "redemption-1", status: "APPROVED", requestedPoints: 500 }, idempotent: false });
    rewardDb.rejectRedemptionRequest.mockResolvedValue({ request: { id: "redemption-1", status: "REJECTED", requestedPoints: 500 }, idempotent: false });
  });

  it("rejects reward procedures without an authenticated user", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.rewards.summary()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("scopes reward summary, ledger, and XP activity to the authenticated player", async () => {
    const caller = appRouter.createCaller(createContext(41));
    await caller.rewards.summary();
    await caller.rewards.trailPointLedger({ limit: 10 });
    await caller.rewards.explorerXpActivity({ limit: 10 });
    expect(rewardDb.getRewardSummary).toHaveBeenCalledWith(41);
    expect(rewardDb.getTrailPointLedger).toHaveBeenCalledWith(41, 10);
    expect(rewardDb.getExplorerXpActivity).toHaveBeenCalledWith(41, 10);
  });

  it("creates a simulated redemption using the authenticated user and never accepts a client user id", async () => {
    const caller = appRouter.createCaller(createContext(41));
    const idempotencyKey = "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a";
    const result = await caller.rewards.requestSimulatedRedemption({ requestedPoints: 500, idempotencyKey });
    expect(rewardDb.createSimulatedRedemptionRequest).toHaveBeenCalledWith(expect.objectContaining({ userId: 41, requestedPoints: 500, idempotencyKey }));
    expect(result).toMatchObject({ redemptionId: "redemption-1", requestedPoints: 500, payoutMode: "SIMULATED_ONLY" });
  });

  it("denies the redemption review queue to a non-admin player", async () => {
    const caller = appRouter.createCaller(createContext(41, "user"));
    await expect(caller.adminRedemptions.queue({ limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rewardDb.getAdminRedemptionQueue).not.toHaveBeenCalled();
  });

  it("denies provider-failure alerts to a non-admin player", async () => {
    const caller = appRouter.createCaller(createContext(41, "user"));
    await expect(caller.adminRedemptions.providerFailures({ since: new Date(Date.now() - 60_000).toISOString(), limit: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rewardDb.getAdminProviderFailures).not.toHaveBeenCalled();
  });

  it("allows an admin to poll provider failures with a normalized Date boundary", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    const since = new Date("2026-08-30T03:00:00.000Z");
    await caller.adminRedemptions.providerFailures({ since: since.toISOString(), limit: 10 });
    expect(rewardDb.getAdminProviderFailures).toHaveBeenCalledWith(since, 10, undefined, { severity: "ALL", dateWindow: "ALL" });
  });

  it("normalizes an admin provider-failure cursor before querying", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    const since = new Date("2026-08-30T03:00:00.000Z");
    const cursorCreatedAt = new Date("2026-08-30T03:10:00.000Z");
    await caller.adminRedemptions.providerFailures({ since: since.toISOString(), limit: 10, cursor: { createdAt: cursorCreatedAt.toISOString(), id: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a" } });
    expect(rewardDb.getAdminProviderFailures).toHaveBeenCalledWith(since, 10, { createdAt: cursorCreatedAt, id: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a" }, { severity: "ALL", dateWindow: "ALL" });
  });

  it("forwards server-side severity and date filters with the cursor", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    const since = new Date("2026-08-30T03:00:00.000Z");
    await caller.adminRedemptions.providerFailures({ since: since.toISOString(), limit: 10, severity: "CRITICAL", dateWindow: "FIVE_MINUTES" });
    expect(rewardDb.getAdminProviderFailures).toHaveBeenCalledWith(since, 10, undefined, { severity: "CRITICAL", dateWindow: "FIVE_MINUTES" });
  });

  it("allows an admin to review a request while binding the actor id from the authenticated context", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    const idempotencyKey = "218264a5-4bb0-4b64-981c-a2fbd2292154";
    await caller.adminRedemptions.startReview({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", idempotencyKey });
    expect(rewardDb.startRedemptionReview).toHaveBeenCalledWith(expect.objectContaining({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", adminUserId: 7, idempotencyKey }));
  });

  it("returns a conflict when an admin attempts an invalid state transition", async () => {
    rewardDb.approveRedemptionRequest.mockRejectedValue(new rewardDb.RewardTransactionError("INVALID_REDEMPTION_STATE"));
    const caller = appRouter.createCaller(createContext(7, "admin"));
    await expect(caller.adminRedemptions.approve({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", idempotencyKey: "a6f765dc-ea56-4506-8e60-c06e7698d31c", reasonCode: "ELIGIBILITY_AND_LEDGER_VERIFIED" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a missing risk note before the transaction boundary", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    await expect(caller.adminRedemptions.reject({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", idempotencyKey: "7d01e4dd-82dd-49de-a3a8-4d69e9f5f1d9", reasonCode: "FRAUD_RISK_REVIEW" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // rejectRedemptionRequest owns the status update, compensating ledger credit, and audit insert.
    expect(rewardDb.rejectRedemptionRequest).not.toHaveBeenCalled();
  });

  it("rejects sensitive risk notes before any status, ledger, or audit mutation", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    await expect(caller.adminRedemptions.reject({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", idempotencyKey: "e9dca6a6-c20f-4f6e-ae0b-12c441afb7d6", reasonCode: "FRAUD_RISK_REVIEW", internalNote: "Matched payment card 4111 1111 1111 1111." })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rewardDb.rejectRedemptionRequest).not.toHaveBeenCalled();
  });

  it("passes a normalized valid risk note into the audited rejection transaction", async () => {
    const caller = appRouter.createCaller(createContext(7, "admin"));
    await caller.adminRedemptions.reject({ redemptionRequestId: "ef47637e-2e13-4b4c-a7d0-f0fa567e9d4a", idempotencyKey: "f3e3ab93-a442-47e7-8c7b-e6d8fd1cb771", reasonCode: "FRAUD_RISK_REVIEW", internalNote: "  Repeated linked-session attempts require a safety review.\r\n" });
    expect(rewardDb.rejectRedemptionRequest).toHaveBeenCalledWith(expect.objectContaining({ adminUserId: 7, internalNote: "Repeated linked-session attempts require a safety review." }));
  });
});
