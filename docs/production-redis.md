# Production Redis requirement

## The rule

`REDIS_URL` **must be set on every API instance in production.**

Without it, `createAdminRateLimiterFromEnv()` falls back to a process-local,
in-memory sliding-window limiter (see `server/_core/admin-rate-limit.ts`).
That fallback is for tests and single-instance development only. In
production it silently breaks two things:

- **Rate limiting stops working across instances.** Each process keeps its
  own counters, so an attacker can send `maxRequests` to every instance
  instead of `maxRequests` in total.
- **Offender metrics and privacy settings stop being shared.** Denied-request
  aggregation, spike alerts, and the shared privacy settings in
  `admin-rate-limit-metrics.ts` become per-process, so the admin dashboard
  shows different numbers depending on which instance answers.

## Where it is already enforced

The Docker runtime enforces it: `scripts/docker-runtime-entrypoint.sh`
refuses to start when the `roam-rewards-redis-url` secret is absent, and
`docs/production-runtime-and-signing.md` documents the secret provisioning.
The Docker Compose runtime (`docker-compose.runtime.example.yml`) also
provides the Redis service itself.

## Open gap (not enforced yet)

A non-Docker deployment (`pnpm start` / `node dist/index.js` with env vars
set directly) does **not** refuse to start without `REDIS_URL`. It only logs
a warning in production and falls back to the in-memory limiter. Before any
non-Docker production deployment, either set `REDIS_URL` explicitly on every
instance or make the server fail fast when it is missing in production.
Owner: user. Status: open.
