import { test, expect } from '@playwright/test';
import { demoLogin, mockApi, seedSession, SEED_USER } from './utils';

/**
 * Smoke test for the expense forgery/forensics prototype in the DEMO account:
 * the demo fixtures populate the expense screens and the forensic highlights,
 * risk column, filters and travel links render.
 */
test.describe('Expense forensics — demo account', () => {
  test('approvals queue shows a forgery-risk column and a claim shows forensic highlights', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/approvals');
    await expect(page.getByText('Arjun Sharma').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('High risk').first()).toBeVisible();

    await page.goto('/dashboard/expenses/exp-101');
    await expect(page.getByText('Forensic highlights')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/within \d+\s*m of each other/i)).toBeVisible(); // co-location detail
    await expect(page.getByRole('link', { name: /travel report/i }).first()).toBeVisible();
  });

  test('all claims page has a User filter and per-row travel links', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/all');
    await expect(page.getByLabel('User')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Day report/i }).first()).toBeVisible();
  });

  test('policies page exposes the configurable forgery-check thresholds', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/expenses/policies');
    await expect(page.getByText('Forgery & forensics checks')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Halt length that is flagged/i)).toBeVisible();
  });
});

const REAL_CLAIM = {
  id: 'rc1', user_id: 'u1', user_name: 'Real Rep', claim_no: 'RC-1', title: 'Real claim', status: 'submitted',
  currency: 'INR', total_amount: 500, approved_amount: null, distance_km: null, gps_derived_km: null,
  approver_id: null, current_level: 1, submitted_at: '2026-10-24T10:00:00Z', reviewed_by: null, reviewed_at: null,
  review_note: null, ai_summary: null, ai_flags: null, reimbursed_at: null, reimbursed_ref: null,
  created_at: '2026-10-24T10:00:00Z', employee_id: 'E1',
};

test.describe('Expense forensics — NOT shown to a non-demo client', () => {
  test('a normal (non-demo) account gets no forgery-risk column on Approvals', async ({ page }) => {
    await seedSession(page, SEED_USER); // non-demo super-admin (e2e token, not the demo token)
    await mockApi(page, {
      me: { success: true, data: SEED_USER },
      onRequest: async (route, url, method) => {
        const path = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '');
        if (method === 'GET' && path === '/api/v1/expenses/claims/pending') {
          return route.fulfill({ json: { success: true, data: [REAL_CLAIM] } }).then(() => true);
        }
        return false; // everything else → mockApi's {data:[]} default
      },
    });
    await page.goto('/dashboard/expenses/approvals');
    await expect(page.getByText('Real Rep')).toBeVisible({ timeout: 30_000 }); // the claim rendered
    await expect(page.getByText('Forgery risk')).toHaveCount(0);                // but no forensics column
  });

  test('a normal (non-demo) account gets no Forgery-checks card on Policies', async ({ page }) => {
    await seedSession(page, SEED_USER);
    await mockApi(page, { me: { success: true, data: SEED_USER } });
    await page.goto('/dashboard/expenses/policies');
    // wait for the shell to settle, then assert the card is absent
    await expect(page.getByRole('heading', { name: /Expense policies/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Forgery & forensics checks')).toHaveCount(0);
  });
});
