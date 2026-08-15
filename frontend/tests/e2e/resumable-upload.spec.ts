import { createHash } from 'node:crypto';

import { expect, test, type Page, type Route } from '@playwright/test';

const PART_SIZE = 1024 * 1024;
const FILE_SIZE = PART_SIZE + 1;
const MAX_RETRY_ATTEMPTS = 4;
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47];
const FILE_SHA256 = (() => {
  const bytes = Buffer.alloc(FILE_SIZE);
  bytes.set(PNG_HEADER);
  return createHash('sha256').update(bytes).digest('hex');
})();

interface UploadMockState {
  createCalls: number;
  completedParts: Set<number>;
  putCounts: Map<number, number>;
  presignBatches: number[][];
  failSecondPart: boolean;
  submittedAssetIds: string[] | null;
  workerSha256: string | null;
  verificationSubmitted: boolean;
  scanPolls: number;
}

function sessionPayload(state: UploadMockState, scanAvailable = false) {
  return {
    upload_id: '11111111-1111-4111-8111-111111111111',
    client_upload_id: '22222222-2222-4222-8222-222222222222',
    asset_id: '33333333-3333-4333-8333-333333333333',
    purpose: 'verification_document',
    file_name: 'identity.png',
    file_size: FILE_SIZE,
    file_content_type: 'image/png',
    sha256: FILE_SHA256,
    part_size: PART_SIZE,
    expected_part_count: 2,
    state: state.completedParts.size === 2 ? 'COMPLETED' : 'UPLOADING',
    asset_state: scanAvailable ? 'AVAILABLE' : state.completedParts.size === 2 ? 'QUARANTINED' : 'UPLOADING',
    scan_status: scanAvailable ? 'CLEAN' : 'PENDING',
    expires_at: '2035-01-01T00:00:00Z',
    completed_parts: [...state.completedParts].sort().map((partNumber) => ({
      part_number: partNumber,
      size: partNumber === 1 ? PART_SIZE : 1,
      etag: `"etag-${partNumber}"`,
      checksum_sha256: 'a'.repeat(64),
    })),
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockUploadFlow(page: Page, state: UploadMockState) {
  await page.route('**/api/v1/auth/token/refresh/', (route) => json(route, { access: 'test-access' }));
  await page.route('**/api/v1/users/me/', (route) => json(route, {
    id: 'doctor-1', first_name: 'پزشک', last_name: 'آزمایشی', role: 'DOCTOR', verification_status: 'NOT_SUBMITTED',
  }));
  await page.route('**/api/v1/doctors/verification/', (route) => json(route, {
    verification_status: state.verificationSubmitted ? 'PENDING' : 'NOT_SUBMITTED',
    documents: [],
  }));
  await page.route('**/api/v1/doctors/verification/submit/', async (route) => {
    const payload = route.request().postDataJSON() as { asset_ids?: string[] };
    state.submittedAssetIds = payload.asset_ids ?? null;
    state.verificationSubmitted = true;
    await json(route, { message: 'ok' });
  });
  await page.route('**/api/v1/files/uploads/', async (route) => {
    state.createCalls += 1;
    const payload = route.request().postDataJSON() as { sha256: string };
    state.workerSha256 = payload.sha256;
    await json(route, sessionPayload(state), 201);
  });
  await page.route('**/api/v1/files/uploads/11111111-1111-4111-8111-111111111111/', async (route) => {
    if (state.completedParts.size === 2) state.scanPolls += 1;
    await json(route, sessionPayload(state, state.scanPolls > 0));
  });
  await page.route('**/parts/presign/', async (route) => {
    const payload = route.request().postDataJSON() as { parts: Array<{ part_number: number }> };
    const numbers = payload.parts.map((part) => part.part_number);
    state.presignBatches.push(numbers);
    await json(route, {
      parts: numbers.map((partNumber) => ({
        part_number: partNumber,
        url: `https://127.0.0.1:3100/storage-upload/part-${partNumber}`,
        checksum_sha256: 'Y2hlY2tzdW0=',
        expires_in: 60,
      })),
    });
  });
  await page.route('**/parts/record/', async (route) => {
    const payload = route.request().postDataJSON() as { part_number: number };
    state.completedParts.add(payload.part_number);
    await json(route, payload);
  });
  await page.route('**/complete/', async (route) => {
    state.completedParts.add(1);
    state.completedParts.add(2);
    await json(route, sessionPayload(state));
  });
  await page.route('**/storage-upload/part-*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT, OPTIONS',
          'access-control-allow-headers': 'x-amz-checksum-sha256',
          'access-control-max-age': '600',
        },
      });
      return;
    }
    const match = route.request().url().match(/part-(\d+)/);
    const partNumber = Number(match?.[1]);
    state.putCounts.set(partNumber, (state.putCounts.get(partNumber) ?? 0) + 1);
    if (partNumber === 2 && state.failSecondPart) {
      if (state.putCounts.get(partNumber) === 1) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{"detail":"expired"}' });
        return;
      }
      await route.abort('internetdisconnected');
      return;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'etag',
        etag: `"etag-${partNumber}"`,
      },
      body: '',
    });
  });
}

