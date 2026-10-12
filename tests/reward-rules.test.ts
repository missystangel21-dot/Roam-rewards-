import { describe, expect, it } from "vitest";

import {
  calculateAvailablePoints,
  calculateTodayEarnedPoints,
  canClaimFixedReward,
  canAwardExplorerXp,
  canRequestSimulatedRedemption,
  getExplorerLevelProgress,
} from "../lib/game/reward-rules";
import type { LedgerEntry } from "../lib/game/types";

const today = new Date("2026-08-26T12:00:00.000Z");
const entries: LedgerEntry[] = [
  { id: "1", type: "earn", title: "Riverwalk Signal", points: 60, createdAt: "2026-08-26T10:00:00.000Z", status: "completed" },
  { id: "2", type: "earn", title: "Civic Arch", points: 40, createdAt: "2026-08-25T10:00:00.000Z", status: "completed" },
  { id: "3", type: "redeem", title: "Cash-out review", points: 100, createdAt: "2026-08-26T11:00:00.000Z", status: "pending" },
];

describe("Roam Rewards reward rules", () => {
  it("calculates an append-only ledger balance", () => {
    expect(calculateAvailablePoints(entries)).toBe(0);
  });

  it("counts only completed rewards earned today toward the daily cap", () => {
    expect(calculateTodayEarnedPoints(entries, today)).toBe(60);
  });

  it("rejects duplicate, unsafe, outside-radius, and over-cap fixed reward attempts", () => {
    expect(canClaimFixedReward({ alreadyClaimed: false, todayEarnedPoints: 180, rewardPoints: 60, stoppedForScan: true, isInVerifiedRadius: true })).toBe(true);
    expect(canClaimFixedReward({ alreadyClaimed: true, todayEarnedPoints: 0, rewardPoints: 60, stoppedForScan: true, isInVerifiedRadius: true })).toBe(false);
    expect(canClaimFixedReward({ alreadyClaimed: false, todayEarnedPoints: 0, rewardPoints: 60, stoppedForScan: false, isInVerifiedRadius: true })).toBe(false);
    expect(canClaimFixedReward({ alreadyClaimed: false, todayEarnedPoints: 0, rewardPoints: 60, stoppedForScan: true, isInVerifiedRadius: false })).toBe(false);
    expect(canClaimFixedReward({ alreadyClaimed: false, todayEarnedPoints: 220, rewardPoints: 60, stoppedForScan: true, isInVerifiedRadius: true })).toBe(false);
  });

  it("allows only an available whole-dollar redemption at or above the threshold", () => {
    expect(canRequestSimulatedRedemption(700, 500)).toBe(true);
    expect(canRequestSimulatedRedemption(499, 500)).toBe(false);
    expect(canRequestSimulatedRedemption(700, 550)).toBe(false);
  });

  it("allows Explorer XP once for a verified beacon without affecting Trail Point accounting", () => {
    expect(canAwardExplorerXp({ beaconWasVerified: true, adAlreadyRewarded: false })).toBe(true);
    expect(canAwardExplorerXp({ beaconWasVerified: false, adAlreadyRewarded: false })).toBe(false);
    expect(canAwardExplorerXp({ beaconWasVerified: true, adAlreadyRewarded: true })).toBe(false);
    expect(calculateAvailablePoints(entries)).toBe(0);
  });

  it("calculates the current level, visible progress, and XP remaining for the next level", () => {
    expect(getExplorerLevelProgress(0)).toMatchObject({ level: 1, progressXp: 0, remainingXp: 100, progressPercent: 0 });
    expect(getExplorerLevelProgress(25)).toMatchObject({ level: 1, progressXp: 25, remainingXp: 75, progressPercent: 25 });
    expect(getExplorerLevelProgress(100)).toMatchObject({ level: 2, progressXp: 0, remainingXp: 100, progressPercent: 0 });
    expect(getExplorerLevelProgress(275)).toMatchObject({ level: 3, progressXp: 75, remainingXp: 25, progressPercent: 75 });
  });
});
