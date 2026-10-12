import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitMetrics } from "../server/_core/admin-rate-limit-metrics";
import { registerMetricsRoute } from "../server/_core/prometheus";

async function startMetricsServer(metrics: RateLimitMetrics): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  registerMetricsRoute(app, metrics);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Metrics server did not expose an address");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

describe("Prometheus metrics endpoint", () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.METRICS_TOKEN;
    delete process.env.METRICS_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalToken;
  });

  it("renders collected counters and Redis latency aggregates in Prometheus text format", async () => {
    const metrics = new RateLimitMetrics();
    metrics.recordAllowed();
    metrics.recordDenied();
    await metrics.recordDenied("user:42");
    metrics.recordRedisLatency(4);
    metrics.recordRedisLatency(6);
    const { server, baseUrl } = await startMetricsServer(metrics);

    try {
      const response = await fetch(`${baseUrl}/metrics`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/^text\/plain;.*version=0\.0\.4/);
      expect(body).toContain("# TYPE roam_rewards_admin_rate_limit_allowed_requests_total counter\nroam_rewards_admin_rate_limit_allowed_requests_total 1");
      expect(body).toContain("# TYPE roam_rewards_admin_rate_limit_denied_requests_total counter\nroam_rewards_admin_rate_limit_denied_requests_total 2");
      expect(body).toContain("roam_rewards_admin_rate_limit_redis_calls_total 2");
      expect(body).toContain("roam_rewards_admin_rate_limit_redis_latency_ms_sum 10");
      expect(body).toContain("roam_rewards_admin_rate_limit_redis_latency_ms_max 6");
      expect(body).toContain("roam_rewards_admin_rate_limit_redis_latency_ms_average 5");
      expect(body).toMatch(/roam_rewards_admin_rate_limit_denied_subject_requests\{subject="admin-[a-f0-9]{12}",window="SEVEN_DAYS"\} 1/);
    } finally {
      await stopServer(server);
    }
  });

  it("requires the configured bearer token and rejects missing or incorrect credentials", async () => {
    process.env.METRICS_TOKEN = "metrics-test-token";
    const { server, baseUrl } = await startMetricsServer(new RateLimitMetrics());

    try {
      const missing = await fetch(`${baseUrl}/metrics`);
      const incorrect = await fetch(`${baseUrl}/metrics`, {
        headers: { authorization: "Bearer wrong-token" },
      });
      const valid = await fetch(`${baseUrl}/metrics`, {
        headers: { authorization: "Bearer metrics-test-token" },
      });

      expect(missing.status).toBe(401);
      expect(incorrect.status).toBe(401);
      expect(valid.status).toBe(200);
      expect(valid.headers.get("content-type")).toMatch(/^text\/plain;.*version=0\.0\.4/);
    } finally {
      await stopServer(server);
    }
  });
});
