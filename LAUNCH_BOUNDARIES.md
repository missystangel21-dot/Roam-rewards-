# Roam Rewards — Live Cash-Rewards Launch Boundaries

## Prototype status

This project is a **mobile prototype**. It implements deterministic fixed Trail Points, local receipt history, foreground GPS permission, an adult-U.S. self-attestation screen, a safety acknowledgement, and a local simulated cash-out request. It does **not** connect to a payment processor, identity-verification vendor, advertising network, tax-reporting system, or live payout account. A simulated request neither moves money nor creates a stored-value account.

## Non-negotiable game design limits

The app must remain free to play. Users must not deposit money, pay an entry fee, stake value, buy chances, purchase a reward boost, or use a paid item to influence a reward. The reward amount, conversion ratio, daily limit, redemption threshold, qualifying task, and eligibility restrictions must be presented clearly before the task begins. Advertising revenue may fund the operator’s reward pool, but ad engagement must not create, improve, or randomize a cash-reward opportunity.

| Product area | Current prototype control | Required before a live release |
| --- | --- | --- |
| Reward earning | A deterministic fixed point value is granted once per beacon and daily cap. | Server-authoritative ledger, idempotency, audited reward configuration, and merchant/revenue reconciliation. |
| Eligibility | Local self-attestation for a U.S. adult. | Age and identity verification, state/geographic eligibility rules, sanctions and fraud controls, and official rules. |
| Location | Foreground-only permission; no location history or player-to-player location sharing. | Privacy notice, retention schedule, location-verification vendor assessment, spoofing mitigation, and safety-geofence operations. |
| Redemption | Local pending receipt only; no payout provider. | Payout-provider agreement, secure recipient onboarding, manual/automated review controls, tax reporting, consumer support, and reconciliation. |
| Advertising | No advertising SDK is integrated. | Vetted advertising network, policy review, consent/disclosure workflow, and proof that ads do not change cash-reward eligibility. |

## Simulated ad-view boundary

The prototype may present a local, non-networked simulated ad after a verified beacon scan. Completing that simulation can award **Explorer XP** only. Explorer XP is a cosmetic progression value: it has no dollar conversion, cannot be redeemed, cannot be transferred, does not affect Trail Point balances, and does not alter a cash-out threshold, reward amount, reward odds, or beacon eligibility. The game must show this separation plainly in both the reward receipt and Wallet.

## Platform and consumer-protection review

The Federal Trade Commission has brought prize-promotion enforcement actions involving misleading claims, including representing that a purchase is needed or increases a chance of winning. The product must not imply that a purchase or advertisement is required to earn a reward. [1]

Apple’s App Review Guidelines prohibit in-app-purchase credit or currency for real-money gaming, and require licensing/permissions and geographic restriction for apps offering real-money gaming or lotteries. The final classification of the product must be reviewed before store submission. [2]

Google Play generally prohibits facilitating real-money gambling or gaming except in defined licensed/approved cases. It separately addresses qualifying gamified loyalty programs, while prohibiting wagering or staking real money for prizes of real-world value. The Android release must be structured and documented as a non-wagering fixed-rewards experience and receive policy/legal review before distribution. [3]

> This document is a product implementation boundary, not legal advice. U.S. counsel should approve the game classification, official rules, advertising disclosures, state availability, reward funding, tax workflow, privacy program, and payout architecture before any live release.

## References

[1] [Federal Trade Commission — Lottery & Sweepstakes](https://www.ftc.gov/lottery-sweepstakes)

[2] [Apple — App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

[3] [Google Play — Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032?hl=en)
