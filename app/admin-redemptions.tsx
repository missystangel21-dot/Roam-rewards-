import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { getUnseenProviderFailure, rememberProviderFailureIds } from "@/lib/admin-provider-alerts";
import { filterAndSortProviderFailures, getAlertFilterLabel, getAlertSeverity, type AlertDateWindow, type AlertSeverity, type AlertSort } from "@/lib/admin-alert-filters";
import { isTooManyRequestsError, RateLimitRetryCard } from "@/components/rate-limit-retry-card";

const POLL_INTERVAL_MS = 5_000;
const LOOKBACK_MS = 15 * 60 * 1_000;

type Toast = { id: string; title: string; body: string };

export default function AdminRedemptionsScreen() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [seenFailureIds, setSeenFailureIds] = useState<Set<string>>(new Set());
  const [severity, setSeverity] = useState<AlertSeverity>("ALL");
  const [dateWindow, setDateWindow] = useState<AlertDateWindow>("ALL");
  const [sort, setSort] = useState<AlertSort>("NEWEST");
  const [loadedFailures, setLoadedFailures] = useState<NonNullable<typeof failures.data>["items"]>([]);
  const [continuationCursor, setContinuationCursor] = useState<NonNullable<typeof failures.data>["nextCursor"]>(null);
  const [requestedCursor, setRequestedCursor] = useState<NonNullable<typeof failures.data>["nextCursor"]>(null);
  const initialLoad = useRef(true);
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const failures = trpc.adminRedemptions.providerFailures.useQuery({ since, limit: 10, severity, dateWindow }, { refetchInterval: POLL_INTERVAL_MS, retry: false });
  const nextPage = trpc.adminRedemptions.providerFailures.useQuery({ since, limit: 10, severity, dateWindow, cursor: requestedCursor ?? undefined }, { enabled: Boolean(requestedCursor), retry: false });
  const visibleFailures = useMemo(() => filterAndSortProviderFailures(loadedFailures, { severity: "ALL", dateWindow: "ALL", sort }), [loadedFailures, sort]);

  useEffect(() => {
    setLoadedFailures([]);
    setContinuationCursor(null);
    setRequestedCursor(null);
  }, [severity, dateWindow]);

  useEffect(() => {
    if (!failures.data) return;
    setLoadedFailures(failures.data.items);
    setContinuationCursor(failures.data.nextCursor);
    setRequestedCursor(null);
  }, [failures.data]);

  useEffect(() => {
    if (!requestedCursor || !nextPage.data) return;
    setLoadedFailures((current) => [...current, ...nextPage.data.items]);
    setContinuationCursor(nextPage.data.nextCursor);
    setRequestedCursor(null);
  }, [nextPage.data, requestedCursor]);

  useEffect(() => {
    if (!failures.data) return;
    if (initialLoad.current) {
      setSeenFailureIds(rememberProviderFailureIds(failures.data.items));
      initialLoad.current = false;
      return;
    }
    const unseen = getUnseenProviderFailure(failures.data.items, seenFailureIds);
    if (!unseen) return;
    setSeenFailureIds((current) => new Set([...current, unseen.id]));
    setToast({ id: unseen.id, title: "Provider issue", body: `Redemption ${unseen.id.slice(0, 8)} failed delivery. Review the request and retry the provider job.` });
    const timer = setTimeout(() => setToast(null), 7_000);
    return () => clearTimeout(timer);
  }, [failures.data, seenFailureIds]);

  const loadMore = () => {
    if (!continuationCursor || requestedCursor || nextPage.isFetching) return;
    setRequestedCursor(continuationCursor);
  };

  const errorMessage = failures.error?.data?.code === "FORBIDDEN" ? "Admin access is required to view provider alerts." : failures.error || nextPage.error ? "The alert feed is temporarily unavailable. Try again shortly." : null;
  const filterLabel = getAlertFilterLabel({ severity, dateWindow, sort });

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background" className="bg-background">
      <View style={styles.screen}>
        {toast && <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.toast}><View style={styles.toastIcon}><IconSymbol size={19} name="exclamationmark.triangle.fill" color="#111827" /></View><View style={styles.toastCopy}><Text style={styles.toastTitle}>{toast.title}</Text><Text style={styles.toastBody}>{toast.body}</Text></View><Pressable accessibilityLabel="Dismiss provider issue notification" onPress={() => setToast(null)} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}><IconSymbol size={17} name="xmark" color="#FDE68A" /></Pressable></View>}
        <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><IconSymbol size={20} name="chevron.left" color="#F8FAFC" /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>ADMIN CONSOLE</Text><Text style={styles.title}>Provider alerts</Text></View><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View></View>
        <View style={styles.statusCard}><View style={styles.statusIcon}><IconSymbol size={21} name="shield.fill" color="#4ADE80" /></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>Redemption delivery monitor</Text><Text style={styles.statusText}>Polling every 5 seconds. No payout is executed by this screen.</Text></View></View>
        {failures.isLoading && loadedFailures.length === 0 ? <View style={styles.center}><ActivityIndicator color="#4ADE80" /><Text style={styles.centerText}>Checking provider events…</Text></View> : failures.error && isTooManyRequestsError(failures.error) ? <RateLimitRetryCard error={failures.error} /> : errorMessage ? <View style={styles.errorCard}><IconSymbol size={22} name="exclamationmark.triangle.fill" color="#F6C453" /><Text style={styles.errorText}>{errorMessage}</Text></View> : <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <View style={styles.filterPanel} accessibilityLabel="Alert filters"><View style={styles.filterHeader}><View><Text style={styles.filterTitle}>Filter alerts</Text><Text style={styles.filterSummary}>{filterLabel}</Text></View><Pressable testID="reset-alert-filters" accessibilityRole="button" accessibilityLabel="Reset alert filters" onPress={() => { setSeverity("ALL"); setDateWindow("ALL"); setSort("NEWEST"); }} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}><Text style={styles.resetText}>Reset</Text></Pressable></View><FilterGroup label="Severity"><FilterButton testID="alert-severity-all" label="All" active={severity === "ALL"} onPress={() => setSeverity("ALL")} /><FilterButton testID="alert-severity-critical" label="Critical" active={severity === "CRITICAL"} onPress={() => setSeverity("CRITICAL")} /><FilterButton testID="alert-severity-standard" label="Standard" active={severity === "STANDARD"} onPress={() => setSeverity("STANDARD")} /></FilterGroup><FilterGroup label="Date"><FilterButton testID="alert-date-all" label="All" active={dateWindow === "ALL"} onPress={() => setDateWindow("ALL")} /><FilterButton testID="alert-date-five-minutes" label="Last 5m" active={dateWindow === "FIVE_MINUTES"} onPress={() => setDateWindow("FIVE_MINUTES")} /><FilterButton testID="alert-date-fifteen-minutes" label="Last 15m" active={dateWindow === "FIFTEEN_MINUTES"} onPress={() => setDateWindow("FIFTEEN_MINUTES")} /></FilterGroup><FilterGroup label="Sort"><FilterButton testID="alert-sort-newest" label="Newest" active={sort === "NEWEST"} onPress={() => setSort("NEWEST")} /><FilterButton testID="alert-sort-oldest" label="Oldest" active={sort === "OLDEST"} onPress={() => setSort("OLDEST")} /><FilterButton testID="alert-sort-severity" label="Severity" active={sort === "SEVERITY"} onPress={() => setSort("SEVERITY")} /></FilterGroup></View>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent failures</Text><Text style={styles.sectionMeta}>{visibleFailures.length} of {loadedFailures.length}{continuationCursor ? "+" : ""} loaded</Text></View>
          {visibleFailures.length ? visibleFailures.map((failure) => { const alertSeverity = getAlertSeverity(failure); return <View key={failure.id} testID={`provider-alert-${failure.id}`} style={styles.failureCard}><View style={styles.failureTop}><View style={[styles.failureBadge, alertSeverity === "CRITICAL" && styles.criticalBadge]}><Text style={[styles.failureBadgeText, alertSeverity === "CRITICAL" && styles.criticalBadgeText]}>{alertSeverity}</Text></View><Text style={styles.failureTime}>{new Date(failure.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text></View><Text style={styles.failureTitle}>Redemption {failure.id.slice(0, 8)}</Text><Text style={styles.failureMeta}>{failure.requestedPoints.toLocaleString()} Trail Points · correlation {failure.correlationId.slice(0, 8)}</Text><View style={styles.retryRow}><IconSymbol size={17} name="shield.fill" color="#F6C453" /><Text style={styles.retryText}>Outbox retry required; no ledger mutation is needed.</Text></View></View>; }) : <View style={styles.empty}><IconSymbol size={28} name="checkmark.circle.fill" color="#4ADE80" /><Text style={styles.emptyTitle}>No matching provider failures</Text><Text style={styles.emptyText}>Try a broader severity or date filter. New failures will appear here and trigger a toast.</Text></View>}
          {continuationCursor ? <Pressable testID="load-more-alerts" accessibilityRole="button" accessibilityLabel="Load more provider alerts" onPress={loadMore} disabled={Boolean(requestedCursor) || nextPage.isFetching} style={({ pressed }) => [styles.loadMore, pressed && styles.pressed, (requestedCursor || nextPage.isFetching) && styles.disabled]}>{nextPage.isFetching ? <ActivityIndicator color="#A7F3D0" /> : <Text style={styles.loadMoreText}>Load more alerts</Text>}</Pressable> : loadedFailures.length > 0 ? <Text style={styles.endOfList}>All alerts in this window are loaded.</Text> : null}
          <Text style={styles.footer}>Alerts are deduplicated by redemption ID. Critical severity marks requests at or above the dual-approval threshold; filters only change presentation.</Text>
        </ScrollView>}
      </View>
    </ScreenContainer>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.filterGroup}><Text style={styles.filterLabel}>{label}</Text><View style={styles.filterButtons}>{children}</View></View>; }
