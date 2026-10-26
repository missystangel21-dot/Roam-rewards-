import { createHash } from "node:crypto";
import type { RedisClientType } from "redis";

export type OffenderWindow = "FIFTEEN_MINUTES" | "ONE_HOUR" | "TWENTY_FOUR_HOURS" | "SEVEN_DAYS" | "THIRTY_DAYS";
export type IdentifierVisibility = "MASKED" | "FULL";

const WINDOW_SECONDS: Record<OffenderWindow, number> = {
  FIFTEEN_MINUTES: 15 * 60,
  ONE_HOUR: 60 * 60,
  TWENTY_FOUR_HOURS: 24 * 60 * 60,
  SEVEN_DAYS: 7 * 24 * 60 * 60,
  THIRTY_DAYS: 30 * 24 * 60 * 60,
};

const ALL_WINDOWS = Object.keys(WINDOW_SECONDS) as OffenderWindow[];
type OffenderRedis = Pick<RedisClientType, "hIncrBy" | "expire" | "hGetAll" | "hSet" | "rPush" | "lTrim" | "lRange">;

export type RateLimitAuditEvent = {
  id: string;
  occurredAt: string;
  adminUserId: number;
  setting: "retentionDays" | "identifierVisibility" | "spikeThreshold" | "spikeMultiplier";
  previousValue: string;
  nextValue: string;
};

export type RateLimitPrivacySettings = {
  retentionDays: number;
  identifierVisibility: IdentifierVisibility;
  spikeThreshold: number;
  spikeMultiplier: number;
};

export type RateLimitMetricsSnapshot = {
  allowedRequests: number;
  deniedRequests: number;
  redisCalls: number;
  redisLatencyMs: { count: number; total: number; max: number; average: number };
  recentRedisLatencyMs: number[];
  offenderWindow: OffenderWindow;
  topDeniedSubjects: Array<{ subject: string; deniedRequests: number }>;
  spikeAlerts: Array<{ subject: string; currentDenials: number; previousDenials: number; multiplier: number }>;
};

/** Shared Redis-backed offender metrics, privacy settings, audit history, and spike detection. */
export class RateLimitMetrics {
  private allowedRequests = 0;
  private deniedRequests = 0;
  private redisCalls = 0;
  private redisLatencyTotal = 0;
  private redisLatencyMax = 0;
  private readonly recentRedisLatency: number[] = [];
  private readonly deniedBySubject = new Map<string, number>();
  private readonly localAuditEvents: RateLimitAuditEvent[] = [];
  private redis: OffenderRedis | null = null;
  private redisOffenderPrefix = "roam-rewards:admin-rate-limit:offenders";
  private readonly configKey = "roam-rewards:admin-rate-limit:privacy";
  private readonly auditKey = "roam-rewards:admin-rate-limit:privacy-audit";
  private settings: RateLimitPrivacySettings;

  constructor() {
    this.settings = {
      retentionDays: readBoundedInt("ADMIN_RATE_LIMIT_OFFENDER_RETENTION_DAYS", 7, 1, 30),
      identifierVisibility: process.env.ADMIN_RATE_LIMIT_OFFENDER_ID_MODE === "FULL" ? "FULL" : "MASKED",
      spikeThreshold: readBoundedInt("ADMIN_RATE_LIMIT_OFFENDER_SPIKE_THRESHOLD", 20, 1, 1_000_000),
      spikeMultiplier: readBoundedNumber("ADMIN_RATE_LIMIT_OFFENDER_SPIKE_MULTIPLIER", 2, 1, 100),
    };
  }

  configureRedis(redis: OffenderRedis, key = "roam-rewards:admin-rate-limit:offenders") {
    this.redis = redis;
    this.redisOffenderPrefix = key;
  }

  recordAllowed() {
    this.allowedRequests += 1;
  }

  async recordDenied(subject?: string) {
    this.deniedRequests += 1;
    if (!subject) return;

    await this.loadSharedSettings();
    const displaySubject = formatSubject(subject, this.settings.identifierVisibility);
    this.deniedBySubject.set(displaySubject, (this.deniedBySubject.get(displaySubject) ?? 0) + 1);

    if (!this.redis) return;

    try {
      const writes = ALL_WINDOWS.map(async (window) => {
        const bucket = getBucketKey(this.redisOffenderPrefix, window);
        await this.redis!.hIncrBy(bucket, displaySubject, 1);
        await this.redis!.expire(bucket, this.settings.retentionDays * 24 * 60 * 60);
      });

      await Promise.allSettled(writes);
    } catch (error) {
      console.warn("[AdminRateLimitMetrics] Redis offender aggregation unavailable:", error);
    }
  }

