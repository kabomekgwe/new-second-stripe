import { test, expect, Page } from '@playwright/test';

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

    // Wait for redirect to add payment method page
    await page.waitForURL('**/payment-methods/add', { timeout: 10000 });
    
    // Wait for Stripe PaymentElement iframe to load (use longer timeout)
    await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 30000 });

    // Wait for the Stripe iframe to be ready by checking for content presence
    const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();
    
    // Wait for card input field to be present and visible - this ensures Stripe is ready
    const cardInput = stripeFrame.locator('input[placeholder*="1234"]').or(
      stripeFrame.getByRole('textbox', { name: /card/i })
    );
    
    // Retry loop for Stripe Elements loading
    let cardInputReady = false;
    for (let attempt = 1; attempt <= 5 && !cardInputReady; attempt++) {
      try {
        await cardInput.waitFor({ state: 'visible', timeout: 5000 });
        cardInputReady = true;
      } catch {
        // Retry: Stripe Elements can take time to initialize
        await page.waitForTimeout(1000 * attempt);
      }
    }
    
    if (!cardInputReady) {
      await page.screenshot({ path: 'test-results/04-stripe-iframe-not-ready.png' });
      throw new Error('Stripe Elements iframe did not load properly');
    }

    // Fill card number - Stripe Elements require typing (not fill) for proper event handling
    await cardInput.click();
    await cardInput.clear();
    
    // Type card number with proper delays for Stripe validation
    for (const char of STRIPE_TEST_CARDS.visa) {
      await cardInput.press(char, { delay: 30 });
    }
    
    // Wait for card validation to complete
    await page.waitForTimeout(500);

    // Fill expiry (MM / YY format)
    const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').or(
      stripeFrame.getByRole('textbox', { name: /expi/i })
    );
    await expiryInput.waitFor({ state: 'visible', timeout: 5000 });
    await expiryInput.click();
    await expiryInput.clear();
    await expiryInput.type('1230', { delay: 50 });
    await page.waitForTimeout(500);

    // Fill CVC
    const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').or(
      stripeFrame.getByRole('textbox', { name: /security|cvc/i })
    );
    await cvcInput.waitFor({ state: 'visible', timeout: 5000 });
    await cvcInput.click();
    await cvcInput.clear();
    await cvcInput.type('123', { delay: 50 });
    await page.waitForTimeout(500);

    // Select country (US) - conditional, may already be selected
    const countrySelect = stripeFrame.locator('select').or(stripeFrame.getByLabel(/country/i));
    try {
      await countrySelect.waitFor({ state: 'visible', timeout: 3000 });
      await countrySelect.selectOption({ value: 'US' });
      await page.waitForTimeout(500);
    } catch {
      // Country may be auto-detected or not required
    }

    // Fill ZIP code if field appears (US requires ZIP)
    const zipInput = stripeFrame.locator('input[placeholder*="12345"]').or(
      stripeFrame.getByRole('textbox', { name: /postal|zip/i })
    );
    try {
      await zipInput.waitFor({ state: 'visible', timeout: 3000 });
      await zipInput.click();
      await zipInput.clear();
      await zipInput.fill('10001');
      await page.waitForTimeout(500);
    } catch {
      // ZIP may not be required for all payment methods
    }

    // Take screenshot before submission
    await page.screenshot({ path: 'test-results/04a-card-filled.png' });

    // Click save button
    const saveButton = page.getByRole('button', { name: /save payment method/i });
    await saveButton.click();

    // CRITICAL: Wait for one of three outcomes:
    // 1. Success message appears (inline success)  
    // 2. Redirect to payment methods page
    // 3. Error message appears
    
    let submitSuccess = false;
    let errorMsg = '';
    
    // Poll for completion state - use waitFor for reliability
    try {
      // Wait for success message with short timeout
      await page.waitForSelector('text=/payment method.*added|added successfully/i', { timeout: 15000, state: 'visible' });
      submitSuccess = true;
    } catch {
      // Check if we redirected to payment methods
      const currentUrl = page.url();
      if (currentUrl.includes('/payment-methods') && !currentUrl.includes('/add')) {
        submitSuccess = true;
      } else {
        // Check for error message
        try {
          const errorEl = await page.waitForSelector('text=/failed|error|invalid|declined/i', { timeout: 1000, state: 'visible' });
          if (errorEl) {
            errorMsg = await errorEl.textContent() || 'Payment submission failed';
          }
        } catch {
          // Neither success nor error - timeout
          errorMsg = 'Payment method submission did not complete within 15 seconds';
        }
      }
    }
    
    if (!submitSuccess) {
      await page.screenshot({ path: 'test-results/04b-submission-failed.png' });
      throw new Error(errorMsg || 'Payment method submission failed');
    }

    // Wait for the sync to complete before navigating
    // Check the backend logs for any sync failures
    await page.waitForTimeout(3000);
    
    // Navigate back to payment methods list
    await page.goto('/payment-methods');
    await page.waitForLoadState('networkidle');
    
    // Wait for payment methods list to load  
    await page.waitForSelector('h1:has-text("Payment Methods")', { timeout: 10000 });
    
    // Debug: Check if there's an error message on the page
    const errorVisible = await page.locator('text=/failed|error/i').isVisible().catch(() => false);
    if (errorVisible) {
      const errorText = await page.locator('text=/failed|error/i').textContent().catch(() => 'Unknown error');
      await page.screenshot({ path: 'test-results/04c-sync-error.png' });
    }
    
    await page.screenshot({ path: 'test-results/04-payment-method-added.png' });
  });

  // ============================================================
  // STEP 5: VERIFY ADDED PAYMENT METHOD IS VISIBLE
  // ============================================================
  await test.step('5. See Added Payment Method', async () => {
    // Check the page content
    const pageContent = await page.content();
    
    // Verify card is listed (Visa ending in 4242)
    // First check if page shows "No payment methods saved yet"
    const noMethodsVisible = await page.locator('text=/no payment methods/i').isVisible().catch(() => false);
    
    if (noMethodsVisible) {
      // Dump page content for debugging
      await page.screenshot({ path: 'test-results/05-no-payment-methods-debug.png' });
      throw new Error('Payment methods list shows "No payment methods saved yet" - sync failed');
    }
    
    // Try multiple selectors for the card
    const visaSelectors = [
      'text=/Visa/i',
      'text=/••••.*4242/i',
      'text=/4242/',
      '[data-testid="payment-method-card"]',
      '.payment-card:has-text("4242")',
    ];
    
    let found = false;
    for (const selector of visaSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000, state: 'visible' });
        found = true;
        break;
      } catch {
        // Try next selector
      }
    }
    
    if (!found) {
      await page.screenshot({ path: 'test-results/05-payment-method-not-found.png' });
      throw new Error('Payment method "Visa" not found on page after sync');
    }

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
  
  // Wait for redirect to add page
  await page.waitForURL('**/payment-methods/add', { timeout: 10000 });

  // Wait for Stripe Elements to load
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 30000 });

  const stripeFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  // Wait for card input to be ready with retries
  const cardInput = stripeFrame.locator('input[placeholder*="1234"]').or(
    stripeFrame.getByRole('textbox', { name: /card/i })
  );
  
  let cardInputReady = false;
  for (let attempt = 1; attempt <= 5 && !cardInputReady; attempt++) {
    try {
      await cardInput.waitFor({ state: 'visible', timeout: 5000 });
      cardInputReady = true;
    } catch {
      await page.waitForTimeout(1000 * attempt);
    }
  }
  
  if (!cardInputReady) {
    throw new Error('Stripe Elements did not load in time');
  }

  // Fill card number character by character
  await cardInput.click();
  await cardInput.clear();
  for (const char of cardNumber) {
    await cardInput.press(char, { delay: 30 });
  }
  await page.waitForTimeout(500);

  // Fill expiry
  const expiryInput = stripeFrame.locator('input[placeholder*="MM"]').or(
    stripeFrame.getByRole('textbox', { name: /expi/i })
  );
  await expiryInput.waitFor({ state: 'visible', timeout: 5000 });
  await expiryInput.click();
  await expiryInput.clear();
  await expiryInput.type(expiry.replace('/', ''), { delay: 50 });
  await page.waitForTimeout(500);

  // Fill CVC
  const cvcInput = stripeFrame.locator('input[placeholder*="CVC"]').or(
    stripeFrame.getByRole('textbox', { name: /security|cvc/i })
  );
  await cvcInput.waitFor({ state: 'visible', timeout: 5000 });
  await cvcInput.click();
  await cvcInput.clear();
  await cvcInput.type(cvc, { delay: 50 });
  await page.waitForTimeout(500);

  // Select country (US) - needed for ZIP
  const countrySelect = stripeFrame.locator('select').or(stripeFrame.getByLabel(/country/i));
  try {
    await countrySelect.waitFor({ state: 'visible', timeout: 3000 });
    await countrySelect.selectOption({ value: 'US' });
    await page.waitForTimeout(500);
  } catch {
    // Country may be pre-selected
  }

  // Fill ZIP (required for US)
  if (zip) {
    const zipInput = stripeFrame.locator('input[placeholder*="12345"]').or(
      stripeFrame.getByRole('textbox', { name: /postal|zip/i })
    );
    try {
      await zipInput.waitFor({ state: 'visible', timeout: 3000 });
      await zipInput.click();
      await zipInput.clear();
      await zipInput.fill(zip);
      await page.waitForTimeout(500);
    } catch {
      // ZIP may not be required
    }
  }

  await page.waitForTimeout(500);

  // Take screenshot before submission
  await page.screenshot({ path: 'test-results/add-card-before-submit.png' });

  // Click save button
  const saveButton = page.getByRole('button', { name: /save payment method/i });
  await saveButton.click();

  // Wait for success with proper state detection
  let submitSuccess = false;
  try {
    await page.waitForSelector('text=/payment method.*added|added successfully/i', { timeout: 15000, state: 'visible' });
    submitSuccess = true;
  } catch {
    const currentUrl = page.url();
    if (currentUrl.includes('/payment-methods') && !currentUrl.includes('/add')) {
      submitSuccess = true;
    } else {
      await page.screenshot({ path: 'test-results/add-card-error.png' });
      throw new Error('Failed to add payment method');
    }
  }
  
  if (!submitSuccess) {
    await page.screenshot({ path: 'test-results/add-card-timeout.png' });
    throw new Error('Payment method submission timed out');
  }
}
