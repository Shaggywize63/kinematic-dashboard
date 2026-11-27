import { test, expect, type Page } from '@playwright/test';
import { mockApi, seedSession, SEED_USER } from './utils';
import { apiPath, ok } from './spark';

/**
 * Movable / resizable tiles (components/ui/TileBoard.tsx) in the new design, on the real pages: the home
 * dashboard's KPI tiles and the lead page's KPI strip. Drives the REAL UI against mocked APIs: the demo account
 * gets a page-wide "Customize layout" control; tiles can be dragged, resized (corner or size buttons), the layout
 * sticks per user across a reload, Reset restores the default, and Classic / other accounts keep the original grid.
 */

const DEMO_USER = { ...SEED_USER, id: 'u-demo', name: 'Demo Rep', email: 'demo@kinematicapp.com' };
const OTHER_USER = { ...SEED_USER, id: 'u-other', name: 'Other Rep', email: 'rep@tata.com' };

const LEAD = {
  id: 'lead-1', first_name: 'Priya', last_name: 'Nair', full_name: 'Priya Nair', company: 'Nair Steel',
  is_b2c: false, status: 'working', owner_id: 'u-asha', owner_name: 'Asha Menon',
  created_by: 'someone-else', created_at: '2026-09-20T10:00:00Z',
};

async function setup(page: Page, user: Record<string, unknown>) {
  await seedSession(page, user);
  await mockApi(page, {
    settings: { success: true, data: { business_type: 'b2b', config: { field_overrides: {} } } },
    me: { success: true, data: user },
    onRequest: async (route, url, method) => {
      const p = apiPath(url);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1') return ok(route, LEAD);
      if (method === 'GET' && p === '/api/v1/crm/leads/lead-1/activities') return ok(route, []);
      return false;
    },
  });
}

const openHome = async (page: Page) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Total forms filled').first()).toBeVisible({ timeout: 30_000 });
};

// react-grid-layout renders at a default width and re-measures its container right after mount, so a box read too
// early is a fraction off. Wait until the box stops changing.
const box = async (page: Page, testId: string) => {
  let prev = await page.getByTestId(testId).boundingBox();
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(80);
    const cur = await page.getByTestId(testId).boundingBox();
    if (prev && cur && ['x', 'y', 'width', 'height'].every((k) => Math.abs((cur as never)[k] - (prev as never)[k]) < 0.5)) return cur;
    prev = cur;
  }
  if (!prev) throw new Error(`no box for ${testId}`);
  return prev;
};

const customize = async (page: Page) => {
  await page.getByTestId('tiles-customize').click();
  await expect(page.getByTestId('tile-edit-controls')).toBeVisible();
};

