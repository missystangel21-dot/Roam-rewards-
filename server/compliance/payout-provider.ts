export type PayoutSubmission = {
  redemptionId: string;
  amountMinor: number;
  currency: "USD";
  recipientReference: string;
  idempotencyKey: string;
};

export type PayoutResult = {
  provider: string;
  providerTransferReference: string;
  status: "SUBMITTED" | "PAID" | "FAILED";
};

/** Server-only interface. Implementations must verify webhook signatures and be idempotent. */
export interface PayoutProvider {
  submit(input: PayoutSubmission): Promise<PayoutResult>;
}

/** Fail-closed default: no money is moved until a vetted provider is integrated. */
export class DisabledPayoutProvider implements PayoutProvider {
  async submit(_input: PayoutSubmission): Promise<PayoutResult> {
    throw new Error("Live payouts are unavailable: no production payout provider is configured");
  }
}
