const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TEST_RESULTS = './test-results';
const TIMESTAMP = Date.now();
const TEST_EMAIL = `test-manual-${TIMESTAMP}@example.com`;

if (!fs.existsSync(TEST_RESULTS)) {
  fs.mkdirSync(TEST_RESULTS, { recursive: true });
}

async function screenshot(page, name) {
  const filename = `${TEST_RESULTS}/${name}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`📸 ${path.basename(filename)}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 Manual E2E Payment Method Flow Test');
  console.log('='.repeat(50));
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Console Error:', msg.text());
    }
  });
  
  page.on('requestfailed', request => {
    console.log('❌ Request Failed:', request.url());
  });
  
  try {
    console.log('\n📍 Step 1: Registration Page');
    await page.goto('http://localhost:3000/auth/register', { waitUntil: 'networkidle0' });
    await screenshot(page, '01-registration-page');
    
    console.log('📍 Step 2: Fill Form');
    await page.waitForSelector('input[name="name"]', { timeout: 10000 });
    await page.type('input[name="name"]', 'Test User Manual', { delay: 50 });
    await page.type('input[name="email"]', TEST_EMAIL, { delay: 50 });
    await page.type('input[name="password"]', 'TestPassword123!', { delay: 50 });
    
    const countrySelect = await page.$('select[name="country"]');
    if (countrySelect) {
      await page.select('select[name="country"]', 'US');
    }
    
    await screenshot(page, '02-registration-filled');
    console.log(`✅ Form filled (${TEST_EMAIL})`);
    
    console.log('📍 Step 3: Submit Registration');
    let submitBtn = await page.$('button[type="submit"]');
    if (!submitBtn) {
      const buttons = await page.$$('button');
      console.log(`   Found ${buttons.length} buttons`);
      if (buttons.length > 0) submitBtn = buttons[0];
    }
    
    await Promise.all([
      submitBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => sleep(2000))
    ]);
    
    await screenshot(page, '03-after-submit');
    console.log(`   URL: ${page.url()}`);
    
    // Check if redirected to login
    if (page.url().includes('/login')) {
      console.log('📍 Step: Login');
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.type('input[name="email"]', TEST_EMAIL, { delay: 50 });
      await page.type('input[name="password"]', 'TestPassword123!', { delay: 50 });
      await screenshot(page, '04-login-filled');
      
      const loginBtn = await page.$('button[type="submit"]') || await page.$('button');
      await Promise.all([
        loginBtn.click(),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => sleep(2000))
      ]);
      await screenshot(page, '05-after-login');
      console.log(`   URL: ${page.url()}`);
    }
    
    console.log('📍 Step 4: Payment Methods Page');
    await page.goto('http://localhost:3000/payment-methods', { waitUntil: 'networkidle0' });
    await screenshot(page, '06-payment-methods-page');
    console.log(`   URL: ${page.url()}`);
    
    // Find and click Add Payment Method button
    const pageContent = await page.content();
    
    if (pageContent.includes('Add') || pageContent.includes('payment')) {
      const buttons = await page.$$('button');
      console.log(`   Found ${buttons.length} buttons on page`);
      
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        console.log(`   - Button: "${text.trim()}"`);
        if (text.toLowerCase().includes('add') || text.toLowerCase().includes('payment')) {
          console.log('📍 Step 5: Click Add Payment Method');
          await btn.click();
          await sleep(3000);
          await screenshot(page, '07-payment-element');
          break;
        }
      }
    }
    
    // Look for Stripe PaymentElement
    console.log('📍 Step 6: Fill Stripe PaymentElement');
    await sleep(3000);
    
    // Find iframes
    const frames = page.frames();
    console.log(`   Found ${frames.length} frames`);
    
    for (const frame of frames) {
      console.log(`   Frame URL: ${frame.url().substring(0, 80)}...`);
    }
    
    const stripeFrame = frames.find(f => f.url().includes('stripe') || f.url().includes('js.stripe.com'));
    
    if (stripeFrame) {
      console.log('   ✅ Stripe iframe found');
      
      // Try to fill card details
      try {
        const cardInputs = await stripeFrame.$$('input');
        console.log(`   Found ${cardInputs.length} inputs in Stripe iframe`);
        
        // Common Stripe PaymentElement selectors
        const cardInput = await stripeFrame.$('input[placeholder*="card"]') ||
                          await stripeFrame.$('input[name="cardnumber"]') ||
                          await stripeFrame.$('input[type="tel"]');
        
        if (cardInput) {
          await cardInput.click();
          await cardInput.type('4242424242424242', { delay: 100 });
          console.log('   ✅ Card number entered');
        }
        
        // Exp date
        const expInput = await stripeFrame.$('input[name="exp-date"]') ||
                         await stripeFrame.$('input[placeholder*="MM"]');
        if (expInput) {
          await expInput.type('1230', { delay: 100 });
          console.log('   ✅ Expiry entered');
        }
        
        // CVC
        const cvcInput = await stripeFrame.$('input[name="cvc"]') ||
                         await stripeFrame.$('input[placeholder*="CVC"]');
        if (cvcInput) {
          await cvcInput.type('123', { delay: 100 });
          console.log('   ✅ CVC entered');
        }
        
        await screenshot(page, '08-card-filled');
      } catch (err) {
        console.log(`   ⚠️ Could not fill Stripe iframe: ${err.message}`);
      }
    } else {
      console.log('   ⚠️ Stripe iframe not found');
    }
    
    // Check for country/postal code fields in main page
    const countryField = await page.$('select[name="billing_details[address][country]"]') ||
                          await page.$('select[name="country"]');
    if (countryField) {
      await page.select('select', 'US');
    }
    
    const zipField = await page.$('input[name="billing_details[address][postal_code]"]') ||
                      await page.$('input[name="postal_code"]') ||
                      await page.$('input[placeholder*="ZIP"]');
    if (zipField) {
      await zipField.type('10001', { delay: 50 });
      console.log('   ✅ ZIP code entered');
    }
    
    await screenshot(page, '09-form-complete');
    
    console.log('📍 Step 7: Submit Payment Method');
    const saveButtons = await page.$$('button');
    let saveBtn = null;
    
    for (const btn of saveButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text.toLowerCase().includes('save') || 
          text.toLowerCase().includes('submit') ||
          text.toLowerCase().includes('add')) {
        saveBtn = btn;
        break;
      }
    }
    
    if (saveBtn) {
      const btnText = await page.evaluate(el => el.textContent, saveBtn);
      console.log(`   Clicking: "${btnText.trim()}"`);
      
      await Promise.all([
        saveBtn.click(),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => sleep(5000))
      ]);
      
      await screenshot(page, '10-after-submit');
      console.log(`   URL: ${page.url()}`);
    }
    
    console.log('📍 Step 8: Verify Result');
    await sleep(2000);
    
    const finalUrl = page.url();
    const finalContent = await page.content();
    
    console.log(`   Final URL: ${finalUrl}`);
    
    if (finalContent.includes('4242') || finalContent.includes('Visa')) {
      console.log('   ✅ Payment method saved (Visa •••• 4242 found in page)');
    } else {
      console.log('   ⚠️ Payment method card not visible');
      await screenshot(page, '11-final-state');
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Test Completed');
    console.log(`📧 Email: ${TEST_EMAIL}`);
    console.log(`📁 Screenshots: ${TEST_RESULTS}/`);
    console.log('\n📋 Next Steps:');
    console.log('   1. Check screenshots for each step');
    console.log('   2. Database: SELECT * FROM payment_methods');
    console.log('   3. Stripe Dashboard: Check customers & payment methods');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    await screenshot(page, 'fatal-error');
    throw error;
  } finally {
    console.log('\n⏳ Browser open for 30s...');
    await sleep(30000);
    await browser.close();
  }
}

main().catch(console.error);