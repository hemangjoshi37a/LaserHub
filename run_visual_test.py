from playwright.sync_api import sync_playwright
import os
import time

def run_visual_test():
    screenshots_dir = os.path.join(os.path.dirname(__file__), 'screenshots', 'visual-test')
    test_file = '/home/hemang/Downloads/mew_dove_2b_b55.svg'
    
    # Ensure screenshots directory exists
    os.makedirs(screenshots_dir, exist_ok=True)
    
    print('Launching browser...')
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        
        try:
            print('=== Step 1: Navigate to homepage ===')
            page.goto('http://localhost:5173', wait_until='networkidle')
            time.sleep(2)
            
            print('=== Step 2: Screenshot of homepage ===')
            page.screenshot(path=os.path.join(screenshots_dir, '01-homepage.png'), full_page=True)
            print('✓ Screenshot: 01-homepage.png')
            
            print('=== Step 3: Upload SVG file ===')
            file_input = page.locator('input[type="file"]')
            file_input.wait_for(state='visible')
            file_input.set_input_files(test_file)
            time.sleep(5)  # Wait for upload to complete
            
            print('=== Step 4: Screenshot after upload ===')
            page.screenshot(path=os.path.join(screenshots_dir, '02-after-upload.png'), full_page=True)
            print('✓ Screenshot: 02-after-upload.png')
            
            print('=== Step 5: Click Next to go to material selection ===')
            next_to_material_btn = page.get_by_text('Next: Select Material')
            next_to_material_btn.wait_for(state='visible')
            next_to_material_btn.click()
            time.sleep(3)
            
            print('=== Step 6: Select first material (Acrylic Clear) ===')
            # Click on the first material card
            acrylic_card = page.locator('.material-card').first
            acrylic_card.wait_for(state='visible')
            acrylic_card.click()
            time.sleep(1)
            
            print('=== Step 7: Select first thickness option ===')
            # Click on the first thickness button
            thickness_btn = page.get_by_text('2mm').first
            thickness_btn.wait_for(state='visible')
            thickness_btn.click()
            time.sleep(1)
            
            print('=== Step 8: Click Next to Review Cost ===')
            next_to_review_btn = page.get_by_text('Next: Review Cost')
            next_to_review_btn.wait_for(state='visible')
            next_to_review_btn.click()
            time.sleep(5)
            
            print('=== Step 9: Wait for cost calculation and screenshot ===')
            time.sleep(3)
            page.screenshot(path=os.path.join(screenshots_dir, '03-cost-calculated.png'), full_page=True)
            print('✓ Screenshot: 03-cost-calculated.png')
            
            print('=== Step 10: Click "Next: Place Order" ===')
            next_to_order_btn = page.get_by_text('Next: Place Order')
            next_to_order_btn.wait_for(state='visible')
            next_to_order_btn.click()
            time.sleep(2)
            
            print('=== Step 11: Fill order form ===')
            # Use placeholder-based selectors
            page.fill('input[placeholder*="John Doe"]', 'Test User')
            page.fill('input[placeholder*="john@example.com"]', 'test@example.com')
            page.fill('textarea[placeholder*="123 Main St"]', '123 Test Street, Test City, TC 12345')
            time.sleep(1)
            
            print('=== Step 12: Screenshot of filled form ===')
            page.screenshot(path=os.path.join(screenshots_dir, '04-order-form-filled.png'), full_page=True)
            print('✓ Screenshot: 04-order-form-filled.png')
            
            print('=== Step 13: Click "Proceed to Payment" ===')
            proceed_btn = page.get_by_text('Proceed to Payment')
            proceed_btn.wait_for(state='visible')
            proceed_btn.click()
            time.sleep(3)
            
            print('=== Step 14: Screenshot of payment page ===')
            page.screenshot(path=os.path.join(screenshots_dir, '05-payment-page.png'), full_page=True)
            print('✓ Screenshot: 05-payment-page.png')
            
            print('=== Payment page reached (skipping actual payment for visual test) ===')
            
            print('=== Step 15: Navigate to admin panel ===')
            page.goto('http://localhost:5173/admin', wait_until='networkidle')
            time.sleep(2)
            
            print('=== Step 16: Login to admin ===')
            page.fill('input[type="email"]', 'admin@laserhub.com')
            page.fill('input[type="password"]', 'admin123')
            time.sleep(1)
            
            login_button = page.locator('button.login-btn')
            login_button.click()
            time.sleep(3)
            
            print('=== Step 17: Screenshot of admin dashboard ===')
            page.screenshot(path=os.path.join(screenshots_dir, '06-admin-dashboard.png'), full_page=True)
            print('✓ Screenshot: 06-admin-dashboard.png')
            
            print('=== Step 18: Review orders table and screenshot ===')
            time.sleep(2)
            page.screenshot(path=os.path.join(screenshots_dir, '07-admin-orders.png'), full_page=True)
            print('✓ Screenshot: 07-admin-orders.png')
            
            print('')
            print('=== Visual test completed successfully! ===')
            print(f'Screenshots saved to: {screenshots_dir}')
            
        except Exception as e:
            print(f'Error during test: {e}')
            page.screenshot(path=os.path.join(screenshots_dir, 'error-screenshot.png'), full_page=True)
            print('Error screenshot saved.')
            raise
        finally:
            browser.close()

if __name__ == '__main__':
    run_visual_test()
