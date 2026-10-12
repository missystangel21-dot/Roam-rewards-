import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DAILY_POINT_CAP, initialBeacons, REDEMPTION_MINIMUM } from "./game-data";
import { calculateAvailablePoints, calculateTodayEarnedPoints, canAwardExplorerXp, canRequestSimulatedRedemption } from "./reward-rules";
import type { Beacon, LedgerEntry, LocationState } from "./types";

const STORE_KEY = "roam-rewards-prototype-v1";

type StoredGame = {
  completedBeaconIds: string[];
  ledger: LedgerEntry[];
  location: LocationState;
  eligibilityAccepted: boolean;
  explorerXp: number;
  adRewardedBeaconIds: string[];
};

type GameContextValue = {
  beacons: Beacon[];
  completedBeaconIds: string[];
  ledger: LedgerEntry[];
  location: LocationState;
  points: number;
  todayPoints: number;
  isReady: boolean;
  eligibilityAccepted: boolean;
  explorerXp: number;
  getBeacon: (id: string) => Beacon | undefined;
  acceptEligibility: () => void;
  isAdRewardAvailable: (beaconId: string) => boolean;
  awardExplorerXp: (beaconId: string) => boolean;
  requestLocation: () => Promise<void>;
  completeBeacon: (beacon: Beacon) => void;
  requestRedemption: (points: number) => boolean;
  clearDemoProgress: () => void;
};

const GameContext = createContext<GameContextValue | undefined>(undefined);

function dateKey(value: string) {
  return new Date(value).toDateString();
}

export function GameProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [completedBeaconIds, setCompletedBeaconIds] = useState<string[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [location, setLocation] = useState<LocationState>({ label: "Demo explorer area", enabled: false });
  const [eligibilityAccepted, setEligibilityAccepted] = useState(false);
  const [explorerXp, setExplorerXp] = useState(0);
  const [adRewardedBeaconIds, setAdRewardedBeaconIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as StoredGame;
        setCompletedBeaconIds(saved.completedBeaconIds ?? []);
        setLedger(saved.ledger ?? []);
        setLocation(saved.location ?? { label: "Demo explorer area", enabled: false });
        setEligibilityAccepted(saved.eligibilityAccepted ?? false);
        setExplorerXp(saved.explorerXp ?? 0);
        setAdRewardedBeaconIds(saved.adRewardedBeaconIds ?? []);
      })
      .finally(() => setIsReady(true));
  }, []);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ completedBeaconIds, ledger, location, eligibilityAccepted, explorerXp, adRewardedBeaconIds }));
  }, [adRewardedBeaconIds, completedBeaconIds, eligibilityAccepted, explorerXp, isReady, ledger, location]);

  const points = useMemo(() => calculateAvailablePoints(ledger), [ledger]);
  const todayPoints = useMemo(() => calculateTodayEarnedPoints(ledger), [ledger]);

  const beacons = useMemo(
    () => initialBeacons.map((beacon) => ({ ...beacon, available: !completedBeaconIds.includes(beacon.id) })),
    [completedBeaconIds],
  );

  const requestLocation = async () => {
    const serviceEnabled = await Location.hasServicesEnabledAsync();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (!serviceEnabled || status !== "granted") {
      setLocation({ label: "Demo explorer area", enabled: false });
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocation({
      label: "Live foreground location",
      enabled: true,
      accuracyMeters: Math.round(position.coords.accuracy ?? 0),
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const completeBeacon = (beacon: Beacon) => {
    if (completedBeaconIds.includes(beacon.id) || todayPoints + beacon.pointValue > DAILY_POINT_CAP) return;
    const entry: LedgerEntry = {
      id: `earn-${beacon.id}-${Date.now()}`,
      type: "earn",
      title: beacon.title,
      points: beacon.pointValue,
      createdAt: new Date().toISOString(),
      status: "completed",
    };
    setCompletedBeaconIds((current) => [...current, beacon.id]);
    setLedger((current) => [entry, ...current]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: "/quest-complete", params: { beaconId: beacon.id } });
  };

  const requestRedemption = (amount: number) => {
    if (!canRequestSimulatedRedemption(points, amount)) return false;
    const entry: LedgerEntry = {
      id: `redeem-${Date.now()}`,
      type: "redeem",
      title: "Cash-out review",
      points: amount,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    setLedger((current) => [entry, ...current]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return true;
  };

  const isAdRewardAvailable = (beaconId: string) => completedBeaconIds.includes(beaconId) && !adRewardedBeaconIds.includes(beaconId);

  const awardExplorerXp = (beaconId: string) => {
    if (!canAwardExplorerXp({ beaconWasVerified: completedBeaconIds.includes(beaconId), adAlreadyRewarded: adRewardedBeaconIds.includes(beaconId) })) return false;
    setExplorerXp((current) => current + 25);
    setAdRewardedBeaconIds((current) => [...current, beaconId]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  };

  const clearDemoProgress = () => {
    setCompletedBeaconIds([]);
    setLedger([]);
    setLocation({ label: "Demo explorer area", enabled: false });
    setEligibilityAccepted(false);
    setExplorerXp(0);
    setAdRewardedBeaconIds([]);
  };

  return (
    <GameContext.Provider
      value={{
        beacons,
        completedBeaconIds,
        ledger,
        location,
        points,
        todayPoints,
        isReady,
        eligibilityAccepted,
        explorerXp,
        getBeacon: (id) => beacons.find((beacon) => beacon.id === id),
        acceptEligibility: () => setEligibilityAccepted(true),
        isAdRewardAvailable,
        awardExplorerXp,
        requestLocation,
        completeBeacon,
        requestRedemption,
        clearDemoProgress,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within GameProvider");
  return context;
}
