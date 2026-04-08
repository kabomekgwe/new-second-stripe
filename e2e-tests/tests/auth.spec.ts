import { test, expect } from '@playwright/test';

test.describe('Authentication E2E Tests', () => {
  test.describe('Registration', () => {
    test('should allow new user registration', async ({ page }) => {
      await page.goto('/auth/register');

      const uniqueEmail = `test-${Date.now()}@example.com`;

      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', uniqueEmail);
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.selectOption('select[name="country"]', 'US');

      await page.click('button[type="submit"]');

      await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });
    });

    test('should reject duplicate email', async ({ page }) => {
      const email = `duplicate-${Date.now()}@example.com`;

      // First registration
      await page.goto('/auth/register');
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.selectOption('select[name="country"]', 'US');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });

      // Logout
      await page.click('text=Logout');
      await page.waitForURL('/auth/login');

      // Second registration attempt
      await page.goto('/auth/register');
      await page.fill('input[name="name"]', 'Test User 2');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.selectOption('select[name="country"]', 'US');

      await page.click('button[type="submit"]');

      await expect(page.locator('text=Email already exists')).toBeVisible();
    });

    test('should validate form fields', async ({ page }) => {
      await page.goto('/auth/register');
      await page.click('button[type="submit"]');

      await expect(page.locator('text=Name is required')).toBeVisible();
      await expect(page.locator('text=Invalid email address')).toBeVisible();
      await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
      await expect(page.locator('text=Please select a country')).toBeVisible();
    });
  });

  test.describe('Login', () => {
    test('should allow user login', async ({ page }) => {
      const email = `login-${Date.now()}@example.com`;
      const password = 'SecurePass123!';

      // Register first
      await page.goto('/auth/register');
      await page.fill('input[name="name"]', 'Login Test');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.selectOption('select[name="country"]', 'US');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

      // Logout
      await page.click('text=Logout');
      await page.waitForURL('/auth/login');

      // Login
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10000 });
    });

    test('should reject invalid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await page.fill('input[name="email"]', 'nonexistent@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should persist session across page refreshes', async ({ page }) => {
      const email = `session-${Date.now()}@example.com`;

      // Register and login
      await page.goto('/auth/register');
      await page.fill('input[name="name"]', 'Session Test');
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.selectOption('select[name="country"]', 'US');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });

      // Refresh page
      await page.reload();

      // Should still be logged in
      await expect(page.locator('text=Session Test')).toBeVisible();
    });

    test('should protect protected routes', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL('/auth/login');
      
      await page.goto('/payments');
      await expect(page).toHaveURL('/auth/login');
    });
  });
});
