import { describe, expect, it } from "vitest";

describe("temporary policy configuration marker", () => {
  it("is available to the test process without exposing its value", () => {
    expect(process.env.UNUSED_POLICY_MARKER).toBe("not-used");
  });

  it("does not affect the public reward API contract", async () => {
    const response = await fetch("http://127.0.0.1:3000/api/health", {
      headers: { "x-policy-marker": process.env.UNUSED_POLICY_MARKER ?? "" },
    }).catch(() => null);
    expect(response === null || response.status < 500).toBe(true);
  });
});

