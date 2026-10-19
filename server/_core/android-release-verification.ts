import crypto from "node:crypto";

export type AndroidVerificationStatus = "VERIFIED" | "FAILED" | "PENDING" | "NOT_CONFIGURED";

export interface AndroidVerificationResult {
  status: Exclude<AndroidVerificationStatus, "NOT_CONFIGURED">;
  packageName: string;
  certificateSha256: string;
  apkSha256: string;
  releaseTag: string | null;
  verifiedAt: string;
  source: "github-actions";
}

const packageNamePattern = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const fingerprintPattern = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;
const sha256Pattern = /^[0-9A-Fa-f]{64}$/;
let latest: AndroidVerificationResult | null = null;

function configuredStatus(): AndroidVerificationStatus {
  const value = process.env.APK_IDENTITY_VERIFICATION_STATUS?.toUpperCase();
  return value === "VERIFIED" || value === "FAILED" || value === "PENDING" ? value : "NOT_CONFIGURED";
}

export function getAndroidVerificationStatus() {
  const status = latest?.status ?? configuredStatus();
  return {
    status,
    packageName: latest?.packageName ?? process.env.EXPECTED_PACKAGE_NAME ?? "com.app.roamrewards",
    certificateConfigured: Boolean(latest?.certificateSha256 || process.env.EXPECTED_CERT_SHA256),
    certificateSha256: latest?.certificateSha256 ?? null,
    apkSha256: latest?.apkSha256 ?? null,
    releaseTag: latest?.releaseTag ?? process.env.APK_IDENTITY_RELEASE_TAG ?? null,
    verifiedAt: latest?.verifiedAt ?? process.env.APK_IDENTITY_VERIFIED_AT ?? null,
    source: latest?.source ?? null,
    message: status === "VERIFIED"
      ? "The latest recorded signed APK passed package and certificate identity checks."
      : status === "FAILED"
        ? "The latest recorded signed APK failed package or certificate identity checks."
        : status === "PENDING"
          ? "A signed APK verification is in progress or awaiting release confirmation."
          : "No release verification result has been connected to this dashboard yet.",
  } as const;
}

export function recordAndroidVerificationResult(input: AndroidVerificationResult) {
  latest = {
    ...input,
    certificateSha256: input.certificateSha256.toUpperCase(),
    apkSha256: input.apkSha256.toLowerCase(),
  };
  console.info(JSON.stringify({
    event: "android_release_verification",
    status: latest.status,
    packageName: latest.packageName,
    certificateSha256: latest.certificateSha256,
    apkSha256: latest.apkSha256,
    releaseTag: latest.releaseTag,
    verifiedAt: latest.verifiedAt,
    source: latest.source,
  }));
  return getAndroidVerificationStatus();
}

export function validateAndroidVerificationResult(input: unknown): AndroidVerificationResult {
  if (!input || typeof input !== "object") throw new Error("Verification payload must be an object");
  const payload = input as Record<string, unknown>;
  const status = payload.status;
  const packageName = payload.packageName;
  const certificateSha256 = payload.certificateSha256;
  const apkSha256 = payload.apkSha256;
  const releaseTag = payload.releaseTag;
  const verifiedAt = payload.verifiedAt;
  if (status !== "VERIFIED" && status !== "FAILED" && status !== "PENDING") throw new Error("Invalid verification status");
  if (typeof packageName !== "string" || !packageNamePattern.test(packageName)) throw new Error("Invalid package name");
  if (typeof certificateSha256 !== "string" || !fingerprintPattern.test(certificateSha256)) throw new Error("Invalid certificate fingerprint");
  if (typeof apkSha256 !== "string" || !sha256Pattern.test(apkSha256)) throw new Error("Invalid APK SHA-256");
  if (releaseTag !== null && typeof releaseTag !== "string") throw new Error("Invalid release tag");
  if (typeof verifiedAt !== "string" || Number.isNaN(Date.parse(verifiedAt))) throw new Error("Invalid verification timestamp");
  return { status, packageName, certificateSha256, apkSha256, releaseTag, verifiedAt, source: "github-actions" };
}

export function assertExpectedAndroidIdentity(result: AndroidVerificationResult) {
  if (result.status !== "VERIFIED") return;
  const expectedPackage = process.env.EXPECTED_PACKAGE_NAME;
  const expectedCertificate = process.env.EXPECTED_CERT_SHA256?.toUpperCase();
  if (!expectedPackage || result.packageName !== expectedPackage) throw new Error("Verified package name does not match the server expectation");
  if (!expectedCertificate || result.certificateSha256.toUpperCase() !== expectedCertificate) throw new Error("Verified certificate fingerprint does not match the server expectation");
}

export function isValidVerificationToken(provided: string | undefined) {
  const expected = process.env.GITHUB_VERIFICATION_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
