import { afterEach, describe, expect, it } from "vitest";
import {
  assertExpectedAndroidIdentity,
  getAndroidVerificationStatus,
  isValidVerificationToken,
  recordAndroidVerificationResult,
  validateAndroidVerificationResult,
} from "../server/_core/android-release-verification";

const certificateSha256 = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const apkSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const originalEnv = {
  token: process.env.GITHUB_VERIFICATION_WEBHOOK_SECRET,
  packageName: process.env.EXPECTED_PACKAGE_NAME,
  certificate: process.env.EXPECTED_CERT_SHA256,
  status: process.env.APK_IDENTITY_VERIFICATION_STATUS,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    GITHUB_VERIFICATION_WEBHOOK_SECRET: originalEnv.token,
    EXPECTED_PACKAGE_NAME: originalEnv.packageName,
    EXPECTED_CERT_SHA256: originalEnv.certificate,
    APK_IDENTITY_VERIFICATION_STATUS: originalEnv.status,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Android release verification", () => {
  it("accepts a valid GitHub Actions result and exposes it to the admin query", () => {
    const result = validateAndroidVerificationResult({
      status: "VERIFIED",
      packageName: "com.app.roamrewards",
      certificateSha256,
      apkSha256,
      releaseTag: "v1.0.0",
      verifiedAt: "2026-10-19T08:00:00.000Z",
    });
    process.env.EXPECTED_PACKAGE_NAME = "com.app.roamrewards";
    process.env.EXPECTED_CERT_SHA256 = certificateSha256;
    assertExpectedAndroidIdentity(result);
    const status = recordAndroidVerificationResult(result);
    expect(status).toMatchObject({ status: "VERIFIED", packageName: "com.app.roamrewards", releaseTag: "v1.0.0", apkSha256 });
    expect(getAndroidVerificationStatus().certificateConfigured).toBe(true);
  });

  it("rejects malformed identity payloads", () => {
    expect(() => validateAndroidVerificationResult({ status: "VERIFIED", packageName: "not valid", certificateSha256, apkSha256, releaseTag: null, verifiedAt: new Date().toISOString() })).toThrow("Invalid package name");
    expect(() => validateAndroidVerificationResult({ status: "VERIFIED", packageName: "com.app.roamrewards", certificateSha256: "AA", apkSha256, releaseTag: null, verifiedAt: new Date().toISOString() })).toThrow("Invalid certificate fingerprint");
  });

  it("rejects a VERIFIED result whose identity differs from server expectations", () => {
    process.env.EXPECTED_PACKAGE_NAME = "com.app.roamrewards";
    process.env.EXPECTED_CERT_SHA256 = certificateSha256;
    const result = validateAndroidVerificationResult({ status: "VERIFIED", packageName: "com.other.app", certificateSha256, apkSha256, releaseTag: null, verifiedAt: new Date().toISOString() });
    expect(() => assertExpectedAndroidIdentity(result)).toThrow("package name");
  });

  it("requires the configured bearer secret", () => {
    process.env.GITHUB_VERIFICATION_WEBHOOK_SECRET = "callback-secret";
    expect(isValidVerificationToken("callback-secret")).toBe(true);
    expect(isValidVerificationToken("wrong-secret")).toBe(false);
    expect(isValidVerificationToken(undefined)).toBe(false);
  });
});
