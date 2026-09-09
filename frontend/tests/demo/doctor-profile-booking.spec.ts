import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import type { DoctorPublicProfile, PublicCatalog } from "../../lib/types";

async function login(page: Page, phone: string, doctor = false) {
  await page.goto("/login");
  await page.getByRole("button", { name: doctor ? "بخش پزشکان" : "بخش مراجعان", exact: true }).click();
  await page.locator("#login-phone").fill(phone);
  await page.locator("#login-password").fill("DentoDemo2026!");
  const pending = page.waitForResponse(r => r.url().includes("/auth/login/") && r.request().method() === "POST");
  await page.getByRole("button", { name: "ورود به حساب کاربری", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const data = await response.json();
  await expect(page).toHaveURL(doctor ? /\/doctor/ : /\/user/);
  return { Authorization: `Bearer ${data.access}` };
}

async function screenshot(page: Page, name: string) {
  if (process.env.DEMO_QA_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.DEMO_QA_SCREENSHOTS, `${name}.png`), fullPage: true });
}

async function select(page: Page, id: string, text: string) {
  await page.locator(`#${id}`).click();
  await page.getByRole("option", { name: text, exact: true }).click();
}

test("doctor edits appear publicly; patient selects insurance, service, matching doctor and books", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const doctorHeaders = await login(page, "09120001201", true);
  const profileResponse = await page.request.get("/api/v1/doctors/me/profile/", { headers: doctorHeaders });
  expect(profileResponse.status()).toBe(200);
  const original: DoctorPublicProfile = await profileResponse.json();
  const catalog: PublicCatalog = await (await page.request.get("/api/v1/doctors/catalog/")).json();
  const insurance = catalog.insurances.find(item => !original.insurances.includes(item.id))!;
  const service = catalog.services.find(item => original.services.includes(item.id))!;
  const otherService = catalog.services.find(item => item.id !== service.id)!;
  const originalInsurance = catalog.insurances.find(item => original.insurances.includes(item.id))!;
  const edited = { specialty: "دندان‌پزشکی عمومی ـ نمایشی", bio: "معرفی نمایشی پزشک برای آزمون پروفایل", experience: "سابقه نمایشی پزشک", clinic_name: "مطب نمایشی دنتوتایم", education: "تحصیلات نمایشی ـ بدون ادعای مدرک واقعی", clinical_history: "سوابق بالینی نمایشی\nتکمیل توسط پزشک", certifications: "گواهی‌های نمایشی برای آزمون", address: "نشانی نمایشی مطب ـ محل مراجعه واقعی نیست", map_url: "https://www.openstreetmap.org/?mlat=35.7&mlon=51.4" };
  const patientContext = await browser.newContext({ baseURL: "http://localhost:3100" });
  let appointmentId: string | undefined;
  let patientHeaders: { Authorization: string } | undefined;
  try {
    await page.goto("/doctor/edit-info");
    await expect(page.getByRole("heading", { name: "اطلاعات پروفایل عمومی پزشک" })).toBeVisible();
    for (const [key, value] of Object.entries(edited)) await page.locator(`#profile-${key}`).fill(value);
    for (const item of catalog.insurances) await page.locator(`#profile-insurances-${item.id}`).setChecked(item.id === insurance.id);
    for (const item of catalog.services) await page.locator(`#profile-services-${item.id}`).setChecked(item.id === service.id);
    const saved = page.waitForResponse(r => r.url().includes("/doctors/me/profile/") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "ذخیره پروفایل عمومی", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await page.reload();
    await expect(page.locator("#profile-education")).toHaveValue(edited.education);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.locator("#public-profile-title").scrollIntoViewIfNeeded();
      await screenshot(page, `doctor-editor-${viewport.width}`);
      await page.goto("/doctors/demo-doctor-approved");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("آرمان");
      for (const key of ["specialty", "bio", "education", "certifications", "address"] as const) await expect(page.getByText(edited[key], { exact: true })).toBeVisible();
      await expect(page.getByText("دانشگاه علوم پزشکی تهران", { exact: false })).toHaveCount(0);
      await expect(page.locator('[aria-labelledby="insurance-profile-title"]')).toContainText(insurance.name);
      await expect(page.locator('[aria-labelledby="insurance-profile-title"] li')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await screenshot(page, `doctor-public-${viewport.width}`);
      await page.goto("/doctor/edit-info");
    }

    const patient = await patientContext.newPage();
    patient.on("pageerror", error => errors.push(error.message));
    patient.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    patientHeaders = await login(patient, "09120001102");
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await patient.setViewportSize(viewport);
      await patient.goto("/user/appointments");
      await patient.getByRole("button", { name: /نوبت جدید/ }).click();
      const dialog = patient.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(patient.locator("#booking-service")).toBeDisabled();
      await expect(patient.locator("#booking-doctor")).toBeDisabled();
      await select(patient, "booking-insurance", insurance.name);
      await select(patient, "booking-service", service.title);
      await patient.locator("#booking-doctor").click();
      await expect(patient.getByRole("option")).toHaveCount(1);
      await patient.getByRole("option").click();
      await dialog.getByTestId("booking-calendar-day").filter({ visible: true }).and(patient.locator(":enabled")).first().click();
      const time = patient.locator("#booking-time");
      await expect(time).toBeEnabled();
      await time.selectOption({ index: 1 });
      const oldSlot = await time.inputValue();
      expect(oldSlot).not.toBe("");
      await select(patient, "booking-insurance", originalInsurance.name);
      await expect(patient.locator("#booking-doctor")).toContainText("پزشک مورد نظر");
      await expect(time).toHaveValue("");
      await expect(time).toBeDisabled();
      await select(patient, "booking-insurance", insurance.name);
      await select(patient, "booking-service", otherService.title);
      await expect(dialog.getByRole("status")).toContainText("پزشکی با این بیمه و خدمت یافت نشد");
      await select(patient, "booking-service", service.title);
      await patient.locator("#booking-doctor").click();
      await patient.getByRole("option").click();
      await dialog.getByTestId("booking-calendar-day").and(patient.locator(":enabled")).first().click();
      await time.selectOption({ index: 1 });
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await patient.locator("#booking-insurance").scrollIntoViewIfNeeded();
      await screenshot(patient, `insurance-booking-${viewport.width}`);
      if (viewport.width === 390) {
        const created = patient.waitForResponse(r => r.url().endsWith("/api/v1/appointments/") && r.request().method() === "POST");
        await dialog.getByRole("button", { name: "ثبت نوبت", exact: true }).click();
        const response = await created;
        const result = await response.json();
        if (response.status() === 201) appointmentId = result.id;
        expect(response.status(), JSON.stringify(result)).toBe(201);
        expect(result.insurance).toBe(insurance.id);
        expect(result.service).toBe(service.id);
        await expect(dialog).not.toBeVisible();
      }
    }
    expect(errors).toEqual([]);
  } finally {
    if (appointmentId && patientHeaders) {
      const cancelled = await patientContext.request.post(`/api/v1/appointments/${appointmentId}/cancel/`, { headers: patientHeaders });
      expect(cancelled.ok()).toBe(true);
    }
    const restored = await page.request.patch("/api/v1/doctors/me/profile/", { headers: doctorHeaders, data: original });
    expect(restored.ok()).toBe(true);
    await patientContext.close();
  }
});
