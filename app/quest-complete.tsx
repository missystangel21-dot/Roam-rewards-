import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { formatCurrencyFromPoints, formatPoints } from "@/lib/game/game-data";
import { useGame } from "@/lib/game/game-context";

export default function QuestCompleteScreen() {
  const router = useRouter();
  const { beaconId } = useLocalSearchParams<{ beaconId: string }>();
  const { getBeacon, isAdRewardAvailable } = useGame();
  const beacon = getBeacon(beaconId);
  if (!beacon) return null;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background" className="bg-background">
      <View style={styles.screen}>
        <View style={styles.orbit}><View style={styles.check}><IconSymbol size={48} name="checkmark.circle.fill" color="#4ADE80" /></View></View>
        <View style={styles.copy}>
          <Text style={styles.kicker}>QUEST VERIFIED</Text>
          <Text style={styles.title}>Trail found.</Text>
          <Text style={styles.body}>{beacon.title} added a fixed reward to your local prototype ledger.</Text>
        </View>
        <View style={styles.receipt}>
          <Text style={styles.receiptLabel}>Trail Points added</Text>
          <Text style={styles.receiptValue}>+{formatPoints(beacon.pointValue)}</Text>
          <View style={styles.divider} />
          <Text style={styles.receiptHint}>Fixed conversion value: {formatCurrencyFromPoints(beacon.pointValue)}</Text>
        </View>
        {isAdRewardAvailable(beacon.id) && (
          <Pressable onPress={() => router.push({ pathname: "/simulated-ad", params: { beaconId: beacon.id } })} style={({ pressed }) => [styles.adButton, pressed && styles.pressed]}>
            <View style={styles.adBadge}><Text style={styles.adBadgeText}>AD</Text></View>
            <View style={styles.adCopy}><Text style={styles.adTitle}>View a simulated ad</Text><Text style={styles.adText}>Earn +25 Explorer XP. This does not change Trail Points or cash-out value.</Text></View>
            <IconSymbol size={17} name="chevron.right" color="#4ADE80" />
          </Pressable>
        )}
        <View style={styles.bottom}>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>Continue exploring</Text><IconSymbol size={18} name="arrow.right" color="#111827" /></Pressable>
          <Text style={styles.note}>No cash has been transferred. Future redemptions require eligibility and compliance review.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, justifyContent: "space-between" },
  orbit: { width: 180, height: 180, borderRadius: 90, backgroundColor: "#162334", alignSelf: "center", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2B465F", marginTop: 30 },
  check: { width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(74, 222, 128, 0.12)", alignItems: "center", justifyContent: "center" },
  copy: { gap: 8 }, kicker: { color: "#4ADE80", letterSpacing: 1.4, fontSize: 11, fontWeight: "900" },
  title: { color: "#F8FAFC", fontSize: 36, fontWeight: "900", letterSpacing: -0.6 }, body: { color: "#CBD5E1", fontSize: 15, lineHeight: 22 },
  receipt: { backgroundColor: "#1F2937", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  receiptLabel: { color: "#94A3B8", fontSize: 13 }, receiptValue: { color: "#F6C453", fontSize: 29, fontWeight: "900", marginTop: 6 },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 14 }, receiptHint: { color: "#CBD5E1", fontSize: 12 },
  adButton: { backgroundColor: "#162334", borderRadius: 18, padding: 15, borderWidth: 1, borderColor: "#2B465F", flexDirection: "row", alignItems: "center", gap: 11 },
  adBadge: { width: 33, height: 33, borderRadius: 10, backgroundColor: "#263447", alignItems: "center", justifyContent: "center" }, adBadgeText: { color: "#4ADE80", fontSize: 10, fontWeight: "900" },
  adCopy: { flex: 1, gap: 3 }, adTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "900" }, adText: { color: "#CBD5E1", fontSize: 11, lineHeight: 15 },
  bottom: { gap: 12 }, button: { height: 56, borderRadius: 18, backgroundColor: "#4ADE80", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 }, buttonText: { color: "#111827", fontWeight: "900", fontSize: 15 },
  note: { color: "#94A3B8", textAlign: "center", fontSize: 11, lineHeight: 16 }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
