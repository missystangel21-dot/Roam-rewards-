import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { BeaconCard } from "@/components/game/beacon-card";
import { Radar } from "@/components/game/radar";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { DAILY_POINT_CAP, formatCurrencyFromPoints, formatPoints } from "@/lib/game/game-data";
import { useGame } from "@/lib/game/game-context";

export default function ExploreScreen() {
  const router = useRouter();
  const { acceptEligibility, beacons, eligibilityAccepted, explorerXp, isReady, location, points, requestLocation, todayPoints } = useGame();

  if (!isReady) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#4ADE80" /></ScreenContainer>;
  }

  const nearest = beacons.find((beacon) => beacon.available);
  return (
    <ScreenContainer containerClassName="bg-background" className="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ROAM REWARDS</Text>
            <Text style={styles.heading}>Explore on foot.</Text>
          </View>
          <View style={styles.balancePill}>
            <Text style={styles.balanceValue}>{formatCurrencyFromPoints(points)}</Text>
            <Text style={styles.balanceCaption}>{formatPoints(points)}</Text>
            <Text style={styles.xpCaption}>{explorerXp} Explorer XP</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <View style={styles.locationCopy}>
            <IconSymbol size={18} name="location.fill" color="#4ADE80" />
            <View>
              <Text style={styles.locationLabel}>{location.label}</Text>
              <Text style={styles.locationDetail}>
                {location.enabled ? `Foreground verification · ±${location.accuracyMeters ?? 0} m` : "No background tracking"}
              </Text>
            </View>
          </View>
          <Pressable onPress={requestLocation} style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
            <Text style={styles.locationButtonText}>{location.enabled ? "Refresh" : "Use GPS"}</Text>
          </Pressable>
        </View>

        {!eligibilityAccepted && (
          <View style={styles.eligibilityCard}>
            <View style={styles.eligibilityIcon}><IconSymbol size={20} name="shield.fill" color="#111827" /></View>
            <View style={styles.eligibilityCopy}>
              <Text style={styles.eligibilityTitle}>Start with eligibility</Text>
              <Text style={styles.eligibilityText}>Prototype access is limited to U.S. adults. Production payouts would also require identity and fraud review.</Text>
            </View>
            <Pressable onPress={acceptEligibility} style={({ pressed }) => [styles.eligibilityButton, pressed && styles.pressed]}><Text style={styles.eligibilityButtonText}>I’m 18+</Text></Pressable>
          </View>
        )}

        <Radar beacons={beacons} />

        <View style={styles.progressCard}>
          <View>
            <Text style={styles.progressTitle}>Today’s Trail</Text>
            <Text style={styles.progressCopy}>{formatPoints(todayPoints)} of {formatPoints(DAILY_POINT_CAP)} fixed-reward limit</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (todayPoints / DAILY_POINT_CAP) * 100)}%` }]} /></View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Nearby beacons</Text>
          <Text style={styles.sectionMeta}>{beacons.filter((beacon) => beacon.available).length} active</Text>
        </View>
        <View style={styles.beaconList}>
          {beacons.map((beacon) => <BeaconCard key={beacon.id} beacon={beacon} onPress={() => router.push({ pathname: "/scan", params: { beaconId: beacon.id } })} />)}
        </View>

        {nearest ? (
          <Pressable onPress={() => router.push({ pathname: "/scan", params: { beaconId: nearest.id } })} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <IconSymbol size={20} name="camera.viewfinder" color="#111827" />
            <Text style={styles.primaryButtonText}>Scan nearest beacon</Text>
          </Pressable>
        ) : (
          <View style={styles.allDone}><Text style={styles.allDoneText}>You’ve completed every active beacon in this demo area.</Text></View>
        )}

        <View style={styles.notice}>
          <IconSymbol size={18} name="shield.fill" color="#F6C453" />
          <Text style={styles.noticeText}>Walk only. Never scan while driving or enter a restricted place. Rewards are fixed, not random.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  eyebrow: { color: "#4ADE80", fontWeight: "800", letterSpacing: 1.4, fontSize: 11 },
  heading: { color: "#F8FAFC", fontSize: 30, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  balancePill: { backgroundColor: "#1F2937", paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: "#334155", alignItems: "flex-end" },
  balanceValue: { color: "#F6C453", fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  balanceCaption: { color: "#94A3B8", fontSize: 10, marginTop: 1 },
  xpCaption: { color: "#4ADE80", fontSize: 10, marginTop: 3, fontWeight: "700" },
  locationRow: { borderRadius: 18, padding: 14, backgroundColor: "#1F2937", borderWidth: 1, borderColor: "#334155", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  locationCopy: { flexDirection: "row", gap: 9, flex: 1, alignItems: "center" },
  locationLabel: { color: "#F8FAFC", fontSize: 13, fontWeight: "700" },
  locationDetail: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  locationButton: { backgroundColor: "#263447", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  locationButtonText: { color: "#F8FAFC", fontWeight: "700", fontSize: 12 },
  eligibilityCard: { backgroundColor: "#3D3521", borderRadius: 18, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" },
  eligibilityIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F6C453", alignItems: "center", justifyContent: "center" },
  eligibilityCopy: { flex: 1, gap: 2 },
  eligibilityTitle: { color: "#FEF3C7", fontSize: 13, fontWeight: "900" },
  eligibilityText: { color: "#FDE68A", fontSize: 10, lineHeight: 14 },
  eligibilityButton: { borderWidth: 1, borderColor: "#F6C453", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  eligibilityButtonText: { color: "#FDE68A", fontWeight: "900", fontSize: 11 },
  progressCard: { padding: 16, borderRadius: 18, backgroundColor: "#162334", borderWidth: 1, borderColor: "#2B465F", gap: 12 },
  progressTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "800" },
  progressCopy: { color: "#CBD5E1", fontSize: 12, marginTop: 3 },
  progressTrack: { height: 7, backgroundColor: "#334155", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", minWidth: 2, backgroundColor: "#4ADE80", borderRadius: 4 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  sectionTitle: { color: "#F8FAFC", fontSize: 19, fontWeight: "800" },
  sectionMeta: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  beaconList: { gap: 10 },
  primaryButton: { minHeight: 54, borderRadius: 18, backgroundColor: "#4ADE80", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryButtonText: { color: "#111827", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  notice: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 14, backgroundColor: "#1F2937", borderRadius: 16 },
  noticeText: { color: "#CBD5E1", flex: 1, fontSize: 12, lineHeight: 17 },
  allDone: { padding: 16, backgroundColor: "#1F2937", borderRadius: 16, alignItems: "center" },
  allDoneText: { color: "#CBD5E1", fontSize: 13, textAlign: "center" },
});
