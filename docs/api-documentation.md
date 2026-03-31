# API Documentation with Interactive Examples

Complete reference for all LaserHub API endpoints with interactive examples using `curl` and JavaScript/TypeScript snippets.

## 🏁 Getting Started

### Base URL
- **Development**: `http://localhost:8000/api`
- **Production**: `https://your-domain.com/api`

### Authentication

Public endpoints are accessible without authentication. Admin endpoints require JWT token in Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

## 📤 File Upload API

### Upload File

Upload a vector file (DXF, SVG, AI, PDF, EPS) for analysis.

**Endpoint:** `POST /api/upload/`

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/upload/" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/design.dxf"
```

**JavaScript Example:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:8000/api/upload/', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('File uploaded:', result.file_id);
```

**Response:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "filename": "design.dxf",
  "file_size": 12345,
  "file_type": "dxf",
  "upload_url": "/api/upload/3593b9da-1e33-4999-9047-de7e71fc057e"
}
```

**Error Responses:**
- `400 Bad Request`: File format not supported or file too large
- `413 Request Entity Too Large`: File exceeds maximum size limit

---

### Get File Analysis

Retrieve analyzed file data including dimensions, area, and cut length.

**Endpoint:** `GET /api/upload/{file_id}`

**curl Example:**
```bash
curl "http://localhost:8000/api/upload/3593b9da-1e33-4999-9047-de7e71fc057e"
```

**JavaScript Example:**
```javascript
const fileId = '3593b9da-1e33-4999-9047-de7e71fc057e';
const response = await fetch(`http://localhost:8000/api/upload/${fileId}`);
const analysis = await response.json();

console.log(`Width: ${analysis.width_mm}mm`);
console.log(`Height: ${analysis.height_mm}mm`);
console.log(`Cut length: ${analysis.cut_length_mm}mm`);
```

**Response:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "width_mm": 100.5,
  "height_mm": 50.2,
  "area_cm2": 50.45,
  "cut_length_mm": 450.0,
  "estimated_cut_time_minutes": 0.9,
  "complexity_score": 8.92
}
```

---

### Delete File

Remove a previously uploaded file.

**Endpoint:** `DELETE /api/upload/{file_id}`

**curl Example:**
```bash
curl -X DELETE "http://localhost:8000/api/upload/3593b9da-1e33-4999-9047-de7e71fc057e"
```

**Response:**
```json
{
  "message": "File deleted successfully"
}
```

---

## 🏗️ Materials API

### List Materials

Get all available materials with pricing.

**Endpoint:** `GET /api/materials/`

**curl Example:**
```bash
curl "http://localhost:8000/api/materials/"
```

**JavaScript Example:**
```javascript
const response = await fetch('http://localhost:8000/api/materials/');
const materials = await response.json();

materials.forEach(material => {
  console.log(`${material.name}: $${material.rate_per_cm2_mm}/cm²/mm`);
  console.log(`Available thicknesses: ${material.available_thicknesses.join('mm, ')}mm`);
});
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "Acrylic (Clear)",
    "type": "acrylic",
    "rate_per_cm2_mm": 0.05,
    "available_thicknesses": [2, 3, 5, 6, 10],
    "description": "Crystal clear acrylic perfect for signage"
  },
  {
    "id": 2,
    "name": "Birch Plywood",
    "type": "wood",
    "rate_per_cm2_mm": 0.04,
    "available_thicknesses": [3, 6, 9, 12],
    "description": "High-quality birch plywood for durable projects"
  }
]
```

---

### Get Single Material

Retrieve details for a specific material.

**Endpoint:** `GET /api/materials/{id}`

**curl Example:**
```bash
curl "http://localhost:8000/api/materials/1"
```

**Response:**
```json
{
  "id": 1,
  "name": "Acrylic (Clear)",
  "type": "acrylic",
  "rate_per_cm2_mm": 0.05,
  "available_thicknesses": [2, 3, 5, 6, 10],
  "description": "Crystal clear acrylic perfect for signage"
}
```

---

### Create Material (Admin Only)

Add a new material to the system.

**Endpoint:** `POST /api/materials/`

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/materials/" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Stainless Steel (Brushed)",
    "type": "metal",
    "rate_per_cm2_mm": 0.25,
    "available_thicknesses": [1, 2, 3],
    "description": "High-quality brushed stainless steel"
  }'
