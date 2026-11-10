import { test, expect, type Page } from '@playwright/test';
import {
  OWNER_WORKLOAD, STAGE_VELOCITY,
  pageScrollsSideways, parseCsv, readDownload, serve, settingsWith,
} from './crm-plus-fixtures';
import { demoLogin } from './utils';

/**
 * Lead Management reports: the six new report pages (rows / columns / totals / KPIs from a mocked response, filters
 * refetch, CSV matches the screen, empty / error states, phone width, built-in field gate) and the extra data points
 * on the existing reports (Team Performance, Lead Tracker, Win/Loss, Forecast, Sales Cycle, Lead Source ROI, Rep
 * Leaderboard, Stage Funnel, Stuck Deals, Lead Aging, Team Daily, Activity Heatmap). API intercepted, nothing real.
 */

const REPORTS = '/dashboard/crm/reports';

// ── small DOM helpers ───────────────────────────────────────────────────────────────────────────────────────────────
const clean = (t: string) => t.replace(/[▲▼⇅]/g, '').replace(/\s+/g, ' ').trim();
// textContent, not innerText: the headers are upper-cased by CSS and innerText would return the transformed text
const headers = async (page: Page, scope = 'table') => {
  await page.locator(`${scope} th`).first().waitFor(); // allTextContents() does not wait: the table renders after the fetch
  return (await page.locator(`${scope} th`).allTextContents()).map(clean).filter(Boolean);
};
const cells = async (loc: ReturnType<Page['locator']>) => {
  await loc.locator('td').first().waitFor();
  return (await loc.locator('td').allInnerTexts()).map(clean);
};
const csvOf = async (page: Page, button: string | RegExp = /Download CSV|⬇ CSV/) => {   // the older pages say "⬇ CSV"
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
  return parseCsv(await readDownload(download));
};
/** A row of a CSV as { header: value }. */
const csvRow = (csv: string[][], first: string) => {
  const row = csv.find((r) => r[0] === first);
  expect(row, `csv row ${first}`).toBeTruthy();
  return Object.fromEntries(csv[0].map((h, i) => [h, row![i]]));
};
/** A second page in the same context. The api client mirrors GET answers to localStorage (stale-while-revalidate), so it
 *  starts from a clean slate, otherwise it would be served the first page's /crm/settings. Register before serve(): serve()
 *  seeds the session afterwards. */
const freshPage = async (page: Page) => {
  const p = await page.context().newPage();
  await p.addInitScript(() => { try { window.localStorage.clear(); } catch { /* blocked */ } });
  return p;
};
const kpis = async (page: Page) => {
  await page.getByTestId('plus-kpi').first().waitFor();
  return (await page.getByTestId('plus-kpi').allInnerTexts()).map((t) => clean(t));
};

// ═══════════════════════════════════════════════════════════════════════════
// The reports hub
// ═══════════════════════════════════════════════════════════════════════════
const NEW_REPORTS = [
  ['Lead Source Performance', 'source-performance'], ['Follow-up Compliance', 'followup-compliance'], ['Owner Workload', 'owner-workload'],
  ['Stage Velocity', 'stage-velocity'], ['Activity Mix', 'activity-mix'], ['Lead Conversion Time', 'conversion-time'],
] as const;