function FilterButton({ testID, label, active, onPress }: { testID: string; label: string; active: boolean; onPress: () => void }) { return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${label} filter`} onPress={onPress} style={({ pressed }) => [styles.filterButton, active && styles.filterButtonActive, pressed && styles.pressed]}><Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, gap: 16 }, toast: { position: "absolute", zIndex: 2, top: 8, left: 12, right: 12, borderRadius: 18, padding: 13, backgroundColor: "#3D3521", borderWidth: 1, borderColor: "#9A7B2B", flexDirection: "row", alignItems: "center", gap: 10 }, toastIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F6C453", alignItems: "center", justifyContent: "center" }, toastCopy: { flex: 1, gap: 2 }, toastTitle: { color: "#FEF3C7", fontWeight: "900", fontSize: 13 }, toastBody: { color: "#FDE68A", fontSize: 11, lineHeight: 15 }, dismiss: { padding: 7 }, header: { flexDirection: "row", alignItems: "center", gap: 11 }, back: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1, gap: 3 }, eyebrow: { color: "#4ADE80", fontSize: 10, letterSpacing: 1.2, fontWeight: "900" }, title: { color: "#F8FAFC", fontSize: 28, fontWeight: "900", letterSpacing: -0.4 }, livePill: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: "#193829", paddingVertical: 7, paddingHorizontal: 9, borderRadius: 11 }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#4ADE80" }, liveText: { color: "#4ADE80", fontSize: 10, fontWeight: "900" }, statusCard: { backgroundColor: "#162334", borderRadius: 19, borderWidth: 1, borderColor: "#2B465F", padding: 15, flexDirection: "row", gap: 11, alignItems: "center" }, statusIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#193829", alignItems: "center", justifyContent: "center" }, statusCopy: { flex: 1, gap: 3 }, statusTitle: { color: "#F8FAFC", fontSize: 14, fontWeight: "900" }, statusText: { color: "#CBD5E1", fontSize: 11, lineHeight: 16 }, list: { gap: 11, paddingBottom: 24 }, filterPanel: { backgroundColor: "#162334", borderRadius: 18, borderWidth: 1, borderColor: "#2B465F", padding: 13, gap: 10 }, filterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, filterTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "900" }, filterSummary: { color: "#94A3B8", fontSize: 11, marginTop: 2 }, reset: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: "#26374B" }, resetText: { color: "#A7F3D0", fontSize: 11, fontWeight: "800" }, filterGroup: { flexDirection: "row", alignItems: "center", gap: 8 }, filterLabel: { width: 48, color: "#94A3B8", fontSize: 11, fontWeight: "800" }, filterButtons: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }, filterButton: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#26374B", borderWidth: 1, borderColor: "#334155" }, filterButtonActive: { backgroundColor: "#1E5B47", borderColor: "#4ADE80" }, filterButtonText: { color: "#CBD5E1", fontSize: 11, fontWeight: "700" }, filterButtonTextActive: { color: "#DCFCE7", fontWeight: "900" }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }, sectionTitle: { color: "#F8FAFC", fontSize: 19, fontWeight: "900" }, sectionMeta: { color: "#94A3B8", fontSize: 12, fontWeight: "700" }, failureCard: { backgroundColor: "#1F2937", borderRadius: 18, borderWidth: 1, borderColor: "#334155", padding: 16, gap: 8 }, failureTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, failureBadge: { backgroundColor: "#4B2330", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }, failureBadgeText: { color: "#FB7185", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }, criticalBadge: { backgroundColor: "#5B341A" }, criticalBadgeText: { color: "#FCD34D" }, failureTime: { color: "#94A3B8", fontSize: 11 }, failureTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "900" }, failureMeta: { color: "#CBD5E1", fontSize: 12 }, retryRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 2 }, retryText: { color: "#F6C453", fontSize: 11, fontWeight: "700" }, empty: { padding: 27, backgroundColor: "#1F2937", borderRadius: 20, borderWidth: 1, borderColor: "#334155", alignItems: "center", gap: 8 }, emptyTitle: { color: "#F8FAFC", fontSize: 17, fontWeight: "900" }, emptyText: { color: "#94A3B8", fontSize: 12, lineHeight: 17, textAlign: "center" }, center: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 80 }, centerText: { color: "#94A3B8", fontSize: 13 }, errorCard: { backgroundColor: "#3D3521", borderRadius: 18, padding: 18, flexDirection: "row", gap: 11, alignItems: "center" }, errorText: { color: "#FDE68A", fontSize: 13, flex: 1, lineHeight: 19 }, footer: { color: "#64748B", fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 4 }, loadMore: { minHeight: 44, borderRadius: 13, backgroundColor: "#1E5B47", borderWidth: 1, borderColor: "#4ADE80", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }, loadMoreText: { color: "#DCFCE7", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.65 }, endOfList: { color: "#64748B", fontSize: 11, textAlign: "center", paddingVertical: 8 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] } });
