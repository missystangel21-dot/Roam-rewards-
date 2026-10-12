# Roam Rewards — Mobile Interface Design

## Experience premise

Roam Rewards is designed for **one-handed use in portrait orientation (9:16)**. The interface follows iOS conventions: a clear navigation hierarchy, generous touch targets, predictable bottom tabs, concise system-permission explanations, and actions placed in the lower reach zone where practical. The visual mood is a trustworthy city-explorer tool rather than a casino or speculative trading interface.

## Color choices

The core palette is intentionally distinct from gambling visual language. **Midnight** `#111827` provides the map-like night canvas. **Signal Mint** `#4ADE80` identifies active beacons and verified progress. **Trail Gold** `#F6C453` denotes points and dollar-equivalent reward values. **Fog** `#CBD5E1` supports secondary text, while **Slate Surface** `#1F2937` separates cards from the background. Success states use `#34D399`; safety warnings use `#FB923C`; blocked and error states use `#FB7185`.

## Screen list

| Screen | Primary content and functionality | Layout and interaction |
| --- | --- | --- |
| Explore | Current area, Trail Points balance, a radar-style location board, active fixed-value beacons, distance, and a primary Scan action. | A compact top balance, large central radar, and bottom-sheet quest card keep the next action within thumb reach. The map is abstract in the prototype and does not expose exact user history. |
| Beacon Scan | Permission-aware augmented scan experience with camera/radar background, target marker, distance confidence, safety reminder, and hold-to-scan control. | Full-screen presentation with dismiss button at top-left and a large hold control above the home indicator. A reduced-motion fallback uses an animated radar instead of camera effects. |
| Quest Complete | Fixed Trail Points earned, value conversion, receipt detail, and a return-to-explore action. | Presented as a success sheet with a calm confirmation tone; it never uses random reveal mechanics. |
| Wallet | Available Trail Points, fixed USD-equivalent conversion, daily cap, redemption threshold, activity receipts, and a simulated cash-out action. | Balance appears first, followed by a clearly labelled status card and a simple chronological receipt list. |
| Redemption Review | Cash-out amount selector bounded by the available balance, eligibility checklist, submission confirmation, and pending status. | A modal flow with short explanatory copy. The prototype labels every request as simulated and does not transmit money. |
| Safety & Rules | Pedestrian-only rules, public-location requirements, privacy explanation, terms/rules link, and quest-report control. | Static, scannable sections with a persistent support action. |
| Profile & Eligibility | Adult/U.S. eligibility status, location-permission state, communication controls, and account actions. | Standard iOS grouped-list pattern with familiar disclosure rows. |

## Key user flows

The primary exploration flow is: **Open Explore → grant foreground location after reading the purpose explanation → select a beacon → arrive within the verified radius → open Beacon Scan → hold to scan → receive a deterministic Trail Points receipt → return to Explore.** The app uses foreground location only during exploring and scanning; it does not ask for background tracking in the prototype.

The reward flow is: **Open Wallet → review available balance and fixed conversion → tap Request cash-out after reaching the displayed threshold → confirm eligibility checklist → submit a simulated request → see Pending review.** The visual language states that no live transfer occurs in the prototype and that future rewards may require age, identity, geography, and fraud review.

The safety flow is: **Open Safety & Rules → read the pedestrian-only and public-place rules → report an unsafe beacon → leave the scan experience.** The app rejects scan completion when simulated walking-safety checks fail and never positions a beacon on a roadway, private residence, school, health-care facility, or restricted property.

## Interaction and accessibility

All primary controls meet a 44 pt minimum target. Large money values use tabular numerals and never rely only on color to communicate status. All scan animations respect Reduce Motion. Camera and location capability failures retain a usable radar-only demonstration mode. The app will use brief haptic confirmation only when a quest is completed or a cash-out request is submitted.

