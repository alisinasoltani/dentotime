import { expect, test, type Route } from '@playwright/test';


async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}


test('verification documents request a fresh authenticated download grant only when clicked', async ({ page }) => {
  let grantCalls = 0;
  let grantAuthorization = '';
  await page.addInitScript(() => {
    Object.defineProperty(window, '__openedDownload', { value: '', writable: true });
    window.open = ((url?: string | URL) => {
      (window as unknown as { __openedDownload: string }).__openedDownload = String(url ?? '');
      return {} as Window;
    }) as typeof window.open;
  });
  await page.route('**/api/v1/auth/token/refresh/', (route) => json(route, { access: 'test-access' }));
  await page.route('**/api/v1/users/me/', (route) => json(route, {
    id: 'admin-1', first_name: 'مدیر', last_name: 'سامانه', role: 'ADMIN',
  }));
  await page.route('**/api/v1/admin/doctors/**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (new URL(route.request().url()).pathname.endsWith('/admin/doctors/42/')) {
      await json(route, {
        id: 42,
        first_name: 'سارا',
        last_name: 'پزشک',
        verification_status: 'PENDING',
        documents: [{
          asset_id: '33333333-3333-4333-8333-333333333333',
          file_name: 'identity.pdf',
          file_size: 100,
          file_content_type: 'application/pdf',
          state: 'AVAILABLE',
          scan_status: 'CLEAN',
        }],
      });
      return;
    }
    await json(route, {
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 42,
        user: { id: 'doctor-1', first_name: 'سارا', last_name: 'پزشک', username: 'doctor' },
        verification_status: 'PENDING',
        submitted_at: '2026-08-13T10:00:00Z',
      }],
    });
  });
  await page.route('**/api/v1/files/assets/33333333-3333-4333-8333-333333333333/download/', async (route) => {
    grantCalls += 1;
    grantAuthorization = route.request().headers().authorization ?? '';
    await json(route, {
      url: 'https://127.0.0.1:3100/private-signed-object?X-Amz-Expires=60&X-Amz-Signature=test',
      expires_in: 60,
    });
  });

  await page.goto('/admin/requests');
  await expect(page.getByText('identity.pdf')).toHaveCount(0);
  expect(grantCalls).toBe(0);

  await page.getByRole('button', { name: /مشاهده مدارک/ }).click();
  await expect(page.getByText('identity.pdf')).toBeVisible();
  expect(grantCalls).toBe(0);

  await page.getByRole('button', { name: 'دانلود' }).click();
  await expect.poll(() => grantCalls).toBe(1);
  expect(grantAuthorization).toBe('Bearer test-access');
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __openedDownload: string }
  ).__openedDownload)).toContain('X-Amz-Signature=test');
});
