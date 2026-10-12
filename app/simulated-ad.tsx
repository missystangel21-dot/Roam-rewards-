import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { useGame } from "@/lib/game/game-context";

const AD_DURATION_SECONDS = 3;

export default function SimulatedAdScreen() {
  const router = useRouter();
  const { beaconId } = useLocalSearchParams<{ beaconId: string }>();
  const { awardExplorerXp, isAdRewardAvailable } = useGame();
  const [secondsRemaining, setSecondsRemaining] = useState(AD_DURATION_SECONDS);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (completed || secondsRemaining === 0) return;
    const timer = setTimeout(() => setSecondsRemaining((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [completed, secondsRemaining]);

  useEffect(() => {
    if (secondsRemaining !== 0 || completed) return;
    if (isAdRewardAvailable(beaconId)) awardExplorerXp(beaconId);
    setCompleted(true);
  }, [awardExplorerXp, beaconId, completed, isAdRewardAvailable, secondsRemaining]);

  const progress = ((AD_DURATION_SECONDS - secondsRemaining) / AD_DURATION_SECONDS) * 100;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background" className="bg-background">
      <View style={styles.screen}>
        <View style={styles.topbar}>
          <View style={styles.prototypePill}><Text style={styles.prototypeText}>SIMULATED AD · PROTOTYPE</Text></View>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><IconSymbol size={21} name="xmark" color="#F8FAFC" /></Pressable>
        </View>
        <View style={styles.adCanvas}>
          <View style={styles.adOrb}><Text style={styles.adOrbText}>ROAM</Text></View>
          <Text style={styles.adHeadline}>Keep discovering your city.</Text>
          <Text style={styles.adCopy}>This local demonstration contains no advertising network, tracking, or offer. It is a visual placeholder for product testing only.</Text>
          {!completed && <View style={styles.progressWrap}><View style={[styles.progress, { width: `${progress}%` }]} /></View>}
        </View>
        {completed ? (
          <View style={styles.completeCard}>
            <IconSymbol size={34} name="checkmark.circle.fill" color="#4ADE80" />
            <Text style={styles.completeTitle}>Explorer XP added</Text>
            <Text style={styles.completeValue}>+25 XP</Text>
            <Text style={styles.completeCopy}>Explorer XP is cosmetic progress only. Your Trail Points, fixed cash conversion, and cash-out eligibility did not change.</Text>
            <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}><Text style={styles.returnText}>Back to Explore</Text></Pressable>
          </View>
        ) : (
          <View style={styles.waitCard}><Text style={styles.waitTitle}>Preparing Explorer XP</Text><Text style={styles.waitText}>Completes in {secondsRemaining}s</Text></View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "space-between" }, topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  prototypePill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: "#263447" }, prototypeText: { color: "#CBD5E1", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 }, close: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1F2937", justifyContent: "center", alignItems: "center" },
  adCanvas: { backgroundColor: "#162334", borderWidth: 1, borderColor: "#2B465F", borderRadius: 28, padding: 28, alignItems: "center", gap: 15 }, adOrb: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#4ADE80", justifyContent: "center", alignItems: "center" }, adOrbText: { color: "#111827", fontSize: 16, fontWeight: "900", letterSpacing: 1.4 },
  adHeadline: { color: "#F8FAFC", fontSize: 27, fontWeight: "900", textAlign: "center", letterSpacing: -0.4 }, adCopy: { color: "#CBD5E1", fontSize: 13, lineHeight: 19, textAlign: "center" }, progressWrap: { height: 7, width: "100%", borderRadius: 4, backgroundColor: "#334155", overflow: "hidden", marginTop: 5 }, progress: { height: "100%", borderRadius: 4, backgroundColor: "#4ADE80" },
  waitCard: { alignItems: "center", gap: 5, padding: 20 }, waitTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "900" }, waitText: { color: "#94A3B8", fontSize: 13 },
  completeCard: { backgroundColor: "#1F2937", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#334155", alignItems: "center", gap: 8 }, completeTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "900", marginTop: 3 }, completeValue: { color: "#4ADE80", fontSize: 31, fontWeight: "900" }, completeCopy: { color: "#CBD5E1", textAlign: "center", fontSize: 12, lineHeight: 18, marginVertical: 5 }, returnButton: { height: 54, alignSelf: "stretch", borderRadius: 17, backgroundColor: "#4ADE80", justifyContent: "center", alignItems: "center", marginTop: 6 }, returnText: { color: "#111827", fontSize: 15, fontWeight: "900" }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
