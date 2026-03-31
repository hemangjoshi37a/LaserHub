"""
Integration tests for complete user workflows
"""
import pytest
from fastapi import status
import uuid


class TestCompleteOrderWorkflow:
    """Test complete order workflow from upload to payment"""
    
    @pytest.mark.asyncio
    async def test_complete_order_journey(self, authenticated_client, test_materials, sample_dxf_file):
        """Test complete order journey: upload -> calculate -> create order -> payment"""
        
        # Step 1: Upload file
        with open(sample_dxf_file, 'rb') as f:
            upload_response = await authenticated_client.post(
                "/api/upload/",
                files={"file": ("test.dxf", f, "application/dxf")}
            )
        
        assert upload_response.status_code == status.HTTP_200_OK
        upload_data = upload_response.json()
        assert "file_id" in upload_data
        file_id = upload_data["file_id"]
        
        # Step 2: Get calculation preview
        preview_response = await authenticated_client.get(f"/api/calculate/preview/{file_id}")
        
        assert preview_response.status_code == status.HTTP_200_OK
        preview_data = preview_response.json()
        assert "estimated_total" in preview_data
        
        # Step 3: Get detailed calculation
        calculate_payload = {
            "file_id": file_id,
            "material_id": 1,  # Acrylic
            "thickness_mm": 3,
            "quantity": 2
        }
        calculate_response = await authenticated_client.post("/api/calculate/", json=calculate_payload)
        
        assert calculate_response.status_code == status.HTTP_200_OK
        calculate_data = calculate_response.json()
        assert "breakdown" in calculate_data
        assert calculate_data["material_name"] == "Acrylic Clear"
        
        # Step 4: Create order
        order_payload = {
            "file_id": file_id,
            "material_id": 1,
            "thickness_mm": 3,
            "quantity": 2,
            "customer_name": "Test Customer",
            "customer_email": "test@example.com",
            "shipping_address": "123 Test St, Test City, TC 12345"
        }
        order_response = await authenticated_client.post("/api/orders/", json=order_payload)
        
        assert order_response.status_code == status.HTTP_200_OK
        order_data = order_response.json()
        assert "order_number" in order_data
        assert "total_amount" in order_data
        assert "payment_link" in order_data
        
        order_number = order_data["order_number"]
        
        # Step 5: Get order details
        order_detail_response = await authenticated_client.get(f"/api/orders/{order_number}")
        
        assert order_detail_response.status_code == status.HTTP_200_OK
        order_detail_data = order_detail_response.json()
        assert order_detail_data["order_number"] == order_number
        assert order_detail_data["status"] == "pending"
        
        # Step 6: Get user orders
        user_orders_response = await authenticated_client.get("/api/orders/")
        
        assert user_orders_response.status_code == status.HTTP_200_OK
        user_orders_data = user_orders_response.json()
        assert isinstance(user_orders_data, list)
        assert len(user_orders_data) >= 1
        
        # Verify the order appears in user's orders
        order_numbers = [order["order_number"] for order in user_orders_data]
        assert order_number in order_numbers


class TestAdminWorkflows:
    """Test admin workflows"""
    
    @pytest.mark.asyncio
    async def test_admin_order_management(self, admin_client, test_materials, sample_dxf_file, test_user):
        """Test admin order management workflow"""
        
        # Create an order first
        with open(sample_dxf_file, 'rb') as f:
            upload_response = await admin_client.post(
                "/api/upload/",
                files={"file": ("test.dxf", f, "application/dxf")}
            )
        
        file_id = upload_response.json()["file_id"]
        
        order_payload = {
            "file_id": file_id,
            "material_id": 1,
            "thickness_mm": 3,
            "quantity": 1,
            "customer_name": "Admin Customer",
            "customer_email": "admin@example.com",
            "shipping_address": "Admin Address"
        }
        order_response = await admin_client.post("/api/orders/", json=order_payload)
        order_number = order_response.json()["order_number"]
        
        # Step 1: Get all orders as admin
        all_orders_response = await admin_client.get("/api/admin/orders/")
        
        assert all_orders_response.status_code == status.HTTP_200_OK
        all_orders = all_orders_response.json()
        assert isinstance(all_orders, list)
        assert len(all_orders) >= 1
        
        # Step 2: Update order status
        update_response = await admin_client.patch(
            f"/api/admin/orders/{order_number}/status",
            json={"status": "in_production"}
        )
        
        assert update_response.status_code == status.HTTP_200_OK
        updated_order = update_response.json()
        assert updated_order["status"] == "in_production"
        
        # Step 3: Get order analytics
        analytics_response = await admin_client.get("/api/admin/analytics/orders")
        
        assert analytics_response.status_code == status.HTTP_200_OK
        analytics_data = analytics_response.json()
        assert "total_orders" in analytics_data
        assert "total_revenue" in analytics_data
        assert "orders_by_status" in analytics_data
    
    @pytest.mark.asyncio
    async def test_admin_material_management(self, admin_client):
        """Test admin material management"""
        
        # Step 1: Create new material
        new_material = {
            "name": "Test Material",
            "type": "acrylic",
            "rate_per_cm2_mm": 0.07,
            "available_thicknesses": [3, 5, 8],
            "description": "Test material"
        }
        create_response = await admin_client.post("/api/admin/materials/", json=new_material)
        
        assert create_response.status_code == status.HTTP_200_OK
        created_material = create_response.json()
        assert created_material["name"] == "Test Material"
        
        material_id = created_material["id"]
        
        # Step 2: Update material
        update_response = await admin_client.patch(
            f"/api/admin/materials/{material_id}",
            json={"rate_per_cm2_mm": 0.08}
        )
        
        assert update_response.status_code == status.HTTP_200_OK
        updated_material = update_response.json()
        assert updated_material["rate_per_cm2_mm"] == 0.08
        
        # Step 3: Get all materials
        all_materials_response = await admin_client.get("/api/admin/materials/")
        
        assert all_materials_response.status_code == status.HTTP_200_OK
        materials = all_materials_response.json()
        assert isinstance(materials, list)
        assert len(materials) >= 3  # Including the ones from fixture


