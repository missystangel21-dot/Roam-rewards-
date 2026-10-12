import type { Express, Request, Response } from "express";
import { adminRateLimitMetrics, type RateLimitMetrics } from "./admin-rate-limit-metrics";

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

function metric(name: string, help: string, type: "counter" | "gauge", value: number) {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}`;
}

function labeledMetric(name: string, labels: Record<string, string>, value: number) {
  const serialized = Object.entries(labels)
    .map(([key, label]) => `${key}="${escapeLabel(label)}"`)
    .join(",");
  return name + "{" + serialized + "} " + value;
}

function escapeLabel(label: string) {
  return label.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export async function renderAdminRateLimitMetrics(metrics: RateLimitMetrics = adminRateLimitMetrics): Promise<string> {
  const snapshot = await metrics.snapshot();
  return [
    metric("roam_rewards_admin_rate_limit_allowed_requests_total", "Total admin API requests allowed by the rate limiter.", "counter", snapshot.allowedRequests),
    metric("roam_rewards_admin_rate_limit_denied_requests_total", "Total admin API requests denied by the rate limiter.", "counter", snapshot.deniedRequests),
    metric("roam_rewards_admin_rate_limit_redis_calls_total", "Total Redis rate-limit evaluations.", "counter", snapshot.redisCalls),
    metric("roam_rewards_admin_rate_limit_redis_latency_ms_count", "Number of Redis latency observations in milliseconds.", "gauge", snapshot.redisLatencyMs.count),
    metric("roam_rewards_admin_rate_limit_redis_latency_ms_sum", "Sum of observed Redis latency in milliseconds.", "gauge", snapshot.redisLatencyMs.total),
    metric("roam_rewards_admin_rate_limit_redis_latency_ms_max", "Maximum observed Redis latency in milliseconds.", "gauge", snapshot.redisLatencyMs.max),
    metric("roam_rewards_admin_rate_limit_redis_latency_ms_average", "Average observed Redis latency in milliseconds.", "gauge", snapshot.redisLatencyMs.average),
    "# HELP roam_rewards_admin_rate_limit_denied_subject_requests Denied admin requests by pseudonymous subject over the selected window.",
    "# TYPE roam_rewards_admin_rate_limit_denied_subject_requests gauge",
    ...snapshot.topDeniedSubjects.map((offender) => labeledMetric("roam_rewards_admin_rate_limit_denied_subject_requests", { subject: offender.subject, window: snapshot.offenderWindow }, offender.deniedRequests)),
    "# HELP roam_rewards_admin_rate_limit_offender_spike Active offender denial-rate spike alerts.",
    "# TYPE roam_rewards_admin_rate_limit_offender_spike gauge",
    ...snapshot.spikeAlerts.map((alert) => labeledMetric("roam_rewards_admin_rate_limit_offender_spike", { subject: alert.subject, window: snapshot.offenderWindow }, 1)),
  ].join("\n") + "\n";
}

function isAuthorized(request: Request): boolean {
  const expectedToken = process.env.METRICS_TOKEN;
  if (!expectedToken) return true;
  return request.header("authorization") === `Bearer ${expectedToken}`;
}

export function registerMetricsRoute(app: Express, metrics: RateLimitMetrics = adminRateLimitMetrics) {
  app.get("/metrics", async (request: Request, response: Response) => {
    if (!isAuthorized(request)) {
      response.setHeader("WWW-Authenticate", "Bearer");
      response.status(401).type("text/plain").send("Metrics authentication required\n");
      return;
    }

    response.setHeader("Content-Type", CONTENT_TYPE);
    try {
      response.status(200).send(await renderAdminRateLimitMetrics(metrics));
    } catch {
      response.status(503).type("text/plain").send("Metrics temporarily unavailable\n");
    }
  });
}
