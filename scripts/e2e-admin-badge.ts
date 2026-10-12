import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "../server/db";
import { sdk } from "../server/_core/sdk";
import { redemptionRequests, users } from "../drizzle/schema";

const appUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8081";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminOpenId = `e2e-admin-${runId}`;
const regularOpenId = `e2e-player-${runId}`;
const redemptionIds = Array.from({ length: 12 }, (_, index) => `e2e-${runId}-${index}`);
const redemptionId = redemptionIds[0];

async function seed() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required for the seeded browser test");
  const baselineSince = new Date(Date.now() - 15 * 60 * 1_000);
  const baselineFailures = await db.select({ id: redemptionRequests.id }).from(redemptionRequests).where(and(eq(redemptionRequests.status, "FAILED"), gte(redemptionRequests.createdAt, baselineSince)));
  await db.insert(users).values([
    { openId: adminOpenId, name: "E2E Admin", email: `${adminOpenId}@example.test`, loginMethod: "e2e", role: "admin" },
    { openId: regularOpenId, name: "E2E Player", email: `${regularOpenId}@example.test`, loginMethod: "e2e", role: "user" },
  ]);
  await db.update(users).set({ role: "admin" }).where(eq(users.openId, adminOpenId));
  const admin = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.openId, adminOpenId)).limit(1);
  const regular = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.openId, regularOpenId)).limit(1);
  if (!admin[0] || admin[0].role !== "admin" || !regular[0] || regular[0].role !== "user") throw new Error("Failed to seed the expected admin and regular user roles");
  await db.insert(redemptionRequests).values(redemptionIds.map((id, index) => ({ id, userId: admin[0].id, requestedPoints: 100, status: "FAILED" as const, idempotencyKey: `idem-${runId}-${index}`, correlationId: `corr-${runId}-${index}`, createdAt: new Date(Date.now() - index * 1_000) })));
  return { db, adminId: admin[0].id, regularId: regular[0].id, expectedCount: baselineFailures.length + redemptionIds.length };
}

async function cleanup(db: Awaited<ReturnType<typeof getDb>>, adminId: number, regularId: number) {
  if (!db) return;
  await db.delete(redemptionRequests).where(and(inArray(redemptionRequests.id, redemptionIds), eq(redemptionRequests.userId, adminId)));
  await db.delete(users).where(and(eq(users.openId, adminOpenId), eq(users.id, adminId)));
  await db.delete(users).where(and(eq(users.openId, regularOpenId), eq(users.id, regularId)));
}

async function openAuthenticatedPage(browser: Browser, token: string, hasTouch = false): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ hasTouch });
  const app = new URL(appUrl);
  await context.addCookies([{ name: "app_session_id", value: token, domain: app.hostname, path: "/" }]);
  const page = await context.newPage();
  if (app.port === "8081") {
    await page.route("**/api/**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const configuredApi = new URL(apiUrl);
      const targetUrl = `${configuredApi.origin}${requestUrl.pathname}${requestUrl.search}`;
      const requestHeaders: Record<string, string> = { ...route.request().headers(), cookie: `app_session_id=${token}` };
      delete requestHeaders.host;
      delete requestHeaders["content-length"];
      const upstream = await fetch(targetUrl, { method: route.request().method(), headers: requestHeaders, body: route.request().postData() ?? undefined });
      await route.fulfill({ status: upstream.status, headers: Object.fromEntries(upstream.headers.entries()), body: Buffer.from(await upstream.arrayBuffer()) });
    });
  }
  return { context, page };
}

