import { test, expect, type Page, type Route } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';

/**
 * Help & Support (/dashboard/support) against an intercepted /api/v1/support API. A customer raises a ticket, sees the
 * server's error when it is refused, and says "This is fixed" / "Still not working"; the operator gets every customer's
 * tickets as the "Support inbox", searches, updates status with a note and sees what happened to the WhatsApp message.
 * The server's rules (who may set what, notifications) are the backend's tests; this checks what the page sends and shows.
 */

type Status = 'open' | 'triaged' | 'in_progress' | 'waiting_on_customer' | 'release_pending' | 'resolved' | 'closed' | 'rejected';
const ACTIVE: Status[] = ['open', 'triaged', 'in_progress', 'waiting_on_customer', 'release_pending'];
type Ticket = Record<string, unknown> & { id: string; ref: string; status: Status; subject: string };
type Ev = Record<string, unknown> & { id: string };

const NOW = new Date().toISOString();
const mk = (over: Partial<Ticket> & { id: string; ref: string }): Ticket => ({
  status: 'open', priority: 'normal', category: 'bug', subject: 'Attendance not syncing', description: 'Pune team attendance has not synced since Monday.',
  platforms: [], area: null,
  channel: 'dashboard', org_id: 'org-a', org_name: 'Acme Foods', project_key: 'default', contact_name: 'Ravi K', contact_phone: '+919800000001',
  contact_email: null, raised_by_user_id: 'u1', resolution_note: null, created_at: NOW, updated_at: NOW, resolved_at: null,
  first_response_at: null, csat_rating: null, csat_comment: null, csat_at: null, ...over,
});
const created = (t: Ticket): Ev => ({ id: `${t.id}-e0`, ticket_id: t.id, kind: 'created', author_type: 'customer', author_name: 'Ravi K', from_status: null, to_status: 'open', body: null, created_at: NOW });

const CUSTOMER = { ...SEED_USER, id: 'u1', role: 'sub_admin', client_id: 'cl-1', name: 'Ravi K', permissions: ['crm_leads'] };

