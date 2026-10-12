import { describe, expect, it } from "vitest";

import { ProviderFailureRollbackFixture, type ProviderFailureState } from "./fixtures/provider-failure-fixture";

const initialState: ProviderFailureState = {
  redemptionStatus: "UNDER_REVIEW",
  trailPointBalance: 0,
  ledgerEntryIds: ["reservation-debit-1"],
  auditEventIds: [],
  providerOutbox: [],
};

describe("redemption provider failure safety", () => {
  it("rolls back all rejection state when the provider fails before commit", async () => {
    const fixture = new ProviderFailureRollbackFixture(initialState);
    await expect(fixture.rejectWithProviderFailure("before-commit")).rejects.toThrow("before transaction commit");
    expect(fixture.state).toEqual(initialState);
  });

  it("keeps one committed rejection when the provider fails after commit", async () => {
    const fixture = new ProviderFailureRollbackFixture(initialState);
    await expect(fixture.rejectWithProviderFailure("after-commit")).resolves.toEqual({ providerFailed: true });
    expect(fixture.state).toEqual({
      redemptionStatus: "REJECTED",
      trailPointBalance: 500,
      ledgerEntryIds: ["reservation-debit-1", "compensation-credit-1"],
      auditEventIds: ["rejection-review-event-1"],
      providerOutbox: [{ id: "rejection-notification-1", status: "FAILED", attempts: 1 }],
    });
  });

  it("retries a failed provider delivery without another compensation credit or audit event", async () => {
    const fixture = new ProviderFailureRollbackFixture(initialState);
    await fixture.rejectWithProviderFailure("after-commit");
    expect(fixture.retryProviderDelivery()).toBe(true);
    expect(fixture.state.providerOutbox).toEqual([{ id: "rejection-notification-1", status: "DELIVERED", attempts: 2 }]);
    expect(fixture.state.trailPointBalance).toBe(500);
    expect(fixture.state.ledgerEntryIds).toEqual(["reservation-debit-1", "compensation-credit-1"]);
    expect(fixture.state.auditEventIds).toEqual(["rejection-review-event-1"]);
    expect(fixture.retryProviderDelivery()).toBe(false);
  });
});
