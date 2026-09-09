import { expect, test, type Page } from "@playwright/test";


const doctorPassword = process.env.INTEGRATION_DOCTOR_PASSWORD || "DemoRating123!";
const patientPassword = process.env.INTEGRATION_PATIENT_PASSWORD || "DemoRating123!";
const adminPhone = process.env.INTEGRATION_ADMIN_PHONE || "09120000001";
const adminPassword = process.env.INTEGRATION_ADMIN_PASSWORD || "LocalAdmin#2026!Dentotime";
const bookedDate = "2026-08-26";


async function login(
  page: Page,
  phone: string,
  password: string,
  role: "patient" | "doctor",
  expectedPath?: RegExp,
) {
  await page.goto("/login");
  const roleTab = page.getByRole("button", {
    name: role === "patient" ? "بخش مراجعان" : "بخش پزشکان",
    exact: true,
  });
  const oppositeRoleTab = page.getByRole("button", {
    name: role === "patient" ? "بخش پزشکان" : "بخش مراجعان",
    exact: true,
  });
  await expect(async () => {
    await oppositeRoleTab.click();
    await expect(oppositeRoleTab).toHaveClass(/bg-\[#72BFC6\]/, { timeout: 2_000 });
    await roleTab.click();
    await expect(roleTab).toHaveClass(/bg-\[#72BFC6\]/, { timeout: 2_000 });
  }).toPass({ timeout: 25_000 });
  await page.getByLabel("شماره تلفن همراه:").fill(phone);
  await page.getByLabel("رمز عبور:").fill(password);
  await page.getByRole("button", { name: "ورود به حساب کاربری", exact: true }).click();
  await page.waitForURL(expectedPath ?? (role === "patient" ? /\/user\/?$/ : /\/doctor\/?$/), {
    timeout: 90_000,
  });
}


async function expectMessageViewportToScroll(page: Page) {
  const viewport = page
    .getByTestId("message-scroll-area")
    .locator("[data-radix-scroll-area-viewport]");
  await expect(viewport).toBeVisible();
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(100);
  await expect
    .poll(() =>
      viewport.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(100);

  const before = await viewport.evaluate((element) => element.scrollTop);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -1200);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeLessThan(before);
}


test.describe.serial("doctor chat and appointment workspace", () => {
  test("doctor chat scrolls and the database-backed contact picker starts a direct chat", async ({ page }) => {
    await login(page, "09131111201", doctorPassword, "doctor");
    await page.goto("/doctor/chat");
    await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).first().click();
    await expect(page.locator("h2").filter({ hasText: "پشتیبانی دنتو تایم" })).toBeVisible();
    await expectMessageViewportToScroll(page);
    await page.screenshot({ path: "../qa-artifacts/qa-doctor-chat-scroll.png", fullPage: true });

    await page.getByRole("button", { name: /گفتگوی جدید/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "شروع گفتگوی جدید" })).toBeVisible();
    await expect(dialog.getByText("پشتیبانی دنتوتایم", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "پشتیبانی همیشه پین است" })).toBeDisabled();

    await dialog.getByRole("button", { name: "کاربران" }).click();
    await dialog.getByPlaceholder("جستجو بر اساس نام، موبایل یا تخصص…").fill("کاربر مجاز");
    const pinButton = dialog.getByRole("button", { name: /پین کردن کاربر مجاز|برداشتن پین کاربر مجاز/ });
    await expect(pinButton).toBeVisible();
    const wasPinned = (await pinButton.getAttribute("aria-label"))?.startsWith("برداشتن");
    if (!wasPinned) {
      await pinButton.click();
      await expect(dialog.getByRole("button", { name: "برداشتن پین کاربر مجاز" })).toBeVisible();
    }

    const startDirect = dialog.getByRole("button", { name: "شروع گفتگو با کاربر مجاز" });
    await expect(startDirect).toBeEnabled();
    await startDirect.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "کاربر مجاز", level: 2 })).toBeVisible();
    await page.screenshot({ path: "../qa-artifacts/qa-doctor-chat.png", fullPage: true });
  });

  test("patient and admin chat message panes also scroll", async ({ page }) => {
    await login(page, "09121111101", patientPassword, "patient");
    await page.goto("/user/chat");
    await page.getByRole("button", { name: /پشتیبانی دنتو تایم/ }).first().click();
    await expectMessageViewportToScroll(page);

    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login$/);
    await login(page, adminPhone, adminPassword, "patient", /\/admin\/?$/);
    await page.goto("/admin/chat");
    await page.getByText("آرمان حسینی", { exact: true }).click();
    await expectMessageViewportToScroll(page);
  });

  test("calendar interactions, patient details, verified badge, and booked-slot guard work", async ({ page }) => {
    await login(page, "09131111201", doctorPassword, "doctor");
    await page.goto("/doctor/appointments");
    await expect(page.getByRole("link", { name: "احراز هویت انجام شده" })).toBeVisible();
    await page.getByRole("button", { name: "ماه بعد" }).click();
    const bookedCell = page.locator(`[data-date="${bookedDate}"]`);
    await expect(bookedCell).toBeVisible();

    const appointmentRow = page
      .locator("section")
      .filter({ hasText: "فهرست نوبت‌ها" })
      .getByRole("button")
      .filter({ hasText: "کاربر مجاز" })
      .first();
    await expect(appointmentRow).toBeVisible();
    await appointmentRow.hover();
    await expect(bookedCell).toHaveClass(/ring-amber-200/);
    await appointmentRow.click();
    const patientDialog = page.getByRole("dialog");
    await expect(patientDialog.getByRole("heading", { name: "مشخصات مراجع" })).toBeVisible();
    await expect(patientDialog.getByText("کاربر مجاز", { exact: true })).toBeVisible();
    await expect(patientDialog.getByText("+989121111101", { exact: true })).toBeVisible();
    await patientDialog.getByRole("button", { name: "بستن پنجره" }).click();

    await bookedCell.click();
    await expect(page.getByRole("button", { name: "حذف فیلتر تاریخ" })).toBeVisible();
    await expect(appointmentRow).toBeVisible();
    await page.screenshot({ path: "../qa-artifacts/qa-doctor-appointments.png", fullPage: true });
    const nextDate = "2026-08-27";
    await page.locator(`[data-date="${nextDate}"]`).click();
    await expect(page.getByText("نوبتی برای این روز وجود ندارد", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "تنظیم بازه های نوبت دهی" }).click();
    const availabilityDialog = page.getByRole("dialog");
    await expect(availabilityDialog.getByRole("heading", { name: "تنظیم بازه‌های نوبت دهی" })).toBeVisible();
    await page.screenshot({ path: "../qa-artifacts/qa-doctor-availability.png", fullPage: true });
    await availabilityDialog.locator("label").filter({ hasText: "پیش‌نمایش روز" }).locator("input").fill(bookedDate);
    await expect(availabilityDialog.getByText("رزرو شده", { exact: true })).toBeVisible();
    await availabilityDialog.getByRole("button", { name: "حذف بازه 15:00" }).click();
    await expect(availabilityDialog.getByRole("alert")).toContainText(
      "برای تاریخ انتخاب شده تعداد 1 نوبت رزرو شده",
    );
    await availabilityDialog.getByRole("button", { name: /مشاهده نوبت‌های این تاریخ/ }).click();
    await expect(availabilityDialog).toBeHidden();
    await expect(page.getByRole("button", { name: "حذف فیلتر تاریخ" })).toBeVisible();
    await expect(appointmentRow).toBeVisible();
  });

  test("patient, doctor, and admin logout always return to the main login page", async ({ page }) => {
    await login(page, "09121111101", patientPassword, "patient");
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login\/?$/);

    await login(page, "09131111201", doctorPassword, "doctor");
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login\/?$/);

    await login(page, adminPhone, adminPassword, "patient", /\/admin\/?$/);
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login\/?$/);
    await expect(page).not.toHaveURL(/\/admin\/login/);

    await page.goto("/admin/login");
    await page.waitForURL(/\/login\/?$/);
  });
});
