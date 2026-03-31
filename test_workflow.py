#!/usr/bin/env python3.13
"""
LaserHub Automated Workflow Test
Tests the complete user journey via API calls
"""

import httpx
import json
from pathlib import Path

BASE_URL = "http://localhost:8000"
TEST_FILE = Path("/home/hemang/Downloads/mew_dove_2b_b55.svg")

def test_complete_workflow():
    """Test complete user workflow"""
    
    print("=" * 60)
    print("LASERHUB WORKFLOW TEST")
    print("=" * 60)
    
    with httpx.Client(timeout=30.0) as client:
        
        # Step 1: Test Materials Endpoint
        print("\n📋 Step 1: Fetching Materials...")
        try:
            response = client.get(f"{BASE_URL}/api/materials/")
            materials = response.json()
            print(f"✅ Found {len(materials)} materials")
            for mat in materials[:3]:
                print(f"   - {mat['name']} ({len(mat['available_thicknesses'])} thicknesses)")
        except Exception as e:
            print(f"❌ Failed to fetch materials: {e}")
            return
        
        # Step 2: Upload File
        print(f"\n📤 Step 2: Uploading file: {TEST_FILE.name}")
        try:
            if not TEST_FILE.exists():
                print(f"❌ Test file not found: {TEST_FILE}")
                # Use a sample file from uploads
                TEST_FILE = Path("/home/hemang/Documents/GitHub/LaserHub/backend/uploads/08990619-9539-4170-adc3-a09c19ec0b90.svg")
                if not TEST_FILE.exists():
                    print("❌ No test file available")
                    return
            
            with open(TEST_FILE, 'rb') as f:
                files = {'file': (TEST_FILE.name, f, 'image/svg+xml')}
                response = client.post(f"{BASE_URL}/api/upload/", files=files)
                
            if response.status_code == 200:
                upload_result = response.json()
                file_id = upload_result['file_id']
                print(f"✅ File uploaded successfully")
                print(f"   File ID: {file_id}")
                print(f"   Size: {upload_result['file_size'] / 1024:.1f} KB")
            else:
                print(f"❌ Upload failed: {response.status_code} - {response.text}")
                return
        except Exception as e:
            print(f"❌ Upload error: {e}")
            return
        
        # Step 3: Get File Analysis
        print(f"\n🔍 Step 3: Getting file analysis...")
        try:
            response = client.get(f"{BASE_URL}/api/upload/{file_id}")
            if response.status_code == 200:
                analysis = response.json()
                print(f"✅ File analyzed")
                print(f"   Dimensions: {analysis['width_mm']:.1f} x {analysis['height_mm']:.1f} mm")
                print(f"   Area: {analysis['area_cm2']:.2f} cm²")
                print(f"   Cut Length: {analysis['cut_length_mm']:.1f} mm")
                print(f"   Est. Cut Time: {analysis['estimated_cut_time_minutes']:.1f} min")
            else:
                print(f"❌ Analysis failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Analysis error: {e}")
            return
        
        # Step 4: Calculate Cost
        print(f"\n💰 Step 4: Calculating cost...")
        try:
            material = materials[0]  # Use first material
            thickness = material['available_thicknesses'][0]
            
            calc_data = {
                "file_id": file_id,
                "material_id": material['id'],
                "thickness_mm": thickness,
                "quantity": 1
            }
            
            response = client.post(f"{BASE_URL}/api/calculate/", json=calc_data)
            if response.status_code == 200:
                cost = response.json()
                print(f"✅ Cost calculated")
                print(f"   Material: {cost['material_name']} ({cost['thickness_mm']}mm)")
                print(f"   Breakdown:")
                print(f"     - Material: ${cost['breakdown']['material_cost']:.2f}")
                print(f"     - Laser Time: ${cost['breakdown']['laser_time_cost']:.2f}")
                print(f"     - Energy: ${cost['breakdown']['energy_cost']:.2f}")
                print(f"     - Setup: ${cost['breakdown']['setup_fee']:.2f}")
                print(f"     - Subtotal: ${cost['breakdown']['subtotal']:.2f}")
                print(f"     - Tax: ${cost['breakdown']['tax']:.2f}")
                print(f"     - TOTAL: ${cost['breakdown']['total']:.2f}")
            else:
                print(f"❌ Cost calculation failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Cost calculation error: {e}")
            return
        
        # Step 5: Create Order
        print(f"\n📦 Step 5: Creating order...")
        try:
            order_data = {
                "file_id": file_id,
                "material_id": material['id'],
                "thickness_mm": thickness,
                "quantity": 1,
                "customer_email": "test@example.com",
                "customer_name": "Test User",
                "shipping_address": "123 Test St, Test City, TC 12345",
                "total_amount": cost['breakdown']['total']
            }
            
            response = client.post(f"{BASE_URL}/api/orders/", json=order_data)
            if response.status_code == 200:
                order = response.json()
                print(f"✅ Order created successfully!")
                print(f"   Order Number: {order['order_number']}")
                print(f"   Status: {order['status']}")
                print(f"   Total: ${order['total_amount']:.2f}")
            else:
                print(f"❌ Order creation failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Order creation error: {e}")
            return
        
        # Step 6: Test Admin Login
        print(f"\n🔐 Step 6: Testing admin login...")
        try:
            login_data = {
                "username": "admin@laserhub.com",
                "password": "admin123"
            }
            response = client.post(f"{BASE_URL}/api/admin/login", data=login_data)
            if response.status_code == 200:
                token = response.json()['access_token']
                print(f"✅ Admin login successful")
                print(f"   Token: {token[:50]}...")
                
                # Test admin dashboard
                headers = {"Authorization": f"Bearer {token}"}
                response = client.get(f"{BASE_URL}/api/admin/dashboard", headers=headers)
                if response.status_code == 200:
                    dashboard = response.json()
                    print(f"\n📊 Admin Dashboard Stats:")
                    print(f"   Total Orders: {dashboard['total_orders']}")
                    print(f"   Pending Orders: {dashboard['pending_orders']}")
                    print(f"   Total Revenue: ${dashboard['total_revenue']:.2f}")
                    print(f"   Monthly Revenue: ${dashboard['monthly_revenue']:.2f}")
                else:
                    print(f"❌ Dashboard access failed: {response.status_code}")
            else:
                print(f"❌ Admin login failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Admin login error: {e}")
    
    print("\n" + "=" * 60)
    print("✅ WORKFLOW TEST COMPLETED")
    print("=" * 60)

if __name__ == "__main__":
    test_complete_workflow()
