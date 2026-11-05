import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';

/**
 * Activity photos, end to end on the web: pick / capture a photo -> POST /upload/photo (multipart, field `photo`)
 * -> the stored URL is sent as `image_url` on POST (create) / PATCH (edit) /crm/activities, and the card shows a
 * thumbnail. The CSV export keeps hitting /crm/activities/export.
 */

const PHOTO = 'https://supa.example.com/storage/v1/object/public/form-responses/org/user/site-1.jpg';
const PHOTO_2 = 'https://supa.example.com/storage/v1/object/public/form-responses/org/user/site-2.jpg';
// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const ROW = { id: 'a-1', org_id: 'e2e-org-1', type: 'meeting', subject: 'Plant visit', status: 'open', created_at: '2026-10-01T05:00:00Z', updated_at: '2026-10-01T05:00:00Z', image_url: PHOTO };
const ROW_NO_PHOTO = { ...ROW, id: 'a-2', subject: 'No photo visit', image_url: null };

type Seen = { uploads: { contentType: string; body: string }[]; writes: { method: string; body: Record<string, any> }[]; exports: string[] };

async function setup(page: Page, seen: Seen, list: unknown[] = [ROW, ROW_NO_PHOTO]) {
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'POST' && p === '/api/v1/upload/photo') {
        const req = route.request();
        seen.uploads.push({ contentType: req.headers()['content-type'] || '', body: req.postData() || '' });
        return ok(route, { url: PHOTO_2, path: 'org/user/site-2.jpg', bucket: 'form-responses' });
      }
      if (method === 'GET' && p === '/api/v1/crm/activities') {
        return route.fulfill({ json: { success: true, data: list, pagination: { total: list.length, page: 1, limit: 50, totalPages: 1, hasNext: false, hasPrev: false } } }).then(() => true);
      }
      if (method === 'GET' && p === '/api/v1/crm/activities/export') {
        seen.exports.push(url);
        return route.fulfill({ status: 200, contentType: 'text/csv', body: 'Type,Photo URL\nmeeting,' + PHOTO + '\n' }).then(() => true);
      }
      if ((method === 'POST' && p === '/api/v1/crm/activities') || (method === 'PATCH' && /^\/api\/v1\/crm\/activities\/[^/]+$/.test(p))) {
        seen.writes.push({ method, body: route.request().postDataJSON() as Record<string, any> });
        return ok(route, { id: 'a-1' }, method === 'POST' ? 201 : 200);
      }
      return false;
    },
  });
}
const fresh = (): Seen => ({ uploads: [], writes: [], exports: [] });
const pick = (page: Page) => page.getByTestId('activity-photo-input').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });

test.describe('activity photo: create form', () => {
  test('uploads the picked photo, previews it and posts image_url', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await pick(page);

    await expect(page.getByAltText('Activity photo')).toBeVisible();
    await expect(page.getByText('Photo attached.')).toBeVisible();
    expect(seen.uploads).toHaveLength(1);
    expect(seen.uploads[0].contentType).toContain('multipart/form-data');
    expect(seen.uploads[0].body).toContain('name="photo"');

    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(seen.writes).toHaveLength(1);
    expect(seen.writes[0].method).toBe('POST');
    expect(seen.writes[0].body.image_url).toBe(PHOTO_2);
  });

  test('removing the photo posts no image_url', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/activities/new');
    await expect(page.getByRole('heading', { name: 'Log Activity' })).toBeVisible({ timeout: 30_000 });
    await pick(page);
    await expect(page.getByText('Photo attached.')).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Photo attached.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Log Activity' }).click();
    await expect(page).toHaveURL(/\/dashboard\/crm\/activities$/, { timeout: 20_000 });
    expect(Object.keys(seen.writes[0].body)).not.toContain('image_url');
  });
});

test.describe('activity photo: list + edit modal', () => {
  test('the card shows the thumbnail; a row without a photo shows none', async ({ page }) => {
    await setup(page, fresh());
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByAltText('Activity photo')).toHaveCount(1);
    await expect(page.getByAltText('Activity photo')).toHaveAttribute('src', PHOTO);
  });

  const editCard = (page: Page, subject: string) =>
    page.locator('div', { hasText: subject }).filter({ has: page.getByRole('button', { name: /Edit/ }) }).last().getByRole('button', { name: /Edit/ });
  // The edit modal is a fixed overlay (inline `position: fixed`).
  const modal = (page: Page) => page.locator('div[style*="position: fixed"]').filter({ hasText: 'Edit activity' });

  test('replacing the photo PATCHes the new image_url', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
    await editCard(page, 'Plant visit').click();
    const m = modal(page);
    await expect(m.getByText('Photo attached.')).toBeVisible();
    await m.getByRole('button', { name: 'Remove' }).click();
    await m.getByTestId('activity-photo-input').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });
    await expect(m.getByText('Photo attached.')).toBeVisible();
    await m.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.writes.length).toBe(1);
    expect(seen.writes[0].method).toBe('PATCH');
    expect(seen.writes[0].body.image_url).toBe(PHOTO_2);
  });

  test('adding a photo to a row that had none, and removing an existing one (null)', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('No photo visit')).toBeVisible({ timeout: 30_000 });

    await editCard(page, 'No photo visit').click();
    await modal(page).getByTestId('activity-photo-input').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });
    await expect(modal(page).getByText('Photo attached.')).toBeVisible();
    await modal(page).getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.writes.length).toBe(1);
    expect(seen.writes[0].body.image_url).toBe(PHOTO_2);

    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
    await editCard(page, 'Plant visit').click();
    await modal(page).getByRole('button', { name: 'Remove' }).click();
    await modal(page).getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.writes.length).toBe(2);
    expect(seen.writes[1].body.image_url).toBeNull();
  });

  test('saving without touching the photo does not resend image_url', async ({ page }) => {
    const seen = fresh();
    await setup(page, seen);
    await page.goto('/dashboard/crm/activities');
    await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
    await editCard(page, 'Plant visit').click();
    await modal(page).getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => seen.writes.length).toBe(1);
    expect(Object.keys(seen.writes[0].body)).not.toContain('image_url');
  });
});

test('Export CSV still downloads through /crm/activities/export (the server adds the Photo URL column)', async ({ page }) => {
  const seen = fresh();
  await setup(page, seen);
  await page.goto('/dashboard/crm/activities?type=meeting');
  await expect(page.getByText('Plant visit')).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  const d = await download;
  expect(d.suggestedFilename()).toMatch(/^activities-.*\.csv$/);
  expect(seen.exports).toHaveLength(1);
  expect(seen.exports[0]).toContain('type=meeting');
});
