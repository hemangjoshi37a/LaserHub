#!/usr/bin/env python3.13
"""
LaserHub Visual Workflow Test with Playwright
Tests complete user journey with screenshots
"""

from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import time

TEST_FILE = Path("/home/hemang/Downloads/mew_dove_2b_b55.svg")
SCREENSHOTS_DIR = Path("/home/hemang/Documents/GitHub/LaserHub/screenshots")
SCREENSHOTS_DIR.mkdir(exist_ok=True)

def test_complete_workflow():
    """Test complete user workflow with visual verification"""
    
    print("=" * 70)
    print("LASERHUB VISUAL WORKFLOW TEST")
    print("=" * 70)
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True, slow_mo=500)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=1
        )
        page = context.new_page()
        
        # Enable console logging
        page.on('console', lambda msg: print(f"  [Console] {msg.type}: {msg.text}"))
        page.on('pageerror', lambda err: print(f"  [Error] {err}"))
        
        try:
            # Navigate to homepage
            print("\n🌐 Navigating to LaserHub...")
            page.goto("http://localhost:5173", wait_until='networkidle')
            page.screenshot(path=str(SCREENSHOTS_DIR / "01_homepage.png"))
            print(f"✅ Homepage loaded - Screenshot saved")
            
            # Verify page title
            title = page.title()
            print(f"   Page Title: {title}")
            
            # STEP 1: Upload File
            print("\n📤 STEP 1: Uploading File...")
            
            # Wait for upload area
            upload_area = page.locator('.dropzone')
            expect(upload_area).to_be_visible(timeout=10000)
            print("   ✓ Upload area visible")
            
            # Upload file
            if TEST_FILE.exists():
                file_input = page.locator('input[type="file"]')
                file_input.set_input_files(str(TEST_FILE))
                print(f"   ✓ File selected: {TEST_FILE.name}")
                
                # Wait for upload to complete
                page.wait_for_selector('.uploaded-file', timeout=15000)
                print("   ✓ File uploaded successfully")
                
                # Take screenshot
                page.screenshot(path=str(SCREENSHOTS_DIR / "02_file_uploaded.png"))
                print(f"   ✓ Screenshot saved: file_uploaded.png")
                
                # Click Next button
                next_btn = page.locator('button.next-btn')
                next_btn.click()
                print("   ✓ Clicked Next button")
            else:
                print(f"   ❌ Test file not found: {TEST_FILE}")
                return
            
            # STEP 2: Select Material
            print("\n📋 STEP 2: Selecting Material...")
            
            # Wait for material selector
            page.wait_for_selector('.material-selector', timeout=10000)
            print("   ✓ Material selector visible")
            
            # Take screenshot before selection
            page.screenshot(path=str(SCREENSHOTS_DIR / "03_material_selection.png"))
            print(f"   ✓ Screenshot saved: material_selection.png")
            
            # Select first material
            first_material = page.locator('.material-card').first
            first_material.click()
            print("   ✓ Selected first material")
            
            # Select thickness
            first_thickness = page.locator('.thickness-btn').first
            first_thickness.click()
            print("   ✓ Selected thickness")
            
            # Wait for cost calculation
            page.wait_for_selector('.cost-breakdown', timeout=15000)
            print("   ✓ Cost calculated")
            
            # Take screenshot with cost
            page.screenshot(path=str(SCREENSHOTS_DIR / "04_cost_calculated.png"))
            print(f"   ✓ Screenshot saved: cost_calculated.png")
            
            # Extract cost info
            try:
                total_cost = page.locator('.cost-item.total .cost-item-value').text_content()
                print(f"   ✓ Total Cost: {total_cost}")
            except:
                print("   ⚠ Could not extract total cost")
            
            # Click Next to go to order form
            next_btn = page.locator('button.next-btn').last
            next_btn.click()
            print("   ✓ Clicked Next to order form")
            
            # STEP 3: Fill Order Form
            print("\n📦 STEP 3: Filling Order Form...")
            
            # Wait for order form
            page.wait_for_selector('.order-form', timeout=10000)
            print("   ✓ Order form visible")
            
            # Fill customer details
            page.fill('input[placeholder="John Doe"]', "Hemang Joshi")
            print("   ✓ Filled name")
            
            page.fill('input[placeholder="john@example.com"]', "hemang.test@example.com")
            print("   ✓ Filled email")
            
            page.fill('textarea[placeholder="123 Main St, City, State 12345"]', 
                     "456 Laser Lane, Tech City, TC 56789")
            print("   ✓ Filled address")
            
            # Take screenshot of filled form
            page.screenshot(path=str(SCREENSHOTS_DIR / "05_order_form_filled.png"))
            print(f"   ✓ Screenshot saved: order_form_filled.png")
            
            # Click Proceed to Payment
            submit_btn = page.locator('button.submit-btn')
            submit_btn.click()
            print("   ✓ Clicked Proceed to Payment")
            
            # Wait for payment form (or success if Stripe not configured)
            page.wait_for_timeout(3000)
            
            # Check if we got to payment or success
            if page.is_visible('.payment-container'):
                print("   ✓ Payment form loaded")
                page.screenshot(path=str(SCREENSHOTS_DIR / "06_payment_form.png"))
                print(f"   ✓ Screenshot saved: payment_form.png")
            elif page.is_visible('.success-message') or page.is_visible('.success-icon'):
                print("   ✓ Order placed successfully (no payment required)")
                page.screenshot(path=str(SCREENSHOTS_DIR / "06_order_success.png"))
                print(f"   ✓ Screenshot saved: order_success.png")
            
            # STEP 4: Test Admin Dashboard
            print("\n🔐 STEP 4: Testing Admin Dashboard...")
            
            # Navigate to admin
            page.goto("http://localhost:5173/admin", wait_until='networkidle')
            page.screenshot(path=str(SCREENSHOTS_DIR / "07_admin_login.png"))
            print(f"   ✓ Admin login page - Screenshot saved")
            
            # Login
            page.fill('input[type="email"]', "admin@laserhub.com")
            page.fill('input[type="password"]', "admin123")
            page.click('button.login-btn')
            print("   ✓ Entered admin credentials")
            
            # Wait for dashboard
            page.wait_for_selector('.admin-dashboard', timeout=10000)
            print("   ✓ Admin dashboard loaded")
            
            # Take screenshot of dashboard
            page.screenshot(path=str(SCREENSHOTS_DIR / "08_admin_dashboard.png"))
            print(f"   ✓ Dashboard screenshot saved")
            
            # Extract stats
            try:
                stats = page.locator('.stat-value').all_text_contents()
                if len(stats) >= 4:
                    print(f"   ✓ Dashboard Stats:")
                    print(f"      Total Orders: {stats[0]}")
                    print(f"      Pending: {stats[1]}")
                    print(f"      Total Revenue: {stats[2]}")
                    print(f"      Monthly Revenue: {stats[3]}")
            except Exception as e:
                print(f"   ⚠ Could not extract stats: {e}")
            
            # View orders table
            if page.is_visible('.orders-table'):
                print("   ✓ Orders table visible")
                page.screenshot(path=str(SCREENSHOTS_DIR / "09_admin_orders.png"))
                print(f"   ✓ Orders table screenshot saved")
            
            print("\n" + "=" * 70)
            print("✅ VISUAL WORKFLOW TEST COMPLETED SUCCESSFULLY!")
            print("=" * 70)
            print(f"\n📸 Screenshots saved to: {SCREENSHOTS_DIR}")
            print("\nGenerated Screenshots:")
            for img in sorted(SCREENSHOTS_DIR.glob("*.png")):
                print(f"   - {img.name}")
            
        except Exception as e:
            print(f"\n❌ Test failed: {e}")
            page.screenshot(path=str(SCREENSHOTS_DIR / "error_screenshot.png"))
            print(f"   Error screenshot saved")
            import traceback
            traceback.print_exc()
        
        finally:
            browser.close()

if __name__ == "__main__":
    test_complete_workflow()
