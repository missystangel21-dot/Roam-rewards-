export type ProviderOutboxStatus = "PENDING" | "FAILED" | "DELIVERED";

export type ProviderFailureState = {
  redemptionStatus: "UNDER_REVIEW" | "REJECTED";
  trailPointBalance: number;
  ledgerEntryIds: string[];
  auditEventIds: string[];
  providerOutbox: Array<{ id: string; status: ProviderOutboxStatus; attempts: number }>;
};

export class ProviderFailureRollbackFixture {
  public state: ProviderFailureState;

  constructor(initialState: ProviderFailureState) {
    this.state = structuredClone(initialState);
  }

  async transaction<T>(work: (state: ProviderFailureState) => Promise<T> | T): Promise<T> {
    const snapshot = structuredClone(this.state);
    try {
      return await work(this.state);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  async rejectWithProviderFailure(stage: "before-commit" | "after-commit") {
    try {
      await this.transaction((state) => {
        state.redemptionStatus = "REJECTED";
        state.trailPointBalance += 500;
        state.ledgerEntryIds.push("compensation-credit-1");
        state.auditEventIds.push("rejection-review-event-1");
        state.providerOutbox.push({ id: "rejection-notification-1", status: "PENDING", attempts: 0 });
        if (stage === "before-commit") throw new Error("provider failed before transaction commit");
      });
    } catch (error) {
      if (stage === "before-commit") throw error;
      throw error;
    }

    // A post-commit provider failure is not a database rollback condition.
    if (stage === "after-commit") {
      this.state.providerOutbox[0].status = "FAILED";
      this.state.providerOutbox[0].attempts += 1;
      return { providerFailed: true };
    }
    return { providerFailed: false };
  }

  retryProviderDelivery() {
    const event = this.state.providerOutbox[0];
    if (!event || event.status !== "FAILED") return false;
    event.status = "DELIVERED";
    event.attempts += 1;
    return true;
  }
}
