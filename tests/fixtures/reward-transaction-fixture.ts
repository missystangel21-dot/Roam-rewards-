export type RejectionFixtureState = {
  redemptionStatus: "REQUESTED" | "UNDER_REVIEW" | "REJECTED";
  trailPointBalance: number;
  ledgerEntryIds: string[];
  auditEventIds: string[];
};

export class RewardTransactionRollbackFixture {
  public state: RejectionFixtureState;

  constructor(initialState: RejectionFixtureState) {
    this.state = structuredClone(initialState);
  }

  async transaction<T>(work: (state: RejectionFixtureState) => Promise<T> | T): Promise<T> {
    const snapshot = structuredClone(this.state);
    try {
      return await work(this.state);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }
}