```

**JavaScript Example:**
```javascript
const materialData = {
  name: 'Stainless Steel (Brushed)',
  type: 'metal',
  rate_per_cm2_mm: 0.25,
  available_thicknesses: [1, 2, 3],
  description: 'High-quality brushed stainless steel'
};

const response = await fetch('http://localhost:8000/api/materials/', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(materialData)
});

const newMaterial = await response.json();
console.log('Material created:', newMaterial.id);
```

**Response:**
```json
{
  "id": 5,
  "name": "Stainless Steel (Brushed)",
  "type": "metal",
  "rate_per_cm2_mm": 0.25,
  "available_thicknesses": [1, 2, 3],
  "description": "High-quality brushed stainless steel"
}
```

---

## 🧮 Cost Calculation API

### Calculate Cost

Calculate total cost for laser cutting based on file, material, and quantity.

**Endpoint:** `POST /api/calculate/`

**Request Body:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "material_id": 1,
  "thickness_mm": 3,
  "quantity": 5
}
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/calculate/" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
    "material_id": 1,
    "thickness_mm": 3,
    "quantity": 5
  }'
```

**JavaScript Example:**
```javascript
const calculationRequest = {
  file_id: '3593b9da-1e33-4999-9047-de7e71fc057e',
  material_id: 1,
  thickness_mm: 3,
  quantity: 5
};

const response = await fetch('http://localhost:8000/api/calculate/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(calculationRequest)
});

const costEstimate = await response.json();
console.log(`Total cost: $${costEstimate.breakdown.total}`);
console.log(`Material cost: $${costEstimate.breakdown.material_cost}`);
console.log(`Laser time: $${costEstimate.breakdown.laser_time_cost}`);
```

**Response:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
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

**Cost Breakdown Explanation:**
- **material_cost**: Based on area, thickness, and material rate
- **laser_time_cost**: Based on cut length and laser speed
- **energy_cost**: Based on laser power and electricity rate
- **setup_fee**: Flat fee per order (configurable)
- **tax**: Sales tax calculation (configurable percentage)
- **total**: Final amount including all fees

---

### Get Cost Preview

Get a quick preview cost calculation without creating an order.

**Endpoint:** `GET /api/calculate/preview/{file_id}`

**curl Example:**
```bash
curl "http://localhost:8000/api/calculate/preview/3593b9da-1e33-4999-9047-de7e71fc057e"
```

**Response:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "preview_material": "Acrylic (Clear)",
  "preview_thickness_mm": 3,
  "estimated_total": 24.13,
  "note": "This is a preview. Use POST /api/calculate for exact pricing."
}
```

---

## 📦 Orders API

### Create Order

Create a new laser cutting order with customer information.

**Endpoint:** `POST /api/orders/`

**Request Body:**
```json
{
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "material_id": 1,
  "thickness_mm": 3,
  "quantity": 5,
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St, City, State 12345",
  "total_amount": 24.13
}
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/orders/" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
    "material_id": 1,
    "thickness_mm": 3,
    "quantity": 5,
    "customer_email": "customer@example.com",
    "customer_name": "John Doe", 
    "shipping_address": "123 Main St, City, State 12345",
    "total_amount": 24.13
  }'
```

**JavaScript Example:**
```javascript
const orderData = {
  file_id: '3593b9da-1e33-4999-9047-de7e71fc057e',
  material_id: 1,
  thickness_mm: 3,
  quantity: 5,
  customer_email: 'customer@example.com',
  customer_name: 'John Doe',
  shipping_address: '123 Main St, City, State 12345',
  total_amount: 24.13
};

const response = await fetch('http://localhost:8000/api/orders/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(orderData)
});

const order = await response.json();
console.log('Order created:', order.order_number);
console.log('Order ID:', order.id);
console.log('Status:', order.status);
```

**Response:**
```json
{
  "id": 1,
  "order_number": "ORD-20260330-ABC123",
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "material_name": "Acrylic (Clear)",
  "thickness_mm": 3,
  "quantity": 5,
  "total_amount": 24.13,
  "status": "pending",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St, City, State 12345",
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T10:00:00Z"
}
```

**Order Statuses:**
- `pending`: Order created, awaiting payment
- `paid`: Payment received
- `in_production`: Being cut
- `shipped`: Sent to customer
- `delivered`: Received by customer
- `cancelled`: Order cancelled

---

### Get Order

Retrieve details for a specific order.

**Endpoint:** `GET /api/orders/{order_id}`

**curl Example:**
```bash
curl "http://localhost:8000/api/orders/1"
```

**Response:**
```json
{
  "id": 1,
  "order_number": "ORD-20260330-ABC123",
  "file_id": "3593b9da-1e33-4999-9047-de7e71fc057e",
  "material_name": "Acrylic (Clear)",
  "thickness_mm": 3,
  "quantity": 5,
  "total_amount": 24.13,
  "status": "paid",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St, City, State 12345",
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T11:30:00Z"
}
```

---

### List Orders

Get a paginated list of orders.

**Endpoint:** `GET /api/orders/?limit=50&offset=0`

**Query Parameters:**
- `limit`: Number of orders to return (default: 50, max: 100)
- `offset`: Number of orders to skip (default: 0)
- `status`: Filter by status (optional)

**curl Example:**
```bash
# Get all orders
curl "http://localhost:8000/api/orders/"

