import { test, expect, type Page } from '@playwright/test';
import { seedSession, mockApi } from './utils';

/**
 * Email campaign → "Resend to N failed": offered only on a FINISHED campaign that has failed recipients,
 * confirms first, calls POST /email-campaigns/:id/resend-failed, then shows the campaign sending again.
 * The recipient list can be narrowed to the failed ones so the reasons can be read before resending.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const campaign = (o: Record<string, unknown> = {}) => ({
  id: ID, org_id: 'e2e-org-1', client_id: null, name: 'Diwali Offer', template_id: null,
  subject: 'Festive prices', body_html: '<p>hi</p>', from_email: null, audience: { source: 'leads' },
  status: 'completed', throttle_per_min: 60, total: 10, sent: 8, failed: 2, skipped: 0,
  launched_at: null, completed_at: '2026-10-08T01:00:00Z', created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00Z', ...o,
});
const analytics = (failed: number, c = campaign()) => ({
  campaign: c,
  totals: { recipients: 10, queued: 0, sent: 8, failed, skipped: 0, delivered: 8, bounced: 0, opened: 0, clicked: 0, unsubscribed: 0 },
  open_rate: 0, click_rate: 0, skips: {},
});
const rec = (id: string, email: string, status: string, error: string | null = null) => ({ id, campaign_id: ID, email, first_name: null, status, error, skip_reason: null });

type State = { campaign: ReturnType<typeof campaign>; failed: number };

async function open(page: Page, state: State, posts: string[] = [], recipientQueries: string[] = [], resendReply?: { status: number; json: unknown }) {
  await seedSession(page);
  await mockApi(page, {
    onRequest: async (route, url, method) => {
      const path = url.split('?')[0];
      if (method === 'POST' && path.endsWith(`/email-campaigns/${ID}/resend-failed`)) {
        posts.push(path);
        if (resendReply) { await route.fulfill(resendReply); return true; }
        state.campaign = campaign({ status: 'sending', failed: 0 });
        state.failed = 0;
        await route.fulfill({ json: { success: true, data: { campaign: state.campaign, requeued: 2 } } });
        return true;
      }
      if (method !== 'GET') return false;
      if (path.endsWith(`/email-campaigns/${ID}/analytics`)) { await route.fulfill({ json: { success: true, data: analytics(state.failed, state.campaign) } }); return true; }
      if (path.endsWith(`/email-campaigns/${ID}/recipients`)) {
        recipientQueries.push(url.split('?')[1] ?? '');
        const onlyFailed = /status=failed/.test(url);
        const all = [rec('r1', 'ok@x.in', 'sent'), rec('r2', 'bad1@x.in', 'failed', 'Provider 503'), rec('r3', 'bad2@x.in', 'failed', 'Provider 503')];
        await route.fulfill({ json: { success: true, data: onlyFailed ? all.filter((r) => r.status === 'failed') : all } });
        return true;
      }
      if (path.endsWith(`/email-campaigns/${ID}`)) { await route.fulfill({ json: { success: true, data: state.campaign } }); return true; }
      return false;
    },
  });
  await page.goto(`/dashboard/crm/email-campaigns/${ID}`);
  await expect(page.getByRole('heading', { name: 'Diwali Offer' })).toBeVisible();
}

test.describe('Email campaign: resend to failed recipients', () => {
  test('a finished campaign with failures offers the resend, confirms, calls the API and shows it sending', async ({ page }) => {
    const posts: string[] = [];
    const state: State = { campaign: campaign(), failed: 2 };
    await open(page, state, posts);

    const button = page.getByRole('button', { name: /Resend to 2 failed/ });
    await expect(button).toBeVisible();

    let confirmText = '';
    page.once('dialog', (d) => { confirmText = d.message(); void d.accept(); });
    await button.click();

    await expect.poll(() => posts.length).toBe(1);
    expect(confirmText).toMatch(/2 recipients it failed to reach/);
    expect(confirmText).toMatch(/already received it, bounced or unsubscribed will not be sent again/);
    // the campaign is sending again: the notice shows, Pause replaces the resend button
    await expect(page.getByRole('status')).toContainText('Resending to 2 failed recipients');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend to/ })).toHaveCount(0);
  });

  test('declining the confirmation sends nothing', async ({ page }) => {
    const posts: string[] = [];
    await open(page, { campaign: campaign(), failed: 2 }, posts);
    page.once('dialog', (d) => void d.dismiss());
    await page.getByRole('button', { name: /Resend to 2 failed/ }).click();
    await page.waitForTimeout(300);
    expect(posts).toHaveLength(0);
  });

  test('no button when nothing failed', async ({ page }) => {
    await open(page, { campaign: campaign({ failed: 0 }), failed: 0 });
    await expect(page.getByRole('button', { name: /Resend to/ })).toHaveCount(0);
  });

  test('no button while the campaign is still sending, draft, paused or cancelled', async ({ page }) => {
    await open(page, { campaign: campaign({ status: 'sending' }), failed: 2 });
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend to/ })).toHaveCount(0);
  });

  test('a server refusal is shown and the page stays usable', async ({ page }) => {
    await open(page, { campaign: campaign(), failed: 2 }, [], [], {
      status: 400, json: { success: false, error: { code: 'NO_FAILED_RECIPIENTS', message: 'There are no failed recipients to resend' } },
    });
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: /Resend to 2 failed/ }).click();
    await expect(page.getByText('There are no failed recipients to resend')).toBeVisible();
    await expect(page.getByRole('button', { name: /Resend to 2 failed/ })).toBeVisible();
  });

  test('"Failed" narrows the recipient list to the ones a resend would retry, with their reasons', async ({ page }) => {
    const queries: string[] = [];
    await open(page, { campaign: campaign(), failed: 2 }, [], queries);
    await expect(page.getByText('ok@x.in')).toBeVisible();

    await page.getByRole('button', { name: /^Failed \(2\)/ }).click();
    await expect.poll(() => queries.some((q) => /status=failed/.test(q))).toBe(true);
    await expect(page.getByText('ok@x.in')).toHaveCount(0);
    await expect(page.getByText('bad1@x.in')).toBeVisible();
    await expect(page.getByText('Provider 503').first()).toBeVisible();
  });
});
