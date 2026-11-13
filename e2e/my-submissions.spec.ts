import { test, expect, type Route } from '@playwright/test';
import { seedSession, mockApi } from './utils';
import { readFileSync } from 'fs';

/**
 * Field executives' "My Submissions" page (/dashboard/forms/my-submissions).
 *
 * Consumes the backend forms endpoints (all MOCKED here):
 *   - GET   /forms/submissions            → own submissions list (ref_no + title)
 *   - GET   /forms/submissions/:id        → detail with answers + signed photos
 *   - PATCH /forms/submissions/:id        → edit own answers / outlet / address
 *   - GET   /forms/submissions/:id/export → export payload (used for the CSV)
 */

const SIGNED_PHOTO = 'https://supabase-kinematic.kinematicapp.com/storage/v1/object/sign/form-responses/good.jpg?token=signed';

const LIST = {
  success: true,
  data: {
    data: [
      { id: 'sub-1', ref_no: 'SRPR2627-1', submitted_at: '2026-11-10T09:30:00Z', template_id: 't1', outlet_name: 'Acme Hardware', builder_forms: { title: 'Outlet Visit' } },
      { id: 'sub-2', ref_no: 'SRPR2627-2', submitted_at: '2026-11-11T11:00:00Z', template_id: 't1', outlet_name: 'Bolt Depot', builder_forms: { title: 'Stock Check' } },
    ],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  },
};

// Detail for sub-1: one text answer, one photo answer that IS signed, and one
// photo answer whose signed link failed (signed:false) → placeholder.
const DETAIL = {
  success: true,
  data: {
    id: 'sub-1',
    ref_no: 'SRPR2627-1',
    submitted_at: '2026-11-10T09:30:00Z',
    outlet_name: 'Acme Hardware',
    address: '12 MG Road',
    latitude: 12.9716,
    longitude: 77.5946,
    builder_forms: { title: 'Outlet Visit' },
    form_responses: [
      { field_id: 'f1', label: 'Store manager', value: 'Priya', builder_questions: { label: 'Store manager', qtype: 'text' }, photos: [] },
      { field_id: 'f2', label: 'Shelf photo', builder_questions: { label: 'Shelf photo', qtype: 'photo' }, photo_url: 'form-responses/good.jpg', photos: [{ url: 'form-responses/good.jpg', signed: SIGNED_PHOTO }] },
      { field_id: 'f3', label: 'Signboard photo', builder_questions: { label: 'Signboard photo', qtype: 'photo' }, photo_url: 'form-responses/bad.jpg', photos: [{ url: 'form-responses/bad.jpg', signed: false }] },
    ],
    photos: [{ url: 'form-responses/good.jpg', signed: SIGNED_PHOTO }, { url: 'form-responses/bad.jpg', signed: false }],
  },
};

const EXPORT = {
  success: true,
  data: {
    submission_id: 'sub-1',
    ref_no: 'SRPR2627-1',
    form_title: 'Outlet Visit',
    template_id: 't1',
    activity_name: 'Beat 3',
    account_name: 'Acme Corp',
    submitter: { id: 'e2e-user-1', name: 'E2E Admin', employee_id: 'EMP-7' },
    submitted_at: '2026-11-10T09:30:00Z',
    outlet_name: 'Acme Hardware',
    address: '12 MG Road',
    latitude: 12.9716,
    longitude: 77.5946,
    check_in_at: null,
    check_out_at: null,
    answers: [
      { field_id: 'f1', label: 'Store manager', type: 'text', sort_order: 0, value: 'Priya', gps: null, photos: [] },
      { field_id: 'f2', label: 'Shelf photo', type: 'photo', sort_order: 1, value: null, gps: null, photos: [{ url: 'form-responses/good.jpg', signed: SIGNED_PHOTO }] },
    ],
    photos: [{ url: 'form-responses/good.jpg', signed: SIGNED_PHOTO }],
    exported_at: '2026-11-13T00:00:00Z',
    signed_url_ttl_seconds: 604800,
  },
};

type Patched = { body: unknown };