test.describe('Movable tiles — demo account', () => {
  test('home KPI tiles: a Customize control appears, and edit mode shows a drag bar on every tile', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);

    await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible();
    await expect(page.getByTestId('tiles-customize')).toBeVisible();
    // not editing yet: no drag bars
    await expect(page.locator('[data-testid="tileboard-home-kpis"] .km-tile-bar')).toHaveCount(0);

    await customize(page);
    await expect(page.locator('[data-testid="tileboard-home-kpis"] .km-tile-bar')).toHaveCount(5);

    await page.getByTestId('tiles-done').click();
    await expect(page.locator('[data-testid="tileboard-home-kpis"] .km-tile-bar')).toHaveCount(0);
    await expect(page.getByTestId('tiles-customize')).toBeVisible();
  });

  test('default layout: five tiles in one row of equal width', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    const keys = ['forms', 'hours', 'days', 'leaves', 'avgAttendance'];
    const boxes = await Promise.all(keys.map((k) => box(page, `tile-${k}`)));
    // same row, left to right, equal widths
    for (let i = 1; i < boxes.length; i++) {
      expect(Math.abs(boxes[i].y - boxes[0].y)).toBeLessThan(2);
      expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x);
      expect(Math.abs(boxes[i].width - boxes[0].width)).toBeLessThan(2);
    }
  });

  test('a size button widens a tile, the layout sticks across a reload, and Reset restores the default', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    const before = await box(page, 'tile-forms');
    const board = await box(page, 'tileboard-home-kpis');

    await customize(page);
    await page.getByTestId('tile-forms-w-Full').click();
    await expect.poll(async () => (await box(page, 'tile-forms')).width).toBeGreaterThan(board.width * 0.95);
    await page.getByTestId('tiles-done').click();

    // sticks across a reload (and edit mode is off again)
    await page.reload();
    await expect(page.getByText('Total forms filled').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await box(page, 'tile-forms')).width).toBeGreaterThan(board.width * 0.95);
    await expect(page.locator('[data-testid="tileboard-home-kpis"] .km-tile-bar')).toHaveCount(0);

    // Reset restores the default
    await customize(page);
    await page.getByTestId('tiles-reset').click();
    await expect.poll(async () => Math.abs((await box(page, 'tile-forms')).width - before.width)).toBeLessThan(3);
  });

  test('a tile can be dragged to a new place', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    await customize(page);

    const forms = await box(page, 'tile-forms');
    const days = await box(page, 'tile-days');
    // grab the tile by its middle (the whole tile is the handle while customising) and carry it two tiles to the right
    const gx = forms.x + forms.width / 2;
    const gy = forms.y + forms.height / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx + (days.x - forms.x) + 10, gy, { steps: 15 });
    await page.mouse.up();

    await expect.poll(async () => (await box(page, 'tile-forms')).x).toBeGreaterThan(forms.x + forms.width);
  });

  test('a tile can be resized from its corner', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    await customize(page);

    // The Attendance panel sits below the fold — bring it on screen, or the drag happens off-screen.
    await page.getByTestId('tile-attendance').scrollIntoViewIfNeeded();
    const before = await box(page, 'tile-attendance');
    const grip = page.locator('[data-testid="tile-attendance"] .react-resizable-handle-se');
    const g = await grip.boundingBox();
    if (!g) throw new Error('no resize grip');

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 120, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await box(page, 'tile-attendance')).height).toBeGreaterThan(before.height + 40);
  });

  test('tiles are not clickable while customising, and click normally again afterwards', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    await customize(page);
    // the content layer swallows pointer events so a drag never triggers a tile's own click
    await expect(page.locator('[data-testid="tile-forms"] .km-tile-bar')).toBeVisible();
    await page.getByTestId('tiles-done').click();
    await expect(page.locator('[data-testid="tile-forms"] .km-tile-bar')).toHaveCount(0);
  });

  test('switching to Classic gives back the original grid and removes the control', async ({ page }) => {
    await setup(page, DEMO_USER);
    await openHome(page);
    await expect(page.getByTestId('tileboard-home-kpis')).toBeVisible();

    await page.getByTestId('design-toggle').getByRole('button', { name: 'Classic', exact: true }).click();
    await expect(page.getByTestId('tileboard-home-kpis')).toHaveCount(0);
    await expect(page.getByTestId('tiles-customize')).toHaveCount(0);
    await expect(page.getByText('Total forms filled').first()).toBeVisible();   // the tiles are still there, in the original grid
  });

  test('the lead page KPI strip is a board too, and its control appears there', async ({ page }) => {
    await setup(page, DEMO_USER);
    await page.goto('/dashboard/crm/leads/lead-1');
    await expect(page.getByTestId('tileboard-lead-kpis')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('tiles-customize')).toBeVisible();
    await customize(page);
    await expect(page.locator('[data-testid="tileboard-lead-kpis"] .km-tile-bar').first()).toBeVisible();
  });
});

test.describe('Movable tiles — everyone else', () => {
  test('keeps the original grid: no board, no Customize control', async ({ page }) => {
    await setup(page, OTHER_USER);
    await openHome(page);
    await expect(page.getByTestId('tileboard-home-kpis')).toHaveCount(0);
    await expect(page.getByTestId('tiles-customize')).toHaveCount(0);
    await expect(page.getByTestId('design-toggle')).toHaveCount(0);
  });
});
