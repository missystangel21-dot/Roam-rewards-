
#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 ||
  die "Docker CLI is required."

swarm_state="$(docker info --format '{{.Swarm.LocalNodeState}}')" ||
  die "Unable to query Docker. Check the daemon."

[[ "$swarm_state" == "active" ]] ||
  die "Docker Swarm is not active on this node."

secret_exists() {
  docker secret inspect "$1" >/dev/null 2>&1
}

validate_input() {
  local name="$1" value_var="$2" file_var="$3"
  local file="${!file_var:-}"

  # Existing secrets are immutable and intentionally preserved.
  if secret_exists "$name"; then
    printf 'Already exists: %s (not replaced)\n' "$name"
    return 0
  fi

  if [[ -n "$file" ]]; then
    [[ -f "$file" && -r "$file" && -s "$file" ]] ||
      die "$file_var must point to a readable, nonempty file."
  elif [[ -z "${!value_var:-}" ]]; then
    die "Provide $file_var or $value_var for $name."
  fi
}

create_secret() {
  local name="$1" value_var="$2" file_var="$3"
  local file="${!file_var:-}"

  if secret_exists "$name"; then
    printf 'Already exists: %s (not replaced)\n' "$name"
    return 0
  fi

  if [[ -n "$file" ]]; then
    docker secret create \
      --label com.roam-rewards.managed=true \
      "$name" "$file" >/dev/null ||
      die "Failed to create secret: $name"
  else
    printf '%s' "${!value_var}" |
      docker secret create \
        --label com.roam-rewards.managed=true \
        "$name" - >/dev/null ||
      die "Failed to create secret: $name"
  fi

  printf 'Created: %s\n' "$name"
}

# Preflight all inputs before creating any missing secrets.
validate_input roam-rewards-database-url DATABASE_URL_VALUE DATABASE_URL_FILE
validate_input roam-rewards-jwt-secret JWT_SECRET_VALUE JWT_SECRET_FILE
validate_input roam-rewards-redis-url REDIS_URL_VALUE REDIS_URL_FILE

create_secret roam-rewards-database-url DATABASE_URL_VALUE DATABASE_URL_FILE
create_secret roam-rewards-jwt-secret JWT_SECRET_VALUE JWT_SECRET_FILE
create_secret roam-rewards-redis-url REDIS_URL_VALUE REDIS_URL_FILE

printf 'Swarm secrets are ready.\n'
printf 'Deploy with:\n'
printf '  docker stack deploy -c docker-compose.runtime.example.yml roam-rewards\n'
