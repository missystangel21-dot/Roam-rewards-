import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { formatCurrencyFromPoints, formatPoints, REDEMPTION_MINIMUM } from "@/lib/game/game-data";
import { useGame } from "@/lib/game/game-context";

export default function WalletScreen() {
  const router = useRouter();
  const { explorerXp, ledger, points } = useGame();
  const eligible = points >= REDEMPTION_MINIMUM;
  return (
    <ScreenContainer className="bg-background" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>WALLET</Text><Text style={styles.heading}>Your Trail balance</Text>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text><Text style={styles.balance}>{formatCurrencyFromPoints(points)}</Text><Text style={styles.points}>{formatPoints(points)} · 100 TP = $1.00</Text>
          <View style={styles.statusLine}><View style={[styles.statusDot, { backgroundColor: eligible ? "#4ADE80" : "#F6C453" }]} /><Text style={styles.statusText}>{eligible ? "Ready to request a review" : `${formatPoints(REDEMPTION_MINIMUM - points)} to reach the prototype threshold`}</Text></View>
        </View>
        <View style={styles.xpCard}><View style={styles.xpIcon}><Text style={styles.xpIconText}>XP</Text></View><View style={styles.xpCopy}><Text style={styles.xpTitle}>{explorerXp} Explorer XP</Text><Text style={styles.xpText}>Cosmetic progression only. It has no cash value and cannot change Trail Points or cash-out eligibility.</Text></View></View>
        <Pressable disabled={!eligible} onPress={() => router.push("/redeem")} style={({ pressed }) => [styles.redeemButton, !eligible && styles.disabled, pressed && eligible && styles.pressed]}>
          <Text style={styles.redeemText}>{eligible ? "Request cash-out review" : "Reach 500 TP to request review"}</Text><IconSymbol size={18} name="arrow.right" color="#111827" />
        </Pressable>
        <View style={styles.notice}><IconSymbol size={18} name="exclamationmark.triangle.fill" color="#F6C453" /><Text style={styles.noticeText}>Prototype only: redemption requests are stored locally and no money leaves the app.</Text></View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Activity</Text><Text style={styles.sectionMeta}>{ledger.length} receipts</Text></View>
        {ledger.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your first receipt will appear here.</Text><Text style={styles.emptyCopy}>Find a nearby beacon and complete its fixed reward scan.</Text></View> : <View style={styles.list}>{ledger.map((entry) => <View key={entry.id} style={styles.row}><View style={[styles.rowIcon, { backgroundColor: entry.type === "earn" ? "#193829" : "#3D3521" }]}><IconSymbol size={17} name={entry.type === "earn" ? "checkmark.circle.fill" : "wallet.pass.fill"} color={entry.type === "earn" ? "#4ADE80" : "#F6C453"} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{entry.title}</Text><Text style={styles.rowMeta}>{entry.status === "pending" ? "Pending review" : new Date(entry.createdAt).toLocaleDateString()}</Text></View><Text style={[styles.rowValue, { color: entry.type === "earn" ? "#4ADE80" : "#F6C453" }]}>{entry.type === "earn" ? "+" : "−"}{formatPoints(entry.points)}</Text></View>)}</View>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 28 }, eyebrow: { color: "#4ADE80", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, heading: { color: "#F8FAFC", fontSize: 30, fontWeight: "900", letterSpacing: -0.5, marginTop: -9 },
  balanceCard: { backgroundColor: "#162334", borderRadius: 24, padding: 22, borderWidth: 1, borderColor: "#2B465F", gap: 6 }, balanceLabel: { color: "#CBD5E1", fontSize: 13 }, balance: { color: "#F6C453", fontSize: 42, fontWeight: "900", fontVariant: ["tabular-nums"] }, points: { color: "#94A3B8", fontSize: 12 },
  statusLine: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 7 }, statusDot: { height: 8, width: 8, borderRadius: 4 }, statusText: { color: "#F8FAFC", fontSize: 12, fontWeight: "700" },
  xpCard: { backgroundColor: "#1F2937", borderRadius: 18, padding: 15, borderWidth: 1, borderColor: "#334155", flexDirection: "row", gap: 11, alignItems: "center" }, xpIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: "#263447", alignItems: "center", justifyContent: "center" }, xpIconText: { color: "#4ADE80", fontSize: 12, fontWeight: "900" }, xpCopy: { flex: 1 }, xpTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "900" }, xpText: { color: "#CBD5E1", fontSize: 11, lineHeight: 16, marginTop: 3 },
  redeemButton: { height: 54, borderRadius: 17, backgroundColor: "#4ADE80", flexDirection: "row", gap: 9, justifyContent: "center", alignItems: "center" }, redeemText: { color: "#111827", fontSize: 15, fontWeight: "900" }, disabled: { opacity: 0.46 }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  notice: { backgroundColor: "#1F2937", borderRadius: 16, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start" }, noticeText: { color: "#CBD5E1", fontSize: 12, lineHeight: 17, flex: 1 },
  sectionHead: { marginTop: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionTitle: { color: "#F8FAFC", fontSize: 20, fontWeight: "900" }, sectionMeta: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  empty: { padding: 20, borderRadius: 18, borderWidth: 1, borderColor: "#334155", backgroundColor: "#1F2937", gap: 4 }, emptyTitle: { color: "#F8FAFC", fontWeight: "800", fontSize: 14 }, emptyCopy: { color: "#94A3B8", fontSize: 12, lineHeight: 17 }, list: { gap: 9 }, row: { backgroundColor: "#1F2937", padding: 14, borderRadius: 17, borderWidth: 1, borderColor: "#334155", flexDirection: "row", alignItems: "center", gap: 12 }, rowIcon: { height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1 }, rowTitle: { color: "#F8FAFC", fontWeight: "800", fontSize: 14 }, rowMeta: { color: "#94A3B8", marginTop: 2, fontSize: 11 }, rowValue: { fontWeight: "900", fontSize: 13 },
});
