import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { trpc } from "@/lib/trpc";
import { getUnseenProviderFailure, rememberProviderFailureIds } from "@/lib/admin-provider-alerts";
import {
  filterAndSortProviderFailures,
  getAlertFilterLabel,
  getAlertSeverity,
  type AlertDateWindow,
  type AlertSeverity,
  type AlertSort,
} from "@/lib/admin-alert-filters";

const POLL_INTERVAL_MS = 30_000;
const LOOKBACK_MS = 15 * 60 * 1_000;

type Toast = { id: string; title: string; body: string };

export default function AdminRedemptionsScreen() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [severity, setSeverity] = useState<AlertSeverity>("ALL");
  const [dateWindow, setDateWindow] = useState<AlertDateWindow>("ALL");
  const [sort, setSort] = useState<AlertSort>("NEWEST");
  const [loadedFailures, setLoadedFailures] = useState<NonNullable<typeof failures.data>["items"]>([]);
  const [continuationCursor, setContinuationCursor] = useState<NonNullable<typeof failures.data>["nextCursor"]>(null);
  const [requestedCursor, setRequestedCursor] = useState<NonNullable<typeof failures.data>["nextCursor"]>(null);

  const seenFailureIdsRef = useRef<Set<string>>(new Set());
  const initialLoad = useRef(true);

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const failures = trpc.adminRedemptions.providerFailures.useQuery(
    { since, limit: 10, severity, dateWindow },
    { refetchInterval: POLL_INTERVAL_MS, retry: false },
  );

  const nextPage = trpc.adminRedemptions.providerFailures.useQuery(
    { since, limit: 10, severity, dateWindow, cursor: requestedCursor ?? undefined },
    { enabled: Boolean(requestedCursor), retry: false },
  );

  const visibleFailures = useMemo(
    () => filterAndSortProviderFailures(loadedFailures, { severity, dateWindow, sort }),
    [loadedFailures, severity, dateWindow, sort],
  );

  useEffect(() => {
    setLoadedFailures([]);
    setContinuationCursor(null);
    setRequestedCursor(null);
  }, [severity, dateWindow]);

  useEffect(() => {
    if (!failures.data) return;

    const items = failures.data.items ?? [];
    setLoadedFailures((current) => {
      if (current.length === 0) return items;
      const seen = new Set(current.map((item) => item.id));
      const merged = [...current];
      for (const item of items) {
        if (!seen.has(item.id)) merged.push(item);
      }
      return merged.slice(-50);
    });

    setContinuationCursor(failures.data.nextCursor);
    setRequestedCursor(null);
  }, [failures.data]);

  useEffect(() => {
    if (!failures.data) return;

    const itemList = failures.data.items ?? [];
    const seen = seenFailureIdsRef.current;

    if (initialLoad.current) {
      for (const item of itemList) seen.add(item.id);
      initialLoad.current = false;
      return;
    }

    const unseen = getUnseenProviderFailure(itemList, seen);
    if (!unseen) return;

    for (const item of itemList) seen.add(item.id);

    setToast({
      id: unseen.id,
      title: "Provider issue",
      body: `Redemption ${unseen.id.slice(0, 8)} failed delivery. Review the request and retry the provider job.`,
    });

    const timer = setTimeout(() => setToast(null), 7_000);
    return () => clearTimeout(timer);
  }, [failures.data]);

  const loadMore = () => {
    if (!continuationCursor || requestedCursor || nextPage.isFetching) return;
    setRequestedCursor(continuationCursor);
  };

  const filterLabel = getAlertFilterLabel({ severity, dateWindow, sort });

  return (
    <View style={styles.screen}>
      {toast && (
        <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.toastTitle}>{toast.title}</Text>
          <Text style={styles.toastBody}>{toast.body}</Text>
        </View>
      )}

      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Provider failures</Text>
      </View>

      <View style={styles.metaCard}>
        <Text style={styles.metaTitle}>Alert monitor</Text>
        <Text style={styles.metaBody}>{filterLabel}</Text>
      </View>

      {failures.isLoading && loadedFailures.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#4ADE80" />
          <Text style={styles.centerText}>Checking provider events…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Recent failures</Text>
          <Text style={styles.sectionMeta}>
            {visibleFailures.length} of {loadedFailures.length}
            {continuationCursor ? " · More available" : ""}
          </Text>

          {visibleFailures.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No provider failures in the selected window.</Text>
            </View>
          ) : (
            visibleFailures.map((failure) => {
              const alertSeverity = getAlertSeverity(failure);
              return (
                <View key={failure.id} style={styles.alertCard}>
                  <View style={styles.alertHeader}>
                    <Text style={styles.alertId}>{failure.id.slice(0, 8)}</Text>
                    <Text
                      style={[
                        styles.alertSeverity,
                        alertSeverity === "CRITICAL" ? styles.severityCritical : styles.severityStandard,
                      ]}
                    >
                      {alertSeverity}
                    </Text>
                  </View>
                  <Text style={styles.alertMeta}>Requested points: {failure.requestedPoints}</Text>
                  <Text style={styles.alertMeta}>Correlation ID: {failure.correlationId}</Text>
                  <Text style={styles.alertMeta}>{new Date(failure.createdAt).toLocaleString()}</Text>
                </View>
              );
            })
          )}

          {continuationCursor && (
            <Pressable
              accessibilityRole="button"
              onPress={loadMore}
              disabled={Boolean(requestedCursor) || nextPage.isFetching}
              style={[styles.loadMore, requestedCursor && styles.loadMoreDisabled]}
            >
              <Text style={styles.loadMoreText}>{requestedCursor ? "Loading…" : "Load more alerts"}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#0F172A" },
  toast: { position: "absolute", top: 12, left: 12, right: 12, zIndex: 2, backgroundColor: "#1E293B", borderRadius: 12, padding: 12 },
  toastTitle: { color: "#F8FAFC", fontWeight: "700" },
  toastBody: { color: "#CBD5E1", marginTop: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1E293B", alignItems: "center", justifyContent: "center" },
  backText: { color: "#E2E8F0", fontSize: 24 },
  title: { color: "#F8FAFC", fontSize: 22, fontWeight: "700" },
  metaCard: { backgroundColor: "#111827", borderRadius: 14, padding: 14, marginBottom: 16 },
  metaTitle: { color: "#4ADE80", fontWeight: "700", marginBottom: 4 },
  metaBody: { color: "#CBD5E1" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  centerText: { color: "#CBD5E1" },
  content: { paddingBottom: 24 },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  sectionMeta: { color: "#94A3B8", marginBottom: 12 },
  emptyState: { backgroundColor: "#111827", borderRadius: 12, padding: 16 },
  emptyText: { color: "#CBD5E1" },
  alertCard: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 12 },
  alertHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  alertId: { color: "#E2E8F0", fontWeight: "700" },
  alertSeverity: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: "700" },
  severityCritical: { backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" },
  severityStandard: { backgroundColor: "rgba(96,165,250,0.15)", color: "#93C5FD" },
  alertMeta: { color: "#CBD5E1", marginBottom: 4 },
  loadMore: { marginTop: 12, backgroundColor: "#1D4ED8", borderRadius: 10, padding: 12, alignItems: "center" },
  loadMoreDisabled: { opacity: 0.5 },
  loadMoreText: { color: "#F8FAFC", fontWeight: "700" },
});
