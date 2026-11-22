export type IdentityStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";

export type IdentitySession = {
  vendor: string;
  vendorReference: string;
  hostedUrl: string;
  expiresAt: Date;
};

export type IdentityResult = {
  vendor: string;
  vendorReference: string;
  status: IdentityStatus;
  verifiedAt: Date | null;
  expiresAt: Date | null;
};

/**
 * Server-side identity vendor boundary. Do not send government-ID values or
 * document images through Roam Rewards APIs; retain only vendor references
 * and the minimum verification state needed by the product.
 */
export interface IdentityVerificationProvider {
  createSession(input: { userReference: string; returnUrl: string; idempotencyKey: string }): Promise<IdentitySession>;
  retrieveResult(input: { vendorReference: string }): Promise<IdentityResult>;
}

/** Fail-closed default; client-provided status must never count as verification. */
export class DisabledIdentityVerificationProvider implements IdentityVerificationProvider {
  async createSession(_input: { userReference: string; returnUrl: string; idempotencyKey: string }): Promise<IdentitySession> {
    throw new Error("Identity verification is unavailable: no production vendor is configured");
  }

  async retrieveResult(_input: { vendorReference: string }): Promise<IdentityResult> {
    throw new Error("Identity verification is unavailable: no production vendor is configured");
  }
}

/** Trust a vendor result only while its verified status and expiry are current. */
export function isCurrentVendorVerification(result: IdentityResult, now = new Date()): boolean {
  return result.status === "VERIFIED"
    && Boolean(result.vendor.trim())
    && Boolean(result.vendorReference.trim())
    && result.verifiedAt instanceof Date
    && !Number.isNaN(result.verifiedAt.getTime())
    && result.expiresAt instanceof Date
    && !Number.isNaN(result.expiresAt.getTime())
    && result.verifiedAt.getTime() <= now.getTime()
    && result.expiresAt.getTime() > now.getTime();
}
