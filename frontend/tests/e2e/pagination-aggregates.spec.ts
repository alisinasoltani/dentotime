import { expect, test, type Page, type Route } from "@playwright/test";


async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockAdmin(page: Page) {
  await page.route("**/api/v1/auth/token/refresh/", (route) =>
    json(route, { access: "pagination-access" }),
  );
  await page.route("**/api/v1/users/me/", (route) =>
    json(route, {
      id: "admin-pagination",
      first_name: "مدیر",
      last_name: "آزمایشی",
      role: "ADMIN",
    }),
  );
}

function patient(id: number, name: string) {
  return {
    id: String(id),
    phone_number: `+98912000${String(id).padStart(4, "0")}`,
    username: `patient-${id}`,
    first_name: name,
    last_name: "آزمایشی",
    is_active: true,
    date_joined: "2026-08-01T10:00:00Z",
  };
}

test("the administrator navigates server pages and searches beyond page one", async ({
  page,
}) => {
  await mockAdmin(page);
  const requestedPages: string[] = [];
  await page.route("**/api/v1/admin/users/**", async (route) => {
    const url = new URL(route.request().url());
    requestedPages.push(url.searchParams.get("page") || "1");
    const search = url.searchParams.get("search");
    if (search) {
      return json(route, {
        count: 1,
        next: null,
        previous: null,
        results: [patient(105, "بیمار خارج از صفحه اول")],
      });
    }
    const second = url.searchParams.get("page") === "2";
    return json(route, {
      count: 21,
      next: second ? null : "/api/v1/admin/users/?page=2",
      previous: second ? "/api/v1/admin/users/?page=1" : null,
      results: [patient(second ? 21 : 1, second ? "بیمار صفحه دوم" : "بیمار صفحه اول")],
    });
  });

  await page.goto("/admin/users");
  await expect(page.getByText("بیمار صفحه اول")).toBeVisible();
  await page.getByRole("button", { name: "صفحه بعد" }).click();
  await expect(page.getByText("بیمار صفحه دوم")).toBeVisible();
  await page.getByPlaceholder(/جستجوی نام کاربری/).fill("خارج از صفحه");
  await expect(page.getByText("بیمار خارج از صفحه اول")).toBeVisible();
  expect(requestedPages).toContain("2");
});

test("the dashboard uses one exact aggregate request instead of downloading lists", async ({
  page,
}) => {
  await mockAdmin(page);
  const adminRequests: string[] = [];
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    adminRequests.push(path);
    if (path.endsWith("/dashboard/summary/")) {
      return json(route, {
        users: 125,
        doctors_approved: 18,
        doctors_pending: 4,
        unread_messages: 7,
        recent_verifications: 3,
        recent_appointments: 11,
        window_days: 7,
      });
    }
    return json(route, { detail: "unexpected list request" }, 500);
  });

  await page.goto("/admin");
  await expect(page.getByText("125")).toBeVisible();
  await expect(page.getByText("18")).toBeVisible();
  await expect(page.getByText("11")).toBeVisible();
  expect(adminRequests).toEqual(["/api/v1/admin/dashboard/summary/"]);
});
