#!/usr/bin/env bash
set -Eeuo pipefail

apk_path="${1:-android/app/build/outputs/apk/release/app-release.apk}"
[[ -f "$apk_path" ]] || { echo "APK not found: $apk_path" >&2; exit 1; }

expected_package_name="${EXPECTED_PACKAGE_NAME:-}"
expected_cert_sha256="${EXPECTED_CERT_SHA256:-}"
require_identity_assertions="${REQUIRE_IDENTITY_ASSERTIONS:-false}"

if [[ "$require_identity_assertions" == "true" ]] && [[ -z "$expected_package_name" || -z "$expected_cert_sha256" ]]; then
  echo "REQUIRE_IDENTITY_ASSERTIONS=true requires EXPECTED_PACKAGE_NAME and EXPECTED_CERT_SHA256" >&2
  exit 1
fi

if [[ -n "$expected_cert_sha256" ]] && [[ ! "$expected_cert_sha256" =~ ^([[:xdigit:]][[:xdigit:]]:){31}[[:xdigit:]][[:xdigit:]]$ ]]; then
  echo "EXPECTED_CERT_SHA256 must contain exactly 32 colon-separated hexadecimal byte pairs" >&2
  exit 1
fi

command -v unzip >/dev/null || { echo "unzip is required" >&2; exit 1; }
command -v zipinfo >/dev/null || { echo "zipinfo is required" >&2; exit 1; }

find_android_tool() {
  local name="$1"
  if [[ -n "${!name:-}" && -x "${!name}" ]]; then
    printf '%s' "${!name}"
    return
  fi
  local tool_name="$2"
  command -v "$tool_name" 2>/dev/null || true
}

zipalign_bin="$(find_android_tool ZIPALIGN zipalign)"
apksigner_bin="$(find_android_tool APKSIGNER apksigner)"
[[ -n "$zipalign_bin" ]] || { echo "zipalign not found; set ZIPALIGN or install Android SDK build-tools" >&2; exit 1; }
[[ -n "$apksigner_bin" ]] || { echo "apksigner not found; set APKSIGNER or install Android SDK build-tools" >&2; exit 1; }

entries="$(mktemp)"
trap 'rm -f "$entries"' EXIT
zipinfo -1 "$apk_path" > "$entries"

require_entry() {
  local entry="$1"
  grep -Fxq "$entry" "$entries" || { echo "Missing required APK entry: $entry" >&2; exit 1; }
}

require_entry AndroidManifest.xml
require_entry classes.dex
if ! grep -Eq '(^|/)resources\.arsc$' "$entries"; then
  echo "Missing compiled Android resources: resources.arsc" >&2
  exit 1
fi
if ! grep -Eq '^META-INF/[^/]+\.(RSA|DSA|EC)$' "$entries"; then
  echo "Missing APK signing certificate entry under META-INF" >&2
  exit 1
fi

if grep -Eiq '(^|/)(keystore\.properties|.*\.(jks|keystore|p12|pem|key))$' "$entries"; then
  echo "Potential signing material leaked into APK archive" >&2
  exit 1
fi

printf '%s\n' "Checking ZIP integrity..."
unzip -tq "$apk_path"
printf '%s\n' "Checking Android ZIP alignment..."
"$zipalign_bin" -c -P 16 -v 4 "$apk_path"
printf '%s\n' "Checking APK signature..."
"$apksigner_bin" verify --verbose --print-certs "$apk_path"

if [[ -n "$expected_package_name" ]]; then
  aapt_bin="${AAPT:-$(command -v aapt || true)}"
  [[ -n "$aapt_bin" ]] || { echo "aapt not found; cannot check EXPECTED_PACKAGE_NAME" >&2; exit 1; }
  "$aapt_bin" dump badging "$apk_path" | grep -Fq "package: name='${expected_package_name}'" || {
    echo "APK package name did not match EXPECTED_PACKAGE_NAME=${expected_package_name}" >&2
    exit 1
  }
  printf '%s\n' "APK package identity matches: $expected_package_name"
fi

if [[ -n "$expected_cert_sha256" ]]; then
  "$apksigner_bin" verify --print-certs "$apk_path" | grep -Fq "Signer #1 certificate SHA-256 digest: ${expected_cert_sha256^^}" || {
    echo "APK certificate fingerprint did not match EXPECTED_CERT_SHA256" >&2
    exit 1
  }
  printf '%s\n' "APK certificate identity matches EXPECTED_CERT_SHA256"
fi

printf '%s\n' "APK structure, alignment, and signature checks passed: $apk_path"
