import type { Beacon } from "./types";

export const POINTS_PER_DOLLAR = 100;
export const DAILY_POINT_CAP = 250;
export const REDEMPTION_MINIMUM = 500;

export const initialBeacons: Beacon[] = [
  {
    id: "riverwalk-signal",
    title: "Riverwalk Signal",
    zone: "Near",
    pointValue: 60,
    distanceMeters: 48,
    radiusMeters: 80,
    available: true,
    theme: "mint",
  },
  {
    id: "civic-arch",
    title: "Civic Arch",
    zone: "Downtown",
    pointValue: 40,
    distanceMeters: 176,
    radiusMeters: 80,
    available: true,
    theme: "gold",
  },
  {
    id: "gallery-lantern",
    title: "Gallery Lantern",
    zone: "Landmark",
    pointValue: 80,
    distanceMeters: 392,
    radiusMeters: 80,
    available: true,
    theme: "violet",
  },
];

export function formatPoints(points: number) {
  return `${points.toLocaleString()} TP`;
}

export function formatCurrencyFromPoints(points: number) {
  return `$${(points / POINTS_PER_DOLLAR).toFixed(2)}`;
}
