import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type RedisClientType } from "redis";
import {
  AdminRateLimiter,
  RedisSlidingWindowRateLimiter,
  type AdminRateLimitOptions,
} from "../server/_core/admin-rate-limit";
import { RateLimitMetrics } from "../server/_core/admin-rate-limit-metrics";

const hasRedisServer = spawnSync("redis-server", ["--version"], {
  stdio: "ignore",
}).status === 0;

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine a free local port");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe.skipIf(!hasRedisServer)("Redis sliding-window rate limiter integration", () => {
  let redisProcess: ChildProcess;
  let redisClient: RedisClientType;
  let limiter: RedisSlidingWindowRateLimiter;
  let redisUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    redisUrl = `redis://127.0.0.1:${port}`;
    redisProcess = spawn("redis-server", [
      "--save", "",
      "--appendonly", "no",
      "--port", String(port),
      "--bind", "127.0.0.1",
    ], { stdio: "ignore" });

    redisClient = createClient({ url: redisUrl });
    await redisClient.connect();
    await redisClient.flushDb();
    limiter = new RedisSlidingWindowRateLimiter(
      redisUrl,
      `test:admin-rate-limit:${process.pid}:${Date.now()}:`,
    );
  });

  afterAll(async () => {
    await limiter?.close();
    if (redisClient?.isOpen) await redisClient.quit();
    redisProcess?.kill("SIGTERM");
  });

  it("enforces the limit and admits a request when the oldest event leaves the rolling window", async () => {
    const options: AdminRateLimitOptions = { maxRequests: 2, windowMs: 250 };
    const key = "admin:42:providerFailures";

    const first = await limiter.consume(key, options);
    const second = await limiter.consume(key, options);
    const blocked = await limiter.consume(key, options);

    expect(first).toMatchObject({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(second).toMatchObject({ allowed: true, remaining: 0, retryAfterMs: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(options.windowMs);

    await sleep(blocked.retryAfterMs + 25);
    const afterOldestExpires = await limiter.consume(key, options);
    expect(afterOldestExpires.allowed).toBe(true);
    expect(afterOldestExpires.remaining).toBeGreaterThanOrEqual(0);
    expect(afterOldestExpires.remaining).toBeLessThan(options.maxRequests);
    expect(afterOldestExpires.retryAfterMs).toBe(0);
  }, 5_000);

  it("enforces the shared Redis limit atomically under concurrent requests", async () => {
    const options: AdminRateLimitOptions = { maxRequests: 5, windowMs: 1_000 };
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume("admin:99:providerFailures", options)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(options.maxRequests);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(15);
    expect(decisions.every((decision) => decision.retryAfterMs > 0 || decision.allowed)).toBe(true);
  });

  it("isolates keys for different admins and routes", async () => {
    const options: AdminRateLimitOptions = { maxRequests: 1, windowMs: 500 };

    const adminA = await limiter.consume("admin:1:providerFailures", options);
    const sameAdminSameRoute = await limiter.consume("admin:1:providerFailures", options);
    const differentAdmin = await limiter.consume("admin:2:providerFailures", options);
    const differentRoute = await limiter.consume("admin:1:reviewQueue", options);

    expect(adminA.allowed).toBe(true);
    expect(sameAdminSameRoute.allowed).toBe(false);
    expect(differentAdmin.allowed).toBe(true);
    expect(differentRoute.allowed).toBe(true);
  });

  it("records allowed and denied decisions plus Redis latency samples", async () => {
    const metrics = new RateLimitMetrics();
    const backend = new RedisSlidingWindowRateLimiter(
      redisUrl,
      `test:admin-rate-limit:metrics:${process.pid}:${Date.now()}:`,
      metrics,
    );
    const metricsLimiter = new AdminRateLimiter(
      { maxRequests: 1, windowMs: 500 },
      backend,
      metrics,
    );

    await expect(metricsLimiter.consume("admin:metrics:providerFailures")).resolves.toMatchObject({ allowed: true });
    await expect(metricsLimiter.consume("admin:metrics:providerFailures")).resolves.toMatchObject({ allowed: false });

    const snapshot = await metrics.snapshot();
    expect(snapshot.allowedRequests).toBe(1);
    expect(snapshot.deniedRequests).toBe(1);
    expect(snapshot.redisCalls).toBe(2);
    expect(snapshot.redisLatencyMs.count).toBe(2);
    expect(snapshot.redisLatencyMs.total).toBeGreaterThanOrEqual(0);
    expect(snapshot.redisLatencyMs.max).toBeGreaterThanOrEqual(snapshot.redisLatencyMs.average);

    await backend.close();
  });

  it("aggregates denied subjects across separate backend instances", async () => {
    const sharedPrefix = `test:admin-rate-limit:offenders:${process.pid}:${Date.now()}:`;
    const metricsA = new RateLimitMetrics();
    const metricsB = new RateLimitMetrics();
    const backendA = new RedisSlidingWindowRateLimiter(redisUrl, sharedPrefix, metricsA);
    const backendB = new RedisSlidingWindowRateLimiter(redisUrl, sharedPrefix, metricsB);
    const limiterA = new AdminRateLimiter({ maxRequests: 1, windowMs: 1_000 }, backendA, metricsA);
    const limiterB = new AdminRateLimiter({ maxRequests: 1, windowMs: 1_000 }, backendB, metricsB);

    await limiterA.consume("user:501:path:providerFailures");
    await expect(limiterB.consume("user:501:path:providerFailures")).resolves.toMatchObject({ allowed: false });
    await expect(limiterB.consume("user:501:path:providerFailures")).resolves.toMatchObject({ allowed: false });

    const snapshot = await metricsA.snapshot();
    expect(snapshot.topDeniedSubjects[0].deniedRequests).toBe(2);
    expect(snapshot.topDeniedSubjects[0].subject).toMatch(/^admin-[a-f0-9]{12}$/);
    const hourly = await metricsA.snapshot("ONE_HOUR");
    expect(hourly.topDeniedSubjects).toEqual(snapshot.topDeniedSubjects);

    await metricsA.updatePrivacySettings(501, { retentionDays: 14, spikeThreshold: 2, spikeMultiplier: 2 });
    const spikeSnapshot = await metricsA.snapshot("ONE_HOUR");
    expect(spikeSnapshot.spikeAlerts[0]).toMatchObject({ currentDenials: 2, previousDenials: 0 });
    await expect(metricsB.auditEvents({ limit: 10 })).resolves.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ setting: "retentionDays", nextValue: "14" })]) });

    await backendA.close();
    await backendB.close();
  });
});
