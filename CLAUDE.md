# LaserHub - Claude Code Project Guide

## Project Overview

LaserHub is an open-source web application for calculating laser cutting costs and managing orders. Users upload vector files (DXF, SVG, AI, PDF, EPS), select materials and thicknesses, get instant cost estimates, and place orders with Stripe payment integration.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite, Zustand (state), React Router, Axios, Sonner (toasts), Stripe Elements
- **Backend**: FastAPI (Python 3.13) + SQLAlchemy (async) + Pydantic v2, SQLite (dev) / PostgreSQL (prod)
- **Auth**: JWT via python-jose, bcrypt password hashing
- **Payments**: Stripe (PaymentIntents + webhooks)
- **File Parsing**: ezdxf (DXF), xml.etree (SVG), pypdf (PDF), Shapely/NumPy (geometry)
- **Caching**: Redis (optional, falls back to in-memory)

## Running the App

```bash
# Backend (from /backend directory)
python3.13 -m uvicorn app.main:app --reload --port 8000

# Frontend (from /frontend directory)
npm run dev
# Runs on http://localhost:5173
```

Backend API docs at: http://localhost:8000/docs

## Project Structure

```
backend/
  app/
    api/           # FastAPI route handlers
      admin.py     # Admin dashboard, order management, analytics, CSV export
      auth.py      # User registration, login, email verification, password reset
      calculate.py # Cost calculation endpoint
      materials.py # Material CRUD with thickness configs
      orders.py    # Order creation and listing
      payment.py   # Stripe payment intents and webhooks
      upload.py    # File upload with parsing and analysis
    core/
      cache.py     # Redis/in-memory caching
      config.py    # Pydantic settings from .env
      database.py  # SQLAlchemy async engine + session
      security.py  # JWT tokens, password hashing
      errors.py    # Custom exceptions
      logger.py    # structlog config
      middleware.py # Custom middleware
    middleware/
      rate_limiter.py  # slowapi rate limiting
    models/
      __init__.py  # All SQLAlchemy models (User, Material, MaterialConfig, UploadedFile, Order)
    schemas/
      __init__.py  # All Pydantic request/response schemas
    services/
      cost_calculator.py  # Cost calculation logic (v1 and v2)
      email_service.py    # SMTP email (verification, password reset, order confirmation)
    utils/
      file_parser.py  # DXF/SVG/PDF vector file parsing
    scripts/
      seed_data.py    # Database seeder with initial materials

frontend/
  src/
    components/
      FileUpload.tsx       # Drag-drop file upload with preview
      MaterialSelector.tsx # Material grid + thickness/quantity selection
      CostDisplay.tsx      # File analysis metrics + cost breakdown
      OrderForm.tsx        # Customer info form + Stripe payment
      AdminDashboard.tsx   # Admin order management + stats
      AdminLogin.tsx       # Admin authentication
      MaterialManager.tsx  # Admin material CRUD + config editor
      Skeleton.tsx         # Loading skeleton component
    pages/
      HomePage.tsx         # Main 4-step workflow (Upload -> Configure -> Review -> Order)
      AdminPage.tsx        # Admin routing
      Analytics.tsx        # Admin analytics charts
    services/
      api.ts               # Axios instance with auth interceptors
      index.ts             # All API wrapper functions + TypeScript interfaces
    store/
      appStore.ts          # Zustand global state
      index.ts             # Store exports
    App.tsx                # Router, navbar, dark mode, footer
    App.css                # All styles (CSS variables, dark mode, responsive)
```

## Key Architecture Decisions

### Material Model
- `available_thicknesses` is stored as a JSON string in the DB (`available_thicknesses_raw` Python attribute maps to `available_thicknesses` DB column)
- The `@property available_thicknesses` parses the JSON but doesn't work with Pydantic `from_attributes`
- API endpoints must manually parse and construct `MaterialResponse` objects

### Cost Calculation
```
Material Cost = area_cm2 x rate_per_cm2 (from MaterialConfig or material_rate x thickness)
Laser Time = cut_length_mm / cut_speed_mm_per_min
Energy Cost = (watts x minutes / 60000) x electricity_rate
Machine Cost = laser_time x $0.50/min
Total = (per_piece_subtotal x quantity) + setup_fee + tax(8%)
```

### Database
- SQLite for development (uses StaticPool, check_same_thread=False)
- PostgreSQL for production (uses connection pooling)
- `get_db()` auto-commits after yield as safety net; endpoints should still commit explicitly
- Alembic available for migrations but tables auto-created on startup via `init_db()`

### Authentication
- Admin: environment-variable credentials (ADMIN_EMAIL/ADMIN_PASSWORD), JWT token
- Users: bcrypt-hashed passwords in DB, JWT token, email verification flow
- Both use OAuth2PasswordBearer scheme

## Environment Variables (backend/.env)

Required:
- `DATABASE_URL` - SQLite or PostgreSQL connection string
- `SECRET_KEY` - JWT signing key
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` - Admin credentials

Optional:
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLIC_KEY` / `STRIPE_WEBHOOK_SECRET`
- `SMTP_SERVER` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD`
- `FRONTEND_URL` (default: http://localhost:5173)
- `LASER_POWER_WATTS` / `ELECTRICITY_RATE` / `CUT_SPEED_MM_PER_MIN`

## Frontend Environment (frontend/.env)

- `VITE_API_URL` - Backend API URL (default: http://localhost:8000/api)
- `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key

## Database Seeding

```bash
cd backend && python3.13 -m app.scripts.seed_data
```

Seeds 8 materials: Clear Acrylic, Black Acrylic, MDF, Plywood, Leather, Cardstock, Aluminum, Stainless Steel.

## Testing

```bash
# Frontend unit tests
cd frontend && npm test

# Playwright E2E tests
npx playwright test

# Backend tests
cd backend && python3.13 -m pytest
```

## Common Pitfalls

1. **Material serialization**: Never return raw Material ORM objects from API endpoints. Use `_material_to_response()` helper in `materials.py` to parse JSON thicknesses.
2. **Order file_id**: `Order.file_id` is an integer FK to `uploaded_files.id`, NOT the UUID string. Always look up `UploadedFile` to get the actual UUID `file_id` for API responses.
3. **SQLite pooling**: SQLite doesn't support connection pool params. The database.py handles this conditionally.
4. **Rate limiter**: Must be attached to `app.state.limiter` and have the `RateLimitExceeded` exception handler registered.
5. **Login endpoints**: Use `OAuth2PasswordRequestForm` which expects `application/x-www-form-urlencoded` with `username` and `password` fields.
6. **Stripe**: Will be null/unavailable in dev without keys. Frontend guards against missing Stripe config.

## Code Style

- Python: async/await throughout, type hints, Pydantic models for validation
- TypeScript: functional components, Zustand for state, interfaces for API types
- CSS: CSS custom properties, dark mode via `.dark-mode` class, mobile-first responsive
