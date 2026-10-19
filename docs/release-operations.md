# Release operations

This guide assumes the confirmed production endpoints are:

```text
API:   https://roamrewards-gfvx2j2q.manus.space
OAuth: https://api.manus.im
```

## 1. Configure the protected GitHub Environment

The repository workflow uses the Environment name `production`:

```yaml
environment: production
```

Set the reviewer usernames and secret inputs in your shell, then run the generated GitHub CLI script:

```bash
export PRODUCTION_REVIEWER_LOGINS=reviewer-one,reviewer-two
export ANDROID_KEYSTORE_BASE64_FILE="$HOME/secure/roam-rewards-upload.keystore.base64"
export ANDROID_KEYSTORE_PASSWORD_FILE="$HOME/secure/android-keystore-password"
export ANDROID_KEY_ALIAS_FILE="$HOME/secure/android-key-alias"
export ANDROID_KEY_PASSWORD_FILE="$HOME/secure/android-key-password"

bash scripts/setup-github-production-environment.sh
```

The script derives `OWNER/REPO` from `gh repo view`, creates or updates the `production` Environment with required user reviewers and self-review prevention, and uploads the four values as **Environment secrets**. It does not print secret contents. Use `gh auth login` first. Review the script before running it because environment protection and secret changes are consequential repository settings changes.

Also add the release certificate fingerprint as a non-secret **production Environment variable**. The package name is fixed by the app configuration; the fingerprint must be the SHA-256 fingerprint of the certificate used by the release keystore:

```bash
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
gh variable set EXPECTED_CERT_SHA256 \
  --env production \
  --repo "$repo" \
  --body "AA:BB:CC:...:11"
```

Replace the example fingerprint with the actual 32-byte, colon-separated certificate digest. The protected release workflow passes `EXPECTED_PACKAGE_NAME=com.app.roamrewards` and `EXPECTED_CERT_SHA256` into the Android container and runs with `REQUIRE_IDENTITY_ASSERTIONS=true`; a missing or malformed fingerprint stops the job before artifact upload or Release creation.

For automatic dashboard updates, also configure the callback URL and bearer secret:

```bash
printf '%s' 'https://your-api.example.com/api/internal/github/android-verification' |
  gh variable set APK_VERIFICATION_STATUS_ENDPOINT --env production --repo "$repo" --body -

gh secret set GITHUB_VERIFICATION_WEBHOOK_SECRET \
  --env production \
  --repo "$repo" \
  < "$HOME/secure/github-verification-webhook-secret"
```

The same `GITHUB_VERIFICATION_WEBHOOK_SECRET` must be present in the API runtime. The workflow posts the verified package name, certificate fingerprint, APK SHA-256, release tag, and UTC timestamp to the endpoint only after local identity verification succeeds. The endpoint rejects unauthenticated, malformed, or identity-mismatched `VERIFIED` payloads.

If the repository uses a GitHub team instead of individual reviewers, configure the team through the GitHub UI or extend the script to resolve team IDs; the included script intentionally accepts individual usernames only.

## 2. Provision external Docker Swarm secrets

Initialize or join a Swarm on the deployment host, then provide secret values through protected files or one-time environment variables. File inputs are preferred:

```bash
export DATABASE_URL_FILE=/run/secret-manager/roam-rewards/database-url
export JWT_SECRET_FILE=/run/secret-manager/roam-rewards/jwt-secret
export REDIS_URL_FILE=/run/secret-manager/roam-rewards/redis-url

bash scripts/provision-docker-swarm-secrets.sh
```

The script creates these immutable Swarm secrets and never prints their values:

- `roam-rewards-database-url`
- `roam-rewards-jwt-secret`
- `roam-rewards-redis-url`

If a secret already exists, the script leaves it unchanged. To rotate one, create a versioned replacement, update the Compose secret name, deploy, verify health, and then remove the old secret during a controlled maintenance window. Do not use `docker secret rm` while a running service still references the secret.

Deploy the stack after the image is available on the Swarm nodes:

```bash
docker stack deploy -c docker-compose.runtime.example.yml roam-rewards
docker stack services roam-rewards
docker service ps roam-rewards_api
docker service logs --tail 100 roam-rewards_api
```

