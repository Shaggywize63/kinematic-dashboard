import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mockApi, seedSession, SEED_USER } from './utils';
import { collectPhotoUrls, photoCell, responsePhotoUrls, signPhotoUrls, SIGN_BATCH_SIZE } from '../src/lib/reportPhotos';

/**
 * Work Activities report: a photo / signature answer keeps its URL in `photo_url` (value_text is empty), so the export
 * used to print those cells blank. The report is now an XLSX workbook — one worksheet per form, with a locked `Form No.`
 * column — and each photo cell holds a signed link (valid a week), or the stored URL if signing fails, exactly as before.
 */
const STORED_A = 'https://supabase.example.com/storage/v1/object/public/form-responses/org1/u1/a.jpg';
const STORED_B = 'https://supabase.example.com/storage/v1/object/public/form-responses/org1/u1/b.jpg';
const SIGNED_A = 'https://supabase.example.com/storage/v1/object/sign/form-responses/org1/u1/a.jpg?token=AAA';

test.describe('reportPhotos helpers', () => {
  test('photo_url is read for image answers; plain answers have no photos', () => {
    expect(responsePhotoUrls({ photo_url: STORED_A })).toEqual([STORED_A]);
    expect(responsePhotoUrls({ photo_url: `${STORED_A},${STORED_B}` })).toEqual([STORED_A, STORED_B]);
    expect(responsePhotoUrls({ value_text: 'Full' })).toEqual([]);
    expect(responsePhotoUrls({ value_text: STORED_A, builder_questions: { qtype: 'image' } })).toEqual([STORED_A]);
    expect(responsePhotoUrls({ value_text: STORED_A, builder_questions: { qtype: 'text' } })).toEqual([]);
    expect(responsePhotoUrls({})).toEqual([]);
  });

  test('every distinct stored URL is collected once', () => {
    const subs = [
      { form_responses: [{ photo_url: STORED_A }, { value_text: 'x' }] },
      { form_responses: [{ photo_url: `${STORED_A},${STORED_B}` }] },
      { form_responses: null },
    ];
    expect(collectPhotoUrls(subs)).toEqual([STORED_A, STORED_B]);
  });

  test('the cell uses the signed link and falls back to the stored one', () => {
    expect(photoCell([STORED_A, STORED_B], { [STORED_A]: SIGNED_A, [STORED_B]: null })).toBe(`${SIGNED_A} | ${STORED_B}`);
  });

  test('signing goes out in batches and a failed batch only costs its own photos', async () => {
    const urls = Array.from({ length: SIGN_BATCH_SIZE + 5 }, (_, i) => `${STORED_A}?n=${i}`);
    const calls: number[] = [];
    const out = await signPhotoUrls(urls, async (batch) => {
      calls.push(batch.length);
      if (calls.length === 2) throw new Error('boom');
      return Object.fromEntries(batch.map((u) => [u, `signed:${u}`]));
    });
    expect(calls).toEqual([SIGN_BATCH_SIZE, 5]);
    expect(Object.keys(out)).toHaveLength(SIGN_BATCH_SIZE);
  });
});

const row = (id: string, outlet: string, responses: unknown[]) => ({
  id, user_id: 'u1', outlet_name: outlet, users: { name: 'Arjun Sharma', employee_id: 'E1' }, activities: { name: 'Store Visit' },
  builder_forms: { id: 'bf1', title: 'Store Audit' }, address: 'MG Road', submitted_at: '2026-10-09T05:00:00Z', form_responses: responses,
});
const ROWS = [
  row('f-a', 'Reliance Fresh', [
    { builder_questions: { label: 'Shelf', qtype: 'text' }, value_text: 'Full' },
    { builder_questions: { label: 'Shelf photo', qtype: 'image' }, photo_url: STORED_A },
  ]),
  row('f-b', 'Gamma Stores', [
    { builder_questions: { label: 'Shelf', qtype: 'text' }, value_text: 'Empty' },
    { builder_questions: { label: 'Shelf photo', qtype: 'image' }, photo_url: STORED_B },
  ]),
];

