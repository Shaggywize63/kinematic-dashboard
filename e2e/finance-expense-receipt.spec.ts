import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Finance → Expenses & GST: attach a receipt to a business bill.
 * Intercepted API. The rules that matter: the file goes up as multipart to the finance route, what is read off it
 * only fills boxes that are still empty, the bill keeps the returned reference (and null when removed), a file over
 * 10 MB never leaves the browser, and a failed upload leaves the form usable.
 */

// Finance is for the master admin or a client admin whose client has the `finance` module.
const FINANCE_USER = { ...SEED_USER, role: 'admin', client_id: 'c1', enabled_modules: [...SEED_USER.enabled_modules, 'finance'] };

const BILL_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const STORED = 'https://x.test/storage/v1/object/public/kinematic-receipts/e2e-org-1/e2e-user-1/abc.jpg';
const SIGNED = 'https://x.test/receipt-view.png';
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const rec = (id: string, vendor: string, receipt: string | null) => ({
  id, source: 'bill', date: '2026-10-12', vendor, vendor_gstin: '29AABCU9603R1ZX', bill_number: 'INV-1', category: 'office', description: null, gst_rate: 18,
  taxable_value: 1000, cgst: 90, sgst: 90, igst: 0, total_tax: 180, total: 1180, itc_eligible: true, itc_reason: null, itc_total: 180,
  receipt_url: receipt, claim_id: null, claim_title: null, claimed_by: null,
});
const STORED_BILL = {
  id: BILL_ID, expense_date: '2026-10-12', vendor_name: 'Acme Supplies', vendor_gstin: '29AABCU9603R1ZX', bill_number: 'INV-1', category: 'office', description: null,
  place_of_supply: '29', gst_rate: 18, taxable_value: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180, amount: 1180, itc_eligible: true, itc_reason: null, notes: null,
  receipt_url: STORED, receipt_signed_url: SIGNED,
};
const SCAN = { merchant: 'Sharma Traders', amount: 1180, txn_date: '2026-10-20', currency: 'INR', tax_amount: 180, category: null };

interface Seen { uploads: Array<{ url: string; type: string }>; created: Array<Record<string, unknown>>; updated: Array<Record<string, unknown>> }

async function setup(page: Page, o: { uploadStatus?: number } = {}): Promise<Seen> {
  const seen: Seen = { uploads: [], created: [], updated: [] };
  await seedSession(page, FINANCE_USER);
  await page.route('https://x.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  await mockApi(page, {
    me: { success: true, data: FINANCE_USER },
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0];
      if (!path.includes('/api/v1/finance/')) return false;
      if (method === 'GET' && path.endsWith('/finance/settings')) { await json(route, { success: true, data: { fiscal_year_start_month: 4, state_code: '29' } }); return true; }
      if (method === 'GET' && path.endsWith('/finance/expenses')) {
        await json(route, {
          success: true, data: [rec(BILL_ID, 'Acme Supplies', STORED), rec(OTHER_ID, 'Bharat Stationers', null)],
          pagination: { total: 2, page: 1, limit: 25 }, totals: { count: 2, spend: 2360, taxable: 2000, gst_paid: 360, itc_claimable: 360, itc_blocked: 0 },
        });
        return true;
      }
      if (method === 'GET' && path.includes('/finance/reports/')) { await json(route, { success: true, data: { title: 'r', columns: [], rows: [], totals: {}, meta: {} } }); return true; }
      if (method === 'GET' && path.endsWith(`/finance/expenses/${BILL_ID}`)) { await json(route, { success: true, data: STORED_BILL }); return true; }
      if (method === 'POST' && path.endsWith('/finance/expenses/receipt')) {
        const req = route.request();
        seen.uploads.push({ url, type: req.headers()['content-type'] ?? '' });
        if (o.uploadStatus && o.uploadStatus !== 201) { await json(route, { success: false, error: 'Receipt storage is unavailable' }, o.uploadStatus); return true; }
        await json(route, { success: true, data: { url: STORED, path: 'e2e-org-1/e2e-user-1/abc.jpg', bucket: 'kinematic-receipts', content_type: 'image/png', size: PNG.length, signed_url: SIGNED, scan: SCAN } }, 201);
        return true;
      }
      if (method === 'POST' && path.endsWith('/finance/expenses')) { seen.created.push(route.request().postDataJSON()); await json(route, { success: true, data: { id: 'new' } }, 201); return true; }
      if (method === 'PUT' && path.endsWith(`/finance/expenses/${BILL_ID}`)) { seen.updated.push(route.request().postDataJSON()); await json(route, { success: true, data: STORED_BILL }); return true; }
      return false;
    },
  });
  return seen;
}

