import { expect, test, type Route } from "@playwright/test";

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== "chromium", "Performance budgets are normalized in Chromium CI.");
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function doctor(id: number, name: string) {
  return {
    id,
    first_name: name,
    last_name: "آزمون",
    display_name: `${name} آزمون`,
    clinic_name: "کلینیک آزمون",
    profile_picture: null,
    likes_count: 2,
    average_rating: 4.5,
    vote_count: 8,
  };
}

test.describe("server-rendered public doctor pages", () => {
  test.use({ javaScriptEnabled: false });

  test("doctor content remains present without client JavaScript", async ({ page }) => {
    const response = await page.goto("/doctors");
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/سارا پزشک/).first()).toBeVisible();
    await expect(page.locator("body")).toContainText("4.5");
  });
});

test("rapid server search cannot let an older response replace the current result", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleErrors.push(entry.text());
  });
  await page.route("**/api/v1/doctors/list**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("search") ?? "";
    if (query === "قدیمی") await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      await json(route, {
        count: 1,
        next: null,
        previous: null,
        results: [doctor(query === "جدید" ? 2 : 1, query === "جدید" ? "پزشک جدید" : "پزشک قدیمی")],
      });
    } catch {
      // The stale request is intentionally cancelled by the component.
    }
  });

  await page.goto("/doctors");
  const search = page.getByPlaceholder("جستجوی نام پزشک یا مطب...");
  await search.fill("قدیمی");
  await page.waitForTimeout(450);
  await search.fill("جدید");
  await expect(page.getByText(/پزشک جدید/).first()).toBeVisible();
  await page.waitForTimeout(1_100);
  await expect(page.getByText(/پزشک قدیمی/)).toHaveCount(0);
  expect(consoleErrors.filter((message) => message.includes("state update"))).toEqual([]);
});

test("failed doctor requests show a controlled message and the layout does not overflow", async ({ page }) => {
  await page.route("**/api/v1/doctors/list**", (route) => route.abort("timedout"));
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/doctors");
  await page.getByPlaceholder("جستجوی نام پزشک یا مطب...").fill("قطع ارتباط");
  await expect(page.getByRole("alert").filter({ hasText: "دریافت فهرست پزشکان" })).toBeVisible();
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(mobileOverflow).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desktopOverflow).toBeLessThanOrEqual(1);
});

test("public doctor Web Vitals stay inside the local production-build budget", async ({ page }) => {
  await page.request.get("/doctors");
  await page.addInitScript(() => {
    const state = { cls: 0, lcp: 0 };
    Object.defineProperty(window, "__dentotimeVitals", { value: state });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/doctors");
  await expect(page.getByText(/سارا پزشک/).first()).toBeVisible();
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const javascriptBytes = performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/_next/static/") && entry.name.endsWith(".js"))
      .reduce((total, entry) => total + (entry as PerformanceResourceTiming).encodedBodySize, 0);
    return {
      ttfb: navigation.responseStart,
      javascriptBytes,
      ...(window as unknown as { __dentotimeVitals: { cls: number; lcp: number } }).__dentotimeVitals,
    };
  });
  expect(metrics.ttfb).toBeLessThan(3_000);
  expect(metrics.lcp).toBeGreaterThan(0);
  expect(metrics.lcp).toBeLessThan(4_000);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.javascriptBytes).toBeLessThan(1_200_000);
});
