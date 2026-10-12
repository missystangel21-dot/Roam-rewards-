#!/usr/bin/env bash
set -Eeuo pipefail

command -v docker >/dev/null || { echo "Docker CLI is required" >&2; exit 1; }
docker info --format '{{.Swarm.LocalNodeState}}' | grep -qx active || {
  echo "Docker Swarm is not active on this node" >&2
  exit 1
}

# Prefer *_FILE inputs. If using values, export them only in the current shell.
# Existing Docker secrets are never overwritten because Swarm secrets are immutable.
create_secret() {
  local secret_name="$1"
  local value_var="$2"
  local file_var="$3"
  if docker secret inspect "$secret_name" >/dev/null 2>&1; then
    echo "Already exists: $secret_name (not replaced)"
    return
  fi

  local source_file="${!file_var:-}"
  if [[ -n "$source_file" ]]; then
    [[ -f "$source_file" ]] || { echo "$file_var points to a missing file" >&2; exit 1; }
    docker secret create --label com.roam-rewards.managed=true "$secret_name" "$source_file" >/dev/null
  elif [[ -n "${!value_var:-}" ]]; then
    printf '%s' "${!value_var}" | docker secret create --label com.roam-rewards.managed=true "$secret_name" - >/dev/null
  else
    echo "Provide $file_var or $value_var for $secret_name" >&2
    exit 1
  fi
  echo "Created: $secret_name"
}

create_secret roam-rewards-database-url DATABASE_URL_VALUE DATABASE_URL_FILE
create_secret roam-rewards-jwt-secret JWT_SECRET_VALUE JWT_SECRET_FILE
create_secret roam-rewards-redis-url REDIS_URL_VALUE REDIS_URL_FILE

echo "Swarm secrets are ready. Deploy with:"
echo "  docker stack deploy -c docker-compose.runtime.example.yml roam-rewards"
