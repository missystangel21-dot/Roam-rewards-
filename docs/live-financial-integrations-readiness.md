# Live payout, identity, tax, and legal-review readiness

## Current implementation status

The repository now defines server-side provider boundaries, fail-closed defaults, a strict launch-readiness evaluator, and a transaction-level CSV export helper for confirmed payouts. **It does not currently connect to a payout provider, identity vendor, or tax-filing service. It does not process payouts, establish legal compliance, or file tax forms.** The current redemption flow remains simulated-only.

No provider has been selected or contracted, no production credentials are configured, and no legal approval is represented by these scaffolds. Do not turn the launch flags on merely to make a check pass. The readiness evaluator is a checklist aid, not an authorization system and is not yet wired to redemption endpoints.

## Provider integration work required

Before selecting or connecting a vendor:

- Obtain product, security, privacy, and legal approval for the specific use case and jurisdictions.
- Review provider agreements, fees, settlement behavior, account recovery, disputes, webhook authentication, data retention, and incident responsibilities.
- Store credentials only in the deployment secret manager. Never commit secrets, bank/card details, government-ID numbers, or identity-document images.
- Implement the provider adapter server-side with request signing, idempotency, timeout/retry policy, webhook signature verification, replay protection, durable event/outbox processing, reconciliation, and audit history.
- Require completed identity and geographic eligibility checks before any payout approval; accept verification only from authenticated vendor events/API responses.
- Keep payout state transitions and immutable ledger entries in the same audited workflow. A provider response must never directly alter a ledger balance.
- Add contract tests with vendor sandbox fixtures and failure/replay tests before enabling any production adapter.

## Identity data minimization

Use vendor-hosted verification sessions where available. Persist only a user-scoped opaque vendor reference, verification state, timestamps, and the minimum audit metadata required by an approved retention policy. The client must never be able to assert its own verification status. Avoid raw identity documents, SSNs, dates of birth, and full addresses in application logs and general-purpose database tables.

## Tax reporting boundary

`server/compliance/tax-reporting.ts` exports transaction-level data for downstream review only. Its inputs must come from confirmed paid payout records and an approved tax-profile reference. It intentionally does not choose tax thresholds, determine taxability, produce a government form, request taxpayer identifiers, or submit a filing. A tax professional must determine applicable reporting rules, thresholds, corrections, retention, and filing workflow before using the export operationally.

## Required legal review (not completed)

Qualified counsel must review and document decisions for at least:

- Product classification, official rules, eligibility, state-by-state availability, and prize/reward promotion requirements.
- Consumer disclosures, reward valuation, advertising/marketing claims, support, complaints, and dispute handling.
- Age, identity, sanctions/fraud screening, privacy notice, consent, data retention/deletion, and vendor data-processing terms.
- Payout-provider model, funds flow, unclaimed property, money-transmission/payment issues, and any state-specific obligations.
- Tax reporting and record retention with a qualified tax professional.
- Apple App Store and Google Play policies for the exact shipped feature set.

Record counsel’s written approval, scope, jurisdictions, policy/version references, open issues, and review date in an access-controlled operational record. This document and the code are implementation guidance, not legal or tax advice. Until review and all provider/security gates are complete, leave production money movement disabled.
