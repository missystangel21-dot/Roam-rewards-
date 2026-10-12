import { describe, expect, it } from "vitest";
import { canAccessAdminReviewer, getPendingAdminAlertCount, getUnreadAdminAlertCount } from "../lib/admin-navigation";

describe("admin reviewer navigation", () => {
  it("allows an authenticated admin to access Provider alerts", () => {
    expect(canAccessAdminReviewer({ role: "admin" })).toBe(true);
  });

  it("hides Provider alerts from regular and unauthenticated users", () => {
    expect(canAccessAdminReviewer({ role: "user" })).toBe(false);
    expect(canAccessAdminReviewer(null)).toBe(false);
  });

  it("counts the pending provider failures and handles an unavailable feed", () => {
    expect(getPendingAdminAlertCount([{ id: "failure-a" }, { id: "failure-b" }])).toBe(2);
    expect(getPendingAdminAlertCount(undefined)).toBe(0);
  });

  it("filters only read provider failures from the visible count", () => {
    expect(getUnreadAdminAlertCount([{ id: "failure-a" }, { id: "failure-b" }], new Set(["failure-a"]))).toBe(1);
    expect(getUnreadAdminAlertCount([{ id: "failure-a" }], new Set(["failure-a"]))).toBe(0);
    expect(getUnreadAdminAlertCount(undefined, new Set())).toBe(0);
  });
});
