import { expect, test } from "@playwright/test";


test("login role tabs remain switchable after a failed attempt", async ({ page }) => {
  await page.route("**/api/v1/auth/login/", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "اطلاعات ورود نامعتبر است." }),
    }),
  );

  await page.goto("/login");
  const doctorTab = page.getByRole("button", { name: "بخش پزشکان", exact: true });
  const patientTab = page.getByRole("button", { name: "بخش مراجعان", exact: true });
  const loginButton = page.getByRole("button", { name: "ورود به حساب کاربری", exact: true });

  await patientTab.click();
  await expect(patientTab).toHaveAttribute("aria-pressed", "true");
  await expect(doctorTab).toHaveAttribute("aria-pressed", "false");

  await page.getByLabel("شماره تلفن همراه:").fill("09121111101");
  await page.getByLabel("رمز عبور:").fill("wrong-password");
  await loginButton.click();
  await expect(page.getByText("اطلاعات ورود نامعتبر است.", { exact: true })).toBeVisible();

  await doctorTab.click();
  await expect(doctorTab).toHaveAttribute("aria-pressed", "true");
  await expect(patientTab).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("اطلاعات ورود نامعتبر است.", { exact: true })).toHaveCount(0);

  await patientTab.click();
  await expect(patientTab).toHaveAttribute("aria-pressed", "true");
});


test("a valid existing session does not redirect before choosing another login role", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dentotime_has_session", "1");
  });

  await page.route("**/api/v1/auth/token/refresh/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: "existing-session-access-token" }),
    }),
  );

  let releaseUserResponse: () => void = () => undefined;
  const userResponseReady = new Promise<void>((resolve) => {
    releaseUserResponse = resolve;
  });
  await page.route("**/api/v1/users/me/", async (route) => {
    await userResponseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, first_name: "کاربر", last_name: "آزمون", role: "USER" }),
    });
  });

  await page.goto("/login");
  const patientTab = page.getByRole("button", { name: "بخش مراجعان", exact: true });
  await patientTab.click();

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(patientTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("ورود به بخش مراجعان", { exact: true })).toBeVisible();

  releaseUserResponse();
  await expect(page).toHaveURL(/\/login\/?$/);
});
