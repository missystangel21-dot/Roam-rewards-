import { Pressable, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatPoints } from "@/lib/game/game-data";
import type { Beacon } from "@/lib/game/types";

const accentForTheme = { mint: "#4ADE80", gold: "#F6C453", violet: "#C4B5FD" };

export function BeaconCard({ beacon, onPress }: { beacon: Beacon; onPress: () => void }) {
  const accent = accentForTheme[beacon.theme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${beacon.title}, ${beacon.available ? "available" : "completed"}`}
      onPress={onPress}
      disabled={!beacon.available}
      style={({ pressed }) => [styles.card, pressed && beacon.available && styles.pressed, !beacon.available && styles.complete]}
    >
      <View style={[styles.signal, { backgroundColor: accent }]}>
        <IconSymbol size={18} name="location.fill" color="#111827" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{beacon.title}</Text>
        <Text style={styles.meta}>{beacon.available ? `${beacon.distanceMeters} m · ${beacon.zone}` : "Claimed today"}</Text>
      </View>
      <View style={styles.valueWrap}>
        <Text style={[styles.value, { color: beacon.available ? accent : "#94A3B8" }]}>
          {beacon.available ? formatPoints(beacon.pointValue) : "Done"}
        </Text>
        <IconSymbol size={16} name="chevron.right" color="#94A3B8" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: "#334155", backgroundColor: "#1F2937", padding: 14, gap: 12 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  complete: { opacity: 0.56 },
  signal: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1 },
  title: { color: "#F8FAFC", fontSize: 15, fontWeight: "700", lineHeight: 20 },
  meta: { color: "#94A3B8", marginTop: 2, fontSize: 12 },
  valueWrap: { flexDirection: "row", gap: 7, alignItems: "center" },
  value: { fontSize: 13, fontWeight: "800" },
});
