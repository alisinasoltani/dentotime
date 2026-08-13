import { expect, test, type Page, type Route } from "@playwright/test";


async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSession(page: Page, role: "USER" | "ADMIN") {
  await page.route("**/api/v1/auth/token/refresh/", (route) =>
    json(route, { access: "messaging-access" }),
  );
  await page.route("**/api/v1/users/me/", (route) =>
    json(route, {
      id: role === "USER" ? "patient-1" : "admin-1",
      first_name: role === "USER" ? "بیمار" : "مدیر",
      last_name: "آزمایشی",
      role,
    }),
  );
}

async function mockRealtime(route: Route): Promise<boolean> {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith("/events/")) {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-cache" },
      body: "retry: 1000\n\n",
    });
    return true;
  }
  if (url.pathname.endsWith("/messages/delta/")) {
    await json(route, {
      cursor: url.searchParams.get("after"),
      has_more: false,
      results: [],
    });
    return true;
  }
  return false;
}

const patientThread = {
  id: "thread-patient",
  thread_type: "USER_ADMIN",
  participant: {
    id: "patient-1",
    first_name: "بیمار",
    last_name: "آزمایشی",
    role: "USER",
    profile_picture: null,
  },
  guest_contact: null,
  assigned_admin: null,
  status: "OPEN",
  unread_count: 1,
  last_message: "پاسخ پشتیبانی",
  last_message_at: "2026-08-13T10:02:00Z",
  created_at: "2026-08-13T10:00:00Z",
};

function message(
  id: string,
  body: string,
  senderRole: "USER" | "ADMIN",
  internal = false,
) {
  return {
    id,
    thread: "thread-patient",
    sender: {
      id: senderRole === "USER" ? "patient-1" : "admin-1",
      role: senderRole,
      first_name: senderRole === "USER" ? "بیمار" : "مدیر",
      last_name: "آزمایشی",
    },
    sender_type: senderRole,
    body,
    visibility: internal ? "ADMINS_ONLY" : "PARTICIPANTS",
    is_internal_note: internal,
    attachments: [],
    created_at: id.includes("old")
      ? "2026-08-12T10:00:00Z"
      : "2026-08-13T10:02:00Z",
  };
}

test("a patient loads older messages, sends normally, and has no file or delete controls", async ({
  page,
}) => {
  await mockSession(page, "USER");
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error") consoleErrors.push(entry.text());
  });
  let submittedBody = "";
  await page.route("**/api/v1/chat/threads/**", async (route) => {
    if (await mockRealtime(route)) return;
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith("/read/")) return json(route, { last_read_at: "2026-08-13T10:03:00Z" });
    if (url.pathname.endsWith("/messages/") && method === "POST") {
      submittedBody = (route.request().postDataJSON() as { body: string }).body;
      return json(route, message("sent-message", submittedBody, "USER"), 201);
    }
    if (url.pathname.endsWith("/messages/")) {
      if (url.searchParams.has("cursor")) {
        return json(route, {
          next: null,
          previous: null,
          results: [message("old-message", "پیام قدیمی", "USER")],
        });
      }
      return json(route, {
        next: "https://127.0.0.1:3100/api/v1/chat/threads/thread-patient/messages/?cursor=older",
        previous: null,
        results: [message("latest-message", "پاسخ پشتیبانی", "ADMIN")],
      });
    }
    return json(route, {
      count: 1,
      next: null,
      previous: null,
      results: [patientThread],
    });
  });

  await page.goto("/user/chat");
  await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).click();
  await expect(page.getByText("پاسخ پشتیبانی").last()).toBeVisible();
  await page.getByRole("button", { name: "نمایش پیام‌های قدیمی‌تر" }).click();
  await expect(page.getByText("پیام قدیمی")).toBeVisible();
  await expect(page.getByRole("button", { name: "افزودن فایل" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /بایگانی/ })).toHaveCount(0);

  await page.getByPlaceholder("پیام خود را بنویسید…").fill("پیام جدید بیمار");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect.poll(() => submittedBody).toBe("پیام جدید بیمار");
  await expect(page.getByText("پیام جدید بیمار")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});


test("an administrator paginates the inbox and creates a visibly separate internal note", async ({
  page,
}) => {
  await mockSession(page, "ADMIN");
  let submittedVisibility = "";
  const guestThread = {
    ...patientThread,
    id: "thread-guest",
    participant: null,
    guest_contact: {
      phone_number: "+989121234567",
      first_name: "مهمان",
      last_name: "آزمایشی",
    },
    unread_count: 0,
  };
  await page.route("**/api/v1/chat/threads/**", async (route) => {
    if (await mockRealtime(route)) return;
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith("/read/")) return json(route, { last_read_at: "2026-08-13T10:03:00Z" });
    if (url.pathname.endsWith("/messages/") && method === "POST") {
      const payload = route.request().postDataJSON() as {
        body: string;
        visibility: string;
      };
      submittedVisibility = payload.visibility;
      return json(route, message("new-note", payload.body, "ADMIN", true), 201);
    }
    if (url.pathname.endsWith("/messages/")) {
      return json(route, {
        next: null,
        previous: null,
        results: [
          message("internal", "یادداشت محرمانه", "ADMIN", true),
          message("visible", "پاسخ قابل مشاهده", "ADMIN"),
        ],
      });
    }
    const secondPage = url.searchParams.get("page") === "2";
    return json(route, {
      count: 2,
      next: secondPage
        ? null
        : "https://127.0.0.1:3100/api/v1/chat/threads/?page=2",
      previous: secondPage ? "/api/v1/chat/threads/?page=1" : null,
      results: secondPage ? [guestThread] : [patientThread],
    });
  });

  await page.goto("/admin/chat");
  await page.getByRole("button", { name: "نمایش گفتگوهای بیشتر" }).click();
  await expect(page.getByText("مهمان آزمایشی")).toBeVisible();
  await page.getByText("بیمار آزمایشی").click();
  await expect(page.getByText("یادداشت محرمانه")).toBeVisible();
  await expect(page.getByText("یادداشت داخلی").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "افزودن فایل" })).toHaveCount(0);

  await page.getByText("یادداشت داخلی (فقط مدیران)").click();
  await page.getByPlaceholder("یادداشت داخلی…").fill("پیگیری ویژه مدیر");
  await page.getByRole("button", { name: "ارسال پیام" }).click();
  await expect.poll(() => submittedVisibility).toBe("ADMINS_ONLY");
  await expect(page.getByText("پیگیری ویژه مدیر")).toBeVisible();
});


test("the patient chat switches cleanly from inbox to conversation on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page, "USER");
  await page.route("**/api/v1/chat/threads/**", async (route) => {
    if (await mockRealtime(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/read/")) return json(route, { last_read_at: "2026-08-13T10:03:00Z" });
    if (url.pathname.endsWith("/messages/")) {
      return json(route, {
        next: null,
        previous: null,
        results: [message("mobile-message", "پاسخ موبایل", "ADMIN")],
      });
    }
    return json(route, {
      count: 1,
      next: null,
      previous: null,
      results: [patientThread],
    });
  });

  await page.goto("/user/chat");
  await expect(page.getByPlaceholder("پیام خود را بنویسید…")).toHaveCount(0);
  await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).click();
  await expect(page.getByText("پاسخ موبایل")).toBeVisible();
  await expect(page.getByPlaceholder("پیام خود را بنویسید…")).toBeVisible();
  await expect(page.getByRole("button", { name: "بازگشت به فهرست گفتگوها" })).toBeVisible();
});
