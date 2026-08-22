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


const parameters = [
  { id: 1, key: 'doctor_manner', label: 'نحوه برخورد پزشک', prompt: 'نحوه برخورد پزشک را چگونه ارزیابی می‌کنید؟', input_type: 'STAR', options: [], position: 1, average: 4.2, answer_count: 2 },
  { id: 2, key: 'doctor_explanation', label: 'توضیح پزشک در هنگام ویزیت', prompt: 'توضیحات پزشک در هنگام ویزیت را چگونه ارزیابی می‌کنید؟', input_type: 'STAR', options: [], position: 2, average: 4.1, answer_count: 2 },
  { id: 3, key: 'diagnosis_and_treatment', label: 'مهارت پزشک در تشخیص و درمان', prompt: 'مهارت پزشک در تشخیص و درمان را چگونه ارزیابی می‌کنید؟', input_type: 'STAR', options: [], position: 3, average: 4.5, answer_count: 2 },
  { id: 4, key: 'reception_and_secretary', label: 'فرآیند پذیرش و رفتار منشی', prompt: 'فرآیند پذیرش و رفتار منشی را چگونه ارزیابی می‌کنید؟', input_type: 'STAR', options: [], position: 4, average: 3.9, answer_count: 2 },
  { id: 5, key: 'environment', label: 'شرایط محیطی', prompt: 'شرایط محیطی را چگونه ارزیابی می‌کنید؟', input_type: 'STAR', options: [], position: 5, average: 4, answer_count: 2 },
  { id: 6, key: 'recommendation', label: 'پیشنهاد کاربران', prompt: 'آیا مراجعه به این پزشک را به دیگران توصیه می‌کنید؟', input_type: 'RECOMMENDATION', options: [{ value: 1, label: 'بله' }, { value: 0, label: 'خیر' }], position: 6, average: 1, answer_count: 2 },
  { id: 7, key: 'wait_time', label: 'میانگین زمان انتظار', prompt: 'برای ویزیت چه مدت منتظر ماندید؟', input_type: 'WAIT_TIME', options: [{ value: 0, label: 'راس ساعت تا 15 دقیقه' }, { value: 1, label: '15 دقیقه تا 30 دقیقه' }, { value: 2, label: '30 دقیقه تا 1 ساعت' }, { value: 3, label: 'بیشتر از 1 ساعت' }], position: 7, average: 1, answer_count: 2 },
] as const;


function reviewAnswers(star = 4) {
  return parameters.map((parameter) => ({
    parameter_id: parameter.id,
    key: parameter.key,
    label: parameter.label,
    input_type: parameter.input_type,
    value: parameter.input_type === 'STAR' ? star : parameter.input_type === 'RECOMMENDATION' ? 1 : 1,
    option_label: parameter.input_type === 'WAIT_TIME' ? '15 دقیقه تا 30 دقیقه' : parameter.input_type === 'RECOMMENDATION' ? 'بله' : '',
  }));
}


test('a visited patient completes every rating parameter, adds a comment, and sees the updated aggregate', async ({ page }) => {
  await mockSession(page, 'USER');
  let submitted: { answers: Array<{ parameter_id: number; value: number }>; comment: string } | null = null;
  await page.route('**/api/v1/doctors/arman-hosseini/rating-summary/**', (route) => json(route, {
    average_rating: submitted ? 4 : 3.5,
    vote_count: submitted ? 3 : 2,
    recommendation_percentage: 95,
    recommendation_count: 2,
    average_wait_time: { value: 1, label: '15 دقیقه تا 30 دقیقه' },
    parameters,
  }));
  await page.route('**/api/v1/doctors/arman-hosseini/review-eligibility/**', (route) => json(route, {
    state: 'ELIGIBLE', qualifying_appointment_id: 'appointment-1', existing_review: null,
  }));
  await page.route('**/api/v1/doctors/arman-hosseini/reviews/**', async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON() as { answers: Array<{ parameter_id: number; value: number }>; comment: string };
      await json(route, {
        id: 'review-1', reviewer_display_name: 'کاربر آ.', rating: 4,
        answers: reviewAnswers(4), comment: submitted.comment,
        created_at: '2026-08-13T10:00:00Z', updated_at: '2026-08-13T10:00:00Z',
      }, 201);
      return;
    }
    await json(route, {
      count: 1, next: null, previous: null, results: [{
        id: 'review-public', reviewer_display_name: 'مریم ر.', rating: 3, comment: 'خوب بود',
        answers: reviewAnswers(3),
        created_at: '2026-08-12T10:00:00Z', updated_at: '2026-08-12T10:00:00Z',
      }],
    });
  });

  await page.goto('/doctors/arman-hosseini');
  await expect(page.getByRole('heading', { name: 'نظرات درباره دکتر آرمان حسینی' })).toBeVisible();
  await expect(page.getByText('۳.۵')).toBeVisible();
  await expect(page.getByText('مریم ر.')).toBeVisible();
  await expect(page.getByText(/۱۴۰۵\//)).toBeVisible();
  await page.getByRole('button', { name: 'ثبت امتیاز' }).click();
  for (const parameter of parameters.filter((item) => item.input_type === 'STAR')) {
    await page.getByRole('radio', { name: `4 ستاره برای ${parameter.label}` }).click();
  }
  await page.getByRole('radio', { name: 'بله' }).click();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '15 دقیقه تا 30 دقیقه' }).click();
  await page.getByRole('button', { name: 'ثبت نظر و پایان' }).click();
  await page.getByLabel('نظر خود را در مورد این پزشک بنویسید (اختیاری)').fill('تجربه مناسب');
  await page.getByRole('button', { name: 'ثبت نظر' }).click();

  await expect.poll(() => submitted).not.toBeNull();
  expect(submitted!.answers).toHaveLength(7);
  expect(submitted!.answers.every((answer) => typeof answer.value === 'number')).toBe(true);
  expect(submitted!.comment).toBe('تجربه مناسب');
  await expect(page.getByText('۴.۰', { exact: true })).toBeVisible();
});


