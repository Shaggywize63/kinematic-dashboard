import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';

/**
 * The staged "Recent updates" redesign on the lead's Timeline tab (lib/recentUpdatesDesign.ts).
 *
 * Drives the REAL UI against mocked APIs: the demo account gets the redesign (with a Classic ⇄ New
 * toggle that sticks), everyone else keeps the classic notes with no toggle. Posting a note in the
 * new design shows the "Posted · log it as" strip, highlights the new note, and a "log as" chip
 * opens the activity form pre-filled from that note.
 */

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', company: 'Nair Steel',
  is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: 'someone-else', created_at: '2026-09-20T10:00:00Z',
};

// 04:14 UTC == 9:44 AM IST — the stamp the new note card shows.
const EXISTING = {
  id: 'upd-1', lead_id: 'lead-1', org_id: 'o', client_id: null, author_id: 'u-asha', author_name: 'Asha Menon',
  body: 'Intro call done — wants a quote', created_at: '2026-11-20T04:14:00.000Z',
};

const DEMO_USER = { ...SEED_USER, id: 'u-demo', name: 'Demo Rep', email: 'demo@kinematicapp.com' };
const OTHER_USER = { ...SEED_USER, id: 'u-other', name: 'Other Rep', email: 'rep@tata.com' };

async function setup(page: Page, user: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [EXISTING];
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/activities') return ok(route, []);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/updates') return ok(route, updates);
      if (method === 'POST' && p === '/api/v1/crm/leads/lead-1/updates') {
        const body = (route.request().postDataJSON() as { body: string }).body;
        const created = {
          id: `upd-${updates.length + 1}`, lead_id: 'lead-1', org_id: 'o', client_id: null,
          author_id: user.id, author_name: user.name, body, created_at: new Date().toISOString(),
        };
        updates.unshift(created);
        return ok(route, created, 201);
      }
      return false;
    },
  });
}

async function openTimeline(page: Page) {
  await page.goto('/dashboard/crm/leads/lead-1');
  await page.getByRole('tab', { name: /Timeline/ }).click();
  await expect(page.getByText('Intro call done — wants a quote')).toBeVisible({ timeout: 30_000 });
}

// Scoped to the toggle: the lead's status control also has a "Move to New" button.
const toggle = (page: Page, name: 'Classic' | 'New') => page.getByTestId('design-toggle').getByRole('button', { name, exact: true });

const postNote = async (page: Page, text: string) => {
  await page.getByPlaceholder(/Write an update/).fill(text);
  await page.getByRole('button', { name: 'Add update' }).click();
};

test.describe('Recent updates redesign — demo account', () => {
  test('sees the toggle, defaults to the new design, and the note card shows the IST stamp', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openTimeline(page);

    await expect(page.getByTestId('design-toggle')).toBeVisible();
    await expect(toggle(page, 'New')).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page, 'Classic')).toHaveAttribute('aria-pressed', 'false');

    const card = page.getByTestId('note-card');
    await expect(card).toHaveCount(1);
    await expect(page.getByText(/20\/11\/2026, 9:44 AM IST/)).toBeVisible();
  });

  test('posting a note shows Posted + log-as chips and highlights the new note, then the highlight fades', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openTimeline(page);

    await postNote(page, 'Met the buyer on site\nNeeds 40 tonnes by month end');

    const strip = page.getByTestId('posted-strip');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Posted');
    for (const label of ['Call', 'Visit', 'Follow-up']) {
      await expect(strip.getByRole('button', { name: label })).toBeVisible();
    }

    // The new note is the highlighted one (and only it).
    const highlighted = page.locator('[data-testid="note-card"][data-highlight="true"]');
    await expect(highlighted).toHaveCount(1);
    await expect(highlighted).toContainText('Met the buyer on site');
    await expect(page.getByText('Just added')).toBeVisible();

    // ...and it fades on its own.
    await expect(page.locator('[data-testid="note-card"][data-highlight="true"]')).toHaveCount(0, { timeout: 10_000 });
  });

  test('a log-as chip opens the activity form pre-filled from the note', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openTimeline(page);

    await postNote(page, 'Met the buyer on site\nNeeds 40 tonnes by month end');
    await page.getByTestId('posted-strip').getByRole('button', { name: 'Visit' }).click();

    await page.waitForURL(/\/dashboard\/crm\/activities\/new\?/);
    const q = new URL(page.url()).searchParams;
    expect(q.get('lead_id')).toBe('lead-1');
    expect(q.get('type')).toBe('meeting');
    expect(q.get('subject')).toBe('Visit: Met the buyer on site');
    expect(q.get('body')).toBe('Met the buyer on site\nNeeds 40 tonnes by month end');
  });

  test('can switch back to Classic, and the choice sticks across a reload', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openTimeline(page);
    await expect(page.getByTestId('note-card')).toHaveCount(1);

    await toggle(page, 'Classic').click();
    await expect(page.getByTestId('note-card')).toHaveCount(0);
    await expect(page.getByText(/20\/11\/2026, 9:44 AM IST/)).toHaveCount(0);

    // Classic: posting does not show the redesign's strip or highlight.
    await postNote(page, 'Follow up next week');
    await expect(page.getByText('Follow up next week')).toBeVisible();
    await expect(page.getByTestId('posted-strip')).toHaveCount(0);
    await expect(page.getByText('Just added')).toHaveCount(0);

    await page.reload();
    await page.getByRole('tab', { name: /Timeline/ }).click();
    await expect(page.getByText('Intro call done — wants a quote')).toBeVisible({ timeout: 30_000 });
    await expect(toggle(page, 'Classic')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('note-card')).toHaveCount(0);

    // ...and back to New.
    await toggle(page, 'New').click();
    await expect(page.getByTestId('note-card').first()).toBeVisible();
  });
});

test.describe('Recent updates redesign — everyone else', () => {
  test('keeps the classic notes: no toggle, no new cards, no Posted strip', async ({ page }) => {
    await setup(page, OTHER_USER);
    await openTimeline(page);

    await expect(page.getByTestId('design-toggle')).toHaveCount(0);
    await expect(page.getByTestId('note-card')).toHaveCount(0);

    await postNote(page, 'Sent the brochure');
    await expect(page.getByText('Sent the brochure')).toBeVisible();
    await expect(page.getByTestId('posted-strip')).toHaveCount(0);
    await expect(page.getByText('Just added')).toHaveCount(0);
  });
});
