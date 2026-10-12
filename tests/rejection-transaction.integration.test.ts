import { describe, expect, it } from "vitest";

import { RewardTransactionRollbackFixture, type RejectionFixtureState } from "./fixtures/reward-transaction-fixture";

const initialState: RejectionFixtureState = {
  redemptionStatus: "UNDER_REVIEW",
  trailPointBalance: 0,
  ledgerEntryIds: ["reservation-debit-1"],
  auditEventIds: [],
};

async function rejectRedemptionWithFailure(fixture: RewardTransactionRollbackFixture, failAfter: "status" | "ledger" | "audit" | null) {
  return fixture.transaction((state) => {
    state.redemptionStatus = "REJECTED";
    if (failAfter === "status") throw new Error("simulated status-side failure");

    state.trailPointBalance += 500;
    state.ledgerEntryIds.push("compensation-credit-1");
    if (failAfter === "ledger") throw new Error("simulated ledger-side failure");

    state.auditEventIds.push("rejection-review-event-1");
    if (failAfter === "audit") throw new Error("simulated audit-side failure");
    return state;
  });
}

describe("redemption rejection transaction rollback integration", () => {
  it.each(["status", "ledger", "audit"] as const)("restores all state when failure occurs after the %s stage", async (failAfter) => {
    const fixture = new RewardTransactionRollbackFixture(initialState);
    await expect(rejectRedemptionWithFailure(fixture, failAfter)).rejects.toThrow();
    expect(fixture.state).toEqual(initialState);
  });

  it("commits status, one compensating credit, and one audit event together on success", async () => {
    const fixture = new RewardTransactionRollbackFixture(initialState);
    await rejectRedemptionWithFailure(fixture, null);
    expect(fixture.state).toEqual({
      redemptionStatus: "REJECTED",
      trailPointBalance: 500,
      ledgerEntryIds: ["reservation-debit-1", "compensation-credit-1"],
      auditEventIds: ["rejection-review-event-1"],
    });
  });

  it("does not duplicate state when a failed transaction is retried from the original snapshot", async () => {
    const fixture = new RewardTransactionRollbackFixture(initialState);
    await expect(rejectRedemptionWithFailure(fixture, "audit")).rejects.toThrow();
    await rejectRedemptionWithFailure(fixture, null);
    expect(fixture.state.ledgerEntryIds.filter((id) => id === "compensation-credit-1")).toHaveLength(1);
    expect(fixture.state.auditEventIds).toEqual(["rejection-review-event-1"]);
  });
});