for (const scenario of [
  { state: 'NO_APPOINTMENT', message: 'شما هنوز نوبت ثبت شده ای برای این پزشک ندارید' },
  { state: 'UPCOMING_APPOINTMENT', message: 'شما هنوز به این پزشک مراجعه نکردید' },
  { state: 'VISIT_CONFIRMATION_REQUIRED', message: 'شما هنوز یک نوبت مراجعه شده با این پزشک ندارید' },
] as const) {
  test(`rating eligibility modal shows ${scenario.state}`, async ({ page }) => {
    await mockSession(page, 'USER');
    await page.route('**/api/v1/doctors/arman-hosseini/rating-summary/**', (route) => json(route, {
      average_rating: 4, vote_count: 1, recommendation_percentage: 100,
      recommendation_count: 1, average_wait_time: parameters[6].options[1], parameters,
    }));
    await page.route('**/api/v1/doctors/arman-hosseini/reviews/**', (route) => json(route, {
      count: 0, next: null, previous: null, results: [],
    }));
    await page.route('**/api/v1/doctors/arman-hosseini/review-eligibility/**', (route) => json(route, { state: scenario.state }));

    await page.goto('/doctors/arman-hosseini');
    await page.getByRole('button', { name: 'ثبت امتیاز' }).click();
    await expect(page.getByRole('dialog')).toContainText(scenario.message);
    if (scenario.state === 'VISIT_CONFIRMATION_REQUIRED') {
      const link = page.getByRole('link', { name: /وضعیت نوبت خود/ });
      await expect(link).toHaveAttribute('href', /\/user\/appointments\?doctor=/);
    }
  });
}


test('a past doctor appointment asks for visit confirmation and supports the doctor query filter', async ({ page }) => {
  await mockSession(page, 'USER');
  let attendanceSubmitted: boolean | null = null;
  const appointment = {
    id: '11111111-1111-1111-1111-111111111111',
    doctor: { id: 42, first_name: 'آرمان', last_name: 'حسینی', display_name: 'آرمان حسینی' },
    slot: { date: '2026-08-10', start_at: '2026-08-10T07:00:00Z', end_at: '2026-08-10T07:30:00Z' },
    status: 'APPROVED', attendance_status: 'NOT_CONFIRMED', attendance_confirmed_at: null,
    reason: 'معاینه', created_at: '2026-08-01T07:00:00Z', can_cancel: false,
  };
  await page.route('**/api/v1/appointments/me/**', (route) => json(route, {
    count: 1, next: null, previous: null, results: [appointment],
  }));
  await page.route('**/api/v1/appointments/11111111-1111-1111-1111-111111111111/attendance/**', async (route) => {
    attendanceSubmitted = (route.request().postDataJSON() as { attended: boolean }).attended;
    await json(route, { ...appointment, attendance_status: attendanceSubmitted ? 'ATTENDED' : 'DID_NOT_ATTEND', attendance_confirmed_at: '2026-08-20T10:00:00Z' });
  });

  await page.goto('/user/appointments?doctor=دکتر%20آرمان%20حسینی');
  await expect(page.getByLabel('جست‌وجوی نام پزشک')).toHaveValue('دکتر آرمان حسینی');
  await expect(page.getByText('آیا برای نوبت خود به دکتر آرمان حسینی مراجعه کردید؟')).toBeVisible();
  await page.getByRole('button', { name: 'بله، مراجعه کردم' }).click();

  await expect.poll(() => attendanceSubmitted).toBe(true);
  await expect(page.getByText('مراجعه کردم', { exact: true })).toBeVisible();
});


test('the public doctor directory shows curated doctors with rating counts', async ({ page }) => {
  await page.route('**/api/v1/auth/token/refresh/', (route) => json(route, {}));
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'دکتر آرمان حسینی' })).toBeVisible();
  await expect(page.getByText('4.9').first()).toBeVisible();
  await expect(page.getByText('(156 نظر)')).toBeVisible();
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
