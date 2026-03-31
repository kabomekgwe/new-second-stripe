import { test, expect, Page } from '@playwright/test';
import Stripe from 'stripe';

// Test credit card numbers from Stripe documentation
const STRIPE_TEST_CARDS = {
  visa: '4242424242424242',
  mastercard: '5555555555554444',
  amex: '378282246310005',
  declined: '4000000000000002',
  require3DS: '4000002500003155',
  insufficientFunds: '4000000000009995',
  expired: '4000000000000069',
};

// Generate unique test user data
const generateTestUser = () => ({
  name: `Test User ${Date.now()}`,
  email: `test-${Date.now()}@example.com`,
  password: 'SecureTest123!',
});

/**
 * Complete User Flow E2E Test
 * Simulates the entire user journey from signup to payment
 */
test.describe('Complete User Flow', () => {
  test.setTimeout(120000); // 2 minutes for full flow

  test('should complete full user journey: signup → signin → payment methods → add card → pay', async ({ page }) => {
    const testUser = generateTestUser();
    
    // ============================================================
    // STEP 1: SIGNUP
    // ============================================================
    await test.step('1. Signup - Create new user account', async () => {
      await page.goto('/auth/register');
      await expect(page).toHaveURL('/auth/register');

      // Wait for form to be fully interactive (React hydration + CSRF token fetch)
      await page.waitForSelector('button[type="submit"]:not([disabled])', { state: 'visible' });

      // Fill registration form
      await page.fill('input[name="name"]', testUser.name);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.selectOption('select[name="country"]', { label: 'United States' });

      // Submit registration - app redirects to login page (not auto-login)
      await page.click('button[type="submit"]');
      // Wait for navigation to login page or dashboard
      await page.waitForURL(/\/auth\/login|^\//, { timeout: 15000 });

      await page.screenshot({ path: 'test-results/01-signup-success.png' });
    });

    // ============================================================
    // STEP 2: SIGNIN - Login with newly created credentials
    // ============================================================
    await test.step('2. Signin - Login with new credentials', async () => {
      // We should be on login page after registration
      await expect(page).toHaveURL(/\/auth\/login/);

      // Sign in with the credentials we just registered
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);

      await page.click('button[type="submit"]');
      // Wait for navigation away from login page
      await page.waitForURL('**/auth/login', { timeout: 15000 }).catch(() => {
        // If we're not on login, we're probably on dashboard - continue
      });
      // Wait for dashboard to load
      await page.waitForSelector('text=Welcome', { timeout: 10000 });

      // Verify logged in - use heading which is more specific
      await expect(page.locator(`h1:has-text("Welcome")`)).toBeVisible();

      await page.screenshot({ path: 'test-results/02-signin-success.png' });
    });

    // ============================================================
    // STEP 3: NAVIGATE TO PAYMENT METHODS
    // ============================================================
    await test.step('3. Go to Payment Methods page', async () => {
      // Navigate to payment methods via navigation or directly
      await page.goto('/payment-methods');
      await page.waitForLoadState('networkidle');
      
      // Verify page loaded - use heading for specificity
      await expect(page.locator('h1:has-text("Payment Methods")')).toBeVisible();
      await expect(page.locator('button:has-text("Add Payment Method"), a:has-text("Add Payment Method")')).toBeVisible();
      
      await page.screenshot({ path: 'test-results/03-payment-methods-page.png' });
    });

    // ============================================================
    // STEP 4: ADD PAYMENT METHOD (Credit Card)
    // ============================================================
    await test.step('4. Add Payment Method - Credit Card', async () => {
      // Click add payment method button
      await page.click('text=Add Payment Method');

      // Wait for Stripe PaymentElement iframe to load
      await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 15000 });

      // Wait for the iframe content to be ready - check for the card input field
      await page.waitForTimeout(3000); // Give Stripe time to fully initialize

      // Access the Stripe iframe content using Playwright's frame locator
      const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

      // Fill card number - use placeholder as primary selector, role as fallback
      // Stripe Elements require typing (not fill) for proper event handling
      const cardInput = stripeFrame.locator('input[placeholder*="1234"]').or(stripeFrame.getByRole('textbox', { name: 'Card number' }));
      await cardInput.waitFor({ state: 'visible', timeout: 10000 });
      await cardInput.click(); // Focus the input first
      await cardInput.type(STRIPE_TEST_CARDS.visa, { delay: 50 }); // Type with delay for Stripe validation
      await page.waitForTimeout(300); // Wait for Stripe to process

      // Fill expiry (MM / YY format) - type slowly for proper formatting
      const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').or(stripeFrame.getByRole('textbox', { name: /Expiration/i }));
      await expiryInput.waitFor({ state: 'visible', timeout: 5000 });
      await expiryInput.click();
      await expiryInput.type('1230', { delay: 50 });
      await page.waitForTimeout(300);

      // Fill CVC
      const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').or(stripeFrame.getByRole('textbox', { name: /Security code|CVC/i }));
      await cvcInput.waitFor({ state: 'visible', timeout: 5000 });
      await cvcInput.click();
      await cvcInput.type('123', { delay: 50 });
      await page.waitForTimeout(300);

      // Select country - use specific label selector to avoid multiple select elements
      const countrySelect = stripeFrame.getByLabel('Country');
      try {
        await countrySelect.waitFor({ state: 'visible', timeout: 5000 });
        await countrySelect.selectOption('US');
        await page.waitForTimeout(500);
      } catch {
        // Country dropdown might not be present or already selected
      }

      // Wait for ZIP field to appear (conditional field after country selection for US)
      const zipInput = stripeFrame.locator('input[placeholder*="12345"]').or(stripeFrame.getByRole('textbox', { name: /ZIP/i }));
      try {
        await zipInput.waitFor({ state: 'visible', timeout: 3000 });
        await zipInput.click();
        await zipInput.fill('10001'); // Valid US ZIP code
        await page.waitForTimeout(300);
      } catch {
        // ZIP field might not appear for all countries
        console.log('ZIP field not visible, continuing...');
      }

      await page.waitForTimeout(500);

      // Take screenshot before submission
      await page.screenshot({ path: 'test-results/04a-card-filled.png' });

      // Click save button
      await page.getByRole('button', { name: 'Save Payment Method' }).click();

      // Wait for success - redirect to payment methods or success message
      try {
        // First try waiting for success message
        await page.locator('text=Payment method added successfully').waitFor({ state: 'visible', timeout: 15000 });
      } catch {
        // If no success message, check if we redirected to payment methods
        try {
          await page.waitForURL('**/payment-methods**', { timeout: 10000 });
        } catch {
          // Take screenshot of current state for debugging
          await page.screenshot({ path: 'test-results/04b-submission-error.png' });
          throw new Error('Payment method submission did not complete successfully');
        }
      }

      await page.screenshot({ path: 'test-results/04-payment-method-added.png' });
    });

    // ============================================================
    // STEP 5: VERIFY ADDED PAYMENT METHOD IS VISIBLE
    // ============================================================
    await test.step('5. See Added Payment Method', async () => {
      // Reload page to verify persistence
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Verify card is listed (Visa ending in 4242)
      await expect(page.locator('text=Visa')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=•••• 4242')).toBeVisible();

      await page.screenshot({ path: 'test-results/05-payment-method-visible.png' });
    });

    // ============================================================
    // STEP 6: MAKE A PAYMENT USING THE SELECTED METHOD
    // ============================================================
    await test.step('6. Pay Using Selected Payment Method', async () => {
      // Navigate to payments page
      await page.goto('/payments/new');
      await page.waitForLoadState('networkidle');
      
      // Verify payment method is pre-selected
      const selectedCard = page.locator('[data-testid="selected-payment-method"], .selected-card');
      if (await selectedCard.isVisible().catch(() => false)) {
        await expect(selectedCard).toContainText('•••• 4242');
      }
      
      // Enter payment amount
      await page.fill('input[name="amount"]', '99.99');
      await page.fill('textarea[name="description"]', 'Test payment via E2E');
      
      // Submit payment
      await Promise.all([
        page.waitForResponse(response => 
          response.url().includes('/payments') && 
          response.status() === 200
        ),
        page.click('button[type="submit"], button:has-text("Pay")'),
      ]);
      
      // Verify payment success
      await expect(page.locator('text=Payment successful')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=$99.99')).toBeVisible();
      
      await page.screenshot({ path: 'test-results/06-payment-success.png' });
    });

    // ============================================================
    // BONUS: VERIFY TRANSACTION IN DASHBOARD
    // ============================================================
    await test.step('7. Verify Transaction in Dashboard', async () => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Look for recent transaction
      await expect(page.locator('text=$99.99')).toBeVisible();
      await expect(page.locator('text=Test payment via E2E')).toBeVisible();
      await expect(page.locator('text=Completed')).toBeVisible();
      
      await page.screenshot({ path: 'test-results/07-dashboard-verification.png' });
    });
  });

  // ============================================================
  // ALTERNATIVE FLOW: Add Multiple Payment Methods
  // ============================================================
  test('should support multiple payment methods', async ({ page }) => {
    const testUser = generateTestUser();
    
    // Register
    await page.goto('/auth/register');
    await page.fill('input[name="name"]', testUser.name);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.selectOption('select[name="country"]', 'US');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(\/|\/dashboard)$/, { timeout: 15000 });
    
    // Navigate to payment methods
    await page.goto('/payment-methods');
    await page.waitForLoadState('networkidle');
    
    // Add first card (Visa)
    await addCard(page, STRIPE_TEST_CARDS.visa, '12/30', '123', '12345');
    await expect(page.locator('text=•••• 4242')).toBeVisible();
    
    // Add second card (Mastercard)
    await addCard(page, STRIPE_TEST_CARDS.mastercard, '11/28', '456', '54321');
    await expect(page.locator('text=•••• 4444')).toBeVisible();
    
    // Add third card (Amex)
    await addCard(page, STRIPE_TEST_CARDS.amex, '10/27', '3456', '98765');
    await expect(page.locator('text=•••• 0005')).toBeVisible();
    
    // Verify all three cards are listed
    const cards = page.locator('.payment-card, [data-testid="payment-method"]');
    await expect(cards).toHaveCount(3);
    
    await page.screenshot({ path: 'test-results/multiple-cards-added.png' });
  });

  // ============================================================
  // ERROR HANDLING FLOW: Declined Card
  // ============================================================
  test('should handle declined payment properly', async ({ page }) => {
    const testUser = generateTestUser();
    
    // Register
    await page.goto('/auth/register');
    await page.fill('input[name="name"]', testUser.name);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.selectOption('select[name="country"]', 'US');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^(\/|\/dashboard)$/, { timeout: 15000 });
    
    // Add declined card
    await page.goto('/payment-methods');
    await page.waitForLoadState('networkidle');
    await addCard(page, STRIPE_TEST_CARDS.declined, '12/30', '123', '12345');
    
    // Try to make payment
    await page.goto('/payments/new');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="amount"]', '50.00');
    await page.click('button[type="submit"]');
    
    // Should see error
    await expect(page.locator('text=declined')).toBeVisible({ timeout: 15000 });
    
    await page.screenshot({ path: 'test-results/declined-payment-error.png' });
  });
});

