import { DAILY_POINT_CAP, REDEMPTION_MINIMUM } from "./game-data";
import type { LedgerEntry } from "./types";

export function calculateAvailablePoints(entries: LedgerEntry[]) {
  return entries.reduce((total, entry) => total + (entry.type === "earn" ? entry.points : -entry.points), 0);
}

export function calculateTodayEarnedPoints(entries: LedgerEntry[], now = new Date()) {
  const today = now.toDateString();
  return entries
    .filter((entry) => entry.type === "earn" && new Date(entry.createdAt).toDateString() === today)
    .reduce((total, entry) => total + entry.points, 0);
}

export function canClaimFixedReward({
  alreadyClaimed,
  todayEarnedPoints,
  rewardPoints,
  stoppedForScan,
  isInVerifiedRadius,
}: {
  alreadyClaimed: boolean;
  todayEarnedPoints: number;
  rewardPoints: number;
  stoppedForScan: boolean;
  isInVerifiedRadius: boolean;
}) {
  return !alreadyClaimed
    && stoppedForScan
    && isInVerifiedRadius
    && todayEarnedPoints + rewardPoints <= DAILY_POINT_CAP;
}

export function canRequestSimulatedRedemption(points: number, requestedPoints: number) {
  return requestedPoints >= REDEMPTION_MINIMUM && requestedPoints <= points && requestedPoints % 100 === 0;
}

export function canAwardExplorerXp({ beaconWasVerified, adAlreadyRewarded }: { beaconWasVerified: boolean; adAlreadyRewarded: boolean }) {
  return beaconWasVerified && !adAlreadyRewarded;
}

export function getExplorerLevelProgress(explorerXp: number) {
  const normalizedXp = Math.max(0, Math.floor(explorerXp));
  const level = Math.floor(normalizedXp / 100) + 1;
  const levelStartXp = (level - 1) * 100;
  const nextLevelXp = level * 100;
  return {
    level,
    levelStartXp,
    nextLevelXp,
    progressXp: normalizedXp - levelStartXp,
    remainingXp: nextLevelXp - normalizedXp,
    progressPercent: ((normalizedXp - levelStartXp) / 100) * 100,
  };
}