# Get only pending orders
curl "http://localhost:8000/api/orders/?status=pending"

# Get next page of 50 orders
curl "http://localhost:8000/api/orders/?limit=50&offset=50"
```

**Response:**
```json
{
  "orders": [
    {
      "id": 1,
      "order_number": "ORD-20260330-ABC123",
      "material_name": "Acrylic (Clear)",
      "thickness_mm": 3,
      "quantity": 5,
      "total_amount": 24.13,
      "status": "paid",
      "customer_email": "customer@example.com",
      "created_at": "2026-03-30T10:00:00Z"
    }
    // ... more orders
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "has_more": false
}
```

---

## 💳 Payment API

### Create Payment Intent

Create a Stripe payment intent for an order.

**Endpoint:** `POST /api/payment/intent`

**Request Body:**
```json
{
  "order_id": 1,
  "amount": 24.13,
  "currency": "usd"
}
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/payment/intent" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": 1,
    "amount": 24.13,
    "currency": "usd"
  }'
```

**JavaScript Example:**
```javascript
const paymentData = {
  order_id: 1,
  amount: 24.13,
  currency: 'usd'
};

const response = await fetch('http://localhost:8000/api/payment/intent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(paymentData)
});

const paymentIntent = await response.json();
const clientSecret = paymentIntent.client_secret;

// Use clientSecret with Stripe.js to collect payment
const {error, paymentIntent: result} = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      name: 'John Doe',
      email: 'customer@example.com'
    }
  }
});
```

**Response:**
```json
{
  "client_secret": "pi_1234567890abcdef_secret_xyz",
  "payment_intent_id": "pi_1234567890abcdef"
}
```

---

### Get Payment Status

Check the payment status for an order.

**Endpoint:** `GET /api/payment/status/{order_id}`

**curl Example:**
```bash
curl "http://localhost:8000/api/payment/status/1"
```

**Response:**
```json
{
  "order_id": 1,
  "order_number": "ORD-20260330-ABC123",
  "payment_status": "paid",
  "payment_intent_id": "pi_1234567890abcdef",
  "total_amount": 24.13
}
```

---

## 🔐 Admin API

### Admin Login

Authenticate as an admin user.

**Endpoint:** `POST /api/admin/login`

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/admin/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@laserhub.com&password=admin123"
```

**JavaScript Example:**
```javascript
const loginData = new URLSearchParams();
loginData.append('username', 'admin@laserhub.com');
loginData.append('password', 'admin123');

const response = await fetch('http://localhost:8000/api/admin/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: loginData
});

const auth = await response.json();
const token = auth.access_token;

// Store token for subsequent requests
localStorage.setItem('admin_token', token);
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

---

### Get Admin Dashboard

Get dashboard statistics and recent orders (Admin only).

**Endpoint:** `GET /api/admin/dashboard`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**curl Example:**
```bash
curl "http://localhost:8000/api/admin/dashboard" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "total_orders": 150,
  "pending_orders": 5,
  "in_production_orders": 12,
  "shipped_orders": 45,
  "total_revenue": 5420.50,
  "monthly_revenue": 1250.00,
  "recent_orders": [
    {
      "id": 150,
      "order_number": "ORD-20260330-XYZ789",
      "customer_name": "Alice Johnson",
      "total_amount": 45.50,
      "status": "pending",
      "created_at": "2026-03-30T14:30:00Z"
    }
  ]
}
```

---

### List All Orders (Admin)

Get all orders with optional status filtering (Admin only).

**Endpoint:** `GET /api/admin/orders`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- `status_filter`: Filter by status (pending, paid, in_production, shipped, delivered)
- `limit`: Number of orders to return (default: 50, max: 100)
- `offset`: Number of orders to skip (default: 0)

**curl Example:**
```bash
# Get all admin orders
curl "http://localhost:8000/api/admin/orders" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get only pending orders
curl "http://localhost:8000/api/admin/orders?status_filter=pending" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response:**
```json
{
  "orders": [
    {
      "id": 1,
      "order_number": "ORD-20260330-ABC123",
      "material_name": "Acrylic (Clear)",
      "thickness_mm": 3,
      "quantity": 5,
      "total_amount": 24.13,
      "status": "pending",
      "customer_email": "customer@example.com",
      "customer_name": "John Doe",
      "shipping_address": "123 Main St, City, State 12345",
      "created_at": "2026-03-30T10:00:00Z",
      "updated_at": "2026-03-30T10:00:00Z"
    }
  ],
  "total": 50,
  "limit": 100,
  "offset": 0,
  "has_more": false
}
```

