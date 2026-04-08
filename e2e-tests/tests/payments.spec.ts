import { test, expect, Page } from '@playwright/test';

const STRIPE_TEST_CARDS = {
  visa: '4242424242424242',
  declined: '4000000000000002',
};

/** Register a new user and return their email. */
async function registerAndLogin(page: Page): Promise<string> {
  const email = `payment-${Date.now()}@example.com`;

  await page.goto('/auth/register');
  await page.fill('input[name="name"]', 'Payment Test');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'SecurePass123!');
  await page.selectOption('select[name="country"]', 'US');
  await page.click('button[type="submit"]');

  // Registration may redirect to login or dashboard
  await page.waitForURL(/\/auth\/login|\/(dashboard)?$/, { timeout: 15000 });

  // If redirected to login, sign in
  if (page.url().includes('/auth/login')) {
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 10000 });
  }

  return email;
}

/** Fill Stripe PaymentElement fields inside the iframe. */
async function fillStripeCard(page: Page, cardNumber: string) {
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 30000 });

  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  // Wait for card input
  const cardInput = stripeFrame.locator('input[placeholder*="1234"]').or(
    stripeFrame.getByRole('textbox', { name: /card/i }),
  );
  await cardInput.waitFor({ state: 'visible', timeout: 15000 });

  // Type card number character by character (Stripe requires keystroke events)
  await cardInput.click();
  await cardInput.clear();
  for (const char of cardNumber) {
    await cardInput.press(char, { delay: 30 });
  }

  // Fill expiry
  const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').or(
    stripeFrame.getByRole('textbox', { name: /expi/i }),
  );
  await expiryInput.waitFor({ state: 'visible', timeout: 5000 });
  await expiryInput.click();
  await expiryInput.type('1230', { delay: 50 });

  // Fill CVC
  const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').or(
    stripeFrame.getByRole('textbox', { name: /security|cvc/i }),
  );
  await cvcInput.waitFor({ state: 'visible', timeout: 5000 });
  await cvcInput.click();
  await cvcInput.type('123', { delay: 50 });

  // Fill ZIP if visible (US cards require it)
  const zipInput = stripeFrame.locator('input[placeholder*="12345"]').or(
    stripeFrame.getByRole('textbox', { name: /postal|zip/i }),
  );
  try {
    await zipInput.waitFor({ state: 'visible', timeout: 3000 });
    await zipInput.click();
    await zipInput.fill('10001');
  } catch {
    // ZIP may not be required for all payment methods
  }
}

test.describe('Payment Flow E2E Tests', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  test.describe('Add Payment Method', () => {
    test('should allow adding a new card', async ({ page }) => {
      await page.goto('/payment-methods');
      await page.click('text=Add Payment Method');
      await page.waitForURL('**/payment-methods/add', { timeout: 10000 });

      await fillStripeCard(page, STRIPE_TEST_CARDS.visa);

      const saveButton = page.getByRole('button', { name: /save payment method/i });
      await saveButton.click();

      // Wait for success (redirect or success message)
      await expect(async () => {
        const url = page.url();
        const hasSuccess = await page.locator('text=/payment method.*added|added successfully/i').isVisible().catch(() => false);
        const redirected = url.includes('/payment-methods') && !url.includes('/add');
        expect(hasSuccess || redirected).toBe(true);
      }).toPass({ timeout: 15000 });

      // Verify card appears in list
      await page.goto('/payment-methods');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=/4242/')).toBeVisible({ timeout: 10000 });
    });

    test('should reject declined card during setup', async ({ page }) => {
      await page.goto('/payment-methods');
      await page.click('text=Add Payment Method');
      await page.waitForURL('**/payment-methods/add', { timeout: 10000 });

      await fillStripeCard(page, STRIPE_TEST_CARDS.declined);

      const saveButton = page.getByRole('button', { name: /save payment method/i });
      await saveButton.click();

      // Should see error from Stripe
      await expect(page.locator('text=/declined|failed|error/i')).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Billing Dashboard', () => {
    test('should display billing information', async ({ page }) => {
      await page.goto('/billing');
      await expect(page.locator('text=Billing')).toBeVisible();
    });

    test('should show usage charges', async ({ page }) => {
      await page.goto('/billing/usage');
      await expect(page.locator('text=Usage Charges')).toBeVisible();
    });
  });
});
