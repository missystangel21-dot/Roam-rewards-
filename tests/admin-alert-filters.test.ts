import { describe, expect, it } from "vitest";

import { filterAndSortProviderFailures, getAlertFilterLabel, getAlertSeverity } from "../lib/admin-alert-filters";

const now = new Date("2026-09-01T12:00:00.000Z");
const alerts = [
  { id: "standard-new", requestedPoints: 500, correlationId: "corr-standard-new", createdAt: "2026-09-01T11:59:00.000Z" },
  { id: "critical-old", requestedPoints: 5_000, correlationId: "corr-critical-old", createdAt: "2026-09-01T11:52:00.000Z" },
  { id: "critical-new", requestedPoints: 10_000, correlationId: "corr-critical-new", createdAt: "2026-09-01T11:58:00.000Z" },
];

describe("admin alert filters", () => {
  it("derives critical severity from the dual-approval threshold", () => {
    expect(getAlertSeverity(alerts[0])).toBe("STANDARD");
    expect(getAlertSeverity(alerts[1])).toBe("CRITICAL");
  });

  it("filters by severity and sorts critical alerts newest first", () => {
    const result = filterAndSortProviderFailures(alerts, { severity: "CRITICAL", dateWindow: "ALL", sort: "SEVERITY", now });
    expect(result.map((alert) => alert.id)).toEqual(["critical-new", "critical-old"]);
  });

  it("filters by a bounded date window without mutating the source array", () => {
    const result = filterAndSortProviderFailures(alerts, { severity: "ALL", dateWindow: "FIVE_MINUTES", sort: "NEWEST", now });
    expect(result.map((alert) => alert.id)).toEqual(["standard-new", "critical-new"]);
    expect(alerts.map((alert) => alert.id)).toEqual(["standard-new", "critical-old", "critical-new"]);
  });

  it("labels the active filters for reviewers", () => {
    expect(getAlertFilterLabel({ severity: "STANDARD", dateWindow: "FIFTEEN_MINUTES", sort: "OLDEST" })).toBe("Standard · Last 15 minutes · Oldest first");
  });
});
