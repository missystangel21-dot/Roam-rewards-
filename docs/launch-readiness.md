# Launch readiness checklist

Roam Rewards is a **prototype**. This checklist captures everything in
`LAUNCH_BOUNDARIES.md` that still needs the user — a vendor, a lawyer, or an
account — before any live release. Nothing here is done; every item is open
until its owner says otherwise.

## Payouts and money

| Item | Owner | Status |
| --- | --- | --- |
| Payout-provider agreement and secure recipient onboarding | User | Not started |
| Manual/automated redemption review controls (beyond the existing dual-approval flow) | User | Not started |
| Tax reporting workflow (e.g. 1099 handling for redemptions) | User | Not started |
| Consumer support and payout reconciliation process | User | Not started |
| Merchant/revenue reconciliation for the reward pool | User | Not started |

## Identity, eligibility, and fraud

| Item | Owner | Status |
| --- | --- | --- |
| Age and identity verification vendor | User | Not started |
| State/geographic eligibility rules | User | Not started |
| Sanctions screening and fraud controls | User | Not started |
| Official rules for the rewards program | User | Not started |
| Location-verification vendor assessment and spoofing mitigation | User | Not started |
| Safety-geofence operations | User | Not started |

## Legal and policy review

| Item | Owner | Status |
| --- | --- | --- |
| U.S. counsel approval of the game classification (fixed rewards vs. real-money gaming / lottery) | User (counsel) | Not started |
| Apple App Review classification review before store submission | User (counsel) | Not started |
| Google Play real-money gaming / gamified loyalty review before distribution | User (counsel) | Not started |
| Privacy notice and location-data retention schedule | User (counsel) | Not started |
| Advertising disclosures and consent workflow | User (counsel) | Not started |

## Advertising

| Item | Owner | Status |
| --- | --- | --- |
| Vetted advertising network (no ad SDK is integrated today) | User | Not started |
| Policy review proving ads do not change cash-reward eligibility | User | Not started |

## Accounts and secrets the launch needs

| Item | Owner | Status |
| --- | --- | --- |
| Manus OAuth provider config: `OAUTH_SERVER_URL`, `VITE_APP_ID`, `JWT_SECRET` for live login | User | Not started |
| Production `REDIS_URL` on every API instance (see `docs/production-redis.md`) | User | Not started |
| Production `DATABASE_URL` and `JWT_SECRET` via the secret manager (see `docs/production-runtime-and-signing.md`) | User | Not started |

## Already in place (do not re-do)

- Server-authoritative reward ledger, idempotency, dual-approval redemption
  flow, immutable audit events, and admin rate limiting are implemented and
  tested.
- The Docker runtime refuses to start without the database, JWT, and Redis
  secrets.
- The admin dashboard, provider-failure alerts, and redemption review
  workflow are implemented.
