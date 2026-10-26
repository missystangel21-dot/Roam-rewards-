import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function AdminDashboardScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [offenderWindow, setOffenderWindow] = useState<"FIFTEEN_MINUTES" | "ONE_HOUR" | "TWENTY_FOUR_HOURS" | "SEVEN_DAYS" | "THIRTY_DAYS">("SEVEN_DAYS");

  const metrics = trpc.adminRedemptions.metrics.useQuery(
    { offenderWindow },
    { enabled: isAdmin, refetchInterval: 30_000, retry: false },
  );

  const privacy = trpc.adminRedemptions.privacySettings.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!isAdmin) return;
    void metrics.refetch();
    void privacy.refetch();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Admin access required.</Text>
      </View>
    );
  }

  if (metrics.isLoading || privacy.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4ADE80" />
        <Text style={styles.emptyText}>Loading admin metrics…</Text>
      </View>
    );
  }

  const snapshot = metrics.data;
  const latency = snapshot?.redisLatencyMs ?? { count: 0, total: 0, max: 0, average: 0 };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Admin dashboard</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rate-limit summary</Text>
        <Text style={styles.row}>Allowed: {snapshot?.allowedRequests ?? 0}</Text>
        <Text style={styles.row}>Denied: {snapshot?.deniedRequests ?? 0}</Text>
        <Text style={styles.row}>Redis calls: {snapshot?.redisCalls ?? 0}</Text>
        <Text style={styles.row}>Avg latency: {latency.average.toFixed(2)} ms</Text>
        <Text style={styles.row}>Max latency: {latency.max} ms</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy settings</Text>
        <Text style={styles.row}>Retention days: {privacy.data?.retentionDays ?? "n/a"}</Text>
        <Text style={styles.row}>Identifier visibility: {privacy.data?.identifierVisibility ?? "n/a"}</Text>
        <Text style={styles.row}>Spike threshold: {privacy.data?.spikeThreshold ?? "n/a"}</Text>
        <Text style={styles.row}>Spike multiplier: {privacy.data?.spikeMultiplier ?? "n/a"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Top denied subjects</Text>
        {(snapshot?.topDeniedSubjects ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No denied subjects in the current window.</Text>
        ) : (
          (snapshot?.topDeniedSubjects ?? []).map((entry, index) => (
            <Text key={`${entry.subject}-${index}`} style={styles.row}>
              {entry.subject}: {entry.deniedRequests}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { color: "#F8FAFC", fontSize: 24, fontWeight: "700" },
  card: { backgroundColor: "#111827", borderRadius: 14, padding: 16 },
  cardTitle: { color: "#4ADE80", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  row: { color: "#E2E8F0", marginBottom: 4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0F172A" },
  emptyText: { color: "#CBD5E1" },
});
