import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  Animated: { View: "Animated.View" },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock("@/components/ui/icon-symbol", () => ({ IconSymbol: () => null }));
vi.mock("@/lib/admin-navigation", () => ({ canAccessAdminReviewer: (session: { role: "user" | "admin" } | null) => session?.role === "admin" }));

import { AdminProviderAlertsNavView } from "../components/admin-provider-alerts-nav";

// The view returns ReactElement | null; narrow the null case with a guard
// instead of casting to `any`. The rendered element is a Pressable, so its
// props carry the accessibility label and children the tests assert on.
type NavViewElement = ReactElement<{
  accessibilityLabel?: string;
  children?: ReactNode;
}>;

function renderNavView(props: Parameters<typeof AdminProviderAlertsNavView>[0]): NavViewElement {
  const element = AdminProviderAlertsNavView(props);
  if (!element) throw new Error("Expected AdminProviderAlertsNavView to render");
  return element;
}

describe("AdminProviderAlertsNav UI", () => {
  it("renders the pending count for an authenticated admin session", () => {
    const element = renderNavView({ session: { role: "admin" }, pendingAlertCount: 3, loading: false, onPress: vi.fn(), tooltipVisible: false, onHoverIn: vi.fn(), onHoverOut: vi.fn(), onToggleTooltip: vi.fn(), pulseActive: true, onMarkAsRead: vi.fn() });
    expect(element).not.toBeNull();
    expect(element.props.accessibilityLabel).toBe("Open provider alerts, 3 pending alerts");
    expect(JSON.stringify(element.props.children)).toContain("3");
  });

  it("does not render the admin entry for a regular mocked session", () => {
    const element = AdminProviderAlertsNavView({ session: { role: "user" }, pendingAlertCount: 3, loading: false, onPress: vi.fn(), tooltipVisible: false, onHoverIn: vi.fn(), onHoverOut: vi.fn(), onToggleTooltip: vi.fn(), pulseActive: false, onMarkAsRead: vi.fn() });
    expect(element).toBeNull();
  });

  it("exposes feedback and details actions while the tooltip is open", () => {
    const element = renderNavView({ session: { role: "admin" }, pendingAlertCount: 2, loading: false, onPress: vi.fn(), tooltipVisible: true, toastVisible: true, onHoverIn: vi.fn(), onHoverOut: vi.fn(), onToggleTooltip: vi.fn(), onMarkAsRead: vi.fn(), onUndoMarkAsRead: vi.fn(), onViewDetails: vi.fn(), pulseActive: true });
    const tree = JSON.stringify(element.props.children);
    expect(tree).toContain("View Details");
    expect(tree).toContain("Mark as read");
    expect(tree).toContain("Alerts marked as read");
    expect(tree).toContain("Undo");
  });

  it("uses a loading marker instead of a stale or guessed count", () => {
    const element = renderNavView({ session: { role: "admin" }, pendingAlertCount: 0, loading: true, onPress: vi.fn(), tooltipVisible: true, onHoverIn: vi.fn(), onHoverOut: vi.fn(), onToggleTooltip: vi.fn(), onMarkAsRead: vi.fn(), pulseActive: false, onUndoMarkAsRead: vi.fn(), onViewDetails: vi.fn() });
    expect(element.props.accessibilityLabel).toBe("Open provider alerts");
    expect(JSON.stringify(element.props.children)).toContain("…");
    expect(JSON.stringify(element.props.children)).toContain("Provider delivery failures and retryable outbox alerts.");
  });
});
