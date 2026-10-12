# Roam Rewards Backend API Specification

**API version:** `v1`  
**Transport:** HTTPS only, JSON request/response bodies  
**Authentication:** bearer session token for player APIs; service credential or mTLS-equivalent gateway control for provider webhooks  
**Authorization:** `player`, `reviewer`, and `admin` roles, with least-privilege permissions

## Shared API contract

All write endpoints require an `Idempotency-Key` UUID header. The server stores the user, route, request hash, response code, response body, and expiry timestamp for at least 24 hours. Reusing a key with a different request body returns `409 IDEMPOTENCY_KEY_REUSED`. Responses include an opaque `X-Correlation-Id`, and the server writes a corresponding audit event.

The server returns only generic fraud and eligibility codes to players. It never return risk scores, device-fingerprint values, precise historic locations, provider tokens, or internal reviewer notes. API responses contain Trail Points and Explorer XP in distinct objects so a client cannot misread XP as cash-equivalent value.

```json
{
  "error": {
    "code": "QUEST_LOCATION_NOT_ACCEPTED",
    "message": "This beacon cannot be verified from the current location.",
    "correlationId": "f1293e88-d9ce-4c47-b4ae-3f98f9c1a994"
  }
}
```

## Player endpoints

| Method and path | Purpose | Required authorization | Primary database effects |
| --- | --- | --- | --- |
| `GET /v1/me/rewards/summary` | Return separate Trail Points and Explorer XP projections. | `player` | Read-only ledger and XP aggregation. |
| `GET /v1/me/trail-points/ledger?cursor=` | Return a paginated, immutable receipt history. | `player` | Read-only; user-scoped. |
| `GET /v1/me/explorer-xp/events?cursor=` | Return cosmetic XP activity and next-level projection. | `player` | Read-only; user-scoped. |
| `POST /v1/beacons/{beaconId}/quest-sessions` | Issue a short-lived, signed quest nonce for an active beacon. | Eligible `player` | Insert `quest_sessions` row; audit issue. |
| `POST /v1/quest-claims` | Validate a completed quest and earn a fixed Trail Points credit. | Eligible `player` | Transactionally insert claim, consume session, insert ledger credit, and audit. |
| `POST /v1/quest-claims/{claimId}/simulated-ad-completions` | Complete a local development-only ad placeholder and earn cosmetic XP. | `player`, feature flag enabled | Insert simulated ad event and Explorer XP event only. |
| `POST /v1/redemptions` | Create a redemption request and reserve Trail Points. | Payout-eligible `player` | Transactionally insert request, status event, ledger debit reservation, and audit. |
| `POST /v1/redemptions/{redemptionId}/cancel` | Cancel an eligible pending request and restore reserved Trail Points. | Request owner with cancellable status | Transactionally set state, insert status event and compensating ledger credit. |

### `GET /v1/me/rewards/summary`

```json
{
  "trailPoints": {
    "availablePoints": 640,
    "todayEarnedPoints": 100,
    "dailyCapPoints": 250,
    "displayedConversion": { "pointsPerDollar": 100, "displayedCashEquivalent": "6.40" },
    "redemptionMinimumPoints": 500
  },
  "explorerXp": {
    "totalXp": 125,
    "level": 2,
    "currentLevelXp": 25,
    "xpPerLevel": 100,
    "remainingXp": 75,
    "cashValue": null
  },
  "eligibility": {
    "questEarningEligible": true,
    "payoutEligible": false,
    "payoutReason": "IDENTITY_VERIFICATION_REQUIRED"
  }
}
```

### `POST /v1/beacons/{beaconId}/quest-sessions`

The server applies player status, age/geography eligibility, beacon schedule, rate-limit, and device/session checks before issuing a single-use session. Return a nonce only once, over TLS, with a five-minute expiry. Store only a cryptographic nonce hash.

```json
{
  "questSessionId": "01J9YMHX5V1D1NG7B23B4TXXGP",
  "nonce": "opaque-short-lived-secret",
  "expiresAt": "2026-08-27T18:05:00.000Z",
  "requiredAcknowledgements": ["PUBLIC_PEDESTRIAN_LOCATION", "PLAYER_IS_STOPPED"]
}
```

### `POST /v1/quest-claims`

```json
{
  "questSessionId": "01J9YMHX5V1D1NG7B23B4TXXGP",
  "nonce": "opaque-short-lived-secret",
  "acknowledgements": ["PUBLIC_PEDESTRIAN_LOCATION", "PLAYER_IS_STOPPED"],
  "locationProof": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "accuracyMeters": 24.3,
    "speedMetersPerSecond": 0.4,
    "capturedAt": "2026-08-27T18:02:30.000Z"
  },
  "clientEventAt": "2026-08-27T18:02:31.000Z"
}
```

The production service evaluates raw coordinates in memory, records only the derived distance, accuracy, motion summary, and salted proof hash, then discards raw coordinates unless retention is required by an approved investigation policy. It executes the following transaction at `SERIALIZABLE` isolation or with equivalent row and uniqueness locking: lock active policy and player balance projection; reject consumed/expired nonce; enforce beacon-window uniqueness and daily cap; insert the accepted claim; mark the session consumed; insert a fixed `QUEST_CREDIT` entry; insert the audit event; commit. A duplicate idempotency key returns the original receipt.