async function main() {
  const { db, adminId, regularId, expectedCount } = await seed();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const adminSession = await openAuthenticatedPage(browser, await sdk.createSessionToken(adminOpenId, { name: "E2E Admin", expiresInMs: 10 * 60 * 1_000 }), true);
    await adminSession.page.goto(`${appUrl}/(tabs)/profile`, { waitUntil: "networkidle" });
    const entry = adminSession.page.getByLabel(`Open provider alerts, ${expectedCount} pending alerts`);
    await entry.waitFor({ state: "visible", timeout: 15_000 });
    if ((await entry.getByText(String(expectedCount), { exact: true }).count()) !== 1) throw new Error(`Expected exactly one ${expectedCount}-pending-alert badge`);
    const badge = entry.getByTestId("provider-alerts-badge");
    await badge.hover();
    const tooltip = adminSession.page.getByText("Provider delivery failures and retryable outbox alerts.", { exact: true });
    if (!(await tooltip.isVisible())) throw new Error("Expected pending-alert tooltip to be visible on hover");
    await adminSession.page.mouse.move(0, 0);
    if (await tooltip.isVisible()) throw new Error("Expected pending-alert tooltip to hide after hover leaves the badge");
    await badge.tap();
    if (!(await tooltip.isVisible())) throw new Error("Expected pending-alert tooltip to open on tap");
    await badge.tap();
    if (await tooltip.isVisible()) throw new Error("Expected pending-alert tooltip to close on a second tap");
    await badge.tap();
    const markAsRead = adminSession.page.getByLabel("Mark provider alerts as read");
    if (!(await markAsRead.isVisible())) throw new Error("Expected Mark as read action inside the tooltip");
    await markAsRead.tap();
    const successToast = adminSession.page.getByText("Alerts marked as read", { exact: true });
    if (!(await successToast.isVisible())) throw new Error("Expected success toast after marking alerts as read");
    const undo = adminSession.page.getByLabel("Undo mark as read");
    if (!(await undo.isVisible())) throw new Error("Expected Undo action in the success toast");
    const clearedEntry = adminSession.page.getByLabel("Open provider alerts, 0 pending alerts");
    await clearedEntry.waitFor({ state: "visible", timeout: 5_000 });
    await undo.tap();
    const restoredEntry = adminSession.page.getByLabel(`Open provider alerts, ${expectedCount} pending alerts`);
    await restoredEntry.waitFor({ state: "visible", timeout: 5_000 });
    await badge.tap();
    const viewDetails = adminSession.page.getByLabel("View provider alert details");
    if (!(await viewDetails.isVisible())) throw new Error("Expected View Details action inside the tooltip");
    await viewDetails.tap();
    await adminSession.page.waitForURL(/admin-redemptions/, { timeout: 5_000 });
    if (!adminSession.page.url().includes("admin-redemptions")) throw new Error("View Details must navigate to the alerts management page");
    const seededAlert = adminSession.page.getByTestId(`provider-alert-${redemptionId}`);
    await seededAlert.waitFor({ state: "visible", timeout: 10_000 });
    const loadMore = adminSession.page.getByTestId("load-more-alerts");
    if (!(await loadMore.isVisible())) throw new Error("Expected load-more control when more than one page of alerts exists");
    await loadMore.tap();
    await adminSession.page.waitForTimeout(700);
    if ((await adminSession.page.getByText(/loaded/, { exact: false }).count()) === 0) { const bodyText = await adminSession.page.locator("body").innerText(); throw new Error(`Expected loaded-page status after pagination. Body: ${bodyText.slice(0, 1200)}`); }
    await adminSession.page.getByTestId("alert-severity-critical").tap();
    await adminSession.page.waitForTimeout(600);
    if ((await seededAlert.count()) !== 0) throw new Error("Server-side critical filtering should exclude the standard seeded alert");
    await adminSession.page.getByTestId("alert-date-five-minutes").tap();
    await adminSession.page.waitForTimeout(600);
    if ((await seededAlert.count()) !== 0) throw new Error("Server-side date filtering should continue excluding the standard seeded alert");
    await adminSession.page.getByTestId("alert-severity-standard").tap();
    await adminSession.page.getByTestId("alert-date-all").tap();
    await adminSession.page.waitForTimeout(600);
    if (!(await seededAlert.isVisible())) throw new Error("Server-side standard filtering should show the seeded alert");
    await adminSession.page.getByTestId("alert-date-five-minutes").tap();
    if (!(await seededAlert.isVisible())) throw new Error("Recent date filter should show the seeded alert");
    await adminSession.page.getByTestId("alert-sort-oldest").tap();
    await adminSession.page.getByTestId("reset-alert-filters").tap();
    if (!(await seededAlert.isVisible())) throw new Error("Reset should restore the seeded alert");
    await adminSession.context.close();
    console.log(`E2E admin badge passed: ${appUrl} shows ${expectedCount} pending provider alert(s)`);

    const regularSession = await openAuthenticatedPage(browser, await sdk.createSessionToken(regularOpenId, { name: "E2E Player", expiresInMs: 10 * 60 * 1_000 }));
    await regularSession.page.goto(`${appUrl}/(tabs)/profile`, { waitUntil: "networkidle" });
    if ((await regularSession.page.getByLabel(/Open provider alerts/).count()) !== 0) throw new Error("Regular users must not see the reviewer navigation entry");
    if ((await regularSession.page.getByText("Provider alerts", { exact: true }).count()) !== 0) throw new Error("Regular users must not see Provider alerts text");
    await regularSession.context.close();
    console.log(`E2E regular-user visibility passed: reviewer entry hidden at ${appUrl}`);
  } finally {
    await browser.close();
    await cleanup(db, adminId, regularId);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
