# API Documentation

LaserHub REST API documentation.

## Base URL
```
Development: http://localhost:8000/api
Production: https://your-domain.com/api
```

## Authentication
Admin endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

---

## Endpoints

### Upload

#### Upload File
```http
POST /api/upload/
Content-Type: multipart/form-data

Request:
- file: Vector file (DXF, SVG, AI, PDF, EPS)

Response:
{
  "file_id": "uuid-string",
  "filename": "design.dxf",
  "file_size": 12345,
  "file_type": "dxf",
  "upload_url": "/api/upload/uuid-string"
}
```

#### Get File Analysis
```http
GET /api/upload/{file_id}

Response:
{
  "file_id": "uuid-string",
  "width_mm": 100.5,
  "height_mm": 50.2,
  "area_cm2": 50.45,
  "cut_length_mm": 450.0,
  "estimated_cut_time_minutes": 0.9,
  "complexity_score": 8.92
}
```

#### Delete File
```http
DELETE /api/upload/{file_id}

Response:
{
  "message": "File deleted successfully"
}
```

---

### Materials

#### List Materials
```http
GET /api/materials/

Response:
[
  {
    "id": 1,
    "name": "Acrylic (Clear)",
    "type": "acrylic",
    "rate_per_cm2_mm": 0.05,
    "available_thicknesses": [2, 3, 5, 6, 10],
    "description": "Crystal clear acrylic..."
  }
]
```

#### Get Material
```http
GET /api/materials/{id}

Response: Single material object
```

#### Create Material (Admin)
```http
POST /api/materials/
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "name": "New Material",
  "type": "acrylic",
  "rate_per_cm2_mm": 0.06,
  "available_thicknesses": [3, 5],
  "description": "Optional description"
}
```

---

### Calculate

#### Calculate Cost
```http
POST /api/calculate/
Content-Type: application/json

Request:
{
  "file_id": "uuid-string",
  "material_id": 1,
  "thickness_mm": 3,
  "quantity": 5
}

Response:
{
  "file_id": "uuid-string",
  "material_name": "Acrylic (Clear)",
  "thickness_mm": 3,
  "quantity": 5,
  "breakdown": {
    "material_cost": 7.57,
    "laser_time_cost": 2.25,
    "energy_cost": 0.02,
    "setup_fee": 5.0,
    "subtotal": 22.34,
    "tax": 1.79,
    "total": 24.13
  },
  "estimated_production_time_hours": 0.75
}
```

#### Get Cost Preview
```http
GET /api/calculate/preview/{file_id}

Response:
{
  "file_id": "uuid-string",
  "preview_material": "Acrylic (Clear)",
  "preview_thickness_mm": 3,
  "estimated_total": 24.13,
  "note": "This is a preview..."
}
```

---

### Orders

#### Create Order
```http
POST /api/orders/
Content-Type: application/json

Request:
{
  "file_id": "uuid-string",
  "material_id": 1,
  "thickness_mm": 3,
  "quantity": 5,
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St, City, State 12345",
  "total_amount": 24.13
}

Response:
{
  "id": 1,
  "order_number": "ORD-20260330-ABC123",
  "file_id": "uuid-string",
  "material_name": "Acrylic (Clear)",
  "thickness_mm": 3,
  "quantity": 5,
  "total_amount": 24.13,
  "status": "pending",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St...",
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T10:00:00Z"
}
```

#### Get Order
```http
GET /api/orders/{order_id}

Response: Single order object
```

#### List Orders
```http
GET /api/orders/?limit=50&offset=0

Response: Array of orders
```

---

### Payment

#### Create Payment Intent
```http
POST /api/payment/intent
Content-Type: application/json

Request:
{
  "order_id": 1,
  "amount": 24.13,
  "currency": "usd"
}

Response:
{
  "client_secret": "pi_xxx_secret_xxx",
  "payment_intent_id": "pi_xxx"
}
```

#### Get Payment Status
```http
GET /api/payment/status/{order_id}

Response:
{
  "order_id": 1,
  "order_number": "ORD-20260330-ABC123",
  "payment_status": "paid",
  "payment_intent_id": "pi_xxx",
  "total_amount": 24.13
}
```

#### Stripe Webhook
```http
POST /api/payment/webhook
Stripe-Signature: <signature>

Handles:
- payment_intent.succeeded
- payment_intent.payment_failed
```

---

### Admin

#### Admin Login
```http
POST /api/admin/login
Content-Type: application/x-www-form-urlencoded

Request:
username=admin@laserhub.com
password=admin123

Response:
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

#### Get Dashboard
```http
GET /api/admin/dashboard
Authorization: Bearer <token>

Response:
{
  "total_orders": 150,
  "pending_orders": 5,
  "total_revenue": 5420.50,
  "monthly_revenue": 1250.00,
  "recent_orders": [...]
}
```

#### List All Orders (Admin)
```http
GET /api/admin/orders?status_filter=pending&limit=100
Authorization: Bearer <token>

Response: Array of orders
```

#### Update Order (Admin)
```http
PUT /api/admin/orders/{order_id}
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "status": "in_production",
  "notes": "Optional notes"
}

Response: Updated order object
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Invalid request data"
}
```

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 404 Not Found
```json
{
  "detail": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error"
}
```

---

## Rate Limiting

Currently no rate limiting is implemented. For production, consider:
- API rate limiting (e.g., 100 requests/minute)
- File upload size limits
- Concurrent upload limits

---

## Swagger/OpenAPI

Interactive API documentation is available at:
- http://localhost:8000/docs (Swagger UI)
- http://localhost:8000/redoc (ReDoc)