```json
{
  "claimId": "01J9YMN9Z5QH2K05F3A39STXF5",
  "receipt": {
    "ledgerEntryId": "01J9YMN9Z75ZD7FPQ09E4C0VMT",
    "fixedTrailPoints": 60,
    "availableTrailPoints": 640,
    "policyVersion": "us-v1"
  },
  "optionalCosmeticAd": {
    "available": true,
    "adPlacementKey": "quest-completion-cosmetic-v1",
    "reward": { "explorerXp": 25, "cashValue": null }
  }
}
```

### `POST /v1/quest-claims/{claimId}/simulated-ad-completions`

This endpoint is enabled only in the development/prototype environment. It verifies ownership of the accepted claim, a single completion per claim/placement, and an environment flag. It inserts one `ad_reward_events` row with `SIMULATED` status and one `explorer_xp_events` row with the configured XP amount. It must not query, lock, update, or insert into `trail_point_ledger_entries` or `redemption_requests`.

```json
{
  "adPlacementKey": "quest-completion-cosmetic-v1"
}
```

```json
{
  "adRewardEventId": "01J9YN21A7ZK9614G5CBR9D1ZK",
  "explorerXp": { "delta": 25, "totalXp": 125, "level": 2, "remainingXp": 75 },
  "trailPointsChanged": false,
  "cashValue": null
}
```

### `POST /v1/redemptions`

```json
{
  "requestedPoints": 500,
  "payoutMethodReference": "tokenized-provider-recipient-reference"
}
```

The endpoint must validate whole-currency conversion, configured threshold, available Trail Points, age/identity/geography eligibility, account state, fraud decision, and a verified payment-recipient reference. Do not accept account or card details in this API. In a single transaction, create `REQUESTED`, snapshot eligibility and policy values, create a `REDEMPTION_RESERVATION_DEBIT` ledger entry, create a status event, and write an audit event. Return the request as pending; do not call a payout provider synchronously.

```json
{
  "redemptionId": "01J9YNPB2PWAF5QS1VZCC1WPCM",
  "status": "REQUESTED",
  "requestedPoints": 500,
  "displayedCashEquivalent": "5.00",
  "nextStep": "UNDER_REVIEW"
}
```

## Privileged operations API

Privileged calls require a reviewer/admin role, scoped permissions, step-up authentication, an idempotency key, an explicit reason code, and audit logging. Browser-originated calls use CSRF protection as well as the session check. Do not expose these endpoints to the mobile bundle.

| Method and path | Required permission | Action |
| --- | --- | --- |
| `GET /v1/admin/redemptions?status=UNDER_REVIEW` | `redemptions:read` | Show minimum necessary review data and redacted player details. |
| `POST /v1/admin/redemptions/{id}/transition` | `redemptions:review` | Move through an allowed state transition with a reason code. |
| `POST /v1/admin/redemptions/{id}/compensate` | `redemptions:compensate` | Write a compensating credit after rejection/cancellation/final failure. |
| `POST /v1/admin/beacons` | `beacons:write` | Create or schedule a vetted public/safe beacon. |
| `POST /v1/admin/reward-policies` | `policies:write` | Create a new versioned policy; never overwrite an active historical policy. |
| `GET /v1/admin/audit-events?correlationId=` | `audit:read` | Retrieve an append-only operational audit trail. |

`POST /v1/admin/redemptions/{id}/transition` accepts only allowed state changes. The service obtains a row lock on the redemption, records `from_status` and `to_status`, validates the reviewer’s permission, and commits the request status plus a `redemption_status_events` row atomically. The provider-submission worker is the only component allowed to create `payout_attempts`.

## Provider webhooks and workers

The payout provider and a future approved ad provider communicate through dedicated webhook endpoints. Verify the provider’s signature against a rotated secret, enforce timestamp tolerance, and persist a unique provider event reference before processing. Reply `2xx` only after durable storage. Process the event asynchronously using an outbox record; the worker uses provider idempotency keys and writes a state-transition/audit event after a confirmed result.

| Endpoint | Authentication | Permitted side effect |
| --- | --- | --- |
| `POST /v1/webhooks/payout-provider` | Signature verification plus source allowlist at the gateway where supported. | Update a related payout attempt and redemption state; never directly edit a ledger entry. |
| `POST /v1/webhooks/ad-provider` | Provider signature verification plus replay protection. | Insert a `VERIFIED` ad event and one cosmetic `explorer_xp_events` record only. |

## Operational safeguards

| Control | Requirement |
| --- | --- |
| Idempotency | Enforce an idempotency key on every mutation and retain the first response. |
| Rate limits | Limit quest-session issuance, claims, redemption submissions, cancellations, and privileged review attempts by user, device risk bucket, and IP-risk bucket. |
| Transactionality | Create claim/ledger pairs, redemption/debit pairs, and redemption-state/audit pairs in one transaction. |
| Immutability | Deny update/delete access on event tables; use compensating entries for reversals. |
| Authorization | Scope every query by user ID; use explicit roles/permissions and step-up authentication for reviewer/admin mutations. |
| Privacy | Hash IP/device signals, minimize location retention, encrypt sensitive references, and maintain a retention/deletion policy. |
| Observability | Emit structured logs with correlation IDs, metric counters for accepted/rejected claims and redemptions, and alert on duplicate/velocity/fraud anomalies. |
| Release controls | Feature-flag payouts and live ads independently. Start with both disabled in production until legal, provider, and security review sign-off. |
