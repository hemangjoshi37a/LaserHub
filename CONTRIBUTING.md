# Contributing to LaserHub

Thank you for your interest in contributing to LaserHub! This document provides guidelines and instructions for contributing.

## 🎯 Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## 📋 How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Use the bug report template
3. Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details (OS, browser, versions)

### Suggesting Features

1. Check existing feature requests
2. Use the feature request template
3. Describe the use case and benefits

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-number-description
   ```

3. **Make your changes** following our coding standards
4. **Write tests** for new features
5. **Run tests** to ensure everything passes:
   ```bash
   # Backend
   cd backend
   pytest
   
   # Frontend
   cd frontend
   npm test
   ```

6. **Commit** with clear messages following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add SVG file support
   fix: resolve calculation error for thick materials
   docs: update API documentation
   ```

7. **Push** and create a Pull Request
8. **Wait for review** - maintainers will review and provide feedback

## 🏗️ Development Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Frontend

```bash
cd frontend
npm install
```

## 📝 Coding Standards

### Python (Backend)

- Follow [PEP 8](https://pep8.org/)
- Use type hints
- Write docstrings for public functions
- Keep functions small and focused

```python
def calculate_material_cost(area: float, thickness: float, material_rate: float) -> float:
    """
    Calculate material cost based on area, thickness, and rate.
    
    Args:
        area: Area in cm²
        thickness: Thickness in mm
        material_rate: Cost per cm²/mm
        
    Returns:
        Total material cost
    """
    return area * thickness * material_rate
```

### TypeScript/React (Frontend)

- Use TypeScript
- Follow React best practices
- Use functional components with hooks
- Write meaningful component names

```tsx
interface CostCalculatorProps {
  file: File | null;
  onCalculate: (cost: CostEstimate) => void;
}

const CostCalculator: React.FC<CostCalculatorProps> = ({ file, onCalculate }) => {
  // Component implementation
};
```

## 🧪 Testing

### Backend Tests

```bash
cd backend
pytest
pytest --cov=app  # With coverage
```

### Frontend Tests

```bash
cd frontend
npm test
npm run test:coverage
```

## 📁 Project Structure

```
LaserHub/
├── backend/
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── core/         # Config, security
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── utils/        # Helpers
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── hooks/        # Custom hooks
│   │   └── utils/        # Helpers
│   └── tests/
└── docs/
```

## 🚀 Release Process

1. Version bump (following SemVer)
2. Update CHANGELOG.md
3. Create release tag
4. Publish to package registries (if applicable)

## 📞 Getting Help

- Open an issue for questions
- Join GitHub Discussions
- Check existing documentation

## 🙏 Thank You!

Every contribution makes LaserHub better. We appreciate your time and effort!

---

**Happy Contributing! 🎉**
