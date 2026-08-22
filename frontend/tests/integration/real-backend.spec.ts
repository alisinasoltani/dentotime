import path from "node:path";

import { expect, test, type Page } from "@playwright/test";


const patientPassword = process.env.INTEGRATION_PATIENT_PASSWORD || "DemoRating123!";
const doctorPassword = process.env.INTEGRATION_DOCTOR_PASSWORD || "DemoRating123!";
const adminPhone = process.env.INTEGRATION_ADMIN_PHONE;
const adminPassword = process.env.INTEGRATION_ADMIN_PASSWORD;

const ratingLabels = [
  "نحوه برخورد پزشک",
  "توضیح پزشک در هنگام ویزیت",
  "مهارت پزشک در تشخیص و درمان",
  "فرآیند پذیرش و رفتار منشی",
  "شرایط محیطی",
] as const;

async function login(page: Page, phone: string, password: string, role: "patient" | "doctor") {
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
  await page.waitForURL(role === "patient" ? /\/user\/?$/ : /\/doctor\/?$/, {
    timeout: 90_000,
  });
}

test.describe.serial("real PostgreSQL, Redis, and MinIO integration", () => {
  test("public doctor data is database-backed, Jalali, and guests use the login page", async ({ page }) => {
    await page.goto("/doctors/arman-hosseini");

    await expect(page.getByRole("heading", { name: "نظرات درباره دکتر آرمان حسینی" })).toBeVisible();
    for (const label of ratingLabels) await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText("پیشنهاد کاربران", { exact: true })).toBeVisible();
    await expect(page.getByText("میانگین زمان انتظار", { exact: true })).toBeVisible();
    await expect(page.getByText("مریم ر.")).toBeVisible();
    await expect(page.getByText(/\(۱۴۰۵\/[۰-۹]{2}\/[۰-۹]{2}\)/).first()).toBeVisible();

    await page.getByRole("button", { name: "ثبت امتیاز" }).click();
    await page.waitForURL(/\/login\?returnTo=/);
    await expect(page.getByRole("heading", { name: "ورود به حساب کاربری" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an attended patient submits all seven rating values and a comment", async ({ page }) => {
    await login(page, "09121111101", patientPassword, "patient");
    await page.goto("/doctors/arman-hosseini");
    await expect(page.getByRole("link", { name: "پنل کاربری" }).first()).toBeVisible();
    await page.getByRole("button", { name: "ثبت امتیاز" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    for (const label of ratingLabels) {
      await dialog.getByRole("radio", { name: `5 ستاره برای ${label}` }).click();
    }
    await dialog.getByRole("radio", { name: "بله" }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "15 دقیقه تا 30 دقیقه" }).click();
    await dialog.getByRole("button", { name: "ثبت نظر و پایان" }).click();

    const comment = `نظر یکپارچه واقعی ${Date.now()}`;
    await dialog.getByLabel("نظر خود را در مورد این پزشک بنویسید (اختیاری)").fill(comment);
    await dialog.getByRole("button", { name: "ثبت نظر", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(comment)).toBeVisible();
    await expect(page.getByText(/\(۱۴۰۵\/[۰-۹]{2}\/[۰-۹]{2}\)/).first()).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "پنل کاربری" }).first()).toBeVisible();
  });

  test("chat reconnects and a patient upload completes through MinIO and the scanner", async ({ page, context }) => {
    await login(page, "09121111101", patientPassword, "patient");
    await page.goto("/user/chat");
    await page.getByRole("button", { name: /گفتگوی جدید/ }).click();
    await expect(page.getByRole("heading", { name: "پشتیبانی دنتو تایم" }).last()).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText(/اینترنت قطع است/)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/اینترنت قطع است/)).toBeHidden({ timeout: 20_000 });

    const message = `پیام پس از اتصال مجدد ${Date.now()}`;
    await page.getByPlaceholder("پیام خود را بنویسید…").fill(message);
    await page.getByRole("button", { name: "ارسال پیام" }).click();
    await expect(page.getByText(message)).toBeVisible();

    const filePath = path.resolve(process.cwd(), "public/images/logo.png");
    const uploadedFiles = page.getByRole("button", { name: "logo.png", exact: true });
    const previousUploadCount = await uploadedFiles.count();
    await page.locator('input[type="file"]').setInputFiles(filePath);
    await expect(uploadedFiles).toHaveCount(previousUploadCount + 1, { timeout: 45_000 });
    await expect(page.getByRole("button", { name: "افزودن فایل" })).toBeEnabled();

    await page.goto("/doctor/chat");
    await page.waitForURL(/\/user\/?$/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("logout permits switching to the patient with only a future appointment", async ({ page }) => {
    await login(page, "09121111101", patientPassword, "patient");
    await page.goto("/user");
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login$/);
    await login(page, "09121111102", patientPassword, "patient");

    await page.goto("/doctors/arman-hosseini");
    await expect(page.getByRole("link", { name: "پنل کاربری" }).first()).toBeVisible();
    await page.getByRole("button", { name: "ثبت امتیاز" }).click();
    await expect(page.getByRole("dialog")).toContainText("شما هنوز به این پزشک مراجعه نکردید");
  });

  test("an approved doctor sees database ratings and server logout clears the refresh session", async ({ page }) => {
    await login(page, "09121111102", patientPassword, "patient");
    await page.goto("/user");
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login$/);
    await login(page, "09131111201", doctorPassword, "doctor");
    await page.goto("/doctor/ratings");

    await expect(page.getByRole("heading", { name: "امتیازهای من" })).toBeVisible();
    await expect(page.getByText("مریم رضایی")).toBeVisible();
    await page.getByRole("button", { name: "خروج از حساب کاربری" }).click();
    await page.waitForURL(/\/login$/);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("doctor mobile navigation opens doctor chat and doctor appointments without a login loop", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await login(page, "09131111201", doctorPassword, "doctor");

    await page.getByRole("button", { name: "باز کردن منو" }).click();
    const doctorChatLink = page.getByRole("link", { name: "گفت و گو ها" });
    const doctorAppointmentsLink = page.getByRole("link", { name: "نوبت‌ها" });
    await expect(doctorChatLink).toHaveAttribute("href", "/doctor/chat");
    await expect(doctorAppointmentsLink).toHaveAttribute("href", "/doctor/appointments");
    await expect(page.locator('a[href^="/user/"]')).toHaveCount(0);

    await doctorChatLink.click();
    await page.waitForURL(/\/doctor\/chat\/?$/);
    await expect(page.getByRole("heading", { name: "گفتگوها" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole("button", { name: "باز کردن منو" }).click();
    await page.getByRole("link", { name: "نوبت‌ها" }).click();
    await page.waitForURL(/\/doctor\/appointments\/?$/);
    await expect(page.getByRole("heading", { name: "نوبت‌های من" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/user/appointments");
    await page.waitForURL(/\/doctor\/?$/);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("the system admin edits and restores a database rating parameter", async ({ page }) => {
    test.skip(!adminPhone || !adminPassword, "Set integration admin credentials to exercise admin CRUD.");
    await page.goto("/login");
    await page.getByRole("button", { name: "بخش مراجعان", exact: true }).click();
    await page.getByLabel("شماره تلفن همراه:").fill(adminPhone!);
    await page.getByLabel("رمز عبور:").fill(adminPassword!);
    await page.getByRole("button", { name: "ورود به حساب کاربری", exact: true }).click();
    await page.waitForURL(/\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "داشبورد مدیریت" })).toBeVisible();

    await page.goto("/admin/chat");
    await expect(page.getByRole("heading", { name: "گفتگوها" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/user/chat");
    await page.waitForURL(/\/admin\/?$/);
    await expect(page).not.toHaveURL(/\/login/);

    const ratingParametersLink = page.getByRole("link", { name: /متغیرهای امتیاز/ });
    await expect(ratingParametersLink).toBeVisible();
    await ratingParametersLink.click();
    await page.waitForURL(/\/admin\/rating-parameters\/?$/);

    await expect(page.getByRole("heading", { name: "متغیرهای امتیازدهی" })).toBeVisible();
    const form = page.locator("form").filter({ hasText: "doctor_manner" });
    const label = form.getByLabel("عنوان نمایشی");
    const original = await label.inputValue();
    await label.fill(`${original} — تست ذخیره`);
    await form.getByRole("button", { name: "ذخیره تغییرات" }).click();
    await expect(page.getByText("متغیر امتیاز ذخیره شد.")).toBeVisible();

    await label.fill(original);
    await form.getByRole("button", { name: "ذخیره تغییرات" }).click();
    await expect(label).toHaveValue(original);
  });
});
