import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createClient, type RedisClientType } from "redis";
import { adminRateLimitMetrics, RateLimitMetrics } from "./admin-rate-limit-metrics";

export type AdminRateLimitOptions = {
  maxRequests: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type RateLimitBackend = {
  consume(key: string, options: AdminRateLimitOptions): Promise<RateLimitDecision>;
  reset(): void;
};

export const DEFAULT_ADMIN_RATE_LIMIT: AdminRateLimitOptions = {
  maxRequests: 60,
  windowMs: 60_000,
};

/**
 * Atomic Redis sliding-window algorithm.
 *
 * Each request is a member in a sorted set scored by Redis server time. The
 * script removes entries older than the rolling window, checks the remaining
 * cardinality, and conditionally adds the new request in one atomic operation.
 */
const REDIS_SLIDING_WINDOW_SCRIPT = `
local time = redis.call('TIME')
local now = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local key = KEYS[1]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local current = redis.call('ZCARD', key)

if current >= maxRequests then
  local earliest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfterMs = math.max(0, tonumber(earliest[2]) + windowMs - now)
  redis.call('PEXPIRE', key, windowMs)
  return { 0, 0, retryAfterMs }
end

redis.call('ZADD', key, now, ARGV[3])
redis.call('PEXPIRE', key, windowMs)
return { 1, maxRequests - current - 1, 0 }
`;

/**
 * Distributed sliding-window limiter backed by Redis.
 *
 * Configure REDIS_URL in every API instance before production deployment.
 * Without REDIS_URL, the factory uses an in-memory sliding-window fallback for
 * tests and single-instance development only.
 */
export class RedisSlidingWindowRateLimiter implements RateLimitBackend {
  private readonly client: RedisClientType;
  private connectAttempt: Promise<void> | undefined;
  private readonly prefix: string;
  private readonly metrics: RateLimitMetrics;

  constructor(redisUrl: string, prefix = "roam-rewards:admin-rate-limit:", metrics = adminRateLimitMetrics) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (error) => {
      console.error("[AdminRateLimit] Redis client error:", error);
    });
    this.prefix = prefix;
    this.metrics = metrics;
    this.metrics.configureRedis(this.client, `${prefix}offenders`);
  }

  /**
   * Connect on first use. A failed attempt is forgotten as soon as it settles,
   * so the next call retries instead of re-throwing a stale rejection forever.
   * The in-flight attempt is shared by concurrent callers and is always
   * observed by the clearing handlers below, so a rejection can never become
   * an unhandled rejection that crashes the process.
   *
   * node-redis retries a dropped connection itself (default reconnect
   * strategy), so an open-but-not-ready client needs no new connect call:
   * commands queue until it is ready.
   */
  private ensureConnected(): Promise<void> {
    if (this.client.isReady || this.client.isOpen) {
      return Promise.resolve();
    }
    if (!this.connectAttempt) {
      this.connectAttempt = this.client.connect().then(() => undefined);
      void this.connectAttempt.then(
        () => {
          this.connectAttempt = undefined;
        },
        () => {
          this.connectAttempt = undefined;
        },
      );
    }
    return this.connectAttempt;
  }

  async consume(key: string, options: AdminRateLimitOptions): Promise<RateLimitDecision> {
    await this.ensureConnected();
    const startedAt = performance.now();
    let result;
    try {
      result = await this.client.eval(REDIS_SLIDING_WINDOW_SCRIPT, {
        keys: [`${this.prefix}${key}`],
        arguments: [String(options.windowMs), String(options.maxRequests), randomUUID()],
      });
    } finally {
      this.metrics.recordRedisLatency(performance.now() - startedAt);
    }
    const [allowed, remaining, retryAfterMs] = result as number[];
    return {
      allowed: allowed === 1,
      remaining: Number(remaining),
      retryAfterMs: Math.max(0, Number(retryAfterMs)),
    };
  }

  reset() {
    // Redis state is intentionally not flushed by application/test reset hooks.
  }

  async close() {
    if (!this.client.isOpen) {
      return;
    }
    await this.client.quit();
  }
}

class InMemorySlidingWindowBackend implements RateLimitBackend {
  private readonly requests = new Map<string, number[]>();

  async consume(key: string, options: AdminRateLimitOptions, now = Date.now()): Promise<RateLimitDecision> {
    const recent = (this.requests.get(key) ?? []).filter(
      (timestamp) => timestamp > now - options.windowMs,
    );

    if (recent.length >= options.maxRequests) {
      this.requests.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, recent[0] + options.windowMs - now),
      };
    }

    recent.push(now);
    this.requests.set(key, recent);
    return {
      allowed: true,
      remaining: Math.max(0, options.maxRequests - recent.length),
      retryAfterMs: 0,
    };
  }

  reset() {
    this.requests.clear();
  }
}

export class AdminRateLimiter {
  private options: AdminRateLimitOptions;
  private backend: RateLimitBackend;
  private readonly metrics: RateLimitMetrics;

  constructor(options: AdminRateLimitOptions, backend: RateLimitBackend, metrics = adminRateLimitMetrics) {
    this.options = validateOptions(options);
    this.backend = backend;
    this.metrics = metrics;
  }

  /** Configure an isolated in-memory backend for deterministic tests. */
  configure(options: AdminRateLimitOptions) {
    this.options = validateOptions(options);
    this.backend = new InMemorySlidingWindowBackend();
    this.metrics.reset();
  }

  async consume(key: string): Promise<RateLimitDecision> {
    const decision = await this.backend.consume(key, this.options);
    if (decision.allowed) this.metrics.recordAllowed();
    else await this.metrics.recordDenied(getRateLimitSubject(key));
    return decision;
  }

  reset() {
    this.backend.reset();
  }
}

function getRateLimitSubject(key: string): string | undefined {
  const match = key.match(/^user:([^:]+):/);
  return match ? `user:${match[1]}` : undefined;
}

export function createAdminRateLimiterFromEnv(): AdminRateLimiter {
  const options = getAdminRateLimitOptionsFromEnv();
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return new AdminRateLimiter(options, new RedisSlidingWindowRateLimiter(redisUrl), adminRateLimitMetrics);
  }

  if (process.env.NODE_ENV === "production") {
    console.warn("[AdminRateLimit] REDIS_URL is missing; using a process-local fallback is not suitable for distributed production.");
  }
  return new AdminRateLimiter(options, new InMemorySlidingWindowBackend(), adminRateLimitMetrics);
}

function validateOptions(options: AdminRateLimitOptions): AdminRateLimitOptions {
  if (!Number.isInteger(options.maxRequests) || options.maxRequests < 1) {
    throw new Error("Admin rate-limit maxRequests must be a positive integer");
  }
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
    throw new Error("Admin rate-limit windowMs must be a positive integer");
  }
  return { ...options };
}

function readPositiveInt(name: string, fallback: number): number {
  // Strict: the whole value must be digits. parseInt would silently accept
  // "60abc" as 60, so it is not used here.
  const raw = process.env[name] ?? "";
  if (!/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getAdminRateLimitOptionsFromEnv(): AdminRateLimitOptions {
  return {
    maxRequests: readPositiveInt("ADMIN_API_RATE_LIMIT_MAX_REQUESTS", DEFAULT_ADMIN_RATE_LIMIT.maxRequests),
    windowMs: readPositiveInt("ADMIN_API_RATE_LIMIT_WINDOW_MS", DEFAULT_ADMIN_RATE_LIMIT.windowMs),
  };
}
