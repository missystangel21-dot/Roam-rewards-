import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DAILY_POINT_CAP, initialBeacons } from "./game-data";
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

export function GameProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [completedBeaconIds, setCompletedBeaconIds] = useState<string[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [location, setLocation] = useState<LocationState>({ label: "Demo explorer area", enabled: false });
  const [eligibilityAccepted, setEligibilityAccepted] = useState(false);
  const [explorerXp, setExplorerXp] = useState(0);
  const [adRewardedBeaconIds, setAdRewardedBeaconIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let isMounted = true;
    const loadSavedGame = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (!raw || !isMounted) return;
        const saved = JSON.parse(raw) as StoredGame;
        setCompletedBeaconIds(saved.completedBeaconIds ?? []);
        setLedger(saved.ledger ?? []);
        setLocation(saved.location ?? { label: "Demo explorer area", enabled: false });
        setEligibilityAccepted(saved.eligibilityAccepted ?? false);
        setExplorerXp(saved.explorerXp ?? 0);
        setAdRewardedBeaconIds(saved.adRewardedBeaconIds ?? []);
      } catch (error) {
        console.warn("[Game] Unable to load saved progress:", error);
      } finally {
        if (isMounted) setIsReady(true);
      }
    };
    void loadSavedGame();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    const serialized = JSON.stringify({ completedBeaconIds, ledger, location, eligibilityAccepted, explorerXp, adRewardedBeaconIds });
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORE_KEY, serialized))
      .catch((error) => console.warn("[Game] Unable to save progress:", error));
  }, [adRewardedBeaconIds, completedBeaconIds, eligibilityAccepted, explorerXp, isReady, ledger, location]);

  const points = useMemo(() => calculateAvailablePoints(ledger), [ledger]);
  const todayPoints = useMemo(() => calculateTodayEarnedPoints(ledger), [ledger]);
  const completedBeaconIdSet = useMemo(() => new Set(completedBeaconIds), [completedBeaconIds]);
  const adRewardedBeaconIdSet = useMemo(() => new Set(adRewardedBeaconIds), [adRewardedBeaconIds]);
  const beacons = useMemo(() => initialBeacons.map((beacon) => ({ ...beacon, available: !completedBeaconIdSet.has(beacon.id) })), [completedBeaconIdSet]);
  const beaconById = useMemo(() => new Map<string, Beacon>(beacons.map((beacon): [string, Beacon] => [beacon.id, beacon])), [beacons]);

  const getBeacon = useCallback((id: string) => beaconById.get(id), [beaconById]);
  const acceptEligibility = useCallback(() => setEligibilityAccepted(true), []);
  const requestLocation = useCallback(async () => {
    try {
      const serviceEnabled = await Location.hasServicesEnabledAsync();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!serviceEnabled || status !== "granted") {
        setLocation({ label: "Demo explorer area", enabled: false });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ label: "Live foreground location", enabled: true, accuracyMeters: Math.round(position.coords.accuracy ?? 0) });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch (error) {
      console.warn("[Game] Unable to obtain location:", error);
      setLocation({ label: "Demo explorer area", enabled: false });
    }
  }, []);

  const completeBeacon = useCallback((beacon: Beacon) => {
    if (completedBeaconIdSet.has(beacon.id) || todayPoints + beacon.pointValue > DAILY_POINT_CAP) return;
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    router.replace({ pathname: "/quest-complete", params: { beaconId: beacon.id } });
  }, [completedBeaconIdSet, router, todayPoints]);

  const requestRedemption = useCallback((amount: number) => {
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    return true;
  }, [points]);

  const isAdRewardAvailable = useCallback(
    (beaconId: string) => completedBeaconIdSet.has(beaconId) && !adRewardedBeaconIdSet.has(beaconId),
    [adRewardedBeaconIdSet, completedBeaconIdSet],
  );
  const awardExplorerXp = useCallback((beaconId: string) => {
    if (!canAwardExplorerXp({ beaconWasVerified: completedBeaconIdSet.has(beaconId), adAlreadyRewarded: adRewardedBeaconIdSet.has(beaconId) })) return false;
    setExplorerXp((current) => current + 25);
    setAdRewardedBeaconIds((current) => [...current, beaconId]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    return true;
  }, [adRewardedBeaconIdSet, completedBeaconIdSet]);

  const clearDemoProgress = useCallback(() => {
    setCompletedBeaconIds([]);
    setLedger([]);
    setLocation({ label: "Demo explorer area", enabled: false });
    setEligibilityAccepted(false);
    setExplorerXp(0);
    setAdRewardedBeaconIds([]);
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    beacons, completedBeaconIds, ledger, location, points, todayPoints, isReady, eligibilityAccepted, explorerXp,
    getBeacon, acceptEligibility, isAdRewardAvailable, awardExplorerXp, requestLocation, completeBeacon, requestRedemption, clearDemoProgress,
  }), [
    acceptEligibility, awardExplorerXp, beacons, clearDemoProgress, completeBeacon, completedBeaconIds, eligibilityAccepted,
    explorerXp, getBeacon, isAdRewardAvailable, isReady, ledger, location, points, requestLocation, requestRedemption, todayPoints,
  ]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used within GameProvider");
  return context;
}