  recordRedisLatency(latencyMs: number) {
    const safeLatency = Math.max(0, latencyMs);
    this.redisCalls += 1;
    this.redisLatencyTotal += safeLatency;
    this.redisLatencyMax = Math.max(this.redisLatencyMax, safeLatency);
    this.recentRedisLatency.push(safeLatency);
    if (this.recentRedisLatency.length > 20) this.recentRedisLatency.shift();
  }

  async snapshot(offenderWindow: OffenderWindow = "SEVEN_DAYS"): Promise<RateLimitMetricsSnapshot> {
    await this.loadSharedSettings();

    let offenderEntries: Array<[string, number]> = [...this.deniedBySubject.entries()];
    let spikeAlerts: RateLimitMetricsSnapshot["spikeAlerts"] = [];

    if (this.redis) {
      try {
        const values = await this.readWindowBuckets(offenderWindow);
        offenderEntries = Object.entries(values).map(([subject, count]) => [subject, Number(count)]);
        spikeAlerts = await this.readSpikeAlerts(offenderWindow);
      } catch (error) {
        console.warn("[AdminRateLimitMetrics] Redis offender snapshot unavailable:", error);
      }
    }

    return {
      allowedRequests: this.allowedRequests,
      deniedRequests: this.deniedRequests,
      redisCalls: this.redisCalls,
      redisLatencyMs: {
        count: this.redisCalls,
        total: this.redisLatencyTotal,
        max: this.redisLatencyMax,
        average: this.redisCalls === 0 ? 0 : this.redisLatencyTotal / this.redisCalls,
      },
      recentRedisLatencyMs: [...this.recentRedisLatency],
      offenderWindow,
      topDeniedSubjects: offenderEntries
        .sort(([, left], [, right]) => right - left)
        .slice(0, 10)
        .map(([subject, deniedRequests]) => ({ subject, deniedRequests })),
      spikeAlerts,
    };
  }

  async getPrivacySettings(): Promise<RateLimitPrivacySettings> {
    await this.loadSharedSettings();
    return { ...this.settings };
  }

  async updatePrivacySettings(
    adminUserId: number,
    update: Partial<Pick<RateLimitPrivacySettings, "retentionDays" | "identifierVisibility" | "spikeThreshold" | "spikeMultiplier">>,
  ) {
    await this.loadSharedSettings();
    const changes: RateLimitAuditEvent[] = [];

    if (update.retentionDays !== undefined && update.retentionDays !== this.settings.retentionDays) {
      const nextValue = validateRetention(update.retentionDays);
      changes.push(this.makeAudit(adminUserId, "retentionDays", String(this.settings.retentionDays), String(nextValue)));
      this.settings.retentionDays = nextValue;
    }

    if (update.identifierVisibility !== undefined && update.identifierVisibility !== this.settings.identifierVisibility) {
      changes.push(this.makeAudit(adminUserId, "identifierVisibility", this.settings.identifierVisibility, update.identifierVisibility));
      this.settings.identifierVisibility = update.identifierVisibility;
    }

    if (update.spikeThreshold !== undefined && update.spikeThreshold !== this.settings.spikeThreshold) {
      const nextValue = validateSpikeThreshold(update.spikeThreshold);
      changes.push(this.makeAudit(adminUserId, "spikeThreshold", String(this.settings.spikeThreshold), String(nextValue)));
      this.settings.spikeThreshold = nextValue;
    }

    if (update.spikeMultiplier !== undefined && update.spikeMultiplier !== this.settings.spikeMultiplier) {
      const nextValue = validateSpikeMultiplier(update.spikeMultiplier);
      changes.push(this.makeAudit(adminUserId, "spikeMultiplier", String(this.settings.spikeMultiplier), String(nextValue)));
      this.settings.spikeMultiplier = nextValue;
    }

    if (this.redis && changes.length) {
      await this.redis.hSet(this.configKey, {
        retentionDays: String(this.settings.retentionDays),
        identifierVisibility: this.settings.identifierVisibility,
        spikeThreshold: String(this.settings.spikeThreshold),
        spikeMultiplier: String(this.settings.spikeMultiplier),
      });
      await this.redis.expire(this.configKey, 30 * 24 * 60 * 60);
      for (const event of changes) {
        await this.redis.rPush(this.auditKey, JSON.stringify(event));
        await this.redis.lTrim(this.auditKey, -100, -1);
        await this.redis.expire(this.auditKey, 30 * 24 * 60 * 60);
      }
    }

    this.localAuditEvents.push(...changes);
    return { settings: await this.getPrivacySettings(), changes };
  }

