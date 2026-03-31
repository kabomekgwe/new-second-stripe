import { test, expect } from '@playwright/test';

test.describe('Payment Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Register and login before each payment test
    const email = `payment-${Date.now()}@example.com`;
    
    await page.goto('/auth/register');
    await page.fill('input[name="name"]', 'Payment Test');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
    await page.selectOption('select[name="country"]', 'US');
    await page.selectOption('select[name="currency"]', 'USD');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test.describe('Add Payment Method', () => {
    test('should allow adding a new card', async ({ page }) => {
      await page.goto('/payment-methods');
      await page.click('text=Add Payment Method');
      
      // Wait for Stripe Elements to load
      await page.waitForSelector('[data-testid="card-element"]');
      
      // Fill Stripe test card
      // Note: In real tests, you need to use Stripe test card numbers
      // 4242 4242 4242 4242 is the standard test Visa
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
        .locator('input[name="cardnumber"]')
        .fill('4242424242424242');
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').nth(1)
        .locator('input[name="exp-date"]')
        .fill('12/25');
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').nth(2)
        .locator('input[name="cvc"]')
        .fill('123');
      
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Card added successfully')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=Visa ending in 4242')).toBeVisible();
    });

    test('should reject invalid card', async ({ page }) => {
      await page.goto('/payment-methods');
      await page.click('text=Add Payment Method');
      
      await page.waitForSelector('[data-testid="card-element"]');
      
      // Use Stripe's test card that declines
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
        .locator('input[name="cardnumber"]')
        .fill('4000000000000002');
      
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Your card was declined')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Make Payment', () => {
    test('should complete a payment', async ({ page }) => {
      // Add payment method first
      await page.goto('/payment-methods');
      await page.click('text=Add Payment Method');
      
      await page.waitForSelector('[data-testid="card-element"]');
      
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').first()
        .locator('input[name="cardnumber"]')
        .fill('4242424242424242');
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').nth(1)
        .locator('input[name="exp-date"]')
        .fill('12/25');
      await page.frameLocator('iframe[name^="__privateStripeFrame"]').nth(2)
        .locator('input[name="cvc"]')
        .fill('123');
      
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      
      // Go to payments
      await page.goto('/payments');
      await page.fill('input[name="amount"]', '1000'); // $10.00
      await page.selectOption('select[name="currency"]', 'USD');
      
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Payment successful')).toBeVisible({ timeout: 15000 });
    });

    test('should show payment history', async ({ page }) => {
      await page.goto('/payments/history');
      
      await expect(page.locator('text=Payment History')).toBeVisible();
      await expect(page.locator('table')).toBeVisible();
      
      // Check that table has expected columns
      await expect(page.locator('th:has-text("Date")')).toBeVisible();
      await expect(page.locator('th:has-text("Amount")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });
  });

  test.describe('Billing Dashboard', () => {
    test('should display billing information', async ({ page }) => {
      await page.goto('/billing');
      
      await expect(page.locator('text=Billing')).toBeVisible();
      await expect(page.locator('text=Subscription')).toBeVisible();
    });

    test('should show usage charges', async ({ page }) => {
      await page.goto('/billing/usage');
      
      await expect(page.locator('text=Usage Charges')).toBeVisible();
    });
  });
});
