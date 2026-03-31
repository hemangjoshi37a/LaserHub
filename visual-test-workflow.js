const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('LaserHub Complete Workflow Visual Test', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1920, height: 1080 }
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Complete LaserHub Workflow', async () => {
    const screenshotsDir = path.join(__dirname, 'screenshots', 'visual-test');
    const testFile = '/home/hemang/Downloads/mew_dove_2b_b55.svg';
    
    // Ensure screenshots directory exists
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    console.log('=== Step 1: Navigate to homepage ===');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    console.log('=== Step 2: Screenshot of homepage ===');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-homepage.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 01-homepage.png');

    console.log('=== Step 3: Upload SVG file ===');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'visible' });
    await fileInput.setInputFiles(testFile);
    await page.waitForTimeout(3000);
    
    console.log('=== Step 4: Screenshot after upload ===');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-after-upload.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 02-after-upload.png');

    console.log('=== Step 5: Click Next to go to material selection ===');
    const nextToMaterialBtn = page.getByText(/Next: Select Material/i);
    await nextToMaterialBtn.waitFor({ state: 'visible' });
    await nextToMaterialBtn.click();
    await page.waitForTimeout(2000);

    console.log('=== Step 6: Select first material (Acrylic) ===');
    const materialSelect = page.locator('select').first();
    await materialSelect.waitFor({ state: 'visible' });
    const materialOptions = await materialSelect.locator('option').all();
    console.log('Available materials:', await materialSelect.first().innerHTML());
    await materialSelect.selectIndex(0);
    await page.waitForTimeout(1000);
    
    console.log('=== Step 7: Select first thickness option ===');
    const thicknessSelect = page.locator('select').nth(1);
    await thicknessSelect.waitFor({ state: 'visible' });
    await thicknessSelect.selectIndex(0);
    await page.waitForTimeout(2000);

    console.log('=== Step 8: Click Next to Review Cost ===');
    const nextToReviewBtn = page.getByText(/Next: Review Cost/i);
    await nextToReviewBtn.waitFor({ state: 'visible' });
    await nextToReviewBtn.click();
    await page.waitForTimeout(3000);

    console.log('=== Step 9: Wait for cost calculation and screenshot ===');
    await page.waitForTimeout(3000);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '03-cost-calculated.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 03-cost-calculated.png');

    console.log('=== Step 10: Click "Next: Place Order" ===');
    const nextToOrderBtn = page.getByText(/Next: Place Order/i);
    await nextToOrderBtn.waitFor({ state: 'visible' });
    await nextToOrderBtn.click();
    await page.waitForTimeout(2000);

    console.log('=== Step 11: Fill order form ===');
    await page.fill('input[name="customer_name"]', 'Test User');
    await page.fill('input[name="customer_email"]', 'test@example.com');
    await page.fill('input[name="shipping_address"]', '123 Test Street, Test City, TC 12345');
    await page.waitForTimeout(1000);

    console.log('=== Step 12: Screenshot of filled form ===');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-order-form-filled.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 04-order-form-filled.png');

    console.log('=== Step 13: Click "Proceed to Payment" ===');
    const proceedBtn = page.getByText(/Proceed to Payment/i);
    await proceedBtn.waitFor({ state: 'visible' });
    await proceedBtn.click();
    await page.waitForTimeout(3000);

    console.log('=== Step 14: Screenshot of payment page ===');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-payment-page.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 05-payment-page.png');

    // For testing purposes, let's skip actual payment and go to success
    // In a real test, we'd fill card details. Here we'll just check the page
    console.log('=== Payment page reached (skipping actual payment for visual test) ===');

    console.log('=== Step 15: Navigate to admin panel ===');
    await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('=== Step 16: Login to admin ===');
    await page.fill('input[type="email"]', 'admin@laserhub.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.waitForTimeout(1000);

    const loginButton = page.getByText('Login');
    await loginButton.click();
    await page.waitForTimeout(3000);

    console.log('=== Step 17: Screenshot of admin dashboard ===');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-admin-dashboard.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 06-admin-dashboard.png');

    console.log('=== Step 18: Review orders table and screenshot ===');
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: path.join(screenshotsDir, '07-admin-orders.png'),
      fullPage: true 
    });
    console.log('✓ Screenshot: 07-admin-orders.png');

    console.log('=== Visual test completed successfully! ===');
  });
});
