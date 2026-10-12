#!/usr/bin/env bash
set -Eeuo pipefail

apk_path="${1:-}"
[[ -n "$apk_path" && -f "$apk_path" ]] || { echo "Usage: $0 path/to/app-release.apk" >&2; exit 1; }

apksigner_bin="${APKSIGNER:-}"
if [[ -z "$apksigner_bin" ]]; then
  apksigner_bin="$(command -v apksigner || true)"
fi
if [[ -z "$apksigner_bin" ]]; then
  echo "apksigner not found; install Android SDK build-tools or set APKSIGNER=/path/to/apksigner" >&2
  exit 1
fi

printf '%s\n' "SHA-256:"
sha256sum "$apk_path"
printf '%s\n' "Signature verification:"
"$apksigner_bin" verify --verbose --print-certs "$apk_path"

if [[ -n "${EXPECTED_CERT_SHA256:-}" ]]; then
  "$apksigner_bin" verify --print-certs "$apk_path" | grep -Fq "Signer #1 certificate SHA-256 digest: ${EXPECTED_CERT_SHA256}" || {
    echo "Signer certificate fingerprint did not match EXPECTED_CERT_SHA256" >&2
    exit 1
  }
  echo "Signer certificate fingerprint matches EXPECTED_CERT_SHA256"
fi
