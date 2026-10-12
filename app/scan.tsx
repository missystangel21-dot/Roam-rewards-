import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { formatPoints } from "@/lib/game/game-data";
import { useGame } from "@/lib/game/game-context";
import { canClaimFixedReward } from "@/lib/game/reward-rules";

export default function ScanScreen() {
  const router = useRouter();
  const { beaconId } = useLocalSearchParams<{ beaconId: string }>();
  const { completeBeacon, eligibilityAccepted, getBeacon, location, todayPoints } = useGame();
  const [isScanning, setIsScanning] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [seconds, setSeconds] = useState(3);
  const beacon = useMemo(() => getBeacon(beaconId), [beaconId, getBeacon]);

  useEffect(() => {
    if (!isScanning || seconds === 0) return;
    const timer = setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [isScanning, seconds]);

  useEffect(() => {
    if (isScanning && seconds === 0 && beacon) completeBeacon(beacon);
  }, [beacon, completeBeacon, isScanning, seconds]);

  if (!beacon) return null;
  const canScan = canClaimFixedReward({
    alreadyClaimed: !beacon.available,
    todayEarnedPoints: todayPoints,
    rewardPoints: beacon.pointValue,
    stoppedForScan: safetyAcknowledged && eligibilityAccepted,
    isInVerifiedRadius: location.enabled || beacon.distanceMeters <= beacon.radiusMeters,
  });
  const startScan = () => {
    if (!canScan) return;
    setSeconds(3);
    setIsScanning(true);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background" className="bg-background">
      <View style={styles.screen}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><IconSymbol size={22} name="xmark" color="#F8FAFC" /></Pressable>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>VERIFICATION MODE</Text></View>
        </View>

        <View style={styles.radar}>
          <View style={styles.radarRingLarge}><View style={styles.radarRingMid}><View style={styles.radarRingSmall} /></View></View>
          <View style={styles.beaconGlow}><View style={styles.beaconCore}><IconSymbol size={34} name="location.fill" color="#111827" /></View></View>
          <Text style={styles.distance}>{location.enabled ? "Within GPS zone" : `${beacon.distanceMeters} m in demo zone`}</Text>
          <Text style={styles.radius}>Verified scan radius: {beacon.radiusMeters} m</Text>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.kicker}>ACTIVE BEACON</Text>
          <Text style={styles.title}>{beacon.title}</Text>
          <Text style={styles.body}>Keep your attention on your surroundings. This prototype uses foreground GPS verification and a visual beacon overlay; it never records your camera.</Text>
          <View style={styles.rewardRow}><Text style={styles.rewardLabel}>Fixed reward</Text><Text style={styles.rewardValue}>{formatPoints(beacon.pointValue)}</Text></View>
          <Pressable onPress={() => setSafetyAcknowledged((current) => !current)} style={({ pressed }) => [styles.safetyCheck, safetyAcknowledged && styles.safetyChecked, pressed && styles.pressed]}>
            <IconSymbol size={18} name={safetyAcknowledged ? "checkmark.circle.fill" : "shield.fill"} color={safetyAcknowledged ? "#4ADE80" : "#F6C453"} />
            <Text style={styles.safetyCheckText}>I’m stopped and scanning from a public, safe place.</Text>
          </Pressable>
          {!canScan && <Text style={styles.blocked}>{!eligibilityAccepted ? "Confirm U.S. adult eligibility on Explore before scanning." : safetyAcknowledged ? "This beacon is already claimed, outside the permitted scan zone, or would exceed today’s limit." : "Confirm you are stopped before you scan."}</Text>}
          <Pressable disabled={!canScan || isScanning} onPress={startScan} style={({ pressed }) => [styles.scanButton, (!canScan || isScanning) && styles.disabled, pressed && canScan && styles.pressed]}>
            <IconSymbol size={20} name="camera.viewfinder" color="#111827" />
            <Text style={styles.scanText}>{isScanning ? `Checking ${seconds}s` : "Hold still to scan"}</Text>
          </Pressable>
          <Text style={styles.safety}>Do not use while driving, cycling, or crossing a road.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, justifyContent: "space-between" },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  closeButton: { height: 44, width: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#1F2937" },
  liveBadge: { flexDirection: "row", gap: 7, alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "#162334" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" },
  liveText: { color: "#CBD5E1", fontSize: 10, fontWeight: "800", letterSpacing: 0.9 },
  radar: { flex: 1, alignItems: "center", justifyContent: "center" },
  radarRingLarge: { width: 282, height: 282, borderRadius: 141, borderWidth: 1, borderColor: "#35506B", alignItems: "center", justifyContent: "center" },
  radarRingMid: { width: 184, height: 184, borderRadius: 92, borderWidth: 1, borderColor: "#35506B", alignItems: "center", justifyContent: "center" },
  radarRingSmall: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: "#35506B" },
  beaconGlow: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(74, 222, 128, 0.18)", alignItems: "center", justifyContent: "center", position: "absolute" },
  beaconCore: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#4ADE80", alignItems: "center", justifyContent: "center" },
  distance: { position: "absolute", bottom: "23%", color: "#F8FAFC", fontWeight: "800", fontSize: 15 },
  radius: { position: "absolute", bottom: "18%", color: "#94A3B8", fontSize: 12 },
  sheet: { backgroundColor: "#1F2937", borderRadius: 26, padding: 20, borderWidth: 1, borderColor: "#334155", gap: 12 },
  kicker: { color: "#4ADE80", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
  title: { color: "#F8FAFC", fontSize: 25, fontWeight: "800", letterSpacing: -0.3 },
  body: { color: "#CBD5E1", fontSize: 13, lineHeight: 19 },
  rewardRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 11, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#334155" },
  rewardLabel: { color: "#94A3B8", fontSize: 13 }, rewardValue: { color: "#F6C453", fontSize: 14, fontWeight: "900" },
  safetyCheck: { flexDirection: "row", gap: 9, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: "#263447" },
  safetyChecked: { backgroundColor: "#193829" }, safetyCheckText: { color: "#CBD5E1", flex: 1, fontSize: 12, lineHeight: 17 },
  scanButton: { height: 56, borderRadius: 17, backgroundColor: "#4ADE80", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  scanText: { color: "#111827", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.5 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  safety: { color: "#94A3B8", textAlign: "center", fontSize: 11 }, blocked: { color: "#F6C453", fontSize: 12, lineHeight: 17 },
});
