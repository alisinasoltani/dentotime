import { expect, test, type Page, type Route } from '@playwright/test';


async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}


async function mockSession(page: Page, role: 'USER' | 'DOCTOR' | 'ADMIN') {
  await page.route('**/api/v1/auth/token/refresh/', (route) => json(route, { access: 'rating-access' }));
  await page.route('**/api/v1/users/me/', (route) => json(route, {
    id: `${role.toLowerCase()}-1`,
    first_name: role === 'DOCTOR' ? 'سارا' : 'کاربر',
    last_name: 'آزمایشی',
    role,
  }));
}


test('a logged-in patient submits a strict rating and sees the updated aggregate', async ({ page }) => {
  await mockSession(page, 'USER');
  let submitted: { rating?: unknown; comment?: unknown } | null = null;
  await page.route('**/api/v1/doctors/42/', (route) => json(route, {
    id: 42,
    first_name: 'سارا',
    last_name: 'دندانپزشک',
    display_name: 'سارا دندانپزشک',
    clinic_name: 'کلینیک سپید',
    profile_picture: null,
    likes_count: 3,
    is_liked: false,
    average_rating: submitted ? 4 : 3.5,
    vote_count: submitted ? 3 : 2,
  }));
  await page.route('**/api/v1/doctors/42/reviews/**', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON() as { rating?: unknown; comment?: unknown };
      await json(route, {
        id: 'review-1', reviewer_display_name: 'کاربر آ.', rating: submitted.rating,
        comment: submitted.comment, created_at: '2026-08-13T10:00:00Z', updated_at: '2026-08-13T10:00:00Z',
      }, 201);
      return;
    }
    await json(route, {
      count: 1, next: null, previous: null, results: [{
        id: 'review-public', reviewer_display_name: 'مریم ر.', rating: 3, comment: 'خوب بود',
        created_at: '2026-08-12T10:00:00Z', updated_at: '2026-08-12T10:00:00Z',
      }],
    });
  });

  await page.goto('/doctors/42');
  await expect(page.getByText('3.5 از ۵ (2 رأی)')).toBeVisible();
  await expect(page.getByText('مریم ر.')).toBeVisible();
  await page.getByRole('button', { name: '4 ستاره' }).click();
  await page.getByPlaceholder(/تجربه خود/).fill('تجربه مناسب');
  await page.getByRole('button', { name: 'ثبت نظر' }).click();

  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted).toEqual({ rating: 4, comment: 'تجربه مناسب' });
  expect(typeof submitted!.rating).toBe('number');
  await expect(page.getByText('4.0 از ۵ (3 رأی)')).toBeVisible();
});


test('the public doctor directory loads every paginated result with rating counts', async ({ page }) => {
  await page.route('**/api/v1/auth/token/refresh/', (route) => json(route, { detail: 'guest' }, 401));
  await page.route('**/api/v1/doctors/list/**', async (route) => {
    const requestedPage = new URL(route.request().url()).searchParams.get('page');
    const secondPage = requestedPage === '2';
    await json(route, {
      count: 2,
      next: secondPage ? null : 'https://api.example/api/v1/doctors/list/?page=2',
      previous: secondPage ? 'https://api.example/api/v1/doctors/list/?page=1' : null,
      results: [{
        id: secondPage ? 2 : 1,
        first_name: secondPage ? 'پزشک دوم' : 'پزشک اول',
        last_name: 'آزمایشی',
        display_name: secondPage ? 'پزشک دوم آزمایشی' : 'پزشک اول آزمایشی',
        clinic_name: 'کلینیک', profile_picture: null, likes_count: 1,
        average_rating: secondPage ? 5 : 4.2, vote_count: secondPage ? 1 : 12,
      }],
    });
  });

  await page.goto('/doctors');
  await expect(page.getByText(/پزشک اول/).first()).toBeVisible();
  await expect(page.getByText('4.2 از ۵ (12 رأی)')).toBeVisible();
  await page.getByRole('button', { name: 'نمایش پزشکان بیشتر' }).click();
  await expect(page.getByText(/پزشک دوم/).first()).toBeVisible();
  await expect(page.getByText('5.0 از ۵ (1 رأی)')).toBeVisible();
});


test('a doctor sees the paginated voter identity and rating summary in their panel', async ({ page }) => {
  await mockSession(page, 'DOCTOR');
  await page.route('**/api/v1/doctors/verification/', (route) => json(route, {
    verification_status: 'APPROVED', documents: [],
  }));
  await page.route('**/api/v1/doctors/ratings/**', (route) => json(route, {
    count: 1,
    next: null,
    previous: null,
    average_rating: 4.5,
    vote_count: 8,
    results: [{
      id: 'rating-1', voter: { id: 'patient-1', first_name: 'علی', last_name: 'بیمار' },
      rating: 5, comment: 'عالی', created_at: '2026-08-13T10:00:00Z', updated_at: '2026-08-13T10:00:00Z',
    }],
  }));
  await page.route('**/api/v1/chat/threads**', (route) => json(route, { count: 0, next: null, previous: null, results: [] }));

  await page.goto('/doctor/ratings');

  await expect(page.getByRole('heading', { name: 'امتیازهای من' })).toBeVisible();
  await expect(page.getByText('4.5')).toBeVisible();
  await expect(page.getByText('8')).toBeVisible();
  await expect(page.getByText('علی بیمار')).toBeVisible();
  await expect(page.getByText('5 از ۵')).toBeVisible();
});


test('an administrator opens a doctor voter list without exposing phone numbers', async ({ page }) => {
  await mockSession(page, 'ADMIN');
  await page.route('**/api/v1/admin/doctors/**', async (route) => {
    if (route.request().url().includes('/ratings/')) {
      await json(route, {
        count: 1, next: null, previous: null, average_rating: 4.5, vote_count: 2,
        results: [{
          id: 'rating-admin', voter: { id: 'patient-2', first_name: 'نیلوفر', last_name: 'بیمار' },
          rating: 4, comment: '', created_at: '2026-08-13T10:00:00Z', updated_at: '2026-08-13T10:00:00Z',
        }],
      });
      return;
    }
    await json(route, {
      count: 1, next: null, previous: null, results: [{
        id: 42, first_name: 'سارا', last_name: 'پزشک', username: 'doctor',
        verification_status: 'APPROVED', date_joined: '2026-08-01T10:00:00Z',
        documents: [], average_rating: 4.5, vote_count: 2,
      }],
    });
  });

  await page.goto('/admin/doctors');
  await page.getByRole('button', { name: /4.5 از ۵/ }).click();

  await expect(page.getByRole('dialog')).toContainText('امتیازهای سارا پزشک');
  await expect(page.getByRole('dialog')).toContainText('نیلوفر بیمار');
  await expect(page.getByRole('dialog')).not.toContainText('+98');
});
