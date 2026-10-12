export type QuestZone = "Near" | "Downtown" | "Landmark";

export type Beacon = {
  id: string;
  title: string;
  zone: QuestZone;
  pointValue: number;
  distanceMeters: number;
  radiusMeters: number;
  available: boolean;
  theme: "mint" | "gold" | "violet";
};

export type LedgerEntry = {
  id: string;
  type: "earn" | "redeem";
  title: string;
  points: number;
  createdAt: string;
  status: "completed" | "pending";
};

export type LocationState = {
  label: string;
  enabled: boolean;
  accuracyMeters?: number;
};
