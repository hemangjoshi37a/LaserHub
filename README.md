# LaserHub 🎯

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)

**LaserHub** is an open-source web application that calculates laser cutting costs based on uploaded vector files, material selection, and thickness. Users can upload DXF, SVG, or other vector formats, get instant cost estimates, and place orders with integrated payment processing.

## ✨ Features

- 📤 **Multi-format Upload** - Support for DXF, SVG, AI, and other vector file formats
- 🧮 **Smart Cost Calculation** - Automatic calculation based on:
  - Material type and thickness
  - Cut path length and complexity
  - Estimated laser time and energy consumption
- 💳 **Payment Integration** - Secure Stripe payment processing
- 📱 **Progressive Web App** - Install and use on any device
- 🔐 **Admin Dashboard** - Manage orders and view analytics
- 🎨 **Real-time Preview** - Visualize uploaded designs before ordering
- 🌙 **Modern UI** - Clean, responsive interface with dark mode support

## 🏗️ Architecture

```
LaserHub/
├── backend/           # Python FastAPI server
│   ├── app/
│   │   ├── api/      # API endpoints
│   │   ├── core/     # Configuration & security
│   │   ├── models/   # Database models
│   │   ├── services/ # Business logic
│   │   └── utils/    # Helpers (DXF/SVG parsing)
│   └── requirements.txt
├── frontend/          # Vite + React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── styles/
│   └── package.json
└── docs/             # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- PostgreSQL (or SQLite for development)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Admin Panel: http://localhost:5173/admin

## 📁 Supported File Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| DXF | `.dxf` | AutoCAD Drawing Exchange Format |
| SVG | `.svg` | Scalable Vector Graphics |
| AI | `.ai` | Adobe Illustrator |
| PDF | `.pdf` | Portable Document Format (vector) |
| EPS | `.eps` | Encapsulated PostScript |

## ⚙️ Configuration

### Environment Variables

#### Backend (.env)
```env
DATABASE_URL=sqlite:///./laserhub.db
SECRET_KEY=your-secret-key-here
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_EMAIL=admin@laserhub.com
ADMIN_PASSWORD=changeme
```

#### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000/api
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

## 💰 Cost Calculation

The cost is calculated using two main components:

### 1. Material Cost
```
Material Cost = Area (cm²) × Thickness Factor × Material Rate
```

### 2. Laser Time Cost
```
Laser Time = Total Cut Length (mm) / Cut Speed (mm/min)
Energy Cost = Power (W) × Time (h) × Electricity Rate
```

### Material Rates (configurable)
| Material | Rate (per cm²/mm) |
|----------|------------------|
| Acrylic | $0.05 |
| Wood (MDF) | $0.03 |
| Plywood | $0.04 |
| Leather | $0.08 |
| Paper/Cardboard | $0.02 |
| Aluminum | $0.15 |
| Stainless Steel | $0.25 |

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload vector file |
| POST | `/api/calculate` | Calculate cost |
| GET | `/api/materials` | List available materials |
| POST | `/api/orders` | Create order |
| POST | `/api/payment/intent` | Create payment intent |
| POST | `/api/payment/webhook` | Stripe webhook |
| GET | `/api/admin/orders` | List all orders (admin) |
| PUT | `/api/admin/orders/{id}` | Update order status (admin) |

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Ways to Contribute

- 🐛 Report bugs
- ✨ Add new features
- 📝 Improve documentation
- 🌍 Add translations
- 🧪 Write tests
- 🎨 Improve UI/UX

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/your-username/LaserHub.git
cd LaserHub

# Create a branch
git checkout -b feature/your-feature

# Make your changes and commit
git commit -m "feat: add amazing feature"

# Push and create PR
git push origin feature/your-feature
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://reactjs.org/) - JavaScript UI library
- [Vite](https://vitejs.dev/) - Next generation frontend tooling
- [Stripe](https://stripe.com/) - Payment processing
- [ezdxf](https://ezdxf.readthedocs.io/) - DXF file parsing
- [svglib](https://github.com/deeplook/svglib) - SVG processing

## 📬 Contact

- **Issues**: [GitHub Issues](https://github.com/your-username/LaserHub/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/LaserHub/discussions)

---

**Made with ❤️ for the laser cutting community**
