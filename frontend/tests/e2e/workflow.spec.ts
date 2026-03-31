import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('LaserHub Visual Workflow Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test('Complete customer workflow - upload, calculate, and order', async ({ page }) => {
    test.setTimeout(60000);
    
    await page.screenshot({ path: 'test-results/01-homepage.png', fullPage: true });
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('/home/hemang/Downloads/mew_dove_2b_b55.svg');
    
    await page.waitForSelector('.uploaded-file', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/02-file-uploaded.png', fullPage: true });
    
    const nextButton = page.locator('button', { hasText: 'Next: Select Material' });
    await nextButton.click();
    
    await page.waitForSelector('.material-selector', { timeout: 5000 });
    await page.screenshot({ path: 'test-results/03-material-selection.png', fullPage: true });
    
    const materialCard = page.locator('.material-card').first();
    await materialCard.click();
    
    const nextButton2 = page.locator('button', { hasText: 'Next: Review Cost' });
    await expect(nextButton2).not.toBeDisabled();
    await nextButton2.click();
    
    await page.waitForSelector('.cost-display', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/04-cost-calculation.png', fullPage: true });
    
    const nextButton3 = page.locator('button', { hasText: 'Next: Place Order' });
    await nextButton3.click();
    
    await page.waitForSelector('.order-form', { timeout: 5000 });
    await page.screenshot({ path: 'test-results/05-order-form.png', fullPage: true });
    
    await page.locator('input[name="customer_name"]').fill('Test User');
    await page.locator('input[name="customer_email"]').fill('test@example.com');
    await page.locator('input[name="customer_phone"]').fill('555-123-4567');
    
    const completeOrderButton = page.locator('button', { hasText: 'Complete Order' });
    await completeOrderButton.click();
    
    await page.waitForSelector('.success-message', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/06-order-success.png', fullPage: true });
    
    expect(await page.locator('.success-message h2').textContent()).toContain('Order Placed Successfully');
  });

  test('Admin workflow - login and manage orders', async ({ page }) => {
    test.setTimeout(60000);
    
    await page.goto('http://localhost:5173/admin');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/admin-01-login.png', fullPage: true });
    
    await page.locator('input[name="email"]').fill('admin@laserhub.com');
    await page.locator('input[name="password"]').fill('changeme');
    
    const loginButton = page.locator('button[type="submit"]');
    await loginButton.click();
    
    await page.waitForSelector('.admin-dashboard', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/admin-02-dashboard.png', fullPage: true });
    
    expect(await page.locator('.stat-value').first().textContent()).toBeTruthy();
    
    const ordersTable = page.locator('.orders-table');
    await expect(ordersTable).toBeVisible();
    
    await page.hover('.orders-table tr:nth-child(2)');
    await page.screenshot({ path: 'test-results/admin-03-orders-hover.png', fullPage: true });
    
    const statusSelect = page.locator('.status-select').first();
    await statusSelect.selectOption('in_production');
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/admin-04-order-status-updated.png', fullPage: true });
    
    const analyticsButton = page.locator('button', { hasText: 'View Analytics' });
    await analyticsButton.click();
    
    await page.waitForSelector('.analytics-dashboard', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/admin-05-analytics.png', fullPage: true });
    
    const chart = page.locator('.recharts-surface');
    await expect(chart).toBeVisible();
    
    const logoutButton = page.locator('.logout-btn');
    await logoutButton.click();
    
    await page.waitForURL('**/admin');
    expect(page.url()).toContain('/admin');
    await page.screenshot({ path: 'test-results/admin-06-logged-out.png', fullPage: true });
  });

  test('Dark mode toggle and accessibility', async ({ page }) => {
    const themeToggle = page.locator('.theme-toggle');
    
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/theme-dark.png', fullPage: true });
    
    const htmlElement = page.locator('html');
    await expect(htmlElement).toHaveClass(/dark-mode/);
    
    await themeToggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/theme-light.png', fullPage: true });
    
    await expect(htmlElement).not.toHaveClass(/dark-mode/);
  });

  test('Responsive design - mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone size
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    await page.screenshot({ path: 'test-results/mobile-homepage.png', fullPage: true });
    
    const navbar = page.locator('.navbar');
    await expect(navbar).toBeVisible();
    
    const navLinks = page.locator('.nav-links');
    await expect(navLinks).toBeVisible();
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('/home/hemang/Downloads/mew_dove_2b_b55.svg');
    
    await page.waitForSelector('.uploaded-file', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/mobile-uploaded.png', fullPage: true });
  });

  test('Error handling and validation', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    
    const invalidFilePath = path.join(__dirname, '../../../README.md');
    await fileInput.setInputFiles(invalidFilePath);
    
    await page.waitForSelector('[data-sonner-toaster]', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'test-results/error-invalid-file.png', fullPage: true });
    
    const errorToast = page.locator('.sonner-toast').filter({ hasText: 'Upload failed' });
    await expect(errorToast).toBeVisible();
  });
});