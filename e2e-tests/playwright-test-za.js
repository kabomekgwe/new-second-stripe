const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const timestamp = Date.now();
  const email = `test-za-${timestamp}@example.com`;
  const password = 'SecureTest123!';

  // Step 1: Register with South Africa
  console.log('=== STEP 1: Register with South Africa ===');
  await page.goto('http://localhost:3000/auth/register');
  await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 15000 });

  await page.fill('input[name="name"]', 'Test SA User');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.selectOption('select[name="country"]', 'ZA');
  
  await page.screenshot({ path: '/tmp/01-register-filled.png' });
  console.log('Form filled with country: South Africa (ZA)');

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/auth\/login/, { timeout: 15000 });
  console.log('Registration successful, redirected to login');
  await page.screenshot({ path: '/tmp/02-register-success.png' });

  // Step 2: Login
  console.log('\n=== STEP 2: Login ===');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Welcome', { timeout: 15000 });
  console.log('Login successful');
  await page.screenshot({ path: '/tmp/03-login-success.png' });

  // Step 3: Navigate to Payment Methods
  console.log('\n=== STEP 3: Payment Methods ===');
  await page.goto('http://localhost:3000/payment-methods');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/04-payment-methods.png' });
  console.log('Payment methods page loaded');

  // Step 4: Go to Add Payment Method
  console.log('\n=== STEP 4: Add Payment Method ===');
  await page.click('text=Add Payment Method');
  await page.waitForURL('**/payment-methods/add', { timeout: 10000 });
  
  // Wait for Stripe PaymentElement to load
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 30000 });
  console.log('Stripe PaymentElement loaded');
  
  // Wait a bit for all payment method tabs to render
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/05-add-payment-method.png' });

  // Check what payment method options are visible
  const pageContent = await page.textContent('body');
  console.log('\n=== PAYMENT METHODS VISIBLE FOR SOUTH AFRICA ===');
  
  const methodsToCheck = [
    'Card', 'card',
    'iDEAL', 'ideal',
    'SEPA', 'sepa',
    'Bacs', 'bacs',
    'Bancontact', 'bancontact',
    'EPS', 'eps',
    'Sofort', 'sofort',
    'ACH', 'Bank account',
    'Pay by bank', 'Pay By Bank',
  ];

  for (const method of methodsToCheck) {
    if (pageContent.toLowerCase().includes(method.toLowerCase())) {
      console.log(`  ✓ Found: ${method}`);
    }
  }

  console.log('\nBrowser staying open for manual inspection...');
  console.log('Screenshots saved to /tmp/01-05*.png');
  
  // Keep browser open for inspection
  await page.waitForTimeout(300000); // 5 minutes
  await browser.close();
})();
