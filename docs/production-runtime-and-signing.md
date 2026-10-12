# Production runtime secrets and Android signing

## Confirmed production endpoints

The current deployed public origin is:

```text
https://roamrewards-gfvx2j2q.manus.space
```

Use these non-secret Expo values in `.env.docker.production.example`:

```text
EXPO_PUBLIC_API_BASE_URL=https://roamrewards-gfvx2j2q.manus.space
EXPO_PUBLIC_OAUTH_SERVER_URL=https://api.manus.im
```

The API URL is the deployed Roam Rewards public origin; the OAuth URL is the configured Manus OAuth service. If the deployment later moves to a custom API hostname, update both the example environment file and the release-build inputs together.

## External-secret-backed Docker Compose runtime

`docker-compose.runtime.example.yml` now references **external Docker secrets** rather than local `./secrets/*` files. The expected external secret names are:

- `roam-rewards-database-url`
- `roam-rewards-jwt-secret`
- `roam-rewards-redis-url`

Create those secrets through the deployment platform’s secret manager and make them available to the Docker host or Swarm before starting Compose. The Compose file supports overriding names with `ROAM_REWARDS_DATABASE_URL_SECRET`, `ROAM_REWARDS_JWT_SECRET_NAME`, and `ROAM_REWARDS_REDIS_URL_SECRET`.

For Docker Swarm, provision values out-of-band and never commit them:

```bash
printf '%s' "$DATABASE_URL_VALUE" | docker secret create roam-rewards-database-url -
printf '%s' "$JWT_SECRET_VALUE" | docker secret create roam-rewards-jwt-secret -
printf '%s' "$REDIS_URL_VALUE" | docker secret create roam-rewards-redis-url -

docker compose -f docker-compose.runtime.example.yml config
docker compose -f docker-compose.runtime.example.yml up -d
```

For Kubernetes or a hosted container platform, map the same three secret names to mounted files at `/run/secrets/database_url`, `/run/secrets/jwt_secret`, and `/run/secrets/redis_url`, or use the platform’s native secret-to-file integration. The runtime entrypoint imports those files and refuses to start if a required secret is absent. Do not put secret values in Compose YAML, Dockerfiles, Android bundles, or CI logs.

## Android release signing

The manual `.github/workflows/android-release.yml` workflow is bound to the protected GitHub Environment named `production`. Configure it in GitHub:

1. Open **Repository → Settings → Environments → New environment**.
2. Create an environment named exactly `production`.
3. Enable required reviewers and, if desired, restrict deployment branches/tags.
4. Add these four **Environment secrets**—not repository variables:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
5. Run **Actions → Build signed Android release → Run workflow** and approve the protected-environment gate.

The workflow creates the keystore only during the job, runs Expo prebuild, configures the generated Gradle release signing block, assembles the release APK, uploads the APK for 14 days, and removes signing files in an `always()` cleanup step.

Generate the base64 value locally without committing the keystore:

```bash
base64 -w 0 roam-rewards-upload.keystore > keystore.base64
```

On macOS, use `base64 roam-rewards-upload.keystore | tr -d '\n'` instead. Upload the resulting value as `ANDROID_KEYSTORE_BASE64`, not as a plaintext repository file.