async function routeForms(page: import('@playwright/test').Page, opts: { onPatch?: (p: Patched) => void } = {}) {
  await mockApi(page, {
    onRequest: async (route: Route, url: string, method: string) => {
      const path = url.split('?')[0];
      if (method === 'GET' && path.endsWith('/api/v1/forms/submissions')) {
        await route.fulfill({ json: LIST });
        return true;
      }
      if (method === 'GET' && path.endsWith('/api/v1/forms/submissions/sub-1/export')) {
        await route.fulfill({ json: EXPORT });
        return true;
      }
      if (method === 'GET' && path.endsWith('/api/v1/forms/submissions/sub-1')) {
        await route.fulfill({ json: DETAIL });
        return true;
      }
      if (method === 'PATCH' && path.endsWith('/api/v1/forms/submissions/sub-1')) {
        let body: unknown;
        try { body = JSON.parse(route.request().postData() || '{}'); } catch { body = {}; }
        opts.onPatch?.({ body });
        await route.fulfill({ json: { success: true, data: { ...DETAIL.data, changed: ['f1'] } } });
        return true;
      }
      return false;
    },
  });
}

test.describe('my submissions', () => {
  test.beforeEach(async ({ page }) => { await seedSession(page); });

  test('list shows the form number (ref_no) and the form title', async ({ page }) => {
    await routeForms(page);
    await page.goto('/dashboard/forms/my-submissions');
    const rows = page.getByTestId('my-sub-row');
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId('my-sub-ref').first()).toHaveText('SRPR2627-1');
    await expect(page.getByTestId('my-sub-title').first()).toHaveText('Outlet Visit');
  });

  test('detail renders an answer and a signed photo, with a placeholder for a failed-sign photo', async ({ page }) => {
    await routeForms(page);
    await page.goto('/dashboard/forms/my-submissions');
    await page.getByTestId('my-sub-view').first().click();

    const detail = page.getByTestId('my-sub-detail');
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('my-sub-detail-ref')).toHaveText('SRPR2627-1');
    // Text answer value is shown.
    await expect(detail.getByText('Priya')).toBeVisible();
    // The signed photo renders as an <img> pointed at the signed URL.
    const photo = page.getByTestId('my-sub-photo');
    await expect(photo).toHaveCount(1);
    await expect(photo).toHaveAttribute('src', SIGNED_PHOTO);
    // The signed:false photo shows the "photo unavailable" placeholder.
    await expect(page.getByTestId('my-sub-photo-missing')).toHaveCount(1);
  });

  test('Export triggers a CSV download named after the form number', async ({ page }) => {
    await routeForms(page);
    await page.goto('/dashboard/forms/my-submissions');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('my-sub-export').first().click(),
    ]);
    expect(download.suggestedFilename()).toBe('form-SRPR2627-1.csv');
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv).toContain('SRPR2627-1');
    expect(csv).toContain('Store manager');
    expect(csv).toContain('Priya');
    // The signed photo URL is carried into the CSV.
    expect(csv).toContain(SIGNED_PHOTO);
  });

  test('editing a text answer and outlet PATCHes the submission', async ({ page }) => {
    const patches: Patched[] = [];
    await routeForms(page, { onPatch: (p) => patches.push(p) });
    await page.goto('/dashboard/forms/my-submissions');
    await page.getByTestId('my-sub-view').first().click();
    await expect(page.getByTestId('my-sub-detail')).toBeVisible();

    await page.getByTestId('my-sub-edit').click();
    // Edit the first (text) answer and the outlet name.
    const answerBox = page.getByTestId('my-sub-answer').first().locator('textarea');
    await answerBox.fill('Priya Sharma');
    await page.getByTestId('my-sub-outlet').fill('Acme Hardware & Co');
    await page.getByTestId('my-sub-save').click();

    await expect.poll(() => patches.length).toBeGreaterThan(0);
    const body = patches[0].body as { responses?: Array<{ field_id: string; value: string }>; outlet_name?: string };
    expect(body.outlet_name).toBe('Acme Hardware & Co');
    expect(body.responses?.find((r) => r.field_id === 'f1')?.value).toBe('Priya Sharma');
  });
});
