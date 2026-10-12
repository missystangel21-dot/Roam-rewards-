#!/usr/bin/env bash
set -Eeuo pipefail

read_secret() {
  local variable_name="$1"
  local secret_file="$2"
  if [[ -z "${!variable_name:-}" && -f "$secret_file" ]]; then
    export "$variable_name=$(<"$secret_file")"
  fi
}

read_secret DATABASE_URL /run/secrets/database_url
read_secret JWT_SECRET /run/secrets/jwt_secret
read_secret REDIS_URL /run/secrets/redis_url

: "${DATABASE_URL:?DATABASE_URL secret is required}"
: "${JWT_SECRET:?JWT_SECRET secret is required}"
: "${REDIS_URL:?REDIS_URL secret is required}"

exec "$@"
