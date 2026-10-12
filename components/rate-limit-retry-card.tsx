import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

function getRetryAfterSeconds(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/retry after\s+(\d+)\s+seconds/i);
  return Math.max(1, match ? Number(match[1]) : 5);
}

export function isTooManyRequestsError(error: unknown): boolean {
  return Boolean((error as { data?: { code?: string } } | null)?.data?.code === "TOO_MANY_REQUESTS") || /too many.*request/i.test(error instanceof Error ? error.message : String(error ?? ""));
}

export function RateLimitRetryCard({ error }: { error: unknown }) {
  const initialSeconds = useMemo(() => getRetryAfterSeconds(error), [error]);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1_000);
    return () => clearInterval(timer);
  }, [initialSeconds]);

  return <View accessibilityRole="alert" style={styles.card}>
    <ActivityIndicator color="#F6C453" />
    <View style={styles.copy}>
      <Text style={styles.title}>You’re doing that a little too quickly</Text>
      <Text style={styles.body}>{secondsLeft > 0 ? `Please try again in ${secondsLeft} second${secondsLeft === 1 ? "" : "s"}.` : "You can try again now."}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#3D3521", borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#9A7B2B" },
  copy: { flex: 1, gap: 3 },
  title: { color: "#FEF3C7", fontSize: 14, fontWeight: "900" },
  body: { color: "#FDE68A", fontSize: 12, lineHeight: 17 },
});
