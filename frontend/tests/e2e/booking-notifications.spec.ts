import { expect, test, type Page } from '@playwright/test';

// These tests exercise the same date-driven booking flow; serial execution per
// browser avoids timing races in the calendar/slot transition under a loaded CI host.
test.describe.configure({ mode: 'serial' });

const GUEST_MESSAGE = 'نوبت شما با موفقیت ثبت شد. برای مشاهده نوبت و پیگیری لطفا به حساب خود وارد شوید';
const AUTHENTICATED_MESSAGE = 'نوبت شما با موفقیت ذخیره شد';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function slotFixture(): { date: string; nextMonth: boolean } {
  const today = new Date();
  for (let day = today.getDate(); day <= new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(); day += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), day, 10);
    if (candidate.getDay() !== 5) return { date: localDate(candidate), nextMonth: false };
  }
  const candidate = new Date(today.getFullYear(), today.getMonth() + 1, 1, 10);
  if (candidate.getDay() === 5) candidate.setDate(2);
  return { date: localDate(candidate), nextMonth: true };
}

function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const SLOT = slotFixture();

async function mockBookingApi(
  page: Page,
  options: { authenticated?: boolean; bookingFails?: boolean } = {},
) {
  await page.route('**/api/v1/auth/token/refresh/', async (route) => {
    if (options.authenticated) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'test-access-token' }) });
    } else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'No session' }) });
    }
  });
  await page.route('**/api/v1/users/me/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ first_name: 'کاربر', last_name: 'آزمایشی', phone_number: '+989121234567', role: 'USER' }),
    });
  });
  await page.route('**/api/v1/appointments/captcha/', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ challenge_id: '11111111-1111-4111-8111-111111111111', image_data_url: PIXEL, expires_in: 300 }),
    });
  });
  await page.route('**/api/v1/appointments/slots/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [{ id: 71, date: SLOT.date, start_at: `${SLOT.date}T10:00:00+03:30`, end_at: `${SLOT.date}T10:30:00+03:30`, status: 'AVAILABLE' }],
      }),
    });
  });
  await page.route('**/api/v1/appointments/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (options.bookingFails) {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'این زمان دیگر در دسترس نیست.' }) });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'appointment-id', authenticated: Boolean(options.authenticated) }),
    });
  });
}

async function prepareBooking(page: Page, authenticated = false) {
  await mockBookingApi(page, { authenticated });
  await page.goto('/#slots');
  if (SLOT.nextMonth) await page.getByTestId('booking-next-month').click();
  await page.getByTestId(`booking-date-${SLOT.date}`).click();
  await page.getByLabel('ساعت مراجعه').selectOption('71');
  if (!authenticated) {
    const form = page.locator('#slots');
    await form.locator('input[name="first_name"]').fill('مهمان');
    await form.locator('input[name="last_name"]').fill('آزمایشی');
    await form.locator('input[name="phone_number"]').fill('09121234567');
    await form.locator('input[name="captcha_answer"]').fill('D3NTO');
  }
}

test('guest feedback has exact copy, RTL layout, and a separate accessible login action', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await prepareBooking(page);
  await page.getByTestId('submit-booking').click();

  const toast = page.getByTestId('guest-booking-success');
  const text = page.getByTestId('guest-booking-success-text');
  const button = page.getByRole('button', { name: 'ورود به حساب' });
  await expect(toast).toBeVisible();
  await expect(text).toHaveText(GUEST_MESSAGE);
  await expect(toast).toHaveAttribute('dir', 'rtl');
  await expect(button).toBeVisible();

  const textBox = await text.boundingBox();
  const buttonBox = await button.boundingBox();
  expect(textBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(textBox!.y + textBox!.height);

  await button.focus();
  await expect(button).toBeFocused();
  await button.click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/#slots');
});

test('authenticated feedback contains only the required message', async ({ page }) => {
  await prepareBooking(page, true);
  await page.getByTestId('submit-booking').click();

  await expect(page.getByText(AUTHENTICATED_MESSAGE, { exact: true })).toBeVisible();
  await expect(page.getByText(GUEST_MESSAGE, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ورود به حساب' })).toHaveCount(0);
});

test('failed booking never displays either success notification', async ({ page }) => {
  await mockBookingApi(page, { bookingFails: true });
  await page.goto('/#slots');
  if (SLOT.nextMonth) await page.getByTestId('booking-next-month').click();
  await page.getByTestId(`booking-date-${SLOT.date}`).click();
  await page.getByLabel('ساعت مراجعه').selectOption('71');
  const form = page.locator('#slots');
  await form.locator('input[name="first_name"]').fill('مهمان');
  await form.locator('input[name="last_name"]').fill('آزمایشی');
  await form.locator('input[name="phone_number"]').fill('09121234567');
  await form.locator('input[name="captcha_answer"]').fill('D3NTO');
  await page.getByTestId('submit-booking').click();

  await expect(page.getByText('این زمان دیگر در دسترس نیست.', { exact: true })).toBeVisible();
  await expect(page.getByText(GUEST_MESSAGE, { exact: true })).toHaveCount(0);
  await expect(page.getByText(AUTHENTICATED_MESSAGE, { exact: true })).toHaveCount(0);
});