---

### Update Order (Admin)

Update order status or add notes (Admin only).

**Endpoint:** `PUT /api/admin/orders/{order_id}`

**Headers:**
```
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**curl Example:**
```bash
curl -X PUT "http://localhost:8000/api/admin/orders/1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_production",
    "notes": "Started cutting on March 30, 2:00 PM"
  }'
```

**JavaScript Example:**
```javascript
const updateData = {
  status: 'in_production',
  notes: 'Started cutting on March 30, 2:00 PM'
};

const response = await fetch('http://localhost:8000/api/admin/orders/1', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updateData)
});

const updatedOrder = await response.json();
console.log('Order status updated:', updatedOrder.status);
```

**Response:**
```json
{
  "id": 1,
  "order_number": "ORD-20260330-ABC123",
  "material_name": "Acrylic (Clear)",
  "thickness_mm": 3,
  "quantity": 5,
  "total_amount": 24.13,
  "status": "in_production",
  "customer_email": "customer@example.com",
  "customer_name": "John Doe",
  "shipping_address": "123 Main St, City, State 12345",
  "notes": "Started cutting on March 30, 2:00 PM",
  "created_at": "2026-03-30T10:00:00Z",
  "updated_at": "2026-03-30T14:00:00Z"
}
```

---

## 🔒 Authentication API

### Register User

Create a new customer account.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword123"
}
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "securepassword123"
  }'
```

**Response:**
```json
{
  "message": "User registered successfully. Please check your email to verify your account.",
  "user_id": 123
}
```

---

### Login User

Authenticate and get access token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "user@example.com",
  "password": "securepassword123"
}
```

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "securepassword123"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 123,
    "email": "user@example.com"
  }
}
```

---

## ❌ Error Handling

The API returns standard HTTP status codes with JSON error responses.

### Error Response Format

```json
{
  "detail": "Error message describing what went wrong"
}
```

### Common Error Codes

| Status Code | Description | Possible Causes |
|-------------|-------------|-----------------|
| 400 Bad Request | Invalid request data | - Missing required fields<br>- Invalid data format<br>- File type not supported |
| 401 Unauthorized | Authentication required | - Missing or invalid JWT token<br>- Admin access required |
| 404 Not Found | Resource not found | - Invalid file_id or order_id<br>- Material does not exist |
| 413 Payload Too Large | File too large | - File exceeds MAX_FILE_SIZE_MB |
| 422 Unprocessable Entity | Validation error | - Data validation failed |
| 429 Too Many Requests | Rate limit exceeded | - Too many requests in short time |
| 500 Internal Server Error | Server error | - Unexpected server error |

### Error Handling Example

```javascript
try {
  const response = await fetch('http://localhost:8000/api/calculate/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(calculationRequest)
  });

  if (!response.ok) {
    const error = await response.json();
    
    switch (response.status) {
      case 400:
        console.error('Invalid request:', error.detail);
        break;
      case 404:
        console.error('Resource not found:', error.detail);
        break;
      case 422:
        console.error('Validation error:', error.detail);
        break;
      default:
        console.error('Error:', error.detail);
    }
    return;
  }

  const result = await response.json();
  console.log('Success:', result);

} catch (error) {
  console.error('Network or server error:', error);
}
```

---

## 📊 Rate Limiting

Currently, rate limiting is not implemented in development. For production deployment, consider implementing:

- **API Rate Limiting**: 100-1000 requests per minute per IP
- **File Upload Limits**: 10-50 uploads per hour per user
- **Authentication**: Failed login attempt limits
- **Admin Endpoints**: Stricter limits on admin operations