The Compose profile references external secrets and mounts them at the paths expected by `scripts/docker-runtime-entrypoint.sh`. The API container refuses to start when any required secret is missing.

## 3. Trigger the protected Android release workflow

Using the GitHub web UI:

1. Open **Actions**.
2. Select **Build signed Android release**.
3. Click **Run workflow**.
4. Choose the branch or tag to build.
5. Start the run.
6. Approve the `production` Environment gate when GitHub requests reviewer approval.
7. Wait for the `release` job to finish.
8. Open the run’s **Artifacts** section and download `roam-rewards-release-apk`.

Using GitHub CLI:

```bash
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
gh workflow run android-release.yml --repo "$repo" --ref main \
  -f release_tag="v1.0.0"
gh run list --workflow android-release.yml --repo "$repo" --limit 5
```

The workflow cannot bypass the protected Environment gate. A reviewer must approve it in GitHub before the signing secrets become available to the job.

After approval and a successful signed build, the workflow automatically creates a GitHub Release and attaches the APK. If `release_tag` is omitted, it uses `v<GitHub run number>`. If the tag already exists, the release step fails rather than overwriting an existing release.

## 4. Verify the downloaded APK locally

After downloading and extracting the artifact:

```bash
bash scripts/verify-android-apk.sh path/to/app-release.apk
```

For the complete post-build check used by CI—including ZIP integrity, required Android entries, leaked signing-material detection, `zipalign`, and `apksigner` verification—run:

```bash
bash scripts/test-signed-apk.sh path/to/app-release.apk
```

The script supports optional local assertions with `EXPECTED_PACKAGE_NAME` and `EXPECTED_CERT_SHA256`. Set `REQUIRE_IDENTITY_ASSERTIONS=true` to require both values, as CI does:

The script prints the APK SHA-256, runs `apksigner verify --verbose --print-certs`, and fails if the APK is not cryptographically valid. For stronger identity verification, compare the printed certificate SHA-256 digest with the fingerprint recorded when the upload keystore was created:

```bash
EXPECTED_PACKAGE_NAME="com.app.roamrewards" \
EXPECTED_CERT_SHA256="AA:BB:CC:...:11" \
REQUIRE_IDENTITY_ASSERTIONS=true \
bash scripts/test-signed-apk.sh path/to/app-release.apk
```

You can also download the artifact directly with GitHub CLI after locating the run ID:

```bash
gh run download RUN_ID --repo "$repo" --name roam-rewards-release-apk --dir ./release-artifact
bash scripts/verify-android-apk.sh ./release-artifact/app-release.apk
```

The same APK is also attached to the GitHub Release named by the workflow tag. Verify both the release asset and the Actions artifact when recording a production release.

A successful verification should show `Verified using v1 scheme (JAR signing)`, `Verified using v2 scheme (APK Signature Scheme v2)`, and, where supported by the installed build-tools, v3/v4 verification lines. Keep the APK SHA-256 and signer fingerprint with the release record; never commit the keystore or signing passwords.

## 5. Publish verification status to the admin dashboard

The protected admin dashboard displays the last server-side release verification state as **VERIFIED**, **FAILED**, **PENDING**, or **NOT CONFIGURED**. Configure these runtime values on the API deployment after recording the workflow result; do not expose the certificate digest itself in client configuration:

```text
APK_IDENTITY_VERIFICATION_STATUS=VERIFIED
APK_IDENTITY_RELEASE_TAG=v1.0.0
APK_IDENTITY_VERIFIED_AT=2026-10-12T20:00:00.000Z
EXPECTED_PACKAGE_NAME=com.app.roamrewards
EXPECTED_CERT_SHA256=<actual-fingerprint>
GITHUB_VERIFICATION_WEBHOOK_SECRET=<same-callback-secret>
```

Set `APK_IDENTITY_VERIFICATION_STATUS=FAILED` when either identity assertion fails. The dashboard procedure is admin-only and refreshes every 30 seconds. `NOT CONFIGURED` is intentionally shown until a real release result is connected; it is not a successful verification.
