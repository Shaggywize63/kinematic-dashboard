import { test, expect, type Route } from '@playwright/test';
import { seedSession, mockApi } from './utils';

/**
 * Campaign "Export CSV". The download must carry every tenant header —
 * especially X-Kinematic-Project — or the API looks the campaign up in the
 * default project's database and the export silently produces nothing for a
 * campaign that belongs to another project. A failed export must say so
 * instead of saving an error body as a .csv.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN = {
  id: ID, org_id: 'e2e-org-1', client_id: null, name: 'Diwali Offer', template_id: null,
  subject: 'Festive prices', body_html: '<p>hi</p>', from_email: null, audience: { source: 'leads' },
  status: 'completed', throttle_per_min: 60, total: 2, sent: 2, failed: 0, skipped: 0,
  launched_at: null, completed_at: null, created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00Z',
};
const CSV = 'email,first_name,status,skip_reason,error,sent_at\na@x.in,Asha,sent,,,2026-10-05T10:01:00Z\nb@x.in,,failed,,"bad, address",\n';

test.describe('Email campaign CSV export', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    // A Kinematic-project tenant: the dashboard stores its project at login.
    await page.addInitScript(() => window.localStorage.setItem('kinematic_supabase_project', 'kinematic'));
  });

  const handle = (csvHeaders: Array<Record<string, string>>, csvReply: (route: Route, project: string | undefined) => Promise<void>) =>
    async (route: Route, url: string, method: string) => {
      const path = url.split('?')[0];
      if (method !== 'GET') return false;
      if (path.endsWith(`/email-campaigns/${ID}/recipients.csv`)) {
        const h = route.request().headers();
        csvHeaders.push(h);
        await csvReply(route, h['x-kinematic-project']);
        return true;
      }
      if (path.endsWith(`/email-campaigns/${ID}`)) { await route.fulfill({ json: { success: true, data: CAMPAIGN } }); return true; }
      if (path.endsWith(`/email-campaigns/${ID}/analytics`)) { await route.fulfill({ status: 404, json: { success: false, error: 'n/a' } }); return true; }
      if (path.endsWith(`/email-campaigns/${ID}/recipients`)) { await route.fulfill({ json: { success: true, data: [] } }); return true; }
      return false;
    };

  test('downloads the file and sends the project, org and bearer headers', async ({ page }) => {
    const seen: Array<Record<string, string>> = [];
    await mockApi(page, {
      // Mimic the real server: only the right project's database knows the campaign.
      onRequest: handle(seen, async (route, project) => {
        if (project !== 'kinematic') return route.fulfill({ status: 404, json: { success: false, error: 'Campaign not found' } });
        return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: CSV });
      }),
    });

    await page.goto(`/dashboard/crm/email-campaigns/${ID}`);
    await expect(page.getByRole('heading', { name: 'Diwali Offer' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('email-campaign-Diwali-Offer.csv');
    const path = await download.path();
    expect((await import('fs')).readFileSync(path!, 'utf8')).toBe(CSV);

    expect(seen).toHaveLength(1);
    expect(seen[0]['x-kinematic-project']).toBe('kinematic');
    expect(seen[0]['x-org-id']).toBe('e2e-org-1');
    expect(seen[0]['authorization']).toBe('Bearer e2e-token');
  });

  test('a failed export is reported, not saved as a CSV', async ({ page }) => {
    await mockApi(page, {
      onRequest: handle([], (route) => route.fulfill({ status: 404, json: { success: false, error: 'Campaign not found' } }).then(() => undefined)),
    });
    await page.goto(`/dashboard/crm/email-campaigns/${ID}`);
    await expect(page.getByRole('heading', { name: 'Diwali Offer' })).toBeVisible();

    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    const dialog = page.waitForEvent('dialog');
    await page.getByRole('button', { name: /Export CSV/ }).click();
    const d = await dialog;
    expect(d.message()).toContain('Export failed');
    expect(d.message()).toContain('Campaign not found');
    await d.dismiss();
    expect(downloaded).toBe(false);
  });
});
