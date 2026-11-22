export type ReadinessEnvironment = Record<string, string | undefined>;

export type LiveReadinessInput = {
  env: ReadinessEnvironment;
  payoutAdapterConfigured: boolean;
  identityAdapterConfigured: boolean;
  taxReportingAdapterConfigured: boolean;
  legalReviewRecorded: boolean;
};

export type LiveReadiness = {
  livePayouts: { enabled: boolean; blockers: string[] };
  identityVerification: { enabled: boolean; blockers: string[] };
  taxReporting: { enabled: boolean; blockers: string[] };
};

const isEnabled = (value: string | undefined) => value?.trim().toLowerCase() === "true";

/**
 * Fail-closed launch gates. These gates do not implement vendor integrations;
 * both the explicit environment flag and a real, reviewed adapter are required.
 */
export function evaluateLiveReadiness(input: LiveReadinessInput): LiveReadiness {
  const legalBlocker = input.legalReviewRecorded ? [] : ["Documented legal/compliance approval is missing"];

  const payoutBlockers = [
    ...(!isEnabled(input.env.ENABLE_LIVE_PAYOUTS) ? ["ENABLE_LIVE_PAYOUTS is not true"] : []),
    ...(!input.payoutAdapterConfigured ? ["No production payout adapter is configured"] : []),
    ...legalBlocker,
  ];
  const identityBlockers = [
    ...(!isEnabled(input.env.ENABLE_IDENTITY_VERIFICATION) ? ["ENABLE_IDENTITY_VERIFICATION is not true"] : []),
    ...(!input.identityAdapterConfigured ? ["No production identity-verification adapter is configured"] : []),
    ...legalBlocker,
  ];
  const taxBlockers = [
    ...(!isEnabled(input.env.ENABLE_TAX_REPORTING) ? ["ENABLE_TAX_REPORTING is not true"] : []),
    ...(!input.taxReportingAdapterConfigured ? ["No production tax-reporting adapter is configured"] : []),
    ...legalBlocker,
  ];

  return {
    livePayouts: { enabled: payoutBlockers.length === 0, blockers: payoutBlockers },
    identityVerification: { enabled: identityBlockers.length === 0, blockers: identityBlockers },
    taxReporting: { enabled: taxBlockers.length === 0, blockers: taxBlockers },
  };
}