async function open(page: Page, opts: { operator: boolean; tickets: Ticket[]; createStatus?: number; notified?: Record<string, unknown> }) {
  let tickets = [...opts.tickets];
  const events = new Map<string, Ev[]>(tickets.map((t) => [t.id, [created(t)]]));
  const calls: Array<{ method: string; path: string; query: string; body?: Record<string, unknown> }> = [];
  const thread = (id: string, extra: Record<string, unknown> = {}) => ({ success: true, data: { ticket: tickets.find((t) => t.id === id), events: events.get(id) ?? [], ...extra } });
  await seedSession(page, opts.operator ? SEED_USER : CUSTOMER);
  await mockApi(page, {
    me: { success: true, data: opts.operator ? SEED_USER : CUSTOMER },
    onRequest: async (route: Route, url, method) => {
      const u = new URL(url);
      if (!u.pathname.startsWith('/api/v1/support/')) return false;
      const body = method === 'GET' ? undefined : route.request().postDataJSON();
      calls.push({ method, path: u.pathname, query: u.search, body });
      if (method === 'GET' && u.pathname === '/api/v1/support/tickets') {
        const status = u.searchParams.get('status') || 'active';
        const q = (u.searchParams.get('q') || '').toLowerCase();
        const category = u.searchParams.get('category') || '';
        const platform = u.searchParams.get('platform') || '';
        const area = u.searchParams.get('area') || '';
        // Narrowed exactly as the server does: these three apply to the counts too, so the
        // tabs can never disagree with the rows.
        const narrowed = tickets.filter((t) => (!category || t.category === category)
          && (!platform || ((t.platforms as string[] | undefined) ?? []).includes(platform))
          && (!area || t.area === area));
        const counts: Record<string, number> = { open: 0, triaged: 0, in_progress: 0, waiting_on_customer: 0, release_pending: 0, resolved: 0, closed: 0, rejected: 0 };
        narrowed.forEach((t) => { counts[t.status] += 1; });
        const rows = narrowed.filter((t) => (status === 'all' ? true : status === 'active' ? ACTIVE.includes(t.status) : t.status === status))
          .filter((t) => !q || `${t.ref} ${t.subject} ${t.org_name}`.toLowerCase().includes(q));
        await route.fulfill({ json: { success: true, data: { tickets: rows, is_operator: opts.operator, counts } } });
        return true;
      }
      if (method === 'POST' && u.pathname === '/api/v1/support/tickets') {
        if (opts.createStatus) {
          await route.fulfill({ status: opts.createStatus, json: { success: false, error: 'Too many tickets raised in the last hour.' } });
          return true;
        }
        const t = mk({
          id: 't-new', ref: 'KM-5009', subject: body!.subject as string, description: body!.description as string,
          category: body!.category as string, priority: body!.priority as string,
          platforms: (body!.platforms as string[]) ?? [], area: (body!.area as string | null) ?? null,
        });
        tickets = [t, ...tickets];
        events.set(t.id, [created(t)]);
        await route.fulfill({ status: 201, json: { success: true, data: t } });
        return true;
      }
      const fb = u.pathname.match(/^\/api\/v1\/support\/tickets\/([^/]+)\/feedback$/);
      if (fb && method === 'POST') {
        const fid = fb[1];
        const rating = Number(body!.rating);
        const comment = (body!.comment as string | undefined) ?? null;
        tickets = tickets.map((t) => (t.id !== fid ? t : { ...t, csat_rating: rating, csat_comment: comment, csat_at: NOW }));
        const flist = events.get(fid) ?? [];
        flist.push({ id: `${fid}-f${flist.length}`, ticket_id: fid, kind: 'feedback', author_type: 'customer', author_name: 'Ravi K', from_status: null, to_status: null, body: comment ? `${rating}/5 — ${comment}` : `${rating}/5`, created_at: NOW });
        events.set(fid, flist);
        await route.fulfill({ json: thread(fid) });
        return true;
      }
      const m = u.pathname.match(/^\/api\/v1\/support\/tickets\/([^/]+)(\/comments)?$/);
      if (!m) return false;
      const id = m[1];
      if (method === 'GET') { await route.fulfill({ json: thread(id) }); return true; }
      const list = events.get(id) ?? [];
      if (m[2]) {
        list.push({ id: `${id}-c${list.length}`, ticket_id: id, kind: 'comment', author_type: opts.operator ? 'team' : 'customer', author_name: opts.operator ? 'Sagar' : 'Ravi K', from_status: null, to_status: null, body: body!.body, created_at: NOW });
        events.set(id, list);
        await route.fulfill({ json: thread(id, opts.operator ? { customer_notified: opts.notified ?? { whatsapp: 'sent' } } : {}) });
        return true;
      }
      const before = tickets.find((t) => t.id === id)!;
      tickets = tickets.map((t) => (t.id !== id ? t : {
        ...t,
        ...(body!.status ? { status: body!.status as Status } : {}),
        ...(body!.priority ? { priority: body!.priority } : {}),
        ...(body!.category ? { category: body!.category } : {}),
        ...(body!.platforms ? { platforms: body!.platforms } : {}),
        ...('area' in body! ? { area: body!.area } : {}),
        resolution_note: body!.status === 'resolved' ? (body!.note as string) ?? null : t.resolution_note,
      }));
      if (body!.status) list.push({ id: `${id}-s${list.length}`, ticket_id: id, kind: 'status', author_type: opts.operator ? 'team' : 'customer', author_name: opts.operator ? 'Sagar' : 'Ravi K', from_status: before.status, to_status: body!.status, body: (body!.note as string) ?? null, created_at: NOW });
      events.set(id, list);
      await route.fulfill({ json: thread(id, opts.operator ? { customer_notified: opts.notified ?? { whatsapp: 'sent' } } : {}) });
      return true;
    },
  });
  await page.goto('/dashboard/support');
  return { calls };
}

