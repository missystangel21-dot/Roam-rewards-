import { describe, expect, it } from "vitest";
import { getUnseenProviderFailure, rememberProviderFailureIds } from "../lib/admin-provider-alerts";

describe("provider-failure admin alerts", () => {
  const failures = [{ id: "failure-a" }, { id: "failure-b" }];

  it("hydrates the seen set without creating an initial-load toast", () => {
    const seen = rememberProviderFailureIds(failures);
    expect(getUnseenProviderFailure(failures, seen)).toBeUndefined();
  });

  it("returns only a newly observed failure", () => {
    const seen = new Set(["failure-a"]);
    expect(getUnseenProviderFailure(failures, seen)).toEqual({ id: "failure-b" });
  });

  it("does not re-alert an already remembered failure", () => {
    const seen = new Set(["failure-a", "failure-b"]);
    expect(getUnseenProviderFailure(failures, seen)).toBeUndefined();
  });
});