class TestMaterialSelectionWorkflow:
    """Test material selection workflow"""
    
    @pytest.mark.asyncio
    async def test_material_selection_and_filtering(self, client, test_materials):
        """Test material selection and filtering workflow"""
        
        # Step 1: Get all materials
        all_materials_response = await client.get("/api/materials/")
        
        assert all_materials_response.status_code == status.HTTP_200_OK
        all_materials = all_materials_response.json()
        assert isinstance(all_materials, list)
        assert len(all_materials) >= 2  # Only active materials
        
        # Verify inactive material is not included
        material_names = [m["name"] for m in all_materials]
        assert "Stainless Steel" not in material_names  # Inactive material
        
        # Step 2: Get specific material details
        acrylic_response = await client.get("/api/materials/1")
        
        assert acrylic_response.status_code == status.HTTP_200_OK
        acrylic = acrylic_response.json()
        assert acrylic["name"] == "Acrylic Clear"
        assert 3 in acrylic["available_thicknesses"]
        
        # Step 3: Try to get inactive material
        inactive_response = await client.get("/api/materials/3")
        
        assert inactive_response.status_code == status.HTTP_404_NOT_FOUND


class TestErrorHandlingWorkflow:
    """Test error handling in workflows"""
    
    @pytest.mark.asyncio
    async def test_invalid_file_upload(self, authenticated_client):
        """Test uploading invalid file"""
        
        # Upload non-existent file
        response = await authenticated_client.post(
            "/api/upload/",
            files={"file": ("test.txt", b"not a valid file", "text/plain")}
        )
        
        # Should handle gracefully, possibly return error about unsupported format
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]
    
    @pytest.mark.asyncio
    async def test_invalid_calculation_request(self, authenticated_client):
        """Test requesting calculation with invalid parameters"""
        
        # Try to calculate with non-existent file
        calculate_payload = {
            "file_id": str(uuid.uuid4()),  # Random non-existent ID
            "material_id": 999,
            "thickness_mm": 999,
            "quantity": 1
        }
        response = await authenticated_client.post("/api/calculate/", json=calculate_payload)
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "file not found" in response.json()["detail"].lower()
    
    @pytest.mark.asyncio
    async def test_concurrent_order_creation(self, authenticated_client, test_materials, sample_dxf_file):
        """Test creating multiple orders concurrently"""
        
        # First upload a file
        with open(sample_dxf_file, 'rb') as f:
            upload_response = await authenticated_client.post(
                "/api/upload/",
                files={"file": ("test.dxf", f, "application/dxf")}
            )
        
        file_id = upload_response.json()["file_id"]
        
        # Create multiple order requests concurrently
        order_payload = {
            "file_id": file_id,
            "material_id": 1,
            "thickness_mm": 3,
            "quantity": 1,
            "customer_name": "Test Customer",
            "customer_email": "test@example.com",
            "shipping_address": "123 Test St"
        }
        
        # Send concurrent requests
        import asyncio
        tasks = [
            authenticated_client.post("/api/orders/", json=order_payload)
            for _ in range(5)
        ]
        
        responses = await asyncio.gather(*tasks)
        
        # All should succeed with unique order numbers
        assert all(r.status_code == status.HTTP_200_OK for r in responses)
        order_numbers = [r.json()["order_number"] for r in responses]
        assert len(set(order_numbers)) == 5  # All unique


class TestPerformanceWorkflow:
    """Test performance of critical workflows"""
    
    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_calculation_performance(self, authenticated_client, test_uploaded_file, test_materials):
        """Test calculation endpoint performance"""
        import time
        
        calculate_payload = {
            "file_id": test_uploaded_file.file_id,
            "material_id": 1,
            "thickness_mm": 3,
            "quantity": 1
        }
        
        start_time = time.time()
        response = await authenticated_client.post("/api/calculate/", json=calculate_payload)
        end_time = time.time()
        
        assert response.status_code == status.HTTP_200_OK
        assert end_time - start_time < 2.0  # Should complete in less than 2 seconds
    
    @pytest.mark.asyncio
    async def test_file_upload_performance(self, authenticated_client, sample_dxf_file):
        """Test file upload performance"""
        import time
        
        start_time = time.time()
        with open(sample_dxf_file, 'rb') as f:
            response = await authenticated_client.post(
                "/api/upload/",
                files={"file": ("test.dxf", f, "application/dxf")}
            )
        end_time = time.time()
        
        assert response.status_code == status.HTTP_200_OK
        assert end_time - start_time < 5.0  # File processing should be quick