test.describe('reports hub', () => {
  test('lists the six new reports with a plain description each, linking to their pages', async ({ page }) => {
    await serve(page);
    await page.goto(REPORTS);
    for (const [title, slug] of NEW_REPORTS) {
      const card = page.getByRole('link', { name: new RegExp(`^${title}`) });
      await expect(card, title).toBeVisible();
      await expect(card).toHaveAttribute('href', `/dashboard/crm/reports/${slug}`);
    }
    await expect(page.getByText('Leads by source and how far they got: qualified, converted, days to convert, won value and cost.')).toBeVisible();
    // existing cards are still there
    for (const t of ['Team Performance', 'Lead Tracker', 'Win/Loss', 'Forecast', 'Sales Cycle', 'Stage Funnel', 'Stuck Deals']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${t}`) }), t).toBeVisible();
    }
  });

  test('a Consumer Champion sees none of the new reports (they are manager views)', async ({ page }) => {
    await serve(page, { user: { id: 'champ', org_id: 'e2e-org-1', client_id: null, name: 'Champ', email: 'c@x.io', role: 'sub_admin', org_role_name: 'Consumer Champion', is_active: true, enabled_modules: ['crm'], enabled_packages: ['crm'], permissions: [] } });
    await page.goto(REPORTS);
    await expect(page.getByRole('link', { name: /^Win\/Loss/ })).toBeVisible();
    for (const [title] of NEW_REPORTS) await expect(page.getByRole('link', { name: new RegExp(`^${title}`) }), title).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The six new reports
// ═══════════════════════════════════════════════════════════════════════════
interface ReportSpec {
  slug: string; testId: string; title: string; endpoint: string; csvName: RegExp;
  columns: string[];
  firstRow: Record<number, string>;      // column index -> text of the FIRST data row
  totals?: Record<number, string>;
  rows: number;
  kpis: string[];                        // KPI card texts, in order (label then value [hint])
  range: boolean;
  emptyTitle: string;
  emptyPayload: unknown;
}

const SPECS: ReportSpec[] = [
  {
    slug: 'source-performance', testId: 'report-source-performance', title: 'Lead Source Performance', endpoint: 'source-performance', csvName: /lead-source-performance/,
    columns: ['Source', 'Leads', 'Share of leads %', 'Qualified', 'Qualified %', 'Converted', 'Conversion %', 'Lost', 'Unqualified', 'Open', 'Avg days to convert', 'Avg lead score',
      'Won value (INR)', 'Won value per lead (INR)', 'Cost per lead (INR)', 'Total cost (INR)', 'Cost per converted lead (INR)'],
    firstRow: { 0: 'Website', 1: '40', 2: '66.7%', 6: '25%', 10: '12.5 d', 12: '₹3.5L', 14: '₹100', 15: '₹4K', 16: '₹400' },
    totals: { 0: 'All sources', 1: '60', 6: '30%', 12: '₹7.7L' },
    rows: 2,
    kpis: ['LEADS 60', 'CONVERTED 18 30%', 'AVG DAYS TO CONVERT 9.6 d', 'WON VALUE ₹7.7L INR', 'BEST CONVERTING SOURCE Referral 40% of 20 leads (sources with 5+ leads)'],
    range: true, emptyTitle: 'No leads in this date range', emptyPayload: { rows: [], totals: {} },
  },
  {
    slug: 'followup-compliance', testId: 'report-followup-compliance', title: 'Follow-up Compliance', endpoint: 'followup-compliance', csvName: /followup-compliance/,
    columns: ['Person', 'Due', 'Done on time', 'Done late', 'Overdue now', 'Not yet due', 'Done with no time recorded', 'On-time %', 'Avg days late', 'Avg days overdue'],
    firstRow: { 0: 'Asha', 1: '10', 2: '6', 7: '60%', 8: '1.5 d', 9: '4.2 d' },
    totals: { 0: 'Everyone', 1: '18', 7: '66.7%' },
    rows: 2,
    kpis: ['FOLLOW-UPS DUE 18', 'ON-TIME % 66.7% on time ÷ (on time + late + overdue)', 'DONE LATE 3 avg 1.7 d late', 'OVERDUE NOW 2 avg 4.2 d overdue', 'NOT YET DUE 3'],
    range: true, emptyTitle: 'No follow-ups were due in this date range', emptyPayload: { rows: [], totals: {}, trend: [] },
  },
  {
    slug: 'owner-workload', testId: 'report-owner-workload', title: 'Owner Workload and Response Time', endpoint: 'owner-workload', csvName: /owner-workload/,
    columns: ['Owner', 'Open leads', 'Share of open leads %', 'New leads in range', 'Never touched', 'Idle 7 days+', 'Idle 14 days+', 'Idle 30 days+', 'Avg open lead age (days)',
      'Overdue follow-ups', 'New leads touched', 'Median first touch (minutes)', 'First-touch SLA breach %'],
    firstRow: { 0: 'Asha', 1: '30', 2: '60%', 8: '21.4 d', 9: '4', 11: '1h 35m', 12: '25%' },
    totals: { 0: 'Everyone', 1: '50', 11: '1h 2m', 12: '14.3%' },
    rows: 2,
    kpis: ['OPEN LEADS 50', 'NEVER TOUCHED 4 open leads with no activity', 'IDLE 14 DAYS+ 6', 'OVERDUE FOLLOW-UPS 5', 'MEDIAN FIRST TOUCH 1h 2m 14 new leads touched', 'SLA BREACH 14.3% first touch slower than 1 hour'],
    range: true, emptyTitle: 'No open leads or new leads in this range', emptyPayload: { rows: [], totals: {}, sla_minutes: 60 },
  },
  {
    slug: 'stage-velocity', testId: 'report-stage-velocity', title: 'Stage Velocity', endpoint: 'stage-velocity', csvName: /stage-velocity/,
    columns: ['Stage', 'Type', 'Deals entered', 'Completed stays', 'Avg days in stage', 'Median days in stage', 'Longest stay (days)', 'Open deals now', 'Open value now (INR)', 'Avg age of open deals (days)', 'Slow open deals'],
    firstRow: { 0: 'Lead', 1: 'open', 4: '6.5 d', 5: '7 d', 6: '10 d', 7: '2', 8: '₹2L', 9: '9.5 d', 10: '1' },
    rows: 3,
    kpis: ['OPEN DEALS 5', 'OPEN VALUE ₹6.5L INR', 'TYPICAL DAYS THROUGH OPEN STAGES 16.5 d sum of each stage average', 'SLOW OPEN DEALS 1 over 2x the stage average'],
    range: false, emptyTitle: 'No pipeline stages yet', emptyPayload: { pipeline_id: null, pipelines: [], rows: [], totals: {} },
  },
  {
    slug: 'activity-mix', testId: 'report-activity-mix', title: 'Activity Mix', endpoint: 'activity-mix', csvName: /activity-mix/,
    columns: ['Person', 'Total', 'Calls', 'Emails', 'Meetings', 'Site visits', 'Tasks', 'Notes', 'SMS / WhatsApp', 'Other', 'Completed', 'Completion %', 'Calls with outcome', 'Calls connected',
      'Call connect rate %', 'Active days', 'Avg activities per active day'],
    firstRow: { 0: 'Asha', 1: '50', 2: '30', 11: '80%', 14: '50%', 15: '10', 16: '5' },
    totals: { 0: 'Everyone', 1: '80', 11: '68.8%', 14: '44%' },
    rows: 2,
    kpis: ['ACTIVITIES LOGGED 80', 'COMPLETION % 68.8% 55 completed', 'CALLS 40', 'CALL CONNECT RATE 44% 11 of 25 calls with an outcome', 'PEOPLE ACTIVE 2'],
    range: true, emptyTitle: 'No activities were logged in this date range', emptyPayload: { rows: [], totals: {}, by_type: [], by_week: [] },
  },
  {
    slug: 'conversion-time', testId: 'report-conversion-time', title: 'Lead Conversion Time', endpoint: 'conversion-time', csvName: /lead-conversion-time-distribution/,
    columns: ['Days to convert', 'Leads converted', 'Share of conversions %'],
    firstRow: { 0: '<1d', 1: '1', 2: '25%' },
    totals: { 0: 'All converted leads', 1: '4', 2: '100%' },
    rows: 7,
    kpis: ['LEADS CONVERTED 4', 'MEDIAN DAYS 4.5 d', 'AVERAGE DAYS 14.6 d', '90% CONVERTED WITHIN 49 d', 'FASTEST 0.5 d', 'SLOWEST 49 d'],
    range: true, emptyTitle: 'No leads were converted in this date range', emptyPayload: { totals: {}, buckets: [], by_owner: [], by_source: [], by_month: [] },
  },
];

for (const sp of SPECS) {
  const url = `${REPORTS}/${sp.slug}`;
  const root = (page: Page) => page.getByTestId(sp.testId);

  test.describe(`report: ${sp.title}`, () => {
    test('renders its columns, rows, totals and KPIs from the mocked response', async ({ page }) => {
      await serve(page);
      await page.goto(url);
      await expect(root(page).getByRole('heading', { name: sp.title })).toBeVisible();
      await expect(page.getByTestId('plus-row')).toHaveCount(sp.rows);
      expect(await headers(page)).toEqual(sp.columns);
      const first = await cells(page.getByTestId('plus-row').first());
      for (const [i, text] of Object.entries(sp.firstRow)) expect(first[Number(i)], `${sp.slug} col ${sp.columns[Number(i)]}`).toBe(text);
      if (sp.totals) {
        const t = await cells(page.getByTestId('plus-totals'));
        for (const [i, text] of Object.entries(sp.totals)) expect(t[Number(i)], `${sp.slug} totals ${sp.columns[Number(i)]}`).toBe(text);
      } else {
        await expect(page.getByTestId('plus-totals')).toHaveCount(0);
      }
      expect(await kpis(page)).toEqual(sp.kpis);
      // the definitions of the numbers are on the page
      await expect(root(page).getByText(/counted|Counts|computed|Worked out|Leads are counted|follow-up is any activity|workload and responsiveness/i).first()).toBeVisible();
    });

    test('the table is sortable by a column header', async ({ page }) => {
      await serve(page);
      await page.goto(url);
      const col = sp.columns[1];
      await page.locator('table th').nth(1).getByRole('button').click(); // ascending
      await page.locator('table th').nth(1).getByRole('button').click(); // descending
      await expect(page.locator('table th').nth(1).getByRole('button')).toHaveAttribute('aria-sort', 'descending');
      await expect(page.getByTestId('plus-row').first()).toBeVisible();
      expect(col).toBeTruthy();
    });

    test('the CSV has exactly the on-screen columns, raw values, and the totals row', async ({ page }) => {
      await serve(page);
      await page.goto(url);
      await expect(page.getByTestId('plus-row').first()).toBeVisible();
      const [download] = await Promise.all([page.waitForEvent('download'), root(page).getByRole('button', { name: 'Download CSV' }).click()]);
      expect(download.suggestedFilename()).toMatch(sp.csvName);
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
      const csv = parseCsv(await readDownload(download));
      expect(csv[0]).toEqual(sp.columns);
      expect(csv.length - 1).toBe(sp.rows + (sp.totals ? 1 : 0));
      // raw numbers, not the compact on-screen text
      for (const row of csv.slice(1)) for (const cell of row) expect(cell).not.toMatch(/₹|\sd$|^\d+(\.\d+)?%$|^\d+h\b/);
    });

    if (sp.range) {
      test('changing the date range refetches with that range (and a bad range is not sent)', async ({ page }) => {
        const served = await serve(page);
        await page.goto(url);
        await expect(page.getByTestId('plus-row').first()).toBeVisible();
        const before = served.requests.filter((r) => r.includes(`/analytics/${sp.endpoint}`)).length;
        await root(page).getByLabel('From', { exact: true }).fill('2026-10-01');
        await expect.poll(() => served.requests.filter((r) => r.includes(`/analytics/${sp.endpoint}`)).length).toBeGreaterThan(before);
        expect(served.requests.at(-1)).toContain('from=2026-10-01');
        await root(page).getByLabel('To', { exact: true }).fill('2026-10-31');
        await expect.poll(() => served.requests.at(-1) ?? '').toContain('to=2026-10-31');
      });
    }

    test('an org with nothing sees a clean empty state and a disabled CSV button', async ({ page }) => {
      await serve(page, { payloads: { [sp.endpoint]: sp.emptyPayload } });
      await page.goto(url);
      await expect(root(page).getByText(sp.emptyTitle)).toBeVisible();
      await expect(page.locator('table')).toHaveCount(0);
      await expect(root(page).getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    });

    test('a failing endpoint shows an error with Retry, and Retry loads the report', async ({ page }) => {
      const served = await serve(page);
      served.fail(sp.endpoint, 500);
      await page.goto(url);
      await expect(root(page).getByRole('alert')).toContainText('Could not load this report');
      served.set(sp.endpoint, undefined);
      await root(page).getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByTestId('plus-row').first()).toBeVisible();
      await expect(root(page).getByRole('alert')).toHaveCount(0);
    });

    test('at 390px the page does not scroll sideways; the table scrolls inside its own container', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await serve(page);
      await page.goto(url);
      await expect(page.getByTestId('plus-row').first()).toBeVisible();
      expect(await pageScrollsSideways(page)).toBe(false);
      // the table has a minimum width wider than a phone, so it scrolls inside its own container
      const wide = await page.getByTestId('plus-table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(wide).toBe(true);
      // charts and KPI cards stay inside the page too
      await expect(root(page).getByRole('heading', { name: sp.title })).toBeVisible();
    });
  });
}

test.describe('report: Lead Source Performance, field gate', () => {
  test('is withheld while the admin hides the lead source field, and uses the admin\'s label for the column otherwise', async ({ page }) => {
    await serve(page, { settings: settingsWith({ 'lead.source_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/source-performance`);
    await expect(page.getByText('This report is hidden')).toBeVisible();
    await expect(page.getByText(/turned off the Source field in Settings/)).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);

    const page2 = await freshPage(page);
    await serve(page2, { settings: settingsWith({ 'lead.source_id': { label: 'Channel' } }) });
    await page2.goto(`${REPORTS}/source-performance`);
    expect((await headers(page2))[0]).toBe('Channel');
    expect((await csvOf(page2))[0][0]).toBe('Channel');
  });
});

