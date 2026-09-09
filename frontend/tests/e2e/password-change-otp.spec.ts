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
    json(route, { access: "password-change-access" }),
  );
  await page.route("**/api/v1/users/me/", (route) =>
    json(route, {
      id: "patient-otp",
      first_name: "کاربر",
      last_name: "آزمایشی",
      role: "USER",
      profile_picture: null,
    }),
  );
}

test("a user changes the password after verifying an SMS OTP", async ({ page }) => {
  await mockSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("dentotime_has_session", "1");
  });
  let submitted: { otp_token: string; new_password: string } | null = null;

  await page.route("**/api/v1/users/me/change-password/request-otp/", (route) =>
    json(route, {
      challenge_id: "challenge-password-change",
      phone_number: "+989010669227",
    }, 202),
  );
  await page.route("**/api/v1/auth/verify-otp/", (route) =>
    json(route, { otp_token: "verified-password-change" }),
  );
  await page.route("**/api/v1/users/me/change-password/", async (route) => {
    submitted = route.request().postDataJSON() as { otp_token: string; new_password: string };
    await json(route, { detail: "Password changed successfully." });
  });

  await page.goto("/user/edit-info");
  await expect(page.getByRole("heading", { name: "تغییر رمز عبور" })).toBeVisible();
  await page.getByRole("button", { name: "ارسال کد تایید" }).click();
  await expect(page.getByText("09010669227").first()).toBeVisible();

  for (const [index, digit] of ["1", "2", "3", "4", "5"].entries()) {
    await page.locator(`#input-${index}`).fill(digit);
  }
  await expect(page.getByLabel("رمز عبور جدید", { exact: true })).toBeVisible();
  await page.getByLabel("رمز عبور جدید", { exact: true }).fill("NewSecurePass456!");
  await page.getByLabel("تکرار رمز عبور جدید", { exact: true }).fill("NewSecurePass456!");
  await page.getByRole("button", { name: "ثبت رمز عبور جدید" }).click();

  await expect.poll(() => submitted).toEqual({
    otp_token: "verified-password-change",
    new_password: "NewSecurePass456!",
  });
  await expect(page).toHaveURL(/\/login\/?$/);
});
