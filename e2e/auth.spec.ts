import { test, expect } from '@playwright/test';
import { DEMO_EMAIL, DEMO_PASSWORD, demoLogin } from './utils';

test.describe('Authentication', () => {
  test('root redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login page renders its form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('you@company.com')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Motion Made/ })).toBeVisible();
  });

  test('submit is disabled until email + password are valid', async ({ page }) => {
    await page.goto('/login');
    const signIn = page.getByRole('button', { name: /Sign In/ });
    // Both fields empty -> disabled.
    await expect(signIn).toBeDisabled();

    // Email only -> still disabled (password empty).
    await page.getByPlaceholder('you@company.com').fill(DEMO_EMAIL);
    await expect(signIn).toBeDisabled();

    // Add a password -> enabled.
    await page.getByPlaceholder('Enter your password').fill(DEMO_PASSWORD);
    await expect(signIn).toBeEnabled();
  });

  test('demo login lands on /dashboard', async ({ page }) => {
    await demoLogin(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    // Sidebar brand proves the authenticated shell mounted.
    await expect(page.getByText('Kinematic').first()).toBeVisible();
  });

  test('unauthenticated dashboard access redirects to /login', async ({ page }) => {
    // No session seeded -> the dashboard layout guard bounces to /login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  });
});
