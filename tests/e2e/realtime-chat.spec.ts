import { expect, test, type Page, type Route } from "@playwright/test";


async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSession(page: Page) {
  await page.route("**/api/v1/auth/token/refresh/", (route) =>
    json(route, { access: "realtime-access" }),
  );
  await page.route("**/api/v1/users/me/", (route) =>
    json(route, {
      id: "patient-realtime",
      first_name: "بیمار",
      last_name: "آزمایشی",
      role: "USER",
    }),
  );
}

const thread = {
  id: "thread-realtime",
  thread_type: "USER_ADMIN",
  participant: {
    id: "patient-realtime",
    first_name: "بیمار",
    last_name: "آزمایشی",
    role: "USER",
    profile_picture: null,
  },
  guest_contact: null,
  assigned_admin: null,
  status: "OPEN",
  unread_count: 0,
  last_message: "پیام آغازین",
  last_message_at: "2026-08-13T10:00:00Z",
  created_at: "2026-08-13T10:00:00Z",
};

function chatMessage(id: string, body: string, createdAt: string) {
  return {
    id,
    thread: thread.id,
    sender: {
      id: "admin-realtime",
      role: "ADMIN",
      first_name: "مدیر",
      last_name: "آزمایشی",
    },
    sender_type: "ADMIN",
    body,
    visibility: "PARTICIPANTS",
    is_internal_note: false,
    attachments: [],
    created_at: createdAt,
  };
}

function sseMessage(eventId: string, message: ReturnType<typeof chatMessage>) {
  return `id: ${eventId}\nevent: message\ndata: ${JSON.stringify({ message })}\n\n`;
}

test("realtime chat deduplicates events and recovers missed messages without a full refetch", async ({
  page,
}) => {
  await mockSession(page);
  const first = chatMessage("00000000-0000-0000-0000-000000000001", "پیام آغازین", "2026-08-13T10:00:00Z");
  const live = chatMessage("00000000-0000-0000-0000-000000000002", "پیام زنده", "2026-08-13T10:01:00Z");
  const missed = chatMessage("00000000-0000-0000-0000-000000000003", "پیام بازیابی‌شده", "2026-08-13T10:02:00Z");
  let historyRequests = 0;
  let deltaRequests = 0;
  let streamRequests = 0;

  await page.route("**/api/v1/chat/threads/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/read/")) {
      return json(route, { last_read_at: "2026-08-13T10:03:00Z" });
    }
    if (url.pathname.endsWith("/messages/delta/")) {
      deltaRequests += 1;
      return json(route, {
        cursor: deltaRequests >= 2 ? missed.id : url.searchParams.get("after"),
        has_more: false,
        results: deltaRequests >= 2 ? [missed] : [],
      });
    }
    if (url.pathname.endsWith("/events/")) {
      streamRequests += 1;
      const body = streamRequests === 1
        ? `${sseMessage("1-0", live)}${sseMessage("1-1", live)}`
        : "retry: 1000\n\n";
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body,
      });
    }
    if (url.pathname.endsWith("/messages/")) {
      historyRequests += 1;
      return json(route, { next: null, previous: null, results: [first] });
    }
    return json(route, { count: 1, next: null, previous: null, results: [thread] });
  });

  await page.goto("/user/chat");
  await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).click();
  await expect(page.getByText("پیام زنده")).toHaveCount(1);
  await expect(page.getByText("پیام بازیابی‌شده")).toBeVisible({ timeout: 8_000 });
  expect(historyRequests).toBe(1);
  expect(deltaRequests).toBeGreaterThanOrEqual(2);
  expect(streamRequests).toBeGreaterThanOrEqual(1);
});

test("a hidden chat tab stops reconnect activity until it becomes visible", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Visibility state override is Chromium-specific.");
  await mockSession(page);
  const first = chatMessage("00000000-0000-0000-0000-000000000011", "پیام آغازین", "2026-08-13T10:00:00Z");
  let streamRequests = 0;

  await page.route("**/api/v1/chat/threads/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/read/")) return json(route, {});
    if (url.pathname.endsWith("/messages/delta/")) {
      return json(route, {
        cursor: url.searchParams.get("after"),
        has_more: false,
        results: [],
      });
    }
    if (url.pathname.endsWith("/events/")) {
      streamRequests += 1;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    }
    if (url.pathname.endsWith("/messages/")) {
      return json(route, { next: null, previous: null, results: [first] });
    }
    return json(route, { count: 1, next: null, previous: null, results: [thread] });
  });

  await page.goto("/user/chat");
  await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).click();
  await expect.poll(() => streamRequests).toBeGreaterThan(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCount = streamRequests;
  await page.waitForTimeout(1_500);
  expect(streamRequests).toBe(hiddenCount);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => streamRequests).toBeGreaterThan(hiddenCount);
});
