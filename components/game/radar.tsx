import { View, Text, StyleSheet } from "react-native";

import type { Beacon } from "@/lib/game/types";

const colorForTheme = {
  mint: "#4ADE80",
  gold: "#F6C453",
  violet: "#C4B5FD",
};

export function Radar({ beacons }: { beacons: Beacon[] }) {
  return (
    <View style={styles.shell} accessibilityLabel="Nearby beacon radar">
      <View style={styles.ringOuter}>
        <View style={styles.ringMiddle}>
          <View style={styles.ringInner} />
        </View>
      </View>
      <View style={styles.userDot} />
      {beacons.slice(0, 3).map((beacon, index) => {
        const positions = [styles.beaconOne, styles.beaconTwo, styles.beaconThree];
        return (
          <View key={beacon.id} style={[styles.beaconWrap, positions[index]]}>
            <View
              style={[
                styles.beacon,
                { backgroundColor: beacon.available ? colorForTheme[beacon.theme] : "#64748B" },
              ]}
            />
            <Text style={[styles.beaconLabel, { color: beacon.available ? "#F8FAFC" : "#94A3B8" }]}>
              {beacon.pointValue}
            </Text>
          </View>
        );
      })}
      <Text style={styles.north}>N</Text>
      <Text style={styles.radarCaption}>Live quest radius</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: 270,
    borderRadius: 28,
    backgroundColor: "#0B1324",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  ringOuter: {
    width: 228,
    height: 228,
    borderRadius: 114,
    borderWidth: 1,
    borderColor: "#35506B",
    alignItems: "center",
    justifyContent: "center",
  },
  ringMiddle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: "#35506B",
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: "#35506B",
  },
  userDot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 4,
    borderColor: "#4ADE80",
  },
  beaconWrap: { position: "absolute", alignItems: "center" },
  beacon: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#0B1324" },
  beaconLabel: { fontSize: 11, fontWeight: "800", marginTop: 3 },
  beaconOne: { top: 48, right: 62 },
  beaconTwo: { bottom: 66, left: 56 },
  beaconThree: { top: 126, right: 34 },
  north: { position: "absolute", top: 18, color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  radarCaption: { position: "absolute", bottom: 16, color: "#94A3B8", fontSize: 12 },
});