async function selectStableFile(page: Page) {
  await page.locator('input[type="file"][multiple]').evaluate((input, args) => {
    const bytes = new Uint8Array(args.size);
    bytes.set(args.header);
    const file = new File([bytes], 'identity.png', { type: 'image/png', lastModified: 1_700_000_000_000 });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { size: FILE_SIZE, header: PNG_HEADER });
}

async function fillVerificationForm(page: Page) {
  await page.locator('label').filter({ hasText: /^پزشک$/ }).click();
  await page.getByPlaceholder('مثال: سینا موسوی').fill('علی دندانپزشک');
  await page.getByPlaceholder('۱۰ رقم').fill('1234567891');
  await page.getByPlaceholder('شماره پروانه').fill('MED12345');
  await selectStableFile(page);
}

test('failed multipart upload resumes after reload without retransmitting successful parts', async ({ page }) => {
  test.slow();
  const state: UploadMockState = {
    createCalls: 0,
    completedParts: new Set(),
    putCounts: new Map(),
    presignBatches: [],
    failSecondPart: true,
    submittedAssetIds: null,
    workerSha256: null,
    verificationSubmitted: false,
    scanPolls: 0,
  };
  await mockUploadFlow(page, state);
  await page.goto('/doctor/verification');
  await expect(page.getByRole('heading', { name: 'احراز هویت پزشکان' })).toBeVisible();
  await fillVerificationForm(page);
  await page.getByRole('button', { name: 'ارسال درخواست' }).click();
  await expect.poll(() => state.putCounts.get(2) ?? 0, { timeout: 30_000 }).toBe(MAX_RETRY_ATTEMPTS);
  await expect(page.getByRole('button', { name: 'ارسال درخواست' })).toBeEnabled();

  expect(state.workerSha256).toBe(FILE_SHA256);
  expect(state.completedParts.has(1)).toBe(true);
  expect(state.putCounts.get(1)).toBe(1);

  state.failSecondPart = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'احراز هویت پزشکان' })).toBeVisible();
  await fillVerificationForm(page);
  await page.getByRole('button', { name: 'ارسال درخواست' }).click();
  await expect(page.getByText('درخواست شما با موفقیت ارسال شد')).toBeVisible({ timeout: 20_000 });

  expect(state.createCalls).toBe(1);
  expect(state.putCounts.get(1)).toBe(1);
  expect(state.putCounts.get(2)).toBeGreaterThan(1);
  expect(state.scanPolls).toBeGreaterThan(0);
  expect(state.presignBatches[0]).toEqual([1, 2]);
  expect(state.presignBatches.slice(1).every((batch) => !batch.includes(1))).toBe(true);
  expect(state.submittedAssetIds).toEqual(['33333333-3333-4333-8333-333333333333']);
});
