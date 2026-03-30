# LaserHub Setup Guide

This guide will help you get LaserHub up and running quickly.

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/LaserHub.git
cd LaserHub
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env and set your configuration
# IMPORTANT: Change SECRET_KEY and ADMIN_PASSWORD

# Initialize database with sample materials
python -m app.scripts.seed_data

# Start the server
uvicorn app.main:app --reload
```

Backend will be available at: http://localhost:8000

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and add your Stripe public key

# Start development server
npm run dev
```

Frontend will be available at: http://localhost:5173

## Configuration

### Backend Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:///./laserhub.db` |
| `SECRET_KEY` | JWT signing key (CHANGE THIS!) | - |
| `STRIPE_SECRET_KEY` | Stripe secret key | - |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | - |
| `ADMIN_EMAIL` | Admin login email | `admin@laserhub.com` |
| `ADMIN_PASSWORD` | Admin login password (CHANGE THIS!) | `admin123` |
| `LASER_POWER_WATTS` | Laser power for calculations | `60` |
| `ELECTRICITY_RATE` | Cost per kWh | `0.12` |
| `CUT_SPEED_MM_PER_MIN` | Default cut speed | `500` |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL |
| `VITE_STRIPE_PUBLIC_KEY` | Stripe publishable key |

## Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Dashboard
3. Add keys to backend `.env`:
   - `STRIPE_SECRET_KEY` = `sk_test_...`
   - `STRIPE_PUBLIC_KEY` = `pk_test_...`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...`

### Webhook Configuration

For local development, use Stripe CLI:

```bash
stripe listen --forward-to localhost:8000/api/payment/webhook
```

## Default Admin Credentials

```
Email: admin@laserhub.com
Password: admin123
```

**⚠️ IMPORTANT:** Change these immediately after first login!

## Production Deployment

### Backend

```bash
# Use production database (PostgreSQL recommended)
DATABASE_URL=postgresql://user:pass@host:5432/laserhub

# Set production SECRET_KEY
# Use strong password for admin

# Run with production server
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
# Build for production
npm run build

# Deploy dist/ folder to your hosting
```

### Recommended Hosting

- **Backend**: Railway, Render, Heroku, or VPS
- **Frontend**: Vercel, Netlify, or Cloudflare Pages
- **Database**: Supabase, Railway, or managed PostgreSQL

## Troubleshooting

### Backend won't start

```bash
# Check Python version (need 3.9+)
python --version

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Frontend build fails

```bash
# Clear node modules
rm -rf node_modules package-lock.json
npm install
```

### Database errors

```bash
# Delete and recreate database
rm laserhub.db
python -m app.scripts.seed_data
```

### File upload fails

- Check `MAX_FILE_SIZE_MB` in config
- Ensure `uploads/` directory exists and is writable
- Verify file format is supported

## Next Steps

1. Change admin password
2. Configure Stripe for payments
3. Add your materials and pricing
4. Test the complete order flow
5. Deploy to production

## Getting Help

- Check existing issues on GitHub
- Read the documentation
- Create a new issue with details

---

**Happy Laser Cutting! 🎯**
