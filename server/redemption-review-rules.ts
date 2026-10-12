export type RedemptionStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "SUBMITTED_TO_PROVIDER" | "PAID" | "REJECTED" | "CANCELLED" | "FAILED";
export type AdminReviewAction = "REVIEW_STARTED" | "APPROVAL_RECORDED" | "APPROVED" | "REJECTED";

export const DUAL_APPROVAL_MINIMUM_POINTS = 5_000;

export const approvalReasonCodes = ["ELIGIBILITY_AND_LEDGER_VERIFIED"] as const;
export const rejectionReasonCodes = [
  "IDENTITY_VERIFICATION_REQUIRED",
  "GEOGRAPHY_INELIGIBLE",
  "FRAUD_RISK_REVIEW",
  "DUPLICATE_OR_CANCELLED_REQUEST",
  "LEDGER_RESERVATION_CONFLICT",
  "TERMS_VIOLATION",
] as const;

export type ApprovalReasonCode = (typeof approvalReasonCodes)[number];
export type RejectionReasonCode = (typeof rejectionReasonCodes)[number];

export const reviewerReasonCodeTemplates = [
  { code: "ELIGIBILITY_AND_LEDGER_VERIFIED", decision: "APPROVE", playerMessage: "Your request passed the current eligibility and balance review.", requiresInternalNote: false },
  { code: "IDENTITY_VERIFICATION_REQUIRED", decision: "REJECT", playerMessage: "Additional eligibility verification is required before a future request can be reviewed.", requiresInternalNote: false },
  { code: "GEOGRAPHY_INELIGIBLE", decision: "REJECT", playerMessage: "This reward request is not currently available for your verified location.", requiresInternalNote: false },
  { code: "FRAUD_RISK_REVIEW", decision: "REJECT", playerMessage: "This request could not be completed under current account-safety checks.", requiresInternalNote: true },
  { code: "DUPLICATE_OR_CANCELLED_REQUEST", decision: "REJECT", playerMessage: "This request is no longer available because it duplicates or conflicts with another request.", requiresInternalNote: false },
  { code: "LEDGER_RESERVATION_CONFLICT", decision: "REJECT", playerMessage: "The points reserved for this request are no longer available.", requiresInternalNote: true },
  { code: "TERMS_VIOLATION", decision: "REJECT", playerMessage: "This request could not be completed under the current reward rules.", requiresInternalNote: true },
] as const;

export type AdminTransition = {
  toStatus: RedemptionStatus;
  requiresCompensatingTrailPointCredit: boolean;
};

export type ApprovalDecision = {
  action: "APPROVAL_RECORDED" | "APPROVED";
  toStatus: "UNDER_REVIEW" | "APPROVED";
  requiredApprovals: 1 | 2;
  approvalCount: number;
};

export function getAdminRedemptionTransition(fromStatus: RedemptionStatus, action: "REVIEW_STARTED" | "REJECTED"): AdminTransition | null {
  if (action === "REVIEW_STARTED" && fromStatus === "REQUESTED") {
    return { toStatus: "UNDER_REVIEW", requiresCompensatingTrailPointCredit: false };
  }
  if (action === "REJECTED" && (fromStatus === "REQUESTED" || fromStatus === "UNDER_REVIEW")) {
    return { toStatus: "REJECTED", requiresCompensatingTrailPointCredit: true };
  }
  return null;
}

export function getApprovalDecision(input: { fromStatus: RedemptionStatus; requestedPoints: number; priorApprovalAdminIds: number[]; actingAdminUserId: number }): ApprovalDecision | null {
  if (input.fromStatus !== "UNDER_REVIEW" || input.priorApprovalAdminIds.includes(input.actingAdminUserId)) return null;
  const requiredApprovals = input.requestedPoints >= DUAL_APPROVAL_MINIMUM_POINTS ? 2 : 1;
  const approvalCount = input.priorApprovalAdminIds.length + 1;
  if (approvalCount < requiredApprovals) {
    return { action: "APPROVAL_RECORDED", toStatus: "UNDER_REVIEW", requiredApprovals, approvalCount };
  }
  return { action: "APPROVED", toStatus: "APPROVED", requiredApprovals, approvalCount };
}