test.describe('report: Owner Workload', () => {
  test('the SLA picker refetches with sla_minutes and relabels the SLA KPI', async ({ page }) => {
    const served = await serve(page, { payloads: { 'owner-workload': (u: URL) => ({ ...OWNER_WORKLOAD, sla_minutes: Number(u.searchParams.get('sla_minutes') ?? 60) }) } });
    await page.goto(`${REPORTS}/owner-workload`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible();
    await page.getByLabel('First-touch SLA').selectOption('120');
    await expect.poll(() => served.requests.at(-1) ?? '').toContain('sla_minutes=120');
    await expect(page.getByTestId('plus-kpi').filter({ hasText: 'SLA BREACH' })).toContainText('slower than 2 hours');
  });

  test('is withheld when the admin hides the owner field', async ({ page }) => {
    await serve(page, { settings: settingsWith({ 'lead.owner_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/owner-workload`);
    await expect(page.getByText('This report is hidden')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('the CSV carries the raw median minutes and the SLA breach %', async ({ page }) => {
    await serve(page);
    await page.goto(`${REPORTS}/owner-workload`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible();
    const csv = await csvOf(page);
    expect(csvRow(csv, 'Asha')).toMatchObject({ 'Open leads': '30', 'Median first touch (minutes)': '95', 'First-touch SLA breach %': '25', 'Avg open lead age (days)': '21.4' });
    expect(csvRow(csv, 'Everyone')).toMatchObject({ 'Open leads': '50', 'Median first touch (minutes)': '62' });
  });
});

test.describe('report: Stage Velocity', () => {
  test('switching pipeline refetches with pipeline_id and shows that pipeline\'s stages', async ({ page }) => {
    const served = await serve(page, {
      payloads: {
        'stage-velocity': (u: URL) => (u.searchParams.get('pipeline_id') === 'p2'
          ? { ...STAGE_VELOCITY, pipeline_id: 'p2', rows: [{ ...STAGE_VELOCITY.rows[0], stage_id: 'r1', stage: 'Renewal due', avg_days: 3 }], totals: { open_deals: 1, open_value: 1000, typical_days_through_open_stages: 3 } }
          : STAGE_VELOCITY),
      },
    });
    await page.goto(`${REPORTS}/stage-velocity`);
    await expect(page.getByTestId('plus-row')).toHaveCount(3);
    const select = page.getByLabel('Pipeline');
    await expect(select.locator('option')).toHaveText(['Sales', 'Renewals']);
    await select.selectOption('p2');
    await expect.poll(() => served.requests.at(-1) ?? '').toContain('pipeline_id=p2');
    await expect(page.getByTestId('plus-row')).toHaveCount(1);
    await expect(page.getByTestId('plus-row').first()).toContainText('Renewal due');
  });

  test('a won stage shows a dash (no stay time), not a zero', async ({ page }) => {
    await serve(page);
    await page.goto(`${REPORTS}/stage-velocity`);
    const won = await cells(page.getByTestId('plus-row').nth(2));
    expect(won.slice(0, 7)).toEqual(['Won', 'won', '4', '0', '—', '—', '—']);
  });
});

test.describe('report: Lead Conversion Time', () => {
  test('the view switch changes the table and the CSV: month, owner, source', async ({ page }) => {
    await serve(page);
    await page.goto(`${REPORTS}/conversion-time`);
    await expect(page.getByTestId('plus-row')).toHaveCount(7);

    await page.getByRole('tab', { name: 'By month' }).click();
    expect(await headers(page)).toEqual(['Month converted', 'Leads converted', 'Share of conversions %', 'Avg days to convert', 'Median days to convert']);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Oct 2026', '4', '100%', '14.6 d', '4.5 d']);
    expect(await cells(page.getByTestId('plus-totals'))).toEqual(['All converted leads', '4', '100%', '14.6 d', '4.5 d']);

    await page.getByRole('tab', { name: 'By owner' }).click();
    expect((await headers(page))[0]).toBe('Owner');
    await expect(page.getByTestId('plus-row')).toHaveCount(2);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Asha', '2', '50%', '3.8 d', '3.8 d']);
    const ownerCsv = await csvOf(page);
    expect(ownerCsv[0]).toEqual(['Owner', 'Leads converted', 'Share of conversions %', 'Avg days to convert', 'Median days to convert']);
    expect(csvRow(ownerCsv, 'Ravi')).toMatchObject({ 'Leads converted': '2', 'Median days to convert': '25.5' });
    expect(ownerCsv.at(-1)![0]).toBe('All converted leads');

    await page.getByRole('tab', { name: 'By source' }).click();
    expect((await headers(page))[0]).toBe('Source');
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Website', '3', '75%', '5.2 d', '4 d']);
  });

  test('the distribution CSV is named for its view and lists every bucket, including empty ones', async ({ page }) => {
    await serve(page);
    await page.goto(`${REPORTS}/conversion-time`);
    const csv = await csvOf(page);
    expect(csv.map((r) => r[0])).toEqual(['Days to convert', '<1d', '1–3d', '4–7d', '8–14d', '15–30d', '31–60d', '60d+', 'All converted leads']);
    expect(csvRow(csv, '8–14d')).toMatchObject({ 'Leads converted': '0' });
  });

  test('the owner and source views disappear when the admin hides those fields', async ({ page }) => {
    await serve(page, { settings: settingsWith({ 'lead.owner_id': { hidden: true }, 'lead.source_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/conversion-time`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /^By month$/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /By owner/i })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /By source/i })).toHaveCount(0);
  });

  test('a relabelled owner field names the view the way the admin named it', async ({ page }) => {
    await serve(page, { settings: settingsWith({ 'lead.owner_id': { label: 'Sales rep' } }) });
    await page.goto(`${REPORTS}/conversion-time`);
    await page.getByRole('tab', { name: 'By sales rep' }).click();
    expect((await headers(page))[0]).toBe('Sales rep');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Extra data points on the existing reports
// ═══════════════════════════════════════════════════════════════════════════
const NOW_ISO = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const ymdAgo = (n: number) => daysAgo(n).slice(0, 10);
const ok = (route: import('@playwright/test').Route, data: unknown, extra: Record<string, unknown> = {}) => route.fulfill({ json: { success: true, data, ...extra } });

const tpRow = (o: Record<string, unknown>) => ({
  user_id: 'u1', name: 'Asha', total_leads_owned: 30, new_leads_today: 1, new_leads_week: 3, new_leads_month: 8, new_leads_period: 12, qualified_count: 10, converted_count: 5, unqualified_count: 2,
  lost_leads_count: 3, qualified_rate: 0.33, converted_rate: 0.17, won_count: 4, won_value: 400000, lost_count: 2, open_count: 6, open_pipeline_value: 900000, conversion_rate: 0.667,
  avg_deal_size: 100000, avg_sales_cycle_days: 18, avg_ageing_days: 12, oldest_open_lead_days: 45, activities_completed_period: 30, activities_total_period: 40, last_activity_at: daysAgo(1), avg_lead_score: 61, ...o,
});
const TP_NEW = { lost_value: 120000, weighted_pipeline_value: 350000, overdue_followups: 3, untouched_open_leads: 2, idle_leads_14d: 4, calls_period: 25, meetings_period: 6, new_leads_prev_period: 10, won_count_prev_period: 5, won_value_prev_period: 500000 };

test.describe('existing report: Team Performance', () => {
  const asha = tpRow(TP_NEW);
  const ravi = tpRow({ user_id: 'u2', name: 'Ravi', won_value: 200000, new_leads_period: 5, ...TP_NEW, new_leads_prev_period: 0, won_value_prev_period: 0, overdue_followups: 0, lost_value: 0 });
  const total = tpRow({ user_id: null, name: 'Total', won_value: 600000, new_leads_period: 17, ...TP_NEW, new_leads_prev_period: 10, won_value_prev_period: 500000, overdue_followups: 3, weighted_pipeline_value: 700000 });

  test('shows the follow-through & trend columns, the new KPIs, and keeps the original columns', async ({ page }) => {
    await serve(page, { payloads: { 'team-performance': { total, rows: [asha, ravi] } } });
    await page.goto(`${REPORTS}/team-performance`);
    await expect(page.getByText('Follow-through & Trend')).toBeVisible();
    const hs = await headers(page);
    for (const h of ['Won Value', 'Pipeline Value', 'Sales Cycle (d)', 'Avg Lead Score']) expect(hs).toContain(h);                       // unchanged
    for (const h of ['Overdue Follow-ups', 'Untouched Open Leads', 'Idle 14d+ Leads', 'Calls (range)', 'Meetings (range)', 'Lost Value', 'Weighted Pipeline',
      'New Leads vs Prev Period', 'Won Value vs Prev Period']) expect(hs).toContain(h);
    await expect(page.getByText('Asha').first()).toBeVisible();
    const all = (await page.locator('tbody tr').allInnerTexts()).map(clean);
    const ashaRow = all.find((t) => t.startsWith('Asha'))!;
    expect(ashaRow).toContain('+20%');        // 12 new leads vs 10
    expect(ashaRow).toContain('-20%');        // 400000 won vs 500000
    const raviRow = all.find((t) => t.startsWith('Ravi'))!;
    expect(raviRow).toContain('new');         // 5 vs 0: nothing to divide by
    const tile = (label: string) => page.getByTestId('tp-kpi').filter({ hasText: label });
    await expect(tile('Weighted Pipeline')).toContainText('7.00L');
    await expect(tile('Overdue Follow-ups')).toContainText('3');
    await expect(tile('Won Value vs Prev')).toContainText('+20%');
  });

  test('the new CSV export has every column on screen (raw numbers) and the total row', async ({ page }) => {
    await serve(page, { payloads: { 'team-performance': { total, rows: [asha, ravi] } } });
    await page.goto(`${REPORTS}/team-performance`);
    await expect(page.getByText('Asha')).toBeVisible();
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(['Rep', 'Total Leads', 'New Today', 'New This Week', 'New This Month', 'New In Range', 'Qualified', 'Converted', 'Lost', 'Won Count', 'Won Value (INR)', 'Lost Count', 'Open',
      'Pipeline Value (INR)', 'Conversion %', 'Avg Deal Size (INR)', 'Sales Cycle (d)', 'Avg Ageing (d)', 'Oldest Open (d)', 'Activities Done', 'Activities Total', 'Last Activity', 'Avg Lead Score',
      'Overdue Follow-ups', 'Untouched Open Leads', 'Idle 14d+ Leads', 'Calls (range)', 'Meetings (range)', 'Lost Value', 'Weighted Pipeline', 'New Leads Prev Period',
      'New Leads vs Prev Period (%)', 'Won Value Prev Period (INR)', 'Won Value vs Prev Period (%)']);
    expect(csvRow(csv, 'Asha')).toMatchObject({ 'Won Value (INR)': '400000', 'Conversion %': '66.7', 'Overdue Follow-ups': '3', 'Lost Value': '120000', 'Weighted Pipeline': '350000',
      'New Leads Prev Period': '10', 'New Leads vs Prev Period (%)': '20', 'Won Value Prev Period (INR)': '500000', 'Won Value vs Prev Period (%)': '-20' });
    expect(csvRow(csv, 'Ravi')).toMatchObject({ 'New Leads vs Prev Period (%)': '' });   // 5 vs 0: blank, not infinity
    expect(csv.at(-1)![0]).toBe('Total');
  });

  test('an older backend without the new fields still renders (dashes, no crash) and exports', async ({ page }) => {
    const legacy = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !Object.keys(TP_NEW).includes(k)));
    await serve(page, { payloads: { 'team-performance': { total: legacy(total), rows: [legacy(asha)] } } });
    await page.goto(`${REPORTS}/team-performance`);
    await expect(page.getByText('Asha')).toBeVisible();
    const ashaRow = (await page.locator('tbody tr').allInnerTexts()).map(clean).find((t) => t.startsWith('Asha'))!;
    expect(ashaRow).toContain('—');
    expect((await csvOf(page))[0]).toContain('Overdue Follow-ups');
  });
});

test.describe('existing report: Lead Tracker', () => {
  const period = (label: string, nl: number, conv: number) => ({ label, from: daysAgo(1), to: NOW_ISO, new_leads: nl, converted: conv, conversion_rate: nl ? conv / nl : 0 });
  const TRACKER = {
    monthly: [{ key: '2026-10', count: 20 }, { key: '2026-11', count: 10 }], weekly: [{ key: '2026-W44', count: 5 }], daily: [{ key: '2026-11-09', count: 2 }],
    period_today: period('Today', 3, 1), period_week: period('This week', 12, 3), period_month: period('This month', 30, 6),
    status_breakdown: { new: 5, working: 4, qualified: 3, converted: 6, unqualified: 1, lost: 2 },
    source_breakdown: [{ name: 'Website', count: 12 }, { name: 'Referral', count: 8 }], city_breakdown: [{ name: 'Pune', count: 9 }, { name: 'Mumbai', count: 4 }],
    ageing_distribution: [{ bucket: '0-7d', count: 4 }],
    monthly_detail: [{ key: '2026-10', new_leads: 20, converted: 5, conversion_rate: 0.25 }, { key: '2026-11', new_leads: 10, converted: 1, conversion_rate: 0.1 }],
    previous_today: period('Yesterday (same time)', 2, 0), previous_week: period('Last week (same days)', 15, 5), previous_month: period('Last month (same days)', 30, 7),
    source_detail: [{ name: 'Website', count: 12, converted: 3, conversion_rate: 0.25 }, { name: 'Referral', count: 8, converted: 4, conversion_rate: 0.5 }],
  };

  test('period cards compare with the same point one period earlier; monthly conversion; source conversion', async ({ page }) => {
    await serve(page, { payloads: { 'lead-tracker': TRACKER } });
    await page.goto(`${REPORTS}/lead-tracker`);
    const compare = page.getByTestId('period-compare');
    await expect(compare).toHaveCount(3);
    await expect(compare.nth(0)).toContainText('Yesterday (same time): 2 new, 0 converted');
    await expect(compare.nth(0)).toContainText('New leads +50%');
    await expect(compare.nth(1)).toContainText('New leads -20%');
    await expect(compare.nth(2)).toContainText('New leads 0%');
    const table = page.getByTestId('monthly-detail');
    expect((await cells(table.locator('tbody tr').nth(0)))).toEqual(['Oct 2026', '20', '5', '25.0%']);
    expect((await cells(table.locator('tbody tr').nth(1)))).toEqual(['Nov 2026', '10', '1', '10.0%']);
    await expect(page.getByText('Referral', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('8 · 4 converted (50.0%)')).toBeVisible();
  });

  test('one CSV with every block on the page, including the comparison and source conversion', async ({ page }) => {
    await serve(page, { payloads: { 'lead-tracker': TRACKER } });
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByTestId('monthly-detail')).toBeVisible();
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(['Section', 'Item', 'Leads', 'Converted', 'Conversion %']);
    const row = (section: string, item: string) => csv.find((r) => r[0] === section && r[1] === item)!;
    expect(row('Period summary', 'Yesterday (same time)')).toEqual(['Period summary', 'Yesterday (same time)', '2', '0', '0']);
    expect(row('Monthly', '2026-10')).toEqual(['Monthly', '2026-10', '20', '5', '25']);
    expect(row('Top sources', 'Referral')).toEqual(['Top sources', 'Referral', '8', '4', '50']);
    expect(row('Top cities', 'Pune')).toEqual(['Top cities', 'Pune', '9', '', '']);
    expect(new Set(csv.slice(1).map((r) => r[0]))).toEqual(new Set(['Period summary', 'Monthly', 'Weekly', 'Daily', 'Status mix', 'Open lead ageing', 'Top sources', 'Top cities']));
  });

  test('the Top cities card and the cities in the CSV follow the admin\'s hidden-city setting', async ({ page }) => {
    await serve(page, { payloads: { 'lead-tracker': TRACKER }, settings: settingsWith({ 'lead.city': { hidden: true } }) });
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByText('Top sources')).toBeVisible();
    await expect(page.getByText('Top cities')).toHaveCount(0);
    const csv = await csvOf(page);
    expect(csv.some((r) => r[0] === 'Top cities')).toBe(false);
    expect(csv.some((r) => r[1] === 'Pune')).toBe(false);
  });

  test('a hidden lead source drops the Top sources card and its CSV rows', async ({ page }) => {
    await serve(page, { payloads: { 'lead-tracker': TRACKER }, settings: settingsWith({ 'lead.source_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByText('Top cities')).toBeVisible();
    await expect(page.getByText('Top sources')).toHaveCount(0);
    expect((await csvOf(page)).some((r) => r[0] === 'Top sources')).toBe(false);
  });

  test('the older payload (no comparison blocks) still renders without them', async ({ page }) => {
    const { previous_today, previous_week, previous_month, monthly_detail, source_detail, ...legacy } = TRACKER;
    void previous_today; void previous_week; void previous_month; void monthly_detail; void source_detail;
    await serve(page, { payloads: { 'lead-tracker': legacy } });
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByText('Monthly new-lead volume')).toBeVisible();
    await expect(page.getByTestId('period-compare')).toHaveCount(0);
    await expect(page.getByTestId('monthly-detail')).toHaveCount(0);
    expect((await csvOf(page))[0]).toEqual(['Section', 'Item', 'Leads', 'Converted', 'Conversion %']);
  });

  test('at 390px the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serve(page, { payloads: { 'lead-tracker': TRACKER } });
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByTestId('monthly-detail')).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
  });
});

test.describe('existing report: Win/Loss', () => {
  const REP_ROWS = [
    { bucket: 'Asha', won: 2, lost: 1, rate: 2 / 3, open: 1, won_value: 150000, lost_value: 30000, avg_won_deal: 75000, value_win_rate: 150000 / 180000 },
    { bucket: 'Ravi', won: 0, lost: 1, rate: 0, open: 0, won_value: 0, lost_value: 20000, avg_won_deal: 0, value_win_rate: 0 },
  ];

  test('shows the value behind every rate, a total row with recomputed rates, and a CSV that matches', async ({ page }) => {
    await serve(page, { payloads: { 'win-rate': REP_ROWS } });
    await page.goto(`${REPORTS}/win-loss`);
    const table = page.getByTestId('winloss-table');
    expect(await headers(page, '[data-testid="winloss-table"]')).toEqual(['Rep', 'Won', 'Lost', 'Win rate %', 'Open deals', 'Won value (INR)', 'Lost value (INR)', 'Avg won deal (INR)', 'Win rate by value %']);
    expect(await cells(table.locator('tbody tr').first())).toEqual(['Asha', '2', '1', '66.7%', '1', '₹1.5L', '₹30K', '₹75K', '83.3%']);
    // total: 2 won / (2 + 2 lost) = 50%, value 150000 / (150000 + 50000) = 75%: recomputed from sums, not averaged
    expect(await cells(page.getByTestId('winloss-totals'))).toEqual(['Total', '2', '2', '50%', '1', '₹1.5L', '₹50K', '₹75K', '75%']);
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(['Rep', 'Won', 'Lost', 'Win rate %', 'Open deals', 'Won value (INR)', 'Lost value (INR)', 'Avg won deal (INR)', 'Win rate by value %']);
    expect(csvRow(csv, 'Asha')).toMatchObject({ 'Win rate %': '66.7', 'Won value (INR)': '150000', 'Win rate by value %': '83.3' });
    expect(csvRow(csv, 'Total')).toMatchObject({ 'Win rate %': '50', 'Lost value (INR)': '50000', 'Win rate by value %': '75' });
  });

  test('by source shows lead volume and offers no source option when the admin hides it', async ({ page }) => {
    await serve(page, { payloads: { 'win-rate': (u: URL) => (u.searchParams.get('by') === 'source' ? [{ bucket: 'Website', won: 5, lost: 15, rate: 0.25, total: 20 }] : REP_ROWS) } });
    await page.goto(`${REPORTS}/win-loss`);
    await expect(page.getByTestId('winloss-table')).toBeVisible();
    await page.getByLabel('Group by').selectOption('source');
    await expect.poll(async () => await headers(page, '[data-testid="winloss-table"]')).toEqual(['Source', 'Won', 'Lost', 'Win rate %', 'Leads']);
    expect(await cells(page.getByTestId('winloss-totals'))).toEqual(['Total', '5', '15', '25%', '20']);

    const hidden = await freshPage(page);
    await serve(hidden, { payloads: { 'win-rate': REP_ROWS }, settings: settingsWith({ 'lead.source_id': { hidden: true } }) });
    await hidden.goto(`${REPORTS}/win-loss`);
    await expect(hidden.getByTestId('winloss-table')).toBeVisible();
    await expect(hidden.getByLabel('Group by').locator('option')).toHaveText(['By Rep', 'By Stage']);   // retries until the settings have loaded
  });

  test('older data without value columns shows only the counts', async ({ page }) => {
    await serve(page, { payloads: { 'win-rate': [{ bucket: 'Asha', won: 2, lost: 1, rate: 2 / 3 }] } });
    await page.goto(`${REPORTS}/win-loss`);
    expect(await headers(page, '[data-testid="winloss-table"]')).toEqual(['Rep', 'Won', 'Lost', 'Win rate %']);
  });
});

test.describe('existing report: Forecast', () => {
  const FC = [
    { period: '2026-11', committed: 60000, best_case: 150000, pipeline: 150000, closed: 80000, open_deals: 2, won_deals: 1, avg_probability: 35, expected_total: 140000 },
    { period: '2026-12', committed: 20000, best_case: 200000, pipeline: 200000, closed: 0, open_deals: 1, won_deals: 0, avg_probability: 10, expected_total: 20000 },
  ];
  test('a table under the chart with the counts, probability and expected total, and a CSV that matches', async ({ page }) => {
    await serve(page, { payloads: { forecast: FC } });
    await page.goto(`${REPORTS}/forecast`);
    expect(await headers(page)).toEqual(['Period', 'Closed won (INR)', 'Committed (INR)', 'Expected total (INR)', 'Open pipeline (INR)', 'Best case (INR)', 'Open deals', 'Won deals', 'Avg probability %']);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['2026-11', '₹80K', '₹60K', '₹1.4L', '₹1.5L', '₹1.5L', '2', '1', '35%']);
    // total: probability averaged over open deals: (35 x 2 + 10 x 1) / 3 = 26.7
    expect(await cells(page.getByTestId('plus-totals'))).toEqual(['Total', '₹80K', '₹80K', '₹1.6L', '₹3.5L', '₹3.5L', '3', '1', '26.7%']);
    const csv = await csvOf(page);
    expect(csvRow(csv, '2026-11')).toMatchObject({ 'Closed won (INR)': '80000', 'Expected total (INR)': '140000', 'Avg probability %': '35' });
    expect(csv.at(-1)![0]).toBe('Total');
  });
  test('an older response (no counts) still renders and exports', async ({ page }) => {
    await serve(page, { payloads: { forecast: [{ period: '2026-11', committed: 60000, best_case: 150000, pipeline: 150000, closed: 80000 }] } });
    await page.goto(`${REPORTS}/forecast`);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['2026-11', '₹80K', '₹60K', '₹1.4L', '₹1.5L', '₹1.5L', '—', '—', '—']);
    await csvOf(page);
  });
  test('no deals in range is a plain message', async ({ page }) => {
    await serve(page, { payloads: { forecast: [] } });
    await page.goto(`${REPORTS}/forecast`);
    await expect(page.getByText('No deals with an expected close date in this range.')).toBeVisible();
  });
});

test.describe('existing report: Sales Cycle', () => {
  const SC = [
    { month: '2026-10', avg_days: 20, deals: 3, median_days: 20, fastest_days: 10, slowest_days: 30 },
    { month: '2026-11', avg_days: 5, deals: 1, median_days: 5, fastest_days: 5, slowest_days: 5 },
  ];
  test('the chart axis shows the month (it was blank), and a table adds deal count, median, fastest and slowest', async ({ page }) => {
    await serve(page, { payloads: { 'sales-cycle': SC } });
    await page.goto(`${REPORTS}/sales-cycle`);
    await expect(page.locator('.recharts-xAxis').getByText('Oct 2026')).toBeVisible();
    expect(await headers(page)).toEqual(['Month closed', 'Deals won', 'Avg days to close', 'Median days to close', 'Fastest (days)', 'Slowest (days)']);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Oct 2026', '3', '20 d', '20 d', '10 d', '30 d']);
    // all-months average weighted by deals: (20 x 3 + 5 x 1) / 4 = 16.25 -> 16.3
    expect(await cells(page.getByTestId('plus-totals'))).toEqual(['All months', '4', '16.3 d', '—', '5 d', '30 d']);
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(['Month closed', 'Deals won', 'Avg days to close', 'Median days to close', 'Fastest (days)', 'Slowest (days)']);
    expect(csvRow(csv, '2026-10')).toMatchObject({ 'Deals won': '3', 'Avg days to close': '20', 'Slowest (days)': '30' });
  });
  test('an older response (month + avg_days only) still renders', async ({ page }) => {
    await serve(page, { payloads: { 'sales-cycle': [{ month: '2026-10', avg_days: 20 }] } });
    await page.goto(`${REPORTS}/sales-cycle`);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Oct 2026', '—', '20 d', '—', '—', '—']);
  });
});

test.describe('existing report: Lead Source ROI', () => {
  const ROI = [
    { source: 'Website', leads: 3, deals: 1, revenue: 50000, cost: 300, roi: 165.67, qualified: 2, lead_to_deal_pct: 33.3, avg_deal_value: 50000, revenue_per_lead: 16667, cost_per_lead: 100, cost_per_deal: 300, revenue_share_pct: 100 },
    { source: 'Referral', leads: 1, deals: 0, revenue: 0, cost: 0, roi: 0, qualified: 0, lead_to_deal_pct: 0, avg_deal_value: null, revenue_per_lead: 0, cost_per_lead: 0, cost_per_deal: null, revenue_share_pct: 0 },
  ];
  test('adds the funnel and unit-economics columns, a total row recomputed from sums, and a CSV that matches', async ({ page }) => {
    await serve(page, { payloads: { 'lead-source-roi': ROI } });
    await page.goto(`${REPORTS}/lead-source-roi`);
    const cols = ['Source', 'Leads', 'Qualified', 'Deals won', 'Lead to deal %', 'Revenue (INR)', 'Revenue share %', 'Avg deal value (INR)', 'Revenue per lead (INR)', 'Cost per lead (INR)', 'Cost (INR)', 'Cost per deal (INR)', 'ROI %'];
    expect(await headers(page)).toEqual(cols);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Website', '3', '2', '1', '33.3%', '₹50K', '100%', '₹50K', '₹16.7K', '₹100', '₹300', '₹300', '16567%']);
    // total: 4 leads, 1 deal -> 25%; cost per lead 300 / 4 = 75
    expect(await cells(page.getByTestId('plus-totals'))).toEqual(['All sources', '4', '2', '1', '25%', '₹50K', '100%', '₹50K', '₹12.5K', '₹75', '₹300', '₹300', '16567%']);
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(cols);
    expect(csvRow(csv, 'Website')).toMatchObject({ 'Revenue (INR)': '50000', 'Lead to deal %': '33.3', 'Cost per deal (INR)': '300', 'ROI %': '16567' });
    expect(csvRow(csv, 'Referral')).toMatchObject({ 'Cost per deal (INR)': '' });
  });
  test('the older response (source / leads / deals / revenue / cost / roi) still renders with those columns only', async ({ page }) => {
    await serve(page, { payloads: { 'lead-source-roi': ROI.map(({ source, leads, deals, revenue, cost, roi }) => ({ source, leads, deals, revenue, cost, roi })) } });
    await page.goto(`${REPORTS}/lead-source-roi`);
    expect(await headers(page)).toEqual(['Source', 'Leads', 'Deals won', 'Revenue (INR)', 'Cost (INR)', 'ROI %']);
  });
  test('is withheld while the admin hides the lead source field', async ({ page }) => {
    await serve(page, { payloads: { 'lead-source-roi': ROI }, settings: settingsWith({ 'lead.source_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/lead-source-roi`);
    await expect(page.getByText(/Hidden: an admin turned off the Source field/)).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });
});

// ── client-side reports (they read the deal / lead / user lists) ─────────────────────────────────────────────────────
const USERS = [{ id: 'u1', name: 'Asha' }, { id: 'u2', name: 'Ravi' }];
function lists(opts: { deals?: unknown[]; leads?: unknown[]; stages?: unknown[]; pipelines?: unknown[] }) {
  return async (route: import('@playwright/test').Route, u: URL, method: string) => {
    if (method !== 'GET') return false;
    if (u.pathname === '/api/v1/users') { await ok(route, USERS); return true; }
    if (u.pathname === '/api/v1/crm/deals') { await ok(route, opts.deals ?? [], { pagination: { total: (opts.deals ?? []).length, page: 1, limit: 1000 } }); return true; }
    if (u.pathname === '/api/v1/crm/leads') { await ok(route, opts.leads ?? [], { pagination: { total: (opts.leads ?? []).length, page: 1, limit: 1000 } }); return true; }
    if (u.pathname === '/api/v1/crm/pipelines') { await ok(route, opts.pipelines ?? []); return true; }
    if (u.pathname === '/api/v1/crm/stages') { await ok(route, opts.stages ?? []); return true; }
    return false;
  };
}

test.describe('existing report: Rep Leaderboard', () => {
  const deals = [
    { id: 'd1', owner_id: 'u1', status: 'won', amount: 100000, created_at: daysAgo(30), actual_close_date: ymdAgo(20), expected_close_date: ymdAgo(20) },
    { id: 'd2', owner_id: 'u1', status: 'won', amount: 50000, created_at: daysAgo(40), actual_close_date: ymdAgo(10), expected_close_date: ymdAgo(10) },
    { id: 'd3', owner_id: 'u1', status: 'lost', amount: 30000, created_at: daysAgo(20) },
    { id: 'd4', owner_id: 'u1', status: 'open', amount: 70000, created_at: daysAgo(10), expected_close_date: ymdAgo(5) },     // past its close date
    { id: 'd5', owner_id: 'u1', status: 'open', amount: 20000, created_at: daysAgo(30), expected_close_date: ymdAgo(-30) },   // in the future
    { id: 'd6', owner_id: 'u2', status: 'lost', amount: 20000, created_at: daysAgo(10) },
  ];
  test('adds largest won, lost value, win rate by value, open value, average open age and past-close-date', async ({ page }) => {
    await serve(page, { extra: lists({ deals }) });
    await page.goto(`${REPORTS}/rep-leaderboard`);
    expect(await headers(page)).toEqual(['#', 'Rep', 'Won', 'Lost', 'Open', 'Win Rate', 'Revenue', 'Avg Deal', 'Avg Cycle', 'Largest Won', 'Lost Value', 'Win Rate by Value', 'Open Value', 'Avg Open Age', 'Past Close Date']);
    const row = await cells(page.locator('tbody tr').first());
    expect(row.slice(1, 8)).toEqual(['Asha', '2', '1', '2', '66.7%', '₹1.50L', '₹75.0K']);
    expect(row[9]).toBe('₹1.00L');         // largest won
    expect(row[10]).toBe('₹30.0K');        // lost value
    expect(row[11]).toBe('83.3%');         // 150000 / (150000 + 30000)
    expect(row[12]).toBe('₹90.0K');        // open value
    expect(row[13]).toMatch(/^20d$/);      // (10 + 30) / 2 days
    expect(row[14]).toBe('1');
    await expect(page.getByText('Open Pipeline Value')).toBeVisible();
    await expect(page.getByText('Win Rate by Value').first()).toBeVisible();
  });
  test('the CSV carries the new columns too', async ({ page }) => {
    await serve(page, { extra: lists({ deals }) });
    await page.goto(`${REPORTS}/rep-leaderboard`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const csv = await csvOf(page);
    for (const h of ['lost_value', 'open_value', 'largest_won', 'win_rate_by_value', 'avg_open_age_days', 'past_close_date']) expect(csv[0]).toContain(h);
    expect(csvRow(csv, 'u1')).toMatchObject({ lost_value: '30000', open_value: '90000', largest_won: '100000', past_close_date: '1' });
  });
  test('says so when only the first 1,000 deals are loaded', async ({ page }) => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `x${i}`, owner_id: 'u1', status: 'open', amount: 1, created_at: daysAgo(1) }));
    await serve(page, { extra: lists({ deals: many }) });
    await page.goto(`${REPORTS}/rep-leaderboard`);
    await expect(page.getByText(/Showing the first 1,000 deals only/)).toBeVisible();
  });
});

test.describe('existing report: Stage Funnel', () => {
  const stages = [
    { id: 's1', name: 'Lead', position: 0, stage_type: 'open', probability: 10 },
    { id: 's2', name: 'Proposal', position: 1, stage_type: 'open', probability: 50 },
    { id: 's3', name: 'Won', position: 2, stage_type: 'won', probability: 100 },
  ];
  const deals = [
    { id: 'd1', stage_id: 's1', amount: 100000, probability: 0, created_at: daysAgo(10) },    // stage probability 10 -> 10000
    { id: 'd2', stage_id: 's1', amount: 50000, probability: 20, created_at: daysAgo(20) },    // own 20 -> 10000
    { id: 'd3', stage_id: 's2', amount: 200000, probability: 60, created_at: daysAgo(30) },   // 120000
    { id: 'd4', stage_id: 's3', amount: 30000, probability: 100, created_at: daysAgo(5) },
  ];
  test('adds share of deals, average deal, weighted value (open stages) and average age', async ({ page }) => {
    await serve(page, { extra: lists({ deals, stages, pipelines: [{ id: 'p1', name: 'Sales', is_default: true }] }) });
    await page.goto(`${REPORTS}/stage-funnel`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect((await headers(page)).slice(-4)).toEqual(['Share of Deals', 'Avg Deal', 'Weighted Value', 'Avg Age']);
    const lead = await cells(page.locator('tbody tr').nth(0));
    expect(lead.slice(0, 3)).toEqual(['Lead', 'OPEN', '2']);
    expect(lead.slice(-4)).toEqual(['50.0%', '₹75.0K', '₹20.0K', '15d']);
    const won = await cells(page.locator('tbody tr').nth(2));
    expect(won.slice(-4)).toEqual(['25.0%', '₹30.0K', '—', '5d']);
    const csv = await csvOf(page);
    for (const h of ['share_of_deals_pct', 'avg_deal_size', 'weighted_value', 'avg_age_days']) expect(csv[0]).toContain(h);
  });
});

test.describe('existing report: Stuck Deals', () => {
  const deals = [{
    id: 'd1', name: 'Big deal', owner_id: 'u1', status: 'open', stage_name: 'Proposal', amount: 100000, probability: 40,
    stage_changed_at: daysAgo(20), created_at: daysAgo(60), expected_close_date: ymdAgo(3), next_action_at: ymdAgo(-2),
  }];
  test('adds probability, weighted value, expected close, next action and deal age, with the KPIs', async ({ page }) => {
    await serve(page, { extra: lists({ deals }) });
    await page.goto(`${REPORTS}/stuck-deals`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect((await headers(page)).slice(4)).toEqual(['Days Stuck', 'Probability', 'Weighted', 'Expected Close', 'Next Action', 'Deal Age']);
    const row = await cells(page.locator('tbody tr').first());
    expect(row.slice(5, 9)).toEqual(['40%', '₹40.0K', ymdAgo(3), ymdAgo(-2)]);
    expect(row[9]).toBe('60d');
    await expect(page.getByText('Weighted value')).toBeVisible();
    await expect(page.getByText('Past expected close')).toBeVisible();
    const csv = await csvOf(page);
    for (const h of ['probability', 'weighted_value', 'expected_close_date', 'past_expected_close', 'deal_age_days', 'next_action_at']) expect(csv[0]).toContain(h);
    expect(csvRow(csv, 'd1')).toMatchObject({ name: 'Big deal', probability: '40', weighted_value: '40000', past_expected_close: 'true' });
  });
});

test.describe('existing report: Lead Aging', () => {
  const leads = [
    { id: 'l1', first_name: 'Anil', last_name: 'K', owner_id: 'u1', status: 'working', score: 55, stage_changed_at: daysAgo(10), created_at: daysAgo(40), last_activity_at: daysAgo(3), source_name: 'Website' },
    { id: 'l2', first_name: 'Beena', last_name: 'S', owner_id: 'u2', status: 'new', score: 0, stage_changed_at: daysAgo(12), created_at: daysAgo(12), last_activity_at: null, source_name: 'Referral' },
  ];
  test('adds last touch, created date and the source, with Never touched and Avg days old KPIs', async ({ page }) => {
    await serve(page, { extra: lists({ leads }) });
    await page.goto(`${REPORTS}/lead-aging`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect((await headers(page)).slice(4)).toEqual(['Days Old', 'Last Touch', 'Created', 'Source']);
    // default order is oldest first: Beena (12 days in her stage) before Anil (10)
    const rows = (await page.locator('tbody tr').all());
    const beena = await cells(rows[0]);
    expect(beena.slice(0, 2)).toEqual(['Beena S', 'Ravi']);
    expect(beena[5]).toBe('Never');
    expect(beena[7]).toBe('Referral');
    const anil = await cells(rows[1]);
    expect(anil.slice(0, 2)).toEqual(['Anil K', 'Asha']);
    expect(anil[5]).toBe('3d ago');
    expect(anil[6]).toBe(ymdAgo(40));
    expect(anil[7]).toBe('Website');
    await expect(page.getByText('Never touched')).toBeVisible();
    const csv = await csvOf(page);
    for (const h of ['days_since_touch', 'never_touched', 'created_on', 'source']) expect(csv[0]).toContain(h);
  });
  test('the Source column (and its CSV column) follow the admin\'s hidden-source setting', async ({ page }) => {
    await serve(page, { extra: lists({ leads }), settings: settingsWith({ 'lead.source_id': { hidden: true } }) });
    await page.goto(`${REPORTS}/lead-aging`);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect(await headers(page)).not.toContain('Source');
    expect((await csvOf(page))[0]).not.toContain('source');
  });
});

test.describe('existing report: Team Daily Activity', () => {
  const card = (o: Record<string, unknown>) => ({
    user_id: 'u1', name: 'Asha', last_activity_at: daysAgo(0), status: 'active',
    last_known_location: { captured_at: daysAgo(0), source: 'lead_created', latitude: 18.5, longitude: 73.8, address: '12 MG Road, Pune' },
    activities_today: { total: 5, completed: 3, calls: 2, emails: 1, meetings: 1, site_visits: 0, tasks: 0, other: 1 },
    leads_today: 2, leads_today_qualified: 1, leads_today_converted: 0, deals_open_count: 3, deals_won_today_count: 0, deals_won_today_value: 0, pipeline_value: 300000, ...o,
  });
  const CARDS = [card({ open_followups_due_that_day: 1, open_followups_overdue: 2 }), card({ user_id: 'u2', name: 'Ravi', open_followups_due_that_day: 0, open_followups_overdue: 1 })];

  test('shows open follow-ups per rep and in the KPIs, an Other row, and a CSV of every figure', async ({ page }) => {
    await serve(page, { payloads: { 'team-daily': CARDS } });
    await page.goto(`${REPORTS}/team-daily`);
    await expect(page.getByText('ASHA')).toBeVisible();
    await expect(page.getByText('1 due that day').first()).toBeVisible();
    await expect(page.getByText('2 overdue').first()).toBeVisible();
    await expect(page.getByText('Follow-ups overdue')).toBeVisible();
    await expect(page.getByText('Other', { exact: true }).first()).toBeVisible();
    const csv = await csvOf(page);
    expect(csv[0]).toEqual(['Rep', 'Status', 'Last activity', 'Activities total', 'Activities completed', 'Calls', 'Emails', 'Meetings', 'Site visits', 'Tasks', 'Other', 'Leads today',
      'Leads qualified', 'Leads converted', 'Open deals', 'Pipeline value (INR)', 'Deals won', 'Won value (INR)', 'Follow-ups open that day', 'Follow-ups overdue', 'Last known location']);
    expect(csvRow(csv, 'Asha')).toMatchObject({ 'Activities total': '5', 'Follow-ups overdue': '2', 'Last known location': '12 MG Road, Pune' });
  });

  test('the address text (and its CSV column) are left out while the admin hides City', async ({ page }) => {
    await serve(page, { payloads: { 'team-daily': CARDS }, settings: settingsWith({ 'lead.city': { hidden: true } }) });
    await page.goto(`${REPORTS}/team-daily`);
    await expect(page.getByText('ASHA')).toBeVisible();
    await expect(page.getByText('12 MG Road, Pune')).toHaveCount(0);
    expect((await csvOf(page))[0]).not.toContain('Last known location');
  });

  test('an older response without follow-ups renders without those rows', async ({ page }) => {
    await serve(page, { payloads: { 'team-daily': [card({})] } });
    await page.goto(`${REPORTS}/team-daily`);
    await expect(page.getByText('ASHA')).toBeVisible();
    await expect(page.getByText('Follow-ups overdue')).toHaveCount(0);
    await expect(page.getByText(/due that day/)).toHaveCount(0);
  });

  test('at 390px the cards do not make the page scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serve(page, { payloads: { 'team-daily': CARDS } });
    await page.goto(`${REPORTS}/team-daily`);
    await expect(page.getByText('ASHA')).toBeVisible();
    expect(await pageScrollsSideways(page)).toBe(false);
  });
});

test.describe('existing report: Activity Heatmap', () => {
  test('adds a by-weekday table with its own CSV (the grid CSV is unchanged)', async ({ page }) => {
    // 2026-11-09 Monday, 2026-11-10 Tuesday
    const grid = [
      { date: '2026-11-09', hour: 9, count: 4 }, { date: '2026-11-09', hour: 10, count: 6 },
      { date: '2026-11-10', hour: 9, count: 2 }, { date: '2026-11-10', hour: 10, count: 0 },
    ];
    await serve(page, { payloads: { 'activity-heatmap': grid } });
    await page.goto(`${REPORTS}/activity-heatmap`);
    await expect(page.getByText('By weekday')).toBeVisible();
    expect(await headers(page, '[data-testid="plus-table-scroll"]')).toEqual(['Weekday', 'Activities', 'Share of activities %', 'Days in window', 'Avg activities per day', 'Busiest hour (UTC)']);
    expect(await cells(page.getByTestId('plus-row').first())).toEqual(['Monday', '10', '83.3%', '1', '10', '10:00']);
    const weekday = await csvOf(page, 'Download weekday CSV');
    expect(weekday[0]).toEqual(['Weekday', 'Activities', 'Share of activities %', 'Days in window', 'Avg activities per day', 'Busiest hour (UTC)']);
    expect(csvRow(weekday, 'Monday')).toMatchObject({ Activities: '10', 'Share of activities %': '83.3' });
    const raw = await csvOf(page, 'Download CSV');
    expect(raw[0]).toEqual(['date', 'hour', 'count']);
    expect(raw).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Demo tenant (client-side mocks, no backend): every new report and widget has data
// ═══════════════════════════════════════════════════════════════════════════
test.describe('demo tenant', () => {
  for (const sp of SPECS) {
    test(`${sp.title} renders demo rows and its CSV downloads`, async ({ page }) => {
      await demoLogin(page);
      await page.goto(`${REPORTS}/${sp.slug}`);
      await expect(page.getByTestId('plus-row').first()).toBeVisible({ timeout: 30_000 });
      expect(await page.getByTestId('plus-row').count()).toBeGreaterThan(1);
      await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);   // no error banner (the page has one empty route-announcer alert, so not getByRole('alert'))
      expect((await headers(page)).length).toBeGreaterThanOrEqual(3);
      const csv = await csvOf(page);
      expect(csv.length).toBeGreaterThan(2);
    });
  }

  test('Team Performance shows demo values (not dashes) in the new columns, and rates on a 0-100 scale', async ({ page }) => {
    await demoLogin(page);
    await page.goto(`${REPORTS}/team-performance`);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
    // the second header row holds the column labels; the Rep column spans both rows, so a label's cell is one to the right
    const labels = await headers(page, 'thead tr:nth-child(2)');
    const col = (label: string) => { const i = labels.indexOf(label); expect(i, label).toBeGreaterThan(-1); return i + 1; };
    expect(col('Overdue Follow-ups')).toBeGreaterThan(20);
    const first = await cells(page.locator('tbody tr').nth(1)); // row 0 is the pinned total
    expect(first[col('Overdue Follow-ups')]).not.toBe('—');
    expect(first[col('Conversion')]).toMatch(/^\d{1,3}(\.\d)?%$/);
  });

  test('Lead Tracker, Win/Loss, Forecast, Sales Cycle and Lead Source ROI show their new columns for the demo tenant', async ({ page }) => {
    await demoLogin(page);
    await page.goto(`${REPORTS}/lead-tracker`);
    await expect(page.getByTestId('period-compare').first()).toBeVisible({ timeout: 30_000 });
    await page.goto(`${REPORTS}/win-loss`);
    await expect(page.getByTestId('winloss-table')).toBeVisible({ timeout: 30_000 });
    expect(await headers(page, '[data-testid="winloss-table"]')).toContain('Won value (INR)');
    await page.goto(`${REPORTS}/forecast`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible({ timeout: 30_000 });
    expect(await headers(page)).toContain('Expected total (INR)');
    await page.goto(`${REPORTS}/sales-cycle`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible({ timeout: 30_000 });
    expect(await headers(page)).toContain('Median days to close');
    await page.goto(`${REPORTS}/lead-source-roi`);
    await expect(page.getByTestId('plus-row').first()).toBeVisible({ timeout: 30_000 });
    expect(await headers(page)).toContain('Lead to deal %');
  });

  test('Lead Analytics: a new widget can be added for the demo tenant and renders', async ({ page }) => {
    await demoLogin(page);
    await page.goto('/dashboard/crm/leads/analytics');
    await page.getByRole('button', { name: 'Add widget' }).first().click();
    await page.getByText('Weighted Pipeline', { exact: true }).click();
    const tile = page.locator('[data-widget-type="weighted_pipeline"]');
    await expect(tile.locator('.recharts-surface').first()).toBeVisible({ timeout: 30_000 });
  });
});