test.describe('Help & Support (customer)', () => {
  test('the nav shows Help & Support to a client user with no matching module', async ({ page }) => {
    await open(page, { operator: false, tickets: [] });
    await expect(page.getByRole('link', { name: 'Help & Support' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Help & Support' })).toBeVisible();
    await expect(page.getByText('You have no open tickets')).toBeVisible();
    // operators only
    await expect(page.getByLabel('Search tickets')).toHaveCount(0);
  });

  test('raise a ticket: lengths are checked and the server error is shown', async ({ page }) => {
    const { calls } = await open(page, { operator: false, tickets: [], createStatus: 429 });
    await page.getByRole('button', { name: 'Raise a ticket' }).first().click({ timeout: 45_000 });
    const dialog = page.getByRole('dialog', { name: 'Raise a ticket' });
    await dialog.getByLabel('Subject').fill('Hi');
    await dialog.getByLabel('Description').fill('short');
    await dialog.getByRole('button', { name: 'Raise ticket' }).click();
    await expect(dialog.getByText('at least 3 characters')).toBeVisible();
    await expect(dialog.getByText('at least 10 characters')).toBeVisible();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await dialog.getByLabel('Subject').fill('Sync broken');
    await dialog.getByLabel('Description').fill('Nothing has synced since this morning.');
    await dialog.getByRole('button', { name: 'Raise ticket' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Too many tickets raised in the last hour.');
  });

  test('raise a ticket successfully', async ({ page }) => {
    const { calls } = await open(page, { operator: false, tickets: [] });
    await page.getByRole('button', { name: 'Raise a ticket' }).first().click({ timeout: 45_000 });
    const dialog = page.getByRole('dialog', { name: 'Raise a ticket' });
    await dialog.getByLabel('Subject').fill('Sync broken');
    await dialog.getByLabel('What is this about?').selectOption('data_correction');
    await dialog.getByLabel('Priority').selectOption('high');
    await dialog.getByLabel('Description').fill('Nothing has synced since this morning.');
    await dialog.getByRole('button', { name: 'Raise ticket' }).click();
    await expect(page.getByText("Ticket KM-5009 raised. We'll update you here and on WhatsApp.")).toBeVisible();
    // Platforms default to Web for a product category when the customer leaves them alone; area stays unset.
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      subject: 'Sync broken', description: 'Nothing has synced since this morning.',
      category: 'data_correction', priority: 'high', platforms: ['web'], area: null,
    });
    await expect(page.getByRole('dialog', { name: 'Ticket KM-5009' })).toBeVisible();
    await expect(page).toHaveURL(/ticket=t-new/);
  });

  test('the platform pills and area ride along; a non-product type is not asked where they saw it', async ({ page }) => {
    const { calls } = await open(page, { operator: false, tickets: [] });
    await page.getByRole('button', { name: 'Raise a ticket' }).first().click({ timeout: 45_000 });
    const dialog = page.getByRole('dialog', { name: 'Raise a ticket' });

    // Billing is not about the product, so there is nothing to pick a platform for.
    await dialog.getByLabel('What is this about?').selectOption('billing');
    await expect(dialog.getByRole('button', { name: 'Android', exact: true })).toHaveCount(0);

    await dialog.getByLabel('What is this about?').selectOption('bug');
    await dialog.getByLabel('Subject').fill('App crashes on open');
    await dialog.getByLabel('Description').fill('The Android app closes as soon as I open attendance.');
    await dialog.getByLabel('Which part of Kinematic?').selectOption('attendance');
    // Web is on by default: add Android, then drop Web.
    await dialog.getByRole('button', { name: 'Android', exact: true }).click();
    await dialog.getByRole('button', { name: 'Web', exact: true }).click();
    await dialog.getByRole('button', { name: 'Raise ticket' }).click();

    await expect(page.getByRole('dialog', { name: 'Ticket KM-5009' })).toBeVisible();
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      subject: 'App crashes on open', description: 'The Android app closes as soon as I open attendance.',
      category: 'bug', priority: 'normal', platforms: ['android'], area: 'attendance',
    });
  });

  test('"This is fixed" and "Still not working"', async ({ page }) => {
    const { calls } = await open(page, { operator: false, tickets: [mk({ id: 't1', ref: 'KM-5001', status: 'waiting_on_customer' })] });
    await expect(page.getByRole('tab', { name: /Waiting on you/ })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: /KM-5001/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Ticket KM-5001' });
    await drawer.getByRole('button', { name: 'This is fixed' }).click();
    await expect(drawer.getByText('Is this fixed?')).toBeVisible();
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ status: 'resolved' });
    await drawer.getByRole('button', { name: 'Still not working' }).click();
    await drawer.getByLabel("What's still not working?").fill('Still missing two visits.');
    await drawer.getByRole('button', { name: 'Reopen ticket' }).click();
    await expect(drawer.getByRole('button', { name: 'This is fixed' })).toBeVisible();
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ status: 'open', note: 'Still missing two visits.' });
    await expect(drawer.getByText(/changed status Resolved → Open/)).toBeVisible();
  });
});

