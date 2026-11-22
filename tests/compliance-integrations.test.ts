import { describe, expect, it } from "vitest";
import { evaluateLiveReadiness } from "../server/compliance/live-readiness";
import { DisabledIdentityVerificationProvider, isCurrentVendorVerification } from "../server/compliance/identity-verification-provider";
import { DisabledPayoutProvider } from "../server/compliance/payout-provider";
import { buildPaidPayoutTaxExport } from "../server/compliance/tax-reporting";

describe("live financial and identity integrations fail closed", () => {
  it("keeps all launch gates disabled without flags, adapters, and legal approval", () => {
    const readiness = evaluateLiveReadiness({
      env: {},
      payoutAdapterConfigured: false,
      identityAdapterConfigured: false,
      taxReportingAdapterConfigured: false,
      legalReviewRecorded: false,
    });
    expect(readiness.livePayouts.enabled).toBe(false);
    expect(readiness.identityVerification.enabled).toBe(false);
    expect(readiness.taxReporting.enabled).toBe(false);
    expect(readiness.livePayouts.blockers).toContain("Documented legal/compliance approval is missing");
  });

  it("requires explicit opt-in, adapters, and legal approval for each integration", () => {
    const readiness = evaluateLiveReadiness({
      env: {
        ENABLE_LIVE_PAYOUTS: "true",
        ENABLE_IDENTITY_VERIFICATION: "true",
        ENABLE_TAX_REPORTING: "true",
      },
      payoutAdapterConfigured: true,
      identityAdapterConfigured: true,
      taxReportingAdapterConfigured: true,
      legalReviewRecorded: true,
    });
    expect(readiness.livePayouts).toEqual({ enabled: true, blockers: [] });
    expect(readiness.identityVerification).toEqual({ enabled: true, blockers: [] });
    expect(readiness.taxReporting).toEqual({ enabled: true, blockers: [] });
  });

  it("does not infer a verified identity from pending or expired vendor results", () => {
    const result = {
      vendor: "ExampleVendor",
      vendorReference: "opaque-ref",
      status: "VERIFIED" as const,
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
    };
    expect(isCurrentVendorVerification(result, new Date("2026-01-15T00:00:00Z"))).toBe(true);
    expect(isCurrentVendorVerification(result, new Date("2026-02-01T00:00:00Z"))).toBe(false);
    expect(isCurrentVendorVerification({ ...result, status: "PENDING" }, new Date("2026-01-15T00:00:00Z"))).toBe(false);
  });

  it("does not send money or create identity sessions until real vendors are installed", async () => {
    await expect(new DisabledPayoutProvider().submit({
      redemptionId: "redemption",
      amountMinor: 500,
      currency: "USD",
      recipientReference: "tokenized-recipient",
      idempotencyKey: "idempotency-key",
    })).rejects.toThrow("no production payout provider is configured");
    await expect(new DisabledIdentityVerificationProvider().createSession({
      userReference: "user-reference",
      returnUrl: "https://example.invalid/return",
      idempotencyKey: "idempotency-key",
    })).rejects.toThrow("no production vendor is configured");
  });
});

describe("tax transaction export", () => {
  it("exports only the supplied paid transaction data and safely escapes CSV", () => {
    const csv = buildPaidPayoutTaxExport(2026, [{
      taxProfileReference: 'tax,"ref',
      payoutReference: "payout-1",
      paidAt: new Date("2026-04-03T12:30:00Z"),
      currency: "USD",
      grossAmountMinor: 1200,
    }]);
    // The reference `tax,"ref` contains a comma and a quote, so RFC 4180
    // escaping wraps it in quotes and doubles the inner quote:
    // `"tax,""ref"`. (An earlier expectation had one quote too many.)
    expect(csv).toContain('"tax,""ref"');
    expect(csv).toContain('"1200"');
    expect(csv).not.toContain("SSN");
  });

  it("rejects out-of-year dates and non-positive amounts", () => {
    expect(() => buildPaidPayoutTaxExport(2026, [{
      taxProfileReference: "tax-ref",
      payoutReference: "payout-1",
      paidAt: new Date("2025-12-31T23:59:59Z"),
      currency: "USD",
      grossAmountMinor: 100,
    }])).toThrow("within the requested tax year");
    expect(() => buildPaidPayoutTaxExport(2026, [{
      taxProfileReference: "tax-ref",
      payoutReference: "payout-1",
      paidAt: new Date("2026-01-01T00:00:00Z"),
      currency: "USD",
      grossAmountMinor: 0,
    }])).toThrow("positive safe integer");
  });
});
