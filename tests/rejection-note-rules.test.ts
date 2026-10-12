import { describe, expect, it } from "vitest";

import { rejectionNoteLimits, validateRejectionInternalNote } from "../server/rejection-note-rules";

describe("risk-related rejection internal notes", () => {
  it("rejects a missing note for a risk-related reason", () => {
    expect(validateRejectionInternalNote("FRAUD_RISK_REVIEW")).toEqual({
      ok: false,
      code: "INTERNAL_NOTE_REQUIRED",
      normalizedNote: null,
    });
  });

  it("rejects a note shorter than the configured minimum", () => {
    const shortNote = "Risk flagged.";
    expect(shortNote.length).toBeLessThan(rejectionNoteLimits.minimumCharacters);
    expect(validateRejectionInternalNote("LEDGER_RESERVATION_CONFLICT", shortNote).code).toBe("INTERNAL_NOTE_TOO_SHORT");
  });

  it("rejects payment, identity, and credential-like sensitive data without echoing it", () => {
    const sensitiveNote = "Matched payment card 4111 1111 1111 1111 during risk review.";
    const result = validateRejectionInternalNote("FRAUD_RISK_REVIEW", sensitiveNote);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA");
    expect(result.normalizedNote).toBeNull();
  });

  it("accepts and normalizes a valid risk note", () => {
    const result = validateRejectionInternalNote("TERMS_VIOLATION", "  Review confirmed repeated attempts outside the quest rules.\r\n  ");
    expect(result).toEqual({
      ok: true,
      code: "OK",
      normalizedNote: "Review confirmed repeated attempts outside the quest rules.",
    });
  });

  it("does not require or retain notes for non-risk rejection reasons", () => {
    expect(validateRejectionInternalNote("GEOGRAPHY_INELIGIBLE", "ignored note")).toEqual({ ok: true, code: "OK", normalizedNote: null });
  });

  it("rejects notes beyond the configured maximum", () => {
    expect(validateRejectionInternalNote("FRAUD_RISK_REVIEW", "x".repeat(rejectionNoteLimits.maximumCharacters + 1)).code).toBe("INTERNAL_NOTE_TOO_LONG");
  });
});
