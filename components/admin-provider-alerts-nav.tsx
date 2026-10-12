import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { canAccessAdminReviewer } from "@/lib/admin-navigation";
import type { User } from "@/lib/_core/auth";

export type AdminProviderAlertsNavProps = {
  session: Pick<User, "role"> | null;
  pendingAlertCount: number;
  loading: boolean;
  onPress?: () => void;
  onMarkAsRead?: () => void;
  onUndoMarkAsRead?: () => void;
  onViewDetails?: () => void;
};

type AdminProviderAlertsNavViewProps = AdminProviderAlertsNavProps & {
  tooltipVisible: boolean;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onToggleTooltip: () => void;
  onMarkAsRead: () => void;
  onUndoMarkAsRead?: () => void;
  onViewDetails?: () => void;
  pulseActive: boolean;
  pulseScale?: Animated.Value;
  pulseOpacity?: Animated.Value;
  onPress: () => void;
};

export function AdminProviderAlertsNav({ session, pendingAlertCount, loading, onPress, onMarkAsRead, onUndoMarkAsRead, onViewDetails }: AdminProviderAlertsNavProps) {
  const router = useRouter();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const pulseActive = !loading && pendingAlertCount > 0 && !reduceMotion;
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!toastVisible) return;
    const timeout = setTimeout(() => setToastVisible(false), 4_000);
    return () => clearTimeout(timeout);
  }, [toastVisible]);
  useEffect(() => {
    if (!pulseActive) { pulseScale.stopAnimation(); pulseOpacity.stopAnimation(); pulseScale.setValue(1); pulseOpacity.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.parallel([Animated.timing(pulseScale, { toValue: 1.08, duration: 700, useNativeDriver: true }), Animated.timing(pulseOpacity, { toValue: 0.78, duration: 700, useNativeDriver: true })]),
      Animated.parallel([Animated.timing(pulseScale, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(pulseOpacity, { toValue: 1, duration: 700, useNativeDriver: true })]),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulseActive, pulseOpacity, pulseScale]);
  return <AdminProviderAlertsNavView session={session} pendingAlertCount={pendingAlertCount} loading={loading} onPress={onPress ?? (() => router.push("/admin-redemptions"))} tooltipVisible={tooltipVisible} toastVisible={toastVisible} onHoverIn={() => setTooltipVisible(true)} onHoverOut={() => setTooltipVisible(false)} onToggleTooltip={() => setTooltipVisible((visible) => !visible)} onMarkAsRead={() => { setTooltipVisible(false); setToastVisible(true); onMarkAsRead?.(); }} onUndoMarkAsRead={() => { setToastVisible(false); onUndoMarkAsRead?.(); }} onViewDetails={onViewDetails ?? (() => router.push("/admin-redemptions"))} pulseActive={pulseActive} pulseScale={pulseScale} pulseOpacity={pulseOpacity} />;
}

export function AdminProviderAlertsNavView({ session, pendingAlertCount, loading, onPress, tooltipVisible, toastVisible = false, onHoverIn, onHoverOut, onToggleTooltip, onMarkAsRead, onUndoMarkAsRead, onViewDetails, pulseActive, pulseScale, pulseOpacity }: AdminProviderAlertsNavViewProps & { toastVisible?: boolean }) {
  if (!canAccessAdminReviewer(session)) return null;
  const countLabel = loading ? "" : `, ${pendingAlertCount} pending alerts`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open provider alerts${countLabel}`} onPress={onPress} style={({ pressed }) => [styles.entry, pressed && styles.pressed]}><View style={styles.icon}><IconSymbol size={19} name="shield.fill" color="#F6C453" /></View><View style={styles.copy}><Text style={styles.eyebrow}>REVIEWER WORKFLOW</Text><Text style={styles.title}>Provider alerts</Text><Text style={styles.description}>Monitor failed redemption delivery and retry status.</Text></View><View style={styles.badgeWrap}><Animated.View style={pulseActive ? { transform: [{ scale: pulseScale ?? 1 }], opacity: pulseOpacity ?? 1 } : undefined}><Pressable testID="provider-alerts-badge" accessible accessibilityRole="text" accessibilityLabel="Pending provider alerts. Tap for alert details." accessibilityHint="Includes provider delivery failures and retryable outbox alerts. Tap to show or hide this description." accessibilityState={{ expanded: tooltipVisible }} onPress={(event) => { event.stopPropagation(); onToggleTooltip(); }} onHoverIn={onHoverIn} onHoverOut={onHoverOut} style={styles.badge}><Text style={styles.badgeText}>{loading ? "…" : pendingAlertCount > 99 ? "99+" : pendingAlertCount}</Text></Pressable></Animated.View>{tooltipVisible && <View accessibilityRole="text" style={styles.tooltip}><Text style={styles.tooltipText}>Provider delivery failures and retryable outbox alerts.</Text><Pressable testID="view-provider-alerts-details" accessibilityRole="link" accessibilityLabel="View provider alert details" onPress={(event) => { event.stopPropagation(); onViewDetails?.(); }} style={({ pressed }) => [styles.markRead, pressed && styles.markReadPressed]}><Text style={styles.markReadText}>View Details</Text></Pressable><Pressable testID="mark-provider-alerts-read" accessibilityRole="button" accessibilityLabel="Mark provider alerts as read" onPress={(event) => { event.stopPropagation(); onMarkAsRead(); }} style={({ pressed }) => [styles.markRead, pressed && styles.markReadPressed]}><Text style={styles.markReadText}>Mark as read</Text></Pressable></View>}{toastVisible && <View testID="provider-alerts-success-toast" accessibilityRole="alert" style={styles.toast}><Text style={styles.toastText}>Alerts marked as read</Text><Pressable testID="undo-provider-alerts-read" accessibilityRole="button" accessibilityLabel="Undo mark as read" onPress={(event) => { event.stopPropagation(); onUndoMarkAsRead?.(); }} style={({ pressed }) => [styles.undo, pressed && styles.markReadPressed]}><Text style={styles.undoText}>Undo</Text></Pressable></View>}</View><IconSymbol size={18} name="chevron.right" color="#F6C453" /></Pressable>;
}

const styles = StyleSheet.create({
  entry: { backgroundColor: "#3D3521", borderRadius: 20, padding: 15, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "#9A7B2B" },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#5A4720", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  eyebrow: { color: "#F6C453", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#FEF3C7", fontSize: 15, fontWeight: "900" },
  description: { color: "#FDE68A", fontSize: 11, lineHeight: 15 },
  badgeWrap: { position: "relative", zIndex: 2 },
  badge: { minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 7, backgroundColor: "#F6C453", alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#332A12", fontSize: 12, fontWeight: "900" },
  tooltip: { position: "absolute", right: 0, bottom: 36, width: 210, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#64748B", shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  tooltipText: { color: "#F8FAFC", fontSize: 11, lineHeight: 15 },
  markRead: { marginTop: 7, alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#334155" },
  markReadText: { color: "#FDE68A", fontSize: 11, fontWeight: "800" },
  markReadPressed: { opacity: 0.72 },
  toast: { position: "absolute", right: 0, bottom: -58, width: 220, minHeight: 44, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#14532D", borderWidth: 1, borderColor: "#4ADE80", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, zIndex: 4, elevation: 5 },
  toastText: { color: "#DCFCE7", fontSize: 11, fontWeight: "800", flex: 1 },
  undo: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#166534" },
  undoText: { color: "#BBF7D0", fontSize: 11, fontWeight: "900" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