// Helper function to add a card via Stripe Payment Element
async function addCard(page: Page, cardNumber: string, expiry: string, cvc: string, zip?: string) {
  await page.click('text=Add Payment Method');

  // Wait for Stripe Elements to load
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 15000 });
  await page.waitForTimeout(3000); // Give Stripe time to initialize

  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  // Fill card number - click first, then type with delay for Stripe validation
  const cardInput = stripeFrame.locator('input[placeholder*="1234"]').or(
    stripeFrame.getByRole('textbox', { name: 'Card number' })
  );
  await cardInput.waitFor({ state: 'visible', timeout: 10000 });
  await cardInput.click();
  await cardInput.type(cardNumber, { delay: 50 });
  await page.waitForTimeout(300);

  // Fill expiry (format: MMYY)
  const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').or(
    stripeFrame.getByRole('textbox', { name: /Expiration/i })
  );
  await expiryInput.waitFor({ state: 'visible', timeout: 5000 });
  await expiryInput.click();
  await expiryInput.type(expiry.replace('/', ''), { delay: 50 });
  await page.waitForTimeout(300);

  // Fill CVC
  const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').or(
    stripeFrame.getByRole('textbox', { name: /Security code|CVC/i })
  );
  await cvcInput.waitFor({ state: 'visible', timeout: 5000 });
  await cvcInput.click();
  await cvcInput.type(cvc, { delay: 50 });
  await page.waitForTimeout(300);

  // Select country (US) - needed for ZIP field to appear
  const countrySelect = stripeFrame.locator('select').or(stripeFrame.getByLabel('Country'));
  try {
    await countrySelect.waitFor({ state: 'visible', timeout: 3000 });
    await countrySelect.selectOption('US');
    await page.waitForTimeout(500);
  } catch {
    // Country dropdown might not be present or already selected
  }

  // Fill ZIP code (required for US)
  if (zip) {
    const zipInput = stripeFrame.locator('input[placeholder*="12345"]').or(
      stripeFrame.getByRole('textbox', { name: /ZIP/i })
    );
    try {
      await zipInput.waitFor({ state: 'visible', timeout: 3000 });
      await zipInput.click();
      await zipInput.fill(zip);
      await page.waitForTimeout(300);
    } catch {
      // ZIP field might not appear for all countries
    }
  }

  await page.waitForTimeout(500);

  // Take screenshot before submission for debugging
  await page.screenshot({ path: 'test-results/add-card-before-submit.png' });

  // Click save button
  await page.getByRole('button', { name: 'Save Payment Method' }).click();

  // Wait for success - check for message or URL redirect
  try {
    await page.locator('text=Payment method added successfully').waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    try {
      await page.waitForURL('**/payment-methods**', { timeout: 10000 });
    } catch {
      await page.screenshot({ path: 'test-results/add-card-error.png' });
      throw new Error('Failed to add payment method');
    }
  }
}