async function open(page: Page) {
  await page.goto('/dashboard/finance/expenses');
  await expect(page.getByRole('button', { name: '+ New expense' })).toBeVisible({ timeout: 45_000 });
}

test.describe('Finance expenses: receipts', () => {
  test('the list marks bills that have a receipt', async ({ page }) => {
    await setup(page);
    await open(page);
    await expect(page.getByTestId('row-has-receipt')).toHaveCount(1);
  });

  test('attaching a receipt uploads it as multipart, fills the empty boxes, and saves the reference', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('receipt-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.getByTestId('receipt-attached')).toBeVisible();
    expect(seen.uploads).toHaveLength(1);
    expect(seen.uploads[0]!.type).toMatch(/multipart\/form-data/);
    await expect(dialog.locator('input[id$="-vendor"]')).toHaveValue('Sharma Traders');
    await expect(dialog.locator('input[id$="-amt"]')).toHaveValue('1180');
    await expect(dialog.locator('input[id$="-date"]')).toHaveValue('2026-10-20');
    await expect(dialog.locator('input[id$="-gst"]')).toHaveValue('180');
    await expect(dialog.locator('select[id$="-rate"]')).toHaveValue('18');
    await expect(dialog.getByTestId('receipt-scan-note')).toContainText('Sharma Traders');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => seen.created.length).toBe(1);
    expect(seen.created[0]).toMatchObject({ vendor_name: 'Sharma Traders', amount: 1180, receipt_url: STORED });
  });

  test('what was read never overwrites what the person already typed', async ({ page }) => {
    await setup(page);
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[id$="-vendor"]').fill('My own vendor name');
    await dialog.locator('input[id$="-amt"]').fill('999');
    await dialog.getByTestId('receipt-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.getByTestId('receipt-attached')).toBeVisible();
    await expect(dialog.locator('input[id$="-vendor"]')).toHaveValue('My own vendor name');
    await expect(dialog.locator('input[id$="-amt"]')).toHaveValue('999');
  });

  test('a bill without a receipt is saved with a null reference', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[id$="-vendor"]').fill('Cash vendor');
    await dialog.locator('input[id$="-amt"]').fill('500');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => seen.created.length).toBe(1);
    expect(seen.created[0]).toMatchObject({ vendor_name: 'Cash vendor', receipt_url: null });
    expect(seen.uploads).toHaveLength(0);
  });

  test('editing a bill shows its receipt, lets you view it, and removing it saves null', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('row', { name: /Acme Supplies/ }).getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: /Edit expense/ }).or(page.getByRole('dialog').first());
    await expect(dialog.getByTestId('receipt-attached')).toBeVisible();
    await dialog.getByRole('button', { name: 'View' }).click();
    await expect(page.getByRole('img', { name: 'Receipt' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Escape closes the viewer only; the form stays open.
    await expect(page.getByRole('img', { name: 'Receipt' })).toHaveCount(0);
    await expect(dialog.getByTestId('receipt-attached')).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove receipt' }).click();
    await expect(dialog.getByTestId('receipt-attached')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => seen.updated.length).toBe(1);
    expect(seen.updated[0]).toMatchObject({ vendor_name: 'Acme Supplies', receipt_url: null });
  });

  test('a file over 10 MB is refused in the browser and never uploaded', async ({ page }) => {
    const seen = await setup(page);
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('receipt-input').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 10, 1) });
    await expect(page.getByText(/larger than 10 MB/i).first()).toBeVisible();
    await expect(dialog.getByTestId('receipt-attached')).toHaveCount(0);
    expect(seen.uploads).toHaveLength(0);
  });

  test('a failed upload leaves the form usable and attaches nothing', async ({ page }) => {
    const seen = await setup(page, { uploadStatus: 500 });
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('receipt-input').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(() => seen.uploads.length).toBe(1);
    await expect(dialog.getByTestId('receipt-attached')).toHaveCount(0);
    await expect(dialog.getByTestId('receipt-uploading')).toHaveCount(0);
    await dialog.locator('input[id$="-vendor"]').fill('Still works');
    await dialog.locator('input[id$="-amt"]').fill('100');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => seen.created.length).toBe(1);
    expect(seen.created[0]).toMatchObject({ vendor_name: 'Still works', receipt_url: null });
  });

  test('the form has no horizontal overflow at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await setup(page);
    await open(page);
    await page.getByRole('button', { name: '+ New expense' }).click();
    await expect(page.getByTestId('receipt-input')).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