---

## 📖 Interactive API Documentation

When running the backend server, interactive API documentation is automatically available:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

These provide:
- Interactive API testing
- Request/response schemas
- Authentication testing
- Real-time API exploration

---

## 🚀 Complete Workflow Example

Here's a complete workflow example from file upload to order creation:

```javascript
async function createLaserCuttingOrder() {
  try {
    // Step 1: Upload file
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    const uploadResponse = await fetch('http://localhost:8000/api/upload/', {
      method: 'POST',
      body: formData
    });
    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.file_id;
    
    // Step 2: Calculate cost
    const calculationData = {
      file_id: fileId,
      material_id: 1, // Acrylic
      thickness_mm: 3,
      quantity: 5
    };
    
    const calcResponse = await fetch('http://localhost:8000/api/calculate/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(calculationData)
    });
    const estimate = await calcResponse.json();
    const totalAmount = estimate.breakdown.total;
    
    // Step 3: Create order
    const orderData = {
      file_id: fileId,
      material_id: 1,
      thickness_mm: 3,
      quantity: 5,
      customer_email: 'customer@example.com',
      customer_name: 'John Doe',
      shipping_address: '123 Main St, City, State 12345',
      total_amount: totalAmount
    };
    
    const orderResponse = await fetch('http://localhost:8000/api/orders/', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(orderData)
    });
    const order = await orderResponse.json();
    
    // Step 4: Create payment intent
    const paymentResponse = await fetch('http://localhost:8000/api/payment/intent', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        order_id: order.id,
        amount: totalAmount,
        currency: 'usd'
      })
    });
    const payment = await paymentResponse.json();
    
    console.log('Order created successfully!');
    console.log('Order Number:', order.order_number);
    console.log('Amount:', totalAmount);
    console.log('Payment Intent:', payment.payment_intent_id);
    
    return { order, paymentIntent: payment };
    
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}
```

---

## 📌 SDK Examples

### Python SDK Example

```python
import requests

class LaserHubAPI:
    def __init__(self, base_url="http://localhost:8000/api"):
        self.base_url = base_url
    
    def upload_file(self, file_path):
        with open(file_path, 'rb') as f:
            response = requests.post(
                f"{self.base_url}/upload/",
                files={'file': f}
            )
        return response.json()
    
    def calculate_cost(self, file_id, material_id, thickness_mm, quantity):
        payload = {
            'file_id': file_id,
            'material_id': material_id,
            'thickness_mm': thickness_mm,
            'quantity': quantity
        }
        response = requests.post(
            f"{self.base_url}/calculate/",
            json=payload
        )
        return response.json()

# Usage
api = LaserHubAPI()
result = api.upload_file('design.dxf')
cost = api.calculate_cost(result['file_id'], 1, 3, 5)
print(f"Total cost: ${cost['breakdown']['total']}")
```

### TypeScript SDK Example

```typescript
interface LaserHubClientConfig {
  baseURL: string;
  adminToken?: string;
}

class LaserHubClient {
  private baseURL: string;
  private adminToken?: string;
  
  constructor(config: LaserHubClientConfig) {
    this.baseURL = config.baseURL;
    this.adminToken = config.adminToken;
  }
  
  async uploadFile(file: File): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this.baseURL}/upload/`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  async calculateCost(
    fileId: string,
    materialId: number,
    thicknessMm: number,
    quantity: number
  ): Promise<CostEstimate> {
    const response = await fetch(`${this.baseURL}/calculate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        material_id: materialId,
        thickness_mm: thicknessMm,
        quantity
      })
    });
    
    if (!response.ok) {
      throw new Error(`Calculation failed: ${response.status}`);
    }
    
    return response.json();
  }
}

// Usage
const client = new LaserHubClient({
  baseURL: 'http://localhost:8000/api'
});

const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
if (fileInput.files && fileInput.files[0]) {
  const uploadResult = await client.uploadFile(fileInput.files[0]);
  const costEstimate = await client.calculateCost(
    uploadResult.file_id,
    1,
    3,
    5
  );
  
  console.log(`Total: $${costEstimate.breakdown.total}`);
}
```

---

## 📄 Summary

This API documentation provides comprehensive examples for all LaserHub endpoints. For additional help:

- Visit `/docs` for interactive Swagger UI
- Check the [troubleshooting guide](./troubleshooting.md) for common issues
- Review the [architecture document](./architecture/overview.md) for system overview

---

*Last Updated: March 30, 2026*