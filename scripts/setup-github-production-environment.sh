#!/usr/bin/env bash
set -Eeuo pipefail

# Required before running:
#   gh auth login
#   PRODUCTION_REVIEWER_LOGINS=alice,bob
#   ANDROID_KEYSTORE_BASE64 or ANDROID_KEYSTORE_BASE64_FILE
#   ANDROID_KEYSTORE_PASSWORD or ANDROID_KEYSTORE_PASSWORD_FILE
#   ANDROID_KEY_ALIAS or ANDROID_KEY_ALIAS_FILE
#   ANDROID_KEY_PASSWORD or ANDROID_KEY_PASSWORD_FILE

command -v gh >/dev/null || { echo "gh CLI is required" >&2; exit 1; }
gh auth status >/dev/null
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
reviewers="${PRODUCTION_REVIEWER_LOGINS:-}"
[[ -n "$reviewers" ]] || { echo "Set PRODUCTION_REVIEWER_LOGINS to comma-separated GitHub usernames" >&2; exit 1; }

reviewer_ids=()
IFS=',' read -r -a reviewer_logins <<< "$reviewers"
for login in "${reviewer_logins[@]}"; do
  login="${login//[[:space:]]/}"
  [[ -n "$login" ]] || continue
  reviewer_ids+=("$(gh api "users/$login" --jq .id)")
done
[[ "${#reviewer_ids[@]}" -gt 0 ]] || { echo "No valid reviewers supplied" >&2; exit 1; }

reviewer_json="$(REVIEWER_IDS="$(IFS=,; echo "${reviewer_ids[*]}")" python3 - <<'PY'
import json, os
print(json.dumps([{"type": "User", "id": int(value)} for value in os.environ["REVIEWER_IDS"].split(",") if value]))
PY
)"

printf '%s' "{\"wait_timer\":0,\"prevent_self_review\":true,\"reviewers\":$reviewer_json}" \
  | gh api --method PUT "repos/$repo/environments/production" --input - >/dev/null

echo "Configured protected GitHub Environment: production for $repo"

echo "Reviewer identities configured: ${#reviewer_ids[@]}"

echo "Set environment secrets without printing their values..."

set_secret() {
  local name="$1"
  local value_var="$2"
  local file_var="$3"
  local file_path="${!file_var:-}"
  if [[ -n "$file_path" ]]; then
    [[ -f "$file_path" ]] || { echo "$file_var points to a missing file" >&2; exit 1; }
    gh secret set "$name" --env production --repo "$repo" < "$file_path" >/dev/null
  elif [[ -n "${!value_var:-}" ]]; then
    printf '%s' "${!value_var}" | gh secret set "$name" --env production --repo "$repo" >/dev/null
  else
    echo "Provide $value_var or $file_var for $name" >&2
    exit 1
  fi
  echo "Configured environment secret: $name"
}

set_secret ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_BASE64_FILE
set_secret ANDROID_KEYSTORE_PASSWORD ANDROID_KEYSTORE_PASSWORD ANDROID_KEYSTORE_PASSWORD_FILE
set_secret ANDROID_KEY_ALIAS ANDROID_KEY_ALIAS ANDROID_KEY_ALIAS_FILE
set_secret ANDROID_KEY_PASSWORD ANDROID_KEY_PASSWORD ANDROID_KEY_PASSWORD_FILE

echo "Production Environment and signing secrets configured for $repo"
