# Risk-Related Redemption Rejection Notes

## Purpose and scope

This specification defines the backend contract for rejecting a redemption request when the decision is based on account-safety or fraud-related risk. It is designed for the Roam Rewards prototype and future server-authoritative payout workflow. It does not expose fraud scores, detection heuristics, device fingerprints, or sensitive investigation data to the player.

The rejection reason code is a structured classification used for reporting, templates, and workflow routing. The internal note is a restricted operational record explaining the reviewer’s decision. A player-safe message is generated separately and must not be copied from the internal note.

## Reason-code policy

| Code | Category | Internal note required | Minimum note length | Player-safe message behavior |
| --- | --- | ---: | ---: | --- |
| `FRAUD_RISK_REVIEW` | Suspicious activity or fraud signal | Yes | 20 characters | Use a generic account-safety message. Never disclose the signal or rule. |
| `LEDGER_RESERVATION_CONFLICT` | Balance or reservation inconsistency | Yes | 20 characters | State that the request could not be completed under current balance checks. |
| `TERMS_VIOLATION` | Suspected breach of reward rules | Yes | 20 characters | State that the request did not meet current reward rules. |
| `IDENTITY_VERIFICATION_REQUIRED` | Missing or unsuccessful identity step | No | Not applicable | Explain that additional eligibility verification is required. |
| `GEOGRAPHY_INELIGIBLE` | State or location restriction | No | Not applicable | Explain that the reward is not currently available in the verified location. |
| `DUPLICATE_OR_CANCELLED_REQUEST` | Duplicate, already cancelled, or conflicting request | No | Not applicable | Explain that the request is no longer available. |

The code list is closed. A client may submit only an enumerated code exposed by the reviewer template endpoint. Unknown, retired, or decision-mismatched codes must be rejected with a validation error before any state transition is attempted.

## Internal-note validation contract

The reject procedure accepts `redemptionRequestId`, `idempotencyKey`, `reasonCode`, and `internalNote`. The server, not the client, determines whether the selected code is risk-related.

```json
{
  "redemptionRequestId": "01J9YNPB2PWAF5QS1VZCC1WPCM",
  "idempotencyKey": "8dcf0ef3-3fd9-4a77-9e3d-8ad2d90f19b5",
  "reasonCode": "FRAUD_RISK_REVIEW",
  "internalNote": "Velocity review found repeated claim attempts across linked sessions."
}
```

Validation runs in this order:

1. Authenticate the reviewer and verify the `redemptions:review` permission.
2. Validate the request shape, UUID formats, closed reason-code enum, and maximum note size.
3. Trim surrounding Unicode whitespace and reject a note that is empty after trimming.
4. If the code’s `requiresInternalNote` property is true, require at least 20 Unicode characters after trimming. The recommended maximum is 2,000 Unicode characters.
5. Reject control characters other than ordinary line breaks and tabs. Normalize line endings before storage.
6. Reject obvious secret or payment-data patterns such as full payment-card numbers, bank account numbers, government identification numbers, passwords, access tokens, or raw device-fingerprint values. Return a generic `INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA` error without echoing the submitted text.
7. If the note is not required, discard any supplied note unless the reviewer explicitly has a separate optional-note permission. The rejection event must record whether a note was required and whether one was stored.
8. Only after validation succeeds, acquire the redemption row lock and apply the allowed state transition. A validation failure must not create a review event, compensation entry, or status update.

The backend uses these machine-readable error codes:

| Error code | HTTP/tRPC mapping | Meaning |
| --- | --- | --- |
| `REVIEW_REASON_CODE_INVALID` | `BAD_REQUEST` | The code is unknown or not valid for rejection. |
| `INTERNAL_NOTE_REQUIRED` | `BAD_REQUEST` | The selected risk-related reason requires an internal note. |
| `INTERNAL_NOTE_TOO_SHORT` | `BAD_REQUEST` | The trimmed note is below the minimum length. |
| `INTERNAL_NOTE_TOO_LONG` | `BAD_REQUEST` | The note exceeds the configured maximum. |
| `INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA` | `BAD_REQUEST` | The note appears to contain restricted data. |
| `REDEMPTION_REVIEW_NOT_AUTHORIZED` | `FORBIDDEN` | The caller cannot review redemption requests. |
| `REDEMPTION_REVIEW_STATE_CONFLICT` | `CONFLICT` | The request changed state before this review committed. |

The player-facing UI should map `INTERNAL_NOTE_REQUIRED` to: “Add an internal note explaining the risk-related decision before rejecting this request.” It should not display the internal note, risk signal, or fraud rule.

## Audit and retention behavior

A successful rejection stores the selected reason code, a normalized encrypted internal note or a tokenized secure-note reference, the note-required boolean, reviewer ID, request ID, prior and next status, correlation ID, idempotency key, and creation time in the immutable review event. The audit event is written in the same transaction as the rejection status update and compensating Trail Points credit. A duplicate idempotency key returns the original result without creating another event or credit.

Reviewer access to notes requires a separate `redemptions:internal_notes:read` permission. Queue responses omit notes by default. Audit exports redact note content unless the export is explicitly authorized and access is itself audited. Notes should follow the approved operational retention schedule and deletion policy; they must not be copied into player notifications, analytics payloads, or support search indexes without redaction.

## Interaction with dual approval

A risk-related rejection is terminal and does not require a second approval by default, because the rejection returns the reserved Trail Points and prevents payout. Organizations may require a second reviewer for high-value or escalated risk rejections; if enabled, the first reviewer records a pending risk decision and the second reviewer confirms it with a distinct administrator identity. The same reviewer cannot provide both decisions.

For approval, the existing two-person rule remains unchanged. A risk note is required only for rejection codes classified as risk-related; it must never be used to turn an approval into an implicit risk decision.

## Test cases

| Scenario | Expected result |
| --- | --- |
| Reject with `FRAUD_RISK_REVIEW` and no note | `INTERNAL_NOTE_REQUIRED`; no state, ledger, or audit mutation. |
| Reject with `FRAUD_RISK_REVIEW` and 19 trimmed characters | `INTERNAL_NOTE_TOO_SHORT`; no mutation. |
| Reject with `FRAUD_RISK_REVIEW` and a valid 20+ character note | Rejection, compensating credit, and immutable audit event commit atomically. |
| Reject with `GEOGRAPHY_INELIGIBLE` and no note | Valid rejection with no note stored. |
| Submit an unknown reason code | `REVIEW_REASON_CODE_INVALID`; no mutation. |
| Include a payment-card or token-like value in a note | `INTERNAL_NOTE_CONTAINS_SENSITIVE_DATA`; no mutation and no submitted-text echo. |
| Retry a successful rejection with the same idempotency key | Original response; exactly one review event and one compensating credit. |
| Attempt rejection as a non-admin | `REDEMPTION_REVIEW_NOT_AUTHORIZED`; no database call. |

## Implementation handoff

The current project reason-code templates already mark `FRAUD_RISK_REVIEW`, `LEDGER_RESERVATION_CONFLICT`, and `TERMS_VIOLATION` as requiring an internal note. The next implementation should move that property into a shared server-side validator, add `internalNote` to the protected rejection input, and validate it before entering the existing transactional rejection helper. Live payout activation should remain disabled until privacy, security, retention, and legal review are complete.
