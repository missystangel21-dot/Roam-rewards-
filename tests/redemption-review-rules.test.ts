import { describe, expect, it } from "vitest";

import { DUAL_APPROVAL_MINIMUM_POINTS, getAdminRedemptionTransition, getApprovalDecision, reviewerReasonCodeTemplates } from "../server/redemption-review-rules";

describe("admin redemption review rules", () => {
  it("permits only the requested to under-review to approved sequence", () => {
    expect(getAdminRedemptionTransition("REQUESTED", "REVIEW_STARTED")).toMatchObject({ toStatus: "UNDER_REVIEW", requiresCompensatingTrailPointCredit: false });
    expect(getAdminRedemptionTransition("PAID", "REVIEW_STARTED")).toBeNull();
  });

  it("requires a compensating credit only when a reviewable request is rejected", () => {
    expect(getAdminRedemptionTransition("REQUESTED", "REJECTED")).toMatchObject({ toStatus: "REJECTED", requiresCompensatingTrailPointCredit: true });
    expect(getAdminRedemptionTransition("UNDER_REVIEW", "REJECTED")).toMatchObject({ toStatus: "REJECTED", requiresCompensatingTrailPointCredit: true });
    expect(getAdminRedemptionTransition("APPROVED", "REJECTED")).toBeNull();
  });

  it("requires two distinct administrator approvals for sensitive requests", () => {
    const firstApproval = getApprovalDecision({ fromStatus: "UNDER_REVIEW", requestedPoints: DUAL_APPROVAL_MINIMUM_POINTS, priorApprovalAdminIds: [], actingAdminUserId: 7 });
    expect(firstApproval).toMatchObject({ action: "APPROVAL_RECORDED", toStatus: "UNDER_REVIEW", approvalCount: 1, requiredApprovals: 2 });
    const finalApproval = getApprovalDecision({ fromStatus: "UNDER_REVIEW", requestedPoints: DUAL_APPROVAL_MINIMUM_POINTS, priorApprovalAdminIds: [7], actingAdminUserId: 8 });
    expect(finalApproval).toMatchObject({ action: "APPROVED", toStatus: "APPROVED", approvalCount: 2, requiredApprovals: 2 });
    expect(getApprovalDecision({ fromStatus: "UNDER_REVIEW", requestedPoints: DUAL_APPROVAL_MINIMUM_POINTS, priorApprovalAdminIds: [7], actingAdminUserId: 7 })).toBeNull();
  });

  it("exposes player-safe reason-code templates and finalizes a non-sensitive approval once", () => {
    expect(reviewerReasonCodeTemplates.find((template) => template.code === "FRAUD_RISK_REVIEW")?.requiresInternalNote).toBe(true);
    expect(getApprovalDecision({ fromStatus: "UNDER_REVIEW", requestedPoints: DUAL_APPROVAL_MINIMUM_POINTS - 1, priorApprovalAdminIds: [], actingAdminUserId: 7 })).toMatchObject({ action: "APPROVED", requiredApprovals: 1 });
  });
});