async function exportXlsx(page: import('@playwright/test').Page, o: { signFails?: boolean } = {}) {
  const signCalls: Array<{ urls: string[]; ttl: number }> = [];
  await seedSession(page, SEED_USER);
  await mockApi(page, {
    me: { success: true, data: SEED_USER },
    onRequest: async (route, url, method) => {
      const u = new URL(url);
      if (method === 'POST' && u.pathname === '/api/v1/media/sign-batch') {
        signCalls.push(route.request().postDataJSON());
        if (o.signFails) { await route.fulfill({ status: 500, json: { success: false, error: 'down' } }); return true; }
        // Only photo A is signable; B maps to null (not permitted / missing).
        await route.fulfill({ json: { success: true, data: { urls: { [STORED_A]: SIGNED_A, [STORED_B]: null }, expiresIn: 604800 } } });
        return true;
      }
      if (method === 'GET' && u.pathname === '/api/v1/forms/admin/submissions') {
        await route.fulfill({ json: { success: true, data: { data: ROWS, pagination: { page: 1, limit: 50, total: ROWS.length } } } });
        return true;
      }
      return false;
    },
  });
  await page.goto('/dashboard/work-activities');
  await expect(page.getByText('Reliance Fresh')).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download Report/ }).click()]);
  // The report is an XLSX workbook now, not a flat CSV.
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await download.path())!);
  // Both rows share the form title "Store Audit", so they land on a single worksheet named after the form.
  const ws = wb.getWorksheet('Store Audit')!;
  const header: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { header[col - 1] = String(cell.value ?? ''); });
  const col = (name: string) => header.indexOf(name) + 1; // 1-based column index for the given header
  const dataRows: Array<{ cell: (name: string) => string; rowNumber: number }> = [];
  ws.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
    if (rowNumber === 1) return; // header
    dataRows.push({ rowNumber, cell: (name: string) => String(excelRow.getCell(col(name)).value ?? '') });
  });
  const byOutlet = (name: string) => dataRows.find((r) => r.cell('Outlet') === name)!;
  return { ws, header, col, byOutlet, signCalls };
}

test.describe('Work Activities report — photos (XLSX)', () => {
  test('one sheet per form with a leading Form No. column; photo cells carry a signed link and a week is asked for', async ({ page }) => {
    const { ws, header, byOutlet, signCalls } = await exportXlsx(page);
    // Form No. is the first column (the record identifier); the form's own questions come last.
    expect(header[0]).toBe('Form No.');
    expect(header.slice(-2)).toEqual(['Shelf', 'Shelf photo']);
    const a = byOutlet('Reliance Fresh');
    expect(a.cell('Shelf')).toBe('Full');
    expect(a.cell('Shelf photo')).toBe(SIGNED_A);
    // A photo that could not be signed still shows its stored URL rather than a blank.
    expect(byOutlet('Gamma Stores').cell('Shelf photo')).toBe(STORED_B);
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0].ttl).toBe(7 * 24 * 60 * 60);
    expect([...signCalls[0].urls].sort()).toEqual([STORED_A, STORED_B].sort());

    // The sheet is protected and only the Form No. column is locked: on read-back a locked cell reports the XLSX
    // default (locked, i.e. not explicitly `false`), while every editable cell is explicitly unlocked.
    expect((ws as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
    const firstDataRow = byOutlet('Reliance Fresh').rowNumber;
    expect(ws.getCell(firstDataRow, 1).protection?.locked).not.toBe(false); // Form No. data cell — locked
    expect(ws.getCell(1, 1).protection?.locked).not.toBe(false);            // Form No. header — locked
    expect(ws.getCell(firstDataRow, header.indexOf('Shelf') + 1).protection?.locked).toBe(false); // editable answer
  });

  test('if signing is down the report still downloads with the stored URLs', async ({ page }) => {
    const { byOutlet } = await exportXlsx(page, { signFails: true });
    expect(byOutlet('Reliance Fresh').cell('Shelf photo')).toBe(STORED_A);
    expect(byOutlet('Gamma Stores').cell('Shelf photo')).toBe(STORED_B);
  });
});
