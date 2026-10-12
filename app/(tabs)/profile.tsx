import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useGame } from "@/lib/game/game-context";
import { getExplorerLevelProgress } from "@/lib/game/reward-rules";
import { useAuth } from "@/hooks/use-auth";
import { getUnreadAdminAlertCount } from "@/lib/admin-navigation";
import { AdminProviderAlertsNav } from "@/components/admin-provider-alerts-nav";
import { trpc } from "@/lib/trpc";

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());
  const [undoReadAlertIds, setUndoReadAlertIds] = useState<Set<string> | null>(null);
  const alertSince = useMemo(() => new Date(Date.now() - 15 * 60 * 1_000).toISOString(), []);
  const providerFailures = trpc.adminRedemptions.providerFailures.useQuery({ since: alertSince, limit: 25 }, { enabled: isAdmin, refetchInterval: 5_000, retry: false });
  const readStateKey = user ? `roam-rewards:admin-alerts-read:${user.id}` : null;
  useEffect(() => {
    let active = true;
    if (!isAdmin || !readStateKey) { setReadAlertIds(new Set()); return () => { active = false; }; }
    AsyncStorage.getItem(readStateKey).then((stored) => {
      if (!active) return;
      try { const ids = stored ? JSON.parse(stored) : []; setReadAlertIds(new Set(Array.isArray(ids) ? ids.map(String) : [])); } catch { setReadAlertIds(new Set()); }
    });
    return () => { active = false; };
  }, [isAdmin, readStateKey]);
  const pendingAlertCount = getUnreadAdminAlertCount(providerFailures.data?.items, readAlertIds);
  const markAlertsAsRead = useCallback(async () => {
    if (!isAdmin || !readStateKey || !providerFailures.data) return;
    const previousIds = new Set(readAlertIds);
    const nextIds = new Set(readAlertIds);
    providerFailures.data.items.forEach((failure) => nextIds.add(String(failure.id)));
    setUndoReadAlertIds(previousIds);
    setReadAlertIds(nextIds);
    await AsyncStorage.setItem(readStateKey, JSON.stringify([...nextIds]));
  }, [isAdmin, providerFailures.data, readAlertIds, readStateKey]);
  const undoAlertsMarkAsRead = useCallback(async () => {
    if (!readStateKey || !undoReadAlertIds) return;
    setReadAlertIds(undoReadAlertIds);
    setUndoReadAlertIds(null);
    await AsyncStorage.setItem(readStateKey, JSON.stringify([...undoReadAlertIds]));
  }, [readStateKey, undoReadAlertIds]);
  const { clearDemoProgress, eligibilityAccepted, explorerXp, location } = useGame();
  const levelProgress = getExplorerLevelProgress(explorerXp);
  return <ScreenContainer className="bg-background" containerClassName="bg-background"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.heading}>Explorer settings</Text><View style={styles.identity}><View style={styles.avatar}><IconSymbol size={38} name="person.crop.circle.fill" color="#4ADE80" /></View><View><Text style={styles.name}>Prototype explorer</Text><Text style={styles.member}>U.S. rewards access</Text></View></View><AdminProviderAlertsNav session={user} pendingAlertCount={pendingAlertCount} loading={providerFailures.isLoading} onMarkAsRead={markAlertsAsRead} onUndoMarkAsRead={undoAlertsMarkAsRead} />{isAdmin && <Pressable testID="open-admin-dashboard" accessibilityRole="button" accessibilityLabel="Open rate-limit health dashboard" onPress={() => router.push("/admin-dashboard")} style={({ pressed }) => [styles.adminDashboard, pressed && styles.pressed]}><View style={styles.adminDashboardIcon}><IconSymbol size={19} name="chart.bar.fill" color="#93C5FD" /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>Rate-limit health</Text><Text style={styles.rowValue}>Metrics, Redis latency, and traffic simulator</Text></View><IconSymbol size={16} name="chevron.right" color="#64748B" /></Pressable>}<View style={styles.levelCard}><View style={styles.levelHead}><View><Text style={styles.levelEyebrow}>EXPLORER PROGRESS</Text><Text style={styles.levelTitle}>Level {levelProgress.level}</Text></View><View style={styles.xpBadge}><Text style={styles.xpBadgeValue}>{explorerXp} XP</Text><Text style={styles.xpBadgeCaption}>cosmetic</Text></View></View><View accessibilityRole="progressbar" accessibilityLabel={`Level ${levelProgress.level} Explorer XP progress`} accessibilityValue={{ min: 0, max: 100, now: levelProgress.progressPercent }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${levelProgress.progressPercent}%` }]} /></View><View style={styles.levelFooter}><Text style={styles.levelCurrent}>{levelProgress.progressXp} / 100 XP</Text><Text style={styles.levelRemaining}>{levelProgress.remainingXp} XP to Level {levelProgress.level + 1}</Text></View><Text style={styles.levelNote}>Explorer XP is cosmetic and never changes Trail Points or cash-out eligibility.</Text></View><Text style={styles.section}>Eligibility</Text><View style={styles.group}><Row icon="checkmark.circle.fill" title="Age confirmation" value={eligibilityAccepted ? "Self-attested: U.S. adult" : "Not completed"} /><Row icon="location.fill" title="U.S. location" value={location.enabled ? "Foreground verified" : "Not enabled"} /><Row icon="shield.fill" title="Identity verification" value="Not collected in prototype" last /></View><Text style={styles.section}>Preferences</Text><View style={styles.group}><Row icon="location.fill" title="Location access" value="Foreground only" /><Row icon="wallet.pass.fill" title="Reward updates" value="Off in prototype" last /></View><Pressable onPress={clearDemoProgress} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}><Text style={styles.resetText}>Reset local demo progress</Text></Pressable><Text style={styles.footnote}>Future cash rewards require U.S. adult eligibility, identity and fraud review, payment-provider onboarding, and counsel-approved rules.</Text></ScrollView></ScreenContainer>;
}

function Row({ icon, title, value, last = false }: { icon: "checkmark.circle.fill" | "location.fill" | "shield.fill" | "wallet.pass.fill"; title: string; value: string; last?: boolean }) { return <View style={[styles.row, !last && styles.rowBorder]}><IconSymbol size={19} name={icon} color="#94A3B8" /><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View><IconSymbol size={16} name="chevron.right" color="#64748B" /></View>; }

const styles = StyleSheet.create({ content: { padding: 20, gap: 16, paddingBottom: 28 }, eyebrow: { color: "#4ADE80", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 }, heading: { color: "#F8FAFC", fontSize: 30, fontWeight: "900", letterSpacing: -0.5, marginTop: -9 }, identity: { backgroundColor: "#162334", borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 13, borderWidth: 1, borderColor: "#2B465F" }, avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "#1F2937" }, name: { color: "#F8FAFC", fontSize: 16, fontWeight: "900" }, member: { color: "#94A3B8", fontSize: 12, marginTop: 3 },  levelCard: { backgroundColor: "#162334", borderRadius: 22, padding: 18, gap: 11, borderWidth: 1, borderColor: "#2B465F" }, levelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, levelEyebrow: { color: "#4ADE80", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, levelTitle: { color: "#F8FAFC", fontSize: 22, fontWeight: "900", marginTop: 3 }, xpBadge: { borderRadius: 12, backgroundColor: "#263447", paddingHorizontal: 10, paddingVertical: 7, alignItems: "flex-end" }, xpBadgeValue: { color: "#4ADE80", fontSize: 13, fontWeight: "900" }, xpBadgeCaption: { color: "#94A3B8", fontSize: 9, marginTop: 1 }, progressTrack: { height: 9, borderRadius: 5, backgroundColor: "#334155", overflow: "hidden" }, progressFill: { minWidth: 3, height: "100%", borderRadius: 5, backgroundColor: "#4ADE80" }, levelFooter: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, levelCurrent: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" }, levelRemaining: { color: "#F6C453", fontSize: 11, fontWeight: "800", textAlign: "right" }, levelNote: { color: "#94A3B8", fontSize: 10, lineHeight: 14 }, section: { color: "#F8FAFC", fontSize: 18, fontWeight: "900", marginTop: 4 }, group: { backgroundColor: "#1F2937", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#334155" }, row: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }, rowBorder: { borderBottomWidth: 1, borderColor: "#334155" }, adminDashboard: { backgroundColor: "#162334", borderRadius: 18, borderWidth: 1, borderColor: "#2B465F", minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }, adminDashboardIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#1E3A5F", alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1 }, rowTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" }, rowValue: { color: "#94A3B8", fontSize: 11, marginTop: 3 }, reset: { marginTop: 3, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#263447" }, resetText: { color: "#CBD5E1", fontSize: 13, fontWeight: "800" }, footnote: { color: "#94A3B8", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 2 }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] } });