  async auditEvents(options: { limit?: number; page?: number; dateFrom?: Date; dateTo?: Date } = {}): Promise<{ items: RateLimitAuditEvent[]; page: number; hasMore: boolean }> {
    const limit = Math.min(options.limit ?? 10, 100);
    const page = Math.max(0, options.page ?? 0);

    let events: RateLimitAuditEvent[] = [...this.localAuditEvents].reverse();

    try {
      if (this.redis) {
        const values = await this.redis.lRange(this.auditKey, 0, -1);
        events = values.map((value) => JSON.parse(value) as RateLimitAuditEvent).reverse();
      }
    } catch (error) {
      console.warn("[AdminRateLimitMetrics] Redis audit log unavailable:", error);
      events = [...this.localAuditEvents].reverse();
    }

    const filtered = events.filter(
      (event) =>
        (!options.dateFrom || new Date(event.occurredAt) >= options.dateFrom) &&
        (!options.dateTo || new Date(event.occurredAt) <= options.dateTo),
    );

    const start = page * limit;
    return {
      items: filtered.slice(start, start + limit),
      page,
      hasMore: start + limit < filtered.length,
    };
  }

  private async loadSharedSettings() {
    if (!this.redis) return;
    try {
      const values = await this.redis.hGetAll(this.configKey);
      if (values.retentionDays) this.settings.retentionDays = validateRetention(Number(values.retentionDays));
      if (values.identifierVisibility === "FULL" || values.identifierVisibility === "MASKED") {
        this.settings.identifierVisibility = values.identifierVisibility;
      }
      if (values.spikeThreshold) this.settings.spikeThreshold = validateSpikeThreshold(Number(values.spikeThreshold));
      if (values.spikeMultiplier) this.settings.spikeMultiplier = validateSpikeMultiplier(Number(values.spikeMultiplier));
    } catch (error) {
      console.warn("[AdminRateLimitMetrics] Redis privacy settings unavailable:", error);
    }
  }

  private async readWindowBuckets(window: OffenderWindow): Promise<Record<string, number>> {
    const bucketSeconds = WINDOW_SECONDS[window];
    const now = Math.floor(Date.now() / 1000);
    const firstBucket = Math.floor((now - bucketSeconds) / bucketSeconds);
    const lastBucket = Math.floor(now / bucketSeconds);

    const aggregate: Record<string, number> = {};
    for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
      const values = await this.redis!.hGetAll(`${this.redisOffenderPrefix}:${window}:${bucket}`);
      for (const [subject, count] of Object.entries(values)) {
        aggregate[subject] = (aggregate[subject] ?? 0) + Number(count);
      }
    }
    return aggregate;
  }

  private async readSpikeAlerts(window: OffenderWindow) {
    const current = await this.redis!.hGetAll(getBucketKey(this.redisOffenderPrefix, window));
    const previous = await this.redis!.hGetAll(getBucketKey(this.redisOffenderPrefix, window, Date.now() - WINDOW_SECONDS[window] * 1_000));

    return Object.entries(current)
      .map(([subject, value]) => {
        const currentDenials = Number(value);
        const previousDenials = Number(previous[subject] ?? 0);
        return {
          subject,
          currentDenials,
          previousDenials,
          multiplier: currentDenials / Math.max(1, previousDenials),
        };
      })
      .filter((item) => item.currentDenials >= this.settings.spikeThreshold && item.multiplier >= this.settings.spikeMultiplier)
      .sort((left, right) => right.multiplier - left.multiplier)
      .slice(0, 10);
  }

  private makeAudit(
    adminUserId: number,
    setting: RateLimitAuditEvent["setting"],
    previousValue: string,
    nextValue: string,
  ): RateLimitAuditEvent {
    return { id: crypto.randomUUID(), occurredAt: new Date().toISOString(), adminUserId, setting, previousValue, nextValue };
  }

  reset() {
    this.allowedRequests = 0;
    this.deniedRequests = 0;
    this.redisCalls = 0;
    this.redisLatencyTotal = 0;
    this.redisLatencyMax = 0;
    this.recentRedisLatency.length = 0;
    this.deniedBySubject.clear();
    this.localAuditEvents.length = 0;
  }
}

function getBucketKey(prefix: string, window: OffenderWindow, now = Date.now()) {
  return `${prefix}:${window}:${Math.floor(now / (WINDOW_SECONDS[window] * 1_000))}`;
}

function formatSubject(subject: string, visibility: IdentifierVisibility) {
  if (visibility === "FULL") return subject;
  return `admin-${createHash("sha256").update(subject).digest("hex").slice(0, 12)}`;
}

function validateRetention(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 30) throw new Error("Retention must be an integer from 1 to 30 days");
  return value;
}

function validateSpikeThreshold(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 1_000_000) throw new Error("Spike threshold must be a positive integer");
  return value;
}

function validateSpikeMultiplier(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 100) throw new Error("Spike multiplier must be between 1 and 100");
  return value;
}

function readBoundedInt(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function readBoundedNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? "");
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export const adminRateLimitMetrics = new RateLimitMetrics();
