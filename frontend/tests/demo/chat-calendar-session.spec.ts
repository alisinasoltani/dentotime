import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

async function screenshot(page: Page, name: string) {
  if (process.env.DEMO_QA_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.DEMO_QA_SCREENSHOTS, `${name}.png`) });
  }
}

async function login(page: Page, phone: string, portal: "patient" | "doctor", role: string) {
  await expect(page).toHaveURL(/localhost:3100\/login/);
  await page.getByRole("button", { name: portal === "patient" ? "بخش مراجعان" : "بخش پزشکان", exact: true }).click();
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill("DentoDemo2026!");
  const response = page.waitForResponse(r => r.url().includes("/auth/login/") && r.request().method() === "POST");
  await page.getByRole("button", { name: "ورود به حساب کاربری", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`localhost:3100/${role}`));
}

async function logout(page: Page) {
  const response = page.waitForResponse(r => r.url().includes("/auth/logout/"));
  await page.getByRole("button", { name: /خروج از حساب کاربری/ }).first().click();
  expect((await response).status()).toBe(205);
  await expect(page).toHaveURL(/localhost:3100\/login/);
  expect((await page.context().cookies()).some(c => c.name === "dentotime_demo_refresh")).toBe(false);
  expect((await page.context().cookies()).find(c => c.name === "dentotime_refresh")?.value).toBe("separate-review-session");
}

async function checkRows(sidebar: Locator, rowId: string) {
  const rows = sidebar.getByTestId(rowId);
  await expect(rows.first()).toBeVisible();
  const bounds = await sidebar.boundingBox();
  expect(bounds).not.toBeNull();
  for (const row of await rows.all()) {
    await expect(row).toHaveCSS("direction", "rtl");
    const avatar = await row.locator('[data-slot="avatar"]').boundingBox();
    expect(avatar).not.toBeNull();
    expect(avatar!.x).toBeGreaterThanOrEqual(bounds!.x + bounds!.width / 2);
    expect(avatar!.x + avatar!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width - 8);
    expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

test("RTL chat, centered calendar and same-browser account switching", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) errors.push(message.text());
  });
  await context.addCookies([{ name: "dentotime_refresh", value: "separate-review-session", domain: "localhost", path: "/api/v1/auth/" }]);
  await page.goto("/login");
  await login(page, "09120001001", "patient", "admin");
  expect((await context.cookies()).some(c => c.name === "dentotime_demo_refresh")).toBe(true);

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const screen = viewport.width > 1000 ? "desktop" : "mobile";
    await page.setViewportSize(viewport);
    await page.goto("/admin/chat");
    const inbox = page.getByTestId("admin-chat-sidebar");
    await checkRows(inbox, "chat-thread-row");
    await screenshot(page, `chat-inbox-${screen}`);
    await inbox.getByRole("button", { name: "خوانده‌نشده", exact: true }).click();
    await inbox.getByRole("button", { name: "همه", exact: true }).click();
    await checkRows(inbox, "chat-thread-row");

    await page.getByRole("button", { name: "سوابق کامل گفتگوها", exact: true }).click();
    const history = page.getByRole("complementary", { name: "فهرست سوابق گفتگو" });
    await checkRows(history, "chat-history-row");
    await screenshot(page, `chat-history-${screen}`);
    await history.getByTestId("chat-history-row").first().click();
    const detail = page.getByRole("region", { name: "جزئیات سابقه گفتگو" });
    await expect(detail.locator("article").first()).toBeVisible();
    await expect(detail.locator("article").first()).toHaveCSS("direction", "rtl");
    expect(await detail.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await screenshot(page, `chat-history-detail-${screen}`);

    await page.goto("/admin/appointments");
    await page.getByRole("button", { name: "نمایش به صورت تقویم", exact: true }).click();
    const days = page.getByTestId("appointment-calendar-day");
    await expect(days.first()).toBeVisible();
    for (const day of await days.all()) {
      const outer = (await day.boundingBox())!;
      const inner = (await day.locator(":scope > span").boundingBox())!;
      expect(Math.abs(outer.x + outer.width / 2 - inner.x - inner.width / 2)).toBeLessThan(0.6);
      expect(Math.abs(outer.y + outer.height / 2 - inner.y - inner.height / 2)).toBeLessThan(0.6);
    }
    await days.nth(11).click();
    await expect(days.nth(11)).toHaveAttribute("aria-pressed", "true");
    await screenshot(page, `appointment-calendar-${screen}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.title()).not.toBe("");
    await expect(page.locator("nextjs-portal")).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await logout(page);
  await login(page, "09120001204", "doctor", "doctor");
  await page.goto("/doctor/verification");
  await expect(page.getByText("نمونه: مدرک خوانا نیست؛ لطفاً تصویر جدید بارگذاری کنید.", { exact: false })).toBeVisible();
  await screenshot(page, "rejected-doctor-login");
  await logout(page);
  await login(page, "09120001102", "patient", "user");
  await page.goto("/user/chat");
  await checkRows(page.getByTestId("support-chat-sidebar"), "chat-thread-row");
  await logout(page);
  await login(page, "09120001001", "patient", "admin");
  await expect(page.locator("body")).toContainText("مدیر سامانه");
  expect(errors).toEqual([]);
});
