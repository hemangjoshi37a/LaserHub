const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TEST_FILE = '/home/hemang/Downloads/mew_dove_2b_b55.svg';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

(async () => {
    console.log('='.repeat(70));
    console.log('LASERHUB VISUAL WORKFLOW TEST');
    console.log('='.repeat(70));
    
    const browser = await chromium.launch({ headless: true, slowMo: 500 });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => console.log(`  [Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`  [Error] ${err.message}`));
    
    try {
        // STEP 1: Homepage
        console.log('\n🌐 Step 1: Navigating to homepage...');
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_homepage.png') });
        console.log('✅ Homepage screenshot saved');
        
        const title = await page.title();
        console.log(`   Title: ${title}`);
        
        // STEP 2: Upload file
        console.log('\n📤 Step 2: Uploading file...');
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(TEST_FILE);
        console.log('   File selected');
        
        // Wait for upload
        await page.waitForSelector('.uploaded-file', { timeout: 15000 });
        console.log('   File uploaded successfully');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_file_uploaded.png') });
        console.log('   Screenshot saved');
        
        // Click Next
        await page.click('button.next-btn');
        console.log('   Clicked Next');
        
        // STEP 3: Material selection
        console.log('\n📋 Step 3: Selecting material...');
        await page.waitForSelector('.material-selector', { timeout: 10000 });
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_material_selection.png') });
        console.log('   Screenshot saved');
        
        // Select first material
        await page.click('.material-card:first-child');
        console.log('   Selected first material');
        
        // Select thickness
        await page.click('.thickness-btn:first-child');
        console.log('   Selected thickness');
        
        // Wait for cost calculation
        await page.waitForSelector('.cost-breakdown', { timeout: 15000 });
        console.log('   Cost calculated');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_cost_calculated.png') });
        console.log('   Screenshot saved');
        
        // Get total cost
        const totalCost = await page.textContent('.cost-item.total .cost-item-value');
        console.log(`   Total Cost: ${totalCost}`);
        
        // Click Next to order
        const nextButtons = await page.locator('button.next-btn').all();
        await nextButtons[nextButtons.length - 1].click();
        console.log('   Clicked Next to order');
        
        // STEP 4: Order form
        console.log('\n📦 Step 4: Filling order form...');
        await page.waitForSelector('.order-form', { timeout: 10000 });
        
        await page.fill('input[placeholder="John Doe"]', 'Hemang Joshi');
        await page.fill('input[placeholder="john@example.com"]', 'hemang.test@example.com');
        await page.fill('textarea[placeholder="123 Main St, City, State 12345"]', 
                       '456 Laser Lane, Tech City, TC 56789');
        console.log('   Filled order form');
        
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_order_form_filled.png') });
        console.log('   Screenshot saved');
        
        // Submit order
        await page.click('button.submit-btn');
        console.log('   Submitted order');
        
        // Wait for response
        await page.waitForTimeout(5000);
        
        // Check for success or payment
        if (await page.isVisible('.success-message')) {
            console.log('   Order placed successfully!');
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_order_success.png') });
        } else if (await page.isVisible('.payment-container')) {
            console.log('   Payment form shown');
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_payment_form.png') });
        }
        
        // STEP 5: Admin dashboard
        console.log('\n🔐 Step 5: Testing admin dashboard...');
        await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_admin_login.png') });
        console.log('   Admin login screenshot saved');
        
        // Login
        await page.fill('input[type="email"]', 'admin@laserhub.com');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button.login-btn');
        console.log('   Logged in as admin');
        
        // Wait for dashboard
        await page.waitForSelector('.admin-dashboard', { timeout: 10000 });
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_admin_dashboard.png') });
        console.log('   Dashboard screenshot saved');
        
        // Get stats
        const stats = await page.$$eval('.stat-value', els => els.map(e => e.textContent));
        if (stats.length >= 4) {
            console.log('   Dashboard Stats:');
            console.log(`      Total Orders: ${stats[0]}`);
            console.log(`      Pending: ${stats[1]}`);
            console.log(`      Revenue: ${stats[2]}`);
            console.log(`      Monthly: ${stats[3]}`);
        }
        
        // Orders table
        if (await page.isVisible('.orders-table')) {
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_admin_orders.png') });
            console.log('   Orders table screenshot saved');
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('✅ WORKFLOW TEST COMPLETED!');
        console.log('='.repeat(70));
        console.log(`\n📸 Screenshots saved to: ${SCREENSHOTS_DIR}`);
        console.log('\nGenerated files:');
        fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).forEach(f => {
            console.log(`   - ${f}`);
        });
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error_screenshot.png') });
        console.error('   Error screenshot saved');
    } finally {
        await browser.close();
    }
})();