test.describe('Help & Support — feedback', () => {
  test('a finished ticket can be rated, with an optional comment, and the rating can be changed', async ({ page }) => {
    const { calls } = await open(page, { operator: false, tickets: [mk({ id: 't1', ref: 'KM-5001', status: 'resolved' })] });
    // A resolved ticket is not in the default "Active" tab, so look at all of them.
    await page.getByRole('tab', { name: /^All/ }).click({ timeout: 45_000 });
    await page.getByRole('button', { name: /KM-5001/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Ticket KM-5001' });

    // The comment box and the submit button only appear once a rating is picked.
    await expect(drawer.getByText('How did we do?')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Send feedback' })).toHaveCount(0);
    await drawer.getByRole('button', { name: '4 out of 5 — Good' }).click();
    await expect(drawer.getByText('Good', { exact: true })).toBeVisible();
    await drawer.getByLabel('Anything you would like to add?').fill('Quick, thanks.');
    await drawer.getByRole('button', { name: 'Send feedback' }).click();

    expect(calls.find((c) => c.path.endsWith('/feedback'))!.body).toEqual({ rating: 4, comment: 'Quick, thanks.' });
    await expect(drawer.getByText('You rated this')).toBeVisible();
    // It lands on the timeline as well as in the summary, so the comment shows up twice on purpose.
    await expect(drawer.getByText(/Quick, thanks\./)).toHaveCount(2);
    await expect(drawer.getByText(/rated this ticket/)).toBeVisible();

    // And they can change their mind.
    await drawer.getByRole('button', { name: 'Change' }).click();
    await drawer.getByRole('button', { name: '5 out of 5 — Excellent' }).click();
    await drawer.getByRole('button', { name: 'Send feedback' }).click();
    expect(calls.filter((c) => c.path.endsWith('/feedback')).at(-1)!.body).toMatchObject({ rating: 5 });
  });

  test('a ticket still being worked is never asked to be rated', async ({ page }) => {
    await open(page, { operator: false, tickets: [mk({ id: 't1', ref: 'KM-5001', status: 'in_progress' })] });
    await page.getByRole('button', { name: /KM-5001/ }).click({ timeout: 45_000 });
    const drawer = page.getByRole('dialog', { name: 'Ticket KM-5001' });
    await expect(drawer.getByText('How did we do?')).toHaveCount(0);
  });
});

test.describe('Support inbox (operator)', () => {
  const T1 = mk({ id: 't1', ref: 'KM-5001', org_name: 'Acme Foods', channel: 'whatsapp' });
  const T2 = mk({ id: 't2', ref: 'KM-5002', subject: 'Invoice is wrong', category: 'billing', org_name: 'Zen Retail', priority: 'urgent' });

  test('lists every customer, searches, and updates with a note', async ({ page }) => {
    const { calls } = await open(page, { operator: true, tickets: [T1, T2] });
    await expect(page.getByRole('heading', { name: 'Support inbox' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Zen Retail')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Active\s*2/ })).toBeVisible();
    await page.getByLabel('Search tickets').fill('zen');
    await expect(page.getByText('Acme Foods')).toHaveCount(0);
    expect(calls.some((c) => c.query.includes('q=zen'))).toBe(true);

    await page.getByRole('button', { name: /KM-5002/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Ticket KM-5002' });
    await drawer.getByLabel('Status').selectOption('resolved');
    await drawer.getByLabel('Note to customer').fill('Fixed: the invoice was re-issued');
    await drawer.getByRole('button', { name: 'Update' }).click();
    await expect(drawer.getByText('Customer told on WhatsApp')).toBeVisible();
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)!.body).toEqual({ status: 'resolved', note: 'Fixed: the invoice was re-issued' });
    await expect(drawer.getByText(/Sagar changed status Open → Resolved/)).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Not resolved (reopen)' })).toBeVisible();
  });

  test('the Type / Platform / Area filters are sent and refetch the list', async ({ page }) => {
    const BUG = mk({ id: 'f1', ref: 'KM-5101', subject: 'App crashes', category: 'bug', platforms: ['android'], area: 'attendance', org_name: 'Acme Foods' });
    const BILL = mk({ id: 'f2', ref: 'KM-5102', subject: 'Invoice is wrong', category: 'billing', platforms: ['web'], area: 'billing', org_name: 'Zen Retail' });
    const { calls } = await open(page, { operator: true, tickets: [BUG, BILL] });
    await expect(page.getByRole('heading', { name: 'Support inbox' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('Zen Retail')).toBeVisible();

    await page.getByLabel('Type').selectOption('bug');
    await expect(page.getByText('Zen Retail')).toHaveCount(0);
    await expect(page.getByText('Acme Foods')).toBeVisible();
    expect(calls.some((c) => c.query.includes('category=bug'))).toBe(true);

    await page.getByLabel('Platform').selectOption('android');
    await expect(page.getByText('Acme Foods')).toBeVisible();
    expect(calls.some((c) => c.query.includes('platform=android'))).toBe(true);

    // No bug ticket lives in the billing area, so the combination empties the list.
    await page.getByLabel('Area').selectOption('billing');
    await expect(page.getByText('No open tickets')).toBeVisible();
    expect(calls.some((c) => c.query.includes('area=billing'))).toBe(true);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Zen Retail')).toBeVisible();
    const last = calls.filter((c) => c.method === 'GET' && c.path.endsWith('/tickets')).at(-1)!;
    expect(last.query).not.toMatch(/category=|platform=|area=/);
  });

  test('a reply shows what happened to the WhatsApp message', async ({ page }) => {
    const { calls } = await open(page, { operator: true, tickets: [T1], notified: { whatsapp: 'skipped', note: 'No phone number on this ticket.', email: 'sent' } });
    await page.getByRole('button', { name: /KM-5001/ }).click({ timeout: 45_000 });
    const drawer = page.getByRole('dialog', { name: 'Ticket KM-5001' });
    await drawer.getByLabel('Reply').fill('Looking into it now.');
    await drawer.getByRole('button', { name: 'Send reply' }).click();
    await expect(drawer.getByText('No phone number on this ticket.')).toBeVisible();
    // Both channels are reported, so a green email can't hide a WhatsApp that never went.
    await expect(drawer.getByText('Customer emailed')).toBeVisible();
    await expect(drawer.getByText('Looking into it now.')).toBeVisible();
    expect(calls.find((c) => c.path.endsWith('/comments'))!.body).toEqual({ body: 'Looking into it now.' });
  });
});
